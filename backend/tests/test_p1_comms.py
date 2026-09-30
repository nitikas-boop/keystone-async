"""E: channel access, DM privacy, mentions, cards that respect permissions, the gate for agent messages (propose ->
human approve -> executor delivers), saving a thread into Ingestion Review, and @keystone answering as the channel."""
import asyncio
import time

import asyncpg
import httpx

from app import db, executor
from p1_util import TEST_DB, as_, get, login, upload


def post(api, path, user, **body):
    return httpx.post(f'{api}{path}', json=body, headers=as_(user), timeout=60)


def channel(api, user, **match):
    return next(c for c in get(api, '/channels', user).json() if all(c[k] == v for k, v in match.items()))


def unread(api, user, kind):
    return [n for n in get(api, '/notifications', user).json()['items'] if n['kind'] == kind]


def sql(q, *a):
    async def go():
        c = await asyncpg.connect(TEST_DB)
        try:
            return await c.fetch(q, *a)
        finally:
            await c.close()
    return asyncio.run(go())


def wait_for(fn, timeout=420):
    end = time.time() + timeout
    while time.time() < end:
        if (out := fn()):
            return out
        time.sleep(3)
    raise AssertionError('timed out')


def test_team_channels_are_invisible_to_outsiders(api):
    names = {c['name'] for c in get(api, '/channels', 'divya').json()}
    assert {'general', 'engineering'} <= names and 'operations' not in names
    ops = channel(api, 'priya', name='operations')['id']
    assert get(api, f'/channels/{ops}/messages', 'divya').status_code == 404
    assert post(api, f'/channels/{ops}/messages', 'divya', body='let me in').status_code == 404
    assert get(api, '/channels/999999/messages', 'divya').json() == get(api, f'/channels/{ops}/messages',
                                                                        'divya').json()  # same answer either way


def test_dms_are_private_even_from_the_owner(api):
    dm = post(api, '/channels/dm', 'priya', user_ids=['sneha']).json()['id']
    assert post(api, f'/channels/{dm}/messages', 'priya', body='salary numbers are in').status_code == 201
    assert [m['body'] for m in get(api, f'/channels/{dm}/messages', 'sneha').json()][-1] == 'salary numbers are in'
    assert get(api, f'/channels/{dm}/messages', 'nitika').status_code == 404
    assert dm not in {c['id'] for c in get(api, '/channels', 'nitika').json()}
    assert not sql("SELECT 1 FROM audit_log WHERE object_type = 'message'")  # human DMs are not logged


def test_mentions_notify_channel_members_only(api):
    ops = channel(api, 'priya', name='operations')['id']
    before_s, before_d = len(unread(api, 'sneha', 'mention')), len(unread(api, 'divya', 'mention'))
    post(api, f'/channels/{ops}/messages', 'priya', body='@sneha and @divya please look at the vendor list')
    assert len(unread(api, 'sneha', 'mention')) == before_s + 1
    assert len(unread(api, 'divya', 'mention')) == before_d  # not in #operations, so not told it exists


def test_cards_respect_permissions(api):
    upload(api, 'T-P1-CARD', 'Confidential restructuring plan', 'restricted', 'Procurement')
    gen = channel(api, 'nitika', type='global')['id']
    assert post(api, f'/channels/{gen}/messages', 'nitika', body='see this', ref='T-P1-CARD').status_code == 201
    card = get(api, f'/channels/{gen}/messages', 'priya').json()[-1]['ref']
    assert card == {'restricted': True, 'label': 'Restricted item'}
    assert get(api, f'/channels/{gen}/messages', 'nitika').json()[-1]['ref']['id'] == 'T-P1-CARD'
    assert post(api, f'/channels/{gen}/messages', 'priya', body='x', ref='T-P1-CARD').status_code == 404


def run_executor():
    async def go():
        await db.connect(TEST_DB)
        try:
            done = []
            while (aid := await executor.run_action_once()) is not None:
                done.append(aid)
            return done
        finally:
            await db.pool.close()
            db.pool = None
    return asyncio.run(go())


