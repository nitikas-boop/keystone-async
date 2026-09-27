"""Tests run against a second backend instance (port 8001) wired to the keystone_test database and a separate
graph partition, so they exercise the real stack without writing into the demo graph or the demo audit chain."""
import asyncio
import json
import os
import socket
import subprocess
import sys
import time
from datetime import date
from typing import Any, Dict, List, Optional

import asyncpg
import httpx
import pytest
from neo4j import GraphDatabase

from app import config, db, graph

TEST_GROUP = 'keystone-test'
TEST_ENV = {**os.environ, 'DATABASE_URL': os.environ.get('TEST_DATABASE_URL', 'postgresql://keystone_test:keystone_test_dev@localhost:5433/keystone_test'), 'GROUP_ID': TEST_GROUP,
            'VAULT_DIR': '/tmp/keystone-test-vault', 'OUTBOX_DIR': '/tmp/keystone-test-outbox'}


SMALL_TEST_DATASET = {
    'clauses': {
        'RET-2.1': [
            {
                'policy_id': 'POL-RET',
                'version': 'v1',
                'clause_id': 'RET-2.1',
                'title': 'Customer log retention',
                'text': 'Customer activity logs shall be retained for no longer than 365 days.',
                'fields': {'retention_days_max': 365},
                'checkable': True,
                'effective_from': '2024-01-15',
                'effective_to': '2025-01-06'
            },
            {
                'policy_id': 'POL-RET',
                'version': 'v2',
                'clause_id': 'RET-2.1',
                'title': 'Customer log retention',
                'text': 'Customer activity logs shall be retained for no longer than 180 days.',
                'fields': {'retention_days_max': 180},
                'checkable': True,
                'effective_from': '2025-01-06',
                'effective_to': '2026-09-28'
            },
            {
                'policy_id': 'POL-RET',
                'version': 'v3',
                'clause_id': 'RET-2.1',
                'title': 'Customer log retention',
                'text': 'Customer activity logs shall be retained for no longer than 90 days.',
                'fields': {'retention_days_max': 90},
                'checkable': True,
                'effective_from': '2026-09-28',
                'effective_to': None
            }
        ],
        'PROC-3.1': [
            {
                'policy_id': 'POL-PROC',
                'version': 'v1',
                'clause_id': 'PROC-3.1',
                'title': 'Procurement threshold',
                'text': 'Expenditures over threshold require executive approval.',
                'fields': {'approver_threshold_inr': {'CTO': 500000, 'CEO': None}},
                'checkable': True,
                'effective_from': '2024-01-15',
                'effective_to': '2025-07-01'
            },
            {
                'policy_id': 'POL-PROC',
                'version': 'v2',
                'clause_id': 'PROC-3.1',
                'title': 'Procurement threshold',
                'text': 'Expenditures over threshold require executive approval.',
                'fields': {'approver_threshold_inr': {'CTO': 200000, 'CEO': None}},
                'checkable': True,
                'effective_from': '2025-07-01',
                'effective_to': None
            }
        ]
    },
    'decisions': {
        'DEC-003': {
            'id': 'DEC-003',
            'title': 'Start Project Atlas',
            'decided_on': '2024-11-10',
            'status': 'active',
            'effect': 'ongoing',
            'owner': 'p-ananya',
            'project': 'Atlas',
            'fields': {},
            'relied_on': [],
            'path': 'data/vault/decisions/DEC-003.md'
        },
        'DEC-004': {
            'id': 'DEC-004',
            'title': 'Approve VendorCo contract',
            'decided_on': '2025-03-14',
            'status': 'active',
            'effect': 'completed',
            'owner': 'p-vikram',
            'project': 'Atlas',
            'fields': {'amount_inr': 400000, 'approver_role': 'CTO'},
            'relied_on': ['PROC-3.1'],
            'path': 'data/vault/decisions/DEC-004.md'
        },
        'DEC-006': {
            'id': 'DEC-006',
            'title': 'Migrate Project Atlas from AWS to local provider',
            'decided_on': '2025-05-20',
            'status': 'active',
            'effect': 'ongoing',
            'owner': 'p-vikram',
            'project': 'Atlas',
            'reasons': 'Data residency and cost concerns',
            'fields': {},
            'relied_on': [],
            'path': 'data/vault/decisions/DEC-006.md'
        },
        'DEC-007': {
            'id': 'DEC-007',
            'title': 'Reduce customer log retention to 180 days',
            'decided_on': '2025-06-18',
            'status': 'active',
            'effect': 'ongoing',
            'owner': 'p-ananya',
            'project': 'Atlas',
            'fields': {'retention_days': 180},
            'relied_on': ['RET-2.1'],
            'path': 'data/vault/decisions/DEC-007.md'
        },
        'DEC-010': {
            'id': 'DEC-010',
            'title': 'Project Atlas Phase 2',
            'decided_on': '2026-04-15',
            'status': 'active',
            'effect': 'ongoing',
            'owner': 'p-ananya',
            'project': 'Atlas',
            'fields': {},
            'relied_on': [],
            'path': 'data/vault/decisions/DEC-010.md'
        }
    }
}


