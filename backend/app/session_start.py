"""L. Session start. Both jobs are registered on the contract's on_login hook and run in the background, so
signing in never waits on them.

L1 warm_model: loads the answer model and the embedder into the GPU (Ollama keep_alive), counts active sessions
   by heartbeat, and unloads (keep_alive 0) when the last session logs out or goes idle.
   One model serves answers AND extraction here (8 GB VRAM holds one 7B model), so there is no second model to
   prioritise against chat (spec L1 step 6).
L2 scan_directory: SHA-256 diff of KEYSTONE_DIR against file_index. NEW and UPDATED files wait in Ingestion Review
   with their folder's scope; nothing is ingested automatically. MISSING is a soft flag, the graph is untouched.
"""
import asyncio
import hashlib
import logging
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

from . import config, db
from .contracts import audit, can_access, label_for, on_login, on_logout

log = logging.getLogger('keystone.session')

# ---------------- L1: model warm-up ----------------

model = {'status': 'cold', 'model': config.ANSWER_MODEL, 'embed_model': config.EMBED_MODEL, 'error': None,
         'changed_at': None, 'load_seconds': None}
sessions: dict[str, float] = {}   # user_id -> monotonic time of the last sign-in or heartbeat
_state = {'reaper': None, 'extended_at': 0.0}


def _set(status: str, **kw):
    model.update(status=status, changed_at=datetime.now(timezone.utc).isoformat(), **kw)


async def _ollama(path: str, body: dict, timeout: float = 300) -> dict:
    async with httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=4)) as h:
        r = await h.post(f'{config.OLLAMA_BASE_URL}{path}', json=body)
        r.raise_for_status()
        return r.json()


async def _load(keep_alive: str):
    # No prompt: Ollama loads the model and generates nothing. One tiny embedding makes the embedder resident too.
    await _ollama('/api/generate', {'model': config.ANSWER_MODEL, 'keep_alive': keep_alive})
    await _ollama('/api/embed', {'model': config.EMBED_MODEL, 'input': 'warm-up', 'keep_alive': keep_alive})


async def warm_model(user: dict):
    sessions[user['user_id']] = time.monotonic()
    if _state['reaper'] is None or _state['reaper'].done():
        _state['reaper'] = asyncio.get_running_loop().create_task(_reap_loop())
    if model['status'] == 'loading':
        return
    if model['status'] != 'ready':
        _set('loading', error=None)
    started = time.monotonic()
    try:
        await _load(config.MODEL_KEEP_ALIVE)
        _state['extended_at'] = time.monotonic()
        _set('ready', load_seconds=round(time.monotonic() - started, 2))
    except Exception as e:
        # Login already succeeded; the chat just waits for the model on first use.
        log.error('model warm-up failed: %s: %s', type(e).__name__, e)
        _set('failed', error=f'{type(e).__name__}: {e}')


async def heartbeat(user: dict):
    """The chat box calls this about once a minute; it keeps the session counted and extends keep_alive."""
    sessions[user['user_id']] = time.monotonic()
    if model['status'] in ('cold', 'failed'):
        await warm_model(user)
    elif model['status'] == 'ready' and time.monotonic() - _state['extended_at'] > 300:
        _state['extended_at'] = time.monotonic()
        try:
            await _load(config.MODEL_KEEP_ALIVE)
        except Exception as e:
            _set('failed', error=f'{type(e).__name__}: {e}')


async def unload():
    try:
        await _load('0')  # keep_alive 0: Ollama unloads immediately and frees the GPU
    except Exception as e:
        log.warning('model unload failed: %s', e)
    _set('cold', load_seconds=None)


def idle_users(now: float, idle_seconds: float) -> list[str]:
    return [u for u, t in sessions.items() if now - t > idle_seconds]


async def reap_once(now: float | None = None) -> bool:
    """Drop idle sessions; unload when none are left. Returns True if it unloaded."""
    for u in idle_users(time.monotonic() if now is None else now, config.MODEL_IDLE_MINUTES * 60):
        sessions.pop(u, None)
    if not sessions and model['status'] in ('ready', 'loading', 'failed'):
        await unload()
        return True
    return False


async def _reap_loop():
    while True:
        await asyncio.sleep(30)
        if await reap_once():
            return


async def end_session(user: dict):
    sessions.pop(user['user_id'], None)
    if not sessions:
        await unload()


async def status() -> dict:
    """model_status: cold | loading | ready | failed, plus what Ollama actually holds in memory (/api/ps)."""
    out = {**model, 'active_sessions': len(sessions), 'idle_minutes': config.MODEL_IDLE_MINUTES}
    try:
        async with httpx.AsyncClient(timeout=3) as h:
            ps = (await h.get(f'{config.OLLAMA_BASE_URL}/api/ps')).json()
        out['resident'] = [{'name': m['name'], 'size_vram': m.get('size_vram'), 'expires_at': m.get('expires_at')}
                           for m in ps.get('models', [])]
    except Exception as e:
        out['resident'] = None
        out['resident_error'] = f'{type(e).__name__}: {e}'
    return out


