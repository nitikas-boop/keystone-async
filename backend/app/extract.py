"""LLM extraction from prose (meeting notes) + ingestion review (§6.8, §9).
One structured-output call returns entities, relations AND a confidence per fact; offsets are found by us."""
import json
import logging
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from . import config, db, graph, llm
from .prompts import EXTRACTION_SYSTEM_PROMPT

log = logging.getLogger('keystone.extract')

NODE_TYPES = ['Person', 'Decision', 'Project']
RELATIONS = ['MADE_BY', 'ABOUT', 'SUPERSEDES']  # RELIED_ON links are added by a human in review

SCHEMA = {
    'type': 'object', 'required': ['entities', 'relations'],
    'properties': {
        'entities': {'type': 'array', 'items': {'type': 'object', 'required': ['ref', 'type', 'name', 'quote', 'confidence'],
            'properties': {'ref': {'type': 'string'}, 'type': {'type': 'string', 'enum': NODE_TYPES},
                           'name': {'type': 'string'}, 'quote': {'type': 'string'},
                           'effect': {'type': 'string', 'enum': ['ongoing', 'completed']},
                           'confidence': {'type': 'number', 'minimum': 0, 'maximum': 1}}}},
        'relations': {'type': 'array', 'items': {'type': 'object',
            'required': ['source', 'relation', 'target', 'quote', 'confidence'],
            'properties': {'source': {'type': 'string'}, 'relation': {'type': 'string', 'enum': RELATIONS},
                           'target': {'type': 'string'}, 'quote': {'type': 'string'},
                           'confidence': {'type': 'number', 'minimum': 0, 'maximum': 1}}}}}}


def _locate(raw: str, body_start: int, quote: Optional[str]) -> dict:
    if not quote or not isinstance(quote, str) or not quote.strip():
        return {'source_start': None, 'source_end': None, 'source_quote': str(quote or '')}
    q = quote.strip()
    # Try exact match first
    i = raw.find(q, body_start)
    if i >= 0:
        return {'source_start': i, 'source_end': i + len(q), 'source_quote': raw[i:i + len(q)]}
    
    # Try without surrounding quotes if model wrapped quote in quotes
    if len(q) >= 2 and ((q.startswith('"') and q.endswith('"')) or (q.startswith("'") and q.endswith("'")) or (q.startswith('“') and q.endswith('”'))):
        unwrapped = q[1:-1].strip()
        i = raw.find(unwrapped, body_start)
        if i >= 0:
            return {'source_start': i, 'source_end': i + len(unwrapped), 'source_quote': raw[i:i + len(unwrapped)]}

    # Fallback to returning clean quote string without failing
    return {'source_start': None, 'source_end': None, 'source_quote': q}


def parse_extraction_output(raw: str, body_start: int, out: dict, did: str, path: str, ref: date,
                            visibility: str, known_keys: dict) -> Tuple[List[dict], List[dict], List[tuple]]:
    """Pure parsing and provenance attachment on LLM extraction output."""
    base = {'source_doc': path, 'visibility': visibility, 'extracted_by': config.EXTRACT_MODEL, 'human_verified': False}
    keymap, nodes_out, edges_out, rows = {}, [], [], []

    if not isinstance(out, dict):
        return nodes_out, edges_out, rows

    entities = out.get('entities') or []
    if not isinstance(entities, list):
        entities = []

    for i, ent in enumerate(entities):
        if not isinstance(ent, dict):
            continue
        ref_id = str(ent.get('ref') or f"E{i+1}")
        if ref_id in known_keys:
            keymap[ref_id] = ref_id
            continue

        key = f"{did}-{ref_id}"
        keymap[ref_id] = key

        quote = ent.get('quote') or ''
        loc = _locate(raw, body_start, quote)
        
        try:
            conf = float(ent.get('confidence', 1.0))
        except (ValueError, TypeError):
            conf = 1.0

        prov = {**base, 'confidence': conf, **loc,
                'source_span': {'start': loc['source_start'], 'end': loc['source_end'], 'quote': loc['source_quote']}}
        attrs = {'valid_from': ref.isoformat(), **prov}
        
        ent_type = ent.get('type') or 'Entity'
        ent_name = ent.get('name') or ref_id
        effect = ent.get('effect') or 'ongoing'

        if ent_type == 'Decision':
            attrs.update(decided_on=ref.isoformat(), status='active', effect=effect,
                         fields_json='{}', reasons=prov['source_quote'])
        nodes_out.append({'key': key, 'type': ent_type, 'name': ent_name, 'attrs': attrs, 'prov': prov})
        rows.append(('node', None, ent_type, key, None, ent_name, prov))

        if ent_type == 'Decision':  # an extracted decision is justified by the note it came from
            fact = f'{ent_name} JUSTIFIED_BY {did}'
            edges_out.append({'src': key, 'rel': 'JUSTIFIED_BY', 'dst': did, 'fact': fact, 'prov': prov})
            rows.append(('edge', None, 'JUSTIFIED_BY', key, did, fact, prov))

    relations = out.get('relations') or []
    if not isinstance(relations, list):
        relations = []

    valid_targets = set(keymap.values()) | set(known_keys.keys()) | {did}

    for rel in relations:
        if not isinstance(rel, dict):
            continue
        s_raw = str(rel.get('source') or '')
        t_raw = str(rel.get('target') or '')
        relation = str(rel.get('relation') or '')
        if not s_raw or not t_raw or not relation:
            continue

        src, dst = keymap.get(s_raw, s_raw), keymap.get(t_raw, t_raw)
        if src not in valid_targets or dst not in valid_targets:
            continue  # model referenced something it never defined

        try:
            conf = float(rel.get('confidence', 1.0))
        except (ValueError, TypeError):
            conf = 1.0

        quote = rel.get('quote') or ''
        loc = _locate(raw, body_start, quote)
        prov = {**base, 'confidence': conf, **loc}
        fact = f"{src} {relation} {dst}"
        edges_out.append({'src': src, 'rel': relation, 'dst': dst, 'fact': fact, 'prov': prov})
        rows.append(('edge', None, relation, src, dst, fact, prov))

    return nodes_out, edges_out, rows


