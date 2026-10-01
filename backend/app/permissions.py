"""The one permission map: tier -> capabilities, plus the domain, separation-of-duties and procurement-threshold rules.

Tiers map onto the codebase's roles and designations:
  executive  CEO, CTO (and the Keystone admin account)      role owner, or designation CEO / CTO
  lead       Compliance Lead, Ops Lead                       role lead / compliance
  member     Engineers, Analyst (and the read-only auditor)  role member / auditor

The frontend reads GET /me/permissions to hide what a role cannot use; every endpoint enforces the same map with
`need(cap)` or `check_approval`, so hiding a button is never the security check. A refusal is a 403 with a plain
message and a PERMISSION_DENIED row in the hash-chained audit log.
"""
from datetime import date

from fastapi import HTTPException

from . import db

TIERS = ('executive', 'lead', 'member')
DOMAINS = ('compliance', 'procurement', 'engineering', 'ops')
COMMON = {'dashboard', 'chat.dm', 'chat.post', 'ask', 'graph', 'answer.flag', 'policies.read', 'audit.own'}
CAPS = {
    'executive': COMMON | {'dashboard.org', 'channel.create', 'team.create', 'team.manage_any', 'post.announcements',
                           'decision.create', 'approve.any', 'flag.resolve', 'ingestion.review'},
    'lead': COMMON | {'dashboard.domain', 'channel.create', 'team.create', 'decision.create', 'approve.domain',
                      'flag.resolve', 'ingestion.review'},
    'member': COMMON | {'dashboard.personal', 'decision.propose'},
}
# Capabilities tied to a position, not a tier (the table's "CEO only", "CTO, CEO", "Compliance Lead").
POSITION_CAPS = {
    'policy.upload': {'ceo', 'compliance_lead', 'admin'},
    'admin.panel': {'ceo', 'cto', 'admin'},
    'audit.full': {'ceo', 'compliance_lead', 'admin'},
}
READ_ONLY = {'ask', 'graph', 'dashboard', 'dashboard.personal', 'policies.read', 'audit.own'}  # auditors
MESSAGES = {
    'channel.create': 'only executives and leads can create channels',
    'team.create': 'only executives and leads can create teams',
    'team.manage_any': "only an executive can change a team they don't own",
    'post.announcements': '#announcements is for executives to post in; everyone can read it',
    'decision.create': 'members cannot record decisions directly; use "Propose decision" and a lead reviews it',
    'decision.propose': 'only members propose decisions; you can record them directly',
    'policy.upload': 'only the CEO or the Compliance Lead can upload a policy or set its current version',
    'admin.panel': 'the admin panel is open to the CEO and the CTO',
    'audit.full': 'the full audit log is open to the CEO and the Compliance Lead; you see your own entries',
    'flag.resolve': 'only executives and leads can resolve staleness flags',
    'ingestion.review': 'only executives and leads can review ingested facts',
}
CLAUSE_DOMAIN = {'PROC': 'procurement', 'RET': 'compliance'}


def position(u: dict) -> str:
    d = (u.get('designation') or '').strip().lower()
    if d in ('ceo', 'cto'):
        return d
    if u.get('role') == 'compliance':
        return 'compliance_lead'
    if u.get('role') == 'owner':
        return 'admin'
    return 'lead' if u.get('role') == 'lead' else 'member'


def tier(u: dict) -> str:
    if u.get('tier') in TIERS:
        return u['tier']
    if u.get('role') == 'owner' or position(u) in ('ceo', 'cto'):
        return 'executive'
    return 'lead' if u.get('role') in ('lead', 'compliance') else 'member'


def capabilities(u: dict | None) -> set[str]:
    if not u or not u.get('user_id'):
        return set()
    caps = set(CAPS[tier(u)]) | {c for c, who in POSITION_CAPS.items() if position(u) in who}
    if u.get('role') == 'auditor':
        caps &= READ_ONLY
    if u.get('anonymous'):  # dev-only reads without a sign-in (contracts.DEMO_OWNER): reads only, never writes
        caps &= READ_ONLY | {'audit.full'}
    if u.get('via') == 'mcp':  # an agent session reads and proposes; approving stays with a person
        caps -= {'approve.any', 'approve.domain', 'flag.resolve', 'ingestion.review'}
    return caps


def can(u: dict | None, cap: str) -> bool:
    return cap in capabilities(u)


def domains(u: dict) -> set[str]:
    """Executives: every domain. Others: their own (memberships.domain, else their team's domain)."""
    if tier(u) == 'executive':
        return set(DOMAINS)
    return {d for d in (u.get('domain'),) if d}


def domain_for_clause(clause_id: str | None) -> str | None:
    """A proposal's or flag's domain from its clause (PROC-3.1 -> procurement). None: only executives may act."""
    return CLAUSE_DOMAIN.get((clause_id or '').split('-')[0])


async def decision_domain(fm: dict) -> str | None:
    """A decision's domain: the domain of the team its project (or explicit team) belongs to."""
    from . import access
    team = access.label_for({k: v for k, v in fm.items() if k in ('project', 'team', 'policy_id')}).get('team')
    return team and await db.pool.fetchval('SELECT domain FROM teams WHERE id = $1', team)


