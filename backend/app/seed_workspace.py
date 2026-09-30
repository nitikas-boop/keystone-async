"""Demo workspace content for Nimbus Ledger: channel messages, DMs, a pending agent action and member-proposed
decisions, so every role opens a non-empty dashboard and inbox. Idempotent (skips if #announcements has a post).

    docker compose exec backend python -m app.seed_workspace
"""
import asyncio

from . import comms, config, db

ORG = config.GROUP_ID
MESSAGES = [  # (channel name, team_id or None, sender, body)
    ('announcements', None, 'ananya', 'Welcome to the Keystone workspace. **Chat stays out of the decision graph** unless '
                                      'you promote a message to a decision note.'),
    ('general', None, 'priya', 'Month-end close starts Monday. @sneha can you share the vendor reconciliation status?'),
    ('general', None, 'sneha', 'On it: VendorCo reconciliation is _green_, two invoices pending.'),
    ('compliance', None, 'farhan', 'Heads-up: **RET-2.1 v3** (90-day retention) is drafted. DEC-007 keeps logs 180 days, so '
                                   'expect a flag when it is uploaded.'),
    ('engineering', None, 'karthik', 'FastAPI is our standard for internal services (DEC-010). New services follow it.'),
    ('engineering', 'team-engineering', 'divya', 'Nightly backup job moved to 02:00 IST; `backup-verify` passes. @rohit please review.'),
    ('operations', 'team-operations', 'sneha', 'Draft analytics renewal is ₹1,60,000, under the CTO limit.'),
]
DMS = [  # (sender, recipient, body)
    ('farhan', 'priya', 'Can you confirm which vendors still hold customer logs beyond 90 days?'),
    ('karthik', 'rohit', 'Could you pair with Divya on the backup verification this week?'),
    ('ananya', 'karthik', 'Let us review the procurement threshold before the next board meeting.'),
]
PROPOSED = [  # (member, markdown): goes to a lead of its domain
    ('divya', """---
doc_type: decision
decision_id: DEC-011
title: Mask customer identifiers in analytics exports
decided_on: 2026-09-29
owner: p-divya
project: Data Governance
status: active
effect: ongoing
fields: {}
reasons: Analytics exports only need pseudonymous ids.
---
Analytics exports replace customer identifiers with pseudonymous ids.
"""),
    ('sneha', """---
doc_type: decision
decision_id: DEC-012
title: Renew the analytics tool for ₹1,60,000
decided_on: 2026-09-30
owner: p-sneha
project: Procurement
status: active
effect: completed
fields: {amount_inr: 160000, approver_role: CTO}
reasons: Renewal at a lower price than 2025.
---
Renew the analytics tool subscription for one year at ₹1,60,000.
"""),
]


async def run():
    await db.connect()
    try:
        async with db.pool.acquire() as c, c.transaction():
            await comms.ensure_org_channels(c, ORG)
            ann = await c.fetchval("SELECT id FROM channels WHERE org_id = $1 AND name = 'announcements' AND type = 'global'", ORG)
            if await c.fetchval('SELECT 1 FROM messages WHERE channel_id = $1', ann):
                print('workspace already seeded')
                return
            for name, team, sender, body in MESSAGES:
                cid = await c.fetchval('SELECT id FROM channels WHERE org_id = $1 AND name = $2 AND '
                                       'coalesce(team_id, \'\') = coalesce($3, \'\')', ORG, name, team)
                await c.execute('INSERT INTO messages (org_id, channel_id, sender_id, body) VALUES ($1,$2,$3,$4)',
                                ORG, cid, sender, body)
                for m in set(comms.MENTION.findall(body)) - {sender}:
                    await comms.notify(m, 'mention', str(cid), conn=c)
            for a, b, body in DMS:
                cid = await comms.dm_channel(c, ORG, [a, b], a)
                await c.execute('INSERT INTO messages (org_id, channel_id, sender_id, body) VALUES ($1,$2,$3,$4)',
                                ORG, cid, a, body)
            aid = await c.fetchval("INSERT INTO proposed_actions (org_id, tool, payload, proposed_by, domain) "
                                   "VALUES ($1, 'send_dm', $2, 'sneha', 'ops') RETURNING id", ORG,
                                   {'user_id': 'divya', 'body': 'Reminder: the vendor access review is due Friday.'})
            await db.audit('user:sneha', 'agent_message_proposed', 'proposed_action', str(aid), [],
                           {'tool': 'send_dm', 'seed': True}, conn=c)
            for who, md in PROPOSED:
                domain = 'compliance' if 'Data Governance' in md else 'ops'
                title = next(ln.split(':', 1)[1].strip() for ln in md.splitlines() if ln.startswith('title:'))
                pid = await c.fetchval('INSERT INTO decision_proposals (org_id, proposed_by, domain, title, markdown) '
                                       'VALUES ($1,$2,$3,$4,$5) RETURNING id', ORG, who, domain, title, md)
                await db.audit(f'user:{who}', 'decision_proposed', 'decision_proposal', str(pid), [], {'seed': True}, conn=c)
                lead = 'farhan' if domain == 'compliance' else 'priya'
                await comms.notify(lead, 'decision_proposed', str(pid), conn=c)
            await comms.notify('rohit', 'team_added', 'team-engineering', conn=c)
        print('workspace seeded')
    finally:
        await db.pool.close()


if __name__ == '__main__':
    asyncio.run(run())
