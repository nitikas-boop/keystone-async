"""/ask: as-of hybrid retrieval, relevance threshold, deterministic compliance context, per-sentence citations."""
import json
import re
from datetime import date

from graphiti_core.search.search_config import (EdgeReranker, EdgeSearchConfig, EdgeSearchMethod, NodeReranker,
                                                NodeSearchConfig, NodeSearchMethod, SearchConfig)
from graphiti_core.search.search_filters import ComparisonOperator, DateFilter, SearchFilters

from . import compliance, config, db, graph, llm

REFUSAL = 'I have no recorded decision about that'
# Cosine on nomic-embed-text. Throwaway-doc calibration: on-topic best 0.836-0.896, off-topic best 0.69-0.745.
# ponytail: fixed global threshold; re-run tests/calibrate_threshold.py on the restored demo graph and adjust.
RELEVANCE_MIN = float(config.E('RELEVANCE_MIN', '0.78'))
LOW_CONFIDENCE = float(config.E('LOW_CONFIDENCE', '0.7'))
SEARCH = SearchConfig(
    edge_config=EdgeSearchConfig(search_methods=[EdgeSearchMethod.bm25, EdgeSearchMethod.cosine_similarity],
                                 reranker=EdgeReranker.rrf),
    node_config=NodeSearchConfig(search_methods=[NodeSearchMethod.bm25, NodeSearchMethod.cosine_similarity],
                                 reranker=NodeReranker.rrf),
    limit=15)
ANSWER_SCHEMA = {'type': 'object', 'required': ['sentences'], 'properties': {'sentences': {'type': 'array', 'items': {
    'type': 'object', 'required': ['text', 'source_ids'],
    'properties': {'text': {'type': 'string'}, 'source_ids': {'type': 'array', 'items': {'type': 'string'}}}}}}}
SYSTEM = f"""You are Keystone, an organisation's decision memory. Answer ONLY from the numbered sources.
Every sentence must list in source_ids the IDs of the sources that support it; use only IDs from the list.
Compliance outcomes are given to you as deterministic CHECK sources: repeat their result, never re-judge it.
Name the owner, the date and the stated reasons when the question asks why.
If the sources do not answer the question, return exactly one sentence "{REFUSAL}" with source_ids [].
Return JSON only."""


async def _relevant(question: str, as_of: date) -> tuple[list[str], list[dict]]:
    """Seed node keys: Graphiti hybrid search (BM25 + cosine, RRF) filtered to what was valid as_of,
    then a real cosine threshold, since RRF scores are rank-based and can't express 'nothing relevant'."""
    dt = graph.at(as_of)
    filt = SearchFilters(
        valid_at=[[DateFilter(date=dt, comparison_operator=ComparisonOperator.less_than_equal)]],
        invalid_at=[[DateFilter(date=dt, comparison_operator=ComparisonOperator.greater_than)],
                    [DateFilter(comparison_operator=ComparisonOperator.is_null)]])
    res = await graph.g.search_(question, config=SEARCH, group_ids=[config.GROUP_ID], search_filter=filt)
    vec = await graph.g.embedder.create(input_data=[question])
    d = as_of.isoformat()
    scored = await graph.q(
        f'UNWIND $n AS u MATCH (n:Entity {{uuid: u}}) WHERE {graph.node_ok("n")} '
        'RETURN [n.key] AS keys, vector.similarity.cosine(n.name_embedding, $v) AS s '
        f'UNION UNWIND $e AS u MATCH (a)-[e:RELATES_TO {{uuid: u}}]->(b) WHERE {graph.EDGE_OK} '
        f'AND {graph.node_ok("a")} AND {graph.node_ok("b")} '
        'RETURN [a.key, b.key] AS keys, vector.similarity.cosine(e.fact_embedding, $v) AS s',
        n=[x.uuid for x in res.nodes], e=[x.uuid for x in res.edges], v=vec, d=d, dt=dt)
    ranked = sorted(({'keys': r['keys'], 'score': round(r['s'], 3)} for r in scored), key=lambda r: -r['score'])
    keys = []
    for r in ranked:
        if r['score'] >= RELEVANCE_MIN:
            keys += [k for k in r['keys'] if k not in keys]
    return keys[:10], ranked[:8]


def _src_text(n: dict) -> str:
    a = n['attributes']
    t = n['type']
    if t == 'Decision':
        return (f"Decision \"{n['label']}\" decided {a.get('decided_on')}; owner {a.get('owner')}; status {a.get('status')}; "
                f"effect {a.get('effect')}; fields {a.get('fields_json')}; reasons: {a.get('reasons')}")
    if t == 'Clause':
        return (f"Clause {a.get('clause_id')} version {a.get('version')} in force {n['valid_from']} to "
                f"{n['valid_to'] or 'now'}: {a.get('text')} fields {a.get('fields_json')}")
    if t == 'Person':
        return f"Person {n['label']}, {a.get('role')}, joined {a.get('joined')}" + (f", left {a['left']}" if a.get('left') else '')
    return f"{t} {n['label']}" + (f" ({n['valid_from']})" if n['valid_from'] else '') + \
        (f": {a['impact_type']}" if a.get('impact_type') else '')


