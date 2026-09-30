"""Commit 0: the shared contract between Person 1 (access, identity, comms) and Person 2 (knowledge, reasoning).

Person 2 calls these from day one; Person 1 replaces the stub BODIES without changing any signature.
Agreed shapes (KEYSTONE-BUILD-SPLIT.md section 5):

  user     = {user_id: 'p-priya', org_id: 'nimbus', role: owner|lead|member|compliance|auditor, team_id: str|None,
              actor: 'user:priya'}            # actor = the audit-log actor string for this user
  resource = {type: str, id: str, team: str|None, project: str|None, visibility: 'org'|'team'|'restricted'}
  rule     = {clause_field: 'retention_days_max', decision_field: 'retention_days', op: '<='|'<'|'>='|'>'|'=='}
             (rule packs, feature G: Person 1 loads YAML into this shape, compliance.register_rules() takes a list)
"""
import asyncio
import logging

from fastapi import APIRouter, Depends, Header, HTTPException

from .. import config, db

log = logging.getLogger('keystone.contracts')
ORG_ID = config.E('ORG_ID', 'nimbus')
USERS = set(config.E('KEYSTONE_USERS', 'nitika,priya,farhan,ananya,karthik,divya').split(','))
# ponytail: stub roles for the demo personas; Person 1 (A, B) replaces with memberships.role
_ROLES = {'nitika': 'owner', 'ananya': 'owner', 'farhan': 'compliance', 'karthik': 'lead'}


def user_for(key: str) -> dict:
    return {'user_id': f'p-{key}', 'org_id': ORG_ID, 'role': _ROLES.get(key, 'member'), 'team_id': None,
            'actor': f'user:{key}'}


def current_user(x_user: str | None = Header(None)) -> dict:
    """FastAPI dependency. Stub: identity from the X-User header (same rule as main.actor)."""
    if x_user not in USERS:
        raise HTTPException(401, f'X-User header must be one of {sorted(USERS)}')
    return user_for(x_user)


def can_access(user: dict, resource: dict) -> bool:
    """Single check for reads, writes, search, notifications, exports. Stub keeps today's rule (restricted items
    only for RESTRICTED_READERS) so nothing Person 2 builds leaks before Person 1's real filter lands."""
    if resource.get('visibility', 'org') == 'org':
        return True
    return user['actor'].removeprefix('user:') in config.RESTRICTED_READERS


def visible_filter(user: dict):
    """Retrieval filter: a predicate over resource dicts, applied before anything reaches the model."""
    return lambda resource: can_access(user, resource)


def label_for(source: dict) -> dict:
    """Access label stamped on every ingested source. source: {path?, scope?, visibility?, project?, team?}.
    Stub: explicit visibility wins; a non-org folder scope (Team/..., Groups/...) is 'restricted' until Person 1
    defines team visibility (documents.visibility only allows org|restricted today)."""
    scope = source.get('scope') or 'org'
    vis = source.get('visibility') or ('org' if scope == 'org' else 'restricted')
    return {'team': source.get('team'), 'project': source.get('project'), 'visibility': vis}


def notify(user_id: str, kind: str, ref_id: str) -> None:
    """Stub: logged only. Person 1 (E) stores it and shows the bell."""
    log.info('notify %s %s %s', user_id, kind, ref_id)


class _Audit:
    async def write(self, event_type: str, actor: str, payload, object_type: str, object_id: str,
                    source_ids: list[str] | None = None, conn=None):
        """Hash-chained audit row. event_type must be one of the agreed names (backend/sql/p0/001_contract.sql)."""
        return await db.audit(actor, event_type, object_type, str(object_id), source_ids or [], payload, conn=conn)


audit = _Audit()


class _Hook:
    """on_login.register(fn); on_login.fire(user). Handlers run in the background: firing never delays login."""
    def __init__(self):
        self.handlers = []
        self.tasks = set()

    def register(self, fn):
        self.handlers.append(fn)
        return fn

    def fire(self, user: dict) -> None:
        for fn in self.handlers:
            t = asyncio.get_running_loop().create_task(fn(user))
            self.tasks.add(t)  # keep a reference so the task is not garbage-collected mid-run
            t.add_done_callback(self._done)

    def _done(self, t):
        self.tasks.discard(t)
        if not t.cancelled() and t.exception():
            log.error('on_login handler failed: %r', t.exception())


on_login = _Hook()
on_logout = _Hook()

# Stub sign-in: the demo role picker calls these so the hooks fire today. Person 1 (A) replaces them with real
# login/logout and keeps firing on_login / on_logout after the session is created / destroyed.
router = APIRouter(prefix='/contracts', tags=['contracts'])


@router.post('/login')
async def stub_login(user: dict = Depends(current_user)):
    on_login.fire(user)
    return user


@router.post('/logout')
async def stub_logout(user: dict = Depends(current_user)):
    on_logout.fire(user)
    return {'ok': True}
