"""A: registering an org, joining with a code (pending until approved), the join-code rules, cookie sessions,
tenant isolation, removal, and agent (MCP) sessions that can read but never approve."""
import asyncio

import asyncpg
import httpx

from app import identity
from p1_util import PW, TEST_DB, as_, login, uniq


def test_join_codes_are_unambiguous():
    for _ in range(200):
        c = identity.new_code()
        assert len(c) == 8 and not set(c) & set('0O1Il')
    assert identity.normalise_code(' nmbl-7k2q ') == 'NMBL7K2Q'
    assert identity.normalise_code('NMBL-7K2O') is None and identity.normalise_code('SHORT') is None


def _sql(q, *a):
    async def go():
        c = await asyncpg.connect(TEST_DB)
        try:
            return await c.fetch(q, *a)
        finally:
            await c.close()
    return asyncio.run(go())


def register(api):
    emp = uniq('own-')
    r = httpx.post(f'{api}/auth/register', json={'org_name': 'Acme Test', 'employee_id': emp, 'password': PW,
                                                 'display_name': 'Asha Owner'})
    assert r.status_code == 201, r.text
    return r, emp


def join(api, code, emp=None):
    return httpx.post(f'{api}/auth/join', json={'join_code': code, 'employee_id': emp or uniq('emp-'), 'password': PW,
                                                'display_name': 'Dev Joiner'})


def test_register_join_approve_login(api):
    r, _ = register(api)
    owner = httpx.Client(base_url=api, cookies=r.cookies)
    org, code = r.json()['org_id'], r.json()['join_code']
    me = owner.get('/auth/me').json()
    assert (me['role'], me['designation']) == ('owner', 'CEO')  # registering makes you the CEO, an executive
    assert owner.get('/me/permissions').json()['tier'] == 'executive'
    assert identity.normalise_code(code) not in str(_sql('SELECT * FROM organizations WHERE id = $1', org))  # hashed
    assert _sql('SELECT join_code_hash FROM organizations WHERE id = $1', org)[0][0] == \
        identity.sha(identity.normalise_code(code))

    emp = uniq('emp-')
    j = join(api, code.lower(), emp)
    assert j.status_code == 201 and j.json()['status'] == 'pending', j.text
    uid = j.json()['user_id']
    assert login(api, emp).status_code == 403  # pending: no session, sees nothing
    pending = owner.get('/org/members', params={'status': 'pending'}).json()
    assert [m['user_id'] for m in pending] == [uid]
    assert pending[0]['designation'] is None  # a joiner cannot name their own designation
    assert owner.post(f'/org/members/{uid}/approve', json={'role': 'member', 'designation': 'Engineer'}).status_code == 200
    s = login(api, emp)
    assert s.status_code == 200 and s.json()['org_id'] == org and s.json()['designation'] == 'Engineer'
    assert owner.patch(f'/org/members/{uid}', json={'designation': 'Analyst'}).status_code == 200
    assert httpx.Client(base_url=api, cookies=s.cookies).get('/auth/me').json()['designation'] == 'Analyst'
    acts = {r['action'] for r in _sql("SELECT action FROM audit_log WHERE object_id = $1", uid)}
    assert {'join_requested', 'join_approved'} <= acts

    # Tenant isolation: the new org's graph partition is empty and the Nimbus Ledger records are not reachable.
    member = httpx.Client(base_url=api, cookies=s.cookies)
    assert member.get('/graph').json()['nodes'] == []
    assert member.get('/decisions').json() == []
    assert member.get('/documents/DEC-004').status_code == 404
    assert member.get('/flags').json() == [] and member.get('/proposals').json() == []

    # Removal takes effect on the next request.
    assert owner.patch(f'/org/members/{uid}', json={'status': 'removed'}).status_code == 200
    assert member.get('/auth/me').status_code == 401 and member.get('/decisions').status_code == 401


