"""I. One extra answer language. The stored /ask answer is translated sentence by sentence; source_ids are copied
from the original, never from the model."""
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import db, llm
from ..contracts import current_user

router = APIRouter(tags=['p2: languages'])


class TranslateIn(BaseModel):
    answer_id: str
    lang: str = 'hi'


@router.post('/i18n/translate-answer')
async def translate_answer(body: TranslateIn, user: dict = Depends(current_user)):
    row = await db.pool.fetchrow('SELECT response FROM answers WHERE id::text=$1', body.answer_id)
    if row is None:
        raise HTTPException(404, 'no such answer')
    res = row['response']
    sentences = [s['text'] for s in res.get('sentences') or []] or [res['answer']]
    started = time.monotonic()
    try:
        texts = await llm.translate(sentences, body.lang)
    except ValueError as e:
        raise HTTPException(422, str(e))
    ms = round((time.monotonic() - started) * 1000)
    ids = [s['source_ids'] for s in res.get('sentences') or []] or [[]]
    return {'answer_id': body.answer_id, 'lang': body.lang, 'latency_ms': ms,
            'sentences': [{'text': t, 'source_ids': i} for t, i in zip(texts, ids)]}
