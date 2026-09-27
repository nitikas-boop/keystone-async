import pytest
from datetime import date
from fastapi.testclient import TestClient

from app.main import app
from app.graph import _clean_attrs
from app.retrieval import get_retrieval_adapter, GraphitiRetrievalAdapter, SyntheticRetrievalAdapter


def test_source_span_flattening_in_graph_attrs():
    """Verify nested source_span is flattened into primitive Neo4j properties."""
    nested = {
        'source_doc': 'vault/meeting-notes/2025-05-14.md',
        'confidence': 0.95,
        'source_span': {'start': 120, 'end': 185, 'quote': 'Decided to move off AWS'}
    }
    cleaned = _clean_attrs(nested)
    assert 'source_span' not in cleaned
    assert cleaned['source_start'] == 120
    assert cleaned['source_end'] == 185
    assert cleaned['source_quote'] == 'Decided to move off AWS'
    assert cleaned['confidence'] == 0.95
    assert cleaned['source_doc'] == 'vault/meeting-notes/2025-05-14.md'


def test_retrieval_adapter_default_graphiti(monkeypatch):
    """Production default must be GraphitiRetrievalAdapter; Synthetic is only when explicitly configured."""
    monkeypatch.delenv('KEYSTONE_RETRIEVAL_ADAPTER', raising=False)
    adapter = get_retrieval_adapter()
    assert isinstance(adapter, GraphitiRetrievalAdapter)

    monkeypatch.setenv('KEYSTONE_RETRIEVAL_ADAPTER', 'synthetic')
    adapter_synth = get_retrieval_adapter()
    assert isinstance(adapter_synth, SyntheticRetrievalAdapter)


@pytest.mark.asyncio
async def test_ask_endpoint_grounded_question(monkeypatch):
    """Test /ask endpoint end-to-end with a grounded query using synthetic adapter in test."""
    monkeypatch.setenv('KEYSTONE_RETRIEVAL_ADAPTER', 'synthetic')
    client = TestClient(app)
    
    response = client.post(
        "/ask",
        json={"question": "Why did we move off AWS and who decided it?", "as_of": "2025-06-01", "session_id": "sess-test-1"},
        headers={"X-User": "priya"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["refused"] is False
    assert len(data["sentences"]) > 0
    assert len(data["citations"]) > 0
    citation_ids = [c["id"] for c in data["citations"]]
    assert any("DEC-006" in cid or "MTG-2025-05-14" in cid for cid in citation_ids)


@pytest.mark.asyncio
async def test_ask_endpoint_unsupported_refusal(monkeypatch):
    """Test /ask endpoint with an unsupported question returns canonical refusal."""
    monkeypatch.setenv('KEYSTONE_RETRIEVAL_ADAPTER', 'synthetic')
    client = TestClient(app)
    
    response = client.post(
        "/ask",
        json={"question": "What database version of MongoDB was chosen in 2024?", "as_of": "2025-06-01"},
        headers={"X-User": "nitika"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["refused"] is True
    assert "no recorded decision" in data["answer"].lower()
    assert data["citations"] == []


@pytest.mark.asyncio
async def test_ask_endpoint_compliance_returned(monkeypatch):
    """Test /ask endpoint returns deterministic compliance checks for decision queries."""
    monkeypatch.setenv('KEYSTONE_RETRIEVAL_ADAPTER', 'synthetic')
    client = TestClient(app)
    
    response = client.post(
        "/ask",
        json={"question": "Was the VendorCo contract compliant?", "as_of": "2025-04-01"},
        headers={"X-User": "farhan"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["refused"] is False
    assert "compliance" in data
    assert len(data["compliance"]) > 0
    comp = data["compliance"][0]
    assert comp["decision_id"] == "DEC-004"
    assert comp["result"] == "compliant"


@pytest.mark.asyncio
async def test_ask_endpoint_session_id_passthrough(monkeypatch):
    """Test /ask endpoint accepts and preserves session_id across multi-turn queries."""
    monkeypatch.setenv('KEYSTONE_RETRIEVAL_ADAPTER', 'synthetic')
    client = TestClient(app)
    
    sess_id = "sess-multiturn-123"
    # Turn 1
    r1 = client.post(
        "/ask",
        json={"question": "Why did we move off AWS?", "as_of": "2025-06-01", "session_id": sess_id},
        headers={"X-User": "priya"}
    )
    assert r1.status_code == 200
    
    # Turn 2 in same session
    r2 = client.post(
        "/ask",
        json={"question": "Who approved that decision?", "as_of": "2025-06-01", "session_id": sess_id},
        headers={"X-User": "priya"}
    )
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["refused"] is False


def test_ask_endpoint_empty_question_validation():
    """Test /ask rejects empty or whitespace-only questions with HTTP 422."""
    client = TestClient(app)
    response = client.post(
        "/ask",
        json={"question": "   ", "as_of": "2025-06-01"},
        headers={"X-User": "priya"}
    )
    assert response.status_code == 422


def test_ask_endpoint_unauthorized_user():
    """Test /ask rejects missing or invalid X-User headers with HTTP 401."""
    client = TestClient(app)
    r1 = client.post("/ask", json={"question": "test?"})
    assert r1.status_code == 401

    r2 = client.post("/ask", json={"question": "test?"}, headers={"X-User": "unknown_intruder"})
    assert r2.status_code == 401
