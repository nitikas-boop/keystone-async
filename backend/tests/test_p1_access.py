"""B: roles and the access filter. Unit tests of can_access, then the leak vectors from the spec against the live test
backend: counts and graph views, timelines, project history, citation sources, documents, error messages, people
cards, the audit trail, grants, relabelling, and what reaches /ask."""
import asyncio
import json

import asyncpg
import httpx
import pytest
from fastapi.testclient import TestClient

from app import access, config
from p1_util import TEST_DB, as_, get, upload

G = 'unit-org'  # the default org for the in-process unit tests (other tests move config.GROUP_ID)
OWNER = {'user_id': 'o', 'org_id': G, 'role': 'owner', 'teams': [], 'grants': []}
COMPLIANCE = {**OWNER, 'user_id': 'c', 'role': 'compliance'}
ENG = {'user_id': 'e', 'org_id': G, 'role': 'member', 'teams': ['team-eng'], 'grants': []}
OPS_LEAD = {'user_id': 'l', 'org_id': G, 'role': 'lead', 'teams': ['team-ops'], 'grants': []}
AUDITOR = {'user_id': 'a', 'org_id': G, 'role': 'auditor', 'teams': [], 'grants': [], 'audit_from': '2025-01-01',
           'audit_to': '2025-12-31'}
ORG_ITEM = {'type': 'Decision', 'id': 'D1', 'visibility': 'org', 'team': 'team-eng', 'date': '2025-03-01'}
TEAM_ITEM = {**ORG_ITEM, 'id': 'D2', 'visibility': 'team'}
SECRET = {**ORG_ITEM, 'id': 'D3', 'visibility': 'restricted'}


@pytest.fixture(autouse=True)
def default_org(monkeypatch):
    monkeypatch.setattr(config, 'GROUP_ID', G)


def test_role_matrix():
    can = access.can_access
    for item, allowed in ((ORG_ITEM, 'OCELA'), (TEAM_ITEM, 'OCEA'), (SECRET, 'OC')):
        for code, u in zip('OCELA', (OWNER, COMPLIANCE, ENG, OPS_LEAD, AUDITOR)):
            assert can(u, item) == (code in allowed), (item['id'], u['role'], u['teams'])
    assert can(None, SECRET)  # system processes (scanner, watcher) are not people
    assert not can({'role': 'anonymous', 'org_id': None}, ORG_ITEM)


def test_grants_orgs_auditors_channels():
    can = access.can_access
    assert can({**OPS_LEAD, 'grants': ['D3']}, SECRET)
    assert not can({**OWNER, 'org_id': 'org-other'}, ORG_ITEM)  # another tenant, even its owner
    assert not can(OWNER, {**ORG_ITEM, 'org_id': 'org-other'})
    assert not can(AUDITOR, {**ORG_ITEM, 'date': '2026-02-01'})  # outside the invited range
    assert not can(AUDITOR, ORG_ITEM, 'write') and can(ENG, ORG_ITEM, 'write')
    assert not can(OWNER, {'type': 'channel', 'id': '9', 'members': {'e', 'l'}})  # not even the owner reads a DM
    assert can(ENG, {'type': 'channel', 'id': '9', 'members': {'e', 'l'}})
    assert can(COMPLIANCE, {'type': 'audit_log'}) and not can(ENG, {'type': 'audit_log'})
    assert not can(AUDITOR, {'type': 'audit_log'})  # audit rows name restricted ids


def test_label_follows_project_team():
    access.PROJECT_TEAM[G] = {'Project Atlas': 'team-eng'}
    lab = access.label_for({'project': 'Project Atlas', 'visibility': 'team', 'decided_on': '2025-03-01'})
    assert lab == {'team': 'team-eng', 'project': 'Project Atlas', 'visibility': 'team', 'date': '2025-03-01'}
    assert access.label_for({})['visibility'] == 'org'
    ok = access.visible_filter(ENG)
    assert ok({'key': 'X', 'type': 'Decision', 'project': 'Project Atlas', 'visibility': 'team'})
    assert not access.visible_filter(OPS_LEAD)({'key': 'X', 'type': 'Decision', 'project': 'Project Atlas',
                                                 'visibility': 'team'})