async def _known(as_of: date) -> list[dict]:
    # Errors surface: extracting without the known entities would silently create duplicates.
    rows = await graph.q(f'MATCH (n:Entity {{group_id: $g}}) WHERE n.type IN $t AND {graph.node_ok("n")} '
                         'RETURN n.key AS key, n.type AS type, n.name AS name',
                         g=config.GROUP_ID, t=NODE_TYPES, d=as_of.isoformat())
    return [dict(r) for r in rows]


async def extract(raw: str, body_start: int, did: str, path: str, ref: date, visibility: str, episode: str) -> dict:
    known = await _known(ref)
    known_keys = {k['key']: k for k in known}
    try:
        out = await llm.chat_json(EXTRACTION_SYSTEM_PROMPT,
                                  f'Known entities: {json.dumps(known)}\n\nMeeting notes ({ref}):\n'
                                  f'{raw[body_start:]}', SCHEMA, model=config.EXTRACT_MODEL,
                                  base_url=config.EXTRACT_OLLAMA_URL, timeout=600)
    except Exception as e:
        return {'edge_uuids': [], 'extraction_error': f'{type(e).__name__}: {e}'}

    nodes_to_upsert, edges_to_upsert, rows = parse_extraction_output(
        raw, body_start, out, did, path, ref, visibility, known_keys
    )

    edges = []
    for n in nodes_to_upsert:
        u = await graph.upsert_node(n['key'], n['type'], n['name'], n['attrs'])
        # update row with graph_uuid
        for i, r in enumerate(rows):
            if r[0] == 'node' and r[3] == n['key']:
                rows[i] = (r[0], u, r[2], r[3], r[4], r[5], r[6])

    for e in edges_to_upsert:
        eu = await graph.upsert_edge(e['src'], e['rel'], e['dst'], e['fact'], graph.at(ref), e['prov'], episode)
        edges.append(eu)
        for i, r in enumerate(rows):
            if r[0] == 'edge' and r[3] == e['src'] and r[4] == e['dst'] and r[2] == e['rel']:
                rows[i] = (r[0], eu, r[2], r[3], r[4], r[5], r[6])

    if db.pool is not None:
        async with db.pool.acquire() as c:
            await c.execute('DELETE FROM extractions WHERE document_id=$1 AND status=$2', did, 'pending')
            await c.executemany(
                'INSERT INTO extractions (document_id, kind, graph_uuid, type, source_key, target_key, text, source_start, '
                'source_end, source_quote, confidence, extracted_by, human_verified, visibility) '
                'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false,$13)',
                [(did, k, u, t, s, d, text, p['source_start'], p['source_end'], p['source_quote'], p['confidence'],
                  p['extracted_by'], p['visibility']) for k, u, t, s, d, text, p in rows])

    return {'edge_uuids': edges, 'extracted': {'nodes': len(nodes_to_upsert), 'edges': len(edges)}, 'pending_review': len(rows)}


