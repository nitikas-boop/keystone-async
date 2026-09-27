# AI Handoff — Member 2: AI Core, Reasoning & Memory

**Branch:** `member2`
**Base branch:** `main` (inside `keystone-async/`)
**Date:** 2026-09-27
**Author:** Antigravity AI (Member 2 implementation)
**Repo root:** `c:\Users\heman\keystone\keystone-async\`

---

## 1. What Member 2 Is Responsible For

| Area | Scope |
|------|-------|
| Reasoning engine | Temporal question → grounded answer pipeline |
| Extraction layer | LLM-based entity/relation extraction from prose |
| Retrieval boundary | `BaseRetrievalAdapter` interface + synthetic & Graphiti implementations |
| Compliance evaluation | Deterministic per-clause checks (no LLM deciding outcomes) |
| Short-term memory | 4–6 turn sliding window per session (no Mem0/Letta) |
| Prompt engineering | Extraction + reasoning system prompts |
| LLM wiring | Ollama `chat_json` structured-output calls |
| Test suites | `test_member2_reasoning.py` (17 unit) + `test_local_inference.py` (8 E2E) |

---

## 2. Repository State

### 2.1 Git Status

```
Branch: member2  (inside keystone-async/)
Parent repo branch: main  (c:\Users\heman\keystone\)
```

**Uncommitted changes on `member2`** (`git status --short`):

| Status | File |
|--------|------|
| `M` | `backend/app/ask.py` |
| `M` | `backend/app/compliance.py` |
| `M` | `backend/app/extract.py` |
| `M` | `backend/app/graph.py` |
| `M` | `backend/tests/conftest.py` |
| `M` | `src/data/mockData.js` |
| `??` | `backend/app/memory.py` — NEW, untracked |
| `??` | `backend/app/prompts.py` — NEW, untracked |
| `??` | `backend/app/reasoning.py` — NEW, untracked |
| `??` | `backend/app/retrieval/` — NEW dir, untracked |
| `??` | `backend/tests/test_local_inference.py` — NEW, untracked |
| `??` | `backend/tests/test_member2_reasoning.py` — NEW, untracked |
| `??` | `scripts/test_local_inference.py` — scratch copy, can be deleted |

> WARNING: None of the Member 2 work has been committed yet. All new files are untracked. Run git add + git commit before any merge.

### 2.2 Commit Command

```bash
cd c:\Users\heman\keystone\keystone-async
git add backend/app/ask.py backend/app/compliance.py backend/app/extract.py `
         backend/app/graph.py backend/app/memory.py backend/app/prompts.py `
         backend/app/reasoning.py backend/app/retrieval/ `
         backend/tests/test_member2_reasoning.py `
         backend/tests/test_local_inference.py `
         backend/tests/conftest.py src/data/mockData.js
git commit -m "feat(member2): reasoning engine, retrieval adapter, compliance, memory, prompts, tests"
```

---

## 3. Files Created by Member 2 (New / Untracked)

### `backend/app/memory.py` — Short-Term Conversational Memory
- `ShortTermMemory` class: sliding window of `max_turns=6` ConversationTurn objects per session_id
- `format_for_prompt(session_id)` injects recent context into the LLM user prompt
- Module-level singleton: `conversation_memory = ShortTermMemory(max_turns=6)`
- Zero external dependencies — no Mem0, no Letta, pure Python dataclasses

### `backend/app/prompts.py` — LLM Prompt Templates
- `EXTRACTION_SYSTEM_PROMPT` — for Qwen3 14B structured extraction (entities, relations, provenance)
- `REASONING_SYSTEM_PROMPT` — for Qwen3 8B grounded answer generation with citation enforcement
- `COMPLIANCE_EXPLAIN_SYSTEM_PROMPT` — cosmetic narration only, never alters outcomes
- `ANSWER_REFUSAL_SENTENCE = "I have no recorded decision about that"` — canonical refusal string

