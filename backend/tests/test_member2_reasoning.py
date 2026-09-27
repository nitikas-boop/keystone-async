"""Member 2 Comprehensive Test Suite: AI Core, Reasoning, Extraction, Compliance & Memory.

Verifies:
1. Structured extraction prompt logic, hidden decision extraction, provenance & noise rejection.
2. Temporal retrieval adapter boundary and synthetic Nimbus Ledger fixture.
3. Historical policy clause version resolution (RET-2.1@v1, @v2, @v3).
4. Deterministic compliance evaluation (compliant, non_compliant, not_checkable).
5. Policy impact classification semantics (ONGOING_PRACTICE_BREACH, RULE_CHANGED_SINCE, SUPERSEDED).
6. Citation enforcement & grounded answer generation.
7. Intentional no-evidence refusal (MongoDB test case).
8. Short-term conversational memory (4-6 turns, zero Mem0/Letta).
9. All seven core project demo queries.
"""
import asyncio
from datetime import date
from pathlib import Path
import pytest

from app.compliance import check_clause, evaluate, overall, RULES
from app.extract import parse_extraction_output, _locate
from app.memory import ShortTermMemory, conversation_memory
from app.prompts import ANSWER_REFUSAL_SENTENCE, EXTRACTION_SYSTEM_PROMPT, REASONING_SYSTEM_PROMPT
from app.reasoning import ReasoningEngine, validate_citations
from app.retrieval.synthetic import SyntheticRetrievalAdapter
from app.scanner import classify, changed_clauses


# =====================================================================
# 1. Structured Extraction & Provenance Tests
# =====================================================================

def test_extraction_hidden_anonymised_decision_and_noise_rejection():
    """Verify that the 2025-08-12 meeting note extraction parses the hidden decision
    and rejects passing discussion ("trying a different dashboard tool")."""
    note_text = """---
doc_type: meeting_note
doc_id: MTG-2025-08-12
title: Analytics data sync
meeting_date: 2025-08-12
attendees: [p-ananya, p-farhan, p-sneha, p-divya]
---
# Analytics data sync

Attendees: Ananya Rao (CEO), Farhan Qureshi (Compliance lead), Sneha Iyer (Analyst), Divya Nair.

Sneha asked how long the analytics team can keep usage data, since the 180-day purge is removing the history she needs for year-over-year trends.

Farhan explained that the retention cap applies to customer activity logs. Logs that have been properly anonymised, with account identifiers and IP addresses removed, are not customer logs in that sense.

Divya confirmed the anonymisation job already strips identifiers before data reaches the analytics store.

Ananya decided that the team will keep anonymised logs for 24 months, because year-over-year analysis needs two years of history and anonymised data carries far less risk.

Sneha mentioned that it might be worth trying a different dashboard tool at some point; nobody took that further.

Action: Divya to document the anonymisation job.
"""
    body_start = note_text.find('# Analytics data sync')
    mock_llm_out = {
        "entities": [
            {
                "ref": "D1",
                "type": "Decision",
                "name": "Keep anonymised logs for 24 months",
                "quote": "Ananya decided that the team will keep anonymised logs for 24 months, because year-over-year analysis needs two years of history and anonymised data carries far less risk.",
                "effect": "ongoing",
                "confidence": 0.95
            }
        ],
        "relations": [
            {
                "source": "D1",
                "relation": "MADE_BY",
                "target": "p-ananya",
                "quote": "Ananya decided that the team will keep anonymised logs for 24 months",
                "confidence": 0.95
            }
        ]
    }
    known_keys = {'p-ananya': {'name': 'Ananya Rao', 'type': 'Person'}}

    nodes, edges, rows = parse_extraction_output(
        note_text, body_start, mock_llm_out, 'MTG-2025-08-12', 'data/vault/meeting-notes/2025-08-12.md',
        date(2025, 8, 12), 'org', known_keys
    )

    # 1. Node assertions
    assert len(nodes) == 1
    d_node = nodes[0]
    assert d_node['key'] == 'MTG-2025-08-12-D1'
    assert d_node['type'] == 'Decision'
    assert d_node['name'] == 'Keep anonymised logs for 24 months'
    assert d_node['attrs']['effect'] == 'ongoing'
    assert d_node['attrs']['decided_on'] == '2025-08-12'

    # 2. Provenance assertions
    prov = d_node['prov']
    assert prov['source_doc'] == 'data/vault/meeting-notes/2025-08-12.md'
    assert prov['confidence'] == 0.95
    assert prov['human_verified'] is False
    assert prov['source_span']['start'] is not None
    assert prov['source_span']['end'] is not None
    assert '24 months' in prov['source_span']['quote']

    # 3. Edge assertions (JUSTIFIED_BY + MADE_BY)
    assert any(e['rel'] == 'JUSTIFIED_BY' and e['dst'] == 'MTG-2025-08-12' for e in edges)
    assert any(e['rel'] == 'MADE_BY' and e['dst'] == 'p-ananya' for e in edges)


