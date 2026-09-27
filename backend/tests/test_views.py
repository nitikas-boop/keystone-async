"""Read views (app/views.py) against the isolated test backend: mockData shapes, stable layout, as-of activity,
policy-impact conflict edges, project history and citation sources. Throwaway T- documents only."""
import json
import subprocess
import sys

import httpx
import pytest

from conftest import TEST_ENV, wipe

H = {'X-User': 'priya'}
POLICY = '''---
doc_type: policy_version
policy_id: T-POL-RET
version: {v}
title: Test retention policy
effective_from: {day}
clauses:
  - clause_id: T-RET-2.1
    title: Customer log retention
    text: "Customer activity logs shall be retained for no longer than {n} days."
    fields: {{retention_days_max: {n}}}
    checkable: true
---
Test retention policy {v}. T-RET-2.1 caps customer log retention at {n} days.
'''
DECISION = '''---
doc_type: decision
decision_id: {did}
title: {title}
decided_on: {day}
owner: {owner}
project: Project Tango
relied_on: [T-RET-2.1]
status: {status}
effect: ongoing
fields: {{retention_days: {days}}}
{extra}reasons: >-
  {reason} A second sentence that the one-line reason must drop.
---
{did} body text for the citation passage.
'''
PEOPLE = [{'id': 'T-p-ana', 'name': 'Ana Test', 'role': 'CEO', 'joined': '2024-01-01'},
          {'id': 'T-p-vik', 'name': 'Vik Test', 'role': 'CTO', 'joined': '2024-01-01', 'left': '2025-08-31'},
          {'id': 'T-p-kar', 'name': 'Kar Test', 'role': 'CTO', 'joined': '2025-09-15'}]


def post(api, name, text):
    r = httpx.post(f'{api}/documents', files={'file': (name, text.encode())}, headers=H, timeout=600)
    assert r.status_code == 201, r.text
    return r.json()


def seed_people(people):
    """ingest_people is seed-only (no endpoint); run it in the test graph partition."""
    code = ('import asyncio, json, sys\nfrom app import graph, ingest\n'
            'async def main():\n    graph.make()\n    await ingest.ingest_people(json.loads(sys.argv[1]))\n'
            '    await graph.g.close()\nasyncio.run(main())')
    subprocess.run([sys.executable, '-c', code, json.dumps(people)], env=TEST_ENV, check=True)


def get(api, path, **params):
    r = httpx.get(f'{api}{path}', params=params, timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope='module')
def world(api):
    wipe()
    seed_people(PEOPLE)
    post(api, 'pol-v1.md', POLICY.format(v='v1', day='2024-01-15', n=365))
    post(api, 'pol-v2.md', POLICY.format(v='v2', day='2025-01-06', n=180))
    post(api, 'dec-a.md', DECISION.format(did='T-DEC-A', title='Keep logs 300 days', day='2024-07-22', owner='T-p-ana',
                                          status='superseded', days=300, extra='', reason='Fraud cases surface late.'))
    post(api, 'dec-b.md', DECISION.format(did='T-DEC-B', title='Keep logs 180 days', day='2025-06-18', owner='T-p-vik',
                                          status='active', days=180, extra='supersedes: T-DEC-A\n',
                                          reason='The v2 cap is 180 days.'))
    post(api, 'pol-v3.md', POLICY.format(v='v3', day='2026-09-28', n=90))  # scanner flags T-DEC-B
    yield api
    wipe()


def by_id(items):
    return {x['id']: x for x in items}


def test_graph_view_shape_layout_and_activity(world):
    g = get(world, '/graph/view', as_of='2025-07-01')
    assert g['asOf'] == '2025-07-01'
    nodes = by_id(g['nodes'])
    assert {'T-DEC-A', 'T-DEC-B', 'T-RET-2.1@v1', 'T-RET-2.1@v2', 'T-RET-2.1@v3', 'T-p-ana', 'Project Tango'} <= set(nodes)
    for n in g['nodes']:
        assert {'id', 'label', 'type', 'color', 'glow', 'x', 'y', 'isActive', 'isStale', 'validFrom', 'validTo',
                'provenance'} <= n.keys()
        assert 0 <= n['x'] <= 800 and 0 <= n['y'] <= 520
    assert nodes['T-DEC-B']['type'] == 'decision' and nodes['T-DEC-B']['date'] == '2025-06-18'
    assert nodes['T-DEC-B']['label'] == 'T-DEC-B\n(Keep logs 180 days)'
    assert nodes['T-RET-2.1@v2']['label'] == 'T-RET-2.1 @ v2\n(Max 180d)'
    assert nodes['T-RET-2.1@v1']['isActive'] is False       # closed by v2
    assert nodes['T-RET-2.1@v2']['isActive'] is True
    assert nodes['T-RET-2.1@v3']['isActive'] is False       # future version shown greyed out
    assert nodes['T-DEC-B']['isStale'] is False
    assert not any(e['relation'] == 'CONTRADICTED_BY' for e in g['edges'])
    for e in g['edges']:
        assert {'id', 'source', 'target', 'relation', 'validFrom', 'validTo', 'isActive', 'isConflict'} <= e.keys()
    made = next(e for e in g['edges'] if e['source'] == 'T-DEC-B' and e['relation'] == 'MADE_BY')
    assert made['validFrom'] == '2025-06-18' and made['isActive'] is True

    # before the decisions existed they are hidden; layout does not move with the date
    early = by_id(get(world, '/graph/view', as_of='2024-02-01')['nodes'])
    assert 'T-DEC-A' not in early and 'T-DEC-B' not in early
    late = get(world, '/graph/view', as_of='2026-10-01')
    for k, n in by_id(late['nodes']).items():
        if k in nodes:
            assert (n['x'], n['y']) == (nodes[k]['x'], nodes[k]['y']), k

    # after v3 takes effect: stale decision + conflict edge from the scanner's flag
    ln = by_id(late['nodes'])
    assert ln['T-DEC-B']['isStale'] is True and ln['T-RET-2.1@v3']['isActive'] is True
    [c] = [e for e in late['edges'] if e['relation'] == 'CONTRADICTED_BY']
    assert (c['source'], c['target'], c['isConflict'], c['validFrom']) == ('T-DEC-B', 'T-RET-2.1@v3', True, '2026-09-28')
    assert ln['T-p-vik']['label'] == 'Vik Test\n(Ex-CTO)'


