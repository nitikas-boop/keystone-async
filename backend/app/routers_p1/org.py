"""A and B admin: the join code, pending approvals, members, roles and teams. Everything here is audited."""
import secrets
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from . import person, require, signed_in
from .. import access, comms, db, identity

router = APIRouter(tags=['p1 org'])


def _who(u: dict) -> str:
    return f"user:{u['user_id']}"


@router.get('/org')
async def org(u: dict = Depends(signed_in)):
    o = await db.pool.fetchrow('SELECT * FROM organizations WHERE id = $1', u['org_id'])
    out = {'id': o['id'], 'name': o['name'], 'require_approval': o['require_approval']}
    if u['role'] in ('owner', 'lead'):
        out['code'] = {'set': o['join_code_hash'] is not None, 'disabled': o['code_disabled'],
                       'expires_at': o['code_expires_at'] and o['code_expires_at'].isoformat(),
                       'max_uses': o['code_max_uses'], 'uses': o['code_uses']}
    return out


class CodeIn(BaseModel):
    expires_in_hours: int | None = None
    max_uses: int | None = None


@router.post('/org/code/rotate')
async def rotate_code(body: CodeIn | None = None, u: dict = Depends(person)):
    """A fresh code (the old one stops working). Shown once; only its hash is stored, and it is never logged."""
    require(u, 'owner')
    body = body or CodeIn()
    code = identity.new_code()
    exp = body.expires_in_hours and datetime.now(timezone.utc) + timedelta(hours=body.expires_in_hours)
    async with db.pool.acquire() as c, c.transaction():
        await c.execute('UPDATE organizations SET join_code_hash = $2, code_expires_at = $3, code_max_uses = $4, '
                        'code_uses = 0, code_disabled = false WHERE id = $1', u['org_id'], identity.sha(code), exp,
                        body.max_uses)
        await db.audit(_who(u), 'code_rotated', 'organization', u['org_id'], [],
                       {'expires_at': exp and exp.isoformat(), 'max_uses': body.max_uses}, conn=c)
    return {'join_code': identity.show_code(code), 'expires_at': exp and exp.isoformat(), 'max_uses': body.max_uses}


class CodeSettings(BaseModel):
    disabled: bool | None = None
    expires_in_hours: int | None = None
    max_uses: int | None = None
    require_approval: bool | None = None


@router.patch('/org/code')
async def code_settings(body: CodeSettings, u: dict = Depends(person)):
    require(u, 'owner')
    ch = body.model_dump(exclude_none=True)
    if not ch:
        raise HTTPException(422, 'nothing to change')
    exp = body.expires_in_hours and datetime.now(timezone.utc) + timedelta(hours=body.expires_in_hours)
    async with db.pool.acquire() as c, c.transaction():
        await c.execute('UPDATE organizations SET code_disabled = coalesce($2, code_disabled), '
                        'code_expires_at = CASE WHEN $3::timestamptz IS NULL THEN code_expires_at ELSE $3 END, '
                        'code_max_uses = coalesce($4, code_max_uses), '
                        'require_approval = coalesce($5, require_approval) WHERE id = $1',
                        u['org_id'], body.disabled, exp, body.max_uses, body.require_approval)
        await db.audit(_who(u), 'code_changed', 'organization', u['org_id'], [], ch, conn=c)
    return await org(u)


def _member_out(r) -> dict:
    return {'user_id': r['user_id'], 'name': r['display_name'], 'employee_id': r['employee_id'],
            'designation': r['designation'], 'role': r['role'], 'team_id': r['team_id'], 'status': r['status'],
            'joined_at': r['joined_at'].isoformat(), 'expires_at': r['expires_at'] and r['expires_at'].isoformat(),
            'audit_from': r['audit_from'] and r['audit_from'].isoformat(),
            'audit_to': r['audit_to'] and r['audit_to'].isoformat()}


