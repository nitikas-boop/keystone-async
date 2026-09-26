"""Graphiti on Neo4j, all models local via Ollama.

Structured facts are saved with EntityNode/EntityEdge.save() rather than add_triplet(): add_triplet runs
LLM dedup and LLM edge invalidation, which would let the model decide validity (§6.3 forbids that).
"""
import logging
import uuid
from datetime import date, datetime, time, timezone

from graphiti_core import Graphiti
from graphiti_core.cross_encoder.openai_reranker_client import OpenAIRerankerClient
from graphiti_core.edges import EntityEdge
from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig
from graphiti_core.llm_client.config import LLMConfig
from graphiti_core.llm_client.openai_generic_client import OpenAIGenericClient
from graphiti_core.nodes import EntityNode, EpisodeType, EpisodicNode

from . import config

# Our queries use optional properties (e.g. rejected); Neo4j warns about unseen keys on every call.
logging.getLogger('neo4j.notifications').setLevel(logging.ERROR)
_NS = uuid.UUID('9b1f3a52-6c0e-4d8e-9a57-4b0c2f1e7d11')
g: Graphiti | None = None


def uid(key: str) -> str:
    """Deterministic graph uuid from a business key, so re-ingesting a document is idempotent."""
    return str(uuid.uuid5(_NS, f'{config.GROUP_ID}:{key}'))


def at(d: date) -> datetime:
    return datetime.combine(d, time(), tzinfo=timezone.utc)


def make() -> Graphiti:
    global g
    # Every client Graphiti would default to OpenAI is overridden with a local Ollama endpoint (§6.11).
    llm = LLMConfig(api_key='ollama', base_url=f'{config.OLLAMA_BASE_URL}/v1',
                    model=config.ANSWER_MODEL, small_model=config.ANSWER_MODEL)
    g = Graphiti(
        config.NEO4J_URI, config.NEO4J_USER, config.NEO4J_PASSWORD,
        llm_client=OpenAIGenericClient(config=llm),
        embedder=OpenAIEmbedder(OpenAIEmbedderConfig(
            api_key='ollama', base_url=f'{config.OLLAMA_BASE_URL}/v1',
            embedding_model=config.EMBED_MODEL, embedding_dim=config.EMBEDDING_DIM)),
        cross_encoder=OpenAIRerankerClient(config=llm),
    )
    return g


async def q(cypher: str, **params) -> list:
    return (await g.driver.execute_query(cypher, **params)).records


async def _existing_created_at(match: str, key_uuid: str):
    rows = await q(f'{match} RETURN x.created_at AS c', u=key_uuid)
    return rows[0]['c'].to_native() if rows and rows[0]['c'] is not None else None


async def upsert_node(key: str, type_: str, name: str, attrs: dict, summary: str = '') -> str:
    """attrs must be flat (Neo4j properties): provenance, valid_from/valid_to as 'YYYY-MM-DD' strings."""
    u = uid(key)
    node = EntityNode(uuid=u, name=name, group_id=config.GROUP_ID, labels=[type_], summary=summary,
                      attributes={'key': key, 'type': type_, **attrs})
    # Ingestion time is when we first learned the fact; keep it across re-ingests.
    node.created_at = await _existing_created_at('MATCH (x:Entity {uuid: $u})', u) or node.created_at
    await node.generate_name_embedding(g.embedder)
    await node.save(g.driver)
    return u


async def ensure_node(key: str, type_: str, prov: dict) -> str:
    """Stub a referenced node (e.g. a person named as owner) without overwriting a full one."""
    rows = await q('MATCH (x:Entity {uuid: $u}) RETURN x.uuid AS u', u=uid(key))
    return rows[0]['u'] if rows else await upsert_node(key, type_, key, prov)


async def upsert_edge(src: str, rel: str, dst: str, fact: str, valid_at: datetime, prov: dict,
                      episode_uuid: str, invalid_at: datetime | None = None, extra: dict | None = None) -> str:
    u = uid(f'{src}|{rel}|{dst}')
    edge = EntityEdge(uuid=u, group_id=config.GROUP_ID, source_node_uuid=uid(src), target_node_uuid=uid(dst),
                      created_at=datetime.now(timezone.utc), name=rel, fact=fact, episodes=[episode_uuid],
                      valid_at=valid_at, invalid_at=invalid_at, reference_time=valid_at,
                      attributes={'source_key': src, 'target_key': dst, **prov, **(extra or {})})
    edge.created_at = await _existing_created_at('MATCH ()-[x:RELATES_TO {uuid: $u}]->()', u) or edge.created_at
    await edge.generate_embedding(g.embedder)
    await edge.save(g.driver)
    return u


