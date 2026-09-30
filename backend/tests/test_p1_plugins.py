"""G: the plugin page and YAML rule packs. A pack switched on changes a compliance result; switched off, it does not.
contracts.load_rules is the list Person 2's checker takes."""
import asyncio

import httpx

from app import contracts, db, plugins
from conftest import TEST_GROUP
from p1_util import TEST_DB, as_, get, upload


def test_rule_evaluation():
    r = {'id': 'x', 'field': 'retention_days', 'op': '<=', 'value': 180}
    assert plugins.check(r, {'retention_days': 180})['result'] == 'compliant'
    assert plugins.check(r, {'retention_days': 300})['result'] == 'non_compliant'
    assert plugins.check(r, {})['result'] == 'not_applicable'
    w = {'id': 'y', 'when': {'field': 'amount_inr', 'op': '>', 'value': 300000}, 'field': 'approver_role',
         'op': 'in', 'value': ['CEO']}
    assert plugins.check(w, {'amount_inr': 400000, 'approver_role': 'CTO'})['result'] == 'non_compliant'
    assert plugins.check(w, {'amount_inr': 400000, 'approver_role': 'CEO'})['result'] == 'compliant'
    assert plugins.check(w, {'amount_inr': 100000, 'approver_role': 'CTO'})['result'] == 'not_applicable'
    assert {p['id'] for p in plugins.packs()} >= {'dpdp-starter', 'rbi-outsourcing'}


def test_rule_pack_toggles_a_result(api):
    upload(api, 'T-P1-VENDOR', 'Sign BigVendor contract', 'org', 'Procurement',
           fields='{amount_inr: 450000, approver_role: CTO}')
    listing = {p['id']: p for p in get(api, '/plugins', 'priya').json()}
    assert listing['keystone-mcp']['enabled'] and not listing['rbi-outsourcing']['enabled']
    assert listing['rbi-outsourcing']['reads'] and listing['rbi-outsourcing']['does']

    ours = lambda: [x for x in get(api, '/plugins/rbi-outsourcing/results', 'priya').json()['results']
                    if x['decision_id'] == 'T-P1-VENDOR']
    assert ours() == []
    assert httpx.post(f'{api}/plugins/rbi-outsourcing/enable', headers=as_('priya')).status_code == 403
    assert httpx.post(f'{api}/plugins/rbi-outsourcing/enable', headers=as_('farhan')).status_code == 200
    try:
        [hit] = ours()
        assert hit['checks'][0]['rule'] == 'RBI-OUT-1' and hit['checks'][0]['result'] == 'non_compliant'

        async def rules():  # the loader Person 2's checker calls, in another process
            await db.connect(TEST_DB)
            try:
                await plugins.refresh(TEST_GROUP)
                return contracts.load_rules(TEST_GROUP)
            finally:
                await db.pool.close()
                db.pool = None
        assert 'RBI-OUT-1' in {r['id'] for r in asyncio.run(rules())}
    finally:
        httpx.post(f'{api}/plugins/rbi-outsourcing/disable', headers=as_('farhan'))
    assert ours() == []
