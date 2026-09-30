"""E: channels, messages, the notification bell, and saving a thread as a meeting note (-> Ingestion Review)."""
import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from . import editor, signed_in, spawn
from .. import access, comms, contracts, db

router = APIRouter(tags=['p1 chat'])
log = logging.getLogger('keystone.chat')


def _not_found(e: LookupError):
    return HTTPException(404, str(e))


@router.get('/channels')
async def channels(u: dict = Depends(signed_in)):
    return await comms.channels(u)


class GroupIn(BaseModel):
    name: str
    members: list[str]


@router.post('/channels', status_code=201)
async def create_group(body: GroupIn, u: dict = Depends(editor)):
    """A group channel: only its members can read, post, or see that it exists."""
    members = set(body.members) | {u['user_id']}
    async with db.pool.acquire() as c, c.transaction():
        for m in members:
            if not await comms.active_member(c, u['org_id'], m):
                raise HTTPException(422, f'{m} is not an active member')
        cid = await c.fetchval("INSERT INTO channels (org_id, name, type, created_by) VALUES ($1,$2,'group',$3) "
                               'RETURNING id', u['org_id'], body.name.strip() or 'group', u['user_id'])
        await c.executemany('INSERT INTO channel_members VALUES ($1,$2,$3)', [(cid, m, u['org_id']) for m in members])
    return {'id': cid, 'name': body.name, 'type': 'group', 'members': len(members)}


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
