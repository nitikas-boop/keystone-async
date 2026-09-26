"""§6.3 smoke test, end to end against the running stack: two documents a year apart,
an as-of query between them must see only the earlier one. Run: docker compose exec backend pytest -q"""
import httpx

H = {'X-User': 'nitika'}


def doc(did: str, day: str) -> bytes:
    return (f'---\ndoc_type: decision\ndecision_id: {did}\ntitle: Smoke decision {did}\n'
            f'decided_on: {day}\nowner: SMOKE-person\nproject: SMOKE-project\nstatus: active\n'
            f'effect: completed\n---\nWe chose this for smoke-test reasons.\n').encode()


def keys(base, as_of: str) -> tuple[set, set]:
    g = httpx.get(f'{base}/graph', params={'as_of': as_of}, timeout=30).raise_for_status().json()
    return ({n['id'] for n in g['nodes'] if n['id'].startswith('SMOKE')},
            {(e['source'], e['relation'], e['target']) for e in g['edges'] if e['source'].startswith('SMOKE')})


def test_as_of_sees_only_earlier_document(api, clean):
    for did, day in (('SMOKE-A', '2024-03-01'), ('SMOKE-B', '2025-03-01')):
        r = httpx.post(f'{api}/documents', files={'file': (f'{did}.md', doc(did, day))}, headers=H, timeout=120)
        assert r.status_code == 201, r.text
        assert r.json()['ref_time'] == day

    nodes, edges = keys(api, '2024-09-01')
    assert 'SMOKE-A' in nodes and 'SMOKE-B' not in nodes
    assert ('SMOKE-A', 'MADE_BY', 'SMOKE-person') in edges
    assert not any(src == 'SMOKE-B' for src, _, _ in edges)

    nodes, _ = keys(api, '2023-12-31')
    assert not {'SMOKE-A', 'SMOKE-B'} & nodes

    nodes, edges = keys(api, '2025-06-01')
    assert {'SMOKE-A', 'SMOKE-B'} <= nodes
    assert ('SMOKE-B', 'MADE_BY', 'SMOKE-person') in edges


def test_valid_time_is_front_matter_not_ingestion_time(api, clean):
    httpx.post(f'{api}/documents', files={'file': ('SMOKE-A.md', doc('SMOKE-A', '2024-03-01'))}, headers=H, timeout=120)
    g = httpx.get(f'{api}/graph', params={'as_of': '2024-03-01'}, timeout=30).json()
    edge = next(e for e in g['edges'] if e['source'] == 'SMOKE-A' and e['relation'] == 'MADE_BY')
    assert edge['valid_from'].startswith('2024-03-01')
    assert not edge['created_at'].startswith('2024-03-01')  # ingestion time is separate: bi-temporal
    assert edge['provenance']['extracted_by'] == 'human' and edge['provenance']['confidence'] == 1.0
    assert edge['provenance']['source_span']['quote'] == 'owner: SMOKE-person'
