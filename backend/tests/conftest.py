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

from app import config

TEST_GROUP = 'keystone-test'
TEST_ENV = {**os.environ, 'DATABASE_URL': os.environ.get('TEST_DATABASE_URL', 'postgresql://keystone_test:keystone_test_dev@localhost:5433/keystone_test'), 'GROUP_ID': TEST_GROUP,
            'VAULT_DIR': '/tmp/keystone-test-vault', 'OUTBOX_DIR': '/tmp/keystone-test-outbox'}


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
