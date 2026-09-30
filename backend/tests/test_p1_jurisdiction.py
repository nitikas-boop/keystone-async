"""B, jurisdiction: an employee with assigned projects (Aarav Mehta, Project Atlas) sees only that project's items,
their department's policies and the org chart. Hidden decisions show as locked graph nodes; opening one, or asking
/ask about something outside the jurisdiction, says which lead to ask and writes ACCESS_DENIED_ATTEMPT.
Approval authority caps what a person may upload or accept."""
import asyncio

import asyncpg
import httpx
import pytest

from app import access
from conftest import wipe
from p1_util import TEST_DB, as_, get, upload

AARAV = {'user_id': 'aarav', 'org_id': 'u', 'role': 'member', 'teams': ['team-eng'], 'grants': [],
         'assigned_projects': ['Project Atlas']}


def test_in_jurisdiction_unit(monkeypatch):
    assert access.in_jurisdiction(AARAV, {'type': 'Decision', 'project': 'Project Atlas'})
    assert not access.in_jurisdiction(AARAV, {'type': 'Decision', 'project': 'Procurement'})
    assert access.in_jurisdiction(AARAV, {'type': 'Person'})                      # the org chart is public
    assert access.in_jurisdiction(AARAV, {'type': 'PolicyVersion', 'team': 'team-eng'})  # own department's policy
    assert not access.in_jurisdiction(AARAV, {'type': 'PolicyVersion', 'team': 'team-ops'})
    assert not access.in_jurisdiction(AARAV, {'type': 'MeetingNote'})            # tied to no project or department
    # No assignment: the department's projects (Rohit, engineer: Engineering's, never Operations' Procurement).
    monkeypatch.setitem(access.PROJECT_TEAM, 'u', {'Project Atlas': 'team-eng', 'Internal Ops': 'team-eng',
                                                   'Procurement': 'team-ops'})
    plain = {**AARAV, 'assigned_projects': []}
    assert access.in_jurisdiction(plain, {'type': 'Decision', 'project': 'Internal Ops'})
    assert not access.in_jurisdiction(plain, {'type': 'Decision', 'project': 'Procurement'})
    assert not access.in_jurisdiction({**plain, 'teams': []}, {'type': 'Decision', 'project': 'Project Atlas'})
    assert access.in_jurisdiction({**AARAV, 'role': 'lead'}, {'type': 'MeetingNote'})


def _audit(action: str, after: int = 0):
    async def go():
        c = await asyncpg.connect(TEST_DB)
        try:
            return await c.fetch('SELECT * FROM audit_log WHERE action = $1 AND id > $2 ORDER BY id DESC', action, after)
        finally:
            await c.close()
    return asyncio.run(go())


@pytest.fixture(scope='module')
def scoped(api):
    wipe()
    upload(api, 'T-J-ATLAS', 'Adopt blue-green deploys', project='Project Atlas', day='2025-04-01')
    upload(api, 'T-J-PROC', 'Sign the Zorbex vendor contract', project='Procurement', day='2025-04-02',
           fields='{amount_inr: 300000, approver_role: CTO}')
    upload(api, 'T-J-OPS', 'Nightly restore drill', project='Internal Ops', day='2025-04-03')
    yield api
    wipe()


def test_employee_sees_only_the_assigned_project(scoped):
    api = scoped
    me = get(api, '/auth/me', 'aarav').json()
    assert me['assigned_projects'] == ['Project Atlas'] and me['department'] == 'Engineering'
    assert me['approval_authority_inr'] == 0 and me['role'] == 'member'
    mine = {d['id'] for d in get(api, '/decisions', 'aarav').json()}
    assert mine == {'T-J-ATLAS'}  # Internal Ops is his department's project, but not assigned to him
    # No assignment: the department's projects. Divya (Engineering) sees Atlas and Internal Ops, never Procurement.
    divya = {d['id'] for d in get(api, '/decisions', 'divya').json()}
    assert divya >= {'T-J-ATLAS', 'T-J-OPS'} and 'T-J-PROC' not in divya
    assert {d['id'] for d in get(api, '/decisions', 'priya').json()} >= {'T-J-ATLAS', 'T-J-PROC', 'T-J-OPS'}  # a lead
    g = get(api, '/graph', 'aarav').json()
    assert {n['id'] for n in g['nodes'] if n['type'] == 'Decision'} == {'T-J-ATLAS'}
    view = get(api, '/graph/view', 'aarav').json()
    locked = {n['id'] for n in view['nodes'] if n.get('locked')}
    assert {'T-J-PROC', 'T-J-OPS'} <= locked and 'T-J-ATLAS' not in locked
    assert not any('Zorbex' in n['label'] for n in view['nodes'])  # locked nodes carry no title
    assert all(e['source'] not in locked and e['target'] not in locked for e in view['edges'])


