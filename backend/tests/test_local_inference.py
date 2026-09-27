"""Local inference integration test.

Uses the actual Ollama instance at localhost:11434 with the available model
(qwen2.5:7b, overriding the default qwen3:8b that is not pulled yet).

Run from the backend/ directory:
    python -m pytest tests/test_local_inference.py -v -s --timeout=600
"""
import os
import sys
import time
from datetime import date

import pytest

sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent))

import httpx  # noqa: E402
from app import config

# ── Model configuration locked to qwen2.5-7b-16k ───────────────────────────
TARGET_MODEL = config.ANSWER_MODEL
AVAILABLE_MODEL = config.ANSWER_MODEL
INFERENCE_TIMEOUT = 300  # seconds – covers cold VRAM load on first call


# ── Helpers ────────────────────────────────────────────────────────────────

def ollama_alive() -> bool:
    try:
        r = httpx.get(f"{config.OLLAMA_BASE_URL}/api/tags", timeout=4)
        return r.status_code == 200
    except Exception:
        return False


def model_available(name: str) -> bool:
    try:
        r = httpx.get(f"{config.OLLAMA_BASE_URL}/api/tags", timeout=4)
        models = [m["name"] for m in r.json().get("models", [])]
        return any(m == name or m.startswith(f"{name}:") or m.split(":")[0] == name for m in models)
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    not ollama_alive(),
    reason="Ollama not running on localhost:11434"
)


# ── Session-scoped warmup: fires a tiny generation so the model is loaded
# into VRAM before any real inference test runs.  All tests that need a warm
# model must declare `warm_model` as a parameter.
@pytest.fixture(scope="session")
async def warm_model():
    """Ensure locked model is loaded into VRAM before inference tests."""
    payload = {
        "model": TARGET_MODEL,
        "stream": False,
        "think": False,
        "options": {"temperature": 0},
        "format": {
            "type": "object",
            "properties": {"ok": {"type": "boolean"}},
            "required": ["ok"]
        },
        "messages": [{"role": "user", "content": "ok?"}],
    }
    t0 = time.perf_counter()
    print(f"\n  [warmup] Loading {TARGET_MODEL} into VRAM ...", flush=True)
    async with httpx.AsyncClient(timeout=INFERENCE_TIMEOUT) as client:
        r = await client.post(f"{config.OLLAMA_BASE_URL}/api/chat", json=payload)
    elapsed = time.perf_counter() - t0
    assert r.status_code == 200, f"Warmup failed: {r.text}"
    print(f"  [warmup] Model ready in {elapsed:.1f}s", flush=True)
    yield  # model stays hot in Ollama for the rest of the session


# ══════════════════════════════════════════════════════════════════════════
# 1. Raw Ollama connectivity & Model Configuration
# ══════════════════════════════════════════════════════════════════════════

def test_ollama_tags_endpoint():
    """Ollama /api/tags returns HTTP 200 and at least one model."""
    r = httpx.get(f"{config.OLLAMA_BASE_URL}/api/tags", timeout=4)
    assert r.status_code == 200
    models = [m["name"] for m in r.json().get("models", [])]
    print(f"\n  Available models: {models}")
    assert len(models) > 0, "No models pulled in Ollama"


def test_model_is_available():
    """The target locked model (qwen2.5-7b-16k) is actually pulled and configured."""
    assert config.ANSWER_MODEL == "qwen2.5-7b-16k", f"Expected ANSWER_MODEL=qwen2.5-7b-16k, got {config.ANSWER_MODEL}"
    assert config.EXTRACT_MODEL == "qwen2.5-7b-16k", f"Expected EXTRACT_MODEL=qwen2.5-7b-16k, got {config.EXTRACT_MODEL}"
    assert model_available(TARGET_MODEL), (
        f"{TARGET_MODEL} not found in Ollama. Run: ollama pull {TARGET_MODEL}"
    )


