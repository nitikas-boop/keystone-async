# Keystone

**Temporal decision memory for small regulated teams.** Keystone records the decisions an organisation made, the
policy clause version in force when each was made, flags past decisions when a policy changes, and gates every
action behind human approval with a tamper-evident, hash-chained audit log. It runs entirely on local hardware.

Team *minty jamun* · ASYNC'26 Track 1 (Sovereign AI). Demo dataset: "Nimbus Ledger", a synthetic 7-person fintech.

> "A decision was correct when we made it. The rules changed. What happens now?"

## What it does

- **Point-in-time compliance.** Clause-level policy versions (`RET-2.1@v2`); a deterministic checker evaluates a
  decision against the version valid on its decision date: `compliant | non_compliant | not_checkable | no_clause`.
  The local model only words the explanation.
- **Policy impact scanner.** Uploading a new policy version diffs the clause fields and flags affected decisions as
  `ONGOING_PRACTICE_BREACH`, `RULE_CHANGED_SINCE` or `SUPERSEDED`.
- **Cited answers or a refusal.** `/ask` runs hybrid retrieval (embeddings + BM25 + graph) as of a date; every
  sentence cites a source ID. With no relevant evidence the answer is exactly *"I have no recorded decision about
  that"*.
- **Human-gated action.** The model can only write a proposal. A separate executor acts only on rows a human
  approved (today it writes an `.eml` to `outbox/`), and every step is appended to a hash-chained audit log.
- **Ingestion review.** Facts the model extracts from meeting notes carry their source sentence, confidence and
  verification state; a human accepts or rejects each one.
- **Voice, transcribed locally.** A mic button in the chat and meeting-audio upload in Ingest Document. Audio goes
  to `POST /transcribe` (faster-whisper `base.en` on CPU, weights in `backend/models/`, no runtime download); a
  recording becomes an ordinary `meeting_note` with front-matter and goes through the same extraction + review path.
  The browser's Web Speech API is not used: Chrome sends that audio to Google.
- **Visibility filter at retrieval.** Nodes with `visibility: restricted` (DEC-008, MTG-2025-08-12) never reach the
  prompt unless the asking user is in `RESTRICTED_READERS` (default nitika, farhan, ananya). Priya gets the ordinary
  refusal. A user list, not RBAC.
- **MCP server.** `mcp/keystone_mcp.py` (stdio, stdlib only) exposes `ask`, `check_compliance`, `list_policies`,
  `list_flags`, `list_proposals`, `verify_audit_chain` and one write tool, `propose_action`, which can only create a
  `proposed` row (`POST /proposals`): approval stays a human click. Claude Desktop config:
  `{"mcpServers": {"keystone": {"command": "python", "args": ["<repo>/mcp/keystone_mcp.py"]}}}`
- **Server-side chain check.** `GET /audit/verify` recomputes every hash and link and names the first broken row;
  the Audit Trail's Verify button runs it alongside the in-browser check.

## Stack

Ollama (`qwen2.5-7b-16k`, `nomic-embed-text`) · Neo4j 5 CE + Graphiti (graph, valid time, retrieval) ·
PostgreSQL 16 (documents, review queue, audit log) · FastAPI · React + Vite. No cloud APIs, telemetry off,
fonts bundled: the running app makes no request off the machine.

## Run it

Prerequisites: Docker Desktop, Ollama, Node 20+. **On Windows, one command does all of it** (models, stack, demo
data, frontend packages): `powershell -ExecutionPolicy Bypass -File scripts/setup-demo.ps1`, then `npm run dev`.
Recording the demo on another PC: [docs/DEMO-RECORDING.md](docs/DEMO-RECORDING.md).

Manual steps:

```bash
sh scripts/create_models.sh          # once per machine: qwen2.5-7b-16k (16k context) + nomic-embed-text
cp .env.example .env
docker compose up -d --build --wait  # Postgres :5432, Neo4j :7474/:7687, API :8000 (/docs), executor
npm install && npm run dev           # frontend on http://localhost:5173
```

Load the demo data, either from the snapshot (fast) or by seeding (~1 min on a 4070 laptop):

```bash
powershell -File scripts/restore.ps1 -Name nimbus-seed      # snapshot committed in backups/nimbus-seed
docker compose exec backend python -m app.seed              # or: ingest data/vault/ chronologically
```

Write endpoints take a hardcoded user header, e.g. `X-User: priya` (real auth is out of scope).

## Demo script (§8 of [docs/REFERENCE.md](docs/REFERENCE.md))

1. *Show the history of Project Atlas.* — DEC-003 → DEC-006 → DEC-010, in order, with owners.
2. *Why did we move off AWS in May 2025?* — Vikram Shah, 2025-05-20, data residency and cost, cites the meeting note.
3. *Was the ₹4 lakh VendorCo contract approved correctly in March 2025?* — yes under PROC-3.1 v1; today it would
   need CEO sign-off under v2.
4. *Was keeping customer logs for 180 days compliant in Q2 2025?* — yes, RET-2.1 v2, exactly at the limit. Drag the
   timeline to 2024 and the graph shows v1 instead.
5. Upload `data/demo-upload/POL-RET-v3.md` (Ingest Document) — DEC-007 flagged `ONGOING_PRACTICE_BREACH`.
6. Approve the proposal — the executor writes `outbox/proposal-N.eml`.
7. Audit Trail → Verify Full Chain.
8. *Why did we choose MongoDB?* — refused.

Expected answers: `data/ground-truth.json`. Re-check after any prompt change with
`docker compose exec backend python tests/calibrate_threshold.py http://localhost:8000`.

## Tests

```bash
docker compose exec backend python -m pytest -q tests
```

Tests run against an isolated backend on :8001 (`keystone_test` database, graph group `keystone-test`) and never
touch the demo data.

Evaluation against `data/ground-truth.json` (extraction precision/recall + answer correctness for the demo
questions; exit 1 on any failed answer). It writes answers and audit rows, so restore `nimbus-seed` afterwards:

```bash
python backend/tests/eval.py http://localhost:8000
```

Last run (28 Sept): 5/5 demo answers pass; extraction precision 1.00, recall 0.67 (the MTG-2025-05-14 decision is
skipped by design because DEC-006 already records it).

## Known limitations

- Extraction quality bounds the graph: every extracted fact needs human review.
- Open-textured clauses are marked `checkable: false` and returned as `not_checkable`, never guessed.
- Exceptions, waivers and decision-vs-decision conflicts are not modelled.
- Single-tenant; the only access control is the restricted-visibility user list. RBAC and source-level ACLs are roadmap.
- The audit log is tamper-evident, not regulatory-grade.
- Real Jira/Gmail/Slack integrations are roadmap: the executor writes email files to `outbox/`.
- The data is synthetic.

Graphiti (by Zep) is the temporal graph engine underneath; Keystone adds the clause model, the deterministic
compliance check, the impact scanner and the approval gate.