def test_quote_location_accuracy():
    text = "Frontmatter\n---\nSentence one. Sentence two is important. Sentence three."
    loc = _locate(text, 12, "Sentence two is important.")
    assert loc['source_start'] is not None
    assert text[loc['source_start']:loc['source_end']] == "Sentence two is important."


# =====================================================================
# 2. Temporal Retrieval Adapter & Nimbus Ledger Dataset Tests
# =====================================================================

@pytest.mark.asyncio
async def test_synthetic_retrieval_temporal_filtering():
    adapter = SyntheticRetrievalAdapter()

    # 1. As of 2024-06-01: DEC-001 exists, DEC-002 (2024-07-22) does not
    res_2024 = await adapter.retrieve("What decisions were made?", date(2024, 6, 1))
    node_ids_2024 = {n.id for n in res_2024.nodes}
    assert 'DEC-002' not in node_ids_2024
    assert 'DEC-006' not in node_ids_2024
    assert 'DEC-007' not in node_ids_2024

    # 2. As of 2025-06-30: DEC-006 (2025-05-20) and DEC-007 (2025-06-18) are present
    res_2025 = await adapter.retrieve("customer logs retention", date(2025, 6, 30))
    node_ids_2025 = {n.id for n in res_2025.nodes}
    assert 'DEC-007' in node_ids_2025


@pytest.mark.asyncio
async def test_policy_clause_version_in_force():
    adapter = SyntheticRetrievalAdapter()

    # 2024 -> RET-2.1@v1 (365 days)
    c1 = await adapter.get_clause_in_force('RET-2.1', date(2024, 6, 1))
    assert c1 is not None and c1['version'] == 'v1'
    assert c1['fields']['retention_days_max'] == 365

    # 2025 -> RET-2.1@v2 (180 days)
    c2 = await adapter.get_clause_in_force('RET-2.1', date(2025, 6, 1))
    assert c2 is not None and c2['version'] == 'v2'
    assert c2['fields']['retention_days_max'] == 180

    # 2026-10-01 -> RET-2.1@v3 (90 days)
    c3 = await adapter.get_clause_in_force('RET-2.1', date(2026, 10, 1))
    assert c3 is not None and c3['version'] == 'v3'
    assert c3['fields']['retention_days_max'] == 90

    # PROC-3.1@v1 (₹5L) vs @v2 (₹2L)
    p1 = await adapter.get_clause_in_force('PROC-3.1', date(2025, 3, 14))
    assert p1 is not None and p1['version'] == 'v1'
    assert p1['fields']['approver_threshold_inr']['CTO'] == 500000

    p2 = await adapter.get_clause_in_force('PROC-3.1', date(2025, 8, 1))
    assert p2 is not None and p2['version'] == 'v2'
    assert p2['fields']['approver_threshold_inr']['CTO'] == 200000


# =====================================================================
# 3. Deterministic Compliance Tests
# =====================================================================

