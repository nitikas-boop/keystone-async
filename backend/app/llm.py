import json
import logging

import httpx

from . import config

log = logging.getLogger('keystone.llm')


async def chat_json(system: str, user: str, schema: dict, model: str = config.ANSWER_MODEL,
                    base_url: str = config.OLLAMA_BASE_URL, timeout: float = 180) -> dict:
    t = httpx.Timeout(timeout, connect=4.0)
    async with httpx.AsyncClient(timeout=t) as h:
        r = await h.post(f'{base_url}/api/chat', json={
            'model': model, 'stream': False, 'think': False, 'format': schema,
            'options': {'temperature': 0},
            'messages': [{'role': 'system', 'content': system}, {'role': 'user', 'content': user}]})
        r.raise_for_status()
        return json.loads(r.json()['message']['content'])


async def explain(prompt: str, fallback: str) -> str:
    """Human-readable wording only; the outcome is already decided deterministically."""
    try:
        out = await chat_json(
            'You rewrite a compliance result as 1-2 plain sentences. Never change the result, numbers, IDs, or '
            'whether a limit was raised or lowered. '
            'Keep every ID in square brackets exactly as given.',
            prompt, {'type': 'object', 'properties': {'text': {'type': 'string'}}, 'required': ['text']}, timeout=180)
        return out['text'].strip() or fallback
    except Exception as e:
        # The deterministic statement is shown verbatim instead; say so where operators will see it.
        log.warning("llm.explain failed (%s: %s): showing the deterministic statement unreworded.", type(e).__name__, e)
        return fallback


LANGUAGES = {'hi': 'Hindi', 'kn': 'Kannada'}


async def translate(sentences: list[str], lang: str) -> list[str]:
    """Answer translation (I), local model only. Citation IDs never enter the prompt, so they cannot be altered;
    the caller re-attaches them per sentence. A reply with the wrong sentence count or a bracketed [ID] is rejected.
    ponytail: the answer model translates; swap in IndicTrans2 here if its quality/latency benchmark wins."""
    from .prompts_p2 import TRANSLATE_PROMPT
    if lang not in LANGUAGES:
        raise ValueError(f'language must be one of {sorted(LANGUAGES)}')
    if not sentences:
        return []
    out = await chat_json(TRANSLATE_PROMPT.format(language=LANGUAGES[lang]), json.dumps(sentences, ensure_ascii=False),
                          {'type': 'object', 'required': ['sentences'],
                           'properties': {'sentences': {'type': 'array', 'items': {'type': 'string'}}}}, timeout=180)
    got = [s.strip() for s in out.get('sentences', [])]
    if len(got) != len(sentences) or any('[' in s for s in got):
        raise ValueError('translation did not return one clean sentence per input')
    return got
