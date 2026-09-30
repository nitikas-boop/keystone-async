"""Messaging and notifications (E). Three message classes: human to human flows freely; system notifications are free
but logged; agent-drafted messages are proposed_actions a human approves, delivered only by the executor.

Channel access goes through access.can_access with the channel's member set: global = every active member of the
org, team = the team's members and lead, group and DM = exactly the participants (not even the owner otherwise).
Chat is never indexed or read by the model unless someone saves a thread as a meeting note."""
import logging
import re
from datetime import date, datetime, timezone

from . import access, db, graph

log = logging.getLogger('keystone.comms')
MENTION = re.compile(r'@([a-z0-9_.-]+)')
AGENT = 'keystone'
QUIET_KINDS = {'mention', 'policy_uploaded'}  # human-to-human chatter and org-wide broadcasts (already audited as policy_ingested)
TEXT = {
    'mention': 'mentioned you in a conversation',
    'ping': 'Keystone pinged you (approved agent message)',
    'dm': 'sent you a message (approved agent message)',
    'join_request': 'A new join request is waiting for approval',
    'join_approved': 'Your join request was approved',
    'action_proposed': 'An agent action is waiting for your approval',
    'action_executed': 'An agent action you approved was delivered',
    'note_saved': 'A chat thread was saved as a meeting note and is in Ingestion Review',
    'note_failed': 'Saving a chat thread as a meeting note failed',
    'device_paired': 'A phone was linked to your account',
    'access_granted': 'You were given access to an item',
    'flag': 'A policy change flagged a decision you own',
    'collision': 'A policy collision was assigned to you',
    'team_added': 'You were added to a team',
    'policy_uploaded': 'A new policy version was uploaded',
    'proposal_approved': 'Your proposal was approved',
    'proposal_rejected': 'Your proposal was rejected',
    'action_approved': 'Your agent action was approved',
    'action_rejected': 'Your agent action was rejected',
    'decision_proposed': 'A proposed decision is waiting for your review',
    'decision_accepted': 'Your proposed decision was accepted into ingestion',
    'decision_rejected': 'Your proposed decision was rejected',
}


# ---- notifications ----

async def notify(user_id: str, kind: str, ref_id: str | None, conn=None, detail: str | None = None) -> None:
    """One in-app notification. Unknown users are skipped (the scanner may name a person with no account). detail:
    short text shown with it (a reviewer's reason)."""
    async def go(c):
        org = await c.fetchval('SELECT org_id FROM users WHERE id = $1', user_id)
        if org is None:
            return
        nid = await c.fetchval('INSERT INTO notifications (org_id, user_id, kind, ref_id, detail) '
                               'VALUES ($1,$2,$3,$4,$5) RETURNING id', org, user_id, kind, ref_id, detail)
        if kind not in QUIET_KINDS:
            await db.audit('system:notify', 'notification_sent', 'notification', str(nid),
                           [ref_id] if ref_id else [], {'user_id': user_id, 'kind': kind}, conn=c)
    if conn is not None:
        return await go(conn)
    async with db.pool.acquire() as c, c.transaction():
        await go(c)


async def notifications(user: dict, limit: int = 30) -> list[dict]:
    rows = await db.pool.fetch('SELECT * FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT $2',
                               user['user_id'], limit)
    refs = [r['ref_id'] for r in rows if r['ref_id'] and not r['ref_id'].isdigit()]
    hidden = await graph.hidden_keys(refs) if graph.g is not None else set()
    out = []
    for r in rows:
        ref = r['ref_id']
        out.append({'id': r['id'], 'kind': r['kind'], 'text': TEXT.get(r['kind'], r['kind'].replace('_', ' ')),
                    'detail': r['detail'],
                    'ref_id': None if ref in hidden else ref, 'restricted': ref in hidden,
                    'created_at': r['created_at'].isoformat(), 'read': r['read_at'] is not None})
    return out


# ---- channels ----

async def ensure_org_channels(c, org_id: str):
    """#general for the org and one channel per team; idempotent."""
    await c.execute("INSERT INTO channels (org_id, name, type, created_by) VALUES ($1, 'general', 'global', 'system') "
                    'ON CONFLICT DO NOTHING', org_id)
    await c.execute("INSERT INTO channels (org_id, name, type, team_id, created_by) SELECT org_id, lower(name), 'team', "
                    "id, 'system' FROM teams WHERE org_id = $1 ON CONFLICT DO NOTHING", org_id)