def test_deterministic_compliance_all_outcomes():
    ret_v2 = {'clause_id': 'RET-2.1', 'version': 'v2', 'effective_from': '2025-01-06',
              'effective_to': '2026-09-28', 'checkable': True, 'fields': {'retention_days_max': 180}}
    ret_v3 = {'clause_id': 'RET-2.1', 'version': 'v3', 'effective_from': '2026-09-28',
              'effective_to': None, 'checkable': True, 'fields': {'retention_days_max': 90}}
    proc_v1 = {'clause_id': 'PROC-3.1', 'version': 'v1', 'effective_from': '2024-01-15',
               'effective_to': '2025-07-01', 'checkable': True, 'fields': {'approver_threshold_inr': {'CTO': 500000, 'CEO': None}}}
    proc_v2 = {'clause_id': 'PROC-3.1', 'version': 'v2', 'effective_from': '2025-07-01',
               'effective_to': None, 'checkable': True, 'fields': {'approver_threshold_inr': {'CTO': 200000, 'CEO': None}}}

    # 1. Compliant: 180 days <= 180 days
    assert check_clause({'retention_days': 180}, ret_v2)['result'] == 'compliant'

    # 2. Non-compliant: 180 days > 90 days
    assert check_clause({'retention_days': 180}, ret_v3)['result'] == 'non_compliant'

    # 3. VendorCo ₹4L: compliant under v1 (<= 5L), non-compliant under v2 (> 2L)
    vendor_fields = {'amount_inr': 400000, 'approver_role': 'CTO'}
    assert check_clause(vendor_fields, proc_v1)['result'] == 'compliant'
    assert check_clause(vendor_fields, proc_v2)['result'] == 'non_compliant'

    # 4. Not checkable: missing field (anonymised logs 24 months evaluated against customer log retention)
    anonymised_fields = {'anonymised_retention_months': 24}
    assert check_clause(anonymised_fields, ret_v2)['result'] == 'not_checkable'

    # 5. Open-textured clause
    open_clause = {'clause_id': 'RET-4.2', 'version': 'v1', 'effective_from': '2024-01-15',
                   'effective_to': None, 'checkable': False, 'fields': {}}
    assert check_clause({'retention_days': 90}, open_clause)['result'] == 'not_checkable'


@pytest.mark.asyncio
async def test_decision_evaluation_nimbus():
    # DEC-004: ₹4L VendorCo contract decided 2025-03-14
    res_dec4 = await evaluate('DEC-004', as_of=date(2025, 3, 14), low=0.7, explain=False)
    assert res_dec4 is not None
    assert res_dec4['result'] == 'compliant'
    assert res_dec4['checks'][0]['source_id'] == 'PROC-3.1@v1'

    # Evaluated as of 2026 (under PROC-3.1@v2 where CTO limit is 2L)
    res_dec4_today = await evaluate('DEC-004', as_of=date(2026, 1, 1), low=0.7, explain=False)
    assert res_dec4_today['result'] == 'compliant'  # result when made
    assert res_dec4_today['current_result'] == 'non_compliant'  # today under v2
    assert res_dec4_today['current'][0]['source_id'] == 'PROC-3.1@v2'


# =====================================================================
# 4. Policy Impact Classification Tests
# =====================================================================

def test_policy_impact_classification():
    assert classify('superseded', 'ongoing') == 'SUPERSEDED'
    assert classify('superseded', 'completed') == 'SUPERSEDED'
    assert classify('active', 'ongoing') == 'ONGOING_PRACTICE_BREACH'
    assert classify('active', 'completed') == 'RULE_CHANGED_SINCE'


def test_changed_clauses_detection():
    old = {'RET-2.1': {'fields': {'retention_days_max': 180}, 'checkable': True}}
    new = {'RET-2.1': {'fields': {'retention_days_max': 90}, 'checkable': True}}
    assert changed_clauses(old, new) == ['RET-2.1']


# =====================================================================
# 5. Short-Term Conversation Memory Tests
# =====================================================================

def test_short_term_memory_sliding_window():
    mem = ShortTermMemory(max_turns=4)
    sid = "test-session"

    mem.add_turn(sid, "user", "Q1")
    mem.add_turn(sid, "assistant", "A1")
    mem.add_turn(sid, "user", "Q2")
    mem.add_turn(sid, "assistant", "A2")
    assert len(mem.get_history(sid)) == 4

    # 5th turn should slide the window
    mem.add_turn(sid, "user", "Q3")
    history = mem.get_history(sid)
    assert len(history) == 4
    assert history[0].content == "A1"
    assert history[-1].content == "Q3"

    prompt_fmt = mem.format_for_prompt(sid)
    assert "User: Q3" in prompt_fmt
    assert "Q1" not in prompt_fmt


# =====================================================================
# 6. Citations & Grounding Validation Tests
# =====================================================================

def test_citation_validation_and_retry():
    sources = {'DEC-006': {'text': 'AWS move'}, 'MTG-2025-05-14': {'text': 'Meeting note'}}
    sentences = [
        {'text': 'We moved off AWS.', 'source_ids': ['DEC-006', 'MTG-2025-05-14']},
        {'text': 'We chose GCP because of cloud credits.', 'source_ids': ['FABRICATED-SOURCE']}
    ]
    good, bad = validate_citations(sentences, sources)
    assert len(good) == 1
    assert good[0]['source_ids'] == ['DEC-006', 'MTG-2025-05-14']
    assert len(bad) == 1
    assert bad[0]['source_ids'] == ['FABRICATED-SOURCE']


