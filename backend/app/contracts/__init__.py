"""The shared contract between Person 1 (access, identity, comms) and Person 2 (knowledge, reasoning).

Signatures are frozen (KEYSTONE-BUILD-SPLIT.md sections 5 and 6). Person 1 replaces the stub bodies; Person 2 calls
these from day one, so nothing needs rework at merge. Stubs are permissive: a fixed demo owner, everything visible.

Agreed shapes:
  user     = {user_id, org_id, role, team_id}          role: owner | lead | member | compliance | auditor
  resource = {type, id, team, project, visibility}     visibility: org | team | restricted
  rule     = see app/plugins (rule-pack YAML format)
"""
from contextvars import ContextVar
from types import SimpleNamespace

from fastapi import Header, HTTPException

from .. import config, db

USERS = set(config.E('KEYSTONE_USERS', 'nitika,priya,farhan,ananya,karthik').split(','))
DEMO_OWNER = {'user_id': 'nitika', 'org_id': config.GROUP_ID, 'role': 'owner', 'team_id': None}
_user: ContextVar[dict | None] = ContextVar('keystone_user', default=None)


# ---- who is asking (A) ----

def current_user() -> dict | None:
    """The signed-in user for this request; None outside a request (watcher, scanner, executor)."""
    return _user.get()


async def bind_user(request, call_next):
    """HTTP middleware: resolves the caller once per request so current_user() works anywhere below it."""
    x = request.headers.get('x-user')
    token = _user.set({**DEMO_OWNER, 'user_id': x} if x in USERS else DEMO_OWNER)
    try:
        return await call_next(request)
    finally:
        _user.reset(token)


def actor(x_user: str | None = Header(None)) -> str:
    """FastAPI dependency: any signed-in user, as the audit actor string 'user:<user_id>'."""
    if x_user not in USERS:
        raise HTTPException(401, f'X-User header must be one of {sorted(USERS)}')
    return f'user:{x_user}'


writer = actor  # signed in and allowed to change things (not an auditor)
human = actor   # writer, and a person at a browser, not an agent token (approvals)


# ---- who may see what (B) ----

def can_access(user: dict | None, resource: dict, action: str = 'read') -> bool:
    return True


def visible_filter(user: dict | None):
    """A predicate over node/edge property dicts (or provenance dicts): True if the user may see it."""
    return lambda props: True


def label_for(source: dict) -> dict:
    """Access label for a document's front-matter or a graph node's properties."""
    return {'team': source.get('team'), 'project': source.get('project'),
            'visibility': source.get('visibility') or 'org'}


async def log_view(resource: dict) -> None:
    """Audit a successful view of a restricted item (restricted_view)."""


# ---- events ----

class _Hook:
    def __init__(self):
        self.handlers = []

    def register(self, fn):
        self.handlers.append(fn)
        return fn

    async def fire(self, user: dict):
        for fn in self.handlers:
            await fn(user)


on_login = _Hook()  # Person 2 registers warm_model and scan_directory; Person 1 fires it after a real login


async def notify(user_id: str, kind: str, ref_id: str) -> None:
    """In-app notification for one user (E)."""


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
    """Enabled rule-pack rules for an org (Person 1's loader); Person 2's checker accepts this list."""
    return []
