"""C. Policy proposals, duplicate check, collisions and claims."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import conflicts as cf
from ..contracts import current_user

router = APIRouter(tags=['p2: conflicts'])


async def call(coro):
    """Domain errors -> HTTP: 404 missing, 403 not allowed, 409 conflict (with detail), 422 invalid."""
    try:
        return await coro
    except LookupError as e:
        raise HTTPException(404, str(e))
    except cf.Forbidden as e:
        raise HTTPException(403, str(e))
    except cf.Conflict as e:
        raise HTTPException(409, {'message': str(e), **e.extra})
    except ValueError as e:
        raise HTTPException(422, str(e))


class ProposalIn(BaseModel):
    policy_id: str
    clause_id: str
    title: str
    clause_text: str
    field: str | None = None
    new_value: int | float | dict | None = None  # int first: 120 stays 120 in the policy version
    effective_from: date
    rationale: str = ''


class ProposalEdit(BaseModel):
    version: int
    changes: dict


class Resolution(BaseModel):
    choice: str
    reason: str | None = None
    target_ref: str | None = None


class SubmitIn(BaseModel):
    resolution: Resolution | None = None


class ReasonIn(BaseModel):
    reason: str


class RulingIn(BaseModel):
    outcome: str
    reason: str
    merged: dict | None = None


class ClaimIn(BaseModel):
    resource_ref: str
    minutes: int = cf.CLAIM_MINUTES


class OverrideIn(BaseModel):
    reassign_to: str | None = None


class TextIn(BaseModel):
    text: str


@router.get('/policy-proposals')
async def proposals(status: str | None = None, user: dict = Depends(current_user)):
    return await cf.list_proposals(user, status)


@router.post('/policy-proposals', status_code=201)
async def create(body: ProposalIn, user: dict = Depends(current_user)):
    return await call(cf.create_proposal(user, body.model_dump()))


@router.patch('/policy-proposals/{pid}')
async def edit(pid: int, body: ProposalEdit, user: dict = Depends(current_user)):
    return await call(cf.edit_proposal(user, pid, body.version, body.changes))


@router.post('/policy-proposals/{pid}/submit')
async def submit(pid: int, body: SubmitIn | None = None, user: dict = Depends(current_user)):
    res = body and body.resolution and body.resolution.model_dump()
    return await call(cf.submit(user, pid, res))


@router.post('/policy-proposals/{pid}/review')
async def review(pid: int, user: dict = Depends(current_user)):
    return await call(cf.start_review(user, pid))


@router.post('/policy-proposals/{pid}/approve')
async def approve(pid: int, user: dict = Depends(current_user)):
    return await call(cf.approve(user, pid))


@router.post('/policy-proposals/{pid}/reject')
async def reject(pid: int, body: ReasonIn, user: dict = Depends(current_user)):
    return await call(cf.reject(user, pid, body.reason))


@router.post('/conflicts/check')
async def check(body: TextIn, user: dict = Depends(current_user)):
    """Duplicate screen for a document before upload (exact and semantic layers)."""
    return await cf.check_text(user['org_id'], body.text)


@router.get('/collisions')
async def collisions(status: str | None = None, user: dict = Depends(current_user)):
    return await cf.list_collisions(user, status)


@router.post('/collisions/scan-decisions')
async def scan_decisions(user: dict = Depends(current_user)):
    return await call(cf.detect_decision_conflicts(user['org_id']))


@router.get('/collisions/{cid}')
async def collision(cid: int, user: dict = Depends(current_user)):
    return await call(cf.collision_detail(user, cid))


@router.post('/collisions/{cid}/resolve')
async def resolve(cid: int, body: RulingIn, user: dict = Depends(current_user)):
    return await call(cf.resolve(user, cid, body.outcome, body.reason, body.merged))


@router.get('/claims')
async def claim_of(resource_ref: str, user: dict = Depends(current_user)):
    return await cf.holder(user['org_id'], resource_ref)


@router.post('/claims', status_code=201)
async def claim(body: ClaimIn, user: dict = Depends(current_user)):
    return await call(cf.claim(user, body.resource_ref, body.minutes))


@router.delete('/claims/{claim_id}')
async def release(claim_id: int, user: dict = Depends(current_user)):
    return await call(cf.release(user, claim_id))


@router.post('/claims/{claim_id}/override')
async def override(claim_id: int, body: OverrideIn, user: dict = Depends(current_user)):
    return await call(cf.override(user, claim_id, body.reassign_to))