@router.get('/org/members')
async def members(status: str | None = None, u: dict = Depends(signed_in)):
    """Owner: everyone. Team lead: pending requests and their own team. Everyone else: use /people."""
    require(u, 'owner', 'lead')
    rows = await db.pool.fetch('SELECT m.*, u.display_name, u.employee_id, u.designation FROM memberships m '
                               'JOIN users u ON u.id = m.user_id WHERE m.org_id = $1 '
                               'AND ($2::text IS NULL OR m.status = $2) ORDER BY m.status, u.display_name',
                               u['org_id'], status)
    if u['role'] == 'lead':
        rows = [r for r in rows if r['status'] == 'pending' or r['team_id'] in u['teams']]
    return [_member_out(r) for r in rows]


class ApproveIn(BaseModel):
    role: str = 'member'
    team_id: str | None = None


async def _team_ok(c, org_id: str, team_id: str | None):
    if team_id and not await c.fetchval('SELECT 1 FROM teams WHERE id = $1 AND org_id = $2', team_id, org_id):
        raise HTTPException(422, f'no such team {team_id}')


@router.post('/org/members/{user_id}/approve')
async def approve_join(user_id: str, body: ApproveIn | None = None, u: dict = Depends(person)):
    """Owner: any role and team. Team lead: into their own team, as a member."""
    require(u, 'owner', 'lead')
    body = body or ApproveIn()
    if u['role'] == 'lead':
        if body.role != 'member':
            raise HTTPException(403, 'a team lead can only admit members')
        body.team_id = body.team_id if body.team_id in u['teams'] else (u['teams'] or [None])[0]
    if body.role not in access.ROLES:
        raise HTTPException(422, f'role must be one of {access.ROLES}')
    async with db.pool.acquire() as c, c.transaction():
        await _team_ok(c, u['org_id'], body.team_id)
        r = await c.fetchrow("UPDATE memberships SET status = 'active', role = $3, team_id = $4 WHERE user_id = $1 "
                             "AND org_id = $2 AND status = 'pending' RETURNING *", user_id, u['org_id'], body.role,
                             body.team_id)
        if r is None:
            raise HTTPException(404, 'no pending request from that user')
        if body.team_id:
            await c.execute('INSERT INTO team_members VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', body.team_id, user_id,
                            u['org_id'])
        await db.audit(_who(u), 'join_approved', 'membership', user_id, [], {'role': body.role, 'team_id': body.team_id},
                       conn=c)
        await comms.notify(user_id, 'join_approved', None, conn=c)
    return {'user_id': user_id, 'status': 'active', 'role': body.role, 'team_id': body.team_id}


@router.post('/org/members/{user_id}/reject')
async def reject_join(user_id: str, u: dict = Depends(person)):
    require(u, 'owner', 'lead')
    async with db.pool.acquire() as c, c.transaction():
        r = await c.fetchrow("UPDATE memberships SET status = 'removed' WHERE user_id = $1 AND org_id = $2 "
                             "AND status = 'pending' RETURNING *", user_id, u['org_id'])
        if r is None:
            raise HTTPException(404, 'no pending request from that user')
        await db.audit(_who(u), 'join_rejected', 'membership', user_id, [], {}, conn=c)
    return {'user_id': user_id, 'status': 'removed'}


class MemberEdit(BaseModel):
    role: str | None = None
    team_id: str | None = None
    status: str | None = None          # 'removed' revokes all access at once
    expires_at: datetime | None = None  # auditors
    audit_from: date | None = None
    audit_to: date | None = None


