"""Evaluation against data/ground-truth.json, run against a live backend (stdlib only, runs on the host):

    python backend/tests/eval.py [http://localhost:8000]

1. Extraction precision/recall: Decision nodes the model extracted from meeting notes vs `extraction_expected`
   (matched by word overlap). Human-rejected extractions still count: this scores the model, not the reviewer.
2. Answer correctness: every `demo_queries` item through POST /ask, checked for must_cite, must_mention, order
   and the exact refusal. Exit code 1 if any answer check fails, so it can gate a prompt change.
Asking writes answers + audit rows: run it on a scratch DB or restore nimbus-seed afterwards.
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')  # questions contain ₹; the Windows console default (cp1252) crashes
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8000'
GT = json.loads((Path(__file__).resolve().parents[2] / 'data' / 'ground-truth.json').read_text(encoding='utf-8'))


def call(path, body=None):
    req = urllib.request.Request(URL + path, data=body and json.dumps(body).encode(),
                                 headers={'X-User': 'nitika', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.load(r)


words = lambda s: set(re.findall(r'[a-z0-9]+', s.lower()))


def same(a: str, b: str) -> bool:
    wa, wb = words(a), words(b)
    return len(wa & wb) / max(1, min(len(wa), len(wb))) >= 0.6


def extraction():
    got = [e for e in call('/extractions') if e['kind'] == 'node' and e['type'] == 'Decision'
           and e['document_id'].startswith('MTG-')]
    exp = [x for x in GT['extraction_expected'] if 'decision' in x]
    hit = [x for x in exp if any(g['document_id'] == x['document'] and same(g['text'], x['decision']) for g in got)]
    good = [g for g in got if any(g['document_id'] == x['document'] and same(g['text'], x['decision']) for x in exp)]
    p = len(good) / len(got) if got else 0.0
    r = len(hit) / len(exp)
    print(f'EXTRACTION  precision {len(good)}/{len(got)} = {p:.2f}   recall {len(hit)}/{len(exp)} = {r:.2f}')
    for x in exp:
        print(f"  {'found ' if x in hit else 'MISSED'} {x['document']}: {x['decision']}")
    for g in got:
        if g not in good:
            print(f"  EXTRA  {g['document_id']}: {g['text']}")


def answers() -> bool:
    ok_all = True
    for q in GT['demo_queries']:
        res = call('/ask', {'question': q['q'], 'as_of': q.get('as_of')})
        text = res.get('answer') or ' '.join(s['text'] for s in res.get('sentences', []))
        cited = [c['id'] for c in res.get('citations', [])]
        fails = []
        if q.get('refused'):
            if not res.get('refused') or res.get('answer') != q['answer']:
                fails.append(f'expected refusal, got: {text[:80]}')
        fails += [f'missing citation {c}' for c in q.get('must_cite', []) if c not in cited]
        fails += [f'missing mention "{m}"' for m in q.get('must_mention', []) if m.lower() not in text.lower()]
        if 'order' in q:
            pos = [text.find(k) for k in q['order']]
            if -1 in pos or pos != sorted(pos):
                fails.append(f"order {q['order']} not kept in answer text")
        ok_all &= not fails
        print(f"{'PASS' if not fails else 'FAIL'}  step {q['step']}: {q['q']}")
        for f in fails:
            print(f'      {f}')
    return ok_all


if __name__ == '__main__':
    extraction()
    sys.exit(0 if answers() else 1)