async def ask(question: str, as_of: date, actor: str) -> dict:
    seeds, ranked = await _relevant(question, as_of)
    keys = list(dict.fromkeys(seeds + (await graph.neighbours(seeds, as_of) if seeds else [])))
    sub = await graph.read(as_of, keys) if keys else {'as_of': as_of.isoformat(), 'nodes': [], 'edges': []}
    nodes = {n['id']: n for n in sub['nodes']}
    sources = {k: {'text': _src_text(n), 'node': n} for k, n in nodes.items()}

    for n in sub['nodes']:  # meeting-note text behind "why" answers
        if n['type'] == 'MeetingNote':
            doc = await db.pool.fetchrow('SELECT raw, path FROM documents WHERE id=$1', n['id'])
            if doc:
                sources[n['id']]['text'] += ' notes: ' + doc['raw'].split('\n---', 1)[-1].strip()[:2000]
    for e in sub['edges']:
        if e['source'] in sources:
            sources[e['source']]['text'] += f"; {e['relation']} {e['target']}"

    checks = []
    for n in sub['nodes']:
        if n['type'] == 'Decision':
            res = await compliance.evaluate(n['id'], as_of, LOW_CONFIDENCE, explain=False)
            if res and res['result'] != 'no_clause':
                checks.append(res)
                for label, cs, verdict in (('when decided', res['checks'], res['result']),
                                           (f'as of {as_of}', res['current'], res['current_result'])):
                    for c in cs:
                        sources.setdefault(c['source_id'], {'text': f"Clause {c['source_id']} in force "
                                                            f"{c['valid_from']} to {c['valid_to'] or 'now'}", 'node': None})
                        sources[f"CHECK:{n['id']}:{c['source_id']}"] = {'node': None, 'text': (
                            f"Deterministic check of {n['id']} against {c['source_id']} ({label}): {c['result']}; "
                            f"{c['reason']}; decision value {c['decision_value']}, limit {c['limit']}.")}

    if not seeds:
        return await _finish(question, as_of, actor, [], sources, sub, checks, True, ranked)

    listing = '\n'.join(f'[{k}] {v["text"]}' for k, v in sources.items())
    user = f'Question (answer as of {as_of}): {question}\n\nSources:\n{listing}'
    sentences = []
    for attempt in range(2):  # uncited claims are rejected and regenerated once
        out = await llm.chat_json(SYSTEM, user, ANSWER_SCHEMA)
        good, bad = _validate(out.get('sentences', []), sources)
        sentences = good
        if not bad:
            break
        user += ('\n\nYour previous answer had sentences without valid source IDs: '
                 + json.dumps([b['text'] for b in bad]) + '. Cite a listed ID on every sentence or drop it.')
    refused = not sentences or any(REFUSAL.lower() in s['text'].lower() for s in sentences)
    return await _finish(question, as_of, actor, [] if refused else sentences, sources, sub, checks, refused, ranked)


def _validate(sentences, sources):
    good, bad = [], []
    for s in sentences:
        text = re.sub(r'\s*\[[^\]]+\]', '', s.get('text', '')).strip()
        ids = [i.strip('[] ') for i in s.get('source_ids', [])]
        ok_ids = [_resolve(i, sources) for i in ids]
        if text and ids and all(ok_ids):
            good.append({'text': text, 'source_ids': list(dict.fromkeys(sum(ok_ids, [])))})
        elif REFUSAL.lower() in text.lower():
            good.append({'text': REFUSAL, 'source_ids': []})
        else:
            bad.append(s)
    return good, bad


def _resolve(i, sources):
    """A CHECK source is cited as the decision + clause version it compares."""
    if i not in sources:
        return None
    return i.split(':')[1:] if i.startswith('CHECK:') else [i]


async def _finish(question, as_of, actor, sentences, sources, sub, checks, refused, ranked):
    cited = list(dict.fromkeys(i for s in sentences for i in s['source_ids']))
    citations = []
    for i in cited:
        n = sources.get(i, {}).get('node')
        if n is None:
            n = next(iter((await graph.read(as_of, [i]))['nodes']), None) or \
                {'id': i, 'type': 'Clause', 'label': i, 'valid_from': None, 'provenance': {}}
        p = n.get('provenance') or {}
        citations.append({'id': i, 'type': n['type'], 'label': i, 'title': n['label'], 'date': n.get('valid_from'),
                          'source_doc': p.get('source_doc'), 'quote': (p.get('source_span') or {}).get('quote'),
                          'span': p.get('source_span')})
    answer = REFUSAL if refused else ' '.join(f"{s['text']} " + ''.join(f'[{i}]' for i in s['source_ids'])
                                              for s in sentences)
    facts = [(n['id'], 'node', n['label'], n['provenance']) for n in sub['nodes'] if n['id'] in cited] + \
            [(e['id'], 'edge', e['fact'], e['provenance']) for e in sub['edges']
             if e['source'] in cited or e['target'] in cited]
    warnings = [{'fact_id': fid, 'kind': kind, 'text': text, 'confidence': p['confidence'],
                 'reason': 'unverified_low_confidence'}
                for fid, kind, text, p in facts if not p['human_verified'] and (p['confidence'] or 0) < LOW_CONFIDENCE]
    warnings += [w for c in checks if c['decision_id'] in cited for w in c['warnings']]
    resp = {'as_of': as_of.isoformat(), 'question': question, 'refused': refused, 'answer': answer,
            'sentences': sentences, 'citations': citations, 'compliance': [c for c in checks if c['decision_id'] in cited],
            'subgraph': {'nodes': [] if refused else sub['nodes'], 'edges': [] if refused else sub['edges']},
            'highlight_nodes': cited, 'warnings': warnings,
            'retrieval': {'threshold': RELEVANCE_MIN, 'top': ranked}}
    async with db.pool.acquire() as c, c.transaction():
        aid = await c.fetchval('INSERT INTO answers (question, as_of, response) VALUES ($1,$2,$3) RETURNING id',
                               question, as_of, resp)
        await db.audit(actor, 'query', 'answer', str(aid), cited, {'question': question, 'as_of': str(as_of),
                                                                     'answer': answer}, conn=c)
    return {'answer_id': str(aid), **resp}
