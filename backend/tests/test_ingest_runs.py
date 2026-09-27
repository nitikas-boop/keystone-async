"""Ingestion run tracking: uploads write a run row, failures are recorded (not swallowed), and the seed is resumable
after an interruption. Uses the isolated test backend and a throwaway vault with no meeting notes (no LLM)."""
import signal
import subprocess
import sys
import tempfile
from pathlib import Path

import httpx
import pytest

from conftest import TEST_ENV, wipe

H = {'X-User': 'priya'}
PEOPLE = 'people:\n  - {id: T-p-ana, name: Ana Test, role: CEO, joined: 2024-01-01}\n'
POLICY = '''---
doc_type: policy_version
policy_id: T-POL-RUN
version: v1
title: Test run policy
effective_from: 2024-01-15
clauses:
  - clause_id: T-RUN-1
    text: "Customer logs are kept for at most 365 days."
    fields: {retention_days_max: 365}
    checkable: true
---
Test run policy.
'''
DECISION = '''---
doc_type: decision
decision_id: {did}
title: {title}
decided_on: 2024-0{m}-10
owner: T-p-ana
project: Project Run
relied_on: [T-RUN-1]
status: active
effect: ongoing
fields: {{retention_days: 100}}
---
Body of {did}.
'''
BAD_CLAUSE = DECISION.format(did='T-RUN-BAD', title='Relies on a missing clause', m=5).replace('[T-RUN-1]', '[T-NOPE-9]')


def latest_run(api) -> dict:
    return httpx.get(f'{api}/ingest/runs', params={'limit': 1}).json()[0]


def seed(vault: Path, *args) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, '-m', 'app.seed', *args], env={**TEST_ENV, 'VAULT_DIR': str(vault)},
                          capture_output=True, text=True, timeout=600)


@pytest.fixture
def vault(clean):
    with tempfile.TemporaryDirectory() as d:
        root = Path(d)
        (root / 'policies').mkdir()
        (root / 'decisions').mkdir()
        (root / 'people.yaml').write_text(PEOPLE)
        (root / 'policies' / 'T-POL-RUN-v1.md').write_text(POLICY)
        for i in range(1, 6):
            (root / 'decisions' / f'T-RUN-{i}.md').write_text(DECISION.format(did=f'T-RUN-{i}', title=f'Decision {i}', m=i + 2))
        (root / 'decisions' / 'T-RUN-BAD.md').write_text(BAD_CLAUSE)
        (root / 'decisions' / 'no-front-matter.md').write_text('Just prose, no front-matter.\n')
        yield root


def test_upload_writes_a_run_row(api, clean):
    r = httpx.post(f'{api}/documents', files={'file': ('t-pol.md', POLICY.encode())}, headers=H, timeout=600)
    assert r.status_code == 201, r.text
    run = latest_run(api)
    assert (run['kind'], run['status'], run['error']) == ('upload', 'succeeded', None)
    assert run['finished_at'] and run['stats']['ok'] == 1
    assert run['stats']['documents']['t-pol.md']['document_id'] == 'T-POL-RUN@v1'
    assert httpx.get(f"{api}/ingest/runs/{run['id']}").json() == run

    r = httpx.post(f'{api}/documents', files={'file': ('broken.md', b'no front-matter')}, headers=H, timeout=60)
    assert r.status_code == 422  # still raised to the caller
    run = latest_run(api)
    assert (run['kind'], run['status']) == ('upload', 'failed')
    assert 'front-matter' in run['error'] and run['stats']['documents']['broken.md']['status'] == 'failed'
    assert httpx.get(f'{api}/ingest/runs/999999999').status_code == 404


def test_seed_records_failures_and_resumes(api, vault):
    # 1. interrupted run: kill the seed right after its first document; progress is already on the run row
    proc = subprocess.Popen([sys.executable, '-m', 'app.seed'], env={**TEST_ENV, 'VAULT_DIR': str(vault)},
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    for line in proc.stdout:
        if 'T-POL-RUN@v1' in line:
            proc.send_signal(signal.SIGKILL)
            break
    proc.wait(30)
    killed = latest_run(api)
    assert killed['kind'] == 'seed' and killed['status'] == 'running' and killed['finished_at'] is None
    assert killed['stats']['documents']['policies/T-POL-RUN-v1.md']['status'] == 'ok'

    # 2. re-run: the finished policy is skipped, the rest is ingested, the two bad files are recorded as failed
    out = seed(vault)
    assert out.returncode == 1, out.stdout + out.stderr
    run = latest_run(api)
    docs = run['stats']['documents']
    assert run['status'] == 'partial' and run['finished_at']
    assert docs['policies/T-POL-RUN-v1.md']['status'] == 'skipped'
    assert all(docs[f'decisions/T-RUN-{i}.md']['status'] in ('ok', 'skipped') for i in range(1, 6))
    assert docs['decisions/T-RUN-BAD.md']['status'] == 'failed' and 'T-NOPE-9' in docs['decisions/T-RUN-BAD.md']['error']
    assert docs['decisions/no-front-matter.md']['status'] == 'failed'
    assert run['stats']['failed'] == 2 and 'T-RUN-BAD.md' in run['error']
    t = httpx.get(f'{api}/projects/prj-run/timeline').json()
    assert [d['id'] for d in t['decisions']] == [f'T-RUN-{i}' for i in range(1, 6)]

    # 3. nothing changed: everything that succeeded is skipped
    seed(vault)
    run = latest_run(api)
    assert (run['stats']['skipped'], run['stats']['ok'], run['stats']['failed']) == (6, 0, 2)

    # 4. an edited document is re-ingested, the rest skipped; --force re-ingests everything
    p = vault / 'decisions' / 'T-RUN-3.md'
    p.write_text(p.read_text().replace('Decision 3', 'Decision 3 (edited)'))
    seed(vault)
    run = latest_run(api)
    assert run['stats']['documents']['decisions/T-RUN-3.md']['status'] == 'ok'
    assert (run['stats']['ok'], run['stats']['skipped']) == (1, 5)
    seed(vault, '--force')
    assert latest_run(api)['stats']['ok'] == 6


def test_seed_skip_needs_the_stored_document(api, vault):
    """If the database was reset, run history alone must not cause a skip."""
    seed(vault)
    wipe()
    seed(vault)
    assert latest_run(api)['stats']['ok'] == 6
