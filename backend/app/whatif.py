"""D. /whatif (alias /what-if): parse -> structured hypothetical -> in-memory overlay -> deterministic dry-run check
-> LLM wording -> impact report labelled HYPOTHETICAL. Nothing touches the graph or the policy tables; every run
is one simulations row (simulation = true) and one audit row. "Turn this into a draft proposal" is the only way a
simulation becomes anything real, and it goes through the normal claim, review and approval path (C)."""
import copy
import json
import re
from datetime import date, timedelta

from . import compliance, config, conflicts, db, graph, llm
from .contracts import audit, can_access
from .prompts_p2 import WHATIF_PARSE_PROMPT

LABEL = 'HYPOTHETICAL: nothing has changed'
SCOPE = 'Impact on recorded decisions'
# Deterministic fast path, e.g. "RET-2.1.retention_days_max = 60 effective 2027-01-01" or
# "PROC-3.1.approver_threshold_inr[CTO] = 100000".
STRUCT = re.compile(r'^(?P<clause>[A-Z][A-Za-z0-9-]*(?:\.\d+)*)\.(?P<field>[a-z_]\w*)(?:\[(?P<role>\w+)\])?\s*=\s*(?P<value>[\d,_]+(?:\.\d+)?)'
                    r'(?:\s+(?:effective|from)\s+(?P<eff>\d{4}-\d{2}-\d{2}))?\s*\??$')
LEAVES = re.compile(r'^(?P<person>p-[a-z]+)\s+leaves\s*\??$', re.I)
COMMAND = re.compile(r'^\s*/what-?if\b\s*', re.I)

SCHEMA = {'type': 'object', 'required': ['kind'], 'properties': {
    'kind': {'type': 'string', 'enum': ['policy_change', 'person_leaves', 'unsupported']},
    'clause_id': {'type': 'string'}, 'field': {'type': 'string'}, 'role': {'type': ['string', 'null']},
    'new_value': {'type': ['number', 'null']}, 'effective_from': {'type': ['string', 'null']},
    'person_id': {'type': ['string', 'null']}}}
UNSUPPORTED = ('I can simulate a policy change (e.g. "/whatif retention drops to 60 days") or a person leaving '
               '(e.g. "/whatif Karthik leaves"). Other kinds are not supported yet.')


async def clause_catalog(on: date) -> list[dict]:
    rows = await db.pool.fetch('SELECT * FROM policy_clauses WHERE checkable AND effective_from <= $1 AND '
                               '(effective_to IS NULL OR effective_to > $1) ORDER BY clause_id', on)
    return [{'clause_id': r['clause_id'], 'version': r['version'], 'title': r['title'], 'fields': r['fields']}
            for r in rows]


async def people() -> list[dict]:
    rows = await graph.q('MATCH (n:Entity {group_id: $g, type: "Person"}) WHERE coalesce(n.rejected, false) = false '
                         'RETURN n.key AS id, n.name AS name', g=config.GROUP_ID)
    return [dict(r) for r in rows]


def validate(h: dict, catalog: list[dict], persons: list[dict]) -> dict:
    kind = h.get('kind')
    if kind == 'policy_change':
        cl = next((c for c in catalog if c['clause_id'] == h.get('clause_id')), None)
        if cl is None:
            raise ValueError(f"no checkable clause {h.get('clause_id')!r} is in force; known: "
                             + ', '.join(c['clause_id'] for c in catalog))
        field = h.get('field')
        if field not in cl['fields']:
            raise ValueError(f"{cl['clause_id']} has no field {field!r}; it has {', '.join(cl['fields'])}")
        v = h.get('new_value')
        if isinstance(v, bool) or not isinstance(v, (int, float)) or v < 0:
            raise ValueError('the new value must be a non-negative number')
        role = None
        if isinstance(cl['fields'][field], dict):
            role = h.get('role')
            if role not in cl['fields'][field]:
                raise ValueError(f"which role's limit? one of {', '.join(cl['fields'][field])}")
        eff = h.get('effective_from')
        if eff:
            eff = date.fromisoformat(str(eff)).isoformat()
        return {'kind': kind, 'clause_id': cl['clause_id'], 'field': field, 'role': role,
                'new_value': int(v) if float(v).is_integer() else v, 'effective_from': eff or None}
    if kind == 'person_leaves':
        pid = h.get('person_id') or ''
        p = next((x for x in persons if pid.lower() in (x['id'], x['name'].lower(), x['name'].split()[0].lower())), None)
        if p is None:
            raise ValueError(f'no person {pid!r}; known: ' + ', '.join(x['id'] for x in persons))
        return {'kind': kind, 'person_id': p['id'], 'name': p['name']}
    raise ValueError(UNSUPPORTED)


