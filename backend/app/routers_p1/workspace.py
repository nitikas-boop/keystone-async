"""The role-aware workspace: GET /me/permissions (the one permission map, for the UI), resolving staleness flags, and
member-proposed decisions that a lead of the domain reviews. Enforcement lives in app/permissions.py."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from . import person, signed_in
from .. import comms, db, identity, ingest, permissions

router = APIRouter(tags=['p1 workspace'])


@router.get('/me/permissions')
async def my_permissions(u: dict = Depends(signed_in)):
    limit, clause = await permissions.procurement_threshold()
    return {**permissions.view(u), 'user': identity.me(u), 'procurement': {'cto_limit_inr': limit, 'clause': clause}}


# ---- staleness flags ----

class Note(BaseModel):
    note: str | None = None


@router.post('/flags/{flag_id}/resolve')
async def resolve_flag(flag_id: str, body: Note | None = None, u: dict = Depends(permissions.need('flag.resolve'))):
    """Executives: any flag. Leads: flags in their domain."""
    f = await db.pool.fetchrow('SELECT * FROM flags WHERE id = $1', flag_id)
    if f is None:
        raise HTTPException(404, 'no such flag')
    if not permissions.can(u, 'approve.any') and f['domain'] not in permissions.domains(u):
        await permissions.deny(u, f'flag:{flag_id}', f"this flag is in the {f['domain'] or 'unassigned'} domain; "
                               'a lead resolves only flags in their own', 'flag')
    async with db.pool.acquire() as c, c.transaction():
        row = await c.fetchrow('UPDATE flags SET resolved_by = $2, resolved_at = now() WHERE id = $1 '
                               'AND resolved_at IS NULL RETURNING *', flag_id, u['user_id'])
        if row is None:
            raise HTTPException(409, 'flag is already resolved')
        await db.audit(f"user:{u['user_id']}", 'flag_resolved', 'flag', flag_id, [f['decision_id']],
                       {'note': body and body.note}, conn=c)
    return {**dict(row), 'created_at': row['created_at'].isoformat(), 'resolved_at': row['resolved_at'].isoformat()}


# ---- proposed decisions (members) ----

class DecisionIn(BaseModel):
    markdown: str


def _dp_out(r) -> dict:
    d = dict(r)
    for k in ('created_at', 'decided_at'):
        d[k] = d[k] and d[k].isoformat()
    return d


async def _reviewers(org_id: str, domain: str | None) -> list[str]:
    """Leads of the domain, else the executives."""
    rows = await db.pool.fetch("SELECT m.user_id, m.tier, m.role, m.domain, u.designation, t.domain AS team_domain "
                               "FROM memberships m JOIN users u ON u.id = m.user_id LEFT JOIN teams t ON t.id = m.team_id "
                               "WHERE m.org_id = $1 AND m.status = 'active'", org_id)
    people = [{**dict(r), 'domain': r['domain'] or r['team_domain']} for r in rows]
    leads = [p['user_id'] for p in people if permissions.tier(p) == 'lead' and p['domain'] == domain]
    return leads or [p['user_id'] for p in people if permissions.tier(p) == 'executive' and p['role'] != 'auditor']


@router.post('/decision-proposals', status_code=201)
async def propose_decision(body: DecisionIn, u: dict = Depends(permissions.need('decision.propose'))):
    """A member's decision record goes to a lead of its domain for review; nothing enters the graph until accepted."""
    try:
        fm = ingest.parse(body.markdown)[0]
    except ValueError as e:
        raise HTTPException(422, str(e))
    if fm.get('doc_type') != 'decision' or not fm.get('decision_id'):
        raise HTTPException(422, 'a proposed decision needs front-matter with doc_type: decision and a decision_id')
    domain = await permissions.decision_domain(fm)
    async with db.pool.acquire() as c, c.transaction():
        row = await c.fetchrow('INSERT INTO decision_proposals (org_id, proposed_by, domain, title, markdown) '
                               'VALUES ($1,$2,$3,$4,$5) RETURNING *', u['org_id'], u['user_id'], domain,
                               str(fm.get('title') or fm['decision_id']), body.markdown)
        await db.audit(f"user:{u['user_id']}", 'decision_proposed', 'decision_proposal', str(row['id']),
                       [str(fm['decision_id'])], {'domain': domain, 'title': row['title']}, conn=c)
        for r in await _reviewers(u['org_id'], domain):
            if r != u['user_id']:
                await comms.notify(r, 'decision_proposed', str(row['id']), conn=c)
    return _dp_out(row)


