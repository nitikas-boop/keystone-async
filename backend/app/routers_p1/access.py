"""B: grants, access labels, and the people directory (people cards). Access changes are audited."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from . import person, require, signed_in
from .. import access, comms, db, graph

router = APIRouter(tags=['p1 access'])


@router.get('/access/grants')
async def grants(u: dict = Depends(signed_in)):
    require(u, 'owner')
    rows = await db.pool.fetch('SELECT g.*, u.display_name FROM access_grants g JOIN users u ON u.id = g.user_id '
                               'WHERE g.org_id = $1 AND g.revoked_at IS NULL ORDER BY g.id', u['org_id'])
    return [{'id': r['id'], 'user_id': r['user_id'], 'name': r['display_name'], 'resource_id': r['resource_id'],
             'granted_by': r['granted_by'], 'created_at': r['created_at'].isoformat()} for r in rows]


class GrantIn(BaseModel):
    user_id: str
    resource_id: str


@router.post('/access/grants', status_code=201)
async def grant(body: GrantIn, u: dict = Depends(person)):
    """Open one item (whatever its label) to one person: who granted what to whom is audited."""
    require(u, 'owner')
    async with db.pool.acquire() as c, c.transaction():
        if not await comms.active_member(c, u['org_id'], body.user_id):
            raise HTTPException(422, f'{body.user_id} is not an active member')
        gid = await c.fetchval('INSERT INTO access_grants (org_id, user_id, resource_id, granted_by) '
                               'VALUES ($1,$2,$3,$4) RETURNING id', u['org_id'], body.user_id, body.resource_id,
                               u['user_id'])
        await db.audit(f"user:{u['user_id']}", 'access_granted', 'access_grant', str(gid), [body.resource_id],
                       {'user_id': body.user_id, 'resource_id': body.resource_id}, conn=c)
        await comms.notify(body.user_id, 'access_granted', body.resource_id, conn=c)
    return {'id': gid, **body.model_dump()}


@router.delete('/access/grants/{grant_id}')
async def revoke(grant_id: int, u: dict = Depends(person)):
    require(u, 'owner')
    async with db.pool.acquire() as c, c.transaction():
        r = await c.fetchrow('UPDATE access_grants SET revoked_at = now() WHERE id = $1 AND org_id = $2 '
                             'AND revoked_at IS NULL RETURNING *', grant_id, u['org_id'])
        if r is None:
            raise HTTPException(404, 'no such grant')
        await db.audit(f"user:{u['user_id']}", 'access_revoked', 'access_grant', str(grant_id), [r['resource_id']],
                       {'user_id': r['user_id'], 'resource_id': r['resource_id']}, conn=c)
    return {'id': grant_id, 'revoked': True}


class LabelIn(BaseModel):
    visibility: str
    team: str | None = None


@router.patch('/access/labels/{doc_id}')
async def relabel(doc_id: str, body: LabelIn, u: dict = Depends(person)):
    """Relabel a source (org | team | restricted); its nodes and edges follow."""
    require(u, 'owner')
    if not access.can_access(u, {'type': 'document', 'id': doc_id}, 'write'):  # documents belong to the default org
        raise HTTPException(404, f'no such document {doc_id}')
    if body.team and not await db.pool.fetchval('SELECT 1 FROM teams WHERE id = $1 AND org_id = $2', body.team,
                                                 u['org_id']):
        raise HTTPException(422, f'no such team {body.team}')
    try:
        out = await access.relabel(doc_id, body.visibility, body.team)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))
    await db.audit(f"user:{u['user_id']}", 'access_changed', 'document', doc_id, [doc_id],
                   {'visibility': body.visibility, 'team': body.team})
    return out


def _person(r) -> dict:
    return {'user_id': r['id'], 'name': r['display_name'], 'designation': r['designation'], 'role': r['role'],
            'team_id': r['team_id'], 'team': r['team'], 'person_key': r['person_key']}


PEOPLE = ('SELECT u.id, u.display_name, u.designation, u.person_key, m.role, m.team_id, t.name AS team FROM users u '
          'JOIN memberships m ON m.user_id = u.id LEFT JOIN teams t ON t.id = m.team_id '
          "WHERE m.org_id = $1 AND m.status = 'active'")


@router.get('/people')
async def people(u: dict = Depends(signed_in)):
    """The org directory: pickers for DMs, @mentions and grants."""
    return [_person(r) for r in await db.pool.fetch(PEOPLE + ' ORDER BY u.display_name', u['org_id'])]


@router.get('/people/{user_id}')
async def person_card(user_id: str, u: dict = Depends(signed_in)):
    """A people card: role, team, and the decisions they own that the viewer may see."""
    r = await db.pool.fetchrow(PEOPLE + ' AND u.id = $2', u['org_id'], user_id)
    if r is None:
        raise HTTPException(404, 'no such person')
    owned = []
    if r['person_key'] and graph.g is not None:
        g = await graph.read(date.today())
        owned = [{'id': n['id'], 'label': n['label'], 'decided_on': n['attributes'].get('decided_on')}
                 for n in g['nodes'] if n['type'] == 'Decision' and n['attributes'].get('owner') == r['person_key']]
    return {**_person(r), 'decisions': sorted(owned, key=lambda d: d['decided_on'] or '')}
