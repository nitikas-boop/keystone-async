"""Identity (A): passwords, session tokens, join codes, the demo org, and resolving the caller of a request.

users.id is pseudonymous: the graph and the audit log only ever carry it. Real names live in `users`, so deleting
that row removes identifiability without breaking the hash chain."""
import asyncio
import hashlib
import secrets
import time
from collections import defaultdict, deque
from datetime import date, datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from . import config, db

COOKIE = 'ks_session'
ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'  # no 0/O, 1/I (and lowercase l never appears)
_ph = PasswordHasher()

# The synthetic Nimbus Ledger org (data/vault/people.yaml), seeded on an empty database. user id = the X-User key the
# existing tests and scripts use; person_key = the Person node in the graph.
DEMO_TEAMS = [  # (id, name, lead, projects, policies the department owns, domain)
    ('team-engineering', 'Engineering', 'karthik', ['Project Atlas', 'Internal Ops'], [], 'engineering'),
    ('team-operations', 'Operations', 'priya', ['Procurement'], ['POL-PROC'], 'ops'),
    ('team-compliance', 'Compliance', 'farhan', ['Data Governance'], ['POL-RET'], 'compliance'),
]
DEMO_USERS = [  # (id, employee_id, name, designation, role, team, person_key)
    ('nitika', 'NL-000', 'Nitika', 'Keystone Admin', 'owner', None, None),
    ('ananya', 'NL-001', 'Ananya Rao', 'CEO', 'owner', None, 'p-ananya'),
    ('priya', 'NL-003', 'Priya Menon', 'Ops lead', 'lead', 'team-operations', 'p-priya'),
    ('farhan', 'NL-004', 'Farhan Qureshi', 'Compliance lead', 'compliance', 'team-compliance', 'p-farhan'),
    ('divya', 'NL-005', 'Divya Nair', 'Engineer', 'member', 'team-engineering', 'p-divya'),
    ('rohit', 'NL-006', 'Rohit Kulkarni', 'Engineer', 'member', 'team-engineering', 'p-rohit'),
    ('sneha', 'NL-007', 'Sneha Iyer', 'Analyst', 'member', 'team-operations', 'p-sneha'),
    ('karthik', 'NL-008', 'Karthik Rao', 'CTO', 'lead', 'team-engineering', 'p-karthik'),
    ('meera', 'AUD-001', 'Meera Pillai', 'External auditor', 'auditor', None, None),
    ('aarav', 'NL-009', 'Aarav Mehta', 'Junior Software Engineer', 'member', 'team-engineering', None),
]
# Jurisdiction (B): an employee with assigned projects sees only those (plus their department's policies and the org
# chart). approval_authority_inr: the largest amount a person may approve; leads 5 lakh, employees none, others no cap.
DEMO_ASSIGNED = {'aarav': ['Project Atlas']}
DEMO_AUTHORITY = {'lead': 500000, 'member': 0}
# Tier and domain (app/permissions.py): executives CEO and CTO (and the admin account), leads Ops and Compliance.
DEMO_TIER = {'ananya': 'executive', 'karthik': 'executive', 'nitika': 'executive', 'priya': 'lead', 'farhan': 'lead'}
DEMO_DOMAIN = {'priya': 'ops', 'farhan': 'compliance'}
DEMO_AUDITOR = {'audit_from': date(2025, 1, 1), 'audit_to': date(2025, 12, 31)}


# ---- secrets ----

def hash_password(pw: str) -> str:
    return _ph.hash(pw)


def verify_password(pw: str, stored: str) -> bool:
    try:
        return _ph.verify(stored, pw)
    except (VerificationError, InvalidHashError):
        return False


def new_code() -> str:
    return ''.join(secrets.choice(ALPHABET) for _ in range(8))


def normalise_code(code: str) -> str | None:
    """'nmbl-7k2q' -> 'NMBL7K2Q'; None if it cannot be a join code (wrong length or alphabet)."""
    c = ''.join(code.upper().split()).replace('-', '')
    return c if len(c) == 8 and all(ch in ALPHABET for ch in c) else None


def show_code(code: str) -> str:
    return f'{code[:4]}-{code[4:]}'


