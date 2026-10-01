"""Plugins (G). Two MCP servers (keystone, keystone-comms) and YAML rule packs for the deterministic checker.
Action plugins and third-party connectors are roadmap.

Rule-pack format (app/plugins/rulepacks/*.yaml), the list Person 2's checker accepts via contracts.load_rules:

  id: dpdp-starter            # pack id = plugin id
  name: ...
  description: ...
  rules:
    - id: DPDP-LOG-1          # stable rule id, cited in results
      title: ...
      when: {field: amount_inr, op: '>', value: 300000}   # optional: the rule applies only if this holds
      field: retention_days   # a key of the decision's structured fields
      op: '<='                # <= < >= > == != in
      value: 180
      severity: action_needed # action_needed | informational
      source: ...             # where the rule comes from (shown with the result)

load_rules() returns every rule of every enabled pack, each with `pack` added. check() is the reference evaluator.
"""
from pathlib import Path

import yaml

from .. import db

PACKS_DIR = Path(__file__).parent / 'rulepacks'
BUILTIN = [
    {'id': 'keystone-mcp', 'kind': 'mcp_server', 'name': 'Keystone MCP server', 'default': True,
     'reads': ['decisions and policies you may see', 'compliance checks', 'flags', 'review queue', 'audit chain check'],
     'does': ['propose a notification (lands in the Review Queue; a person approves)'],
     'note': 'mcp/keystone_mcp.py. Disabling it rejects every MCP session for this organisation.'},
    {'id': 'keystone-comms', 'kind': 'mcp_server', 'name': 'keystone-comms', 'default': True,
     'reads': ['people directory', 'your channels'],
     'does': ['ping_user, send_dm, post_to_channel: each only proposes; a person approves, the executor sends'],
     'note': 'mcp/keystone_comms.py. Disabling it rejects new agent actions.'},
]
OPS = {'<=': lambda a, b: a <= b, '<': lambda a, b: a < b, '>=': lambda a, b: a >= b, '>': lambda a, b: a > b,
       '==': lambda a, b: a == b, '!=': lambda a, b: a != b, 'in': lambda a, b: a in b}
ENABLED: dict[str, set[str]] = {}  # org_id -> enabled plugin ids; refreshed from plugin_state


def packs() -> list[dict]:
    out = []
    for f in sorted(PACKS_DIR.glob('*.yaml')):
        p = yaml.safe_load(f.read_text(encoding='utf-8'))
        for r in p.get('rules') or []:
            if r.get('op') not in OPS or 'field' not in r or 'id' not in r:
                raise ValueError(f'{f.name}: rule {r.get("id")} needs id, field and an op in {sorted(OPS)}')
        out.append({**p, 'kind': 'rule_pack', 'default': False, 'file': f.name,
                    'reads': ['decision fields: ' + ', '.join(sorted({r['field'] for r in p.get('rules') or []}))],
                    'does': [f"{len(p.get('rules') or [])} compliance rules for the deterministic checker"]})
    return out


def catalogue() -> list[dict]:
    return BUILTIN + packs()


async def refresh(org_id: str):
    rows = await db.pool.fetch('SELECT plugin_id, enabled FROM plugin_state WHERE org_id = $1', org_id)
    state = {r['plugin_id']: r['enabled'] for r in rows}
    ENABLED[org_id] = {p['id'] for p in catalogue() if state.get(p['id'], p['default'])}


def is_enabled(org_id: str, plugin_id: str) -> bool:
    if org_id not in ENABLED:  # not loaded yet in this process: defaults
        return next((p['default'] for p in catalogue() if p['id'] == plugin_id), False)
    return plugin_id in ENABLED[org_id]


def load_rules(org_id: str) -> list[dict]:
    return [{**r, 'pack': p['id']} for p in packs() if is_enabled(org_id, p['id']) for r in p.get('rules') or []]


def _holds(fields: dict, cond: dict) -> bool | None:
    v = fields.get(cond['field'])
    if v is None:
        return None
    try:
        return OPS[cond['op']](v, cond['value'])
    except TypeError:
        return None


def check(rule: dict, fields: dict) -> dict:
    """compliant | non_compliant | not_applicable (the rule's condition is false or a field is missing)."""
    if rule.get('when') and not _holds(fields, rule['when']):
        return {'rule': rule['id'], 'result': 'not_applicable'}
    ok = _holds(fields, rule)
    if ok is None:
        return {'rule': rule['id'], 'result': 'not_applicable'}
    return {'rule': rule['id'], 'result': 'compliant' if ok else 'non_compliant', 'severity': rule.get('severity'),
            'expected': f"{rule['field']} {rule['op']} {rule['value']}", 'actual': fields.get(rule['field'])}


if __name__ == '__main__':  # self-check: python -m app.plugins
    r = {'id': 'x', 'field': 'retention_days', 'op': '<=', 'value': 180}
    assert check(r, {'retention_days': 180})['result'] == 'compliant'
    assert check(r, {'retention_days': 300})['result'] == 'non_compliant'
    assert check(r, {})['result'] == 'not_applicable'
    w = {'id': 'y', 'when': {'field': 'amount_inr', 'op': '>', 'value': 300000}, 'field': 'approver_role', 'op': 'in',
         'value': ['CEO']}
    assert check(w, {'amount_inr': 400000, 'approver_role': 'CTO'})['result'] == 'non_compliant'
    assert check(w, {'amount_inr': 100000, 'approver_role': 'CTO'})['result'] == 'not_applicable'
    assert all(p['rules'] for p in packs())
    print('ok')