def test_code_rules(api):
    r, _ = register(api)
    owner = httpx.Client(base_url=api, cookies=r.cookies)
    code = r.json()['join_code']
    bad = 'invalid or expired join code'
    assert owner.patch('/org/code', json={'disabled': True}).status_code == 200
    assert join(api, code).json()['detail'] == bad
    new = owner.post('/org/code/rotate', json={'max_uses': 1}).json()['join_code']
    assert join(api, code).json()['detail'] == bad  # the old code stopped working
    assert join(api, new).status_code == 201
    assert join(api, new).json()['detail'] == bad  # max uses reached
    newer = owner.post('/org/code/rotate', json={'expires_in_hours': 1}).json()['join_code']
    _sql("UPDATE organizations SET code_expires_at = now() - interval '1 minute' WHERE id = $1", r.json()['org_id'])
    assert join(api, newer).json()['detail'] == bad
    assert {'code_rotated', 'code_changed'} <= {x['action'] for x in _sql(
        'SELECT action FROM audit_log WHERE object_id = $1', r.json()['org_id'])}
    member = as_('priya')  # a Nimbus lead cannot rotate anything
    assert httpx.post(f'{api}/org/code/rotate', headers=member).status_code == 403


def test_seeded_login_and_logout(api):
    s = login(api, 'NL-004')
    assert s.status_code == 200 and s.json()['role'] == 'compliance'
    assert s.cookies.get(identity.COOKIE) and 'httponly' in s.headers['set-cookie'].lower()
    assert 'token' not in s.json()  # the browser never sees the token
    assert login(api, 'NL-004', 'wrong-password').status_code == 401
    assert login(api, 'NO-SUCH-ID').json()['detail'] == login(api, 'NL-004', 'nope-nope').json()['detail']
    c = httpx.Client(base_url=api, cookies=s.cookies)
    assert c.get('/auth/me').status_code == 200
    out = c.post('/auth/logout')
    assert out.status_code == 200 and 'ks_session=""' in out.headers['set-cookie']


def test_agent_session_reads_but_cannot_approve(api):
    t = login(api, 'NL-003', client='mcp')
    assert t.status_code == 200 and not t.cookies.get(identity.COOKIE), t.text
    agent = {'Authorization': f"Bearer {t.json()['token']}"}
    assert httpx.get(f'{api}/decisions', headers=agent).status_code == 200
    assert httpx.post(f'{api}/proposals/1/approve', headers=agent).status_code == 403
    assert httpx.post(f'{api}/org/members/x/approve', headers=agent).status_code == 403
    # The Owner can switch the MCP server off; agent sessions are refused until it is back on.
    assert httpx.post(f'{api}/plugins/keystone-mcp/disable', headers=as_('nitika')).status_code == 200
    try:
        assert httpx.get(f'{api}/decisions', headers=agent).status_code == 403
        assert login(api, 'NL-003', client='mcp').status_code == 403
    finally:
        httpx.post(f'{api}/plugins/keystone-mcp/enable', headers=as_('nitika'))
    assert httpx.get(f'{api}/decisions', headers=agent).status_code == 200


def test_auditor_is_read_only(api):
    assert httpx.get(f'{api}/decisions', headers=as_('meera')).status_code == 200
    r = httpx.post(f'{api}/channels/1/messages', json={'body': 'hi'}, headers=as_('meera'))
    assert r.status_code == 403


def test_join_is_rate_limited(api):
    codes = [join(api, 'ZZZZ-ZZZZ').status_code for _ in range(12)]
    assert 429 in codes and codes[0] == 400


def test_one_click_demo_login(api):
    demo = httpx.get(f'{api}/auth/demo').json()
    assert {'NL-003', 'NL-004', 'AUD-001'} <= {d['employee_id'] for d in demo}
    r = httpx.post(f'{api}/auth/demo', json={'employee_id': 'NL-003'})
    assert r.status_code == 200 and r.json()['user_id'] == 'priya' and r.cookies.get(identity.COOKIE)
    assert httpx.post(f'{api}/auth/demo', json={'employee_id': 'not-a-demo'}).status_code == 404


def test_login_checks_the_registered_account(api):
    """Only a registered employee ID with its own password signs in; both failures read the same."""
    wrong_pw, no_account = login(api, 'NL-005', 'not-the-password'), login(api, 'NL-999')
    assert wrong_pw.status_code == no_account.status_code == 401
    assert wrong_pw.json()['detail'] == no_account.json()['detail'] == \
        'that employee ID and password do not match a registered account'
    assert not wrong_pw.cookies.get(identity.COOKIE)
    assert login(api, 'NL-005').json()['user_id'] == 'divya'