def test_locked_node_names_the_lead_and_is_audited(scoped):
    r = get(scoped, '/nodes/T-J-PROC/source', 'aarav')
    assert r.status_code == 403
    d = r.json()['detail']
    assert d['restricted'] and d['node'] == 'T-J-PROC' and d['contact']['user_id'] == 'priya'  # Procurement's lead
    assert 'Engineering / Junior Software Engineer' in d['message'] and 'Zorbex' not in str(d)
    row = _audit('ACCESS_DENIED_ATTEMPT')[0]  # user, resource, where from and when; the reason is in the hashed payload
    assert (row['actor'], row['object_id'], row['object_type']) == ('user:aarav', 'T-J-PROC', 'node') and row['ts']
    assert get(scoped, '/documents/T-J-PROC', 'aarav').status_code == 404


def test_ask_outside_jurisdiction_is_refused_with_the_contact(scoped):
    before = max([r['id'] for r in _audit('ACCESS_DENIED_ATTEMPT')] or [0])
    r = httpx.post(f'{scoped}/ask', json={'question': 'Why did we sign the Zorbex contract?', 'as_of': '2025-06-01'},
                   headers=as_('aarav'), timeout=600).json()
    assert r['refused'] and r['restricted'], r
    assert r['answer'].startswith('Access restricted') and 'Priya Menon' in r['answer'] and 'Zorbex' not in r['answer']
    assert r['citations'] == [] and r['subgraph'] == {'nodes': [], 'edges': []}
    rows = _audit('ACCESS_DENIED_ATTEMPT', before)
    assert [(x['actor'], x['object_id'], x['object_type']) for x in rows] == [('user:aarav', 'T-J-PROC', 'question')]
    # an engineer with no assigned project is limited to Engineering's projects: refused the same way
    eng = httpx.post(f'{scoped}/ask', json={'question': 'Why did we sign the Zorbex contract?', 'as_of': '2025-06-01'},
                     headers=as_('rohit'), timeout=600).json()
    assert eng['refused'] and eng['restricted'] and eng['citations'] == [] and 'Zorbex' not in eng['answer'], eng
    # the same question from someone who may see it is answered, not refused
    ok = httpx.post(f'{scoped}/ask', json={'question': 'Why did we sign the Zorbex contract?', 'as_of': '2025-06-01'},
                    headers=as_('priya'), timeout=600).json()  # the Ops lead: Procurement is her department's
    assert not ok.get('restricted')


def test_approval_authority(scoped):
    over = '---\ndoc_type: decision\ndecision_id: T-J-BIG\ntitle: Buy a big thing\ndecided_on: 2025-05-01\n' \
           'owner: p-divya\nproject: Project Atlas\nvisibility: org\nstatus: active\neffect: completed\n' \
           'fields: {amount_inr: 50000}\nreasons: test\n---\ntest\n'
    r = httpx.post(f'{scoped}/documents', files={'file': ('decisions/T-J-BIG.md', over.encode())},
                   headers=as_('aarav'), timeout=600)
    assert r.status_code == 403 and 'approval authority' in r.json()['detail']
    assert get(scoped, '/policies', 'aarav').json() == [] or all(
        p['policy_id'] not in ('POL-PROC', 'POL-RET') for p in get(scoped, '/policies', 'aarav').json())
