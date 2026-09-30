"""H: QR pairing. A one-time token that expires, a device session that can approve, a linked-devices list, revoke,
and an audit row per pairing."""
import asyncio

import asyncpg
import httpx

from app import identity
from p1_util import TEST_DB, as_


def sql(q, *a):
    async def go():
        c = await asyncpg.connect(TEST_DB)
        try:
            return await c.fetch(q, *a)
        finally:
            await c.close()
    return asyncio.run(go())


def pair(api, user='priya'):
    r = httpx.post(f'{api}/devices/pair', headers=as_(user))
    assert r.status_code == 201, r.text
    return r.json()['token']


def test_pair_use_and_revoke(api):
    token = pair(api)
    assert httpx.get(f'{api}/devices/pair/status', params={'token': token}, headers=as_('priya')).json()['paired'] is False
    phone = httpx.post(f'{api}/devices/claim', json={'token': token, 'label': 'Priya Pixel'})
    assert phone.status_code == 200 and phone.json()['via'] == 'device', phone.text
    assert httpx.get(f'{api}/devices/pair/status', params={'token': token}, headers=as_('priya')).json() == \
        {'paired': True, 'expired': False, 'device': 'Priya Pixel'}
    assert httpx.post(f'{api}/devices/claim', json={'token': token}).status_code == 400  # one-time

    p = httpx.Client(base_url=api, cookies=phone.cookies)
    assert p.get('/auth/me').json()['user_id'] == 'priya'
    assert p.get('/proposals').status_code == 200 and p.get('/actions').status_code == 200
    assert p.post('/devices/pair').status_code == 403  # a phone cannot pair more phones
    a = httpx.post(f'{api}/actions', json={'tool': 'send_dm', 'payload': {'user_id': 'sneha', 'body': 'from the phone'}},
                   headers=as_('priya')).json()
    assert p.post(f"/actions/{a['id']}/approve").json()['status'] == 'approved'  # a person, on their phone
    dev = next(d for d in httpx.get(f'{api}/devices', headers=as_('priya')).json() if d['label'] == 'Priya Pixel')
    assert sql("SELECT 1 FROM audit_log WHERE action = 'device_paired' AND object_id = $1", str(dev['id']))

    assert httpx.delete(f"{api}/devices/{dev['id']}", headers=as_('sneha')).status_code == 404  # not hers
    assert httpx.delete(f"{api}/devices/{dev['id']}", headers=as_('priya')).status_code == 200
    assert p.get('/auth/me').status_code == 401 and p.get('/proposals').status_code == 401


def test_expired_and_forged_tokens_fail(api):
    token = pair(api)
    sql("UPDATE pairing_tokens SET expires_at = now() - interval '1 second' WHERE token_hash = $1", identity.sha(token))
    assert httpx.post(f'{api}/devices/claim', json={'token': token}).status_code == 400
    assert httpx.post(f'{api}/devices/claim', json={'token': 'made-up'}).status_code == 400
    assert not sql('SELECT 1 FROM pairing_tokens WHERE token_hash = $1', token)  # only the hash is stored