async def parse(question: str, as_of: date) -> dict:
    q = COMMAND.sub('', question).strip()
    if not q:
        raise ValueError(UNSUPPORTED)
    catalog, persons = await clause_catalog(as_of), await people()
    if m := STRUCT.match(q):
        h = {'kind': 'policy_change', 'clause_id': m['clause'], 'field': m['field'], 'role': m['role'],
             'new_value': float(m['value'].replace(',', '').replace('_', '')), 'effective_from': m['eff']}
    elif m := LEAVES.match(q):
        h = {'kind': 'person_leaves', 'person_id': m['person'].lower()}
    else:
        try:
            h = await llm.chat_json(WHATIF_PARSE_PROMPT, f'Clauses in force on {as_of}: {json.dumps(catalog, default=str)}\n'
                                    f'People: {json.dumps(persons)}\n\nQuestion: {q}', SCHEMA, timeout=120)
        except Exception as e:
            raise ValueError(f'could not parse the question with the local model ({type(e).__name__}); try the '
                             'structured form, e.g. "/whatif RET-2.1.retention_days_max = 60"') from e
        if h.get('effective_from') and str(h['effective_from']) not in q:
            h['effective_from'] = None  # the model never supplies a date the question did not state
    return validate(h, catalog, persons)


def verdict(before: str, after: str, effect: str) -> str:
    if after == 'non_compliant' and before != 'non_compliant':
        # A completed one-off act is not retroactively wrong; repeating it would be.
        return 'would_violate' if effect == 'ongoing' else 'would_violate_if_repeated'
    if after == 'non_compliant':
        return 'already_non_compliant'
    if after == 'compliant':
        return 'would_become_compliant' if before == 'non_compliant' else 'still_compliant'
    return 'not_checkable'


def _side(c: dict) -> dict:
    return {k: c[k] for k in ('result', 'decision_value', 'limit', 'source_id')}


async def policy_impact(user: dict, clause_id: str, field: str, new_value, effective_from, role: str | None) -> dict:
    """In-memory overlay + the deterministic checker in dry-run mode, over the decisions this user may see."""
    on = date.fromisoformat(effective_from) if isinstance(effective_from, str) else (effective_from or date.today())
    current = await compliance.clause_in_force(clause_id, on) or await compliance.clause_in_force(clause_id, date.today())
    if current is None:
        raise ValueError(f'no version of {clause_id} is in force')
    fields = copy.deepcopy(current['fields'])
    if role:
        fields[field][role] = new_value
    else:
        fields[field] = new_value
    overlay = {**current, 'version': 'HYPOTHETICAL', 'fields': fields, 'effective_from': on, 'effective_to': None}
    hits = await graph.q(
        'MATCH (d:Entity {group_id: $g})-[r:RELATES_TO {name: "RELIED_ON"}]->(c:Entity) '
        'WHERE d.type = "Decision" AND c.clause_id = $cid AND coalesce(d.rejected, false) = false '
        'AND coalesce(r.rejected, false) = false AND coalesce(d.status, "active") = "active" '
        'RETURN DISTINCT d.key AS id, d.name AS title, d.owner AS owner, d.effect AS effect, d.project AS project, '
        'd.visibility AS visibility, d.fields_json AS fields ORDER BY id', g=config.GROUP_ID, cid=clause_id)
    rows = []
    for h in hits:
        if not can_access(user, {'type': 'decision', 'id': h['id'], 'project': h['project'],
                                 'visibility': h['visibility'] or 'org'}):
            continue  # never used, never counted: the report shows only the asker's visible work
        f = json.loads(h['fields'] or '{}')
        before, after = compliance.check_clause(f, current), compliance.check_clause(f, overlay)
        rows.append({'decision_id': h['id'], 'title': h['title'], 'owner': h['owner'], 'effect': h['effect'] or 'completed',
                     'before': _side(before), 'after': _side(after),
                     'verdict': verdict(before['result'], after['result'], h['effect'] or 'completed')})
    counts = {}
    for r in rows:
        counts[r['verdict']] = counts.get(r['verdict'], 0) + 1
    return {'current': {'source_id': f"{clause_id}@{current['version']}", 'fields': current['fields'],
                        'text': current['text']},
            'hypothetical': {'source_id': f'{clause_id}@HYPOTHETICAL', 'fields': fields, 'effective_from': on.isoformat()},
            'rows': rows, 'counts': counts}


