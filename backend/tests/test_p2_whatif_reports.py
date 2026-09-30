"""D (/whatif and slash commands) and J (reports), including the leak checks from B: a Member's what-if, report,
flag list and counts never include another scope's restricted decisions (stub filter: RESTRICTED_READERS)."""
import httpx
import pytest

from conftest import wipe
from p2util import DECISION, H, POLICY, audit_actions, last_audit_id, p2_wipe, post_doc, sql

PID, CID = 'T-POL-W', 'T-RET-W1'


@pytest.fixture(scope='module')
def world(api):
    wipe()
    p2_wipe()
    post_doc(api, 'T-POL-W-v1.md', POLICY.format(pid=PID, v='v1', day='2024-01-15', cid=CID, n=365))
    for did, days, vis, effect in (('T-DEC-W1', 180, 'org', 'ongoing'), ('T-DEC-W2', 30, 'org', 'ongoing'),
                                   ('T-DEC-W3', 200, 'restricted', 'ongoing'), ('T-DEC-W4', 90, 'org', 'completed')):
        post_doc(api, f'{did}.md', DECISION.format(did=did, title=f'Keep logs {days} days', day='2024-06-01',
                                                   owner='p-tzed', vis=vis, cid=CID, effect=effect, days=days))
    # v2 lowers the cap to 150: T-DEC-W1 (180) and restricted T-DEC-W3 (200) are flagged by the scanner
    post_doc(api, 'T-POL-W-v2.md', POLICY.format(pid=PID, v='v2', day='2025-01-01', cid=CID, n=150))
    yield api
    p2_wipe()
    wipe()


def whatif(api, user, q):
    r = httpx.post(f'{api}/whatif', headers=H(user), json={'question': q, 'as_of': '2025-06-01'}, timeout=600)
    assert r.status_code == 200, r.text
    return r.json()


def test_whatif_is_labelled_dry_run_and_filtered(world):
    api, start = world, last_audit_id(world)
    before = sql('SELECT count(*) AS n FROM policy_clauses')[0]['n']
    out = whatif(api, 'sneha', f'/whatif {CID}.retention_days_max = 60')  # a Member
    assert out['label'] == 'HYPOTHETICAL: nothing has changed' and out['scope'] == 'Impact on recorded decisions'
    rows = {r['decision_id']: r for r in out['impact']['rows']}
    assert set(rows) == {'T-DEC-W1', 'T-DEC-W2', 'T-DEC-W4'}  # restricted T-DEC-W3 is neither shown nor counted
    assert rows['T-DEC-W2']['verdict'] == 'still_compliant'
    assert rows['T-DEC-W1']['verdict'] == 'already_non_compliant'  # 180 > 150 already
    assert rows['T-DEC-W4']['verdict'] == 'would_violate_if_repeated'  # one-off act: not retroactively wrong
    assert rows['T-DEC-W4']['before']['limit'] == 150 and rows['T-DEC-W4']['after']['limit'] == 60
    assert sum(out['impact']['counts'].values()) == 3 and 'T-DEC-W3' not in out['explanation'] + out['facts']
    assert out['can_promote'] is False  # a Member can run it but cannot promote it
    # sandbox only: no policy rows, no graph change, no queue entries; one simulations row flagged simulation=true
    assert sql('SELECT count(*) AS n FROM policy_clauses')[0]['n'] == before
    assert sql('SELECT simulation FROM simulations WHERE id=$1', out['simulation_id'])[0]['simulation'] is True
    acts = [a for a in audit_actions(api, start) if a['action'] == 'simulation_run']
    assert len(acts) == 1 and acts[0]['object_id'] == str(out['simulation_id'])
    # a restricted reader sees the restricted decision too
    full = whatif(api, 'farhan', f'/what-if {CID}.retention_days_max = 60')
    assert 'T-DEC-W3' in {r['decision_id'] for r in full['impact']['rows']} and full['can_promote'] is True