### `backend/app/reasoning.py` — Core Reasoning Engine
Full 7-step pipeline:
1. `adapter.retrieve(question, as_of)` — point-in-time subgraph + sources
2. Deterministic `compliance.evaluate()` on every retrieved Decision node
3. Empty-retrieval guard — clean refusal (no LLM call wasted)
4. Assemble source listing + conversational history for prompt
5. `llm.chat_json(REASONING_SYSTEM_PROMPT, ...)` with JSON schema enforcement
6. `validate_citations()` — reject sentences citing nonexistent sources, single retry
7. `_fallback_grounded_answer()` — deterministic offline fallback (no exception propagation)
8. `_format_response()` — build API response + update conversation_memory + optional DB audit

Key design decisions:
- `validate_citations()` strips inline [ID] from text before assertion
- `CHECK:decision_id:clause_id` synthetic source keys let compliance context be cited
- `LOW_CONFIDENCE` threshold (env LOW_CONFIDENCE, default 0.7) drives warnings[]
- DB audit is fire-and-forget (try/except pass) so offline mode always works

### `backend/app/retrieval/` — Retrieval Adapter Package

#### `base.py` — Abstract Interface
```python
class BaseRetrievalAdapter(ABC):
    async def retrieve(question, as_of) -> RetrievalResult
    async def get_node(node_id, as_of) -> Optional[NodeRecord]
    async def get_clause_in_force(clause_id, on_date) -> Optional[dict]
```
Dataclasses: NodeRecord, EdgeRecord, SourceRecord, RetrievalResult
`RetrievalResult.is_empty` — true if seed_keys or nodes list is empty (triggers refusal)

#### `synthetic.py` — Nimbus Ledger Test Fixture (22 KB, TEMPORARY)
- Reads `data/vault/` files directly (decisions, meeting notes, policies, people)
- Full as-of temporal filtering: only nodes with decided_on <= as_of are returned
- BM25-style keyword scoring against question text
- `get_clause_in_force()` resolves policy version by effective_from/effective_to
- Covers all 10 decisions (DEC-001..DEC-010), 3 policy clause sets, 8 people
- Hidden decision: 2025-08-12 anonymised log decision (24 months)
- MARKED TEMPORARY — replace with GraphitiRetrievalAdapter when Member 1 is ready

#### `graphiti.py` — Production Graphiti Adapter (stub, needs Member 1)
- Implements BaseRetrievalAdapter against Member 1's Neo4j/Graphiti stack
- Activated by env: `KEYSTONE_RETRIEVAL_ADAPTER=graphiti`
- Currently a forwarding stub — full Cypher queries to be supplied by Member 1

#### `__init__.py` — Factory
```python
def get_retrieval_adapter(mode=None) -> BaseRetrievalAdapter:
    # reads KEYSTONE_RETRIEVAL_ADAPTER env var
    # 'synthetic' (default) | 'graphiti'
```

### `backend/tests/test_member2_reasoning.py` — Unit Test Suite (17 tests)
All deterministic, no Ollama required:
1. Hidden decision extraction + noise rejection (2025-08-12 meeting note)
2. Quote location accuracy (_locate)
3. Temporal filtering (DEC-002 absent before 2024-07-22)
4. Policy clause version resolution (RET-2.1@v1/v2/v3, PROC-3.1@v1/v2)
5. All compliance outcomes: compliant, non_compliant, not_checkable
6. Decision evaluation (DEC-004 compliant@v1, non_compliant under @v2)
7. Policy impact classification: SUPERSEDED, ONGOING_PRACTICE_BREACH, RULE_CHANGED_SINCE
8. changed_clauses() detection
9. Sliding window memory (4-turn window test)
10. Citation validation + fabricated-source rejection
11-17. All 7 core demo queries (Project Atlas, AWS move, VendorCo, 180-day retention, v3 impact, MongoDB refusal, anonymised logs)