async def person_impact(user: dict, person_id: str) -> dict:
    hits = await graph.q(
        'MATCH (d:Entity {group_id: $g})-[m:RELATES_TO {name: "MADE_BY"}]->(p:Entity {key: $p}) '
        'WHERE d.type = "Decision" AND coalesce(d.rejected, false) = false AND coalesce(m.rejected, false) = false '
        'AND coalesce(d.status, "active") = "active" '
        'RETURN DISTINCT d.key AS id, d.name AS title, d.effect AS effect, d.project AS project, '
        'd.visibility AS visibility ORDER BY id', g=config.GROUP_ID, p=person_id)
    decisions = [{'decision_id': h['id'], 'title': h['title'], 'effect': h['effect'], 'project': h['project']}
                 for h in hits if can_access(user, {'type': 'decision', 'id': h['id'], 'project': h['project'],
                                                    'visibility': h['visibility'] or 'org'})]
    authority_for = sorted(p for p, a in conflicts.AUTHORITY.items() if a == person_id)
    claims = [dict(r) for r in await db.pool.fetch(
        'SELECT id, resource_ref, expires_at::text FROM claims WHERE org_id=$1 AND owner_id=$2 AND released_at IS NULL '
        'AND expires_at > now()', user['org_id'], person_id)]
    collisions = [r['id'] for r in await db.pool.fetch(
        "SELECT id FROM collisions WHERE org_id=$1 AND status='open' AND authority_id=$2", user['org_id'], person_id)]
    return {'person_id': person_id, 'decisions': decisions, 'authority_for': authority_for, 'claims': claims,
            'open_collisions': collisions}


async def run(user: dict, question: str, as_of: date) -> dict:
    h = await parse(question, as_of)
    if h['kind'] == 'policy_change':
        impact = await policy_impact(user, h['clause_id'], h['field'], h['new_value'], h['effective_from'], h['role'])
        cur, hyp = impact['current'], impact['hypothetical']
        broken = [r for r in impact['rows'] if r['verdict'].startswith('would_violate')]
        what = f"{h['field']}{'[' + h['role'] + ']' if h['role'] else ''} = {h['new_value']}"
        facts = (f"Hypothetically [{hyp['source_id']}] sets {what} (in force now under [{cur['source_id']}]: "
                 f"{json.dumps(cur['fields'])}). {len(impact['rows'])} recorded decision(s) rely on {h['clause_id']}; "
                 f"{len(broken)} would violate it" + (': ' + ', '.join(
                     f"[{r['decision_id']}] (value {r['after']['decision_value']}, limit {r['after']['limit']})"
                     for r in broken) if broken else '') + '.')
        owners = sorted({r['owner'] for r in broken if r['owner']})
        suggested = ([f'Notify {len(owners)} owner(s): {", ".join(owners)}', 'Draft revision proposals'] if broken
                     else ['No recorded decision would break; no action needed'])
        cited = [cur['source_id'], hyp['source_id']] + [r['decision_id'] for r in impact['rows']]
        body = {'impact': impact}
    else:
        impact = await person_impact(user, h['person_id'])
        facts = (f"If {h['name']} ({h['person_id']}) leaves, {len(impact['decisions'])} active recorded decision(s) lose "
                 f"their owner" + (': ' + ', '.join(f"[{d['decision_id']}]" for d in impact['decisions'])
                                  if impact['decisions'] else '')
                 + (f"; they are the authority for {', '.join(impact['authority_for'])}" if impact['authority_for'] else '')
                 + f"; {len(impact['claims'])} open claim(s) and {len(impact['open_collisions'])} open collision(s) "
                   'would need reassigning.')
        suggested = ['Reassign ownership of those decisions', 'Name a new authority'] if impact['decisions'] or \
            impact['authority_for'] else ['Nothing recorded depends on this person']
        cited = [d['decision_id'] for d in impact['decisions']]
        body = {'person': impact}
    # The model words the clause comparison (it cites both versions); a list of owned records is clearer verbatim,
    # and a 7B rewrite of it garbled who holds which role.
    explanation = await llm.explain(facts, facts) if h['kind'] == 'policy_change' else facts
    result = {'label': LABEL, 'scope': SCOPE, 'question': question, 'as_of': as_of.isoformat(), 'hypothetical': h,
              **body, 'facts': facts, 'explanation': explanation, 'suggested_actions': suggested, 'citations': cited,
              'can_promote': h['kind'] == 'policy_change' and user['role'] in conflicts.REVIEWER_ROLES}
    async with db.pool.acquire() as c, c.transaction():
        sid = await c.fetchval('INSERT INTO simulations (org_id, run_by, question, hypothetical_json, result_json) '
                               'VALUES ($1,$2,$3,$4,$5) RETURNING id', user['org_id'], user['user_id'], question, h, result)
        await audit.write('simulation_run', user['actor'], {'simulation': True, 'hypothetical': h,
                          'counts': body.get('impact', {}).get('counts')}, 'simulation', sid, cited, conn=c)
    return {**result, 'simulation_id': sid}


