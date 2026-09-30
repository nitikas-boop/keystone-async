"""Helpers for the Person 1 tests (test_p1_*.py). The test backend runs with KEYSTONE_DEV_AUTH=1, so a test signs in
as a seeded demo user with the X-User header; the real cookie and Bearer sessions are exercised explicitly."""
import os
import secrets

import httpx

from app import config

PW = config.DEMO_PASSWORD
TEST_DB = os.environ.get('TEST_DATABASE_URL', 'postgresql://keystone_test:keystone_test_dev@localhost:5433/keystone_test')
DECISION = '''---
doc_type: decision
decision_id: {did}
title: {title}
decided_on: {day}
owner: {owner}
project: {project}
visibility: {vis}
status: active
effect: ongoing
fields: {fields}
reasons: {reason}
---
{reason}
'''


def as_(user: str) -> dict:
    return {'X-User': user}


def uniq(prefix: str) -> str:
    return f'{prefix}{secrets.token_hex(3)}'


def upload(api: str, did: str, title: str, vis: str = 'org', project: str = 'Project Atlas', day: str = '2025-03-01',
           owner: str = 'p-divya', fields: str = '{}', reason: str = 'A test decision.'):
    md = DECISION.format(did=did, title=title, day=day, owner=owner, project=project, vis=vis, fields=fields,
                         reason=reason)
    r = httpx.post(f'{api}/documents', files={'file': (f'decisions/{did}.md', md.encode())}, headers=as_('nitika'),
                   timeout=600)
    assert r.status_code == 201, r.text
    return r.json()


def get(api: str, path: str, user: str, **params):
    return httpx.get(f'{api}{path}', headers=as_(user), params=params, timeout=120)


def login(api: str, employee_id: str, password: str = PW, **extra) -> httpx.Response:
    return httpx.post(f'{api}/auth/login', json={'employee_id': employee_id, 'password': password, **extra}, timeout=60)
