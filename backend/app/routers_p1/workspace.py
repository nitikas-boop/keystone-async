"""The role-aware workspace: GET /me/permissions (the one permission map, for the UI), resolving staleness flags, and
member-proposed decisions that a lead of the domain reviews. Enforcement lives in app/permissions.py."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from . import person, signed_in
from .. import comms, db, identity, ingest, permissions

router = APIRouter(tags=['p1 workspace'])


@router.get('/me/permissions')
async def my_permissions(u: dict = Depends(signed_in)):
    return {**permissions.view(u), 'user': identity.me(u)}


# ---- staleness flags ----

class Note(BaseModel):
    note: str | None = None


@router.post('/flags/{flag_id}/resolve')
async def resolve_flag(flag_id: str, body: Note | None = None, u: dict = Depends(permissions.need('flag.resolve'))):
    """Executives: any flag. Leads: flags in their domain."""
    f = await db.pool.fetchrow('SELECT * FROM flags WHERE id = $1', flag_id)
    if f is None:
        raise HTTPException(404, 'no such flag')
    if not permissions.can(u, 'approve.any') and f['domain'] not in permissions.domains(u):
        await permissions.deny(u, f'flag:{flag_id}', f"this flag is in the {f['domain'] or 'unassigned'} domain; "
                               'a lead resolves only flags in their own', 'flag')
    async with db.pool.acquire() as c, c.transaction():
        row = await c.fetchrow('UPDATE flags SET resolved_by = $2, resolved_at = now() WHERE id = $1 '
                               'AND resolved_at IS NULL RETURNING *', flag_id, u['user_id'])
        if row is None:
            raise HTTPException(409, 'flag is already resolved')
        await db.audit(f"user:{u['user_id']}", 'flag_resolved', 'flag', flag_id, [f['decision_id']],
                       {'note': body and body.note}, conn=c)
    return {**dict(row), 'created_at': row['created_at'].isoformat(), 'resolved_at': row['resolved_at'].isoformat()}


# ---- proposed decisions (members) ----

class DecisionIn(BaseModel):
    markdown: str


def _dp_out(r) -> dict:
    d = dict(r)
    for k in ('created_at', 'decided_at'):
        d[k] = d[k] and d[k].isoformat()
    return d


async def _reviewers(org_id: str, domain: str | None) -> list[str]:
    """Leads of the domain, else the executives."""
    rows = await db.pool.fetch("SELECT m.user_id, m.tier, m.role, m.domain, u.designation, t.domain AS team_domain "
                               "FROM memberships m JOIN users u ON u.id = m.user_id LEFT JOIN teams t ON t.id = m.team_id "
                               "WHERE m.org_id = $1 AND m.status = 'active'", org_id)
    people = [{**dict(r), 'domain': r['domain'] or r['team_domain']} for r in rows]
    leads = [p['user_id'] for p in people if permissions.tier(p) == 'lead' and p['domain'] == domain]
    return leads or [p['user_id'] for p in people if permissions.tier(p) == 'executive' and p['role'] != 'auditor']


@router.post('/decision-proposals', status_code=201)
async def propose_decision(body: DecisionIn, u: dict = Depends(permissions.need('decision.propose'))):
    """A member's decision record goes to a lead of its domain for review; nothing enters the graph until accepted."""
    try:
        fm = ingest.parse(body.markdown)[0]
    except ValueError as e:
        raise HTTPException(422, str(e))
    if fm.get('doc_type') != 'decision' or not fm.get('decision_id'):
        raise HTTPException(422, 'a proposed decision needs front-matter with doc_type: decision and a decision_id')
    domain = await permissions.decision_domain(fm)
    async with db.pool.acquire() as c, c.transaction():
        row = await c.fetchrow('INSERT INTO decision_proposals (org_id, proposed_by, domain, title, markdown) '
                               'VALUES ($1,$2,$3,$4,$5) RETURNING *', u['org_id'], u['user_id'], domain,
                               str(fm.get('title') or fm['decision_id']), body.markdown)
        await db.audit(f"user:{u['user_id']}", 'decision_proposed', 'decision_proposal', str(row['id']),
                       [str(fm['decision_id'])], {'domain': domain, 'title': row['title']}, conn=c)
        for r in await _reviewers(u['org_id'], domain):
            if r != u['user_id']:
                await comms.notify(r, 'decision_proposed', str(row['id']), conn=c)
    return _dp_out(row)