### `backend/tests/test_local_inference.py` — Live Inference Tests (8 tests)
Requires Ollama running. All inference tests share `warm_model` session fixture:
1. test_ollama_tags_endpoint — HTTP connectivity
2. test_model_is_available — model check
3. test_raw_chat_json_structured_output — JSON schema enforcement
4. test_compliance_explain_narration — llm.explain() narration
5. test_e2e_reasoning_aws_move — full pipeline, cites DEC-006
6. test_e2e_reasoning_vendorco_compliance — DEC-004 compliant
7. test_e2e_reasoning_no_evidence_refusal — MongoDB → refused, zero hallucination
8. test_latency_benchmark — prints tok/s (informational, never fails)

---

## 4. Files Modified by Member 2

### `backend/app/ask.py`
Before: Placeholder stub.
After: Thin wrapper delegating to ReasoningEngine via get_retrieval_adapter(). Global _engine instance. RELEVANCE_MIN env var (default 0.78).

### `backend/app/compliance.py`
Before: Partial implementation missing evaluate() and overall() async paths.
After:
- RULES dict maps clause fields to (needed decision fields, comparison lambda)
- check_clause(fields, clause) -> {result, reason, decision_value, limit, ...}
- overall(checks) -> aggregate result string
- evaluate(decision_id, as_of, low, explain) -> async, checks clause versions at decision time AND current as_of, returns {result, current_result, checks[], current[], warnings[]}
- LLM narration via llm.explain() is cosmetic only — outcome is always deterministic

### `backend/app/extract.py`
Before: Basic extraction without provenance, hidden decision detection, or noise filtering.
After:
- parse_extraction_output() attaches character-level provenance spans to every node and edge
- _locate() finds exact quote position in raw source text
- Decision threshold logic: rejects discussion/suggestions that don't meet Decision criteria
- effect field (ongoing/completed) propagated per decision
- JUSTIFIED_BY edge auto-added linking every decision to its source document

### `backend/app/graph.py`
Before: Neo4j query stubs.
After: Added get_decision_fields() and get_policy_clause() used by compliance.evaluate() to fetch decision metadata and clause versions.

### `src/data/mockData.js`
Minor: date alignment fix — Cloud Vendor Switch event date corrected to match DEC-006 (2025-05-20).

---

## 5. Architecture

```
User Question + as_of date
        |
        v
  ask.py  (HTTP handler)
        |
        v
  ReasoningEngine.answer()          [reasoning.py]
        |
        |---> BaseRetrievalAdapter.retrieve()
        |       |
        |       |-- SyntheticRetrievalAdapter  <- ACTIVE (env: synthetic)
        |       |       Reads data/vault/ files directly
        |       |
        |       `-- GraphitiRetrievalAdapter   <- ready when Member 1 delivers
        |               Neo4j Cypher queries via Graphiti
        |
        |---> compliance.evaluate()              [compliance.py]
        |       Deterministic check_clause() per retrieved Decision
        |       Result: compliant / non_compliant / not_checkable
        |       LLM only narrates -- never decides
        |
        |---> conversation_memory.format_for_prompt()  [memory.py]
        |       Last 6 turns, sliding window
        |
        |---> llm.chat_json(REASONING_SYSTEM_PROMPT, ...)  [llm.py]
        |       Ollama /api/chat, model=ANSWER_MODEL, think=false, temp=0
        |       JSON schema enforced by Ollama structured output
        |
        |---> validate_citations()  [reasoning.py]
        |       Reject sentences citing nonexistent source IDs
        |       Single retry with instruction to fix citations
        |
        `---> _format_response()
                Build citations[], compliance[], subgraph{}, warnings[]
                Update conversation_memory
                Fire-and-forget DB audit (if pool available)
```

---

## 6. Environment Variables (Member 2 Relevant)

| Variable | Default | Notes |
|----------|---------|-------|
| OLLAMA_BASE_URL | http://localhost:11434 | Answer model endpoint |
| EXTRACT_OLLAMA_URL | same as above | Extraction model endpoint (can be different machine) |
| ANSWER_MODEL | qwen3:8b | For reasoning/answer generation |
| EXTRACT_MODEL | qwen3:14b | For entity/relation extraction |
| EMBED_MODEL | nomic-embed-text | Already pulled |
| KEYSTONE_RETRIEVAL_ADAPTER | synthetic | Set to graphiti to use Neo4j |
| LOW_CONFIDENCE | 0.7 | Below this -> warning in response |
| RELEVANCE_MIN | 0.78 | Minimum BM25 score threshold |

