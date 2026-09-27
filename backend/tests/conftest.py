"""Tests run against a second backend instance (port 8001) wired to the keystone_test database and a separate
graph partition, so they exercise the real stack without writing into the demo graph or the demo audit chain."""
import asyncio
import json
import os
import subprocess
import sys
import time
from datetime import date

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


def wipe():
    with GraphDatabase.driver(config.NEO4J_URI, auth=(config.NEO4J_USER, config.NEO4J_PASSWORD)) as d:
        d.execute_query('MATCH (n {group_id: $g}) DETACH DELETE n', g=TEST_GROUP)

    async def pg():
        test_db = os.environ.get('TEST_DATABASE_URL', 'postgresql://keystone_test:keystone_test_dev@localhost:5433/keystone_test')
        c = await asyncpg.connect(test_db)
        await c.execute('DELETE FROM proposals; DELETE FROM flags; DELETE FROM extractions; DELETE FROM answers; '
                        'DELETE FROM policy_clauses; DELETE FROM documents;')  # audit_log is append-only by design
        await c.close()
    asyncio.run(pg())


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


@pytest.fixture
async def nimbus_test_graph():
    """Initializes the database and Neo4j test graph partition with the deterministic test dataset (opt-in)."""
    test_db = os.environ.get('TEST_DATABASE_URL', 'postgresql://keystone_test:keystone_test_dev@localhost:5433/keystone_test')
    config.GROUP_ID = TEST_GROUP

    await db.connect(test_db)
    graph.make()

    # Pre-clean test graph partition and policy clauses
    with GraphDatabase.driver(config.NEO4J_URI, auth=(config.NEO4J_USER, config.NEO4J_PASSWORD)) as d:
        d.execute_query('MATCH (n {group_id: $g}) DETACH DELETE n', g=TEST_GROUP)

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

    yield

    # Clean up test dataset afterwards
    with GraphDatabase.driver(config.NEO4J_URI, auth=(config.NEO4J_USER, config.NEO4J_PASSWORD)) as d:
        d.execute_query('MATCH (n {group_id: $g}) DETACH DELETE n', g=TEST_GROUP)

    if db.pool:
        async with db.pool.acquire() as c:
            await c.execute('DELETE FROM policy_clauses WHERE policy_id IN ($1, $2)', 'POL-RET', 'POL-PROC')
        await db.pool.close()
    if graph.g:
        await graph.g.close()
    db.pool = None
    graph.g = None


# Alias for backward compatibility if any test references test_graph
test_graph = nimbus_test_graph
