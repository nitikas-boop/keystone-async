"""Local speech-to-text (faster-whisper on CPU). Weights live in backend/models; nothing is fetched at runtime."""
import re
import tempfile
from datetime import date
from pathlib import Path

from . import config

MODEL_DIR = Path(__file__).resolve().parent.parent / 'models'
_model = None
# Domain vocabulary hint so names and terms come out spelled as the org writes them.
VOCAB = config.E('WHISPER_PROMPT', 'Nimbus Ledger, Keystone, VendorCo contract, 4 lakh, Vikram Shah, Priya Menon, '
                 'Farhan Qureshi, Karthik Rao, Ananya Rao, Keycloak, AWS, retention, policy.')


def _load():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        # local_files_only: a missing model is an error, never a silent download.
        try:
            _model = WhisperModel(config.WHISPER_MODEL, device='cpu', compute_type='int8',
                                  download_root=str(MODEL_DIR), local_files_only=True)
        except Exception as e:
            raise RuntimeError(
                f'Whisper weights ({config.WHISPER_MODEL}) are not in backend/models (they are gitignored). Download once: '
                f'docker compose exec backend python -c "from faster_whisper import WhisperModel; '
                f"WhisperModel('{config.WHISPER_MODEL}', device='cpu', compute_type='int8', download_root='/app/models')\"") from e
    return _model


def transcribe(audio: bytes, suffix: str = '.webm') -> str:
    with tempfile.NamedTemporaryFile(suffix=suffix) as f:
        f.write(audio)
        f.flush()
        segments, _ = _load().transcribe(f.name, beam_size=1, vad_filter=True, initial_prompt=VOCAB)
        return ' '.join(s.text.strip() for s in segments).strip()


def transcribe_segments(audio: bytes, suffix: str = '.wav') -> list[dict]:
    """Timestamped transcript. No diarization: every segment starts as 'Speaker 1' and the uploader maps speakers."""
    with tempfile.NamedTemporaryFile(suffix=suffix) as f:
        f.write(audio)
        f.flush()
        segments, _ = _load().transcribe(f.name, beam_size=1, vad_filter=True, initial_prompt=VOCAB)
        return [{'start': round(s.start, 2), 'end': round(s.end, 2), 'text': s.text.strip(), 'speaker': 'Speaker 1'}
                for s in segments if s.text.strip()]


def stamp(seconds: float) -> str:
    return f'{int(seconds // 60):02d}:{int(seconds % 60):02d}'


def transcript_text(segments: list[dict]) -> str:
    """One paragraph per segment, '[mm:ss] Speaker: text': every extracted quote carries its timestamp, and the
    speaker name lets the extractor attribute who decided."""
    return '\n\n'.join(f"[{stamp(s['start'])}] {s['speaker']}: {s['text']}" for s in segments)


async def create_audio_source(audio: bytes, filename: str, meeting_date: date, title: str, consent: bool,
                              user: dict, visibility: str = 'org') -> dict:
    """F: local transcription of an uploaded (or scanned) recording. Nothing is ingested yet: the uploader maps
    speakers first, then ingest_transcript() turns it into candidates for Ingestion Review."""
    import asyncio
    from . import db
    if not consent:
        raise ValueError('consent is required: confirm the participants know the meeting was recorded and transcribed')
    suffix = Path(filename).suffix.lower() or '.wav'
    segments = await asyncio.to_thread(transcribe_segments, audio, suffix)
    if not segments:
        raise ValueError('no speech recognised')
    store = Path(config.AUDIO_DIR)
    store.mkdir(parents=True, exist_ok=True)
    async with db.pool.acquire() as c, c.transaction():
        aid = await c.fetchval(
            'INSERT INTO audio_sources (org_id, uploader_id, filename, title, meeting_date, consent_flag, visibility) '
            'VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
            user['org_id'], user['user_id'], filename, title, meeting_date, consent, visibility)
        ref = f'{aid}{suffix}'
        (store / ref).write_bytes(audio)
        tid = await c.fetchval('INSERT INTO transcripts (org_id, audio_id, segments_json) VALUES ($1,$2,$3) RETURNING id',
                               user['org_id'], aid, segments)
        await c.execute('UPDATE audio_sources SET file_ref=$2, transcript_id=$3 WHERE id=$1', aid, ref, tid)
    return {'id': aid, 'transcript_id': tid, 'segments': segments}


async def ingest_transcript(aid: int, speakers: dict[str, str], user: dict) -> dict:
    """speakers: {segment index: name}. The transcript becomes a meeting_note source (meeting_date from the uploader,
    consent recorded in its front-matter) and its extracted decisions wait in Ingestion Review."""
    from . import db, ingest
    src = await db.pool.fetchrow('SELECT * FROM audio_sources WHERE id=$1', aid)
    segments = await db.pool.fetchval('SELECT segments_json FROM transcripts WHERE id=$1', src['transcript_id'])
    for i, s in enumerate(segments):
        s['speaker'] = (speakers.get(str(i)) or s['speaker']).strip()
    doc_id = f"MTG-{src['meeting_date'].isoformat()}-AUDIO-{aid}"
    out = await ingest.ingest_source(
        transcript_text(segments), f"audio/{aid}/{src['filename']}", user['actor'], doc_id=doc_id, title=src['title'],
        meeting_date=src['meeting_date'], label={'visibility': src['visibility']},
        extra_front_matter={'audio_source': aid, 'consent_recorded': True, 'uploaded_by': src['uploader_id']})
    await db.pool.execute('UPDATE transcripts SET segments_json=$2 WHERE id=$1', src['transcript_id'], segments)
    await db.pool.execute('UPDATE audio_sources SET document_id=$2 WHERE id=$1', aid, out['document_id'])
    return out


def meeting_markdown(text: str, meeting_date: date, title: str, source: str) -> str:
    """A transcript becomes an ordinary meeting_note: same front-matter, same ingest + extraction + review path."""
    doc_id = f'MTG-{meeting_date.isoformat()}-AUDIO'
    # One sentence per paragraph: the 7B extractor misses decisions buried in one long transcript paragraph.
    text = '\n\n'.join(re.split(r'(?<=[.!?])\s+', text.strip()))
    return (f'---\ndoc_type: meeting_note\ndoc_id: {doc_id}\ntitle: {title}\nmeeting_date: {meeting_date.isoformat()}\n'
            f'source: {source}\n---\n# {title}\n\nTranscript:\n\n{text}\n')