async def _dp_block(u: dict, r) -> str | None:
    return await permissions.approval_block(u, domain=r['domain'], proposer=r['proposed_by'])


@router.get('/decision-proposals')
async def decision_proposals(status: str | None = None, u: dict = Depends(signed_in)):
    """Your own proposals, and the ones you may review."""
    rows = await db.pool.fetch('SELECT * FROM decision_proposals WHERE org_id = $1 AND ($2::text IS NULL OR status = $2) '
                               'ORDER BY id DESC', u['org_id'], status)
    out = []
    for r in rows:
        why = await _dp_block(u, r)
        if r['proposed_by'] == u['user_id'] or why is None:
            out.append({**_dp_out(r), 'can_review': why is None})
    return out


async def _decide(pid: int, u: dict) -> dict:
    r = await db.pool.fetchrow('SELECT * FROM decision_proposals WHERE id = $1 AND org_id = $2', pid, u['org_id'])
    if r is None or (r['proposed_by'] != u['user_id'] and await _dp_block(u, r)):
        raise HTTPException(404, 'no such proposed decision')
    why = await _dp_block(u, r)
    if why:
        await permissions.deny(u, f'decision_proposal:{pid}', why, 'decision_proposal')
    if r['status'] != 'proposed':
        raise HTTPException(409, f"proposed decision is {r['status']}")
    return r


@router.post('/decision-proposals/{pid}/accept')
async def accept_decision(pid: int, u: dict = Depends(person)):
    """The reviewer (never the proposer) sends it through normal ingestion as themselves."""
    r = await _decide(pid, u)
    fields = ingest.parse(r['markdown'])[0].get('fields') or {}
    cap, amount = u.get('approval_authority_inr'), isinstance(fields, dict) and fields.get('amount_inr')
    if cap is not None and isinstance(amount, (int, float)) and amount > cap:
        await permissions.deny(u, f'decision_proposal:{pid}', f'₹{amount:,.0f} is above your approval authority '
                               f'(₹{cap:,.0f})', 'decision_proposal')
    try:
        res = await ingest.ingest(r['markdown'], f'proposed/decision-proposal-{pid}.md', f"user:{u['user_id']}")
    except ValueError as e:
        raise HTTPException(422, str(e))
    async with db.pool.acquire() as c, c.transaction():
        row = await c.fetchrow("UPDATE decision_proposals SET status = 'accepted', decided_by = $2, decided_at = now(), "
                               "document_id = $3 WHERE id = $1 RETURNING *", pid, u['user_id'], res['document_id'])
        await db.audit(f"user:{u['user_id']}", 'approved', 'decision_proposal', str(pid), [res['document_id']],
                       {'status': 'accepted'}, conn=c)
        await comms.notify(r['proposed_by'], 'decision_accepted', res['document_id'], conn=c)
    return _dp_out(row)


class Reason(BaseModel):
    reason: str | None = None


@router.post('/decision-proposals/{pid}/reject')
async def reject_decision(pid: int, body: Reason | None = None, u: dict = Depends(person)):
    r = await _decide(pid, u)
    reason = body and body.reason
    async with db.pool.acquire() as c, c.transaction():
        row = await c.fetchrow("UPDATE decision_proposals SET status = 'rejected', decided_by = $2, decided_at = now(), "
                               "reason = $3 WHERE id = $1 RETURNING *", pid, u['user_id'], reason)
        await db.audit(f"user:{u['user_id']}", 'rejected', 'decision_proposal', str(pid), [],
                       {'status': 'rejected', 'reason': reason}, conn=c)
        await comms.notify(r['proposed_by'], 'decision_rejected', str(pid), conn=c, detail=reason)
    return _dp_out(row)


# ---- "this answer is wrong" ----

