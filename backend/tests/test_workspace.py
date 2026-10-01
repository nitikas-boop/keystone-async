"""Acceptance checks for the role-aware workspace: the permission map, chat scopes and teams, the inbox and its
badge, separation of duties, domains, the procurement threshold read from the policy, scoped dashboards, and the
audit trail of every permission-sensitive action (with the chain still verifying)."""
import asyncio
from datetime import date

import asyncpg
import httpx

from app import permissions
from p1_util import TEST_DB, as_, get, uniq

ENGINEER, ANALYST, OPS_LEAD, COMPLIANCE, CTO, CEO = 'divya', 'sneha', 'priya', 'farhan', 'karthik', 'ananya'


def post(api, path, user, **body):
    return httpx.post(f'{api}{path}', json=body, headers=as_(user), timeout=60)


def patch(api, path, user, **body):
    return httpx.patch(f'{api}{path}', json=body, headers=as_(user), timeout=60)


def sql(q, *a):
    async def go():
        c = await asyncpg.connect(TEST_DB)
        try:
            return await c.fetch(q, *a)
        finally:
            await c.close()
    return asyncio.run(go())


def caps(api, user) -> set:
    return set(get(api, '/me/permissions', user).json()['capabilities'])


def test_permission_map_tiers():
    """The map itself (no server): tiers, position-bound capabilities, domains."""
    u = lambda uid, role, desig, domain=None: {'user_id': uid, 'role': role, 'designation': desig, 'domain': domain}
    ceo, cto = u('ananya', 'owner', 'CEO'), u('karthik', 'lead', 'CTO')
    ops, comp, eng = u('priya', 'lead', 'Ops lead', 'ops'), u('farhan', 'compliance', 'Compliance lead', 'compliance'), \
        u('divya', 'member', 'Engineer', 'engineering')
    assert [permissions.tier(x) for x in (ceo, cto, ops, comp, eng)] == ['executive', 'executive', 'lead', 'lead', 'member']
    assert permissions.can(ceo, 'policy.upload') and permissions.can(comp, 'policy.upload')
    assert not permissions.can(cto, 'policy.upload') and not permissions.can(ops, 'policy.upload')
    assert permissions.can(cto, 'admin.panel') and not permissions.can(ops, 'admin.panel')
    assert not permissions.can(eng, 'channel.create') and not permissions.can(eng, 'team.create')
    assert permissions.can(eng, 'decision.propose') and not permissions.can(eng, 'decision.create')


def test_separation_of_duties_domains_and_threshold(monkeypatch):
    """Nobody approves their own proposal or an action on their own decision; a lead only in their domain; above the
    CTO limit only the CEO."""
    async def limit(on=None):
        return 200000, 'PROC-3.1@v2'
    monkeypatch.setattr(permissions, 'procurement_threshold', limit)
    ceo = {'user_id': 'ananya', 'role': 'owner', 'designation': 'CEO', 'person_key': 'p-ananya'}
    cto = {'user_id': 'karthik', 'role': 'lead', 'designation': 'CTO', 'person_key': 'p-karthik'}
    ops = {'user_id': 'priya', 'role': 'lead', 'designation': 'Ops lead', 'domain': 'ops'}
    comp = {'user_id': 'farhan', 'role': 'compliance', 'designation': 'Compliance lead', 'domain': 'compliance'}
    eng = {'user_id': 'divya', 'role': 'member', 'designation': 'Engineer'}
    block = lambda u, **kw: asyncio.run(permissions.approval_block(u, **kw))
    assert 'members cannot approve' in block(eng, domain='ops')
    assert 'separation of duties' in block(ops, domain='ops', proposer='priya')
    assert 'separation of duties' in block(ceo, domain='compliance', decision_owner='p-ananya')
    assert 'own domain' in block(ops, domain='compliance')
    assert block(comp, domain='compliance') is None and block(ops, domain='ops') is None
    assert 'CEO must sign off' in block(cto, domain='procurement', amount=400000)
    assert block(cto, domain='procurement', amount=150000) is None
    assert block(ceo, domain='procurement', amount=400000) is None
    assert block(ops, domain='procurement', amount=1000) is not None  # procurement is not the Ops lead's domain


def test_threshold_is_read_from_the_policy_in_force(api):
    doc = uniq('POL-PROC-T')
    sql("INSERT INTO documents (id, path, doc_type, ref_time, front_matter, raw, sha256) "
        "VALUES ($1, 'test', 'policy_version', $2, '{}', 'x', 'x')", doc, date.today())
    sql("INSERT INTO policy_clauses (policy_id, version, clause_id, document_id, title, text, fields, checkable, "
        "effective_from) VALUES ($1, 'vT', 'PROC-3.1', $1, 't', 't', '{\"approver_threshold_inr\": {\"CTO\": 123456}}', "
        "true, $2)", doc, date.today())
    try:
        assert get(api, '/me/permissions', CTO).json()['procurement'] == {'cto_limit_inr': 123456, 'clause': 'PROC-3.1@vT'}
    finally:
        sql('DELETE FROM policy_clauses WHERE document_id = $1', doc)
        sql('DELETE FROM documents WHERE id = $1', doc)


