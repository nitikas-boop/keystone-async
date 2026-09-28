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
        _model = WhisperModel(config.WHISPER_MODEL, device='cpu', compute_type='int8',
                              download_root=str(MODEL_DIR), local_files_only=True)
    return _model


def transcribe(audio: bytes, suffix: str = '.webm') -> str:
    with tempfile.NamedTemporaryFile(suffix=suffix) as f:
        f.write(audio)
        f.flush()
        segments, _ = _load().transcribe(f.name, beam_size=1, vad_filter=True, initial_prompt=VOCAB)
        return ' '.join(s.text.strip() for s in segments).strip()


def meeting_markdown(text: str, meeting_date: date, title: str, source: str) -> str:
    """A transcript becomes an ordinary meeting_note: same front-matter, same ingest + extraction + review path."""
    doc_id = f'MTG-{meeting_date.isoformat()}-AUDIO'
    # One sentence per paragraph: the 7B extractor misses decisions buried in one long transcript paragraph.
    text = '\n\n'.join(re.split(r'(?<=[.!?])\s+', text.strip()))
    return (f'---\ndoc_type: meeting_note\ndoc_id: {doc_id}\ntitle: {title}\nmeeting_date: {meeting_date.isoformat()}\n'
            f'source: {source}\n---\n# {title}\n\nTranscript:\n\n{text}\n')
