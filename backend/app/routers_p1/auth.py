"""A: register an organisation, join with a code, sign in and out. The session is a short-lived JWT in an HTTP-only
cookie; an MCP client gets the same token as a Bearer string instead (it cannot approve anything)."""
import asyncio
import re
import secrets

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from . import ip, spawn
from .. import comms, config, contracts, db, identity, plugins

router = APIRouter(tags=['p1 auth'])
EMPLOYEE_ID = re.compile(r'^[A-Za-z0-9_.-]{2,32}$')
_dummy = None


class RegisterIn(BaseModel):
    org_name: str
    employee_id: str
    password: str
    display_name: str
    designation: str | None = None


class JoinIn(BaseModel):
    join_code: str
    employee_id: str
    password: str
    display_name: str
    designation: str | None = None


class LoginIn(BaseModel):
    employee_id: str
    password: str
    client: str = 'web'  # web | mcp


def _check_new(employee_id: str, password: str, name: str):
    if not EMPLOYEE_ID.match(employee_id):
        raise HTTPException(422, 'employee ID: 2-32 letters, digits, dot, dash or underscore')
    if len(password) < 8:
        raise HTTPException(422, 'password: at least 8 characters')
    if not name.strip():
        raise HTTPException(422, 'display name is required')


def set_session(request: Request, response: Response, token: str, max_age: int):
    response.set_cookie(identity.COOKIE, token, max_age=max_age, httponly=True, samesite='lax', path='/',
                        secure=request.url.scheme == 'https')


def start_session(request: Request, response: Response, user: dict):
    set_session(request, response, identity.make_token(user['user_id']), config.SESSION_HOURS * 3600)
    spawn(contracts.on_login.fire(user), user)  # model warm-up and directory scan; never delays the response


async def _new_user(c, org_id: str, body, pw_hash: str) -> str:
    if await c.fetchval('SELECT 1 FROM users WHERE employee_id = $1', body.employee_id):
        raise HTTPException(409, 'that employee ID is already registered')
    uid = f'u-{secrets.token_hex(4)}'
    await c.execute('INSERT INTO users (id, org_id, employee_id, password_hash, display_name, designation) '
                    'VALUES ($1,$2,$3,$4,$5,$6)', uid, org_id, body.employee_id, pw_hash, body.display_name.strip(),
                    body.designation)
    return uid


@router.post('/auth/register', status_code=201)
async def register(body: RegisterIn, request: Request, response: Response):
    """A new organisation with the caller as Owner. The join code is shown once, here; only its hash is stored."""
    _check_new(body.employee_id, body.password, body.display_name)
    if not body.org_name.strip():
        raise HTTPException(422, 'organisation name is required')
    pw = await asyncio.to_thread(identity.hash_password, body.password)
    code, org = identity.new_code(), f'org-{secrets.token_hex(4)}'
    async with db.pool.acquire() as c, c.transaction():
        await c.execute('INSERT INTO organizations (id, name, join_code_hash) VALUES ($1,$2,$3)', org,
                        body.org_name.strip(), identity.sha(code))
        uid = await _new_user(c, org, body, pw)
        await c.execute("INSERT INTO memberships (user_id, org_id, role, status) VALUES ($1,$2,'owner','active')",
                        uid, org)
        await comms.ensure_org_channels(c, org)
        await db.audit(f'user:{uid}', 'org_created', 'organization', org, [], {'owner': uid}, conn=c)
    user = await identity.load_user(uid)
    start_session(request, response, user)
    return {**identity.me(user), 'join_code': identity.show_code(code)}