def test_existing_graph_endpoint_unchanged(world):
    g = get(world, '/graph', as_of='2025-07-01')
    assert set(g) == {'as_of', 'nodes', 'edges'}
    n = next(n for n in g['nodes'] if n['id'] == 'T-DEC-B')
    assert {'id', 'type', 'label', 'valid_from', 'valid_to', 'attributes', 'provenance'} <= n.keys()
    assert n['type'] == 'Decision' and 'x' not in n


def test_team(world):
    team = by_id(get(world, '/team'))
    assert set(team) == {'T-p-ana', 'T-p-vik', 'T-p-kar'}  # owner stubs without joined are not team members
    assert team['T-p-ana'] == {'id': 'T-p-ana', 'name': 'Ana Test', 'role': 'CEO', 'joined': '2024-01-01',
                               'status': 'Active'}
    assert team['T-p-vik'] == {'id': 'T-p-vik', 'name': 'Vik Test', 'role': 'Former CTO', 'joined': '2024-01-01',
                               'left': '2025-08-31', 'status': 'Departed'}


def test_timeline(world):
    pts = get(world, '/timeline')
    assert all(set(p) == {'date', 'label', 'event'} for p in pts)
    assert [p['date'] for p in pts] == sorted(p['date'] for p in pts)
    events = {(p['date'], p['event']) for p in pts}
    assert ('2024-01-15', 'T-RET-2.1@v1 (Max 365d) active') in events
    assert ('2026-09-28', 'T-RET-2.1@v3 (Max 90d) active') in events
    assert ('2025-06-18', 'T-DEC-B (Keep logs 180 days)') in events
    assert ('2025-09-15', 'Kar Test joins as CTO') in events
    assert ('2025-08-31', 'Vik Test departs (CTO)') in events
    assert next(p for p in pts if p['date'] == '2024-07-22')['label'] == 'Jul 2024'


def test_project_timeline(world):
    t = get(world, '/projects/prj-tango/timeline')
    assert (t['projectId'], t['name']) == ('prj-tango', 'Project Tango')
    assert [d['id'] for d in t['decisions']] == ['T-DEC-A', 'T-DEC-B']
    b = t['decisions'][1]
    assert b['decidedOn'] == '2025-06-18' and b['owner'] == {'id': 'T-p-vik', 'name': 'Vik Test'}
    assert b['reason'] == 'The v2 cap is 180 days.' and b['supersedes'] == ['T-DEC-A']
    assert get(world, '/projects/Project Tango/timeline')['decisions'] == t['decisions']
    assert httpx.get(f'{world}/projects/prj-nope/timeline').status_code == 404


def test_node_source(world):
    s = get(world, '/nodes/T-DEC-B/source')
    assert s['document']['id'] == 'T-DEC-B' and s['document']['docType'] == 'decision'
    assert s['provenance']['humanVerified'] is True and s['quote'] == 'decided_on: 2025-06-18'
    assert s['quote'] in s['excerpt'] and 'body text for the citation passage' in s['passage']['text']

    c = get(world, '/nodes/T-RET-2.1@v2/source')
    assert c['type'] == 'clause' and c['document']['id'] == 'T-POL-RET@v2'
    assert 'T-RET-2.1' in c['passage']['text'] and c['quote'].endswith('clause_id: T-RET-2.1')

    p = get(world, '/nodes/T-p-ana/source')
    assert p['document'] is None and p['provenance']['sourceDoc'] == 'people.yaml'
    assert httpx.get(f'{world}/nodes/NOPE-1/source').status_code == 404
