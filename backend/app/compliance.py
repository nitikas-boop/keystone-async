"""Deterministic compliance check (§6.5). The model never decides an outcome; it only words it."""
import json
from datetime import date

from . import db, graph, llm

# clause field -> (decision fields it needs, comparison). Returns (ok, rule text, decision value, limit).
RULES = {
    'retention_days_max': (('retention_days',), lambda d, c: (
        d['retention_days'] <= c['retention_days_max'], 'retention_days <= retention_days_max',
        d['retention_days'], c['retention_days_max'])),
    'approver_threshold_inr': (('amount_inr', 'approver_role'), lambda d, c: _threshold(d, c)),
}


def _threshold(d, c):
    limits = c['approver_threshold_inr']
    if d['approver_role'] not in limits:
        return None, f'no threshold defined for role {d["approver_role"]}', d['amount_inr'], None
    limit = limits[d['approver_role']]  # null = no upper limit for that role
    return (limit is None or d['amount_inr'] <= limit), 'amount_inr <= approver_threshold_inr[approver_role]', \
        d['amount_inr'], limit


def check_clause(fields: dict, clause: dict) -> dict:
    """One decision against one clause version. clause: policy_clauses row as dict."""
    base = {'clause_id': clause['clause_id'], 'version': clause['version'],
            'source_id': f"{clause['clause_id']}@{clause['version']}",
            'valid_from': str(clause['effective_from']),
            'valid_to': clause['effective_to'] and str(clause['effective_to']),
            'checkable': clause['checkable'], 'rule': None, 'field': None, 'decision_value': None, 'limit': None}
    if not clause['checkable']:
        return {**base, 'result': 'not_checkable', 'reason': 'clause is open-textured (checkable: false)'}
    rule_field = next((f for f in clause['fields'] if f in RULES), None)
    if rule_field is None:
        return {**base, 'result': 'not_checkable', 'reason': 'clause has no machine-checkable field'}
    needs, fn = RULES[rule_field]
    missing = [f for f in needs if f not in fields]
    if missing:
        return {**base, 'field': rule_field, 'result': 'not_checkable',
                'reason': f'decision has no {", ".join(missing)} field for this rule'}
    ok, rule, value, limit = fn(fields, clause['fields'])
    result = 'not_checkable' if ok is None else ('compliant' if ok else 'non_compliant')
    return {**base, 'rule': rule, 'field': rule_field, 'decision_value': value, 'limit': limit,
            'result': result, 'reason': rule}


def overall(checks: list[dict]) -> str:
    if not checks:
        return 'no_clause'
    results = {c['result'] for c in checks}
    for r in ('non_compliant', 'not_checkable'):
        if r in results:
            return r
    return 'compliant'


async def clause_in_force(clause_id: str, on: date) -> dict | None:
    try:
        if db.pool:
            row = await db.pool.fetchrow(
                'SELECT * FROM policy_clauses WHERE clause_id=$1 AND effective_from <= $2 '
                'AND (effective_to IS NULL OR effective_to > $2)', clause_id, on)
            if row:
                return dict(row)
    except Exception:
        pass

    from .retrieval import get_retrieval_adapter
    adapter = get_retrieval_adapter()
    if hasattr(adapter, 'get_clause_in_force'):
        return await adapter.get_clause_in_force(clause_id, on)
    return None


async def load_decision(decision_id: str) -> dict | None:
    """Decision attrs + the stable clause IDs it relied on, from the graph (covers extracted decisions too)."""
    try:
        if graph.g:
            rows = await graph.q(
                'MATCH (d:Entity {uuid: $u}) WHERE coalesce(d.rejected, false) = false '
                'OPTIONAL MATCH (d)-[r:RELATES_TO {name: "RELIED_ON"}]->(c:Entity) WHERE coalesce(r.rejected, false) = false '
                'RETURN properties(d) AS d, collect(coalesce(c.clause_id, split(c.key, "@")[0])) AS clauses, '
                'collect({key: c.key, verified: r.human_verified, confidence: r.confidence}) AS rels',
                u=graph.uid(decision_id))
            if rows and rows[0]['d'] is not None and 'decided_on' in rows[0]['d']:
                d = rows[0]['d']
                return {'id': d['key'], 'title': d['name'], 'decided_on': date.fromisoformat(d['decided_on']),
                        'status': d.get('status', 'active'), 'effect': d.get('effect', 'completed'),
                        'fields': json.loads(d.get('fields_json') or '{}'), 'clauses': sorted(set(filter(None, rows[0]['clauses']))),
                        'provenance': graph._prov(d), 'relied_on_edges': [r for r in rows[0]['rels'] if r['key']]}
    except Exception:
        pass

    from .retrieval import get_retrieval_adapter
    adapter = get_retrieval_adapter()
    if hasattr(adapter, 'decisions') and decision_id in adapter.decisions:
        d = adapter.decisions[decision_id]
        return {
            'id': d['id'],
            'title': d['title'],
            'decided_on': date.fromisoformat(d['decided_on']),
            'status': d.get('status', 'active'),
            'effect': d.get('effect', 'completed'),
            'fields': d.get('fields', {}),
            'clauses': d.get('relied_on', []),
            'provenance': {'source_doc': d.get('path', ''), 'confidence': 1.0, 'human_verified': True},
            'relied_on_edges': [{'key': f"{cid}@v1", 'verified': True, 'confidence': 1.0} for cid in d.get('relied_on', [])]
        }
    return None


