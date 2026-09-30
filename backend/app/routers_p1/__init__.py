# Person 1 routers (auth, org, access, chat, devices, plugins, proposed actions). Auto-included by main.py: every
# module here must define `router`; shared helpers live in this file.
import asyncio

from fastapi import HTTPException, Request

from ..contracts import _user, actor, current_user, human, writer

_tasks: set = set()


def signed_in() -> dict:
    actor()
    return current_user()


def editor() -> dict:
    """Signed in and not read-only (auditors are)."""
    writer()
    return current_user()


def person() -> dict:
    """A person, not an agent token: every approval and every admin change."""
    human()
    return current_user()


def require(u: dict, *roles: str):
    if u['role'] not in roles:
        raise HTTPException(403, f"needs role {' or '.join(roles)}")


def ip(request: Request) -> str:
    return request.client.host if request.client else 'unknown'


def spawn(coro, user: dict | None = None):
    """Run after the response without delaying it, as `user` (or the caller). Keeps a reference so it is not GC'd."""
    u = user or current_user()

    async def run():
        _user.set(u)
        await coro
    t = asyncio.create_task(run())
    _tasks.add(t)
    t.add_done_callback(_tasks.discard)
    return t
