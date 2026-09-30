"""F: audio -> timestamped transcript -> speaker mapping -> candidates in Ingestion Review, consent required, raw audio
deletable while the transcript stays. I: an answer translated sentence by sentence with citation IDs untouched."""
import json
import re
from pathlib import Path

import httpx
import pytest

from conftest import wipe
from p2util import H, audit_actions, last_audit_id, p2_wipe, sql

WAV = Path('/demo-upload/meeting-2026-09-28.wav')


@pytest.fixture
def clean_p2(api):
    wipe()
    p2_wipe()
    yield api
    p2_wipe()
    wipe()


def upload(api, consent: bool):
    return httpx.post(f'{api}/audio', headers=H('priya'), timeout=600,
                      files={'file': (WAV.name, WAV.read_bytes(), 'audio/wav')},
                      data={'meeting_date': '2026-09-28', 'title': 'Retention sync', 'consent': str(consent).lower()})


def test_audio_to_candidates_with_timestamps_consent_and_deletion(clean_p2):
    api, start = clean_p2, last_audit_id(clean_p2)
    assert upload(api, consent=False).status_code == 422  # consent is not optional
    r = upload(api, consent=True)
    assert r.status_code == 201, r.text
    a = r.json()
    segs = a['segments']
    assert segs and all(s['end'] > s['start'] >= 0 and s['text'] for s in segs) and a['consent_flag'] is True
    assert a['document_id'] is None  # nothing ingested until the uploader maps speakers

    out = httpx.post(f'{api}/audio/{a["id"]}/ingest', headers=H('priya'), timeout=900,
                     json={'speakers': {str(i): 'Ananya Rao' for i in range(len(segs))}})
    assert out.status_code == 200, out.text
    doc_id = out.json()['document_id']
    assert doc_id == f'MTG-2026-09-28-AUDIO-{a["id"]}'
    doc = httpx.get(f'{api}/documents/{doc_id}').json()
    assert doc['ref_time'] == '2026-09-28'  # from the uploader, not the audio
    assert doc['front_matter']['consent_recorded'] is True and doc['front_matter']['audio_source'] == a['id']
    assert re.search(r'^\[\d\d:\d\d\] Ananya Rao: ', doc['body'], re.M)  # every quote carries its timestamp
    ex = httpx.get(f'{api}/extractions', params={'document_id': doc_id}).json()
    assert all(x['status'] == 'pending' for x in ex)  # candidates only, never auto-committed

    assert httpx.get(f'{api}/audio/{a["id"]}/file', headers=H('priya')).content[:4] == b'RIFF'
    d = httpx.delete(f'{api}/audio/{a["id"]}/file', headers=H('priya'))
    assert d.status_code == 200 and d.json()['audio_available'] is False
    assert httpx.get(f'{api}/audio/{a["id"]}/file', headers=H('priya')).status_code == 404
    again = httpx.get(f'{api}/audio/by-document/{doc_id}', headers=H('priya')).json()
    assert again['segments'][0]['speaker'] == 'Ananya Rao'  # the reviewed transcript stays
    assert 'file_access_removed' in {x['action'] for x in audit_actions(api, start)}


def test_answer_translation_keeps_citation_ids(clean_p2):
    api = clean_p2
    resp = {'answer': 'x', 'sentences': [
        {'text': 'Ananya Rao reduced customer log retention to 180 days on 2025-06-18.', 'source_ids': ['DEC-007']},
        {'text': 'The limit then was 180 days.', 'source_ids': ['RET-2.1@v2', 'CHECK:DEC-007:RET-2.1@v2']}]}
    aid = sql('INSERT INTO answers (question, as_of, response) VALUES ($1, $2, $3::jsonb) RETURNING id::text AS id',
              'q', __import__('datetime').date(2025, 6, 30), json.dumps(resp))[0]['id']
    r = httpx.post(f'{api}/i18n/translate-answer', headers=H('priya'), json={'answer_id': aid, 'lang': 'hi'}, timeout=300)
    assert r.status_code == 200, r.text
    out = r.json()
    assert [s['source_ids'] for s in out['sentences']] == [s['source_ids'] for s in resp['sentences']]
    assert all(re.search('[\u0900-\u097F]', s['text']) for s in out['sentences'])  # Devanagari
    assert '2025-06-18' in out['sentences'][0]['text'] and out['latency_ms'] > 0
    assert httpx.post(f'{api}/i18n/translate-answer', headers=H('priya'),
                      json={'answer_id': aid, 'lang': 'fr'}).status_code == 422
