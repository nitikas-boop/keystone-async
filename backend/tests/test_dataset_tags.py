"""Project and visibility tags on the Nimbus Ledger vault: front-matter and ground truth agree, ingestion builds
Project nodes + ABOUT edges from them, and restricted items are hidden by the read views by default.
The live test uploads the real policies and decisions (no meeting notes, so no LLM extraction) into the test backend."""
import json
from pathlib import Path

import httpx
import pytest

from app import ingest
from conftest import wipe

VAULT = Path('/vault')
GROUND_TRUTH = Path(__file__).resolve().parents[2] / 'data' / 'ground-truth.json'  # repo checkout, if mounted
H = {'X-User': 'nitika'}
PROJECTS = {'Project Atlas': ['DEC-003', 'DEC-006', 'DEC-010'], 'Data Governance': ['DEC-002', 'DEC-007'],
            'Procurement': ['DEC-004', 'DEC-009'], 'Internal Ops': ['DEC-001', 'DEC-005', 'DEC-008']}
RESTRICTED = {'DEC-008', 'MTG-2025-08-12'}


def front_matter(p: Path) -> dict:
    return ingest.parse(p.read_text(encoding='utf-8').replace('\r\n', '\n'))[0]


def test_vault_front_matter_tags():
    decisions = {fm['decision_id']: fm for fm in map(front_matter, sorted((VAULT / 'decisions').glob('*.md')))}
    assert len(decisions) == 10
    assert {d: fm.get('project') for d, fm in decisions.items()} == \
        {d: name for name, ids in PROJECTS.items() for d in ids}
    for did, fm in decisions.items():
        assert fm.get('visibility') == ('restricted' if did in RESTRICTED else 'org'), did
    notes = {fm['doc_id']: fm for fm in map(front_matter, (VAULT / 'meeting-notes').glob('*.md'))}
    assert {d for d, fm in notes.items() if fm.get('visibility') == 'restricted'} == {'MTG-2025-08-12'}


@pytest.mark.skipif(not GROUND_TRUTH.exists(), reason='data/ground-truth.json is not mounted in this container')
def test_ground_truth_matches():
    gt = json.loads(GROUND_TRUTH.read_text(encoding='utf-8'))
    assert {k: v['decisions'] for k, v in gt['projects'].items()} == PROJECTS
    assert {d['id']: d['project'] for d in gt['decisions']} == {d: n for n, ids in PROJECTS.items() for d in ids}
    assert set(gt['restricted']['ids']) == RESTRICTED
    assert {d['id'] for d in gt['decisions'] if d.get('visibility') == 'restricted'} == {'DEC-008'}


@pytest.fixture(scope='module')
def nimbus(api):
    """Upload the real policies and decisions in chronological order (§6.3), as seed.py would."""
    wipe()
    docs = []
    for sub, order in (('policies', 0), ('decisions', 2)):
        for p in (VAULT / sub).glob('*.md'):
            fm = front_matter(p)
            docs.append((ingest.ref_date(fm), order, p))
    for _, _, p in sorted(docs):
        r = httpx.post(f'{api}/documents', files={'file': (p.relative_to(VAULT).as_posix(), p.read_bytes())},
                       headers=H, timeout=600)
        assert r.status_code == 201, r.text
    yield api
    wipe()


def ids(api, project, headers=None, **params):
    r = httpx.get(f'{api}/projects/{project}/timeline', params=params, headers=headers, timeout=60)
    assert r.status_code == 200, r.text
    return [d['id'] for d in r.json()['decisions']]


def test_project_timelines(nimbus):
    assert ids(nimbus, 'prj-atlas') == ['DEC-003', 'DEC-006', 'DEC-010']
    assert ids(nimbus, 'prj-data-governance') == ['DEC-002', 'DEC-007']
    assert ids(nimbus, 'prj-procurement') == ['DEC-004', 'DEC-009']
    atlas = httpx.get(f'{nimbus}/projects/prj-atlas/timeline').json()
    assert atlas['name'] == 'Project Atlas'
    assert [d['owner']['id'] for d in atlas['decisions']] == ['p-vikram', 'p-vikram', 'p-divya']
    assert atlas['decisions'][1]['supersedes'] == ['DEC-003']


def test_restricted_hidden_by_default(nimbus):
    """The server decides (B): a member never sees DEC-008, and include_restricted opens nothing; the owner does."""
    member, owner = {'X-User': 'priya'}, {'X-User': 'nitika'}
    assert ids(nimbus, 'prj-internal-ops', headers=member) == ['DEC-001', 'DEC-005']
    assert ids(nimbus, 'prj-internal-ops', headers=member, include_restricted='true') == ['DEC-001', 'DEC-005']
    assert ids(nimbus, 'prj-internal-ops', headers=owner) == ['DEC-001', 'DEC-005', 'DEC-008']

    for h, seen in ((member, False), (owner, True)):
        g = httpx.get(f'{nimbus}/graph/view', params={'as_of': '2026-01-01', 'include_restricted': 'true'},
                      headers=h).json()
        assert ('DEC-008' in {n['id'] for n in g['nodes']}) is seen
        assert any('DEC-008' in (e['source'], e['target']) for e in g['edges']) is seen
        events = ' '.join(x['event'] for x in httpx.get(f'{nimbus}/timeline', headers=h).json())
        assert ('DEC-008' in events) is seen

    assert httpx.get(f'{nimbus}/nodes/DEC-008/source', headers=member).status_code == 404
    s = httpx.get(f'{nimbus}/nodes/DEC-008/source', headers=owner).json()
    assert s['document']['visibility'] == 'restricted' and s['provenance']['visibility'] == 'restricted'
    assert httpx.get(f'{nimbus}/documents/DEC-007', headers=member).json()['visibility'] == 'org'