@router.post('/answers/{answer_id}/flag', status_code=201)
async def flag_answer(answer_id: str, body: Note | None = None, u: dict = Depends(permissions.need('answer.flag'))):
    """Anyone can report a wrong answer; it lands as a correction in the Compliance Lead's inbox."""
    if not await db.pool.fetchval('SELECT 1 FROM answers WHERE id::text = $1', answer_id):
        raise HTTPException(404, 'no such answer')
    note = (body and body.note or '').strip() or None
    async with db.pool.acquire() as c, c.transaction():
        await db.audit(f"user:{u['user_id']}", 'answer_flagged', 'answer', answer_id, [], {'note': note}, conn=c)
        for r in await c.fetch("SELECT user_id FROM memberships WHERE org_id = $1 AND role = 'compliance' "
                               "AND status = 'active'", u['org_id']):
            await comms.notify(r['user_id'], 'answer_flagged', answer_id, conn=c, detail=note)
    return {'answer_id': answer_id, 'flagged': True}


# ---- My Inbox: everything this person must deal with ----

def _item(key, category, kind, title, detail, ref, created_at, **extra) -> dict:
    return {'key': key, 'category': category, 'type': kind, 'title': title, 'detail': detail, 'ref': ref,
            'created_at': created_at, **extra}


async def inbox(u: dict) -> dict:
    """Needs my action (approvals I may give, flags I own or may resolve, facts to review, proposed decisions,
    corrections), unread conversations, and notifications. Actions first, urgent first, newest first."""
    from .. import graph, main
    items = []
    rows = await db.pool.fetch("SELECT * FROM proposals WHERE status = 'proposed' ORDER BY id DESC")
    hidden = await graph.hidden_keys([r['decision_id'] for r in rows])
    for r in rows:
        if r['decision_id'] in hidden or await permissions.approval_block(u, **await main.proposal_gate(r)):
            continue
        items.append(_item(f"proposal:{r['id']}", 'action', 'approval', r['subject'],
                           f"{r['impact_type'].replace('_', ' ').lower()} · {r['domain'] or 'no domain'}",
                           {'kind': 'proposal', 'id': r['id'], 'decision_id': r['decision_id']},
                           r['created_at'].isoformat(), urgent=r['impact_type'] == 'ONGOING_PRACTICE_BREACH'))
    for r in await db.pool.fetch("SELECT * FROM proposed_actions WHERE org_id = $1 AND status = 'proposed' "
                                 'ORDER BY id DESC', u['org_id']):
        if await permissions.approval_block(u, domain=r['domain'], proposer=r['proposed_by']) is None:
            items.append(_item(f"action:{r['id']}", 'action', 'agent_action',
                               f"Agent {r['tool'].replace('_', ' ')} proposed by {r['proposed_by']}",
                               r['payload'].get('reason') or r['payload'].get('body'),
                               {'kind': 'agent_action', 'id': r['id']}, r['created_at'].isoformat()))
    flags = await db.pool.fetch("SELECT * FROM flags WHERE resolved_at IS NULL AND impact_type <> 'SUPERSEDED' "
                                'ORDER BY created_at DESC')
    hidden = await graph.hidden_keys([f['decision_id'] for f in flags])
    owners = {r['k']: r['o'] for r in await graph.q(
        'MATCH (d:Entity {group_id: $g}) WHERE d.key IN $k RETURN d.key AS k, d.owner AS o', g=graph.gid(),
        k=[f['decision_id'] for f in flags])} if flags else {}
    for f in flags:
        mine = owners.get(f['decision_id']) in (u.get('person_key'), u['user_id'])
        resolvable = permissions.can(u, 'flag.resolve') and (permissions.can(u, 'approve.any')
                                                             or f['domain'] in permissions.domains(u))
        if f['decision_id'] in hidden or not (mine or resolvable):
            continue
        items.append(_item(f"flag:{f['id']}", 'action', 'flag',
                           f"{f['decision_id']} is stale under {f['clause_id']}@{f['new_version']}",
                           ('you own this decision' if mine else f"{f['domain']} domain")
                           + f" · {f['impact_type'].replace('_', ' ').lower()}",
                           {'kind': 'flag', 'id': f['id'], 'decision_id': f['decision_id'], 'can_resolve': resolvable},
                           f['created_at'].isoformat(), urgent=f['impact_type'] == 'ONGOING_PRACTICE_BREACH'))
    if permissions.can(u, 'ingestion.review'):
        for r in await db.pool.fetch("SELECT document_id, count(*) AS n, max(created_at) AS at, "
                                     "bool_or(visibility = 'restricted') AS secret FROM extractions "
                                     "WHERE status = 'pending' GROUP BY document_id ORDER BY max(created_at) DESC"):
            if r['secret'] and not permissions.can(u, 'audit.full'):
                continue
            items.append(_item(f"extraction:{r['document_id']}", 'action', 'ingestion',
                               f"{r['n']} extracted fact(s) from {r['document_id']} to review",
                               'accept, edit or reject in Ingestion Review',
                               {'kind': 'extraction', 'id': r['document_id']}, r['at'].isoformat()))
    for r in await db.pool.fetch("SELECT * FROM decision_proposals WHERE org_id = $1 AND status = 'proposed' "
                                 'ORDER BY id DESC', u['org_id']):
        if await _dp_block(u, r) is None:
            items.append(_item(f"decision_proposal:{r['id']}", 'action', 'decision_review',
                               f"Proposed decision: {r['title']}", f"from {r['proposed_by']} · {r['domain'] or 'no domain'}",
                               {'kind': 'decision_proposal', 'id': r['id']}, r['created_at'].isoformat()))
    for c in await comms.channels(u):
        if c['unread']:
            dm = c['scope'] == 'dm'
            items.append(_item(f"channel:{c['id']}", 'unread', 'dm' if dm else 'mention' if c['mentions'] else 'channel',
                               c['name'] if dm else f"#{c['name']}",
                               f"{c['unread']} unread message(s)"
                               + (f", {c['mentions']} mention(s) of you" if c['mentions'] else ''),
                               {'kind': 'channel', 'id': c['id']}, c['last_at'], urgent=dm or bool(c['mentions'])))
    for n in await comms.notifications(u, 60):
        ref = {'kind': 'notification', 'id': n['ref_id'], 'notification_id': n['id'], 'notification_kind': n['kind']}
        if n['kind'] == 'answer_flagged':
            if not n['read']:
                items.append(_item(f"note:{n['id']}", 'action', 'correction', 'Correction: an answer was reported wrong',
                                   n['detail'], {**ref, 'kind': 'answer'}, n['created_at']))
        elif n['kind'] not in ('mention', 'decision_proposed'):  # those are already listed above
            items.append(_item(f"note:{n['id']}", 'notification', n['kind'], n['text'], n['detail'], ref,
                               n['created_at'], read=n['read'], restricted=n['restricted']))
    items.sort(key=lambda i: i['created_at'] or '', reverse=True)
    items.sort(key=lambda i: (i['category'] != 'action', not i.get('urgent'), i.get('read', False)))
    pending = sum(i['category'] == 'action' for i in items)
    unread = sum(i['category'] == 'unread' or (i['category'] == 'notification' and not i['read']) for i in items)
    return {'counts': {'pending': pending, 'unread': unread, 'badge': pending + unread}, 'items': items}