---

## 7. Current Model Situation

| Model | Status | Use |
|-------|--------|-----|
| qwen2.5:7b | Pulled (4.5 GB) | Used in local inference tests as override |
| nomic-embed-text | Pulled (261 MB) | Embeddings |
| qwen3:8b | NOT pulled | Intended ANSWER_MODEL |
| qwen3:14b | NOT pulled | Intended EXTRACT_MODEL |

To pull the intended models:
```bash
ollama pull qwen3:8b
ollama pull qwen3:14b   # optional, only needed for extraction flow
```

Once qwen3:8b is pulled, remove the AVAILABLE_MODEL override in test_local_inference.py (lines 17-19).

---

## 8. Test Results

### Unit Tests (no Ollama required)
```bash
cd c:\Users\heman\keystone\keystone-async\backend
python -m pytest tests/test_member2_reasoning.py -v
```
Result: 17/17 PASSED in 5.45s

### Live Inference Tests (Ollama required)
```bash
cd c:\Users\heman\keystone\keystone-async\backend
python -m pytest tests/test_local_inference.py -v -s --asyncio-mode=auto
```
Result: 8/8 PASSED in 40.39s (using qwen2.5:7b)

| Metric | Value |
|--------|-------|
| Cold VRAM load | 27.7s |
| Prompt ingestion | 216.7 tok/s |
| Generation speed | 37.4 tok/s |
| E2E pipeline latency (warm) | ~0.8s |

Live answer samples (verified correct):
- AWS move: "We moved off AWS to an India-hosted provider under Vikram Rao on 2025-05-20 due to data residency and cost. [DEC-006][MTG-2025-05-14]"
- MongoDB: "I have no recorded decision about that" -- zero hallucination
- VendorCo: DEC-004 cited, compliance = compliant

---

## 9. Known Issues / Bugs

| Issue | Severity | Details |
|-------|----------|---------|
| llm.explain() 60s timeout borderline | Low | On cold load it falls back to fallback string. Compliance outcome is correct regardless. Fix: raise hardcoded timeout=60 in llm.py explain() to 120. |
| graphiti.py is a stub | Medium | GraphitiRetrievalAdapter implements the interface but all methods return empty. Needs Member 1's Cypher queries. |
| conftest.py imports neo4j/asyncpg at module level | Low | Fails if not installed. Run tests from backend/ dir where requirements.txt covers them. |
| scripts/test_local_inference.py | Info | Scratch copy created by accident. Safe to delete. |
| AVAILABLE_MODEL override in test | Info | test_local_inference.py lines 17-19 hardcode qwen2.5:7b. Remove once qwen3:8b is pulled. |
| Member 2 work NOT committed | Critical | All new files are untracked. Must commit before PR/merge. |

---

## 10. Commands Reference

```bash
# Navigate
cd c:\Users\heman\keystone\keystone-async

# Check Ollama models
python -c "import urllib.request,json; [print(m['name'], m['size']//1024//1024,'MB') for m in json.loads(urllib.request.urlopen('http://localhost:11434/api/tags').read())['models']]"

# Run unit tests (no Ollama needed)
cd backend
python -m pytest tests/test_member2_reasoning.py -v

# Run live inference tests (Ollama must be running)
python -m pytest tests/test_local_inference.py -v -s --asyncio-mode=auto

# Run all Member 2 tests
python -m pytest tests/test_member2_reasoning.py tests/test_local_inference.py -v --asyncio-mode=auto

# Pull intended models
ollama pull qwen3:8b
ollama pull qwen3:14b

# Commit Member 2 work (run from keystone-async/)
git add backend/app/ask.py backend/app/compliance.py backend/app/extract.py `
         backend/app/graph.py backend/app/memory.py backend/app/prompts.py `
         backend/app/reasoning.py backend/app/retrieval/ `
         backend/tests/test_member2_reasoning.py `
         backend/tests/test_local_inference.py `
         backend/tests/conftest.py src/data/mockData.js
