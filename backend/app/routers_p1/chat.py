"""E: channels, messages, the notification bell, and saving a thread as a meeting note (-> Ingestion Review)."""
import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from . import editor, signed_in, spawn
from .. import access, comms, contracts, db, permissions

router = APIRouter(tags=['p1 chat'])
log = logging.getLogger('keystone.chat')


def _not_found(e: LookupError):
    return HTTPException(404, str(e))


@router.get('/channels')
async def channels(u: dict = Depends(signed_in)):
    return await comms.channels(u)


class ChannelIn(BaseModel):
    name: str
    topic: str | None = None
    is_private: bool = False
    team_id: str | None = None      # a team channel: every team member reads it, history included
    members: list[str] = []         # a private org channel: who may read it (the creator always)


@router.post('/channels', status_code=201)
async def create_channel(body: ChannelIn, u: dict = Depends(permissions.need('channel.create'))):
    """Executives and leads. Org scope: public (everyone) or private (its members only). Team scope: a channel of a
    team the creator owns (executives: any team)."""
    name = body.name.strip().lstrip('#').lower().replace(' ', '-')
    if not name:
        raise HTTPException(422, 'channel name is required')
    async with db.pool.acquire() as c, c.transaction():
        if body.team_id:
            lead = await c.fetchval('SELECT lead_id FROM teams WHERE id = $1 AND org_id = $2', body.team_id, u['org_id'])
            if lead is None:
                raise HTTPException(404, f'no such team {body.team_id}')
            if lead != u['user_id']:
                await permissions.require_cap(u, 'team.manage_any')
        members = set(body.members) | {u['user_id']} if body.is_private and not body.team_id else set()
        for m in members:
            if not await comms.active_member(c, u['org_id'], m):
                raise HTTPException(422, f'{m} is not an active member')
        cid = await c.fetchval('INSERT INTO channels (org_id, name, type, team_id, topic, is_private, created_by) '
                               'VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id', u['org_id'], name,
                               'team' if body.team_id else 'global', body.team_id, body.topic,
                               body.is_private and not body.team_id, u['user_id'])
        if cid is None:
            raise HTTPException(409, f'#{name} already exists')
        await c.executemany('INSERT INTO channel_members VALUES ($1,$2,$3)', [(cid, m, u['org_id']) for m in members])
        await db.audit(f"user:{u['user_id']}", 'channel_created', 'channel', str(cid), [],
                       {'name': name, 'team_id': body.team_id, 'is_private': body.is_private}, conn=c)
    return next(ch for ch in await comms.channels(u) if ch['id'] == cid)


class DmIn(BaseModel):
    user_ids: list[str]


@router.post('/channels/dm')
async def open_dm(body: DmIn, u: dict = Depends(editor)):
    """The DM with these people (a small group DM if several), created on first use."""
    users = set(body.user_ids) | {u['user_id']}
    async with db.pool.acquire() as c, c.transaction():
        for m in users:
            if not await comms.active_member(c, u['org_id'], m):
                raise HTTPException(422, f'{m} is not an active member')
        cid = await comms.dm_channel(c, u['org_id'], sorted(users), u['user_id'])
    return {'id': cid}


@router.get('/channels/{cid}/messages')
async def messages(cid: int, after: int = 0, u: dict = Depends(signed_in)):
    try:
        return await comms.messages(u, cid, after)
    except LookupError as e:
        raise _not_found(e)


class MessageIn(BaseModel):
    body: str
    ref: str | None = None  # a Keystone item to share as a card (DEC-007)


@router.post('/channels/{cid}/messages', status_code=201)
async def post(cid: int, body: MessageIn, u: dict = Depends(editor)):
    try:
        out = await comms.post(u, cid, body.body, body.ref)
    except LookupError as e:
        raise _not_found(e)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except PermissionError as e:
        await permissions.deny(u, f'channel:{cid}', str(e), 'channel')
    if out['asks_keystone']:
        question = body.body.replace('@keystone', '').replace('@Keystone', '').strip()
        spawn(comms.answer_in_channel(u, cid, question))
    return out