async def save_episode(doc_id: str, doc_type: str, raw: str, ref: datetime, edge_uuids: list[str]) -> str:
    """The episode's reference time is the front-matter date, never ingestion time (§6.3)."""
    ep = EpisodicNode(uuid=uid(f'episode:{doc_id}'), name=doc_id, group_id=config.GROUP_ID,
                      source=EpisodeType.text, source_description=doc_type, content=raw,
                      valid_at=ref, entity_edges=edge_uuids)
    await ep.save(g.driver)
    return ep.uuid


# As-of visibility (valid time). Rejected extractions are kept for history but never read.
def node_ok(v: str) -> str:
    return (f'coalesce({v}.rejected, false) = false AND coalesce({v}.valid_from, "0000") <= $d '
            f'AND ({v}.valid_to IS NULL OR {v}.valid_to > $d)')


EDGE_OK = 'coalesce(e.rejected, false) = false AND e.valid_at <= $dt AND (e.invalid_at IS NULL OR e.invalid_at > $dt)'


async def read(as_of: date, keys: list[str] | None = None) -> dict:
    """Nodes and edges valid on as_of (valid time, not ingestion time); optionally only among `keys`."""
    d, dt = as_of.isoformat(), at(as_of)
    only = 'AND n.key IN $keys' if keys is not None else ''
    nodes = await q(f'MATCH (n:Entity {{group_id: $g}}) WHERE {node_ok("n")} {only} RETURN properties(n) AS p',
                    g=config.GROUP_ID, d=d, keys=keys)
    only = 'AND a.key IN $keys AND b.key IN $keys' if keys is not None else ''
    edges = await q(
        f'MATCH (a:Entity)-[e:RELATES_TO {{group_id: $g}}]->(b:Entity) '
        f'WHERE {EDGE_OK} AND {node_ok("a")} AND {node_ok("b")} {only} RETURN properties(e) AS p',
        g=config.GROUP_ID, d=d, dt=dt, keys=keys)
    return {'as_of': d, 'nodes': [node_out(r['p']) for r in nodes], 'edges': [edge_out(r['p']) for r in edges]}


async def neighbours(keys: list[str], as_of: date) -> list[str]:
    """Keys one hop from `keys`, as of a date."""
    rows = await q(
        f'MATCH (a:Entity)-[e:RELATES_TO]-(b:Entity) WHERE a.key IN $keys AND {EDGE_OK} '
        f'AND {node_ok("a")} AND {node_ok("b")} RETURN DISTINCT b.key AS k',
        keys=keys, d=as_of.isoformat(), dt=at(as_of))
    return [r['k'] for r in rows]


async def set_props(kind: str, u: str, props: dict):
    m = 'MATCH (x:Entity {uuid: $u})' if kind == 'node' else 'MATCH ()-[x:RELATES_TO {uuid: $u}]->()'
    await q(f'{m} SET x += $props', u=u, props=props)


PROV_KEYS = ('source_doc', 'source_start', 'source_end', 'source_quote', 'confidence',
             'extracted_by', 'human_verified', 'visibility')
_INTERNAL = {'uuid', 'group_id', 'name_embedding', 'fact_embedding', 'labels', 'episodes', 'summary'}


def _iso(v):
    return v.iso_format() if hasattr(v, 'iso_format') else v


def _prov(p: dict) -> dict:
    out = {k: p.get(k) for k in PROV_KEYS}
    out['source_span'] = {'start': out.pop('source_start'), 'end': out.pop('source_end'),
                          'quote': out.pop('source_quote')}
    return out


def node_out(p: dict) -> dict:
    skip = _INTERNAL | set(PROV_KEYS) | {'key', 'type', 'name', 'valid_from', 'valid_to', 'created_at'}
    return {'id': p['key'], 'type': p['type'], 'label': p['name'], 'valid_from': p.get('valid_from'),
            'valid_to': p.get('valid_to'), 'created_at': _iso(p.get('created_at')),
            'attributes': {k: _iso(v) for k, v in p.items() if k not in skip}, 'provenance': _prov(p)}


def edge_out(p: dict) -> dict:
    return {'id': p['uuid'], 'source': p['source_key'], 'target': p['target_key'], 'relation': p['name'],
            'fact': p['fact'], 'valid_from': _iso(p.get('valid_at')), 'valid_to': _iso(p.get('invalid_at')),
            'created_at': _iso(p.get('created_at')), 'provenance': _prov(p)}
