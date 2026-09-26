import hashlib
import json
from datetime import timezone

import asyncpg

from . import config

pool: asyncpg.Pool | None = None


async def _init(conn):
    await conn.set_type_codec('jsonb', encoder=json.dumps, decoder=json.loads, schema='pg_catalog')


async def connect(url: str = config.DATABASE_URL) -> asyncpg.Pool:
    global pool
    pool = await asyncpg.create_pool(url, init=_init)
    return pool


def canonical_json(obj) -> str:
    """Byte-identical to Postgres jsonb::text, which is what the audit trigger hashes."""
    if isinstance(obj, dict):
        items = sorted(obj.items(), key=lambda kv: (len(kv[0].encode()), kv[0].encode()))
        return '{' + ', '.join(f'{json.dumps(k, ensure_ascii=False)}: {canonical_json(v)}' for k, v in items) + '}'
    if isinstance(obj, (list, tuple)):
        return '[' + ', '.join(canonical_json(v) for v in obj) + ']'
    return json.dumps(obj, ensure_ascii=False, default=str)


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


async def audit(actor: str, action: str, object_type: str, object_id: str,
                source_ids: list[str], payload, conn=None) -> asyncpg.Record:
    """Append one audit row. prev_hash/hash/ts are set by the DB trigger, not here."""
    async def _write(c):
        # Same lock the trigger takes; held before INSERT so the bigserial id is drawn in chain order.
        await c.execute("SELECT pg_advisory_xact_lock(hashtext('audit_log'))")
        return await c.fetchrow(
            'INSERT INTO audit_log (actor, action, object_type, object_id, source_ids, payload_hash) '
            'VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            actor, action, object_type, object_id, source_ids, sha256_hex(canonical_json(payload)))

    if conn is not None:
        return await _write(conn)
    async with pool.acquire() as c, c.transaction():
        return await _write(c)


def row_hash(row) -> str:
    """Recompute a row's hash independently of the trigger (used by tests; basis for verify_chain later)."""
    return sha256_hex(canonical_json({
        'id': row['id'],
        'ts': row['ts'].astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%fZ'),
        'actor': row['actor'],
        'action': row['action'],
        'object_type': row['object_type'],
        'object_id': row['object_id'],
        'source_ids': list(row['source_ids']),
        'payload_hash': row['payload_hash'],
        'prev_hash': row['prev_hash'],
    }))
