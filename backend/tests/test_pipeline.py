"""End-to-end mechanics on throwaway documents (NOT the Nimbus Ledger dataset, which is seeded on the
qwen3:14b machine): policy upload, decision upload, as-of compliance, cited /ask, refusal, live scanner flag,
human approval, executor .eml, audit trail, and extraction review. Uses the isolated test backend."""
import asyncio
import os
from pathlib import Path

import asyncpg
import httpx

from app import db, executor

H = {'X-User': 'priya'}
POLICY = '''---
doc_type: policy_version
policy_id: T-POL-RET
version: {v}
title: Test retention policy
effective_from: {day}
clauses:
  - clause_id: T-RET-2.1
    title: Customer log retention
    text: "Customer activity logs shall be retained for no longer than {n} days."
    fields: {{retention_days_max: {n}}}
    checkable: true
  - clause_id: T-RET-4.2
    title: Purpose limitation
    text: "Personal data may be retained only as long as necessary for its purpose."
    checkable: false
---
Test retention policy {v}.
'''
DECISION = '''---
doc_type: decision
decision_id: T-DEC-7
title: Reduce customer log retention to 180 days
decided_on: 2025-06-18
owner: T-p-ananya
project: T-Atlas
relied_on: [T-RET-2.1]
status: active
effect: ongoing
fields: {retention_days: 180}
---
We cut customer log retention to 180 days to match the new policy cap and reduce storage cost.
'''
NOTE = '''---
doc_type: meeting_note
doc_id: T-MTG-2025-08-12
title: Data team sync
meeting_date: 2025-08-12
---
Attendees: Ananya, Farhan, Divya.

Ananya decided that the team will keep anonymised logs for 24 months, because analysts need long-term trends and anonymised data carries less risk.

Divya will look into cheaper storage later; nothing was decided on that.
'''


def post(api, name, text):
    r = httpx.post(f'{api}/documents', files={'file': (name, text.encode())}, headers=H, timeout=600)
    assert r.status_code == 201, r.text
    return r.json()


def ask(api, q, as_of):
    r = httpx.post(f'{api}/ask', json={'question': q, 'as_of': as_of}, headers=H, timeout=600)
    assert r.status_code == 200, r.text
    return r.json()


def test_policy_decision_compliance_scanner_approval(api, clean):
    post(api, 'pol-v1.md', POLICY.format(v='v1', day='2024-01-15', n=365))
    post(api, 'pol-v2.md', POLICY.format(v='v2', day='2025-01-06', n=180))
    post(api, 'dec-7.md', DECISION)

    # validity windows come from metadata; v1 closed by v2
    pol = httpx.get(f'{api}/policies').json()[0]
    assert [(v['version'], v['valid_from'], v['valid_to']) for v in pol['versions']] == \
        [('v1', '2024-01-15', '2025-01-06'), ('v2', '2025-01-06', None)]

    # compliance when made: clause version in force on decided_on
    c = httpx.get(f'{api}/decisions/T-DEC-7/compliance', params={'as_of': '2025-06-30'}, timeout=300).json()
    assert c['result'] == 'compliant' and c['checks'][0]['source_id'] == 'T-RET-2.1@v2'
    assert c['checks'][0]['explanation']

    # cited answer; every sentence carries valid source ids
    a = ask(api, 'Was keeping customer logs for 180 days compliant in 2025?', '2025-06-30')
    assert not a['refused'], a
    assert all(s['source_ids'] for s in a['sentences'])
    assert 'T-DEC-7' in {x['id'] for x in a['citations']}
    assert a['subgraph']['nodes'] and a['compliance'][0]['result'] == 'compliant'

    # clean refusal
    r = ask(api, 'Why did we choose MongoDB?', '2025-06-30')
    assert r['refused'] and r['answer'] == 'I have no recorded decision about that' and not r['citations']

    # live policy upload -> scanner flags automatically, proposal queued
    out = post(api, 'pol-v3.md', POLICY.format(v='v3', day='2026-09-28', n=90))
    assert [f['impact_type'] for f in out['flags']] == ['ONGOING_PRACTICE_BREACH']
    [p] = httpx.get(f'{api}/proposals', params={'status': 'proposed'}).json()

    # the executor ignores anything not approved
    async def tick():
        await db.connect(os.environ['TEST_DATABASE_URL'])
        executor.config.OUTBOX_DIR = '/tmp/keystone-test-outbox'
        try:
            return await executor.run_once()
        finally:
            await db.pool.close()
    assert asyncio.run(tick()) is None
    assert httpx.post(f"{api}/proposals/{p['id']}/approve").status_code == 401  # no X-User
    assert httpx.post(f"{api}/proposals/{p['id']}/approve", headers=H).json()['status'] == 'approved'
    assert asyncio.run(tick()) == p['id']
    eml = Path('/tmp/keystone-test-outbox') / f"proposal-{p['id']}.eml"
    assert 'Subject: [Keystone] ONGOING_PRACTICE_BREACH: T-DEC-7 vs T-RET-2.1@v3' in eml.read_text()
    assert httpx.get(f'{api}/proposals').json()[0]['status'] == 'executed'
    assert httpx.post(f"{api}/proposals/{p['id']}/reject", headers=H).status_code == 409

    # audit trail: policy uploaded -> flagged -> proposed -> approved -> executed
    async def trail():
        c = await asyncpg.connect(os.environ['TEST_DATABASE_URL'])
        rows = await c.fetch("SELECT actor, action FROM audit_log WHERE 'T-DEC-7' = ANY(source_ids) "
                             "OR object_id = 'T-POL-RET@v3' ORDER BY id DESC LIMIT 5")
        await c.close()
        return [(r['actor'], r['action']) for r in reversed(rows)]
    assert asyncio.run(trail()) == [('user:priya', 'policy_ingested'), ('system:scanner', 'flag_created'),
                                    ('system:scanner', 'action_proposed'), ('user:priya', 'approved'),
                                    ('executor', 'executed')]


