"""Front-matter ingestion. Dates come from YAML front-matter and become valid time + episode reference time."""
import asyncio
import hashlib
import json
import logging
import re
from datetime import date, datetime, timezone
from pathlib import Path

import asyncpg
import yaml

from . import config, db, extract, graph, scanner

log = logging.getLogger('keystone.ingest')
DATE_KEY = {'decision': 'decided_on', 'policy_version': 'effective_from', 'meeting_note': 'meeting_date'}
HUMAN = {'confidence': 1.0, 'extracted_by': 'human', 'human_verified': True}

RECOMPUTE_VALIDITY = '''
UPDATE policy_clauses p SET effective_to = n.next_from
FROM (SELECT version, lead(effective_from) OVER (ORDER BY effective_from) AS next_from
      FROM (SELECT DISTINCT version, effective_from FROM policy_clauses WHERE policy_id = $1) v) n
WHERE p.policy_id = $1 AND p.version = n.version'''


def parse(raw: str) -> tuple[dict, int, int]:
    """Returns (front_matter, front_matter_end, body_start). Offsets index into raw (LF line endings)."""
    if not raw.startswith('---\n'):
        raise ValueError('document must start with YAML front-matter (---)')
    end = raw.find('\n---', 3)
    if end < 0:
        raise ValueError('unterminated front-matter')
    fm = yaml.safe_load(raw[4:end]) or {}
    nl = raw.find('\n', end + 4)
    return fm, end, (len(raw) if nl < 0 else nl + 1)


def ref_date(fm: dict) -> date:
    doc_type = fm.get('doc_type')
    if doc_type not in DATE_KEY:
        raise ValueError(f'doc_type must be one of {sorted(DATE_KEY)}')
    d = fm.get(DATE_KEY[doc_type])
    if not isinstance(d, date):
        raise ValueError(f'{doc_type} needs a {DATE_KEY[doc_type]}: YYYY-MM-DD date in front-matter')
    return d


def doc_id(fm: dict) -> str:
    t = fm['doc_type']
    key = {'decision': fm.get('decision_id'), 'meeting_note': fm.get('doc_id'),
           'policy_version': fm.get('policy_id') and fm.get('version') and f"{fm['policy_id']}@{fm['version']}"}[t]
    if not key:
        raise ValueError({'decision': 'decision_id', 'meeting_note': 'doc_id',
                          'policy_version': 'policy_id and version'}[t] + ' required in front-matter')
    return key


def chunks(raw: str, body_start: int) -> list[tuple[int, int, str]]:
    return [(body_start + m.start(), body_start + m.end(), m.group().strip())
            for m in re.finditer(r'(?:[^\n]*\S[^\n]*\n?)+', raw[body_start:])]


def span(raw: str, needle: str, limit: int) -> dict:
    """Provenance span for a front-matter fact: the line containing `needle`."""
    i = raw.find(needle, 0, limit)
    if i < 0:
        return {'source_start': 0, 'source_end': limit, 'source_quote': raw[:limit]}
    s, e = raw.rfind('\n', 0, i) + 1, raw.find('\n', i)
    return {'source_start': s, 'source_end': e, 'source_quote': raw[s:e]}


