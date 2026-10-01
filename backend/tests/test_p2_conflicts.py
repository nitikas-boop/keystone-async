"""C: claims (C1), duplicate detection (C2) and collision resolution (C3) through the API.
Roles (contract stub): priya, divya = member; karthik = lead; farhan = compliance; ananya, nitika = owner."""
import httpx
import pytest

from conftest import wipe
from p2util import DECISION, H, POLICY, audit_actions, last_audit_id, p2_wipe, post_doc, sql

PID, CID = 'T-POL-C', 'T-RET-C1'


@pytest.fixture
def world(api):
    wipe()
    p2_wipe()
    post_doc(api, 'T-POL-C-v1.md', POLICY.format(pid=PID, v='v1', day='2024-01-15', cid=CID, n=365))
    yield api
    p2_wipe()
    wipe()


def draft(api, user, n, text=None, clause=CID, eff='2027-01-01'):
    return httpx.post(f'{api}/policy-proposals', headers=H(user), timeout=60, json={
        'policy_id': PID, 'clause_id': clause, 'title': f'Retention {n}', 'field': 'retention_days_max',
        'new_value': n, 'effective_from': eff,
        'clause_text': text or f'Test activity logs shall be retained for no longer than {n} days.'})


def submit(api, user, pid, resolution=None):
    return httpx.post(f'{api}/policy-proposals/{pid}/submit', headers=H(user), timeout=600,
                      json={'resolution': resolution} if resolution else {})


def test_claims_block_override_and_audit(world):
    api, start = world, last_audit_id(world)
    c = httpx.post(f'{api}/claims', headers=H('divya'), json={'resource_ref': 'clause:T-X'})
    assert c.status_code == 201, c.text
    blocked = httpx.post(f'{api}/claims', headers=H('priya'), json={'resource_ref': 'clause:T-X'})
    assert blocked.status_code == 409
    assert 'divya is working on this (claimed 0 min ago)' == blocked.json()['detail']['message']
    # a Member cannot override; a Team lead can, and can reassign
    assert httpx.post(f'{api}/claims/{c.json()["id"]}/override', headers=H('sneha'), json={}).status_code == 403
    o = httpx.post(f'{api}/claims/{c.json()["id"]}/override', headers=H('karthik'), json={'reassign_to': 'priya'})
    assert o.status_code == 200 and o.json()['owner_id'] == 'priya'
    acts = [a['action'] for a in audit_actions(api, start)]
    assert {'claim_created', 'claim_blocked', 'claim_overridden'} <= set(acts)


def test_draft_claims_clause_and_stale_edit_is_rejected(world):
    api = world
    a = draft(api, 'priya', 60)
    assert a.status_code == 201, a.text
    # someone else starting a draft on the same clause is blocked while priya's draft holds the claim
    b = draft(api, 'divya', 120)
    assert b.status_code == 409 and 'priya is working on this' in b.json()['detail']['message']
    pid, v = a.json()['id'], a.json()['version']
    e1 = httpx.patch(f'{api}/policy-proposals/{pid}', headers=H('priya'), json={'version': v, 'changes': {'rationale': 'x'}})
    assert e1.status_code == 200 and e1.json()['version'] == v + 1
    stale = httpx.patch(f'{api}/policy-proposals/{pid}', headers=H('priya'), json={'version': v, 'changes': {'rationale': 'y'}})
    assert stale.status_code == 409 and stale.json()['detail']['message'] == 'someone changed this, reload'
    # only the author edits a draft
    assert httpx.patch(f'{api}/policy-proposals/{pid}', headers=H('divya'),
                       json={'version': v + 1, 'changes': {'rationale': 'z'}}).status_code == 403