def test_no_session_is_401(monkeypatch):
    """Outside dev mode every route but sign-in and /health needs a session, and a bad token is no session."""
    from app import db
    from app.main import app
    monkeypatch.setattr(config, 'DEV_AUTH', False)
    monkeypatch.setattr(db, 'pool', None)  # no database in-process: nothing may be resolved without a session
    c = TestClient(app)
    for path in ('/graph', '/decisions', '/audit', '/channels', '/auth/me'):
        assert c.get(path).status_code == 401, path
    assert c.get('/decisions', cookies={'ks_session': 'forged.token.value'}).status_code == 401
    assert c.get('/graph', headers={'X-User': 'nitika'}).status_code == 401  # X-User is dev-only


DOCS = {  # id: (title, visibility, project, date)
    'T-P1-ORG': ('Adopt shared on-call rota', 'org', 'Project Atlas', '2025-03-01'),
    'T-P1-TEAM': ('Engineering picks Kafka for events', 'team', 'Project Atlas', '2025-03-02'),
    'T-P1-SECRET': ('Switch payroll vendor to ConfidentialPay', 'restricted', 'Procurement', '2025-03-03'),
    'T-P1-LATE': ('Retire the legacy VPN', 'org', 'Project Atlas', '2026-02-01'),
}
SEES = {'nitika': {'T-P1-ORG', 'T-P1-TEAM', 'T-P1-SECRET', 'T-P1-LATE'},  # owner
        'farhan': {'T-P1-ORG', 'T-P1-TEAM', 'T-P1-SECRET', 'T-P1-LATE'},  # compliance
        'divya': {'T-P1-ORG', 'T-P1-TEAM', 'T-P1-LATE'},                  # engineering member
        'priya': {'T-P1-ORG', 'T-P1-LATE'},                               # operations lead
        'meera': {'T-P1-ORG', 'T-P1-TEAM'}}                               # auditor, 2025 only


@pytest.fixture(scope='module')
def labelled(api):
    for did, (title, vis, project, day) in DOCS.items():
        upload(api, did, title, vis, project, day)
    yield api


def mine(ids) -> set:
    return {i for i in ids if i in DOCS}


def test_every_read_view_obeys_the_filter(labelled):
    api = labelled
    for user, sees in SEES.items():
        assert mine(d['id'] for d in get(api, '/decisions', user, as_of='2026-06-01').json()) == sees, user
        g = get(api, '/graph', user, as_of='2026-06-01').json()
        assert mine(n['id'] for n in g['nodes']) == sees, user
        assert not {e['source'] for e in g['edges']} & (set(DOCS) - sees), user
        v = get(api, '/graph/view', user, as_of='2026-06-01', include_restricted='true').json()
        assert mine(n['id'] for n in v['nodes'] if not n.get('locked')) == sees, user  # include_restricted opens nothing
        locked = [n for n in v['nodes'] if n.get('locked')]
        # an employee (member) sees hidden decisions as locked placeholders: id only, no title, no edges
        assert mine(n['id'] for n in locked) == (set(DOCS) - sees if user == 'divya' else set()), user
        assert all(n['label'].endswith('(locked)') for n in locked) and not {e['source'] for e in v['edges']} & mine(n['id'] for n in locked)
        events = ' '.join(e['event'] for e in get(api, '/timeline', user, include_restricted='true').json())
        assert {d for d in DOCS if d in events} == sees, user
        atlas = get(api, '/projects/prj-atlas/timeline', user).json()
        assert mine(d['id'] for d in atlas['decisions']) == sees - {'T-P1-SECRET'}, user
        for did in DOCS:
            src, doc = get(api, f'/nodes/{did}/source', user), get(api, f'/documents/{did}', user)
            # opening a hidden node: an employee is told who to ask (403, audited); anyone else sees plain 404
            hidden = 403 if user == 'divya' else 404
            assert (src.status_code, doc.status_code) == ((200, 200) if did in sees else (hidden, 404)), (user, did)
            if did not in sees:  # the same answer as for an id that does not exist: no hint something is hidden
                assert doc.json() == get(api, '/documents/T-P1-NOPE', user).json()


def test_people_card_shows_only_visible_decisions(labelled):
    card = lambda viewer: {d['id'] for d in get(labelled, '/people/divya', viewer).json()['decisions']}
    assert mine(card('nitika')) == SEES['nitika'] and mine(card('priya')) == SEES['priya']