class SaveIn(BaseModel):
    title: str
    meeting_date: date | None = None


@router.post('/channels/{cid}/save', status_code=202)
async def save_thread(cid: int, body: SaveIn, u: dict = Depends(editor)):
    """"Save as meeting note": the thread becomes a meeting_note document and goes through Person 2's ingestion
    (contracts.ingest_source), so its candidates land in Ingestion Review. Scope follows the channel."""
    try:
        doc_id, md, vis, participants = await comms.thread_markdown(u, cid, body.title.strip() or 'Chat thread',
                                                                    body.meeting_date or date.today())
    except LookupError as e:
        raise _not_found(e)
    except ValueError as e:
        raise HTTPException(422, str(e))
    await db.audit(f"user:{u['user_id']}", 'thread_saved', 'channel', str(cid), [doc_id], {'visibility': vis})
    spawn(_ingest_thread(u, doc_id, md, vis, participants))
    return {'document_id': doc_id, 'visibility': vis, 'status': 'queued'}


@router.post('/channels/{cid}/read')
async def mark_read(cid: int, u: dict = Depends(signed_in)):
    try:
        await comms.channel(u, cid)
    except LookupError as e:
        raise _not_found(e)
    await comms.mark_read(u, cid)
    return {'ok': True}


@router.post('/channels/{cid}/messages/{mid}/promote', status_code=202)
async def promote(cid: int, mid: int, body: SaveIn, u: dict = Depends(editor)):
    """"Promote to decision note": one message becomes a meeting note in Ingestion Review. Chat is otherwise never
    ingested or read by the model."""
    try:
        doc_id, md, vis, participants = await comms.thread_markdown(u, cid, body.title.strip() or 'Decision note',
                                                                    body.meeting_date or date.today(), only=mid)
    except LookupError as e:
        raise _not_found(e)
    except ValueError as e:
        raise HTTPException(422, str(e))
    await db.audit(f"user:{u['user_id']}", 'message_promoted', 'channel', str(cid), [doc_id],
                   {'message_id': mid, 'visibility': vis})
    spawn(_ingest_thread(u, doc_id, md, vis, participants))
    return {'document_id': doc_id, 'visibility': vis, 'status': 'queued'}


async def _ingest_thread(u: dict, doc_id: str, md: str, vis: str, participants: list[str]):
    try:
        if vis == 'restricted':  # a DM or group thread: restricted, opened to exactly its participants
            async with db.pool.acquire() as c, c.transaction():
                await c.executemany('INSERT INTO access_grants (org_id, user_id, resource_id, granted_by) '
                                    'VALUES ($1,$2,$3,$4)', [(u['org_id'], p, doc_id, u['user_id']) for p in participants])
        await contracts.ingest_source(md, f'chat/{doc_id}.md', f"user:{u['user_id']}", vis)
        if vis == 'team':  # until ingestion stamps label_for() itself, pin the team on what the note produced
            team = next((ln.split(':', 1)[1].strip() for ln in md.splitlines() if ln.startswith('team:')), None)
            await access.relabel(doc_id, vis, team)
        await comms.notify(u['user_id'], 'note_saved', doc_id)
    except Exception:
        log.exception('saving thread %s failed', doc_id)
        await comms.notify(u['user_id'], 'note_failed', doc_id)


@router.get('/notifications')
async def notifications(u: dict = Depends(signed_in)):
    items = await comms.notifications(u)
    return {'unread': sum(not n['read'] for n in items), 'items': items}


@router.post('/notifications/{nid}/read')
async def read_one(nid: int, u: dict = Depends(signed_in)):
    await db.pool.execute('UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL',
                          nid, u['user_id'])
    return {'ok': True}


@router.post('/notifications/read-all')
async def read_all(u: dict = Depends(signed_in)):
    await db.pool.execute('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL',
                          u['user_id'])
    return {'ok': True}
