"""Graphiti / Neo4j Production Retrieval Adapter.

Implements BaseRetrievalAdapter against the live Graphiti temporal graph and PostgreSQL.
When Member 1's live graph seeding completes, this adapter seamlessly serves the reasoning layer.
"""
import logging
from datetime import date
from typing import Any, Dict, List, Optional

import importlib

try:
    from app import config, db, graph, grounding
except ImportError:
    from .. import config, db, graph, grounding

from .base import BaseRetrievalAdapter, EdgeRecord, NodeRecord, RetrievalResult, SourceRecord

log = logging.getLogger('keystone.retrieval.graphiti')

try:
    _sc = importlib.import_module('graphiti_core.search.search_config')
    _sf = importlib.import_module('graphiti_core.search.search_filters')
    EdgeReranker = getattr(_sc, 'EdgeReranker', None)
    EdgeSearchConfig = getattr(_sc, 'EdgeSearchConfig', None)
    EdgeSearchMethod = getattr(_sc, 'EdgeSearchMethod', None)
    NodeReranker = getattr(_sc, 'NodeReranker', None)
    NodeSearchConfig = getattr(_sc, 'NodeSearchConfig', None)
    NodeSearchMethod = getattr(_sc, 'NodeSearchMethod', None)
    SearchConfig = getattr(_sc, 'SearchConfig', None)
    ComparisonOperator = getattr(_sf, 'ComparisonOperator', None)
    DateFilter = getattr(_sf, 'DateFilter', None)
    SearchFilters = getattr(_sf, 'SearchFilters', None)
    if SearchConfig and EdgeSearchConfig and NodeSearchConfig:
        SEARCH = SearchConfig(
            edge_config=EdgeSearchConfig(search_methods=[EdgeSearchMethod.bm25, EdgeSearchMethod.cosine_similarity],
                                         reranker=EdgeReranker.rrf),
            node_config=NodeSearchConfig(search_methods=[NodeSearchMethod.bm25, NodeSearchMethod.cosine_similarity],
                                         reranker=NodeReranker.rrf),
            limit=15)
    else:
        SEARCH = None
except Exception:
    SEARCH = None
    ComparisonOperator = None
    DateFilter = None
    SearchFilters = None


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


