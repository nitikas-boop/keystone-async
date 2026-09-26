"""LLM extraction from prose (meeting notes) + ingestion review (§6.8, §9).
One structured-output call returns entities, relations AND a confidence per fact; offsets are found by us."""
import json
from datetime import date, datetime, timezone

from . import config, db, graph, llm

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
SYSTEM = f"""You extract decisions from an organisation's meeting notes.
A decision is a recorded choice between options, with an owner, a date, and at least one stated reason.
Anything below that bar is NOT a decision: do not extract it.
Entity types: {NODE_TYPES}. Relations: MADE_BY (Decision->Person), ABOUT (Decision->Project), SUPERSEDES (Decision->Decision).
Refer to an entity that already exists by its exact known key. For a new entity use a short ref like D1, P1.
For Decision entities, set effect: "ongoing" for a continuing practice, "completed" for a one-off act.
quote: copy the single sentence from the notes that supports the fact, verbatim.
confidence: how sure you are the fact is stated in the notes (0.0-1.0). Return JSON only."""


async def _known(as_of: date) -> list[dict]:
    rows = await graph.q(f'MATCH (n:Entity {{group_id: $g}}) WHERE n.type IN $t AND {graph.node_ok("n")} '
                         'RETURN n.key AS key, n.type AS type, n.name AS name',
                         g=config.GROUP_ID, t=NODE_TYPES, d=as_of.isoformat())
    return [dict(r) for r in rows]


def _locate(raw: str, body_start: int, quote: str) -> dict:
    i = raw.find(quote.strip(), body_start) if quote.strip() else -1
    if i < 0:
        return {'source_start': None, 'source_end': None, 'source_quote': quote}
    return {'source_start': i, 'source_end': i + len(quote.strip()), 'source_quote': quote.strip()}


async def extract(raw, body_start, did, path, ref: date, visibility, episode) -> dict:
    known = await _known(ref)
    known_keys = {k['key']: k for k in known}
    try:
        out = await llm.chat_json(SYSTEM, f'Known entities: {json.dumps(known)}\n\nMeeting notes ({ref}):\n'
                                  f'{raw[body_start:]}', SCHEMA, model=config.EXTRACT_MODEL,
                                  base_url=config.EXTRACT_OLLAMA_URL, timeout=600)
    except Exception as e:
        return {'edge_uuids': [], 'extraction_error': f'{type(e).__name__}: {e}'}

    base = {'source_doc': path, 'visibility': visibility, 'extracted_by': config.EXTRACT_MODEL, 'human_verified': False}
    keymap, nodes, edges, rows = {}, 0, [], []
    for ent in out['entities']:
        if ent['ref'] in known_keys:
            keymap[ent['ref']] = ent['ref']
            continue
        key = f"{did}-{ent['ref']}"
        keymap[ent['ref']] = key
        prov = {**base, 'confidence': float(ent['confidence']), **_locate(raw, body_start, ent['quote'])}
        attrs = {'valid_from': ref.isoformat(), **prov}
        if ent['type'] == 'Decision':
            attrs.update(decided_on=ref.isoformat(), status='active', effect=ent.get('effect', 'ongoing'),
                         fields_json='{}', reasons=prov['source_quote'])
        u = await graph.upsert_node(key, ent['type'], ent['name'], attrs)
        rows.append(('node', u, ent['type'], key, None, ent['name'], prov))
        nodes += 1
        if ent['type'] == 'Decision':  # an extracted decision is justified by the note it came from
            eu = await graph.upsert_edge(key, 'JUSTIFIED_BY', did, f'{key} JUSTIFIED_BY {did}', graph.at(ref),
                                         prov, episode)
            edges.append(eu)
            rows.append(('edge', eu, 'JUSTIFIED_BY', key, did, f'{ent["name"]} JUSTIFIED_BY {did}', prov))

    for rel in out['relations']:
        src, dst = keymap.get(rel['source'], rel['source']), keymap.get(rel['target'], rel['target'])
        if src not in keymap.values() and src not in known_keys or dst not in keymap.values() and dst not in known_keys:
            continue  # model referenced something it never defined
        prov = {**base, 'confidence': float(rel['confidence']), **_locate(raw, body_start, rel['quote'])}
        fact = f"{src} {rel['relation']} {dst}"
        eu = await graph.upsert_edge(src, rel['relation'], dst, fact, graph.at(ref), prov, episode)
        edges.append(eu)
        rows.append(('edge', eu, rel['relation'], src, dst, fact, prov))

    async with db.pool.acquire() as c:
        await c.execute('DELETE FROM extractions WHERE document_id=$1 AND status=$2', did, 'pending')
        await c.executemany(
            'INSERT INTO extractions (document_id, kind, graph_uuid, type, source_key, target_key, text, source_start, '
            'source_end, source_quote, confidence, extracted_by, human_verified, visibility) '
            'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false,$13)',
            [(did, k, u, t, s, d, text, p['source_start'], p['source_end'], p['source_quote'], p['confidence'],
              p['extracted_by'], p['visibility']) for k, u, t, s, d, text, p in rows])
    return {'edge_uuids': edges, 'extracted': {'nodes': nodes, 'edges': len(edges)}, 'pending_review': len(rows)}


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