def view(u: dict) -> dict:
    """GET /me/permissions."""
    t = tier(u)
    return {'user_id': u['user_id'], 'tier': t, 'position': position(u), 'role': u['role'],
            'domains': sorted(domains(u)), 'capabilities': sorted(capabilities(u)),
            'dashboard_scope': {'executive': 'org', 'lead': 'domain', 'member': 'personal'}[t],
            'audit_scope': 'full' if can(u, 'audit.full') else 'own',
            'read_only': u.get('role') == 'auditor'}


# ---- enforcement ----

async def deny(u: dict | None, what: str, message: str, object_type: str = 'capability'):
    """403 with a clear message, recorded in the audit log (the payload names the refused capability)."""
    if u and u.get('user_id') and not u.get('anonymous') and db.pool is not None:
        await db.audit(f"user:{u['user_id']}", 'PERMISSION_DENIED', object_type, str(what), [],
                       {'user': u['user_id'], 'tier': tier(u), 'refused': what, 'message': message})
    raise HTTPException(403, message)


def need(cap: str):
    """FastAPI dependency: the signed-in user holds `cap` (returns the user dict)."""
    async def dep():
        from .contracts import current_user
        u = current_user()
        if not u or not u.get('user_id') or u.get('anonymous'):
            raise HTTPException(401, 'sign in required')
        if not can(u, cap):
            await deny(u, cap, MESSAGES.get(cap, f'your role cannot do this ({cap})'))
        return u
    return dep


async def require_cap(u: dict, cap: str):
    if not can(u, cap):
        await deny(u, cap, MESSAGES.get(cap, f'your role cannot do this ({cap})'))


async def procurement_threshold(on: date | None = None) -> tuple[int | None, str | None]:
    """The CTO's approval limit from the procurement clause in force (PROC-3.1 fields.approver_threshold_inr.CTO),
    and that clause's id@version. Read from the policy, never hardcoded."""
    r = await db.pool.fetchrow(
        "SELECT clause_id, version, fields FROM policy_clauses WHERE clause_id LIKE 'PROC-%' "
        "AND fields ? 'approver_threshold_inr' AND effective_from <= $1 "
        "AND (effective_to IS NULL OR effective_to > $1) ORDER BY effective_from DESC LIMIT 1", on or date.today())
    if r is None:
        return None, None
    return (r['fields']['approver_threshold_inr'] or {}).get('CTO'), f"{r['clause_id']}@{r['version']}"


async def approval_block(u: dict, *, domain: str | None, proposer: str | None = None,
                         decision_owner: str | None = None, amount=None) -> str | None:
    """Why `u` may not approve this item (None: they may). Used both to enforce and to decide whose inbox it is in."""
    if not (can(u, 'approve.any') or can(u, 'approve.domain')):
        return 'members cannot approve decisions or policies; a team lead, compliance or an executive must'
    if proposer and proposer == u['user_id']:
        return 'separation of duties: you cannot approve something you proposed'
    if decision_owner and decision_owner in (u.get('person_key'), u['user_id']):
        return 'separation of duties: you cannot approve an action on a decision you made'
    if not can(u, 'approve.any') and domain not in domains(u):
        return f"this is a {domain or 'cross-domain'} item; a lead approves only their own domain " \
               f"({', '.join(sorted(domains(u))) or 'none'})"
    if domain == 'procurement':
        limit, clause = await procurement_threshold()
        pos = position(u)
        if isinstance(amount, (int, float)) and limit is not None and amount > limit and pos != 'ceo':
            return f'₹{amount:,.0f} is above the CTO limit of ₹{limit:,.0f} in {clause}: the CEO must sign off'
        if pos not in ('ceo', 'cto'):
            return f'procurement approvals need the CTO (up to ₹{limit:,.0f} under {clause}) or the CEO' \
                if limit is not None else 'procurement approvals need the CTO or the CEO'
    return None


async def check_approval(u: dict, object_type: str, object_id, **kw):
    why = await approval_block(u, **kw)
    if why:
        await deny(u, f'{object_type}:{object_id}', why, object_type)


if __name__ == '__main__':
    ceo = {'user_id': 'ananya', 'role': 'owner', 'designation': 'CEO'}
    cto = {'user_id': 'karthik', 'role': 'lead', 'designation': 'CTO'}
    ops = {'user_id': 'priya', 'role': 'lead', 'designation': 'Ops lead', 'domain': 'ops'}
    comp = {'user_id': 'farhan', 'role': 'compliance', 'designation': 'Compliance lead', 'domain': 'compliance'}
    eng = {'user_id': 'divya', 'role': 'member', 'designation': 'Engineer'}
    aud = {'user_id': 'meera', 'role': 'auditor', 'designation': 'External auditor'}
    assert [tier(x) for x in (ceo, cto, ops, comp, eng, aud)] == ['executive', 'executive', 'lead', 'lead', 'member', 'member']
    assert can(ceo, 'policy.upload') and not can(cto, 'policy.upload') and can(comp, 'policy.upload')
    assert can(cto, 'admin.panel') and not can(comp, 'admin.panel') and not can(ops, 'admin.panel')
    assert can(ops, 'team.create') and not can(eng, 'team.create') and not can(eng, 'channel.create')
    assert can(eng, 'decision.propose') and not can(eng, 'decision.create') and can(eng, 'chat.dm')
    assert not can(aud, 'chat.post') and can(aud, 'ask')
    assert can(comp, 'audit.full') and not can(cto, 'audit.full')
    assert domains(ops) == {'ops'} and domains(ceo) == set(DOMAINS)
    assert domain_for_clause('PROC-3.1') == 'procurement' and domain_for_clause('X-1') is None
    print('permissions self-check ok')