# ══════════════════════════════════════════════════════════════════════════
# 2. Raw chat_json call & think: false verification
# ══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_raw_chat_json_structured_output(warm_model):
    """chat_json must return a valid dict matching the requested schema."""
    from app import llm

    schema = {
        "type": "object",
        "required": ["result"],
        "properties": {"result": {"type": "string"}}
    }

    t0 = time.perf_counter()
    out = await llm.chat_json(
        system="Answer in JSON only.",
        user="Reply with result: 'pong'",
        schema=schema,
        model=TARGET_MODEL,
        base_url=config.OLLAMA_BASE_URL,
        timeout=INFERENCE_TIMEOUT,
    )
    elapsed = time.perf_counter() - t0

    print(f"\n  chat_json returned: {out}  ({elapsed:.1f}s)")
    assert isinstance(out, dict), f"Expected dict, got {type(out)}"
    assert "result" in out, f"Missing 'result' key: {out}"


@pytest.mark.asyncio
async def test_think_false_structured_output_clean(warm_model):
    """Verify that think: false is accepted by qwen2.5:7b and generates clean JSON without thinking tokens."""
    payload = {
        "model": TARGET_MODEL,
        "stream": False,
        "think": False,
        "options": {"temperature": 0},
        "format": {
            "type": "object",
            "required": ["status", "count"],
            "properties": {
                "status": {"type": "string"},
                "count": {"type": "integer"}
            }
        },
        "messages": [
            {"role": "system", "content": "You are a precise JSON generator. Output only valid JSON."},
            {"role": "user", "content": "Generate status: 'ok', count: 42"}
        ]
    }
    async with httpx.AsyncClient(timeout=INFERENCE_TIMEOUT) as client:
        r = await client.post(f"{config.OLLAMA_BASE_URL}/api/chat", json=payload)
    assert r.status_code == 200, f"Ollama request failed: {r.text}"
    content = r.json()["message"]["content"]
    assert "<think>" not in content, f"Unwanted thinking tag in output: {content}"
    assert "</think>" not in content
    import json
    data = json.loads(content)
    assert data.get("status") == "ok"
    assert data.get("count") == 42


# ══════════════════════════════════════════════════════════════════════════
# 3. Compliance explain() narration
# ══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_compliance_explain_narration(warm_model):
    """llm.explain() must return a non-empty string and not contradict the result."""
    from app import llm

    result = await llm.explain(
        prompt=(
            "Decision DEC-004 (Rs 4L VendorCo contract, CTO Vikram Rao, 2025-03-14) was "
            "checked against PROC-3.1@v1 (CTO limit Rs 5L). Result: compliant."
        ),
        fallback="compliant"
    )

    print(f"\n  explain() narration:\n    {result}")
    # Accept both a full LLM narration AND the graceful fallback word
    assert isinstance(result, str) and len(result) >= 1
    assert "non_compliant" not in result.lower()
    # If the model responded (not fallback), it should be a proper sentence
    if len(result) > len("compliant"):
        assert len(result) > 20, f"Suspiciously short narration: {result!r}"


# ══════════════════════════════════════════════════════════════════════════
# 4. Full E2E reasoning pipeline with local model
# ══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_e2e_reasoning_aws_move(warm_model):
    """E2E: 'Why did we move off AWS?' must cite DEC-006 and not be refused."""
    from app.reasoning import ReasoningEngine
    from app.retrieval.synthetic import SyntheticRetrievalAdapter

    engine = ReasoningEngine(SyntheticRetrievalAdapter())
    t0 = time.perf_counter()
    res = await engine.answer(
        question="Why did we move off AWS in May 2025?",
        as_of=date(2025, 6, 1),
        explain_compliance=False,
    )
    elapsed = time.perf_counter() - t0

    print(f"\n  E2E AWS move ({elapsed:.1f}s):")
    print(f"    refused: {res['refused']}")
    print(f"    answer : {res['answer'][:200]}")
    print(f"    cited  : {[c['id'] for c in res['citations']]}")

    assert not res["refused"], f"Engine refused unexpectedly: {res['answer']}"
    cited_ids = {c["id"] for c in res["citations"]}
    assert "DEC-006" in cited_ids or "MTG-2025-05-14" in cited_ids, (
        f"Expected DEC-006 or MTG-2025-05-14, got: {cited_ids}"
    )