def test_collision_a_resolved_by_authority_becomes_policy_version_and_ruling(world):
    api, start = world, last_audit_id(world)
    a = draft(api, 'priya', 60).json()
    assert submit(api, 'priya', a['id']).status_code == 200  # releases the clause claim
    b = draft(api, 'divya', 120).json()
    sb = submit(api, 'divya', b['id'])
    assert sb.status_code == 200, sb.text
    m = next(x for x in sb.json()['matches'] if x['ref'] == f"PROP-{a['id']}")
    assert m['label'] == 'conflict' and m['action'] == 'collide' and 'structural' in m['layers'] and m['reason']

    cols = httpx.get(f'{api}/collisions', headers=H('priya'), params={'status': 'open'}).json()
    col = next(c for c in cols if {c['ref_a'], c['ref_b']} == {f"PROP-{a['id']}", f"PROP-{b['id']}"})
    assert col['type'] == 'A' and col['authority_id'] == 'ananya'  # no domain authority for T-POL-C: Owner
    detail = httpx.get(f'{api}/collisions/{col["id"]}', headers=H('ananya'), timeout=60).json()
    assert [s['kind'] for s in detail['sides']] == ['proposal', 'proposal']
    assert detail['in_force']['fields'] == {'retention_days_max': 365} and 'impact' in detail['sides'][0]

    rule = lambda u, **kw: httpx.post(f'{api}/collisions/{col["id"]}/resolve', headers=H(u), timeout=600,
                                      json={'outcome': 'approve_a', 'reason': 'Shorter retention lowers risk.', **kw})
    assert rule('divya').status_code == 403        # a party (and not the authority)
    assert rule('karthik').status_code == 403      # a lead who is not the assigned authority
    assert httpx.post(f'{api}/collisions/{col["id"]}/resolve', headers=H('ananya'),
                      json={'outcome': 'approve_a', 'reason': ' '}).status_code == 422  # a ruling needs a reason
    first = col['ref_a'] == f"PROP-{a['id']}"
    r = rule('ananya', outcome='approve_a' if first else 'approve_b')
    assert r.status_code == 200, r.text
    assert r.json()['status'] == 'resolved' and r.json()['ruling_decision_id'] == f"RUL-{col['id']}"

    props = {p['id']: p for p in httpx.get(f'{api}/policy-proposals', headers=H('priya')).json()}
    assert props[a['id']]['status'] == 'active' and props[b['id']]['status'] == 'rejected'
    pol = next(p for p in httpx.get(f'{api}/policies').json() if p['policy_id'] == PID)
    v2 = next(v for v in pol['versions'] if v['version'] == 'v2')
    assert v2['valid_from'] == '2027-01-01' and v2['clauses'][0]['fields'] == {'retention_days_max': 60}
    # the ruling is a Decision owned by the authority, with its reason: "why 60 not 120" is answerable
    rul = httpx.get(f'{api}/nodes/RUL-{col["id"]}/source').json()
    assert rul['type'] == 'decision' and 'Shorter retention lowers risk.' in rul['passage']['text']
    acts = [x['action'] for x in audit_actions(api, start)]
    assert {'policy_proposed', 'collision_opened', 'collision_resolved', 'proposal_approved', 'proposal_rejected'} <= set(acts)
    assert httpx.get(f'{api}/audit/verify').json()['ok']


def test_duplicate_is_blocked_until_the_author_chooses(world):
    api = world
    a = draft(api, 'priya', 60).json()
    submit(api, 'priya', a['id'])
    dup = draft(api, 'divya', 60).json()  # identical text and value
    s = submit(api, 'divya', dup['id'])
    assert s.status_code == 409
    m = s.json()['detail']['matches'][0]
    assert m['label'] == 'duplicate' and m['action'] == 'block' and 'exact' in m['layers']
    assert submit(api, 'divya', dup['id'], {'choice': 'keep_both'}).status_code == 422  # written reason required
    c = submit(api, 'divya', dup['id'], {'choice': 'cancel', 'reason': 'same as PROP'})
    assert c.status_code == 200 and c.json()['status'] == 'rejected'


def test_review_lock_prevents_double_approval_and_self_review(world):
    api = world
    p = draft(api, 'priya', 200).json()
    submit(api, 'priya', p['id'])
    assert httpx.post(f'{api}/policy-proposals/{p["id"]}/review', headers=H('divya')).status_code == 403  # member
    assert httpx.post(f'{api}/policy-proposals/{p["id"]}/review', headers=H('nitika')).status_code == 200
    blocked = httpx.post(f'{api}/policy-proposals/{p["id"]}/review', headers=H('ananya'))
    assert blocked.status_code == 409 and 'nitika is working on this' in blocked.json()['detail']['message']
    assert httpx.post(f'{api}/policy-proposals/{p["id"]}/approve', headers=H('ananya')).status_code == 409
    ok = httpx.post(f'{api}/policy-proposals/{p["id"]}/approve', headers=H('nitika'), timeout=600)
    assert ok.status_code == 200 and ok.json()['status'] == 'active', ok.text
    again = httpx.post(f'{api}/policy-proposals/{p["id"]}/approve', headers=H('nitika'))
    assert again.status_code == 409  # already active: cannot be approved twice


def test_type_b_and_type_c_collisions(world):
    api = world
    # B: a new clause whose field contradicts a different active clause
    b = draft(api, 'priya', 30, clause='T-RET-C9', text='Test audit logs are kept for at most 30 days.').json()
    s = submit(api, 'priya', b['id'])
    assert s.status_code == 200, s.text
    assert any(m['ref'] == f'{CID}@v1' and m['action'] == 'collide' for m in s.json()['matches'])
    cols = httpx.get(f'{api}/collisions', headers=H('priya')).json()
    assert any(c['type'] == 'B' and c['ref_b'] == f'{CID}@v1' for c in cols)
    # C: two active ongoing decisions set the same field of the same clause differently
    for did, days in (('T-DEC-C1', 200), ('T-DEC-C2', 300)):
        post_doc(api, f'{did}.md', DECISION.format(did=did, title=did, day='2024-05-01', owner='p-tzed', vis='org',
                                                   cid=CID, effect='ongoing', days=days))
    out = httpx.post(f'{api}/collisions/scan-decisions', headers=H('priya'), timeout=60).json()
    c = next(x for x in out if {x['ref_a'], x['ref_b']} == {'T-DEC-C1', 'T-DEC-C2'})
    assert c['type'] == 'C' and c['summary']['label'] == 'conflict'
    # idempotent: scanning again does not open a second collision for the same pair
    again = httpx.post(f'{api}/collisions/scan-decisions', headers=H('priya'), timeout=60).json()
    assert [x['id'] for x in again if x['type'] == 'C'] == [c['id']]
    rows = sql("SELECT count(*) AS n FROM collisions WHERE type='C'")
    assert rows[0]['n'] == 1