@router.patch('/org/members/{user_id}')
async def edit_member(user_id: str, body: MemberEdit, u: dict = Depends(person)):
    require(u, 'owner')
    ch = body.model_dump(exclude_none=True, mode='json')
    if not ch:
        raise HTTPException(422, 'nothing to change')
    if body.role and body.role not in access.ROLES:
        raise HTTPException(422, f'role must be one of {access.ROLES}')
    if body.status and body.status not in ('active', 'removed'):
        raise HTTPException(422, "status must be 'active' or 'removed'")
    async with db.pool.acquire() as c, c.transaction():
        await _team_ok(c, u['org_id'], body.team_id)
        old = await c.fetchrow('SELECT * FROM memberships WHERE user_id = $1 AND org_id = $2 FOR UPDATE', user_id,
                               u['org_id'])
        if old is None:
            raise HTTPException(404, 'no such member')
        if old['role'] == 'owner' and (body.role not in (None, 'owner') or body.status == 'removed') and \
                await c.fetchval("SELECT count(*) FROM memberships WHERE org_id = $1 AND role = 'owner' "
                                 "AND status = 'active'", u['org_id']) <= 1:
            raise HTTPException(409, 'the organisation needs at least one owner')
        await c.execute('UPDATE memberships SET role = coalesce($3, role), team_id = coalesce($4, team_id), '
                        'status = coalesce($5, status), expires_at = coalesce($6, expires_at), '
                        'audit_from = coalesce($7, audit_from), audit_to = coalesce($8, audit_to) '
                        'WHERE user_id = $1 AND org_id = $2', user_id, u['org_id'], body.role, body.team_id,
                        body.status, body.expires_at, body.audit_from, body.audit_to)
        if body.team_id:
            await c.execute('DELETE FROM team_members WHERE user_id = $1', user_id)
            await c.execute('INSERT INTO team_members VALUES ($1,$2,$3)', body.team_id, user_id, u['org_id'])
        if body.status == 'removed':
            await c.execute('DELETE FROM team_members WHERE user_id = $1', user_id)
            await c.execute('UPDATE linked_devices SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
                            user_id)
        await db.audit(_who(u), 'member_removed' if body.status == 'removed' else 'access_changed', 'membership',
                       user_id, [], ch, conn=c)
    return {'user_id': user_id, **ch}


@router.get('/org/teams')
async def teams(u: dict = Depends(signed_in)):
    rows = await db.pool.fetch('SELECT t.*, array(SELECT user_id FROM team_members WHERE team_id = t.id ORDER BY 1) '
                               'AS members FROM teams t WHERE org_id = $1 ORDER BY name', u['org_id'])
    return [{'id': r['id'], 'name': r['name'], 'lead_id': r['lead_id'], 'projects': r['projects'],
             'members': r['members']} for r in rows]


class TeamIn(BaseModel):
    name: str
    lead_id: str | None = None
    projects: list[str] = []


@router.post('/org/teams', status_code=201)
async def create_team(body: TeamIn, u: dict = Depends(person)):
    """A team owns projects: a node whose project belongs to it is team-scoped when labelled 'team'."""
    require(u, 'owner')
    tid = f'team-{secrets.token_hex(3)}'
    async with db.pool.acquire() as c, c.transaction():
        if body.lead_id and not await comms.active_member(c, u['org_id'], body.lead_id):
            raise HTTPException(422, f'{body.lead_id} is not an active member')
        await c.execute('INSERT INTO teams (id, org_id, name, lead_id, projects) VALUES ($1,$2,$3,$4,$5)', tid,
                        u['org_id'], body.name.strip(), body.lead_id, body.projects)
        if body.lead_id:
            await c.execute('INSERT INTO team_members VALUES ($1,$2,$3)', tid, body.lead_id, u['org_id'])
        await comms.ensure_org_channels(c, u['org_id'])
        await db.audit(_who(u), 'access_changed', 'team', tid, [], body.model_dump(), conn=c)
    return {'id': tid, **body.model_dump()}


class TeamEdit(BaseModel):
    lead_id: str | None = None
    projects: list[str] | None = None
    add_member: str | None = None
    remove_member: str | None = None


@router.patch('/org/teams/{team_id}')
async def edit_team(team_id: str, body: TeamEdit, u: dict = Depends(person)):
    require(u, 'owner')
    ch = body.model_dump(exclude_none=True)
    async with db.pool.acquire() as c, c.transaction():
        await _team_ok(c, u['org_id'], team_id)
        for who in (body.lead_id, body.add_member):
            if who and not await comms.active_member(c, u['org_id'], who):
                raise HTTPException(422, f'{who} is not an active member')
        await c.execute('UPDATE teams SET lead_id = coalesce($2, lead_id), projects = coalesce($3, projects) '
                        'WHERE id = $1', team_id, body.lead_id, body.projects)
        if body.add_member:
            await c.execute('INSERT INTO team_members VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', team_id,
                            body.add_member, u['org_id'])
        if body.remove_member:
            await c.execute('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', team_id, body.remove_member)
        await db.audit(_who(u), 'access_changed', 'team', team_id, [], ch, conn=c)
    return next(t for t in await teams(u) if t['id'] == team_id)