# ---- ingestion review ----

def row_out(r) -> dict:
    return {'id': r['id'], 'document_id': r['document_id'], 'kind': r['kind'], 'graph_id': r['graph_uuid'],
            'type': r['type'], 'source': r['source_key'], 'target': r['target_key'], 'text': r['text'],
            'provenance': {'source_doc': r['document_id'], 'confidence': r['confidence'],
                           'extracted_by': r['extracted_by'], 'human_verified': r['human_verified'],
                           'visibility': r['visibility'],
                           'source_span': {'start': r['source_start'], 'end': r['source_end'], 'quote': r['source_quote']}},
            'status': r['status']}


async def review(ext_id: int, actor: str, decision: str, changes: dict | None = None) -> dict:
    """decision: accept | reject | edit. Edit = accept with human corrections."""
    async with db.pool.acquire() as c, c.transaction():
        r = await c.fetchrow('SELECT * FROM extractions WHERE id=$1 FOR UPDATE', ext_id)
        if r is None:
            raise LookupError('no such extraction')
        if r['status'] != 'pending' and decision != 'edit':
            raise ValueError(f"extraction is already {r['status']}")
        props = {'human_verified': True}
        if decision == 'reject':
            props = {'rejected': True, 'expired_at': datetime.now(timezone.utc)}
        elif decision == 'edit':
            allowed = {'name', 'fact', 'status', 'effect', 'fields'} & (changes or {}).keys()
            if not allowed:
                raise ValueError('editable fields: name, fact, status, effect, fields')
            props.update({k: changes[k] for k in allowed if k != 'fields'},
                         extracted_by='human', confidence=1.0)
            if 'fields' in allowed:
                props['fields_json'] = json.dumps(changes['fields'])
        status = 'rejected' if decision == 'reject' else 'accepted'
        await c.execute('UPDATE extractions SET status=$2, human_verified=$3, extracted_by=$4, confidence=$5 WHERE id=$1',
                        ext_id, status, decision != 'reject', props.get('extracted_by', r['extracted_by']),
                        props.get('confidence', r['confidence']))
        await graph.set_props(r['kind'], r['graph_uuid'], props)
        await db.audit(actor, 'extraction_reviewed', 'extraction', str(ext_id),
                       [x for x in (r['source_key'], r['target_key']) if x],
                       {'decision': decision, 'changes': changes}, conn=c)
        return row_out(await c.fetchrow('SELECT * FROM extractions WHERE id=$1', ext_id))


async def add_edge(actor: str, source: str, relation: str, target: str) -> dict:
    """Human-added fact during review, e.g. linking an extracted decision to the clause it relied on."""
    src = await graph.q('MATCH (n:Entity {uuid: $u}) RETURN properties(n) AS p', u=graph.uid(source))
    if not src:
        raise LookupError(f'no node {source}')
    if not await graph.q('MATCH (n:Entity {uuid: $u}) RETURN n.key', u=graph.uid(target)):
        raise LookupError(f'no node {target}')
    p = src[0]['p']
    did = await db.pool.fetchval('SELECT id FROM documents WHERE path=$1', p.get('source_doc'))
    if did is None:
        raise ValueError(f'{source} has no source document to attach the edge to')
    fact = f'{source} {relation} {target}'
    prov = {'source_doc': p['source_doc'], 'visibility': p.get('visibility', 'org'), 'confidence': 1.0,
            'extracted_by': 'human', 'human_verified': True, 'source_start': None, 'source_end': None,
            'source_quote': f'added in review by {actor}'}
    u = await graph.upsert_edge(source, relation, target, fact, graph.at(date.fromisoformat(p['valid_from'])),
                                prov, graph.uid(f'episode:{did}'))
    async with db.pool.acquire() as c, c.transaction():
        r = await c.fetchrow(
            'INSERT INTO extractions (document_id, kind, graph_uuid, type, source_key, target_key, text, source_quote, '
            "confidence, extracted_by, human_verified, status) VALUES ($1,'edge',$2,$3,$4,$5,$6,$7,1,'human',true,'accepted') "
            'RETURNING *', did, u, relation, source, target, fact, prov['source_quote'])
        await db.audit(actor, 'extraction_reviewed', 'extraction', str(r['id']), [source, target],
                       {'decision': 'add', 'fact': fact}, conn=c)
    return row_out(r)
