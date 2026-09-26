import asyncio

import asyncpg
import pytest
from neo4j import GraphDatabase

from app import config


def _wipe_smoke():
    with GraphDatabase.driver(config.NEO4J_URI, auth=(config.NEO4J_USER, config.NEO4J_PASSWORD)) as d:
        d.execute_query("MATCH (n) WHERE n.key STARTS WITH 'SMOKE' OR n.name STARTS WITH 'SMOKE' DETACH DELETE n")

    async def pg():
        c = await asyncpg.connect(config.DATABASE_URL)
        await c.execute("DELETE FROM documents WHERE id LIKE 'SMOKE%'")
        await c.close()
    asyncio.run(pg())


@pytest.fixture
def smoke_cleanup():
    _wipe_smoke()
    yield
    _wipe_smoke()