@router.post('/auth/join', status_code=201)
async def join(body: JoinIn, request: Request, response: Response):
    """Pending until the Owner or a Team lead approves (unless the org turned approval off). Every failure reads the
    same, so the endpoint is no oracle for which codes exist; attempts are rate-limited per IP."""
    if not identity.join_limit.allow(ip(request)):
        raise HTTPException(429, 'too many join attempts; wait a few minutes')
    _check_new(body.employee_id, body.password, body.display_name)
    code = identity.normalise_code(body.join_code)
    bad = HTTPException(400, 'invalid or expired join code')
    if code is None:
        raise bad
    pw = await asyncio.to_thread(identity.hash_password, body.password)
    async with db.pool.acquire() as c, c.transaction():
        o = await c.fetchrow('SELECT * FROM organizations WHERE join_code_hash = $1 FOR UPDATE', identity.sha(code))
        if (o is None or o['code_disabled'] or (o['code_max_uses'] is not None and o['code_uses'] >= o['code_max_uses'])
                or (o['code_expires_at'] and o['code_expires_at'] <= await c.fetchval('SELECT now()'))):
            raise bad
        uid = await _new_user(c, o['id'], body, pw)
        status = 'pending' if o['require_approval'] else 'active'
        await c.execute('INSERT INTO memberships (user_id, org_id, role, status) VALUES ($1,$2,$3,$4)',
                        uid, o['id'], 'member', status)
        await c.execute('UPDATE organizations SET code_uses = code_uses + 1 WHERE id = $1', o['id'])
        await db.audit(f'user:{uid}', 'join_requested', 'membership', uid, [], {'org_id': o['id'], 'status': status},
                       conn=c)
        approvers = await c.fetch("SELECT user_id FROM memberships WHERE org_id = $1 AND status = 'active' "
                                  "AND role IN ('owner', 'lead')", o['id'])
        for a in approvers:
            await comms.notify(a['user_id'], 'join_request', uid, conn=c)
    if status == 'active':
        start_session(request, response, await identity.load_user(uid))
    return {'status': status, 'org_name': o['name'], 'user_id': uid}


@router.post('/auth/login')
async def login(body: LoginIn, request: Request, response: Response):
    global _dummy
    if not identity.login_limit.allow(ip(request)):
        raise HTTPException(429, 'too many sign-in attempts; wait a few minutes')
    row = await db.pool.fetchrow('SELECT u.id, u.password_hash, m.status, m.org_id FROM users u '
                                 'JOIN memberships m ON m.user_id = u.id WHERE u.employee_id = $1', body.employee_id)
    if row is None:  # same cost as a real check, so timing does not reveal which IDs exist
        _dummy = _dummy or await asyncio.to_thread(identity.hash_password, secrets.token_hex(8))
        await asyncio.to_thread(identity.verify_password, body.password, _dummy)
        raise HTTPException(401, 'wrong employee ID or password')
    if not await asyncio.to_thread(identity.verify_password, body.password, row['password_hash']):
        raise HTTPException(401, 'wrong employee ID or password')
    if row['status'] == 'pending':
        raise HTTPException(403, 'your join request is waiting for approval by the Owner or a Team lead')
    user = await identity.load_user(row['id'])
    if user is None:
        raise HTTPException(401, 'wrong employee ID or password')
    if body.client == 'mcp':
        if not plugins.is_enabled(user['org_id'], 'keystone-mcp'):
            raise HTTPException(403, 'the Keystone MCP plugin is disabled for this organisation')
        return {'token': identity.make_token(user['user_id'], via='mcp'), 'user': identity.me({**user, 'via': 'mcp'})}
    start_session(request, response, user)
    return identity.me(user)


async def _demo_accounts() -> list:
    """Seeded demo users that are active and still use DEMO_PASSWORD; empty unless config.DEMO_LOGIN."""
    if not config.DEMO_LOGIN:
        return []
    rows = await db.pool.fetch("SELECT u.id, u.employee_id, u.display_name, u.designation, u.password_hash, m.role "
                               "FROM users u JOIN memberships m ON m.user_id = u.id WHERE u.id = ANY($1) "
                               "AND m.status = 'active' ORDER BY u.employee_id", [d[0] for d in identity.DEMO_USERS])
    ok = await asyncio.gather(*(asyncio.to_thread(identity.verify_password, config.DEMO_PASSWORD, r['password_hash'])
                                for r in rows))
    return [r for r, good in zip(rows, ok) if good]


@router.get('/auth/demo')
async def demo_accounts():
    """The one-click demo sign-in list (public, demo builds only)."""
    return [{k: r[k] for k in ('employee_id', 'display_name', 'designation', 'role')} for r in await _demo_accounts()]


class DemoIn(BaseModel):
    employee_id: str


@router.post('/auth/demo')
async def demo_login(body: DemoIn, request: Request, response: Response):
    r = next((r for r in await _demo_accounts() if r['employee_id'] == body.employee_id), None)
    if r is None:
        raise HTTPException(404, 'no such demo account')
    user = await identity.load_user(r['id'])
    start_session(request, response, user)
    return identity.me(user)


@router.post('/auth/logout')
async def logout(response: Response):
    response.delete_cookie(identity.COOKIE, path='/')
    return {'ok': True}


@router.get('/auth/me')
async def me():
    u = contracts.current_user()
    if not u or not u.get('user_id') or u.get('anonymous'):
        raise HTTPException(401, 'not signed in')
    return identity.me(u)
