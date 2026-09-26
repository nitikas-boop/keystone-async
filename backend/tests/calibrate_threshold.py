"""Calibrate RELEVANCE_MIN and run the §8 demo queries against a live backend.
Against the restored demo graph:  python tests/calibrate_threshold.py http://localhost:8000
Against throwaway docs (test instance, no dataset needed):  python tests/calibrate_threshold.py --throwaway

Prints each question's best cosine score, a suggested threshold (midpoint of the gap between the weakest
on-topic and strongest off-topic score), and the full answer + citations for every on-topic query."""
import subprocess
import sys
import time

import httpx

# (question, as_of or None for today). On-topic = §8 demo steps 1-4; off-topic must be refused.
ON_TOPIC = [('Show the history of Project Atlas.', None),
            ('Why did we move off AWS in May 2025?', '2025-06-01'),
            ('Was the ₹4 lakh VendorCo contract approved correctly in March 2025?', None),
            ('Was keeping customer logs for 180 days compliant in Q2 2025?', '2025-06-30')]
OFF_TOPIC = [('Why did we choose MongoDB?', None), ('Who approved the Kubernetes migration?', None),
             ('Why did we hire a new designer?', None)]
THROWAWAY_ON = [('Was keeping customer logs for 180 days compliant in 2025?', '2025-06-30'),
                ('Why did we reduce log retention?', '2025-06-30')]


def ask(base, q, as_of):
    body = {'question': q} | ({'as_of': as_of} if as_of else {})
    return httpx.post(f'{base}/ask', json=body, headers={'X-User': 'nitika'}, timeout=600).json()


def run(base, on_topic):
    best = {}
    for label, qs in (('ON ', on_topic), ('OFF', OFF_TOPIC)):
        for q, as_of in qs:
            r = ask(base, q, as_of)
            top = r['retrieval']['top']
            best[(label, q)] = top[0]['score'] if top else 0.0
            print(f"\n[{label}] {q}  (as_of {r['as_of']}, threshold {r['retrieval']['threshold']})")
            print('   top scores: ' + ', '.join(f"{t['score']} {t['keys']}" for t in top[:4]))
            print(f"   {'REFUSED' if r['refused'] else 'ANSWERED'}: {r['answer']}")
            if r['citations']:
                print('   citations: ' + ', '.join(c['id'] for c in r['citations']))
            for c in r.get('compliance', []):
                print(f"   check {c['decision_id']}: {c['result']} when decided "
                      f"{[k['source_id'] for k in c['checks']]}, {c['current_result']} as of {c['as_of']} "
                      f"{[k['source_id'] for k in c['current']]}")
            if r['warnings']:
                print('   warnings: ' + ', '.join(w['fact_id'] for w in r['warnings']))
    lo_on = min(v for (label, _), v in best.items() if label == 'ON ')
    hi_off = max(v for (label, _), v in best.items() if label == 'OFF')
    print(f'\nweakest on-topic best score {lo_on}, strongest off-topic best score {hi_off}')
    if lo_on > hi_off:
        print(f'suggested RELEVANCE_MIN = {round((lo_on + hi_off) / 2, 3)}')
    else:
        print('NO CLEAN GAP: a single cosine threshold cannot separate these; do not just pick a number')


if __name__ == '__main__':
    if sys.argv[1:] != ['--throwaway']:
        run(sys.argv[1], ON_TOPIC)
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
        run('http://localhost:8001', THROWAWAY_ON)
    finally:
        proc.terminate()
        wipe()