async def _ingest(raw: str, path: str, actor: str, visibility: str = 'org') -> dict:
    raw = raw.replace('\r\n', '\n')
    fm, fm_end, body_start = parse(raw)
    ref, did, doc_type = ref_date(fm), doc_id(fm), fm['doc_type']
    # The stricter of front-matter and caller (e.g. a Team folder's scope) wins: a file cannot loosen its folder.
    # The strictest label wins: a file's own front-matter can narrow its folder scope, never widen it.
    rank = {'org': 0, 'team': 1, 'restricted': 2}
    visibility = max((fm.get('visibility') or 'org', visibility or 'org'), key=lambda v: rank.get(v, 2))
    relied = {}

    async with db.pool.acquire() as c, c.transaction():
        await c.execute(
            'INSERT INTO documents (id, path, doc_type, ref_time, front_matter, raw, sha256, visibility) '
            'VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO UPDATE SET path=$2, doc_type=$3, ref_time=$4, '
            'front_matter=$5, raw=$6, sha256=$7, visibility=$8, ingested_at=now()',
            did, path, doc_type, ref, json.loads(json.dumps(fm, default=str)), raw,
            hashlib.sha256(raw.encode()).hexdigest(), visibility)
        await c.execute('DELETE FROM chunks WHERE document_id=$1', did)
        await c.executemany('INSERT INTO chunks VALUES ($1,$2,$3,$4,$5)',
                            [(did, i, s, e, t) for i, (s, e, t) in enumerate(chunks(raw, body_start))])
        if doc_type == 'policy_version':
            await _policy_rows(c, fm, did, ref)
        if doc_type == 'decision':
            # Clause version is resolved by decided_on against front-matter validity windows (§6.5 step 1).
            for cid in fm.get('relied_on') or []:
                v = await c.fetchval('SELECT version FROM policy_clauses WHERE clause_id=$1 AND effective_from <= $2 '
                                     'AND (effective_to IS NULL OR effective_to > $2)', cid, ref)
                if v is None:
                    raise ValueError(f'relied_on {cid}: no version of that clause was in force on {ref}')
                relied[cid] = v

    prov = lambda needle: {'source_doc': path, 'visibility': visibility, **HUMAN, **span(raw, needle, fm_end)}
    episode = graph.uid(f'episode:{did}')
    out = {'document_id': did, 'doc_type': doc_type, 'ref_time': ref.isoformat(),
           'extracted': {'nodes': 0, 'edges': 0}, 'pending_review': 0, 'flags': []}
    if doc_type == 'decision':
        edges = await _decision(fm, did, ref, prov, relied, raw[body_start:].strip(), episode)
    elif doc_type == 'policy_version':
        edges = await _policy_graph(fm, did, ref, prov, episode)
    else:
        await graph.upsert_node(did, 'MeetingNote', fm.get('title', did),
                                {'valid_from': ref.isoformat(), 'meeting_date': ref.isoformat(), **prov('meeting_date:')})
        result = await extract.extract(raw, body_start, did, path, ref, visibility, episode)
        edges = result.pop('edge_uuids')
        out.update(result)
    await graph.save_episode(did, doc_type, raw, graph.at(ref), edges)

    if doc_type == 'policy_version':
        await db.audit(actor, 'policy_ingested', 'policy_version', did, [f"{c['clause_id']}@{fm['version']}"
                       for c in fm['clauses']], {'document_id': did, 'sha256': hashlib.sha256(raw.encode()).hexdigest()})
        out['flags'] = await scanner.scan(fm['policy_id'], fm['version'])  # event-driven: runs on commit
    if doc_type == 'decision' and fm.get('effect') == 'ongoing' and fm.get('fields'):
        # C3 type C: a new standing practice that contradicts another one opens a collision for the authority.
        from . import conflicts, contracts
        try:
            out['collisions'] = [c['id'] for c in await conflicts.detect_decision_conflicts(contracts.ORG_ID)]
        except Exception:
            log.exception('decision-conflict check failed for %s; ingestion is unaffected', did)
    return out


async def _decision(fm, did, ref, prov, relied, body, episode) -> list[str]:
    d = ref.isoformat()
    await graph.upsert_node(did, 'Decision', fm.get('title', did), {
        'valid_from': d, 'decided_on': d, 'status': fm.get('status', 'active'),
        'effect': fm.get('effect', 'completed'), 'fields_json': json.dumps(fm.get('fields') or {}),
        'owner': fm.get('owner'), 'project': fm.get('project'),
        'reasons': str(fm.get('reasons') or body), **prov('decided_on:')})
    targets = [('MADE_BY', fm.get('owner'), 'Person', 'owner:'), ('ABOUT', fm.get('project'), 'Project', 'project:'),
               ('SUPERSEDES', fm.get('supersedes'), 'Decision', 'supersedes:'),
               ('JUSTIFIED_BY', fm.get('source'), 'MeetingNote', 'source:')]
    targets += [('RELIED_ON', f'{cid}@{v}', 'Clause', 'relied_on:') for cid, v in relied.items()]
    edges = []
    for rel, key, type_, needle in targets:
        if key:
            await graph.ensure_node(key, type_, prov(needle))
            edges.append(await graph.upsert_edge(did, rel, key, f'{did} {rel} {key}', graph.at(ref),
                                                  prov(needle), episode))
    return edges


async def _policy_rows(c, fm, did, ref):
    clauses = fm.get('clauses')
    if not clauses:
        raise ValueError('policy_version needs a clauses: list')
    await c.execute('DELETE FROM policy_clauses WHERE policy_id=$1 AND version=$2', fm['policy_id'], fm['version'])
    for cl in clauses:
        if not cl.get('clause_id') or not cl.get('text') or not isinstance(cl.get('checkable'), bool):
            raise ValueError('each clause needs clause_id, text and checkable: true|false')
        await c.execute('INSERT INTO policy_clauses (policy_id, version, clause_id, document_id, title, text, fields, '
                        'checkable, effective_from) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
                        fm['policy_id'], fm['version'], cl['clause_id'], did, cl.get('title', cl['clause_id']),
                        cl['text'], cl.get('fields') or {}, cl['checkable'], ref)
    await c.execute(RECOMPUTE_VALIDITY, fm['policy_id'])