def test_audit_log_is_owner_and_compliance_only_and_restricted_views_are_logged(labelled):
    """CEO (and the admin account) and the Compliance Lead read the whole chain; everyone else only their own rows."""
    for user in ('nitika', 'farhan'):
        assert len({r['actor'] for r in get(labelled, '/audit', user, limit=500).json()}) > 1, user
    for user in ('priya', 'meera', 'karthik'):
        r = get(labelled, '/audit', user, limit=500)
        assert r.status_code == 200 and {x['actor'] for x in r.json()} <= {f'user:{user}', f'user:{user}:mcp'}, user
        assert get(labelled, '/audit/verify', user).status_code == 403, user

    async def last_view():
        c = await asyncpg.connect(TEST_DB)
        try:
            return await c.fetchrow("SELECT * FROM audit_log WHERE action = 'restricted_view' ORDER BY id DESC LIMIT 1")
        finally:
            await c.close()
    get(labelled, '/documents/T-P1-SECRET', 'farhan')
    row = asyncio.run(last_view())
    assert (row['actor'], row['object_id']) == ('user:farhan', 'T-P1-SECRET')


def test_grant_then_revoke(labelled):
    api = labelled
    r = httpx.post(f'{api}/access/grants', json={'user_id': 'priya', 'resource_id': 'T-P1-SECRET'},
                   headers=as_('nitika'))
    assert r.status_code == 201, r.text
    assert 'T-P1-SECRET' in mine(d['id'] for d in get(api, '/decisions', 'priya', as_of='2026-06-01').json())
    assert httpx.post(f'{api}/access/grants', json={'user_id': 'priya', 'resource_id': 'X'},
                      headers=as_('priya')).status_code == 403  # only the owner grants
    assert httpx.delete(f"{api}/access/grants/{r.json()['id']}", headers=as_('nitika')).status_code == 200
    assert 'T-P1-SECRET' not in mine(d['id'] for d in get(api, '/decisions', 'priya', as_of='2026-06-01').json())


def test_relabel_moves_a_source_and_its_nodes(labelled):
    api = labelled
    r = httpx.patch(f'{api}/access/labels/T-P1-ORG', json={'visibility': 'restricted'}, headers=as_('nitika'))
    assert r.status_code == 200 and 'T-P1-ORG' in r.json()['nodes'], r.text
    assert get(api, '/documents/T-P1-ORG', 'divya').status_code == 404
    assert 'T-P1-ORG' not in mine(d['id'] for d in get(api, '/decisions', 'divya', as_of='2026-06-01').json())
    httpx.patch(f'{api}/access/labels/T-P1-ORG', json={'visibility': 'org'}, headers=as_('nitika'))
    assert get(api, '/documents/T-P1-ORG', 'divya').status_code == 200


def test_hidden_nodes_never_reach_ask(labelled):
    """Filtering happens at retrieval: a member's /ask about a restricted decision carries no trace of it anywhere
    in the response (answer, citations, subgraph, retrieval scores)."""
    q = {'question': 'Why did we switch the payroll vendor to ConfidentialPay?', 'as_of': '2026-06-01'}
    owner = httpx.post(f'{labelled}/ask', json=q, headers=as_('farhan'), timeout=600)
    assert owner.status_code == 200 and 'T-P1-SECRET' in json.dumps(owner.json()), owner.text  # control: retrievable
    r = httpx.post(f'{labelled}/ask', json=q, headers=as_('priya'), timeout=600)
    assert r.status_code == 200, r.text
    assert r.json()['refused'] and 'T-P1-SECRET' not in json.dumps(r.json())


def test_members_cannot_approve_decisions_or_policies(api):
    """Approving review-queue proposals and extracted decisions/policies needs a lead, compliance or the owner."""
    for path in ('/proposals/999999/approve', '/proposals/999999/reject', '/extractions/999999/accept',
                 '/extractions/999999/reject'):
        for user in ('divya', 'sneha'):
            r = httpx.post(f'{api}{path}', headers=as_(user))
            assert r.status_code == 403 and 'members cannot approve' in r.json()['detail'], (path, user)
        for user in ('priya', 'farhan', 'nitika'):  # allowed to try; the item just does not exist
            assert httpx.post(f'{api}{path}', headers=as_(user)).status_code == 404, (path, user)