class GraphitiRetrievalAdapter(BaseRetrievalAdapter):
    """Production retrieval adapter utilizing Graphiti on Neo4j and Postgres."""

    def __init__(self, relevance_min: Optional[float] = None):
        self.relevance_min = relevance_min if relevance_min is not None else float(config.E('RELEVANCE_MIN', '0.80'))

    async def get_node(self, node_id: str, as_of: Optional[date] = None) -> Optional[NodeRecord]:
        # Errors surface: a graph failure must not look like "no such node".
        sub = await graph.read(as_of or date.today(), [node_id])
        if not sub.get('nodes'):
            return None
        n = sub['nodes'][0]
        return NodeRecord(id=n['id'], type=n['type'], label=n['label'], valid_from=n.get('valid_from'),
                          valid_to=n.get('valid_to'), created_at=n.get('created_at'),
                          attributes=n.get('attributes', {}), provenance=n.get('provenance', {}))

    async def get_clause_in_force(self, clause_id: str, on_date: date) -> Optional[Dict[str, Any]]:
        # Errors surface: a database failure must not look like "no clause in force".
        row = await db.pool.fetchrow(
            'SELECT * FROM policy_clauses WHERE clause_id=$1 AND effective_from <= $2 '
            'AND (effective_to IS NULL OR effective_to > $2)', clause_id, on_date)
        return dict(row) if row else None

    async def retrieve(self, question: str, as_of: date) -> RetrievalResult:
        d = as_of.isoformat()
        if graph.g is None or graph.g.driver is None or SEARCH is None:
            # An outage must never look like a legitimate "I have no recorded decision" refusal.
            raise RuntimeError('graph retrieval unavailable: Neo4j/Graphiti not connected')
        dt = graph.at(as_of)
        filt = SearchFilters(
            valid_at=[[DateFilter(date=dt, comparison_operator=ComparisonOperator.less_than_equal)]],
            invalid_at=[[DateFilter(date=dt, comparison_operator=ComparisonOperator.greater_than)],
                        [DateFilter(comparison_operator=ComparisonOperator.is_null)]])
        res = await graph.g.search_(question, config=SEARCH, group_ids=[graph.gid()], search_filter=filt)
        vec = await graph.g.embedder.create(input_data=[question])
        scored = await graph.q(
            f'UNWIND $n AS u MATCH (n:Entity {{uuid: u}}) WHERE {graph.node_ok("n")} '
            'RETURN [n.key] AS keys, vector.similarity.cosine(n.name_embedding, $v) AS s '
            f'UNION UNWIND $e AS u MATCH (a)-[e:RELATES_TO {{uuid: u}}]->(b) WHERE {graph.EDGE_OK} '
            f'AND {graph.node_ok("a")} AND {graph.node_ok("b")} '
            'RETURN [a.key, b.key] AS keys, vector.similarity.cosine(e.fact_embedding, $v) AS s',
            n=[x.uuid for x in res.nodes], e=[x.uuid for x in res.edges], v=vec, d=d, dt=dt)
        ranked = sorted(({'keys': r['keys'], 'score': round(r['s'], 3)} for r in scored), key=lambda r: -r['score'])
        # Access filter (B) before anything else: a hit touching an item the caller may not see is dropped whole, so
        # hidden keys never seed the subgraph, never reach the prompt and never show up in retrieval.top.
        hidden = await graph.hidden_keys(list({k for r in ranked for k in r['keys']}))
        ranked = [r for r in ranked if not hidden & set(r['keys'])]
        seeds: List[str] = []
        for r in ranked:
            if r['score'] >= self.relevance_min:
                seeds += [k for k in r['keys'] if k not in seeds]
        # A hybrid-search hit whose title shares a content word with the question ("aws" -> "Move from AWS to ...")
        # is evidence even when its cosine is low: nomic-embed-text scores short titles in a narrow band, so the
        # threshold alone refused on-topic questions. Off-topic names are refused earlier (app/grounding.py).
        words = grounding.content_words(question)
        seeds += [k for k in (n.attributes.get('key') for n in res.nodes
                              if set(grounding.WORD.findall((n.name or '').lower())) & set(words))
                  if k and k not in seeds]
        seeds = seeds[:10]

        if not seeds:
            return RetrievalResult(
                as_of=d,
                question=question,
                seed_keys=[],
                nodes=[],
                edges=[],
                sources={},
                ranked_scores=ranked[:8],
                relevance_threshold=self.relevance_min
            )

        keys = list(dict.fromkeys(seeds + (await graph.neighbours(seeds, as_of) if seeds else [])))
        sub = await graph.read(as_of, keys) if keys else {'as_of': d, 'nodes': [], 'edges': []}

        nodes = [NodeRecord(
            id=n['id'], type=n['type'], label=n['label'],
            valid_from=n.get('valid_from'), valid_to=n.get('valid_to'),
            created_at=n.get('created_at'), attributes=n.get('attributes', {}),
            provenance=n.get('provenance', {})
        ) for n in sub['nodes']]

        edges = [EdgeRecord(
            id=e['id'], source=e['source'], target=e['target'],
            relation=e['relation'], fact=e['fact'],
            valid_from=e.get('valid_from'), valid_to=e.get('valid_to'),
            created_at=e.get('created_at'), provenance=e.get('provenance', {})
        ) for e in sub['edges']]

        sources: Dict[str, SourceRecord] = {}
        for n in sub['nodes']:
            sources[n['id']] = SourceRecord(
                id=n['id'],
                text=_src_text(n),
                node=n,
                doc_path=(n.get('provenance') or {}).get('source_doc')
            )

        for n in sub['nodes']:
            if n['type'] == 'MeetingNote':
                doc = await db.pool.fetchrow('SELECT raw, path FROM documents WHERE id=$1', n['id'])
                if doc:
                    sources[n['id']].text += ' notes: ' + doc['raw'].split('\n---', 1)[-1].strip()[:2000]

        for e in sub['edges']:
            if e['source'] in sources:
                sources[e['source']].text += f"; {e['relation']} {e['target']}"

        return RetrievalResult(
            as_of=d,
            question=question,
            seed_keys=seeds,
            nodes=nodes,
            edges=edges,
            sources=sources,
            ranked_scores=ranked[:8],
            relevance_threshold=self.relevance_min
        )