def warnings_for(dec: dict, low: float) -> list[dict]:
    out = []
    p = dec['provenance']
    if not p['human_verified'] and (p['confidence'] or 0) < low:
        out.append({'fact_id': dec['id'], 'kind': 'node', 'text': dec['title'], 'confidence': p['confidence'],
                    'reason': 'unverified_low_confidence'})
    for r in dec['relied_on_edges']:
        if not r['verified'] and (r['confidence'] or 0) < low:
            out.append({'fact_id': f"{dec['id']}->{r['key']}", 'kind': 'edge', 'text': f"{dec['id']} RELIED_ON {r['key']}",
                        'confidence': r['confidence'], 'reason': 'unverified_low_confidence'})
    return out


async def evaluate(decision_id: str, as_of: date, low: float, explain: bool = True) -> dict | None:
    dec = await load_decision(decision_id)
    if dec is None:
        return None

    async def run(on: date):
        out = []
        for cid in dec['clauses']:
            clause = await clause_in_force(cid, on)
            if clause:
                out.append(check_clause(dec['fields'], clause))
        return out

    checks, current = await run(dec['decided_on']), await run(as_of)
    if explain:
        for c in checks + current:
            fallback = (f"[{dec['id']}] is {c['result'].replace('_', '-')} under [{c['source_id']}] "
                        f"({c['reason']}; value {c['decision_value']}, limit {c['limit']}).")
            c['explanation'] = await llm.explain(
                f"Decision [{dec['id']}] ({dec['title']}, decided {dec['decided_on']}) checked against clause "
                f"[{c['source_id']}] valid {c['valid_from']} to {c['valid_to'] or 'now'}. Result: {c['result']}. "
                f"Rule: {c['rule']}. Decision value: {c['decision_value']}. Limit: {c['limit']}. Note: {c['reason']}.",
                fallback)
    return {'decision_id': dec['id'], 'decided_on': dec['decided_on'].isoformat(), 'as_of': as_of.isoformat(),
            'result': overall(checks), 'checks': checks, 'current_result': overall(current), 'current': current,
            'warnings': warnings_for(dec, low)}


if __name__ == '__main__':
    # Self-check of the pure rule logic: python -m app.compliance
    ret = lambda v, ok=True: {'clause_id': 'RET-2.1', 'version': 'v2', 'effective_from': '2025-01-06',
                              'effective_to': None, 'checkable': ok, 'fields': {'retention_days_max': v}}
    assert check_clause({'retention_days': 180}, ret(180))['result'] == 'compliant'
    assert check_clause({'retention_days': 180}, ret(90))['result'] == 'non_compliant'
    assert check_clause({'retention_days': 180}, ret(90, ok=False))['result'] == 'not_checkable'
    assert check_clause({'anonymised_retention_months': 24}, ret(180))['result'] == 'not_checkable'
    proc = {'clause_id': 'PROC-3.1', 'version': 'v1', 'effective_from': '2024-01-15', 'effective_to': None,
            'checkable': True, 'fields': {'approver_threshold_inr': {'CTO': 500000, 'CEO': None}}}
    assert check_clause({'amount_inr': 400000, 'approver_role': 'CTO'}, proc)['result'] == 'compliant'
    assert check_clause({'amount_inr': 600000, 'approver_role': 'CTO'}, proc)['result'] == 'non_compliant'
    assert check_clause({'amount_inr': 9000000, 'approver_role': 'CEO'}, proc)['result'] == 'compliant'
    assert check_clause({'amount_inr': 1, 'approver_role': 'Intern'}, proc)['result'] == 'not_checkable'
    assert overall([]) == 'no_clause'
    assert overall([{'result': 'compliant'}, {'result': 'not_checkable'}]) == 'not_checkable'
    print('compliance self-check ok')
