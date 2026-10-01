"""F. Audio to documents: upload (consent + meeting date required) -> local Whisper transcript with timestamps ->
speaker mapping -> candidates in Ingestion Review. Raw audio is deletable; the reviewed transcript stays."""
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .. import config, db, stt
from ..contracts import audit, can_access, current_user

router = APIRouter(tags=['p2: audio'])


def _out(r, segments=None) -> dict:
    d = {k: r[k] for k in ('id', 'uploader_id', 'filename', 'title', 'consent_flag', 'visibility', 'document_id')}
    d.update(meeting_date=r['meeting_date'].isoformat(), created_at=r['created_at'].isoformat(),
             audio_available=r['file_ref'] is not None,
             audio_deleted_at=r['audio_deleted_at'] and r['audio_deleted_at'].isoformat())
    if segments is not None:
        d['segments'] = segments
    return d


async def _source(aid: int, user: dict):
    r = await db.pool.fetchrow('SELECT * FROM audio_sources WHERE id=$1 AND org_id=$2', aid, user['org_id'])
    if r is None or not can_access(user, {'type': 'audio', 'id': str(aid), 'visibility': r['visibility']}):
        raise HTTPException(404, 'no such audio source')
    return r


@router.post('/audio', status_code=201)
async def upload_audio(file: UploadFile, meeting_date: date = Form(...), title: str = Form(...),
                       consent: bool = Form(False), user: dict = Depends(current_user)):
    data = await file.read()
    if not data:
        raise HTTPException(422, 'empty audio')
    if Path(file.filename or '').suffix.lower() not in ('.mp3', '.wav', '.m4a', '.webm', '.ogg'):
        raise HTTPException(422, 'audio must be .mp3, .wav, .m4a, .webm or .ogg')
    try:
        out = await stt.create_audio_source(data, file.filename, meeting_date, title, consent, user)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except RuntimeError as e:  # Whisper weights missing: say how to fix it
        raise HTTPException(503, str(e))
    return _out(await _source(out['id'], user), out['segments'])


@router.get('/audio')
async def list_audio(user: dict = Depends(current_user)):
    rows = await db.pool.fetch('SELECT * FROM audio_sources WHERE org_id=$1 ORDER BY id DESC', user['org_id'])
    return [_out(r) for r in rows if can_access(user, {'type': 'audio', 'id': str(r['id']), 'visibility': r['visibility']})]


@router.get('/audio/by-document/{doc_id}')
async def audio_for_document(doc_id: str, user: dict = Depends(current_user)):
    r = await db.pool.fetchrow('SELECT id FROM audio_sources WHERE document_id=$1 AND org_id=$2', doc_id, user['org_id'])
    if r is None:
        raise HTTPException(404, 'no audio for that document')
    return await get_audio(r['id'], user)


@router.get('/audio/{aid}')
async def get_audio(aid: int, user: dict = Depends(current_user)):
    r = await _source(aid, user)
    return _out(r, await db.pool.fetchval('SELECT segments_json FROM transcripts WHERE id=$1', r['transcript_id']))


class SpeakersIn(BaseModel):
    speakers: dict[str, str] = {}  # segment index -> person name, e.g. {"0": "Ananya Rao"}


@router.post('/audio/{aid}/ingest')
async def ingest_audio(aid: int, body: SpeakersIn, user: dict = Depends(current_user)):
    await _source(aid, user)
    try:
        return await stt.ingest_transcript(aid, body.speakers, user)
    except ValueError as e:
        raise HTTPException(422, str(e))


@router.get('/audio/{aid}/file')
async def audio_file(aid: int, user: dict = Depends(current_user)):
    r = await _source(aid, user)
    if r['file_ref'] is None:
        raise HTTPException(404, 'the raw audio was deleted; the transcript remains')
    return FileResponse(Path(config.AUDIO_DIR) / r['file_ref'], filename=r['filename'])


@router.delete('/audio/{aid}/file')
async def delete_audio_file(aid: int, user: dict = Depends(current_user)):
    r = await _source(aid, user)
    if r['file_ref'] is None:
        return _out(r)
    (Path(config.AUDIO_DIR) / r['file_ref']).unlink(missing_ok=True)
    async with db.pool.acquire() as c, c.transaction():
        await c.execute('UPDATE audio_sources SET file_ref=NULL, audio_deleted_at=now() WHERE id=$1', aid)
        await audit.write('file_access_removed', user['actor'], {'raw_audio_deleted': r['filename']}, 'file',
                          f'audio:{aid}', [r['document_id']] if r['document_id'] else [], conn=c)
    return _out(await _source(aid, user))


if __name__ == '__main__':
    assert stt.stamp(83.4) == '01:23'
    assert stt.transcript_text([{'start': 0, 'text': 'Hi.', 'speaker': 'Ananya Rao'}]) == '[00:00] Ananya Rao: Hi.'
    print('audio self-check ok')
