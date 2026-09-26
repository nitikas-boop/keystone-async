"""Audit log guarantees, against the live keystone_test database as the app role."""
import asyncio
import os

import asyncpg
import pytest

from app import db

URL = os.environ['TEST_DATABASE_URL']


async def _run(fn):
    await db.connect(URL)
    try:
        return await fn()
    finally:
        await db.pool.close()


def test_chain_links_and_hashes_recompute():
    async def go():
        for i in range(3):
            await db.audit('user:nitika', 'query', 'answer', f'test-{i}', ['DEC-004'], {'i': i})
        rows = await db.pool.fetch('SELECT * FROM audit_log ORDER BY id')
        assert rows[0]['prev_hash'] == '0' * 64
        for prev, row in zip(rows, rows[1:]):
            assert row['prev_hash'] == prev['hash']
        for row in rows:
            assert db.row_hash(row) == row['hash'], f'row {row["id"]} hash mismatch'
    asyncio.run(_run(go))


@pytest.mark.parametrize('sql', ["UPDATE audit_log SET actor='user:mallory'",
                                 'DELETE FROM audit_log',
                                 'TRUNCATE audit_log'])
def test_app_role_cannot_rewrite(sql):
    async def go():
        c = await asyncpg.connect(URL)
        try:
            with pytest.raises(asyncpg.InsufficientPrivilegeError):
                await c.execute(sql)
        finally:
            await c.close()
    asyncio.run(go())


def test_app_cannot_forge_chain_fields():
    async def go():
        row = await db.pool.fetchrow(
            "INSERT INTO audit_log (actor, action, object_type, object_id, payload_hash, prev_hash, hash) "
            "VALUES ('executor','executed','proposal','x',$1,'forged','forged') RETURNING *", 'a' * 64)
        assert row['prev_hash'] != 'forged' and row['hash'] == db.row_hash(row)
    asyncio.run(_run(go))