async def members_of(c, ch) -> set[str]:
    """Active participants of a channel. Removal from the org or the team revokes access immediately."""
    if ch['type'] == 'global':
        rows = await c.fetch("SELECT user_id FROM memberships WHERE org_id = $1 AND status = 'active'", ch['org_id'])
    elif ch['type'] == 'team':
        rows = await c.fetch("SELECT t.u AS user_id FROM (SELECT user_id AS u FROM team_members WHERE team_id = $1 "
                             "UNION SELECT lead_id FROM teams WHERE id = $1) t JOIN memberships m ON m.user_id = t.u "
                             "WHERE m.status = 'active'", ch['team_id'])
    else:
        rows = await c.fetch("SELECT cm.user_id FROM channel_members cm JOIN memberships m ON m.user_id = cm.user_id "
                             "WHERE cm.channel_id = $1 AND m.status = 'active'", ch['id'])
    return {r['user_id'] for r in rows}


async def can_see(c, user: dict, ch) -> bool:
    return access.can_access(user, {'type': 'channel', 'id': str(ch['id']), 'org_id': ch['org_id'],
                                    'members': await members_of(c, ch)})


async def channel(user: dict, cid: int, c=None):
    """The channel if the user may use it; LookupError otherwise (same error whether it exists or not)."""
    c = c or db.pool
    ch = await c.fetchrow('SELECT * FROM channels WHERE id = $1', cid)
    if ch is None or not await can_see(c, user, ch):
        raise LookupError('no such channel')
    return ch


async def names(c, ids) -> dict[str, str]:
    rows = await c.fetch('SELECT id, display_name FROM users WHERE id = ANY($1)', list(ids))
    return {r['id']: r['display_name'] for r in rows} | {AGENT: 'Keystone'}


async def channels(user: dict) -> list[dict]:
    rows = await db.pool.fetch('SELECT * FROM channels WHERE org_id = $1 ORDER BY type, name', user['org_id'])
    out = []
    for ch in rows:
        members = await members_of(db.pool, ch)
        if not access.can_access(user, {'type': 'channel', 'id': str(ch['id']), 'org_id': ch['org_id'],
                                        'members': members}):
            continue
        name = ch['name']
        if ch['type'] == 'dm':
            others = await names(db.pool, members - {user['user_id']})
            name = ', '.join(sorted(set(others.values()) - {'Keystone'})) or 'Just you'
        out.append({'id': ch['id'], 'name': name, 'type': ch['type'], 'team_id': ch['team_id'],
                    'members': len(members)})
    return out


async def dm_channel(c, org_id: str, users: list[str], created_by: str) -> int:
    """The DM (or small group DM) between exactly these users, created on first use."""
    key = ','.join(sorted(set(users)))
    cid = await c.fetchval('SELECT id FROM channels WHERE org_id = $1 AND dm_key = $2', org_id, key)
    if cid is None:
        cid = await c.fetchval("INSERT INTO channels (org_id, name, type, dm_key, created_by) VALUES ($1, 'dm', 'dm', "
                               '$2, $3) ON CONFLICT DO NOTHING RETURNING id', org_id, key, created_by)
        cid = cid or await c.fetchval('SELECT id FROM channels WHERE org_id = $1 AND dm_key = $2', org_id, key)
        await c.executemany('INSERT INTO channel_members VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
                            [(cid, u, org_id) for u in set(users)])
    return cid


async def active_member(c, org_id: str, user_id: str) -> bool:
    return bool(await c.fetchval("SELECT 1 FROM memberships WHERE org_id = $1 AND user_id = $2 AND status = 'active'",
                                 org_id, user_id))


# ---- messages ----

async def cards(refs: list[str]) -> dict[str, dict]:
    """Keystone items shared into chat, as the viewer may see them: hidden ones become 'Restricted item'."""
    refs = [r for r in dict.fromkeys(refs) if r]
    if not refs or graph.g is None:
        return {}
    hidden = await graph.hidden_keys(refs)
    rows = await graph.q('MATCH (n:Entity {group_id: $g}) WHERE n.key IN $k RETURN n.key AS k, n.name AS name, '
                         'n.type AS type', g=graph.gid(), k=[r for r in refs if r not in hidden])
    found = {r['k']: {'id': r['k'], 'label': r['name'], 'type': r['type']} for r in rows}
    return {r: ({'restricted': True, 'label': 'Restricted item'} if r in hidden
                else found.get(r, {'id': r, 'label': r, 'type': None})) for r in refs}