def sha(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def make_token(user_id: str, via: str = 'web', device_id: int | None = None) -> str:
    life = timedelta(days=config.DEVICE_SESSION_DAYS) if device_id else timedelta(hours=config.SESSION_HOURS)
    claims = {'sub': user_id, 'via': via, 'exp': datetime.now(timezone.utc) + life}
    if device_id:
        claims['dev'] = device_id
    return jwt.encode(claims, config.JWT_SECRET, algorithm='HS256')


def read_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, config.JWT_SECRET, algorithms=['HS256'])
    except jwt.PyJWTError:
        return None


class Limiter:
    """At most n hits per key in a sliding window. ponytail: in-process memory; one backend process is enough here,
    move to Postgres or Redis if the API ever runs as several workers."""

    def __init__(self, n: int, seconds: int):
        self.n, self.seconds, self.hits = n, seconds, defaultdict(deque)

    def allow(self, key: str) -> bool:
        now, q = time.monotonic(), self.hits[key]
        while q and q[0] < now - self.seconds:
            q.popleft()
        if len(q) >= self.n:
            return False
        q.append(now)
        return True


join_limit = Limiter(10, 600)   # join-code guesses per IP
login_limit = Limiter(20, 600)  # password guesses per IP
claim_limit = Limiter(20, 600)  # pairing-token guesses per IP


# ---- who is this ----

async def load_user(user_id: str, via: str = 'web', device_id: int | None = None) -> dict | None:
    """The contract's user dict for an active member, or None (unknown, pending, removed, expired, revoked device).
    Read on every request, so removal, role changes and device revocation take effect immediately."""
    if db.pool is None:  # in-process unit tests without a database
        return _demo_user(user_id)
    r = await db.pool.fetchrow(
        'SELECT u.id, u.org_id, u.employee_id, u.display_name, u.designation, u.person_key, m.role, m.team_id, '
        'm.audit_from, m.audit_to, m.assigned_projects, m.approval_authority_inr, o.name AS org_name, m.tier, '
        'coalesce(m.domain, t.domain) AS domain, '
        't.name AS department FROM users u JOIN memberships m ON m.user_id = u.id '
        'JOIN organizations o ON o.id = m.org_id LEFT JOIN teams t ON t.id = m.team_id '
        "WHERE u.id = $1 AND m.status = 'active' "
        'AND (m.expires_at IS NULL OR m.expires_at > now())', user_id)
    if r is None:
        return None
    if device_id is not None:
        ok = await db.pool.fetchval('UPDATE linked_devices SET last_seen = now() WHERE id = $1 AND user_id = $2 '
                                    'AND revoked_at IS NULL RETURNING id', device_id, user_id)
        if ok is None:
            return None
    teams = await db.pool.fetch('SELECT team_id AS t FROM team_members WHERE user_id = $1 '
                                'UNION SELECT id FROM teams WHERE lead_id = $1', user_id)
    grants = await db.pool.fetch('SELECT resource_id FROM access_grants WHERE user_id = $1 AND revoked_at IS NULL',
                                 user_id)
    return {'user_id': r['id'], 'org_id': r['org_id'], 'role': r['role'], 'team_id': r['team_id'], 'actor': f"user:{r['id']}",
            'teams': sorted(x['t'] for x in teams), 'grants': sorted(g['resource_id'] for g in grants),
            'via': via, 'device_id': device_id, 'display_name': r['display_name'], 'designation': r['designation'],
            'employee_id': r['employee_id'], 'person_key': r['person_key'], 'org_name': r['org_name'],
            'department': r['department'], 'assigned_projects': r['assigned_projects'] or [],
            'approval_authority_inr': r['approval_authority_inr'], 'tier': r['tier'], 'domain': r['domain'],
            'audit_from': r['audit_from'] and r['audit_from'].isoformat(),
            'audit_to': r['audit_to'] and r['audit_to'].isoformat()}


def _demo_user(user_id: str) -> dict | None:
    u = next((u for u in DEMO_USERS if u[0] == user_id), None)
    if u is None:
        return None
    return {'user_id': u[0], 'org_id': config.GROUP_ID, 'role': u[4], 'team_id': u[5], 'actor': f'user:{u[0]}', 'teams': [u[5]] if u[5] else [],
            'grants': [], 'via': 'web', 'device_id': None, 'display_name': u[2], 'designation': u[3],
            'employee_id': u[1], 'person_key': u[6], 'org_name': 'Nimbus Ledger', 'audit_from': None, 'audit_to': None,
            'department': next((t[1] for t in DEMO_TEAMS if t[0] == u[5]), None),
            'assigned_projects': DEMO_ASSIGNED.get(u[0], []), 'approval_authority_inr': DEMO_AUTHORITY.get(u[4]),
            'tier': DEMO_TIER.get(u[0]), 'domain': DEMO_DOMAIN.get(u[0]) or next((t[5] for t in DEMO_TEAMS if t[0] == u[5]), None)}