@router.get('/inbox')
async def my_inbox(u: dict = Depends(signed_in)):
    return await inbox(u)


@router.post('/inbox/read-all')
async def inbox_read_all(u: dict = Depends(signed_in)):
    """Mark every notification and conversation read (pending actions stay: they need a decision)."""
    await db.pool.execute("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL "
                          "AND kind <> 'answer_flagged'", u['user_id'])
    for c in await comms.channels(u):
        if c['unread']:
            await comms.mark_read(u, c['id'])
    return {'ok': True}


@router.post('/inbox/corrections/{nid}/done')
async def correction_done(nid: int, u: dict = Depends(signed_in)):
    if await db.pool.fetchval('UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 '
                              'AND read_at IS NULL RETURNING id', nid, u['user_id']) is None:
        raise HTTPException(404, 'no such open correction')
    await db.audit(f"user:{u['user_id']}", 'correction_handled', 'notification', str(nid), [], {})
    return {'ok': True}


# ---- Dashboard: one endpoint, content scoped by tier (no number is computed in the browser) ----

async def _decisions(u: dict) -> tuple[list[dict], list[dict], dict]:
    """Decisions the user may see today (graph.read applies the retrieval filter), their unresolved flags, and
    decision -> relied-on clause ids."""
    from datetime import date
    from .. import graph
    g = await graph.read(date.today())
    decs = [n for n in g['nodes'] if n['type'] == 'Decision']
    ids = {d['id'] for d in decs}
    replaced = {e['target'] for e in g['edges'] if e['relation'] == 'SUPERSEDES'}
    relied = {}
    for e in g['edges']:
        if e['relation'] == 'RELIED_ON' and e['source'] in ids:
            relied.setdefault(e['source'], set()).add(e['target'].split('@')[0])
    flags = [dict(f) for f in await db.pool.fetch("SELECT * FROM flags WHERE resolved_at IS NULL "
                                                  "AND impact_type <> 'SUPERSEDED'") if f['decision_id'] in ids]
    stale = {f['decision_id'] for f in flags}
    for d in decs:
        a = d['attributes']
        d['state'] = 'superseded' if a.get('status') == 'superseded' or d['id'] in replaced else \
            'stale' if d['id'] in stale else 'active'
    return decs, flags, relied


