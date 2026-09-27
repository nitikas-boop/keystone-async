"""Local Ollama calls. JSON-schema structured output; qwen3 thinking disabled for speed."""
import json

import httpx

from . import config


async def chat_json(system: str, user: str, schema: dict, model: str = config.ANSWER_MODEL,
                    base_url: str = config.OLLAMA_BASE_URL, timeout: float = 180) -> dict:
    async with httpx.AsyncClient(timeout=timeout) as h:
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
            'You rewrite a compliance result as 1-2 plain sentences. Never change the result, numbers or IDs. '
            'Keep every ID in square brackets exactly as given.',
            prompt, {'type': 'object', 'properties': {'text': {'type': 'string'}}, 'required': ['text']}, timeout=180)
        return out['text'].strip() or fallback
    except Exception:
        return fallback