def test_engineer_chats_but_cannot_create_channels_or_teams(api):
    assert {'chat.dm', 'chat.post'} <= caps(api, ENGINEER) and not caps(api, ENGINEER) & {'channel.create', 'team.create'}
    org = {c['name'] for c in get(api, '/channels', ENGINEER).json() if c['scope'] == 'org'}
    assert {'general', 'announcements', 'compliance', 'engineering'} <= org
    for other in (CEO, OPS_LEAD, ANALYST, 'rohit'):  # every employee can DM every other
        dm = post(api, '/channels/dm', ENGINEER, user_ids=[other])
        assert dm.status_code == 200 and post(api, f"/channels/{dm.json()['id']}/messages", ENGINEER,
                                              body=f'hi @{other}').status_code == 201
    assert post(api, '/channels', ENGINEER, name=uniq('nope')).status_code == 403
    assert post(api, '/org/teams', ENGINEER, name=uniq('Nope')).status_code == 403
    ann = next(c for c in get(api, '/channels', ENGINEER).json() if c['name'] == 'announcements')
    assert not ann['can_post'] and post(api, f"/channels/{ann['id']}/messages", ENGINEER, body='x').status_code == 403


def test_only_permitted_roles_create_public_channels(api):
    for user, code in ((OPS_LEAD, 201), (CTO, 201), (ENGINEER, 403), (ANALYST, 403), ('meera', 403)):
        r = post(api, '/channels', user, name=uniq('pub-'), topic='t', is_private=False)
        assert r.status_code == code, (user, r.text)
        if code == 201:
            assert r.json()['scope'] == 'org' and not r.json()['is_private']
            assert r.json()['id'] in {c['id'] for c in get(api, '/channels', 'rohit').json()}  # public: everyone reads it
    private = post(api, '/channels', OPS_LEAD, name=uniq('priv-'), is_private=True, members=[ANALYST]).json()
    assert private['id'] in {c['id'] for c in get(api, '/channels', ANALYST).json()}
    assert private['id'] not in {c['id'] for c in get(api, '/channels', ENGINEER).json()}


def test_lead_team_membership_is_the_access(api):
    t = post(api, '/org/teams', OPS_LEAD, name=uniq('Vendor squad '), description='vendors', members=[ANALYST, 'rohit'])
    assert t.status_code == 201, t.text
    team = t.json()
    ch = next(c for c in get(api, '/channels', OPS_LEAD).json() if c['team_id'] == team['id'])
    assert post(api, f"/channels/{ch['id']}/messages", OPS_LEAD, body='history before anyone reads').status_code == 201
    for member in (ANALYST, 'rohit'):  # both see the team's channels and its full history at once
        assert ch['id'] in {c['id'] for c in get(api, '/channels', member).json() if c['scope'] == 'team'}
        assert 'history before anyone reads' in [m['body'] for m in get(api, f"/channels/{ch['id']}/messages", member).json()]
    assert ch['id'] not in {c['id'] for c in get(api, '/channels', ENGINEER).json()}
    assert patch(api, f"/org/teams/{team['id']}", ENGINEER, remove_member='rohit').status_code == 403  # not their team
    assert patch(api, f"/org/teams/{team['id']}", OPS_LEAD, remove_member='rohit').status_code == 200
    assert get(api, f"/channels/{ch['id']}/messages", 'rohit').status_code == 404  # revoked immediately
    assert ch['id'] not in {c['id'] for c in get(api, '/channels', 'rohit').json()}
    added = [n for n in get(api, '/notifications', ANALYST).json()['items'] if n['kind'] == 'team_added']
    assert any(n['ref_id'] == team['id'] for n in added)


def test_each_scope_lists_only_its_own_items(api):
    mine = {t['id'] for t in get(api, '/org/teams', ANALYST).json() if t['is_member']}
    chans = get(api, '/channels', ANALYST).json()
    assert {c['scope'] for c in chans} <= {'org', 'team', 'dm'}
    assert all(c['team_id'] in mine for c in chans if c['scope'] == 'team')          # Teams: only my teams
    assert all(c['team_id'] is None and c['type'] in ('global', 'group') for c in chans if c['scope'] == 'org')
    assert all(ANALYST not in c['with'] and len(c['with']) >= 1 for c in chans if c['scope'] == 'dm')