async def _policy_graph(fm, did, ref, prov, episode) -> list[str]:
    pid, ver = fm['policy_id'], fm['version']
    versions = await db.pool.fetch('SELECT DISTINCT version, effective_from, effective_to FROM policy_clauses '
                                   'WHERE policy_id=$1 ORDER BY effective_from', pid)
    mine = next(v for v in versions if v['version'] == ver)
    to = mine['effective_to'] and mine['effective_to'].isoformat()
    window = {'valid_from': ref.isoformat(), 'valid_to': to, 'policy_id': pid, 'version': ver}
    await graph.upsert_node(did, 'PolicyVersion', f"{fm.get('title', pid)} {ver}", {**window, **prov('effective_from:')})
    edges = []
    for cl in fm['clauses']:
        key = f"{cl['clause_id']}@{ver}"
        p = prov(f"clause_id: {cl['clause_id']}")
        await graph.upsert_node(key, 'Clause', f"{cl['clause_id']} {cl.get('title', '')} ({ver})".strip(), {
            **window, 'clause_id': cl['clause_id'], 'text': cl['text'], 'checkable': cl['checkable'],
            'fields_json': json.dumps(cl.get('fields') or {}), **p})
        edges.append(await graph.upsert_edge(key, 'BELONGS_TO', did, f'{key} BELONGS_TO {did}', graph.at(ref), p,
                                             episode, invalid_at=to and graph.at(mine['effective_to']),
                                             extra={'policy_id': pid, 'version': ver}))
    prev = [v for v in versions if v['effective_to'] == ref]
    if prev:
        prev_id = f"{pid}@{prev[0]['version']}"
        edges.append(await graph.upsert_edge(did, 'SUPERSEDES', prev_id, f'{did} SUPERSEDES {prev_id}',
                                             graph.at(ref), prov('effective_from:'), episode))
    # Close the validity window of every other version (valid time from metadata; expired_at = when we learned it).
    now = datetime.now(timezone.utc)
    for v in versions:
        if v['version'] != ver and v['effective_to']:
            vto = v['effective_to'].isoformat()
            await graph.q('MATCH (n:Entity {group_id: $g}) WHERE n.policy_id=$p AND n.version=$v SET n.valid_to=$to',
                          g=config.GROUP_ID, p=pid, v=v['version'], to=vto)
            await graph.q('MATCH ()-[e:RELATES_TO {group_id: $g, name: "BELONGS_TO"}]->() '
                          'WHERE e.policy_id=$p AND e.version=$v AND e.invalid_at IS NULL '
                          'SET e.invalid_at=$to, e.expired_at=$now',
                          g=config.GROUP_ID, p=pid, v=v['version'], to=graph.at(v['effective_to']), now=now)
    return edges


async def ingest_people(people: list[dict]):
    """Org chart (seed only). Person validity starts at joined; leaving doesn't erase what they decided."""
    for p in people:
        await graph.upsert_node(p['id'], 'Person', p['name'], {
            'role': p['role'], 'joined': str(p['joined']), 'left': p.get('left') and str(p['left']),
            'valid_from': str(p['joined']), 'source_doc': 'people.yaml', 'visibility': 'org', **HUMAN,
            'source_start': None, 'source_end': None, 'source_quote': f"{p['id']}: {p['name']}, {p['role']}"})