@pytest.mark.asyncio
async def test_e2e_reasoning_vendorco_compliance(warm_model):
    """E2E: VendorCo Rs 4L contract must be cited as compliant."""
    from app.reasoning import ReasoningEngine
    from app.retrieval.synthetic import SyntheticRetrievalAdapter

    engine = ReasoningEngine(SyntheticRetrievalAdapter())
    t0 = time.perf_counter()
    res = await engine.answer(
        question="Was the Rs 4 lakh VendorCo contract approved correctly in March 2025?",
        as_of=date(2025, 3, 14),
        explain_compliance=False,
    )
    elapsed = time.perf_counter() - t0

    print(f"\n  E2E VendorCo ({elapsed:.1f}s):")
    print(f"    refused   : {res['refused']}")
    print(f"    cited     : {[c['id'] for c in res['citations']]}")
    print(f"    compliance: {[(c['decision_id'], c['result']) for c in res['compliance']]}")

    assert not res["refused"]
    assert any(
        c["decision_id"] == "DEC-004" and c["result"] == "compliant"
        for c in res["compliance"]
    )


@pytest.mark.asyncio
async def test_e2e_reasoning_no_evidence_refusal(warm_model):
    """E2E: MongoDB question must be refused, not hallucinated."""
    from app.reasoning import ReasoningEngine
    from app.retrieval.synthetic import SyntheticRetrievalAdapter
    from app.prompts import ANSWER_REFUSAL_SENTENCE

    engine = ReasoningEngine(SyntheticRetrievalAdapter())
    res = await engine.answer(
        question="Why did we choose MongoDB?",
        as_of=date(2025, 6, 30),
        explain_compliance=False,
    )

    print(f"\n  Refusal test:")
    print(f"    refused: {res['refused']}")
    print(f"    answer : {res['answer'][:200]}")

    assert res["refused"] is True
    assert res["answer"] == ANSWER_REFUSAL_SENTENCE
    assert len(res["citations"]) == 0


# ══════════════════════════════════════════════════════════════════════════
# 5. Latency benchmark (informational only – never fails)
# ══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_latency_benchmark(warm_model):
    """Measure throughput for a minimal structured-output call. Informational."""
    payload = {
        "model": AVAILABLE_MODEL,
        "stream": False,
        "think": False,
        "options": {"temperature": 0},
        "format": {
            "type": "object",
            "properties": {"ok": {"type": "boolean"}},
            "required": ["ok"]
        },
        "messages": [{"role": "user", "content": "Reply with ok: true"}],
    }

    t0 = time.perf_counter()
    async with httpx.AsyncClient(timeout=INFERENCE_TIMEOUT) as client:
        r = await client.post(f"{config.OLLAMA_BASE_URL}/api/chat", json=payload)
    elapsed = time.perf_counter() - t0

    data = r.json()
    prompt_dur = data.get("prompt_eval_duration", 1) / 1e9
    gen_dur    = data.get("eval_duration", 1) / 1e9
    prompt_tps = data.get("prompt_eval_count", 0) / max(prompt_dur, 0.001)
    gen_tps    = data.get("eval_count", 0) / max(gen_dur, 0.001)

    print(f"\n  Latency benchmark:")
    print(f"    model          : {AVAILABLE_MODEL}")
    print(f"    total wall time: {elapsed:.2f}s")
    print(f"    prompt t/s     : {prompt_tps:.1f}")
    print(f"    generation t/s : {gen_tps:.1f}")
    print(f"    tokens out     : {data.get('eval_count')}")

    assert r.status_code == 200