def test_agent_messages_need_a_human_approval(api):
    a = post(api, '/actions', 'priya', tool='ping_user', payload={'user_id': 'sneha', 'reason': 'DEC-004 needs a look'})
    assert a.status_code == 201 and a.json()['status'] == 'proposed', a.text
    aid = a.json()['id']
    assert aid not in {x['id'] for x in get(api, '/actions', 'sneha').json()}  # the target cannot see the draft
    assert aid not in run_executor()  # nothing is sent before approval

    agent = {'Authorization': f"Bearer {login(api, 'NL-003', client='mcp').json()['token']}"}
    assert httpx.post(f'{api}/actions/{aid}/approve', headers=agent).status_code == 403  # an agent cannot approve
    assert post(api, f'/actions/{aid}/approve', 'sneha').status_code == 404
    assert httpx.patch(f'{api}/actions/{aid}', json={'payload': {'reason': 'DEC-004 needs a look today'}},
                       headers=as_('priya')).status_code == 200  # the proposer may reword the draft
    assert post(api, f'/actions/{aid}/approve', 'priya').status_code == 403  # but never approve it herself
    assert aid in {x['id'] for x in get(api, '/actions', 'karthik').json()}  # an executive sees it to decide
    assert post(api, f'/actions/{aid}/approve', 'karthik').json()['status'] == 'approved'
    assert post(api, f'/actions/{aid}/approve', 'karthik').status_code == 409

    assert aid in run_executor()
    assert next(x for x in get(api, '/actions', 'priya').json() if x['id'] == aid)['status'] == 'executed'
    assert unread(api, 'sneha', 'ping')
    dm = post(api, '/channels/dm', 'sneha', user_ids=['priya']).json()['id']
    msg = get(api, f'/channels/{dm}/messages', 'sneha').json()[-1]
    assert (msg['sender_id'], msg['body'], msg['is_agent_drafted'], msg['approved_by']) == \
        ('keystone', 'DEC-004 needs a look today', True, 'Karthik Rao')
    acts = [r['action'] for r in sql("SELECT action FROM audit_log WHERE object_type = 'proposed_action' "
                                     "AND object_id = $1 ORDER BY id", str(aid))]
    assert acts == ['agent_message_proposed', 'edited', 'approved', 'agent_message_sent']


def test_agent_targets_stay_inside_the_proposers_reach(api):
    assert post(api, '/actions', 'priya', tool='ping_user', payload={'user_id': 'nobody', 'reason': 'x'}).status_code == 404
    ops = channel(api, 'priya', name='operations')['id']
    assert post(api, '/actions', 'divya', tool='post_to_channel',
                payload={'channel_id': ops, 'body': 'hi'}).status_code == 404
    assert post(api, '/actions', 'priya', tool='delete_everything', payload={}).status_code == 422
    assert post(api, '/plugins/keystone-comms/disable', 'nitika').status_code == 200
    try:
        assert post(api, '/actions', 'priya', tool='send_dm', payload={'user_id': 'sneha', 'body': 'x'}).status_code == 403
    finally:
        post(api, '/plugins/keystone-comms/enable', 'nitika')


def test_save_team_thread_as_meeting_note(api):
    """The thread goes through ingestion into Ingestion Review, scoped to the team that owned the channel."""
    ops = channel(api, 'priya', name='operations')['id']
    post(api, f'/channels/{ops}/messages', 'priya',
         body='Decision: we keep vendor invoices for 8 years, because the statutory auditors asked for it.')
    r = post(api, f'/channels/{ops}/save', 'priya', title='Invoice retention chat', meeting_date='2026-09-29')
    assert r.status_code == 202 and r.json()['visibility'] == 'team', r.text
    doc = r.json()['document_id']
    note = wait_for(lambda: [n for n in get(api, '/notifications', 'priya').json()['items']
                             if n['kind'] in ('note_saved', 'note_failed') and n['ref_id'] == doc])
    assert note[0]['kind'] == 'note_saved'
    assert get(api, f'/documents/{doc}', 'sneha').status_code == 200   # operations
    assert get(api, f'/documents/{doc}', 'divya').status_code == 404   # engineering
    assert sql('SELECT visibility, front_matter->>$2 AS team FROM documents WHERE id = $1', doc, 'team')[0] == \
        ('team', 'team-operations')


def test_keystone_answers_as_the_channel(api):
    """@keystone in #general answers with what every member may see: a restricted decision stays out even when
    the owner asks."""
    upload(api, 'T-P1-SECRET2', 'Acquire Zephyrcorp in a confidential deal', 'restricted', 'Procurement')
    gen = channel(api, 'nitika', type='global')['id']
    mid = post(api, f'/channels/{gen}/messages', 'nitika', body='@keystone why did we decide to acquire Zephyrcorp?')
    assert mid.status_code == 201 and mid.json()['asks_keystone']
    reply = wait_for(lambda: [m for m in get(api, f'/channels/{gen}/messages', 'nitika', after=mid.json()['id']).json()
                              if m['sender_id'] == 'keystone'])[-1]
    assert reply['body'] and 'T-P1-SECRET2' not in reply['body']