async def watch(interval: float = 5):
    """Polling folder watcher (§9; deck §2 bullet 5: 'polling, not event-driven').
    Watches only the vault's inbox/ drop folder, never the seeded dataset folders: the dataset is ingested
    once by seed.py on the extraction machine, and a watcher on those folders would re-ingest it locally.
    Files present at startup are the baseline; new or changed files are ingested."""
    root = Path(config.VAULT_DIR) / 'inbox'
    files = lambda: {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*.md')}
    seen = files() if root.exists() else {}
    while True:
        await asyncio.sleep(interval)
        if not root.exists():
            continue
        for p, h in sorted(files().items()):
            if seen.get(p) == h:
                continue
            seen[p] = h
            try:
                out = await ingest(p.read_text(encoding='utf-8'), p.relative_to(root).as_posix(), 'system:watcher')
                log.info('watcher ingested %s: %s', p, out['document_id'])
            except Exception:
                log.exception('watcher failed on %s', p)


# ---- ingestion run tracking (ingestion_runs) ----

async def start_run(kind: str) -> int | None:
    try:
        return await db.pool.fetchval('INSERT INTO ingestion_runs (kind) VALUES ($1) RETURNING id', kind)
    except asyncpg.UndefinedTableError:  # database created before ingestion_runs existed: see backend/sql/init.sql
        log.warning('ingestion_runs table missing; run not tracked')
        return None


async def update_run(run_id: int | None, stats: dict, status: str = 'running', error: str | None = None):
    if run_id is None:
        return
    await db.pool.execute(
        "UPDATE ingestion_runs SET stats=$2, status=$3, error=$4, "
        "finished_at=CASE WHEN $3 = 'running' THEN NULL ELSE now() END WHERE id=$1", run_id, stats, status, error)


def doc_entry(out: dict, sha: str) -> dict:
    """Per-document outcome for stats. A meeting note whose LLM extraction failed counts as failed."""
    entry = {'status': 'failed' if out.get('extraction_error') else 'ok', 'sha256': sha,
             'document_id': out['document_id'], 'extracted': out['extracted'],
             'pending_review': out['pending_review'], 'flags': [f['id'] for f in out['flags']]}
    if out.get('extraction_error'):
        entry['error'] = out['extraction_error']
    return entry


def error_entry(e: Exception, sha: str | None) -> dict:
    return {'status': 'failed', 'sha256': sha, 'error': f'{type(e).__name__}: {e}'}


def summarise(docs: dict) -> tuple[dict, str, str | None]:
    """(stats, status, error) for a finished run."""
    count = lambda s: sum(1 for d in docs.values() if d['status'] == s)
    stats = {'documents': docs, 'ok': count('ok'), 'failed': count('failed'), 'skipped': count('skipped')}
    failed = [f"{p}: {d['error']}" for p, d in docs.items() if d['status'] == 'failed']
    status = 'failed' if failed and not stats['ok'] + stats['skipped'] else 'partial' if failed else 'succeeded'
    return stats, status, '\n'.join(failed) or None


async def completed_docs() -> dict[str, dict]:
    """path -> last stats entry, for documents whose last recorded run finished them (ok or skipped) and whose
    stored copy still has that sha256. Interrupted runs count too: stats are written after every document."""
    rows = await db.pool.fetch("SELECT d.key AS path, d.value AS v FROM ingestion_runs r, "
                               "jsonb_each(r.stats->'documents') d ORDER BY r.id")
    last = {r['path']: r['v'] for r in rows}
    stored = {r['id']: r['sha256'] for r in await db.pool.fetch('SELECT id, sha256 FROM documents')}
    return {p: v for p, v in last.items()
            if v.get('status') in ('ok', 'skipped') and stored.get(v.get('document_id')) == v.get('sha256')}


def read_text(p: Path) -> str:
    """Text of a scanned file: .md/.txt as is, .pdf and .docx extracted locally."""
    suffix = p.suffix.lower()
    if suffix == '.pdf':
        from pypdf import PdfReader
        return '\n\n'.join((page.extract_text() or '').strip() for page in PdfReader(p).pages).strip()
    if suffix == '.docx':
        import docx
        return '\n\n'.join(par.text for par in docx.Document(p).paragraphs if par.text.strip())
    return p.read_text(encoding='utf-8')


def meeting_note(text: str, doc_id: str, title: str, meeting_date: date, source: str, extra: dict | None = None) -> str:
    fm = {'doc_type': 'meeting_note', 'doc_id': doc_id, 'title': title, 'meeting_date': meeting_date,
          'source': source, **(extra or {})}
    return f"---\n{yaml.safe_dump(fm, sort_keys=False, allow_unicode=True)}---\n# {title}\n\n{text.strip()}\n"


async def ingest_source(text: str, source_name: str, actor: str, *, doc_id: str, title: str, meeting_date: date,
                        label: dict, extra_front_matter: dict | None = None) -> dict:
    """The one ingestion entry point for plain text (Person 1 calls it for saved chat threads and connector imports;
    the sign-in scan and audio use it too). The text becomes a meeting_note with the given date (never guessed),
    is stored with label['visibility'] (contracts.label_for), and its extracted facts wait in Ingestion Review as
    candidates."""
    raw = meeting_note(text, doc_id, title, meeting_date, source_name, extra_front_matter)
    return await ingest(raw, source_name, actor, visibility=label['visibility'])


async def ingest(raw: str, path: str, actor: str, visibility: str = 'org') -> dict:
    """Tracked entry point for uploads and the watcher: one ingestion_runs row per call.
    Failures are recorded in the row and re-raised, never swallowed."""
    run = await start_run('watcher' if actor == 'system:watcher' else 'upload')
    sha = hashlib.sha256(raw.replace('\r\n', '\n').encode()).hexdigest()
    try:
        out = await _ingest(raw, path, actor, visibility)
    except Exception as e:
        await update_run(run, *summarise({path: error_entry(e, sha)}))
        raise
    await update_run(run, *summarise({path: doc_entry(out, sha)}))
    return out
