"""H: link a phone by QR. The signed-in laptop shows a one-time token (valid PAIRING_TTL_SECONDS); the phone opens the
pairing link, claims the token and gets its own revocable device session. Every pairing is audited (device_paired)."""
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from . import ip, person, signed_in
from .auth import set_session
from .. import comms, config, db, identity

router = APIRouter(tags=['p1 devices'])


def _device(r) -> dict:
    return {'id': r['id'], 'label': r['label'], 'created_at': r['created_at'].isoformat(),
            'last_seen': r['last_seen'] and r['last_seen'].isoformat(),
            'revoked_at': r['revoked_at'] and r['revoked_at'].isoformat()}


@router.post('/devices/pair', status_code=201)
async def start_pairing(u: dict = Depends(person)):
    """A fresh one-time token for the QR. Only a laptop session can pair: a phone cannot pair further phones."""
    if u.get('device_id'):
        raise HTTPException(403, 'pair from a laptop session, not from a linked phone')
    token = secrets.token_urlsafe(24)
    exp = datetime.now(timezone.utc) + timedelta(seconds=config.PAIRING_TTL_SECONDS)
    await db.pool.execute('INSERT INTO pairing_tokens (token_hash, org_id, user_id, expires_at) VALUES ($1,$2,$3,$4)',
                          identity.sha(token), u['org_id'], u['user_id'], exp)
    return {'token': token, 'expires_at': exp.isoformat(), 'ttl_seconds': config.PAIRING_TTL_SECONDS}


@router.get('/devices/pair/status')
async def pairing_status(token: str, u: dict = Depends(signed_in)):
    r = await db.pool.fetchrow('SELECT p.*, d.label FROM pairing_tokens p LEFT JOIN linked_devices d ON d.id = p.device_id '
                               'WHERE p.token_hash = $1 AND p.user_id = $2', identity.sha(token), u['user_id'])
    if r is None:
        raise HTTPException(404, 'no such pairing')
    expired = r['used_at'] is None and r['expires_at'] <= datetime.now(timezone.utc)
    return {'paired': r['used_at'] is not None, 'expired': expired, 'device': r['label']}


class ClaimIn(BaseModel):
    token: str
    label: str = 'Phone'


@router.post('/devices/claim')
async def claim(body: ClaimIn, request: Request, response: Response):
    """The phone's side (public: the token is the credential). Single use, expires in about a minute."""
    if not identity.claim_limit.allow(ip(request)):
        raise HTTPException(429, 'too many attempts; wait a few minutes')
    async with db.pool.acquire() as c, c.transaction():
        t = await c.fetchrow('UPDATE pairing_tokens SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL '
                             'AND expires_at > now() RETURNING *', identity.sha(body.token))
        if t is None:
            raise HTTPException(400, 'this pairing code has expired or was already used; show a new QR')
        did = await c.fetchval('INSERT INTO linked_devices (org_id, user_id, label) VALUES ($1,$2,$3) RETURNING id',
                               t['org_id'], t['user_id'], (body.label or 'Phone')[:60])
        await c.execute('UPDATE pairing_tokens SET device_id = $2 WHERE token_hash = $1', t['token_hash'], did)
        await db.audit(f"user:{t['user_id']}", 'device_paired', 'device', str(did), [], {'label': body.label}, conn=c)
        await comms.notify(t['user_id'], 'device_paired', str(did), conn=c)
    user = await identity.load_user(t['user_id'], 'device', did)
    if user is None:
        raise HTTPException(403, 'this account is not active')
    set_session(request, response, identity.make_token(t['user_id'], 'device', did),
                config.DEVICE_SESSION_DAYS * 86400)
    return identity.me(user)


@router.get('/devices')
async def devices(u: dict = Depends(signed_in)):
    rows = await db.pool.fetch('SELECT * FROM linked_devices WHERE user_id = $1 ORDER BY id DESC', u['user_id'])
    return [_device(r) for r in rows]


@router.delete('/devices/{device_id}')
async def revoke(device_id: int, u: dict = Depends(person)):
    """Revoking ends that phone's session on its next request."""
    async with db.pool.acquire() as c, c.transaction():
        r = await c.fetchrow('UPDATE linked_devices SET revoked_at = now() WHERE id = $1 AND user_id = $2 '
                             'AND revoked_at IS NULL RETURNING *', device_id, u['user_id'])
        if r is None:
            raise HTTPException(404, 'no such device')
        await db.audit(f"user:{u['user_id']}", 'device_revoked', 'device', str(device_id), [], {'label': r['label']},
                       conn=c)
    return _device(r)
