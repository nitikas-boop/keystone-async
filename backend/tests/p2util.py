"""Shared helpers for Person 2's tests (test_p2_*.py): throwaway T- documents on the isolated test backend."""
import asyncio
import os

import asyncpg
import httpx

TEST_DB = os.environ.get('TEST_DATABASE_URL', 'postgresql://keystone_app:keystone_app_dev@postgres:5432/keystone_test')


def H(user: str) -> dict:
    return {'X-User': user}


def p2_wipe():
    async def go():
        c = await asyncpg.connect(TEST_DB)
        try:
            await c.execute(f'DELETE FROM collisions; DELETE FROM policy_proposals; DELETE FROM claims; '
                            f'DELETE FROM simulations; DELETE FROM transcripts; DELETE FROM audio_sources; '
                            f'DELETE FROM file_index; DELETE FROM scan_runs;')
        finally:
            await c.close()
    asyncio.run(go())


def sql(query: str, *args):
    async def go():
        c = await asyncpg.connect(TEST_DB)
        try:
            return await c.fetch(query, *args)
        finally:
            await c.close()
    return asyncio.run(go())


def post_doc(api, name, text, user='priya'):
    r = httpx.post(f'{api}/documents', files={'file': (name, text.encode())}, headers=H(user), timeout=600)
    assert r.status_code == 201, r.text
    return r.json()


POLICY = '''---
doc_type: policy_version
policy_id: {pid}
version: {v}
title: Test retention policy
effective_from: {day}
clauses:
  - clause_id: {cid}
    title: Test log retention
    text: "Test activity logs shall be retained for no longer than {n} days."
    fields: {{retention_days_max: {n}}}
    checkable: true
---
Test retention policy {v}.
'''

DECISION = '''---
doc_type: decision
decision_id: {did}
title: {title}
decided_on: {day}
owner: {owner}
project: Project Tango
visibility: {vis}
relied_on: [{cid}]
status: active
effect: {effect}
fields: {{retention_days: {days}}}
reasons: Test reason.
---
{did} body.
'''


def audit_actions(api, since_id: int) -> list[dict]:
    return [a for a in httpx.get(f'{api}/audit', params={'after_id': since_id, 'limit': 500}).json()]


def last_audit_id(api) -> int:
    rows = sql('SELECT coalesce(max(id), 0) AS m FROM audit_log')
    return rows[0]['m']