def _dec_out(d: dict) -> dict:
    a = d['attributes']
    return {'id': d['id'], 'title': d['label'], 'decided_on': a.get('decided_on'), 'project': a.get('project'),
            'owner': a.get('owner'), 'state': d['state']}


async def _team_activity(u: dict, only_mine: bool) -> list[dict]:
    """Per team: members and message count in its channels over the last 7 days (counts only, never content)."""
    rows = await db.pool.fetch(
        "SELECT t.id, t.name, t.lead_id, array(SELECT user_id FROM team_members WHERE team_id = t.id) AS members, "
        "(SELECT count(*) FROM messages m JOIN channels c ON c.id = m.channel_id WHERE c.team_id = t.id "
        " AND m.created_at > now() - interval '7 days') AS messages_7d, "
        "(SELECT max(m.created_at) FROM messages m JOIN channels c ON c.id = m.channel_id WHERE c.team_id = t.id) AS last_at "
        "FROM teams t WHERE t.org_id = $1 ORDER BY t.name", u['org_id'])
    out = []
    for r in rows:
        if only_mine and u['user_id'] not in r['members'] and r['lead_id'] != u['user_id']:
            continue
        out.append({'id': r['id'], 'name': r['name'], 'members': len(set(r['members']) | {r['lead_id']} - {None}),
                    'messages_7d': r['messages_7d'], 'last_at': r['last_at'] and r['last_at'].isoformat()})
    return out


async def _recent_audit(u: dict, n: int = 8) -> list[dict]:
    sql = 'SELECT id, ts, actor, action, object_type, object_id FROM audit_log '
    if permissions.can(u, 'audit.full'):
        rows = await db.pool.fetch(sql + 'ORDER BY id DESC LIMIT $1', n)
    else:
        rows = await db.pool.fetch(sql + "WHERE actor IN ($2, $2 || ':mcp') ORDER BY id DESC LIMIT $1", n,
                                   f"user:{u['user_id']}")
    return [{**dict(r), 'ts': r['ts'].isoformat()} for r in rows]


async def _policy_changes(u: dict, relied_mine: set[str]) -> list[dict]:
    """Policy versions that took effect in the last 12 months (or take effect later), with whether they touch a
    clause one of my decisions relied on or a policy my department owns."""
    from .. import access
    ok = access.visible_filter(u)
    mine_dept = {p for p, t in access.POLICY_TEAM.get(u['org_id'], {}).items() if t in u.get('teams', [])}
    rows = await db.pool.fetch("SELECT policy_id, version, document_id, min(effective_from) AS starts, "
                               "array_agg(clause_id ORDER BY clause_id) AS clauses FROM policy_clauses "
                               "WHERE effective_from > now() - interval '365 days' GROUP BY 1, 2, 3 ORDER BY 4 DESC")
    return [{'policy_id': r['policy_id'], 'version': r['version'], 'document_id': r['document_id'],
             'effective_from': r['starts'].isoformat(), 'clauses': r['clauses'],
             'affects_me': bool(set(r['clauses']) & relied_mine) or r['policy_id'] in mine_dept}
            for r in rows if ok({'type': 'PolicyVersion', 'key': r['document_id'], 'policy_id': r['policy_id']})]


