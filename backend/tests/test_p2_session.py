"""L: session start. In-process: the hash diff (new / updated / touched / missing / skipped), the per-org lock and the
idle unload. Through the API: sign-in is not delayed by the warm-up, the scan report only lists files in scopes the
user may access, the baseline needs an Owner, and scanned files are ingested only on request, with the folder scope."""
import asyncio
import os
import shutil
import time
import uuid
from pathlib import Path

import httpx
import pytest

from app import contracts, db, session_start as ss
from conftest import TEST_ENV, wipe
from p2util import TEST_DB, H, p2_wipe, sql

OLD = time.time() - 3600


def put(root: Path, rel: str, text: str, mtime: float = OLD):
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding='utf-8')
    os.utime(p, (mtime, mtime))
    return p


@pytest.fixture
async def org(tmp_path):
    await db.connect(TEST_DB)
    o = f'test-{uuid.uuid4().hex[:8]}'
    yield tmp_path, o, {**contracts.user_for('priya'), 'org_id': o}
    await db.pool.execute('DELETE FROM file_index WHERE org_id=$1', o)
    await db.pool.execute('DELETE FROM scan_runs WHERE org_id=$1', o)
    await db.pool.close()
    db.pool = None


async def test_hash_diff_new_updated_touched_missing_skipped(org):
    root, o, user = org
    put(root, 'Organisation/a.md', 'alpha')
    put(root, 'Team/Platform/b.md', 'beta')
    first = await ss.scan_directory(user, root)
    assert first['status'] == 'awaiting_baseline' and first['new_count'] == 2  # the baseline waits for an Owner
    put(root, 'Organisation/a.md', 'alpha', mtime=OLD + 60)           # touched, same bytes: not an update
    put(root, 'Team/Platform/b.md', 'beta v2')                        # edited: hash differs
    put(root, 'Groups/Audit/c.txt', 'gamma')                          # new
    for skip in ('Organisation/~$lock.md', 'Organisation/.hidden.md', 'Organisation/x.tmp', 'Team/loose.md', 'stray.md'):
        put(root, skip, 'skip me')
    put(root, 'Organisation/fresh.md', 'still being written', mtime=time.time())
    run = await ss.scan_directory(user, root)
    assert (run['new_count'], run['updated_count'], run['unchanged_count'], run['missing_count']) == (1, 1, 1, 0)
    assert run['skipped_count'] == 6 and run['status'] == 'completed'
    (root / 'Groups/Audit/c.txt').unlink()
    run = await ss.scan_directory(user, root)
    assert run['missing_count'] == 1
    row = await db.pool.fetchrow('SELECT * FROM file_index WHERE org_id=$1 AND path=$2', o, 'Groups/Audit/c.txt')
    assert row['status'] == 'missing'  # soft: flagged only
    scopes = {r['path']: (r['scope'], r['visibility']) for r in await db.pool.fetch(
        'SELECT path, scope, visibility FROM file_index WHERE org_id=$1', o)}
    assert scopes['Team/Platform/b.md'] == ('team:Platform', 'restricted')  # label_for stub: non-org -> restricted
    assert scopes['Organisation/a.md'] == ('org', 'org')


async def test_two_simultaneous_sign_ins_start_one_scan(org):
    root, o, user = org
    put(root, 'Organisation/a.md', 'alpha')
    results = await asyncio.gather(ss.scan_directory(user, root), ss.scan_directory(user, root))
    assert sum(r is not None for r in results) == 1
    assert await db.pool.fetchval('SELECT count(*) FROM scan_runs WHERE org_id=$1', o) == 1


async def test_warm_up_failure_and_idle_unload(monkeypatch):
    calls = []

    async def fake_load(keep_alive):
        calls.append(keep_alive)
        if keep_alive != '0' and fail:
            raise RuntimeError('out of memory')
    monkeypatch.setattr(ss, '_load', fake_load)
    monkeypatch.setattr(ss, 'sessions', {})
    monkeypatch.setattr(ss, 'model', {**ss.model, 'status': 'cold'})
    fail = True
    await ss.warm_model({'user_id': 'p-a'})
    assert ss.model['status'] == 'failed' and 'out of memory' in ss.model['error']
    fail = False
    await ss.warm_model({'user_id': 'p-b'})
    assert ss.model['status'] == 'ready'
    ss.sessions.update({'p-a': 0.0, 'p-b': 0.0})
    assert await ss.reap_once(now=ss.config.MODEL_IDLE_MINUTES * 60 + 1)  # everyone idle: unload
    assert calls[-1] == '0' and ss.model['status'] == 'cold' and ss.sessions == {}
    _state = ss._state['reaper']
    if _state:
        _state.cancel()


async def test_logout_unload_racing_the_next_login_keeps_the_model(monkeypatch):
    calls = []

    async def slow_load(keep_alive):
        await asyncio.sleep(0.05)
        calls.append(keep_alive)
    monkeypatch.setattr(ss, '_load', slow_load)
    monkeypatch.setattr(ss, 'sessions', {})
    monkeypatch.setattr(ss, 'model', {**ss.model, 'status': 'cold'})
    u = {'user_id': 'p-a'}
    # React StrictMode's sign-in effect: login, logout, login, all at once
    await asyncio.gather(ss.warm_model(u), ss.end_session(u), ss.warm_model(u))
    assert ss.model['status'] == 'ready' and ss.sessions and calls[-1] != '0'
    if ss._state['reaper']:
        ss._state['reaper'].cancel()


