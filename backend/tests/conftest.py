"""Tests run against a second backend instance (port 8001) wired to the keystone_test database and a separate
graph partition, so they exercise the real stack without writing into the demo graph or the demo audit chain."""
import asyncio
import os
import subprocess
import sys
import time

import asyncpg
import httpx
import pytest
from neo4j import GraphDatabase

from app import config, db, graph, ingest

TEST_GROUP = 'keystone-test'
TEST_ENV = {**os.environ, 'DATABASE_URL': os.environ.get('TEST_DATABASE_URL', 'postgresql://keystone_test:keystone_test_dev@localhost:5433/keystone_test'), 'GROUP_ID': TEST_GROUP,
            'VAULT_DIR': '/tmp/keystone-test-vault', 'OUTBOX_DIR': '/tmp/keystone-test-outbox',
            'KEYSTONE_DIR': '/tmp/keystone-test-scan', 'AUDIO_DIR': '/tmp/keystone-test-audio'}


TEST_POLICIES = [
    ('data/vault/policies/POL-RET-v1.md', '''---
doc_type: policy_version
policy_id: POL-RET
version: v1
title: Customer log retention
effective_from: 2024-01-15
clauses:
  - clause_id: RET-2.1
    title: Customer log retention
    text: "Customer activity logs shall be retained for no longer than 365 days."
    fields: {retention_days_max: 365}
    checkable: true
---
Customer log retention v1.
'''),
    ('data/vault/policies/POL-RET-v2.md', '''---
doc_type: policy_version
policy_id: POL-RET
version: v2
title: Customer log retention
effective_from: 2025-01-06
clauses:
  - clause_id: RET-2.1
    title: Customer log retention
    text: "Customer activity logs shall be retained for no longer than 180 days."
    fields: {retention_days_max: 180}
    checkable: true
---
Customer log retention v2.
'''),
    ('data/vault/policies/POL-RET-v3.md', '''---
doc_type: policy_version
policy_id: POL-RET
version: v3
title: Customer log retention
effective_from: 2026-09-28
clauses:
  - clause_id: RET-2.1
    title: Customer log retention
    text: "Customer activity logs shall be retained for no longer than 90 days."
    fields: {retention_days_max: 90}
    checkable: true
---
Customer log retention v3.
'''),
    ('data/vault/policies/POL-PROC-v1.md', '''---
doc_type: policy_version
policy_id: POL-PROC
version: v1
title: Procurement threshold
effective_from: 2024-01-15
clauses:
  - clause_id: PROC-3.1
    title: Procurement threshold
    text: "Expenditures over threshold require executive approval."
    fields: {approver_threshold_inr: {CTO: 500000, CEO: null}}
    checkable: true
---
Procurement threshold v1.
'''),
    ('data/vault/policies/POL-PROC-v2.md', '''---
doc_type: policy_version
policy_id: POL-PROC
version: v2
title: Procurement threshold
effective_from: 2025-07-01
clauses:
  - clause_id: PROC-3.1
    title: Procurement threshold
    text: "Expenditures over threshold require executive approval."
    fields: {approver_threshold_inr: {CTO: 200000, CEO: null}}
    checkable: true
---
Procurement threshold v2.
'''),
]