async def _dp_block(u: dict, r) -> str | None:
    return await permissions.approval_block(u, domain=r['domain'], proposer=r['proposed_by'])


@router.get('/decision-proposals')
async def decision_proposals(status: str | None = None, u: dict = Depends(signed_in)):
    """Your own proposals, and the ones you may review."""
    rows = await db.pool.fetch('SELECT * FROM decision_proposals WHERE org_id = $1 AND ($2::text IS NULL OR status = $2) '
                               'ORDER BY id DESC', u['org_id'], status)
    out = []
    for r in rows:
        why = await _dp_block(u, r)
        if r['proposed_by'] == u['user_id'] or why is None:
            out.append({**_dp_out(r), 'can_review': why is None})
    return out


async def _decide(pid: int, u: dict) -> dict:
    r = await db.pool.fetchrow('SELECT * FROM decision_proposals WHERE id = $1 AND org_id = $2', pid, u['org_id'])
    if r is None or (r['proposed_by'] != u['user_id'] and await _dp_block(u, r)):
        raise HTTPException(404, 'no such proposed decision')
    why = await _dp_block(u, r)
    if why:
        await permissions.deny(u, f'decision_proposal:{pid}', why, 'decision_proposal')
    if r['status'] != 'proposed':
        raise HTTPException(409, f"proposed decision is {r['status']}")
    return r


@router.post('/decision-proposals/{pid}/accept')
async def accept_decision(pid: int, u: dict = Depends(person)):
    """The reviewer (never the proposer) sends it through normal ingestion as themselves."""
    r = await _decide(pid, u)
    fields = ingest.parse(r['markdown'])[0].get('fields') or {}
    cap, amount = u.get('approval_authority_inr'), isinstance(fields, dict) and fields.get('amount_inr')
    if cap is not None and isinstance(amount, (int, float)) and amount > cap:
        await permissions.deny(u, f'decision_proposal:{pid}', f'₹{amount:,.0f} is above your approval authority '
                               f'(₹{cap:,.0f})', 'decision_proposal')
    try:
        res = await ingest.ingest(r['markdown'], f'proposed/decision-proposal-{pid}.md', f"user:{u['user_id']}")
    except ValueError as e:
        raise HTTPException(422, str(e))
    async with db.pool.acquire() as c, c.transaction():
        row = await c.fetchrow("UPDATE decision_proposals SET status = 'accepted', decided_by = $2, decided_at = now(), "
                               "document_id = $3 WHERE id = $1 RETURNING *", pid, u['user_id'], res['document_id'])
        await db.audit(f"user:{u['user_id']}", 'approved', 'decision_proposal', str(pid), [res['document_id']],
                       {'status': 'accepted'}, conn=c)
        await comms.notify(r['proposed_by'], 'decision_accepted', res['document_id'], conn=c)
    return _dp_out(row)


class Reason(BaseModel):
    reason: str | None = None


@router.post('/decision-proposals/{pid}/reject')
async def reject_decision(pid: int, body: Reason | None = None, u: dict = Depends(person)):
    r = await _decide(pid, u)
    reason = body and body.reason
    async with db.pool.acquire() as c, c.transaction():
        row = await c.fetchrow("UPDATE decision_proposals SET status = 'rejected', decided_by = $2, decided_at = now(), "
                               "reason = $3 WHERE id = $1 RETURNING *", pid, u['user_id'], reason)
        await db.audit(f"user:{u['user_id']}", 'rejected', 'decision_proposal', str(pid), [],
                       {'status': 'rejected', 'reason': reason}, conn=c)
        await comms.notify(r['proposed_by'], 'decision_rejected', str(pid), conn=c, detail=reason)
    return _dp_out(row)
