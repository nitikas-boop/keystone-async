# AI-HANDOFF-2 — Keystone Member 2 Test-Fix Status

## Current Task

I am monitoring the test suite execution after fixing the three integration-test issues on the current `member2-test-fixes` branch.

## Progress / Polling History

The following progress checks were made while waiting for the test suite:

- Check task-729 progress.
- Waiting for `test_member2_reasoning.py` to complete.
- Check `test_member2_reasoning.py` progress.
- Waiting for `test_member2_reasoning.py` to complete.
- Waiting for `test_member2_reasoning.py` to complete.
- Continued monitoring.
- Last progress observed: `test_as_of_sees_only_earlier_document` had been running for approximately 30 seconds. This was likely making an LLM inference call internally.
- Polling was then stopped so the running task could continue without further interruption.
- The system was expected to notify when the test task completed or the timer expired.

## Latest Verified Results

The core Member 2 test suite completed successfully:

- ✅ `test_member2_reasoning.py` — **19/19 passed** (approximately 56 seconds)
- ✅ `test_ask_endpoint.py` — **8/8 passed**
- 🔄 `test_asof_smoke.py` — running when the handoff was captured
- 🔄 Remaining tests — pending at the time of handoff

The broader suite had not yet completed when this handoff was created.

## The Three Original Integration Issues

### 1. Graph-dependent tests

**Problem:**

The original 11 tests depended on the old silent fallback when no graph was connected.

After the merged backend removed that production fallback, the tests failed because the graph was not initialized.

**Fix:**

- Added a `test_graph` autouse fixture.
- The fixture uses `FakeGraphiti` as the test graph fallback/setup.
- The affected tests now have graph context instead of depending on the removed production fallback.

**Verified:**
- ✅ The 11 graph-dependent tests now pass as part of `test_member2_reasoning.py`.
- ✅ `test_member2_reasoning.py` is now **19/19 passing**.

### 2. Model availability test

**Problem:**

The test expected the wrong model name.

**Team-locked model:**

`qwen2.5-7b-16k`

**Fix:**

- Updated `test_model_is_available` to expect `qwen2.5-7b-16k`.
- Updated configuration defaults to match the locked model.

**Status:**
- ✅ Fixed and included in the passing Member 2 suite.

### 3. Ollama URL in latency benchmark

**Problem:**

`test_latency_benchmark` hardcoded `http://localhost:11434`.

This is incorrect when tests run inside Docker because `localhost` refers to the backend container.

**Fix:**

- Updated the test to use `config.OLLAMA_BASE_URL` instead of hardcoding localhost.

**Status:**
- ✅ Fixed and included in the passing Member 2 suite.

## Important Production Behavior

The production silent fallback was **not restored**.

Production reasoning/compliance must not silently switch to synthetic vault files when the real graph is unavailable.

The graph/test setup change is confined to testing.

## Current State

The current Member 2 test fixes have achieved:

```text
test_member2_reasoning.py  → 19/19 PASS
test_ask_endpoint.py       → 8/8 PASS
test_asof_smoke.py         → running when handoff was captured
broader test suite         → still pending
```

## Next Actions

1. Let the remaining test suite finish.
2. Inspect any failures from:
   - `test_asof_smoke.py`
   - remaining full-suite tests
3. Verify that any remaining failures are real integration/runtime issues rather than test-fixture problems.
4. Do not restore silent production fallbacks just to make tests green.
5. Once the relevant/full suite is green:
   - review `git diff`
   - commit the test fixes
   - push `member2-test-fixes`
   - open/update the PR targeting `backend`
6. After integration:
   - validate the real Graphiti/Neo4j path
   - run the real Nimbus seed
   - calibrate refusal/relevance threshold on the real graph
   - run the core demo queries
   - tune prompts only if real answers are weak

## Current Model / Runtime Context

The team's locked model is:

`qwen2.5-7b-16k`

The latency benchmark must use:

`OLLAMA_BASE_URL`

rather than a hardcoded `localhost:11434`.

## Handoff Note

The core Member 2 test-fix objective is now substantially complete: **19/19 Member 2 reasoning tests pass and 8/8 `/ask` endpoint tests pass.**

The remaining work is full-suite verification and then integration/real-graph validation.