async def messages(user: dict, cid: int, after: int = 0) -> list[dict]:
    await channel(user, cid)
    rows = await db.pool.fetch('SELECT * FROM (SELECT * FROM messages WHERE channel_id = $1 AND id > $2 '
                               'ORDER BY id DESC LIMIT 200) m ORDER BY id', cid, after)
    who = await names(db.pool, {r['sender_id'] for r in rows} | {r['approved_by'] for r in rows if r['approved_by']})
    card = await cards([r['ref_node_id'] for r in rows])
    return [{'id': r['id'], 'sender_id': r['sender_id'], 'sender': who.get(r['sender_id'], r['sender_id']),
             'body': r['body'], 'created_at': r['created_at'].isoformat(), 'is_agent_drafted': r['is_agent_drafted'],
             'approved_by': r['approved_by'] and who.get(r['approved_by'], r['approved_by']),
             'ref': card.get(r['ref_node_id'])} for r in rows]


async def post(user: dict, cid: int, body: str, ref: str | None = None) -> dict:
    """A human message. @user notifies that user if they are in the channel; @keystone asks the reasoning layer."""
    body = body.strip()
    if not body:
        raise ValueError('message is empty')
    if ref and (await graph.hidden_keys([ref]) or not (await cards([ref])).get(ref, {}).get('type')):
        raise LookupError(f'no such item {ref}')  # you can only share what you can see
    async with db.pool.acquire() as c, c.transaction():
        ch = await channel(user, cid, c)
        members = await members_of(c, ch)
        mid = await c.fetchval('INSERT INTO messages (org_id, channel_id, sender_id, body, ref_node_id) '
                               'VALUES ($1,$2,$3,$4,$5) RETURNING id', ch['org_id'], cid, user['user_id'], body, ref)
        for m in set(MENTION.findall(body)) & members - {user['user_id']}:
            await notify(m, 'mention', str(cid), conn=c)
    return {'id': mid, 'channel_id': cid, 'asks_keystone': f'@{AGENT}' in body.lower()}


async def viewer_for(c, org_id: str, members: set[str], asker: str) -> dict:
    """The access of a channel as a whole: what every member may see. @keystone answers in a channel with this, so
    the agent never uses context some member of the channel could not see."""
    rows = await c.fetch('SELECT m.user_id, m.role, m.audit_from, m.audit_to, '
                         'array(SELECT team_id FROM team_members WHERE user_id = m.user_id '
                         'UNION SELECT id FROM teams WHERE lead_id = m.user_id) AS teams, '
                         'array(SELECT resource_id FROM access_grants WHERE user_id = m.user_id AND revoked_at IS NULL)'
                         ' AS grants FROM memberships m WHERE m.user_id = ANY($1)', list(members))
    limited = [r for r in rows if r['role'] not in access.READ_ALL]
    v = {'user_id': asker, 'org_id': org_id, 'team_id': None, 'via': 'web',
         'role': 'compliance' if not limited else 'member',
         'teams': sorted(set.intersection(*(set(r['teams']) for r in limited))) if limited else [],
         'grants': sorted(set.intersection(*(set(r['grants']) for r in limited))) if limited else []}
    auditor = next((r for r in rows if r['role'] == 'auditor'), None)
    if auditor:
        v.update(role='auditor', audit_from=auditor['audit_from'] and auditor['audit_from'].isoformat(),
                 audit_to=auditor['audit_to'] and auditor['audit_to'].isoformat())
    return v