def rewrite_text(text: str, old, new) -> str:
    """Clause wording for the draft: swap the old number for the new one when it appears exactly once."""
    if isinstance(old, (int, float)) and len(re.findall(rf'(?<![\d,.]){old:g}(?![\d,])', text)) == 1:
        return re.sub(rf'(?<![\d,.]){old:g}(?![\d,])', f'{new:g}', text)
    return f'{text} (Proposed: {new}.)'


async def promote(user: dict, sim_id: int) -> dict:
    """Only authorities can turn a what-if into a draft proposal; it then follows the normal C lifecycle."""
    if user['role'] not in conflicts.REVIEWER_ROLES:
        raise conflicts.Forbidden('only an authority (Team lead, Compliance or an Owner) can promote a what-if')
    s = await db.pool.fetchrow('SELECT * FROM simulations WHERE id=$1 AND org_id=$2', sim_id, user['org_id'])
    if s is None:
        raise LookupError('no such simulation')
    h = s['hypothetical_json']
    if h['kind'] != 'policy_change':
        raise ValueError('only a policy-change what-if can become a proposal')
    cur = await compliance.clause_in_force(h['clause_id'], date.today())
    latest = await db.pool.fetchval('SELECT max(effective_from) FROM policy_clauses WHERE policy_id=$1', cur['policy_id'])
    eff = date.fromisoformat(h['effective_from']) if h['effective_from'] else max(date.today(), latest) + timedelta(days=1)
    old = cur['fields'][h['field']]
    value = {**old, h['role']: h['new_value']} if h['role'] else h['new_value']
    return await conflicts.create_proposal(user, {
        'policy_id': cur['policy_id'], 'clause_id': h['clause_id'],
        'title': f"{cur['title']}: {h['field']} {h['new_value']}",
        'clause_text': cur['text'] if h['role'] else rewrite_text(cur['text'], old, h['new_value']),
        'field': h['field'], 'new_value': value, 'effective_from': eff,
        'rationale': f"From what-if simulation #{sim_id}: {s['question']}", 'from_simulation': sim_id})


if __name__ == '__main__':
    cat = [{'clause_id': 'RET-2.1', 'version': 'v3', 'title': 'Retention', 'fields': {'retention_days_max': 90}},
           {'clause_id': 'PROC-3.1', 'version': 'v2', 'title': 'Proc', 'fields': {'approver_threshold_inr': {'CTO': 1, 'CEO': None}}}]
    ppl = [{'id': 'p-karthik', 'name': 'Karthik Rao'}]
    assert validate({'kind': 'policy_change', 'clause_id': 'RET-2.1', 'field': 'retention_days_max', 'new_value': 60.0},
                    cat, ppl)['new_value'] == 60
    assert validate({'kind': 'person_leaves', 'person_id': 'Karthik'}, cat, ppl)['person_id'] == 'p-karthik'
    for bad in ({'kind': 'policy_change', 'clause_id': 'X-1', 'field': 'f', 'new_value': 1},
                {'kind': 'policy_change', 'clause_id': 'PROC-3.1', 'field': 'approver_threshold_inr', 'new_value': 5},
                {'kind': 'unsupported'}):
        try:
            validate(bad, cat, ppl)
            raise AssertionError(bad)
        except ValueError:
            pass
    m = STRUCT.match('RET-2.1.retention_days_max = 60 effective 2027-01-01')
    assert m and m['clause'] == 'RET-2.1' and m['eff'] == '2027-01-01'
    assert STRUCT.match('PROC-3.1.approver_threshold_inr[CTO] = 1,00,000')['role'] == 'CTO'
    assert STRUCT.match('T-RET-W1.nope = 5')['clause'] == 'T-RET-W1'
    assert COMMAND.sub('', '/what-if Karthik leaves?') == 'Karthik leaves?'
    assert verdict('compliant', 'non_compliant', 'ongoing') == 'would_violate'
    assert verdict('compliant', 'non_compliant', 'completed') == 'would_violate_if_repeated'
    assert rewrite_text('no longer than 90 days.', 90, 60) == 'no longer than 60 days.'
    print('whatif self-check ok')
