"""L. Session start endpoints: model status line, heartbeat, scan report, Rescan now, baseline confirmation, and the
scanned-file queue shown in Ingestion Review (Ingest or Ignore each file; nothing is ingested automatically)."""
import asyncio
import re
from datetime import date
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from .. import config, db, ingest, session_start as ss, stt
from ..contracts import can_access, current_user

router = APIRouter(tags=['p2: session start'])


@router.get('/session/model-status')
async def model_status(user: dict = Depends(current_user)):
    return await ss.status()


@router.post('/session/heartbeat')
async def heartbeat(tasks: BackgroundTasks, user: dict = Depends(current_user)):
    tasks.add_task(ss.heartbeat, user)  # may (re)load the model; never make the chat box wait on it
    return {'ok': True}


@router.post('/session/scan')
async def rescan(user: dict = Depends(current_user)):
    run = await ss.scan_directory(user)
    if run is None:
        raise HTTPException(409, 'a scan of this organisation is already running')
    return await ss.report(user, run['id'])


@router.get('/session/scan/latest')
async def latest_scan(user: dict = Depends(current_user)):
    return await ss.report(user)  # null before the first scan


@router.get('/session/scan/{run_id}')
async def scan_report(run_id: int, user: dict = Depends(current_user)):
    out = await ss.report(user, run_id)
    if out is None:
        raise HTTPException(404, 'no such scan')
    return out


@router.post('/session/scan/{run_id}/confirm-baseline')
async def confirm_baseline(run_id: int, user: dict = Depends(current_user)):
    try:
        return {'queued': await ss.confirm_baseline(user, run_id)}
    except PermissionError as e:
        raise HTTPException(403, str(e))


# ---- scanned files waiting in Ingestion Review ----

@router.get('/scan/files')
async def scan_files(review_status: str | None = 'waiting', user: dict = Depends(current_user)):
    """waiting (default) = pending or failed: a failed attempt stays in the queue with its error, for a retry."""
    rows = await db.pool.fetch(
        "SELECT * FROM file_index WHERE org_id=$1 AND status='active' AND ($2::text IS NULL OR review_status=$2 OR "
        "($2 = 'waiting' AND review_status IN ('pending', 'failed'))) ORDER BY path", user['org_id'], review_status)
    return [ss.file_out(r) for r in rows if can_access(user, ss.file_resource(r))]


class FileIngestIn(BaseModel):
    doc_id: str | None = None           # only for files without front-matter; suggested from the file name
    title: str | None = None
    meeting_date: date | None = None    # suggested from the file's modified date; the reviewer confirms it
    consent: bool = False               # audio only: participants know it was recorded and transcribed


async def _file(file_id: int, user: dict):
    row = await db.pool.fetchrow('SELECT * FROM file_index WHERE id=$1 AND org_id=$2', file_id, user['org_id'])
    if row is None or not can_access(user, ss.file_resource(row)):
        raise HTTPException(404, 'no such file')  # same answer whether it does not exist or is out of scope
    if row['review_status'] not in ('pending', 'failed'):
        raise HTTPException(409, f"file is {row['review_status']}, not waiting for review")
    return row


def suggested_id(path: str) -> str:
    return 'DOC-' + re.sub(r'[^A-Za-z0-9]+', '-', Path(path).stem).strip('-').upper()


@router.post('/scan/files/{file_id}/ingest')
async def ingest_file(file_id: int, body: FileIngestIn, user: dict = Depends(current_user)):
    row = await _file(file_id, user)
    p = Path(config.KEYSTONE_DIR) / row['path']
    if not p.is_file():
        raise HTTPException(409, 'the file is no longer on disk; rescan')
    if await asyncio.to_thread(ss._sha, p) != row['sha256']:
        raise HTTPException(409, 'the file changed since the scan; rescan to review the new version')
    source = f"keystone/{row['path']}"
    try:
        if ss.file_out(row)['is_audio']:
            if not body.meeting_date:
                raise ValueError('meeting_date is required for audio (the date comes from the uploader, not the audio)')
            out = await stt.create_audio_source(p.read_bytes(), p.name, body.meeting_date, body.title or p.stem,
                                                body.consent, user, row['visibility'])
            source_id = f"AUDIO-{out['id']}"
        else:
            raw = await asyncio.to_thread(ingest.read_text, p)
            if raw.replace('\r\n', '\n').startswith('---\n'):
                out = await ingest.ingest(raw, source, user['actor'], visibility=row['visibility'])
            else:
                if not body.meeting_date:
                    raise ValueError('this file has no front-matter: confirm a meeting_date for it')
                out = await ingest.ingest_source(raw, source, user['actor'], doc_id=body.doc_id or suggested_id(row['path']),
                                                 title=body.title or p.stem, meeting_date=body.meeting_date,
                                                 label={'visibility': row['visibility']})
            source_id = out['document_id']
    except ValueError as e:
        await db.pool.execute("UPDATE file_index SET review_status='failed', error=$2 WHERE id=$1", file_id, str(e))
        raise HTTPException(422, str(e))
    await db.pool.execute("UPDATE file_index SET review_status='ingested', ingested_source_id=$2, ingested_sha256=$3, "
                          'error=NULL WHERE id=$1', file_id, source_id, row['sha256'])
    return {'file': ss.file_out(await db.pool.fetchrow('SELECT * FROM file_index WHERE id=$1', file_id)), 'result': out}


@router.post('/scan/files/{file_id}/ignore')
async def ignore_file(file_id: int, user: dict = Depends(current_user)):
    await _file(file_id, user)
    await db.pool.execute("UPDATE file_index SET review_status='ignored' WHERE id=$1", file_id)
    return {'ok': True}