async def resolve(request) -> dict | None:
    """Session cookie (browser, phone) or Bearer token (MCP), then the dev-only X-User header."""
    token = request.cookies.get(COOKIE)
    auth = request.headers.get('authorization', '')
    if auth.lower().startswith('bearer '):
        token = auth[7:].strip()
    claims = token and read_token(token)
    if claims:
        return await load_user(claims['sub'], claims.get('via', 'web'), claims.get('dev'))
    if config.DEV_AUTH and request.headers.get('x-user'):
        return await load_user(request.headers['x-user'])
    return None


def me(u: dict) -> dict:
    """What the browser may know about the signed-in user (no grants list, no token)."""
    keys = ('user_id', 'org_id', 'org_name', 'role', 'team_id', 'teams', 'display_name', 'designation',
            'employee_id', 'person_key', 'via', 'audit_from', 'audit_to', 'department', 'assigned_projects',
            'approval_authority_inr', 'tier', 'domain')
    return {k: u.get(k) for k in keys}


# ---- the demo org ----

_seeded = False
_seed_lock = asyncio.Lock()


async def ensure_seed():
    """Create the demo org on an empty database (config.DEMO_SEED). Its id is GROUP_ID, so it owns the existing graph.
    An already seeded demo org gets any demo user added since (Aarav Mehta), without touching existing rows."""
    global _seeded
    if _seeded or db.pool is None:
        return
    async with _seed_lock:
        if not _seeded and config.DEMO_SEED:
            empty = not await db.pool.fetchval('SELECT count(*) FROM organizations')
            have = {r['id'] for r in await db.pool.fetch('SELECT id FROM users WHERE org_id = $1', config.GROUP_ID)}
            if empty or (have and {u[0] for u in DEMO_USERS} - have):
                await _seed(have)
        from . import comms
        async with db.pool.acquire() as c, c.transaction():  # org channels added since an org was created
            for o in await c.fetch('SELECT id FROM organizations'):
                await comms.ensure_org_channels(c, o['id'])
        _seeded = True


async def _seed(have: set = frozenset()):
    from . import comms
    org, pw = config.GROUP_ID, hash_password(config.DEMO_PASSWORD)
    new = [u for u in DEMO_USERS if u[0] not in have]
    async with db.pool.acquire() as c, c.transaction():
        await c.execute('INSERT INTO organizations (id, name, join_code_hash) VALUES ($1, $2, $3) '
                        'ON CONFLICT DO NOTHING', org, 'Nimbus Ledger', sha(normalise_code(config.DEMO_JOIN_CODE)))
        for uid, emp, name, desig, role, team, person in new:
            await c.execute('INSERT INTO users (id, org_id, employee_id, password_hash, display_name, designation, '
                            'person_key) VALUES ($1,$2,$3,$4,$5,$6,$7)', uid, org, emp, pw, name, desig, person)
        for tid, name, lead, projects, policies, domain in DEMO_TEAMS:
            await c.execute('INSERT INTO teams (id, org_id, name, lead_id, projects, policies, domain) '
                            'VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING', tid, org, name, lead, projects,
                            policies, domain)
        for uid, _, _, _, role, team, _ in new:
            aud = DEMO_AUDITOR if role == 'auditor' else {}
            await c.execute("INSERT INTO memberships (user_id, org_id, role, team_id, status, expires_at, audit_from, "
                            "audit_to, assigned_projects, approval_authority_inr, tier, domain) "
                            "VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8,$9,$10,$11)", uid, org, role, team,
                            datetime(2026, 12, 31, tzinfo=timezone.utc) if aud else None,
                            aud.get('audit_from'), aud.get('audit_to'), DEMO_ASSIGNED.get(uid),
                            DEMO_AUTHORITY.get(role), DEMO_TIER.get(uid), DEMO_DOMAIN.get(uid))
            if team:
                await c.execute('INSERT INTO team_members VALUES ($1,$2,$3)', team, uid, org)
        await comms.ensure_org_channels(c, org)