git commit -m "feat(member2): reasoning engine, retrieval adapter boundary, compliance, memory, prompts, tests"

# Switch to Graphiti adapter (when Member 1 is ready)
# Set in .env:  KEYSTONE_RETRIEVAL_ADAPTER=graphiti
```

---

## 11. What Should Be Done Next

### Immediate (before demo)

1. COMMIT all Member 2 work (see command above). Nothing has been committed yet.

2. Pull qwen3:8b and remove the model override in test_local_inference.py:
   ```bash
   ollama pull qwen3:8b
   ```
   Then delete lines 17-19 of backend/tests/test_local_inference.py:
   ```python
   # DELETE these lines after pulling qwen3:8b:
   AVAILABLE_MODEL = "qwen2.5:7b"
   INFERENCE_TIMEOUT = 300
   os.environ["ANSWER_MODEL"] = AVAILABLE_MODEL
   ```
   And replace AVAILABLE_MODEL with config.ANSWER_MODEL throughout that file.

3. Raise llm.explain() timeout in backend/app/llm.py line 26:
   Change timeout=60 to timeout=120.

4. Delete scratch file scripts/test_local_inference.py.

### When Member 1 Delivers Graphiti/Neo4j

5. Fill in backend/app/retrieval/graphiti.py:
   - retrieve(): Run Cypher to fetch nodes/edges valid as_of date, keyword-match question
   - get_node(): Single node fetch by ID
   - get_clause_in_force(): Fetch policy_clauses row where effective_from <= date < effective_to
   Then set KEYSTONE_RETRIEVAL_ADAPTER=graphiti in .env.

6. Verify compliance.evaluate() works end-to-end with real PostgreSQL policy_clauses table and real Neo4j decision nodes.

### When Member 3 Delivers Approval Gate / MCP

7. Wire explain_compliance=True in the /ask endpoint -- currently defaults to False in tests.

### Integration

8. Full integration test -- run backend/tests/test_pipeline.py once Docker stack (Postgres + Neo4j + Ollama) is running together.

9. Frontend wiring -- src/api.js already calls /ask. Verify session_id is passed from ChatPanel.jsx so conversational memory accumulates correctly across turns.

---

## 12. File Map (Member 2 Scope)

```
keystone-async/
|-- AI-HANDOFF.md                          <- this file
|-- backend/
|   |-- app/
|   |   |-- ask.py            M  Modified: delegates to ReasoningEngine
|   |   |-- compliance.py     M  Modified: full deterministic check pipeline
|   |   |-- extract.py        M  Modified: provenance, hidden decisions, noise filter
|   |   |-- graph.py          M  Modified: get_decision_fields(), get_policy_clause()
|   |   |-- llm.py               existing (used unchanged)
|   |   |-- config.py            existing (used unchanged)
|   |   |-- memory.py         N  NEW: ShortTermMemory, conversation_memory singleton
|   |   |-- prompts.py        N  NEW: all LLM prompt templates
|   |   |-- reasoning.py      N  NEW: ReasoningEngine, validate_citations, fallback
|   |   `-- retrieval/
|   |       |-- __init__.py   N  NEW: factory get_retrieval_adapter()
|   |       |-- base.py       N  NEW: BaseRetrievalAdapter, NodeRecord, EdgeRecord
|   |       |-- synthetic.py  N  NEW: Nimbus Ledger in-memory fixture (TEMPORARY)
|   |       `-- graphiti.py   N  NEW: Production adapter stub (needs Member 1 queries)
|   `-- tests/
|       |-- test_member2_reasoning.py  N  NEW: 17 unit tests (all pass, no Ollama)
|       `-- test_local_inference.py   N  NEW: 8 E2E live inference tests (all pass)
`-- src/
    `-- data/
        `-- mockData.js        M  Minor: date fix on Cloud Vendor Switch event

Legend: N = new file, M = modified file
```