# ---------------- through the API ----------------

SCAN_ROOT = Path(TEST_ENV['KEYSTONE_DIR'])  # the test backend's own scratch folder, never the real one


@pytest.fixture
def scandir(api):
    wipe()
    p2_wipe()
    shutil.rmtree(SCAN_ROOT, ignore_errors=True)
    yield api, SCAN_ROOT
    shutil.rmtree(SCAN_ROOT, ignore_errors=True)
    p2_wipe()
    wipe()


def test_sign_in_returns_before_warm_up_and_scan(scandir):
    api, _ = scandir
    t = time.monotonic()
    r = httpx.post(f'{api}/contracts/login', headers=H('priya'))
    assert r.status_code == 200 and time.monotonic() - t < 1.0  # warm-up takes seconds; login must not wait
    for _ in range(120):
        s = httpx.get(f'{api}/session/model-status', headers=H('priya')).json()
        if s['status'] in ('ready', 'failed'):
            break
        time.sleep(1)
    assert s['status'] == 'ready' and s['active_sessions'] >= 1
    assert any(m['name'].startswith(ss.config.ANSWER_MODEL) for m in s['resident'])
    assert sql("SELECT count(*) AS n FROM scan_runs WHERE triggered_by='user:priya'")[0]['n'] == 1
    httpx.post(f'{api}/contracts/logout', headers=H('priya'))


def test_scan_report_scope_filter_baseline_and_ingest(scandir):
    api, root = scandir
    put(root, 'Organisation/notes.txt', 'Plain text without front-matter.')
    put(root, 'Team/Platform/T-DEC-S1.md', '---\ndoc_type: decision\ndecision_id: T-DEC-S1\ntitle: Team only\n'
        'decided_on: 2025-02-01\nowner: p-tzed\nvisibility: org\nstatus: active\neffect: completed\nfields: {}\n'
        'relied_on: []\n---\nTeam decision body.\n')
    rep = httpx.post(f'{api}/session/scan', headers=H('priya')).json()
    assert rep['status'] == 'awaiting_baseline'
    # a Member without access to the Team folder sees neither its file nor its count
    assert [f['path'] for f in rep['files']] == ['Organisation/notes.txt'] and rep['new'] == 1
    full = httpx.get(f'{api}/session/scan/{rep["id"]}', headers=H('farhan')).json()
    assert {f['path'] for f in full['files']} == {'Organisation/notes.txt', 'Team/Platform/T-DEC-S1.md'}
    assert httpx.get(f'{api}/scan/files', headers=H('priya')).json() == []  # baseline not released yet
    later = httpx.post(f'{api}/session/scan', headers=H('priya')).json()  # e.g. the next sign-in
    assert later['status'] == 'completed' and later['baseline_files'] == 1  # still waiting, and still shown
    assert httpx.post(f'{api}/session/scan/{rep["id"]}/confirm-baseline', headers=H('priya')).status_code == 403
    assert httpx.post(f'{api}/session/scan/{rep["id"]}/confirm-baseline', headers=H('ananya')).json() == {'queued': 2}

    files = {f['path']: f for f in httpx.get(f'{api}/scan/files', headers=H('farhan')).json()}
    team = files['Team/Platform/T-DEC-S1.md']
    assert httpx.post(f'{api}/scan/files/{team["id"]}/ingest', headers=H('priya'), json={}).status_code == 404
    out = httpx.post(f'{api}/scan/files/{team["id"]}/ingest', headers=H('farhan'), json={}, timeout=600)
    assert out.status_code == 200, out.text
    assert out.json()['file']['review_status'] == 'ingested' and out.json()['result']['document_id'] == 'T-DEC-S1'
    # the folder's scope wins over the file's own "visibility: org"
    assert sql("SELECT visibility FROM documents WHERE id='T-DEC-S1'")[0]['visibility'] == 'restricted'

    txt = files['Organisation/notes.txt']
    no_date = httpx.post(f'{api}/scan/files/{txt["id"]}/ingest', headers=H('priya'), json={})
    assert no_date.status_code == 422 and 'meeting_date' in no_date.json()['detail']
    waiting = {f['path']: f for f in httpx.get(f'{api}/scan/files', headers=H('priya')).json()}
    assert waiting['Organisation/notes.txt']['review_status'] == 'failed'  # still queued, with its error, for a retry
    assert 'meeting_date' in waiting['Organisation/notes.txt']['error']
    ok = httpx.post(f'{api}/scan/files/{txt["id"]}/ingest', headers=H('priya'), timeout=600,
                    json={'meeting_date': '2026-09-01', 'doc_id': 'T-MTG-SCAN'})
    assert ok.status_code == 200, ok.text
    doc = httpx.get(f'{api}/documents/T-MTG-SCAN').json()
    assert doc['doc_type'] == 'meeting_note' and doc['ref_time'] == '2026-09-01' and doc['visibility'] == 'org'
    # nothing else was ingested on its own, and a second scan finds nothing new
    assert httpx.post(f'{api}/session/scan', headers=H('priya')).json()['new'] == 0