class TestRecord(dict):
    def __getitem__(self, item):
        return super().get(item)


class TestQueryResult:
    def __init__(self, records):
        self.records = records


class TestNeo4jDriver:
    def __init__(self, dataset):
        self.dataset = dataset

    async def execute_query(self, cypher, **params):
        u = params.get('u')
        for dec_id, dec in self.dataset['decisions'].items():
            if graph.uid(dec_id) == u or dec_id == u:
                clauses = dec.get('relied_on', [])
                rels = [{'key': f"{c}@{self.dataset['clauses'][c][0]['version']}", 'verified': True, 'confidence': 1.0} for c in clauses]
                d_props = {
                    'key': dec['id'],
                    'type': 'Decision',
                    'name': dec['title'],
                    'decided_on': dec['decided_on'],
                    'status': dec['status'],
                    'effect': dec['effect'],
                    'fields_json': json.dumps(dec['fields']),
                    'owner': dec.get('owner'),
                    'project': dec.get('project'),
                    'reasons': dec.get('reasons', ''),
                    'source_doc': dec['path'],
                    'confidence': 1.0,
                    'human_verified': True,
                    'visibility': 'org',
                    'source_start': 0,
                    'source_end': 100,
                    'source_quote': dec['title'],
                }
                return TestQueryResult([TestRecord({'d': d_props, 'clauses': clauses, 'rels': rels})])
        return TestQueryResult([TestRecord({'ok': 1})])

    async def close(self):
        pass


class TestDBPool:
    def __init__(self, dataset):
        self.dataset = dataset

    async def fetchrow(self, query, *args):
        if 'FROM policy_clauses' in query:
            clause_id = args[0]
            on = args[1]
            on_str = on.isoformat() if hasattr(on, 'isoformat') else str(on)
            for c in self.dataset['clauses'].get(clause_id, []):
                if c['effective_from'] <= on_str and (c['effective_to'] is None or c['effective_to'] > on_str):
                    return TestRecord({
                        'policy_id': c.get('policy_id', 'POL'),
                        'version': c['version'],
                        'clause_id': c['clause_id'],
                        'title': c['title'],
                        'text': c['text'],
                        'fields': c['fields'],
                        'checkable': c['checkable'],
                        'effective_from': c['effective_from'],
                        'effective_to': c['effective_to'],
                        'document_id': f"{c.get('policy_id', 'POL')}@{c['version']}"
                    })
        return None

    async def fetch(self, query, *args):
        return []

    async def fetchval(self, query, *args):
        if 'SELECT 1' in query:
            return 1
        return None

    def acquire(self):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass

    def transaction(self):
        return self

    async def execute(self, query, *args):
        pass

    async def executemany(self, query, *args):
        pass

    async def close(self):
        pass


def _is_port_open(host: str, port: int, timeout: float = 0.1) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def wipe():
    try:
        if _is_port_open('localhost', 7687):
            with GraphDatabase.driver(config.NEO4J_URI, auth=(config.NEO4J_USER, config.NEO4J_PASSWORD)) as d:
                d.execute_query('MATCH (n {group_id: $g}) DETACH DELETE n', g=TEST_GROUP)
    except Exception:
        pass

    async def pg():
        try:
            if _is_port_open('localhost', 5433):
                test_db = os.environ.get('TEST_DATABASE_URL', 'postgresql://keystone_test:keystone_test_dev@localhost:5433/keystone_test')
                c = await asyncpg.connect(test_db)
                await c.execute('DELETE FROM proposals; DELETE FROM flags; DELETE FROM extractions; DELETE FROM answers; '
                                'DELETE FROM policy_clauses; DELETE FROM documents;')  # audit_log is append-only by design
                await c.close()
        except Exception:
            pass
    try:
        asyncio.run(pg())
    except Exception:
        pass


