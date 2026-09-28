from app.reasoning import drop_restricted
from app.retrieval.base import EdgeRecord, NodeRecord, RetrievalResult, SourceRecord


def test_restricted_nodes_edges_and_sources_are_dropped():
    r = RetrievalResult(
        as_of='2026-09-28', question='q', seed_keys=['DEC-008'],
        nodes=[NodeRecord('DEC-008', 'Decision', 'reviews', provenance={'visibility': 'restricted'}),
               NodeRecord('p-farhan', 'Person', 'Farhan', provenance={'visibility': 'org'})],
        edges=[EdgeRecord('e1', 'DEC-008', 'p-farhan', 'MADE_BY', 'f')],
        sources={'DEC-008': SourceRecord('DEC-008', 't'), 'p-farhan': SourceRecord('p-farhan', 't')},
        ranked_scores=[{'keys': ['DEC-008'], 'score': 0.9}])
    out = drop_restricted(r)
    assert [n.id for n in out.nodes] == ['p-farhan']
    assert out.edges == [] and list(out.sources) == ['p-farhan'] and out.ranked_scores == []
    assert out.is_empty  # only restricted seeds -> the ordinary refusal
