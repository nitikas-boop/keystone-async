"""Print /ask retrieval scores for on-topic vs off-topic questions, to set RELEVANCE_MIN.
Against the demo graph (after restore):  python tests/calibrate_threshold.py http://localhost:8000
Against throwaway docs (test instance):   python tests/calibrate_threshold.py --throwaway"""
import subprocess
import sys
import time

import httpx

QUESTIONS = ['Was keeping customer logs for 180 days compliant in 2025?', 'Why did we reduce log retention?',
             'Who decided the retention period?', 'What is our customer log retention policy?',
             'Why did we choose MongoDB?', 'What is the capital of France?', 'Who approved the Kubernetes migration?',
             'Why did we hire a new designer?']


def run(base):
    for q in QUESTIONS:
        r = httpx.post(f'{base}/ask', json={'question': q, 'as_of': '2025-06-30'},
                       headers={'X-User': 'nitika'}, timeout=600).json()
        top = r['retrieval']['top'][:3]
        print(f"{'REFUSED ' if r['refused'] else 'answered'} {q!r}: " + ', '.join(f"{t['score']} {t['keys']}" for t in top))


if __name__ == '__main__':
    if sys.argv[1:] != ['--throwaway']:
        run(sys.argv[1])
        sys.exit()
    sys.path.insert(0, '.')
    from tests.conftest import TEST_ENV, wipe
    from tests.test_pipeline import DECISION, POLICY
    wipe()
    proc = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'app.main:app', '--port', '8001'], env=TEST_ENV)
    try:
        time.sleep(8)
        for name, text in [('v1', POLICY.format(v='v1', day='2024-01-15', n=365)),
                           ('v2', POLICY.format(v='v2', day='2025-01-06', n=180)), ('d', DECISION)]:
            httpx.post('http://localhost:8001/documents', files={'file': (name + '.md', text.encode())},
                       headers={'X-User': 'nitika'}, timeout=600).raise_for_status()
        run('http://localhost:8001')
    finally:
        proc.terminate()
        wipe()