def test_inbox_lists_pending_unread_and_notifications_and_the_badge_matches(api):
    a = post(api, '/actions', ANALYST, tool='send_dm', payload={'user_id': ENGINEER, 'body': 'inbox check'}).json()
    dm = post(api, '/channels/dm', ANALYST, user_ids=[OPS_LEAD]).json()['id']
    get(api, f'/channels/{dm}/messages', OPS_LEAD)  # read up to now
    assert post(api, f'/channels/{dm}/messages', ANALYST, body='are you around?').status_code == 201
    box = get(api, '/inbox', OPS_LEAD).json()
    keys = {i['key'] for i in box['items']}
    assert f"action:{a['id']}" in keys and f'channel:{dm}' in keys             # pending approval, unread DM
    assert any(i['category'] == 'notification' for i in box['items'])          # e.g. team_added, mentions
    c = box['counts']
    assert c['pending'] == sum(i['category'] == 'action' for i in box['items'])
    assert c['badge'] == c['pending'] + c['unread']
    assert f"action:{a['id']}" not in {i['key'] for i in get(api, '/inbox', ANALYST).json()['items']}  # not her own
    assert post(api, f"/actions/{a['id']}/approve", ANALYST).status_code == 403  # nor may she approve it
    assert post(api, f"/actions/{a['id']}/approve", COMPLIANCE).status_code in (403, 404)  # outside Farhan's domain
    assert post(api, f"/actions/{a['id']}/reject", OPS_LEAD, reason='not now').json()['status'] == 'rejected'
    note = [n for n in get(api, '/notifications', ANALYST).json()['items'] if n['kind'] == 'action_rejected']
    assert note and note[0]['detail'] == 'not now'  # the reviewer's reason reaches the proposer
    assert post(api, '/inbox/read-all', OPS_LEAD).status_code == 200
    assert f'channel:{dm}' not in {i['key'] for i in get(api, '/inbox', OPS_LEAD).json()['items']}


def test_member_proposes_a_decision_a_lead_of_the_domain_reviews(api):
    md = ('---\ndoc_type: decision\ndecision_id: {d}\ntitle: Test proposal\ndecided_on: 2026-09-29\nowner: p-divya\n'
          'project: Data Governance\nstatus: active\neffect: ongoing\nfields: {{}}\nreasons: test\n---\ntest\n').format(d=uniq('T-DP-'))
    assert httpx.post(f'{api}/documents', files={'file': ('d.md', md.encode())}, headers=as_(ENGINEER)).status_code == 403
    p = post(api, '/decision-proposals', ENGINEER, markdown=md).json()
    assert p['domain'] == 'compliance'
    assert post(api, f"/decision-proposals/{p['id']}/reject", ENGINEER).status_code in (403, 404)  # not her own
    assert post(api, f"/decision-proposals/{p['id']}/reject", OPS_LEAD).status_code in (403, 404)  # not his domain
    assert f"decision_proposal:{p['id']}" in {i['key'] for i in get(api, '/inbox', COMPLIANCE).json()['items']}
    assert post(api, f"/decision-proposals/{p['id']}/reject", COMPLIANCE, reason='needs a clause').json()['status'] == 'rejected'


def test_every_role_gets_a_scoped_dashboard(api):
    ceo, lead, member = (get(api, '/dashboard', u).json() for u in (CEO, OPS_LEAD, ENGINEER))
    assert (ceo['scope'], lead['scope'], member['scope']) == ('org', 'domain', 'personal')
    assert {'pending_approvals', 'active_flags', 'decisions_by_status', 'recent_audit', 'ingestion', 'team_activity'} <= ceo.keys()
    assert {'domain_flags', 'pending_approvals', 'team_activity'} <= lead.keys() and 'ingestion' not in lead
    assert {'my_pending', 'my_decisions', 'policy_changes'} <= member.keys()
    assert not {'ingestion', 'active_flags', 'recent_audit'} & member.keys()
    assert all(f['domain'] == 'ops' for f in lead['domain_flags'])
    mine = {t['id'] for t in get(api, '/org/teams', ENGINEER).json() if t['is_member']}
    assert {t['id'] for t in member['team_activity']} <= mine


def test_audit_log_records_permission_sensitive_actions_and_the_chain_verifies(api):
    acts = {r['action'] for r in sql('SELECT action FROM audit_log')}
    assert {'team_created', 'team_member_added', 'team_member_removed', 'channel_created', 'PERMISSION_DENIED',
            'rejected', 'decision_proposed'} <= acts
    denied = sql("SELECT actor FROM audit_log WHERE action = 'PERMISSION_DENIED' AND object_id = 'channel.create'")
    assert ('user:' + ENGINEER,) in {tuple(r) for r in denied}
    assert get(api, '/audit/verify', 'nitika').json()['ok'] is True
    own = get(api, '/audit', ENGINEER, limit=500).json()
    assert own and {r['actor'] for r in own} <= {f'user:{ENGINEER}', f'user:{ENGINEER}:mcp'}