# ---------------- L2: directory scan ----------------

SUPPORTED = {'.md', '.txt', '.pdf', '.docx', '.mp3', '.wav', '.m4a'}
AUDIO = {'.mp3', '.wav', '.m4a'}
SETTLE_SECONDS = 5  # a file modified this recently may still be being written
_locks: dict[str, asyncio.Lock] = {}


def scope_of(rel: str) -> tuple[str, str | None] | None:
    """Folder -> scope (K): Organisation/** -> org, Team/<name>/** -> team:<name>, Groups/<name>/** -> group:<name>.
    Anything else (including a file directly in Team/) has no scope and is skipped."""
    parts = rel.split('/')
    if parts[0] == 'Organisation' and len(parts) > 1:
        return 'org', None
    if parts[0] in ('Team', 'Groups') and len(parts) > 2:
        kind = 'team' if parts[0] == 'Team' else 'group'
        return f'{kind}:{parts[1]}', parts[1] if kind == 'team' else None
    return None


def skipped(p: Path, now: float) -> bool:
    n = p.name
    return (n.startswith('.') or n.startswith('~$') or n.endswith('.tmp') or p.suffix.lower() not in SUPPORTED
            or now - p.stat().st_mtime < SETTLE_SECONDS)


def _sha(p: Path) -> str:
    h = hashlib.sha256()
    with p.open('rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def file_resource(row) -> dict:
    return {'type': 'file', 'id': row['path'], 'team': row['scope'].removeprefix('team:')
            if row['scope'].startswith('team:') else None, 'project': None, 'visibility': row['visibility']}


async def scan_directory(user: dict, root: str | None = None) -> dict | None:
    """Per-org lock: two sign-ins at the same moment start one scan, not two (the second returns None)."""
    lock = _locks.setdefault(user['org_id'], asyncio.Lock())
    if lock.locked():
        return None
    async with lock:
        return await _scan(user, Path(root or config.KEYSTONE_DIR))


async def _scan(user: dict, root: Path) -> dict:
    org, actor = user['org_id'], user['actor']
    run = await db.pool.fetchval('INSERT INTO scan_runs (org_id, triggered_by) VALUES ($1, $2) RETURNING id', org, actor)
    await audit.write('dir_scan_started', actor, {'run': run}, 'scan_run', run)
    try:
        counts = await _diff(org, root, run)
    except Exception as e:
        log.exception('directory scan %s failed', run)
        await db.pool.execute("UPDATE scan_runs SET status='failed', error=$2, finished_at=now() WHERE id=$1",
                              run, f'{type(e).__name__}: {e}')
        raise
    status = 'awaiting_baseline' if counts['baseline'] and counts['new'] else 'completed'
    await db.pool.execute(
        'UPDATE scan_runs SET new_count=$2, updated_count=$3, missing_count=$4, unchanged_count=$5, skipped_count=$6, '
        'capped=$7, status=$8, finished_at=now() WHERE id=$1', run, counts['new'], counts['updated'],
        counts['missing'], counts['unchanged'], counts['skipped'], counts['capped'], status)
    # Counts only: file names can leak what exists in scopes a reader of the audit log may not see.
    await audit.write('dir_scan_completed', actor, {k: counts[k] for k in ('new', 'updated', 'missing', 'unchanged')},
                      'scan_run', run)
    return await db.pool.fetchrow('SELECT * FROM scan_runs WHERE id=$1', run)


async def _diff(org: str, root: Path, run: int) -> dict:
    index = {r['path']: r for r in await db.pool.fetch('SELECT * FROM file_index WHERE org_id=$1', org)}
    counts = {'new': 0, 'updated': 0, 'missing': 0, 'unchanged': 0, 'skipped': 0, 'capped': False,
              'baseline': not index}
    seen: set[str] = set()
    now = time.time()
    files = sorted(p for p in root.rglob('*') if p.is_file()) if root.exists() else []
    for p in files:
        rel = p.relative_to(root).as_posix()
        sc = scope_of(rel)
        if sc is None or skipped(p, now):
            counts['skipped'] += 1
            continue
        if len(seen) >= config.SCAN_MAX_FILES:
            counts['capped'] = True  # resumable: the next scan picks up the rest as NEW
            break
        seen.add(rel)
        st, row = p.stat(), index.get(rel)
        if row and row['status'] == 'active' and row['size'] == st.st_size and row['mtime'] == st.st_mtime:
            await db.pool.execute("UPDATE file_index SET last_seen_at=now(), change='unchanged' WHERE id=$1", row['id'])
            counts['unchanged'] += 1
            continue
        sha = await asyncio.to_thread(_sha, p)  # the hash is the truth; mtime is only a shortcut
        scope, team = sc
        vis = label_for({'path': rel, 'scope': scope, 'team': team})['visibility']
        if row and sha == row['sha256']:
            await db.pool.execute("UPDATE file_index SET size=$2, mtime=$3, status='active', change='unchanged', "
                                  'last_seen_at=now() WHERE id=$1', row['id'], st.st_size, st.st_mtime)
            counts['unchanged'] += 1
            continue
        change = 'updated' if row else 'new'
        counts[change] += 1
        await db.pool.execute(
            'INSERT INTO file_index (org_id, path, scope, visibility, size, mtime, sha256, change, review_status, '
            'last_scan_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (org_id, path) DO UPDATE SET '
            "scope=$3, visibility=$4, size=$5, mtime=$6, sha256=$7, status='active', change=$8, review_status=$9, "
            'last_scan_id=$10, last_seen_at=now(), error=NULL',
            org, rel, scope, vis, st.st_size, st.st_mtime, sha, change,
            'baseline' if counts['baseline'] else 'pending', run)
    if not counts['capped']:
        for rel, row in index.items():
            if rel not in seen and row['status'] == 'active':
                # Soft: flagged only. The document and its graph facts stay (same rule as K).
                await db.pool.execute("UPDATE file_index SET status='missing', change='missing', last_scan_id=$2 "
                                      'WHERE id=$1', row['id'], run)
                counts['missing'] += 1
    return counts


async def report(user: dict, run_id: int | None = None) -> dict | None:
    """Scan report for this user: only files in scopes they may access, and counts computed after that filter."""
    run = await db.pool.fetchrow(
        'SELECT * FROM scan_runs WHERE org_id=$1 AND ($2::bigint IS NULL OR id=$2) ORDER BY id DESC LIMIT 1',
        user['org_id'], run_id)
    if run is None:
        return None
    rows = await db.pool.fetch("SELECT * FROM file_index WHERE last_scan_id=$1 AND change <> 'unchanged' "
                               'ORDER BY path', run['id'])
    files = [file_out(r) for r in rows if can_access(user, file_resource(r))]
    count = lambda c: sum(1 for f in files if f['change'] == c)
    return {'id': run['id'], 'status': run['status'], 'triggered_by': run['triggered_by'],
            'started_at': run['started_at'].isoformat(),
            'finished_at': run['finished_at'] and run['finished_at'].isoformat(), 'capped': run['capped'],
            'new': count('new'), 'updated': count('updated'), 'missing': count('missing'), 'files': files}


def file_out(r) -> dict:
    return {'id': r['id'], 'path': r['path'], 'scope': r['scope'], 'visibility': r['visibility'],
            'change': r['change'], 'status': r['status'], 'review_status': r['review_status'], 'size': r['size'],
            'sha256': r['sha256'], 'is_audio': Path(r['path']).suffix.lower() in AUDIO,
            'modified': datetime.fromtimestamp(r['mtime'], timezone.utc).date().isoformat(),
            'ingested_source_id': r['ingested_source_id'], 'error': r['error']}


async def confirm_baseline(user: dict, run_id: int) -> int:
    """The first scan finds everything NEW; only an Owner releases it into Ingestion Review."""
    if user['role'] != 'owner':
        raise PermissionError('only an Owner can confirm the baseline scan')
    async with db.pool.acquire() as c, c.transaction():
        n = await c.fetchval("WITH u AS (UPDATE file_index SET review_status='pending' WHERE org_id=$1 AND "
                             "review_status='baseline' RETURNING 1) SELECT count(*) FROM u", user['org_id'])
        await c.execute("UPDATE scan_runs SET status='completed' WHERE id=$1 AND status='awaiting_baseline'", run_id)
        await audit.write('dir_scan_completed', user['actor'], {'baseline_confirmed': True, 'queued': n},
                          'scan_run', run_id, conn=c)
    return n


async def _scan_on_login(user: dict):
    await scan_directory(user)


on_login.register(warm_model)
on_login.register(_scan_on_login)
on_logout.register(end_session)


if __name__ == '__main__':
    assert scope_of('Organisation/a.md') == ('org', None)
    assert scope_of('Team/Platform/x/y.md') == ('team:Platform', 'Platform')
    assert scope_of('Groups/Audit-Prep/z.txt') == ('group:Audit-Prep', None)
    assert scope_of('Team/loose.md') is None and scope_of('stray.md') is None
    sessions.update({'a': 0.0, 'b': 950.0})
    assert idle_users(1000.0, 900) == ['a']
    print('session_start self-check ok')
