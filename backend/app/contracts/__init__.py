"""The shared contract between Person 1 (access, identity, comms) and Person 2 (knowledge, reasoning).

Signatures are frozen (KEYSTONE-BUILD-SPLIT.md sections 5 and 6). Person 1 replaces the stub bodies; Person 2 calls
these from day one, so nothing needs rework at merge. Stubs are permissive: a fixed demo owner, everything visible.

Agreed shapes:
  user     = {user_id, org_id, role, team_id}          role: owner | lead | member | compliance | auditor
  resource = {type, id, team, project, visibility}     visibility: org | team | restricted
  rule     = see app/plugins (rule-pack YAML format)
"""
import logging
from contextvars import ContextVar
from types import SimpleNamespace

from fastapi import HTTPException
from fastapi.responses import JSONResponse

from .. import access, config, db, identity, plugins

log = logging.getLogger('keystone.contracts')
# Dev-only (config.DEV_AUTH): a request with no identity at all reads as this owner, exactly as the Commit 0 stub did,
# so tests that read without signing in keep working. It cannot write: actor() refuses it.
DEMO_OWNER = {'user_id': 'nitika', 'org_id': config.GROUP_ID, 'role': 'owner', 'team_id': None, 'teams': [],
              'grants': [], 'via': 'web'}
ANON = {'user_id': None, 'org_id': None, 'role': 'anonymous', 'team_id': None, 'teams': [], 'grants': []}
PUBLIC = {'/health', '/auth/login', '/auth/register', '/auth/join', '/auth/logout', '/auth/me', '/auth/demo', '/devices/claim',
          '/docs', '/docs/oauth2-redirect', '/redoc', '/openapi.json'}
_user: ContextVar[dict | None] = ContextVar('keystone_user', default=None)


# ---- who is asking (A) ----

def current_user() -> dict | None:
    """The signed-in user for this request (ANON on a public route); None outside a request (watcher, scanner,
    executor). Beyond the agreed keys it carries teams, grants, via (web | mcp | device) and display fields."""
    return _user.get()


async def bind_user(request, call_next):
    """HTTP middleware: resolves the caller once per request so current_user() works anywhere below it. Everything
    except PUBLIC needs a session: an unknown caller gets 401 before any route runs."""
    try:
        await identity.ensure_seed()
        user = await identity.resolve(request)
        if user and db.pool is not None:
            await access.refresh_projects(user['org_id'])
            if user['org_id'] not in plugins.ENABLED:
                await plugins.refresh(user['org_id'])
    except Exception as e:  # outside surface_errors: say why instead of a bare 500 (e.g. P1 migrations not applied)
        log.exception('resolving the caller failed')
        return JSONResponse({'detail': f'cannot resolve the signed-in user: {type(e).__name__}: {e}'}, 500)
    if user and user.get('via') == 'mcp' and not plugins.is_enabled(user['org_id'], 'keystone-mcp'):
        return JSONResponse({'detail': 'the Keystone MCP plugin is disabled for this organisation'}, 403)
    if user is None:
        creds = request.cookies.get(identity.COOKIE) or request.headers.get('authorization') or             request.headers.get('x-user')
        if config.DEV_AUTH and not creds:  # an expired or revoked session never falls back to this
            user = {**DEMO_OWNER, 'anonymous': True}
        elif request.url.path in PUBLIC or request.method == 'OPTIONS':
            user = ANON
        else:
            return JSONResponse({'detail': 'sign in required'}, 401)
    token = _user.set(user)
    try:
        return await call_next(request)
    finally:
        _user.reset(token)


def actor() -> str:
    """FastAPI dependency: any signed-in user, as the audit actor string 'user:<user_id>'."""
    u = current_user()
    if not u or not u.get('user_id') or u.get('anonymous'):
        raise HTTPException(401, 'sign in required')
    return f"user:{u['user_id']}"


def writer() -> str:
    """Signed in and allowed to change things: not an auditor (read-only guest)."""
    who = actor()
    if current_user()['role'] == 'auditor':
        raise HTTPException(403, 'auditors have read-only access')
    return who


def human() -> str:
    """A writer who is a person at a browser or a paired phone, not an agent token (approvals)."""
    who = writer()
    if current_user().get('via') == 'mcp':
        raise HTTPException(403, 'an agent (MCP) session cannot approve; a person must')
    return who


# ---- who may see what (B) ----

def can_access(user: dict | None, resource: dict, action: str = 'read') -> bool:
    return access.can_access(user, resource, action)


def visible_filter(user: dict | None):
    """A predicate over node/edge property dicts (or provenance dicts): True if the user may see it."""
    return access.visible_filter(user)


def label_for(source: dict) -> dict:
    """Access label for a document's front-matter or a graph node's properties: {team, project, visibility, date}."""
    return access.label_for(source)


async def log_view(resource: dict) -> None:
    """Audit a successful view of a restricted item (restricted_view)."""
    await access.log_view(current_user(), resource)


# ---- events ----

class _Hook:
    def __init__(self):
        self.handlers = []

    def register(self, fn):
        self.handlers.append(fn)
        return fn

    async def fire(self, user: dict):
        """Each handler runs even if an earlier one fails; a failure is logged, never raised into the login."""
        for fn in self.handlers:
            try:
                await fn(user)
            except Exception:
                log.exception('on_login handler %s failed', getattr(fn, '__name__', fn))


on_login = _Hook()  # Person 2 registers warm_model and scan_directory; Person 1 fires it after a real login


async def notify(user_id: str, kind: str, ref_id: str) -> None:
    """In-app notification for one user (E). The text is built when it is read, so it never carries data."""
    from .. import comms
    await comms.notify(user_id, kind, ref_id)


async def _audit_write(event_type: str, actor: str, payload, object_type: str = 'org', object_id: str = '',
                       source_ids: list[str] = (), conn=None):
    return await db.audit(actor, event_type, object_type, object_id, list(source_ids), payload, conn=conn)


audit = SimpleNamespace(write=_audit_write)


# ---- Person 2 -> Person 1 ----

async def ingest_source(raw: str, path: str, actor: str, visibility: str = 'org') -> dict:
    """The one ingestion entry point (Person 2): the result lands in Ingestion Review."""
    from .. import ingest
    return await ingest.ingest(raw, path, actor, visibility)


def load_rules(org_id: str) -> list[dict]:
    """Enabled rule-pack rules for an org (Person 1's loader); Person 2's checker accepts this list.
    Rule shape: see app/plugins/__init__.py."""
    from .. import plugins
    return plugins.load_rules(org_id)
