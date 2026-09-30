"""D. /whatif and the other slash commands. Every read here goes through can_access on the server."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import compliance, db, graph, views, whatif
from ..contracts import can_access, current_user
from ..reasoning import LOW_CONFIDENCE
from .conflicts import call

router = APIRouter(tags=['p2: whatif and slash commands'])


class WhatIfIn(BaseModel):
    question: str
    as_of: date | None = None


@router.post('/whatif')
async def run_whatif(body: WhatIfIn, user: dict = Depends(current_user)):
    return await call(whatif.run(user, body.question, body.as_of or date.today()))


@router.post('/whatif/{sim_id}/promote', status_code=201)
async def promote(sim_id: int, user: dict = Depends(current_user)):
    return await call(whatif.promote(user, sim_id))


@router.get('/simulations')
async def simulations(user: dict = Depends(current_user)):
    rows = await db.pool.fetch('SELECT id, question, created_at FROM simulations WHERE org_id=$1 AND run_by=$2 '
                               'ORDER BY id DESC LIMIT 50', user['org_id'], user['user_id'])
    return [{**dict(r), 'created_at': r['created_at'].isoformat()} for r in rows]


async def decision_ok(user: dict, key: str) -> bool:
    rows = await graph.q('MATCH (n:Entity {uuid: $u}) WHERE coalesce(n.rejected, false) = false '
                         'RETURN n.visibility AS v, n.project AS p', u=graph.uid(key))
    return bool(rows) and can_access(user, {'type': 'decision', 'id': key, 'project': rows[0]['p'],
                                            'visibility': rows[0]['v'] or 'org'})


@router.get('/slash/flags')
async def open_flags(user: dict = Depends(current_user)):
    """/flags: staleness flags whose decision this user may see, with their proposal's status."""
    rows = await db.pool.fetch('SELECT f.*, p.id AS proposal_id, p.status AS proposal_status FROM flags f '
                               'LEFT JOIN proposals p ON p.flag_id = f.id ORDER BY f.created_at')
    return [{**dict(r), 'created_at': r['created_at'].isoformat()} for r in rows if await decision_ok(user, r['decision_id'])]


@router.get('/slash/explain/{flag_id}')
async def explain_flag(flag_id: str, user: dict = Depends(current_user)):
    r = await db.pool.fetchrow('SELECT * FROM flags WHERE id=$1', flag_id)
    if r is None or not await decision_ok(user, r['decision_id']):
        raise HTTPException(404, 'no such flag')  # same answer for hidden and missing
    return {'flag_id': r['id'], 'impact_type': r['impact_type'], 'severity': r['severity'],
            'explanation': r['explanation'],
            'citations': [r['decision_id'], f"{r['clause_id']}@{r['new_version']}"]
            + ([f"{r['clause_id']}@{r['old_version']}"] if r['old_version'] else [])}


@router.get('/slash/compliance/{decision_id}')
async def decision_compliance(decision_id: str, as_of: date | None = None, user: dict = Depends(current_user)):
    if not await decision_ok(user, decision_id):
        raise HTTPException(404, 'no such decision')
    out = await compliance.evaluate(decision_id, as_of or date.today(), LOW_CONFIDENCE)
    if out is None:
        raise HTTPException(404, 'no such decision')
    return out


@router.get('/slash/history/{project}')
async def history(project: str, user: dict = Depends(current_user)):
    out = await views.project_timeline(project, include_restricted=True)
    out['decisions'] = [d for d in out['decisions'] if await decision_ok(user, d['id'])]
    return out


@router.get('/slash/whois')
async def whois(q: str, user: dict = Depends(current_user)):
    """/whois <person>: role, team, and the active decisions they own that this user may see."""
    persons = await whatif.people()
    ql = q.strip().lower().removeprefix('@')
    p = next((x for x in persons if ql in (x['id'], x['name'].lower(), x['name'].split()[0].lower())), None)
    if p is None:
        raise HTTPException(404, f'no person {q!r}')
    node = (await graph.q('MATCH (n:Entity {uuid: $u}) RETURN properties(n) AS p', u=graph.uid(p['id'])))[0]['p']
    impact = await whatif.person_impact(user, p['id'])
    return {'id': p['id'], 'name': p['name'], 'role': node.get('role'), 'joined': node.get('joined'),
            'left': node.get('left'), 'team': None,  # teams arrive with Person 1's B
            'decisions': impact['decisions'], 'authority_for': impact['authority_for']}
