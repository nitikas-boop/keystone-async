"""Proves the 16k model sees a >4k-token prompt in full, and shows the default 4096 context truncating it.

A secret code is placed at the very START of a ~10k-token prompt and the model is asked to repeat it.
Ollama truncates an over-long prompt from the front, so a default-context model loses the code and reports a
prompt_eval_count at or below 4096 (2050 measured on Ollama 0.33.3); the 16k model keeps it. Standard library only.

    python scripts/check_context.py                      # host Ollama at http://localhost:11434
    OLLAMA_URL=http://host.docker.internal:11434 python scripts/check_context.py
    python scripts/check_context.py --model qwen2.5-7b-16k --baseline qwen2.5:7b --lines 450

Exit code 0 only if the 16k model evaluated more than 4096 prompt tokens and returned the code.
"""
import argparse
import json
import os
import sys
import urllib.request

CODE = 'KESTREL-4711'
DEFAULT_CTX = 4096


def prompt(lines: int) -> str:
    head = f'Remember this: the secret code is {CODE}.\n\n'
    filler = ''.join(f'Ledger note {i:04d}: routine reconciliation entry, nothing of interest here, carry on reading.\n'
                     for i in range(lines))
    return head + filler + '\nWhat is the secret code stated at the very start of this message? Reply with the code only.'


def ask(url: str, model: str, text: str) -> dict:
    body = json.dumps({'model': model, 'stream': False, 'options': {'temperature': 0},
                       'messages': [{'role': 'user', 'content': text}]}).encode()
    req = urllib.request.Request(f'{url}/api/chat', data=body, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=900) as r:
        out = json.loads(r.read())
    return {'prompt_tokens': out.get('prompt_eval_count'), 'answer': out['message']['content'].strip()}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', default='qwen2.5-7b-16k')
    ap.add_argument('--baseline', default='qwen2.5:7b', help="default-context model to compare with; '' to skip")
    ap.add_argument('--lines', type=int, default=450, help='filler lines (~22 tokens each)')
    ap.add_argument('--url', default=os.environ.get('OLLAMA_URL', 'http://localhost:11434'))
    a = ap.parse_args()
    text = prompt(a.lines)
    print(f'prompt: {len(text)} chars, code {CODE} at the start\n')
    ok = False
    for model in [m for m in (a.baseline, a.model) if m]:
        r = ask(a.url, model, text)
        seen = CODE in r['answer']
        truncated = r['prompt_tokens'] is not None and r['prompt_tokens'] <= DEFAULT_CTX and not seen
        print(f"{model:>18}: prompt_eval_count={r['prompt_tokens']}  code returned={seen}  "
              f"{'TRUNCATED' if truncated else 'full prompt'}  answer={r['answer'][:60]!r}")
        if model == a.model:
            ok = seen and (r['prompt_tokens'] or 0) > DEFAULT_CTX
    print('\nPASS: nothing truncated in', a.model if ok else '')
    if not ok:
        print(f'FAIL: {a.model} did not see the whole prompt. Did scripts/create_models.sh run?', file=sys.stderr)
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
