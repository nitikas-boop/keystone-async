"""Policy impact scanner (§6.6). Called by ingestion the moment a PolicyVersion commits (event-driven)."""
from datetime import date

from . import compliance, config, db, graph, llm

SEVERITY = {'ONGOING_PRACTICE_BREACH': 'action_needed', 'RULE_CHANGED_SINCE': 'informational',
            'SUPERSEDED': 'historical'}
NOTIFY = 'p-farhan@nimbus-ledger.local'  # compliance lead in the synthetic org (§7.1)


def classify(status: str, effect: str) -> str:
    if status == 'superseded':
        return 'SUPERSEDED'
    return 'ONGOING_PRACTICE_BREACH' if effect == 'ongoing' else 'RULE_CHANGED_SINCE'


def changed_clauses(old: dict[str, dict], new: dict[str, dict]) -> list[str]:
    """Clause IDs whose structured fields or checkability differ between two versions."""
    return sorted(cid for cid in new.keys() | old.keys()
                  if cid not in old or cid not in new
                  or (old[cid]['fields'], old[cid]['checkable']) != (new[cid]['fields'], new[cid]['checkable']))


async def scan(policy_id: str, version: str) -> list[dict]:
    rows = await db.pool.fetch('SELECT * FROM policy_clauses WHERE policy_id=$1', policy_id)
    new = {r['clause_id']: dict(r) for r in rows if r['version'] == version}
    if not new:
        return []
    starts = next(iter(new.values()))['effective_from']
    old = {r['clause_id']: dict(r) for r in rows if r['effective_to'] == starts}
    old_version = next(iter(old.values()))['version'] if old else None
    changed = [c for c in changed_clauses(old, new) if c in new]
    if not old or not changed:
        return []

    hits = await graph.q(
        'MATCH (d:Entity {group_id: $g})-[r:RELATES_TO {name: "RELIED_ON"}]->(c:Entity) '
        'WHERE d.type = "Decision" AND coalesce(d.rejected, false) = false AND coalesce(r.rejected, false) = false '
        'AND c.clause_id IN $changed AND d.decided_on < $starts '
        'RETURN DISTINCT d.key AS decision, c.clause_id AS clause', changed=changed, starts=starts.isoformat(), g=config.GROUP_ID)
    flags = []
    for h in hits:
        dec = await compliance.load_decision(h['decision'])
        new_check = compliance.check_clause(dec['fields'], new[h['clause']])
        if new_check['result'] != 'non_compliant':
            continue
        then = await compliance.clause_in_force(h['clause'], dec['decided_on'])
        old_check = compliance.check_clause(dec['fields'], then) if then else None
        flags.append(await _write_flag(dec, new_check, old_check, old_version))
    return [f for f in flags if f]


IMPACT_MEANING = {
    'SUPERSEDED': ' A later decision already replaced it, so this is historical only and needs no action.',
    'ONGOING_PRACTICE_BREACH': ' The practice is still running, so it breaches the new rule until it is changed.',
    'RULE_CHANGED_SINCE': (' It was a completed one-off act and is not retroactively wrong; the same act today '
                           'would need the new approval.'),
}


async def _write_flag(dec: dict, new: dict, old: dict | None, old_version: str | None) -> dict | None:
    impact = classify(dec['status'], dec['effect'])
    old_id = old['source_id'] if old else None
    flag_id = f"FLAG-{dec['id']}-{new['source_id']}"
    facts = (f"[{dec['id']}] ({dec['title']}) was {old['result'].replace('_', '-') if old else 'not linked'} under "
             f"[{old_id}] when decided on {dec['decided_on']}, but is non-compliant under [{new['source_id']}] "
             f"({new['rule']}: value {new['decision_value']}, limit {new['limit']}).")
    # State the direction and what the impact type means, so the wording model has nothing to guess.
    if old and isinstance(old.get('limit'), (int, float)) and isinstance(new.get('limit'), (int, float))             and old['limit'] != new['limit']:
        facts += f" The limit was {'lowered' if new['limit'] < old['limit'] else 'raised'} from {old['limit']} to {new['limit']}."
    facts += IMPACT_MEANING[impact]
    explanation = await llm.explain(facts, facts)

    async with db.pool.acquire() as c, c.transaction():
        inserted = await c.fetchval(
            'INSERT INTO flags (id, decision_id, clause_id, old_version, new_version, impact_type, severity, '
            'old_result, new_result, explanation) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) '
            'ON CONFLICT (id) DO NOTHING RETURNING id',
            flag_id, dec['id'], new['clause_id'], old and old['version'], new['version'], impact,
            SEVERITY[impact], old and old['result'], new['result'], explanation)
        if not inserted:
            return None  # already flagged (re-ingest): idempotent
        sources = [dec['id'], new['source_id']] + ([old_id] if old_id else [])
        await db.audit('system:scanner', 'flag_created', 'flag', flag_id, sources,
                       {'impact_type': impact, 'old': old, 'new': new}, conn=c)
        proposal_id = None
        if impact != 'SUPERSEDED':  # historical flags need no human decision
            proposal_id = await c.fetchval(
                'INSERT INTO proposals (flag_id, decision_id, clause_id, impact_type, to_addr, subject, body) '
                'VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
                flag_id, dec['id'], new['clause_id'], impact, NOTIFY,
                f"[Keystone] {impact}: {dec['id']} vs {new['source_id']}",
                f"{explanation}\n\nDecision: {dec['id']} - {dec['title']} (decided {dec['decided_on']})\n"
                f"Clause then: {old_id or 'n/a'}\nClause now: {new['source_id']}\nSeverity: {SEVERITY[impact]}\n")
            await db.audit('system:scanner', 'action_proposed', 'proposal', str(proposal_id), sources,
                           {'flag_id': flag_id, 'to': NOTIFY}, conn=c)

    starts = graph.at(date.fromisoformat(new['valid_from']))
    prov = {'source_doc': 'system:scanner', 'visibility': 'org', 'confidence': 1.0, 'extracted_by': 'human',
            'human_verified': True, 'source_start': None, 'source_end': None, 'source_quote': explanation}
    await graph.upsert_node(flag_id, 'Flag', f"{impact}: {dec['id']}", {
        'valid_from': new['valid_from'], 'impact_type': impact, 'severity': SEVERITY[impact], **prov})
    ep = graph.uid(f'episode:{new["source_id"]}')
    await graph.upsert_edge(flag_id, 'AFFECTS', dec['id'], f'{flag_id} AFFECTS {dec["id"]}', starts, prov, ep)
    await graph.upsert_edge(flag_id, 'CAUSED_BY', new['source_id'], f'{flag_id} CAUSED_BY {new["source_id"]}',
                            starts, prov, ep)
    return {'id': flag_id, 'decision_id': dec['id'], 'impact_type': impact, 'proposal_id': proposal_id}


if __name__ == '__main__':
    assert classify('superseded', 'ongoing') == 'SUPERSEDED'
    assert classify('active', 'ongoing') == 'ONGOING_PRACTICE_BREACH'
    assert classify('active', 'completed') == 'RULE_CHANGED_SINCE'
    a = {'RET-2.1': {'fields': {'retention_days_max': 180}, 'checkable': True},
         'RET-4.2': {'fields': {}, 'checkable': False}}
    b = {**a, 'RET-2.1': {'fields': {'retention_days_max': 90}, 'checkable': True}}
    assert changed_clauses(a, b) == ['RET-2.1'] and changed_clauses(a, a) == []
    assert IMPACT_MEANING.keys() == SEVERITY.keys()
    print('scanner self-check ok')