def test_whatif_validation_person_and_promote(world):
    api = world
    bad = httpx.post(f'{api}/whatif', headers=H('priya'), json={'question': f'/whatif {CID}.nope = 5', 'as_of': '2025-06-01'})
    assert bad.status_code == 422 and 'has no field' in bad.json()['detail']
    person = whatif(api, 'sneha', '/whatif p-tzed leaves')
    ids = {d['decision_id'] for d in person['person']['decisions']}
    assert ids == {'T-DEC-W1', 'T-DEC-W2', 'T-DEC-W4'}  # restricted W3 hidden from the Member
    sim = whatif(api, 'farhan', f'/whatif {CID}.retention_days_max = 60 effective 2027-02-01')
    assert httpx.post(f'{api}/whatif/{sim["simulation_id"]}/promote', headers=H('sneha')).status_code == 403
    p = httpx.post(f'{api}/whatif/{sim["simulation_id"]}/promote', headers=H('farhan'))
    assert p.status_code == 201, p.text
    d = p.json()
    assert d['status'] == 'draft' and d['new_value'] == 60 and d['effective_from'] == '2027-02-01'
    assert d['clause_text'] == 'Test activity logs shall be retained for no longer than 60 days.'
    assert d['from_simulation'] == sim['simulation_id']


def test_whatif_natural_language_is_parsed_by_the_local_model(world):
    out = whatif(world, 'farhan', '/whatif test log retention drops to 45 days?')
    assert out['hypothetical'] == {'kind': 'policy_change', 'clause_id': CID, 'field': 'retention_days_max',
                                   'role': None, 'new_value': 45, 'effective_from': None}


def test_slash_commands_hide_restricted(world):
    api = world
    flags = {f['decision_id'] for f in httpx.get(f'{api}/slash/flags', headers=H('priya')).json()}
    assert 'T-DEC-W1' in flags and 'T-DEC-W3' not in flags
    assert 'T-DEC-W3' in {f['decision_id'] for f in httpx.get(f'{api}/slash/flags', headers=H('farhan')).json()}
    fid = f'FLAG-T-DEC-W3-{CID}@v2'
    assert httpx.get(f'{api}/slash/explain/{fid}', headers=H('priya')).status_code == 404
    ex = httpx.get(f'{api}/slash/explain/{fid}', headers=H('farhan')).json()
    assert ex['citations'][:2] == ['T-DEC-W3', f'{CID}@v2']
    assert httpx.get(f'{api}/slash/compliance/T-DEC-W3', headers=H('priya')).status_code == 404
    who = httpx.get(f'{api}/slash/whois', params={'q': 'p-tzed'}, headers=H('priya')).json()
    assert {d['decision_id'] for d in who['decisions']} == {'T-DEC-W1', 'T-DEC-W2', 'T-DEC-W4'}
    hist = httpx.get(f'{api}/slash/history/Project Tango', headers=H('priya')).json()
    assert 'T-DEC-W3' not in {d['id'] for d in hist['decisions']}


def test_reports_markdown_pdf_and_permissions(world):
    api = world
    md = lambda u, **p: httpx.get(f'{api}/reports/compliance', headers=H(u), params={'as_of': '2025-06-01', **p}, timeout=120)
    member, reader = md('priya').text, md('farhan').text
    assert 'T-DEC-W3' not in member and 'T-DEC-W3' in reader
    assert '[T-DEC-W1]' in member and f'[{CID}@v2]' in member and 'non compliant' in member
    # counts are computed after the filter: the Member's summary never counts the hidden decision
    count = lambda text: int(text.split('- ')[1].split(' ')[0])
    assert count(reader) == count(member) + 1
    pdf = md('priya', format='pdf')
    assert pdf.headers['content-type'] == 'application/pdf' and pdf.content.startswith(b'%PDF')
    ap = httpx.get(f'{api}/reports/audit-prep', headers=H('priya'), timeout=120,
                   params={'date_from': '2024-01-01', 'date_to': '2024-12-31'}).text
    assert 'Audit-prep pack 2024-01-01 to 2024-12-31' in ap and '[T-DEC-W2]' in ap and 'T-DEC-W3' not in ap
    assert 'Hash chain: verified' in ap and 'head hash' not in ap  # chain size and head hash: privileged roles only
    assert 'head hash' in httpx.get(f'{api}/reports/audit-prep', headers=H('ananya'), timeout=120,
                                    params={'date_from': '2024-01-01', 'date_to': '2024-12-31'}).text
    assert httpx.get(f'{api}/reports/audit-prep', headers=H('priya'),
                     params={'date_from': '2025-01-01', 'date_to': '2024-01-01'}).status_code == 422