def test_extraction_review_and_not_checkable(api, clean):
    post(api, 'pol-v2.md', POLICY.format(v='v2', day='2025-01-06', n=180))
    out = post(api, 'note.md', NOTE)
    assert 'extraction_error' not in out, out
    rows = httpx.get(f'{api}/extractions', params={'document_id': 'T-MTG-2025-08-12'}).json()
    decisions = [r for r in rows if r['kind'] == 'node' and r['type'] == 'Decision']
    assert decisions, rows
    for r in rows:  # provenance on every extracted fact
        p = r['provenance']
        assert 0 <= p['confidence'] <= 1 and p['extracted_by'] == 'qwen3:8b' and p['human_verified'] is False
    d = decisions[0]
    dec_key = d['source']
    assert httpx.post(f"{api}/extractions/{d['id']}/accept", headers=H).json()['status'] == 'accepted'

    # extracted decision has no clause: no_clause; human links RELIED_ON in review -> field absent -> not_checkable
    c = httpx.get(f'{api}/decisions/{dec_key}/compliance', timeout=300).json()
    assert c['result'] == 'no_clause' and c['checks'] == []
    r = httpx.post(f'{api}/extractions', headers=H, json={'source': dec_key, 'relation': 'RELIED_ON',
                                                          'target': 'T-RET-2.1@v2'})
    assert r.status_code == 201, r.text
    c = httpx.get(f'{api}/decisions/{dec_key}/compliance', timeout=300).json()
    assert c['result'] == 'not_checkable' and 'retention_days' in c['checks'][0]['reason']

    others = [r for r in rows if r['status'] == 'pending' and r['id'] != d['id']]
    if others:
        assert httpx.post(f"{api}/extractions/{others[0]['id']}/reject", headers=H).json()['status'] == 'rejected'


def test_folder_watcher_ingests_new_file_as_system_watcher(api, clean):
    import shutil
    import time
    vault = Path('/tmp/keystone-test-vault')
    shutil.rmtree(vault, ignore_errors=True)
    (vault / 'policies').mkdir(parents=True)
    (vault / 'inbox').mkdir()
    try:
        # a dataset folder is never watched; only the inbox drop folder is
        (vault / 'policies' / 'pol-v2.md').write_text(POLICY.format(v='v2', day='2025-01-06', n=180), encoding='utf-8')
        (vault / 'inbox' / 'pol-v1.md').write_text(POLICY.format(v='v1', day='2024-01-15', n=365), encoding='utf-8')
        for _ in range(30):
            if httpx.get(f'{api}/policies').json():
                break
            time.sleep(1)
        time.sleep(6)  # one more watcher tick, to be sure policies/ was ignored
        assert [v['version'] for v in httpx.get(f'{api}/policies').json()[0]['versions']] == ['v1']
        row = httpx.get(f'{api}/audit', params={'limit': 500}).json()[-1]
        assert (row['actor'], row['action'], row['object_id']) == ('system:watcher', 'policy_ingested', 'T-POL-RET@v1')
    finally:
        shutil.rmtree(vault, ignore_errors=True)


def test_reference_to_uningested_decision_does_not_break_ask(api, clean):
    # A decision that supersedes one never ingested creates a placeholder node; it must not be treated as a decision.
    post(api, 'pol-v1.md', POLICY.format(v='v1', day='2024-01-15', n=365))
    post(api, 'pol-v2.md', POLICY.format(v='v2', day='2025-01-06', n=180))
    post(api, 'dec-7.md', DECISION.replace('project: T-Atlas', 'project: T-Atlas\nsupersedes: T-DEC-OLD'))
    assert httpx.get(f'{api}/decisions/T-DEC-OLD/compliance', timeout=60).status_code == 404
    a = ask(api, 'Was keeping customer logs for 180 days compliant in 2025?', '2025-06-30')
    assert not a['refused'] and a['compliance'][0]['decision_id'] == 'T-DEC-7'