async def answer_in_channel(user: dict, cid: int, question: str):
    """@keystone: the reasoning layer answers as the channel (viewer_for) and the cited answer is posted back."""
    from . import ask, contracts
    ch = await db.pool.fetchrow('SELECT * FROM channels WHERE id = $1', cid)
    viewer = await viewer_for(db.pool, ch['org_id'], await members_of(db.pool, ch), user['user_id'])
    token = contracts._user.set(viewer)
    try:
        res = await ask.ask(question, date.today(), f"user:{user['user_id']}")
        cited = [c.get('id') for c in res.get('citations') or [] if c.get('id')]
        body = res.get('answer') or 'I have no recorded decision about that.'
        if cited:
            body += '\n\nSources: ' + ', '.join(dict.fromkeys(cited))
    except Exception as e:
        log.exception('@keystone failed')
        body = f'Keystone could not answer: {type(e).__name__}: {e}'
    finally:
        contracts._user.reset(token)
    await db.pool.execute('INSERT INTO messages (org_id, channel_id, sender_id, body) VALUES ($1,$2,$3,$4)',
                          ch['org_id'], cid, AGENT, body)


# ---- turning a thread into a record ----

VIS = {'global': 'org', 'team': 'team', 'group': 'restricted', 'dm': 'restricted'}


async def thread_markdown(user: dict, cid: int, title: str, meeting_date: date) -> tuple[str, str, str, list[str]]:
    """The thread as a meeting_note document: (doc_id, markdown, visibility, participants). Its scope follows the
    channel: #general -> org, a team channel -> that team, a group or DM -> restricted plus a grant per participant."""
    ch = await channel(user, cid)
    rows = await db.pool.fetch('SELECT * FROM messages WHERE channel_id = $1 ORDER BY id', cid)
    if not rows:
        raise ValueError('the conversation is empty')
    who = await names(db.pool, {r['sender_id'] for r in rows})
    people = await db.pool.fetch('SELECT id, person_key FROM users WHERE id = ANY($1)', list(who))
    attendees = [p['person_key'] or p['id'] for p in people]
    doc_id = f"MTG-CHAT-{cid}-{datetime.now(timezone.utc):%Y%m%d%H%M%S}"
    vis = VIS[ch['type']]
    lines = [f"**{who.get(r['sender_id'], r['sender_id'])}** ({r['created_at']:%Y-%m-%d %H:%M}): {r['body']}"
             for r in rows]
    fm = [f'doc_type: meeting_note', f'doc_id: {doc_id}', f'title: "{title.replace(chr(34), chr(39))}"',
          f'meeting_date: {meeting_date.isoformat()}', f"attendees: [{', '.join(attendees)}]", f'visibility: {vis}',
          'source: chat']
    if ch['type'] == 'team':
        fm.append(f"team: {ch['team_id']}")
    md = '---\n' + '\n'.join(fm) + f'\n---\n# {title}\n\nSaved from a Keystone chat thread.\n\n' + '\n\n'.join(lines) + '\n'
    return doc_id, md, vis, [p['id'] for p in people]


# ---- delivering approved agent actions (executor only) ----

async def deliver(c, a) -> dict:
    """Run one approved proposed_action. Permissions are checked again at delivery: the proposer must still be an
    active member and the target must still be inside what the proposer may reach."""
    p, org, by = a['payload'], a['org_id'], a['proposed_by']
    if not await active_member(c, org, by):
        raise PermissionError('the proposer is no longer an active member')
    if a['tool'] in ('ping_user', 'send_dm'):
        target = p['user_id']
        if not await active_member(c, org, target):
            raise PermissionError(f'{target} is not an active member of this organisation')
        cid = await dm_channel(c, org, [by, target], by)
        sender, body = (AGENT, p['reason']) if a['tool'] == 'ping_user' else (by, p['body'])
        kind = 'ping' if a['tool'] == 'ping_user' else 'dm'
    else:
        ch = await c.fetchrow('SELECT * FROM channels WHERE id = $1 AND org_id = $2', int(p['channel_id']), org)
        if ch is None or by not in await members_of(c, ch):
            raise PermissionError('the proposer cannot post in that channel')
        cid, sender, body, target, kind = ch['id'], by, p['body'], None, None
    mid = await c.fetchval('INSERT INTO messages (org_id, channel_id, sender_id, body, is_agent_drafted, approved_by, '
                           'ref_node_id) VALUES ($1,$2,$3,$4,true,$5,$6) RETURNING id', org, cid, sender, body,
                           a['decided_by'], p.get('ref_id'))
    if target:
        await notify(target, kind, p.get('ref_id') or str(cid), conn=c)
    return {'channel_id': cid, 'message_id': mid, 'target': target}
