"""E/G: the gate for agent-originated actions. An agent (keystone-comms over MCP, or @keystone) can only create a
proposed_actions row; a person approves it; the executor process delivers it. Every step is audited."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from . import editor, person, signed_in
from .. import comms, db, graph, permissions, plugins

router = APIRouter(tags=['p1 agent actions'])
REQUIRED = {'ping_user': ('user_id', 'reason'), 'send_dm': ('user_id', 'body'), 'post_to_channel': ('channel_id', 'body')}


def _out(r) -> dict:
    d = dict(r)
    for k in ('created_at', 'decided_at', 'executed_at'):
        d[k] = d[k] and d[k].isoformat()
    return d


def _actor(u: dict) -> str:
    return f"user:{u['user_id']}" + (':mcp' if u.get('via') == 'mcp' else '')


class ActionIn(BaseModel):
    tool: str
    payload: dict


@router.post('/actions', status_code=201)
async def propose(body: ActionIn, u: dict = Depends(editor)):
    """Propose ping_user(user_id, reason, ref_id?), send_dm(user_id, body) or post_to_channel(channel_id, body).
    Fails if the target is outside what the proposing user may reach."""
    if not plugins.is_enabled(u['org_id'], 'keystone-comms'):
        raise HTTPException(403, 'the keystone-comms plugin is disabled for this organisation')
    if body.tool not in REQUIRED:
        raise HTTPException(422, f'tool must be one of {sorted(REQUIRED)}')
    p = {k: v for k, v in body.payload.items() if k in (*REQUIRED[body.tool], 'ref_id')}
    missing = [k for k in REQUIRED[body.tool] if not str(p.get(k) or '').strip()]
    if missing:
        raise HTTPException(422, f'{body.tool} needs {", ".join(missing)}')
    if p.get('ref_id') and await graph.hidden_keys([p['ref_id']]):
        raise HTTPException(404, f"no such item {p['ref_id']}")
    async with db.pool.acquire() as c, c.transaction():
        if 'user_id' in p and not await comms.active_member(c, u['org_id'], p['user_id']):
            raise HTTPException(404, f"no such person {p['user_id']}")
        if 'channel_id' in p:
            try:
                await comms.channel(u, int(p['channel_id']), c)
            except (LookupError, ValueError):
                raise HTTPException(404, 'no such channel')
        row = await c.fetchrow('INSERT INTO proposed_actions (org_id, tool, payload, proposed_by, via) '
                               'VALUES ($1,$2,$3,$4,$5) RETURNING *', u['org_id'], body.tool, p, u['user_id'],
                               u.get('via') or 'web')
        # Metadata only: the payload hash covers the text, the text itself is not in the log.
        await db.audit(_actor(u), 'agent_message_proposed', 'proposed_action', str(row['id']),
                       [p['ref_id']] if p.get('ref_id') else [], {'tool': body.tool, 'payload': p}, conn=c)
        await comms.notify(u['user_id'], 'action_proposed', str(row['id']), conn=c)
    return _out(row)


async def _block(u: dict, r) -> str | None:
    return await permissions.approval_block(u, domain=r['domain'], proposer=r['proposed_by'])


async def _may_see(u: dict, r) -> bool:
    """The proposer sees their own; an approver sees the ones they may decide (not their own: separation of duties)."""
    return r['proposed_by'] == u['user_id'] or await _block(u, r) is None


@router.get('/actions')
async def actions(status: str | None = None, u: dict = Depends(signed_in)):
    rows = await db.pool.fetch('SELECT * FROM proposed_actions WHERE org_id = $1 AND ($2::text IS NULL OR status = $2) '
                               'ORDER BY id DESC', u['org_id'], status)
    return [{**_out(r), 'can_approve': await _block(u, r) is None} for r in rows if await _may_see(u, r)]


async def _decide(aid: int, u: dict, action: str, status: str | None = None, text: dict | None = None, payload=None):
    """Only a proposed row can be edited, approved or rejected; only the executor moves approved -> executed."""
    pre = await db.pool.fetchrow('SELECT * FROM proposed_actions WHERE id = $1 AND org_id = $2', aid, u['org_id'])
    if pre is not None and status is not None and await _may_see(u, pre):  # the proposer may still reword a draft
        why = await _block(u, pre)
        if why:
            await permissions.deny(u, f'proposed_action:{aid}', why, 'proposed_action')
    async with db.pool.acquire() as c, c.transaction():
        row = await c.fetchrow('SELECT * FROM proposed_actions WHERE id = $1 AND org_id = $2 FOR UPDATE', aid,
                               u['org_id'])
        if row is None or not await _may_see(u, row):
            raise HTTPException(404, 'no such action')
        if row['status'] != 'proposed':
            raise HTTPException(409, f"action is {row['status']}, not proposed")

        row = await c.fetchrow('UPDATE proposed_actions SET status = coalesce($2, status), payload = payload || $3, '
                               'decided_by = CASE WHEN $2::text IS NULL THEN decided_by ELSE $4 END, '
                               'decided_at = CASE WHEN $2::text IS NULL THEN decided_at ELSE now() END '
                               'WHERE id = $1 RETURNING *', aid, status, text or {}, u['user_id'])
        await db.audit(f"user:{u['user_id']}", action, 'proposed_action', str(aid), [],
                       payload or {'status': row['status']}, conn=c)
        if status:
            await comms.notify(row['proposed_by'], f'action_{status}', str(aid), conn=c,
                               detail=(payload or {}).get('reason'))
    return _out(row)


class Edit(BaseModel):
    payload: dict


@router.patch('/actions/{aid}')
async def edit(aid: int, body: Edit, u: dict = Depends(person)):
    """Edit the wording before approving; the target cannot be changed here."""
    text = {k: str(v) for k, v in body.payload.items() if k in ('reason', 'body')}
    if not text:
        raise HTTPException(422, 'only reason or body can be edited')
    return await _decide(aid, u, 'edited', text=text, payload=text)


@router.post('/actions/{aid}/approve')
async def approve(aid: int, u: dict = Depends(person)):
    return await _decide(aid, u, 'approved', 'approved')


class Reason(BaseModel):
    reason: str | None = None


@router.post('/actions/{aid}/reject')
async def reject(aid: int, body: Reason | None = None, u: dict = Depends(person)):
    return await _decide(aid, u, 'rejected', 'rejected', payload={'status': 'rejected', 'reason': body and body.reason})
