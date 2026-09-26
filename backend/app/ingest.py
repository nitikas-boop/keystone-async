"""Front-matter ingestion. Dates come from YAML front-matter and become valid time + episode reference time."""
import hashlib
import json
import re
from datetime import date

import yaml

from . import db, graph

DATE_KEY = {'decision': 'decided_on', 'policy_version': 'effective_from', 'meeting_note': 'meeting_date'}
HUMAN = {'confidence': 1.0, 'extracted_by': 'human', 'human_verified': True}


def parse(raw: str) -> tuple[dict, int, int]:
    """Returns (front_matter, front_matter_end, body_start). Offsets index into raw."""
    raw = raw.replace('\r\n', '\n')
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


async def ingest(raw: str, path: str, visibility: str = 'org') -> dict:
    raw = raw.replace('\r\n', '\n')
    fm, fm_end, body_start = parse(raw)
    ref, did, doc_type = ref_date(fm), doc_id(fm), fm['doc_type']
    visibility = fm.get('visibility', visibility)

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

    prov = lambda needle: {'source_doc': path, 'visibility': visibility, **HUMAN, **span(raw, needle, fm_end)}
    writer = {'decision': _decision}.get(doc_type)
    edge_uuids = await writer(fm, did, ref, prov) if writer else []
    await graph.save_episode(did, doc_type, raw, graph.at(ref), edge_uuids)
    return {'document_id': did, 'doc_type': doc_type, 'ref_time': ref.isoformat(), 'edges': len(edge_uuids)}


async def _decision(fm: dict, did: str, ref: date, prov) -> list[str]:
    d = ref.isoformat()
    await graph.upsert_node(did, 'Decision', fm.get('title', did), {
        'valid_from': d, 'decided_on': d, 'status': fm.get('status', 'active'),
        'effect': fm.get('effect', 'completed'), 'fields_json': json.dumps(fm.get('fields') or {}),
        **prov('decided_on:')})
    edges = []
    targets = [('MADE_BY', fm.get('owner'), 'Person', 'owner:'), ('ABOUT', fm.get('project'), 'Project', 'project:'),
               ('SUPERSEDES', fm.get('supersedes'), 'Decision', 'supersedes:'),
               ('JUSTIFIED_BY', fm.get('source'), 'MeetingNote', 'source:')]
    for rel, key, type_, needle in targets:
        if key:
            await graph.ensure_node(key, type_, prov(needle))
            edges.append(await graph.upsert_edge(did, rel, key, f'{did} {rel} {key}', graph.at(ref),
                                                  prov(needle), graph.uid(f'episode:{did}')))
    return edges