TEST_DECISIONS = [
    ('data/vault/decisions/DEC-003.md', '''---
doc_type: decision
decision_id: DEC-003
title: Start Project Atlas
decided_on: 2024-11-10
owner: p-ananya
project: Atlas
status: active
effect: ongoing
fields: {}
relied_on: []
---
Start Project Atlas.
'''),
    ('data/vault/decisions/DEC-004.md', '''---
doc_type: decision
decision_id: DEC-004
title: Approve VendorCo contract
decided_on: 2025-03-14
owner: p-vikram
project: Atlas
status: active
effect: completed
fields: {amount_inr: 400000, approver_role: CTO}
relied_on: [PROC-3.1]
---
Approve VendorCo contract.
'''),
    ('data/vault/decisions/DEC-006.md', '''---
doc_type: decision
decision_id: DEC-006
title: Migrate Project Atlas from AWS to local provider
decided_on: 2025-05-20
owner: p-vikram
project: Atlas
status: active
effect: ongoing
reasons: Data residency and cost concerns
fields: {}
relied_on: []
---
Migrate Project Atlas from AWS to local provider.
'''),
    ('data/vault/decisions/DEC-007.md', '''---
doc_type: decision
decision_id: DEC-007
title: Reduce customer log retention to 180 days
decided_on: 2025-06-18
owner: p-ananya
project: Atlas
status: active
effect: ongoing
fields: {retention_days: 180}
relied_on: [RET-2.1]
---
Reduce customer log retention to 180 days.
'''),
    ('data/vault/decisions/DEC-010.md', '''---
doc_type: decision
decision_id: DEC-010
title: Project Atlas Phase 2
decided_on: 2026-04-15
owner: p-ananya
project: Atlas
status: active
effect: ongoing
fields: {}
relied_on: []
---
Project Atlas Phase 2.
'''),
]


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

    # Pre-clean test graph partition and database tables
    with GraphDatabase.driver(config.NEO4J_URI, auth=(config.NEO4J_USER, config.NEO4J_PASSWORD)) as d:
        d.execute_query('MATCH (n {group_id: $g}) DETACH DELETE n', g=TEST_GROUP)

    async with db.pool.acquire() as c:
        await c.execute('DELETE FROM proposals; DELETE FROM flags; DELETE FROM extractions; DELETE FROM answers; '
                        'DELETE FROM chunks; DELETE FROM policy_clauses; DELETE FROM documents;')

    from pathlib import Path
    vault_dir = Path('/vault') if Path('/vault').exists() else (Path(__file__).parents[2] / 'data' / 'vault')

    policy_files = [
        'policies/POL-PROC-v1.md', 'policies/POL-PROC-v2.md',
        'policies/POL-RET-v1.md', 'policies/POL-RET-v2.md',
    ]
    decision_files = [
        'decisions/DEC-003.md', 'decisions/DEC-004.md', 'decisions/DEC-006.md',
        'decisions/DEC-007.md', 'decisions/DEC-010.md',
    ]

    for f in policy_files:
        p = vault_dir / f
        assert p.exists(), f'test data missing: {p}'  # fail loudly, never test against a half-loaded graph
        await ingest.ingest(p.read_text(encoding='utf-8'), f, 'user:nitika')

    v3_path = vault_dir.parent / 'demo-upload' / 'POL-RET-v3.md'  # /demo-upload in Docker, data/demo-upload locally
    assert v3_path.exists(), f'test data missing: {v3_path}'
    await ingest.ingest(v3_path.read_text(encoding='utf-8'), 'demo-upload/POL-RET-v3.md', 'user:nitika')

    for f in decision_files:
        p = vault_dir / f
        assert p.exists(), f'test data missing: {p}'
        await ingest.ingest(p.read_text(encoding='utf-8'), f, 'user:nitika')

    yield

    # Clean up test dataset afterwards
    with GraphDatabase.driver(config.NEO4J_URI, auth=(config.NEO4J_USER, config.NEO4J_PASSWORD)) as d:
        d.execute_query('MATCH (n {group_id: $g}) DETACH DELETE n', g=TEST_GROUP)

    if db.pool:
        async with db.pool.acquire() as c:
            await c.execute('DELETE FROM proposals; DELETE FROM flags; DELETE FROM extractions; DELETE FROM answers; '
                            'DELETE FROM chunks; DELETE FROM policy_clauses; DELETE FROM documents;')
        await db.pool.close()
    if graph.g:
        await graph.g.close()
    db.pool = None
    graph.g = None


# Alias for backward compatibility if any test references test_graph
test_graph = nimbus_test_graph