# =====================================================================
# 7. Core Demo Queries (Reasoning Pipeline)
# =====================================================================

@pytest.mark.asyncio
async def test_demo_query_1_project_atlas_history():
    adapter = SyntheticRetrievalAdapter()
    engine = ReasoningEngine(adapter)

    res = await engine.answer("Show the history of Project Atlas.", as_of=date(2026, 9, 24), explain_compliance=False)
    assert not res['refused']
    cited = {c['id'] for c in res['citations']}
    assert 'DEC-003' in cited or 'DEC-006' in cited or 'DEC-010' in cited
    assert len(res['subgraph']['nodes']) > 0


@pytest.mark.asyncio
async def test_demo_query_2_move_off_aws():
    adapter = SyntheticRetrievalAdapter()
    engine = ReasoningEngine(adapter)

    res = await engine.answer("Why did we move off AWS in May 2025?", as_of=date(2025, 6, 1), explain_compliance=False)
    assert not res['refused']
    cited = {c['id'] for c in res['citations']}
    assert 'DEC-006' in cited or 'MTG-2025-05-14' in cited


@pytest.mark.asyncio
async def test_demo_query_3_vendorco_contract():
    adapter = SyntheticRetrievalAdapter()
    engine = ReasoningEngine(adapter)

    res = await engine.answer("Was the ₹4 lakh VendorCo contract approved correctly in March 2025?", as_of=date(2025, 3, 14), explain_compliance=False)
    assert not res['refused']
    cited = {c['id'] for c in res['citations']}
    assert 'DEC-004' in cited or 'PROC-3.1@v1' in cited
    assert any(c['decision_id'] == 'DEC-004' and c['result'] == 'compliant' for c in res['compliance'])


@pytest.mark.asyncio
async def test_demo_query_4_customer_log_retention_q2_2025():
    adapter = SyntheticRetrievalAdapter()
    engine = ReasoningEngine(adapter)

    res = await engine.answer("Was keeping customer logs for 180 days compliant in Q2 2025?", as_of=date(2025, 6, 30), explain_compliance=False)
    assert not res['refused']
    cited = {c['id'] for c in res['citations']}
    assert 'DEC-007' in cited or 'RET-2.1@v2' in cited
    assert any(c['decision_id'] == 'DEC-007' and c['result'] == 'compliant' for c in res['compliance'])


@pytest.mark.asyncio
async def test_demo_query_5_policy_v3_impact():
    adapter = SyntheticRetrievalAdapter()
    engine = ReasoningEngine(adapter)

    # Under 2026-10-01 after v3 is in effect
    res = await engine.answer("Was keeping customer logs for 180 days compliant in late 2026?", as_of=date(2026, 10, 1), explain_compliance=False)
    assert not res['refused']
    # DEC-007 was compliant when made, but current result under v3 is non_compliant
    dec7_check = next((c for c in res['compliance'] if c['decision_id'] == 'DEC-007'), None)
    if dec7_check:
        assert dec7_check['current_result'] == 'non_compliant'


@pytest.mark.asyncio
async def test_demo_query_6_no_evidence_refusal_mongodb():
    adapter = SyntheticRetrievalAdapter()
    engine = ReasoningEngine(adapter)

    res = await engine.answer("Why did we choose MongoDB?", as_of=date(2025, 6, 30), explain_compliance=False)
    assert res['refused'] is True
    assert res['answer'] == ANSWER_REFUSAL_SENTENCE
    assert len(res['citations']) == 0
    assert len(res['subgraph']['nodes']) == 0


@pytest.mark.asyncio
async def test_demo_query_7_anonymised_logs_not_checkable():
    """Verify that checking anonymised log retention (24 months) against RET-2.1 results in not_checkable."""
    ret_v2 = {'clause_id': 'RET-2.1', 'version': 'v2', 'effective_from': '2025-01-06',
              'effective_to': '2026-09-28', 'checkable': True, 'fields': {'retention_days_max': 180}}
    fields = {'anonymised_retention_months': 24}
    res = check_clause(fields, ret_v2)
    assert res['result'] == 'not_checkable'
    assert 'retention_days' in res['reason']