@router.get('/dashboard')
async def dashboard(u: dict = Depends(signed_in)):
    """Executive: org-wide. Lead: their domain and teams. Member: their own work. Every figure comes from the same
    tables and filters as the rest of the API."""
    scope = permissions.view(u)['dashboard_scope']
    box = await inbox(u)
    decs, flags, relied = await _decisions(u)
    mine = [d for d in decs if d['attributes'].get('owner') in (u.get('person_key'), u['user_id'])]
    out = {'scope': scope, 'tier': permissions.tier(u), 'domains': sorted(permissions.domains(u)),
           'inbox': box['counts'],
           'my_pending': [{k: i[k] for k in ('key', 'type', 'title', 'detail', 'ref')} for i in box['items']
                          if i['category'] == 'action'][:8],
           'my_decisions': [_dec_out(d) for d in mine]}
    by_status = lambda ds: {s: sum(d['state'] == s for d in ds) for s in ('active', 'superseded', 'stale')}
    if scope == 'org':
        pending = await db.pool.fetchrow(
            "SELECT (SELECT count(*) FROM proposals WHERE status = 'proposed') AS proposals, "
            "(SELECT count(*) FROM proposed_actions WHERE org_id = $1 AND status = 'proposed') AS agent_actions, "
            "(SELECT count(*) FROM decision_proposals WHERE org_id = $1 AND status = 'proposed') AS decisions", u['org_id'])
        runs = await db.pool.fetch('SELECT id, kind, status, started_at, finished_at, stats FROM ingestion_runs '
                                   'ORDER BY id DESC LIMIT 5')
        out.update({
            'pending_approvals': {**dict(pending), 'total': sum(pending.values())},
            'active_flags': {'total': len(flags), 'by_domain': {d: sum(f['domain'] == d for f in flags)
                                                                for d in permissions.DOMAINS}},
            'decisions_by_status': by_status(decs),
            'recent_audit': await _recent_audit(u),
            'ingestion': {'pending_facts': await db.pool.fetchval("SELECT count(*) FROM extractions WHERE status = 'pending'"),
                          'runs': [{'id': r['id'], 'kind': r['kind'], 'status': r['status'],
                                    'started_at': r['started_at'].isoformat(), 'ok': (r['stats'] or {}).get('ok'),
                                    'failed': (r['stats'] or {}).get('failed')} for r in runs]},
            'team_activity': await _team_activity(u, only_mine=False),
        })
    elif scope == 'domain':
        doms = permissions.domains(u)
        dflags = [f for f in flags if f['domain'] in doms]
        out.update({
            'domain_flags': [{'id': f['id'], 'decision_id': f['decision_id'], 'clause': f"{f['clause_id']}@{f['new_version']}",
                              'impact_type': f['impact_type'], 'domain': f['domain']} for f in dflags],
            'pending_approvals': {'total': sum(i['type'] in ('approval', 'agent_action', 'decision_review')
                                               for i in box['items'])},
            'team_activity': await _team_activity(u, only_mine=True),
            'decisions_by_status': by_status(mine),
            'recent_audit': await _recent_audit(u, 5),
        })
    else:
        mine_relied = set().union(*(relied.get(d['id'], set()) for d in mine)) if mine else set()
        props = await db.pool.fetch("SELECT id, title, status, reason, created_at FROM decision_proposals "
                                    "WHERE proposed_by = $1 ORDER BY id DESC LIMIT 5", u['user_id'])
        acts = await db.pool.fetch("SELECT id, tool, status, created_at FROM proposed_actions WHERE proposed_by = $1 "
                                   "ORDER BY id DESC LIMIT 5", u['user_id'])
        out.update({
            'my_proposals': [{'kind': 'decision', 'id': r['id'], 'title': r['title'], 'status': r['status'],
                              'reason': r['reason']} for r in props]
                            + [{'kind': 'agent_action', 'id': r['id'], 'title': r['tool'].replace('_', ' '),
                                'status': r['status'], 'reason': None} for r in acts],
            'policy_changes': await _policy_changes(u, mine_relied),
            'team_activity': await _team_activity(u, only_mine=True),
        })
    return out
