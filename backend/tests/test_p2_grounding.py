"""The /ask grounding gate (app/grounding.py): a question naming something no visible record mentions is refused
before retrieval, and a name known only from restricted records gives a non-reader the very same refusal."""
import httpx
import pytest

from app import config, db, graph, grounding
from conftest import TEST_GROUP, wipe
from p2util import TEST_DB, H, post_doc

SECRET = '''---
doc_type: decision
decision_id: T-DEC-G1
title: Adopt Zephyrine for key storage
decided_on: 2025-02-01
owner: p-tzed
visibility: restricted
status: active
effect: ongoing
fields: {}
relied_on: []
---
Zephyrine holds the signing keys.
'''


def test_salient_terms():
    assert grounding.salient_terms('Why did we choose MongoDB?') == ['MongoDB']
    assert grounding.salient_terms('Was keeping customer logs for 180 days compliant in Q2 2025?') == []
    assert grounding.salient_terms('Why did we move off AWS in May 2025?') == ['AWS']
    assert grounding.salient_terms('Was the Rs 4 lakh VendorCo contract approved in March 2025?') == ['VendorCo']
    assert grounding.content_words('why did we move off aws in may 2025?') == ['move', 'aws']


@pytest.fixture
def secret(api):
    wipe()
    post_doc(api, 'T-DEC-G1.md', SECRET)
    yield api
    wipe()


async def test_restricted_only_name_is_unknown_to_non_readers(secret, monkeypatch):
    monkeypatch.setattr(config, 'GROUP_ID', TEST_GROUP)
    await db.connect(TEST_DB)
    graph.make()
    try:
        assert await grounding.unknown_terms(['Zephyrine', 'Kubernetes'], reader=True) == ['Kubernetes']
        assert await grounding.unknown_terms(['Zephyrine', 'Kubernetes'], reader=False) == ['Zephyrine', 'Kubernetes']
        # lower case: the local model proposes the name, the records decide
        assert await grounding.unrecorded('why did we pick kubernetes', reader=True) == ['kubernetes']
        assert await grounding.unrecorded('why did we adopt zephyrine?', reader=True) == []
        assert await grounding.unrecorded('why did we adopt zephyrine?', reader=False) == ['zephyrine']
    finally:
        await db.pool.close()
        await graph.g.close()
        db.pool, graph.g = None, None


def test_unknown_name_refused_the_same_way_whether_hidden_or_absent(secret):
    ask = lambda q: httpx.post(f'{secret}/ask', json={'question': q, 'as_of': '2025-06-01'}, headers=H('priya'),
                               timeout=600).json()
    hidden, absent = ask('Why did we adopt Zephyrine?'), ask('Why did we adopt Kubernetes?')
    lower_hidden, lower_absent = ask('why did we adopt zephyrine?'), ask('why did we adopt kubernetes?')
    assert lower_hidden['retrieval'] == lower_absent['retrieval']
    for r in (hidden, absent, lower_hidden, lower_absent):
        assert r['refused'] and r['answer'] == 'I have no recorded decision about that' and r['citations'] == []
    assert hidden['retrieval'] == absent['retrieval']  # nothing hints that one of them exists
