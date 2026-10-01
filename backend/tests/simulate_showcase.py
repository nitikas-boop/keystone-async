"""On-site simulation for data/showcase: ingest every policy version and plain document into the isolated test
backend (keystone_test database, keystone-test graph; the demo data is never touched), ask each question in
questions.json and record the real answer. Not a pytest file: it calls the local model ~30 times.

    docker compose cp data/showcase backend:/tmp/showcase
    docker compose exec -e PYTHONPATH=/app backend python tests/simulate_showcase.py /tmp/showcase
    docker compose cp backend:/tmp/showcase/expected-answers.json data/showcase/
--new-org: sign up a brand-new organisation (POST /auth/register, session cookie, its own graph partition) and run
everything as its CEO instead of the demo admin; writes expected-answers-new-org.json.
Exit 1 if any answer misses its expectation."""
import json
import secrets
import subprocess
import sys
import time
from pathlib import Path

import httpx

from conftest import TEST_ENV, wipe
from app.prompts import ANSWER_REFUSAL_SENTENCE

API = 'http://localhost:8001'
H = {'X-User': 'nitika'}  # an executive: may upload policy versions


def judge(q: dict, r: dict) -> list[str]:
    """What is wrong with the answer, if anything."""
    if q['expect'] == 'refuse':
        return [] if r['refused'] else ['expected a refusal']
    if r['refused']:
        return ['refused']
    cited = {c['id'] for c in r['citations']}
    wrong = [] if cited & set(q['cite']) or not q['cite'] else [f"cites {sorted(cited)}, expected one of {q['cite']}"]
    return wrong + [f'does not mention "{m}"' for m in q['mention'] if m.lower() not in r['answer'].lower()]


def main(root: Path, new_org: bool) -> int:
    server = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'app.main:app', '--port', '8001'], env=TEST_ENV)
    try:
        for _ in range(60):
            try:
                if httpx.get(f'{API}/health', timeout=2).status_code == 200:
                    break
            except httpx.HTTPError:
                time.sleep(1)
        wipe()
        client, org = httpx.Client(base_url=API, headers=H, timeout=600), None
        if new_org:  # the cookie set by sign-up is the only identity: no X-User header
            client = httpx.Client(base_url=API, timeout=600)
            tag = secrets.token_hex(3)
            r = client.post('/auth/register', json={'org_name': f'Corpus Test {tag}', 'employee_id': f'ct-{tag}',
                                                    'password': 'corpus-test-pass', 'display_name': 'Corpus CEO'})
            r.raise_for_status()
            org = r.json().get('org_id') or client.get('/auth/me').json().get('org_id')
            print('signed up', org, r.json().get('designation'), flush=True)
        # Oldest first, as an organisation would have adopted them (and as seed.py orders the vault).
        docs = sorted((root / 'policies').glob('*.md'),
                      key=lambda p: next(l for l in p.read_text(encoding='utf-8').splitlines() if l.startswith('effective_from')))
        for p in docs:
            r = client.post('/documents', files={'file': (p.name, p.read_bytes())})
            if r.is_error:
                print('upload failed', p.name, r.status_code, r.text, flush=True)
            r.raise_for_status()
            print('ingested', p.name, r.json()['document_id'], flush=True)

        spec = json.loads((root / 'questions.json').read_text(encoding='utf-8'))
        for d in spec.get('documents', []):  # no front-matter: dated and titled by the uploader, as in the UI
            p = root / d['file']
            r = client.post('/documents', files={'file': (p.name, p.read_bytes())},
                            data={'doc_date': d['doc_date'], 'title': d['title']})
            if r.is_error:
                print('upload failed', p.name, r.status_code, r.text, flush=True)
            r.raise_for_status()
            print('ingested', p.name, r.json()['document_id'], f"{r.json().get('pending_review', 0)} facts to review",
                  flush=True)
        qs = spec['questions']
        out = []
        for q in qs:
            r = client.post('/ask', json={'question': q['q'], 'as_of': q['as_of']})
            r.raise_for_status()
            r = r.json()
            problems = judge(q, r)
            out.append({**q, 'pass': not problems, 'problems': problems, 'refused': r['refused'],
                        'answer': r['answer'], 'cited': [c['id'] for c in r['citations']]})
            print(q['id'], 'PASS' if not problems else f'FAIL {problems}', '|', r['answer'][:160], flush=True)
        passed = sum(x['pass'] for x in out)
        name = 'expected-answers-new-org.json' if new_org else 'expected-answers.json'
        (root / name).write_text(json.dumps(
            {'_about': 'Real answers from Keystone (qwen2.5-7b-16k) for questions.json, ingested into an empty '
                       + (f'newly signed-up organisation ({org}) as its CEO' if new_org else 'workspace')
                       + ' in the order of effective_from. Refusal sentence: ' + ANSWER_REFUSAL_SENTENCE,
             'passed': f'{passed}/{len(out)}', 'answers': out}, indent=1, ensure_ascii=False), encoding='utf-8')
        print(f'{passed}/{len(out)} pass')
        return 0 if passed == len(out) else 1
    finally:
        server.terminate()
        server.wait(10)


if __name__ == '__main__':
    sys.exit(main(Path(sys.argv[1]), '--new-org' in sys.argv))