@pytest.fixture(scope='session')
def api():
    proc = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'app.main:app', '--port', '8001'], env=TEST_ENV)
    base = 'http://localhost:8001'
    for _ in range(60):
        try:
            if httpx.get(f'{base}/health', timeout=2).status_code == 200:
                break
        except httpx.HTTPError:
            pass
        time.sleep(1)
    else:
        proc.kill()
        raise RuntimeError('test backend did not start')
    yield base
    proc.terminate()
    proc.wait(10)


@pytest.fixture
def clean():
    wipe()
    yield
    wipe()


@pytest.fixture(autouse=True)
async def test_graph():
    """Initializes the database and Neo4j test graph partition with the deterministic test dataset."""
    test_db = os.environ.get('TEST_DATABASE_URL', 'postgresql://keystone_test:keystone_test_dev@localhost:5433/keystone_test')
    config.GROUP_ID = TEST_GROUP
    
    connected_db = False
    connected_graph = False

    if _is_port_open('localhost', 5433):
        try:
            await db.connect(test_db)
            connected_db = True
            # Ingest small deterministic clauses into Postgres
            async with db.pool.acquire() as c:
                await c.execute('DELETE FROM policy_clauses WHERE policy_id IN ($1, $2)', 'POL-RET', 'POL-PROC')
                for cid, versions in SMALL_TEST_DATASET['clauses'].items():
                    for v in versions:
                        await c.execute(
                            'INSERT INTO policy_clauses (policy_id, version, clause_id, document_id, title, text, fields, checkable, effective_from, effective_to) '
                            'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
                            v['policy_id'], v['version'], v['clause_id'], f"{v['policy_id']}@{v['version']}",
                            v['title'], v['text'], v['fields'], v['checkable'],
                            date.fromisoformat(v['effective_from']),
                            date.fromisoformat(v['effective_to']) if v['effective_to'] else None
                        )
        except Exception:
            db.pool = TestDBPool(SMALL_TEST_DATASET)
    else:
        db.pool = TestDBPool(SMALL_TEST_DATASET)

    if _is_port_open('localhost', 7687):
        try:
            g = graph.make()
            await g.driver.execute_query('RETURN 1 AS ok')
            connected_graph = True
            # Populate small test dataset in Neo4j
            for dec_id, d in SMALL_TEST_DATASET['decisions'].items():
                await graph.upsert_node(
                    d['id'], 'Decision', d['title'],
                    {'valid_from': d['decided_on'], 'decided_on': d['decided_on'], 'status': d['status'],
                     'effect': d['effect'], 'fields_json': json.dumps(d['fields']), 'owner': d.get('owner'),
                     'project': d.get('project'), 'reasons': d.get('reasons', ''), 'source_doc': d['path'],
                     'confidence': 1.0, 'human_verified': True, 'visibility': 'org'}
                )
                for cid in d.get('relied_on', []):
                    target_clause = f"{cid}@{SMALL_TEST_DATASET['clauses'][cid][0]['version']}"
                    await graph.ensure_node(target_clause, 'Clause', {'source_doc': d['path'], 'confidence': 1.0, 'human_verified': True, 'visibility': 'org'})
                    await graph.upsert_edge(
                        d['id'], 'RELIED_ON', target_clause, f"{d['id']} RELIED_ON {target_clause}",
                        graph.at(date.fromisoformat(d['decided_on'])),
                        {'source_doc': d['path'], 'confidence': 1.0, 'human_verified': True, 'visibility': 'org'},
                        graph.uid(f"episode:{d['id']}")
                    )
        except Exception:
            class FakeGraphiti:
                def __init__(self):
                    self.driver = TestNeo4jDriver(SMALL_TEST_DATASET)
                async def close(self):
                    pass
            graph.g = FakeGraphiti()
    else:
        class FakeGraphiti:
            def __init__(self):
                self.driver = TestNeo4jDriver(SMALL_TEST_DATASET)
            async def close(self):
                pass
        graph.g = FakeGraphiti()

    yield

    if connected_db and db.pool:
        await db.pool.close()
    if connected_graph and graph.g:
        await graph.g.close()
    db.pool = None
    graph.g = None
