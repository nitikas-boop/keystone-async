# Keystone — Current Reference (as built)

**Written 28 Sept 2026, 23:40, against commit `ff89fd4` (on `main`, `additional-features` and
`frontend-changes-with-backend`).** Team minty jamun · ASYNC'26 Track 1 (Sovereign AI) · Ramaiah Institute of Technology.

`docs/archive/PLAN-2026-09-25.md` is the plan written on 25 Sept. This file describes what the app actually does
today. Where they disagree about what exists, this file is right; the archived plan still holds for market research,
sources, legal wording and pitch strategy (§4, §11, §12, §19 there), which are summarised here, not repeated.

---

## 0. Where we are

| Item | Status |
|---|---|
| Idea submission (deck) | Done, 22 Sept |
| Guided build phase | Done, 28 Sept |
| App | All planned must-have and should-have features built and tested (§9) |
| Backend tests | 66/66 pass |
| Demo answers vs ground truth | 5/5 pass |
| Demo video + voice-over script + PPT | Done |
| Branches | `main`, `additional-features`, `frontend-changes-with-backend` all at `ff89fd4` |

---

## 1. What Keystone is

**Keystone is temporal decision intelligence for organizations.** It records the decisions an organization made,
why, and which rule was in force at that moment, and it raises a flag when a rule changes in a way that affects a
past decision. It runs entirely on the organization's own hardware, and no action executes until a human approves it.

> "A decision was correct when we made it. The rules changed. What happens now?"

**What we claim as ours:** a policy/decision ontology with clause-level linking, a deterministic compliance check
against the clause version valid on the decision date, a policy-impact scanner that re-runs that check when a policy
changes, and a structurally enforced approval gate with a tamper-evident audit trail. Self-hosted, for small
regulated teams.

**What we don't claim:** that we invented temporal graphs, RAG, MCP, human approval or knowledge graphs; that we
check any regulation (only machine-checkable clauses); that Graphiti is our innovation (it is Zep's engine; we credit it).

---

## 2. The official brief and how we cover it (updated depths)

| # | Official bullet | How Keystone covers it | Depth now |
|---|---|---|---|
| 1 | Open-weight/local models | Ollama: `qwen2.5-7b-16k` for extraction + answers, `nomic-embed-text` embeddings, faster-whisper `base.en` for speech | Full |
| 2 | Knowledge base | Postgres documents + the temporal graph | Full |
| 3 | Persistent long-term memory | The temporal graph | Full |
| 4 | Semantic, keyword or graph retrieval | Graphiti hybrid retrieval: embeddings + BM25 + graph traversal, as-of filtered | Full |
| 5 | Automatic ingestion | Upload (Markdown or meeting audio) + a polling folder watcher on the vault `inbox/` | Full (polling, not event-driven) |
| 6 | Connections between people, projects, decisions | The core ontology | Full, differentiator |
| 7 | Agentic tool execution via MCP | Keystone's own MCP server: 6 read tools + 1 propose-only write tool. The executor itself writes `.eml` files directly | Full for the MCP server; the executor does not go through MCP |
| 8 | Controlled execution, reviewed and audited | Review queue + separate executor + hash-chained audit log + server-side chain verification | Full, differentiator |
| 9 | Local-first / self-hosted | One `docker compose` stack; no cloud APIs; telemetry off | Full |

No Mem0 or Letta. Conversational context is the recent chat turns held in the prompt.

---

## 3. The problem (unchanged)

Priya joins a small fintech as ops lead. An auditor asks whether a ₹4 lakh vendor contract signed fourteen months
ago followed the procurement policy. The signer has left, and the policy has changed since. Today that is two days of
email archaeology; with Keystone it is one question.

A **decision** is a recorded choice between options, with an owner, a date and at least one stated reason. Anything
below that bar is a note. Every extracted decision passes human review: **AI-assisted institutional memory, not
automatic organizational truth.**

---

## 4–5. Market and differentiation (summary)

Use only the safe wordings in `docs/archive/PLAN-2026-09-25.md` §4 (Foundation Capital Dec 2025; Gartner 50%-by-2028 attributed as
widely reported; Obin AI $7M seed Mar 2026). Never the Palantir/Bloomberg/Kensho line. Never "nothing like this exists".

| Capability | Keystone | Drive + RAG chatbot | ADRs / Notion | Obin AI, Sphere |
|---|---|---|---|---|
| Names the policy version in force on a past date | Yes | No | No | Yes |
| Links a decision to a clause version | Yes | No | No | Partly |
| Flags past decisions when a policy changes | Yes | No | No | Partly |
| Ships UI, review queue, audit log | Yes | Chat only | No | Yes |
| Self-hosted, affordable at 10–50 people | Yes | Yes | Yes | No |

---

## 6. Architecture as built

### 6.1 Stack

| Layer | Technology |
|---|---|
| Models | Ollama: `qwen2.5-7b-16k` (qwen2.5:7b with 16k context) for extraction and answers; `nomic-embed-text` for embeddings |
| Speech | faster-whisper `base.en` on CPU, weights in `backend/models/`, no runtime download |
| Graph + retrieval | Neo4j 5 Community + Graphiti (valid time, hybrid retrieval) |
| Records | PostgreSQL 16: documents, review queue, proposals, extractions, audit log, ingestion runs |
| API | FastAPI (`backend/app/main.py`) |
| Executor | Separate process (`python -m app.executor`), its own container |
| Frontend | React + Vite + Tailwind (not Next.js as originally planned) |
| MCP | `mcp/keystone_mcp.py`, stdio JSON-RPC, Python stdlib only |
| Ops | `docker-compose.yml`; `scripts/setup-demo.ps1`, `snapshot.ps1`, `restore.ps1` |

Postgres holds the documents behind every citation; retrieval runs in the graph. pgvector is not used.

### 6.2 Ontology

```
Person        ─MADE_BY(reverse)→  Decision
Decision      ─ABOUT→             Project
Decision      ─RELIED_ON→         Clause@PolicyVersion
Decision      ─JUSTIFIED_BY→      MeetingNote | Document
Decision      ─SUPERSEDES→        Decision
Clause        ─BELONGS_TO→        PolicyVersion
PolicyVersion ─SUPERSEDES→        PolicyVersion
Flag          ─AFFECTS→           Decision
Flag          ─CAUSED_BY→         Clause@PolicyVersion
```

Every edge carries valid time and ingestion time.

### 6.3 Dates

Every source file has YAML front-matter with its real date (`effective_from`, `decided_on`, `meeting_date`), passed
as the episode reference time. Ingestion is chronological. Policy validity comes from metadata, never from the model.
The as-of smoke test (`tests/test_asof_smoke.py`) passes.

### 6.4 Clauses

`PolicyVersion → Clause` with stable IDs (`RET-2.1`) and structured fields (`retention_days_max`,
`approver_threshold_inr`). Open-textured clauses (`RET-4.2`) are `checkable: false`.

### 6.5 Compliance check (deterministic)

Resolve the clause version valid on `decided_on`, apply the comparison rule, return one of **`compliant`,
`non_compliant`, `not_checkable`, `no_clause`** (the fourth is new: the decision relied on no clause). The check also
reports the result as of today, so answers can say "compliant then, non-compliant now". The model only words the
explanation. Endpoint: `GET /decisions/{id}/compliance`.

### 6.6 Policy impact scanner

On ingest of a new policy version: diff clause fields, find decisions `RELIED_ON` the changed clauses, re-run the
check, classify, write a Flag, a proposal (when action is needed) and an audit row.

| Type | Example | Proposal? |
|---|---|---|
| `ONGOING_PRACTICE_BREACH` | DEC-007 (180-day retention) vs RET-2.1 v3 (90 days) | Yes |
| `RULE_CHANGED_SINCE` | DEC-004 (₹4L contract) vs PROC-3.1 v2 (₹2L CTO ceiling) | Yes (informational) |
| `SUPERSEDED` | DEC-002 replaced by DEC-007 | No |
| `EXCEPTION`, `DECISION_CONFLICT` | Not modelled | — |

Shown as **Policy Impact** in the UI (timeline badge, red node on the graph, inspector note).

### 6.7 Answering rules

- Every sentence cites a source ID; answers render with the subgraph they came from.
- No relevant evidence: exactly **"I have no recorded decision about that"**.
- Follow-up handling: unrelated questions do not re-answer the previous turn.

### 6.8 Provenance

Every extracted fact carries `source_doc`, source span + quote, `confidence`, `extracted_by`, `human_verified`,
`visibility`. The Ingestion Review screen shows the quote beside each fact.

### 6.9 Approval gate and MCP

```
Local LLM / scanner / MCP client ──writes──▶ proposal (status: proposed)
                                                │
                                   human clicks Approve (status: approved)
                                                │
                                   executor process ──▶ outbox/proposal-N.eml
                                                │
                                   audit log (hash-chained)
```

The model and MCP clients can only create `proposed` rows. Only a human click sets `approved`. The executor polls
for approved rows (~2 s) and writes the `.eml`.

**MCP server** (`mcp/keystone_mcp.py`, env `KEYSTONE_URL`, `KEYSTONE_USER`):

| Tool | Kind |
|---|---|
| `ask(question, as_of)` | read |
| `check_compliance(decision_id)` | read |
| `list_policies`, `list_flags`, `list_proposals` | read |
| `verify_audit_chain` | read |
| `propose_action` | write, proposal only (`POST /proposals`) |

Claude Desktop config: `{"mcpServers": {"keystone": {"command": "python", "args": ["<repo>/mcp/keystone_mcp.py"]}}}`

### 6.10 Audit log

Append-only Postgres table, SHA-256 hash chain (`prev_hash` → `hash`), genesis `prev_hash` = 64 zeros. A database
trigger stamps each row. Actions logged: `policy_ingested`, `query`, `flag_created`, `action_proposed`, `approved`,
`rejected`, `executed`, `extraction_reviewed`.

Verification runs twice: `GET /audit/verify` on the server (names the first broken row) and in the browser
(Verify Full Chain). Call it **tamper-evident**, never regulatory-grade.

### 6.11 Visibility filter

Documents carry `visibility: org | restricted` (DEC-008 and MTG-2025-08-12 are restricted). Restricted nodes are
removed at retrieval, before the prompt, unless the user is in `RESTRICTED_READERS` (default: nitika, farhan,
ananya). Priya asking about DEC-008 gets the ordinary refusal. List views hide restricted items unless
`include_restricted=true`. A user list, not RBAC.

### 6.12 Voice

- Chat mic button: records in the browser, `POST /transcribe`, the transcript is asked as a normal question.
- Meeting audio in Ingest Document: transcribed locally, saved as a `meeting_note` with front-matter, then goes
  through the normal extraction and review path.
- The browser Web Speech API is deliberately not used (Chrome sends that audio to Google).

### 6.13 Sovereignty checklist

| Item | Status |
|---|---|
| LLM local (Ollama) | Yes |
| Embeddings local (`nomic-embed-text`) | Yes |
| Speech local (faster-whisper, bundled weights) | Yes |
| Telemetry off | Yes (`/health` reports `"telemetry": false`) |
| Fonts bundled, no CDN calls | Yes |
| Graph, DB, executor, outbox local | Yes |
| Full demo with network off | Not yet rehearsed; do it once before presenting |

---

## 7. Dataset — "Nimbus Ledger" (unchanged)

Synthetic 7-person Bengaluru fintech: 7 people, `POL-RET` v1/v2 (+ v3 uploaded live), `POL-PROC` v1/v2, 10 decisions,
3 meeting notes, `data/ground-truth.json`. Full tables in `docs/archive/PLAN-2026-09-25.md` §7.

Demo upload files in `data/demo-upload/`:

| File | Used for |
|---|---|
| `POL-RET-v3.md` | Live policy change (90-day ceiling), flags DEC-007 |
| `voice-question.wav` | Q3 asked by voice |
| `meeting-2026-09-28.wav` | Meeting audio ingest (extracts the Keycloak single-sign-on decision) |

Demo DB snapshot: `backups/nimbus-seed` (committed). Restore: `powershell -File scripts/restore.ps1 -Name nimbus-seed`.

---

## 8. The demo (as recorded)

| # | Step | What it proves |
|---|---|---|
| 1 | "Show the history of Project Atlas." | DEC-003 → DEC-006 → DEC-010 in order, with owners |
| 2 | Click a citation | Graph selects the node; inspector shows owner, date, rationale, provenance quote |
| 3 | "Why did we move off AWS in May 2025?" | Vikram Shah, 2025-05-20, residency + cost, cites MTG-2025-05-14 |
| 4 | Q3 **by voice**: "Was the ₹4 lakh VendorCo contract approved correctly?" | Local speech-to-text; compliant under PROC-3.1 v1, would need CEO today (click **Today** on the timeline first) |
| 5 | "Why do we run quarterly access reviews?" as Priya | Visibility filter: DEC-008 is restricted, so she gets the refusal |
| 6 | Temporal Graph + "Was 180-day retention compliant in Q2 2025?" | Yes, RET-2.1 v2, exactly at the limit |
| 7 | Timeline: Jan 2024 → Jan 2025 → Jul 2025 → Today | Graph shows what was in force on each date |
| 8 | Upload RET-2.1 v3 | Scanner flags DEC-007 `ONGOING_PRACTICE_BREACH`, DEC-002 `SUPERSEDED`, queues a proposal |
| 9 | Approve in Review Queue | Executor writes `outbox/proposal-N.eml` |
| 10 | Upload meeting audio | Transcribed locally, facts extracted with source sentences |
| 11 | Ingestion Review | Accept / reject each extracted fact |
| 12 | Audit Trail → Verify Full Chain | Server + browser verification: chain valid |
| 13 | "Why did we choose MongoDB?" | Refused |

Assets: `docs/DEMO-SCRIPT.md` (timestamped narration), `scripts/record-demo.mjs` (Playwright re-recorder, changes demo
data, restore afterwards), recorded video in `demo-recording/` (gitignored, share directly).

The graph is pre-built and snapshotted; the live steps are queries, the deterministic scan and approval.

---

## 9. Feature list — status

### The eight things that must work

All eight work and are in the demo: policy upload, decision/meeting-note upload, temporal graph with correct valid
time, cited "why" answers, point-in-time compliance, new version upload, automatic impact flags by type, human
approval with audit record.

### Must-have

| Feature | Status |
|---|---|
| Front-matter dates as reference time | ✅ |
| Extraction with provenance | ✅ |
| Clause-level policy versioning | ✅ |
| Deterministic compliance check (now 4 outcomes) | ✅ |
| Forced citations + no-evidence refusal | ✅ |
| "As of" date control | ✅ |
| Impact scanner on ingest | ✅ |
| Review queue: approve / edit / reject | ✅ |
| Executor + outbox | ✅ (writes `.eml` directly; MCP is exposed separately, §6.9) |
| Hash-chained audit log + read-only view | ✅ |
| Graph view of the answer subgraph | ✅ |
| Ingestion review screen | ✅ accept / reject in the UI; edit exists in the API (`PATCH /extractions/{id}`) but has no button |
| Polling folder watcher | ✅ vault `inbox/` |

### Should-have

| Feature | Status |
|---|---|
| Extraction precision/recall vs ground truth | ✅ `backend/tests/eval.py` |
| Answer-correctness script | ✅ `eval.py`, `calibrate_threshold.py` |
| `visibility` enforced at retrieval | ✅ |
| Keystone's own MCP server | ✅ |
| `verify_chain` endpoint | ✅ `GET /audit/verify` |

### Added beyond the plan

- Local voice: chat mic + meeting audio ingest (§6.12)
- Server + browser audit verification side by side
- `no_clause` compliance outcome and "then vs now" results
- One-command Windows setup (`scripts/setup-demo.ps1`) and committed demo snapshot
- Scripted demo recorder
- Viewport-fitted workspace UI, header Home button, final logo (§10)

### Roadmap (not built, by design)

Real Jira/Gmail/Slack integrations · executor routed through MCP tools · policy diff view · RBAC and source-level ACLs ·
confidence per graph edge in the UI · multi-tenant hosting · Drive/SharePoint/Notion import · fine-tuned extraction ·
event-driven ingestion · pseudonymisation and erasure workflow.

### Out of scope, as a principle

Autonomous action without human approval.

---

## 10. The UI

| Screen | What it shows |
|---|---|
| Landing page | Pitch, features, 5-stage pipeline, architecture matrix, live engine status |
| Enter Workspace | Pre-authenticated role picker: Priya (Ops Lead), Karthik (CTO), Ananya (CEO), or Keystone Admin. Demo roles, not real auth |
| Header | Home button, logo, engine status (≥1720 px wide), view tabs with pending-review badge, Ingest Document, current user, sign out |
| Timeline ribbon | As-of date, active clause versions, policy-impact badge, milestone slider, Animate Timeline |
| Unified Workspace | Chat (left) + graph and review-queue preview (right), one viewport, panels scroll independently |
| Temporal Graph | Chat (left, same conversation) + large graph (right). Wheel zooms toward the cursor, drag pans, graph always fits its nodes and leaves room for the inspector |
| Review Queue | Proposals with reasoning, target, status; Approve / Edit / Reject |
| Ingestion Review | Extracted facts with source sentence, confidence, model; Accept / Reject |
| Audit Trail | Hash-chained rows, Verify Full Chain (server + browser) |
| Ingest Document | Demo presets (RET v3, PROC v2), custom Markdown or meeting audio, scanner results, jump to Review Queue |

Target: 1920×1080 at 125% scaling (1536×~730 CSS px). No page-level scrolling on app screens. Logo swap: replace
`public/keystone-mark.png` (also the favicon).

---

## 11. Environment and running it

```bash
powershell -ExecutionPolicy Bypass -File scripts/setup-demo.ps1   # Windows, one command: models, stack, data, packages
npm run dev                                                      # http://localhost:5173
```

Manual: `sh scripts/create_models.sh`, `cp .env.example .env`, `docker compose up -d --build --wait`,
`npm install && npm run dev`, then restore `nimbus-seed`. API on :8000 (`/docs`). Write endpoints take `X-User`
(e.g. `priya`). Troubleshooting on another PC: `docs/DEMO-RECORDING.md`.

Hardware note: the plan called for a 14B extraction model; the build uses `qwen2.5-7b-16k` for everything so the stack
runs on a laptop GPU.

---

## 12. Testing and metrics

| Check | Command | Last result (28 Sept, 23:25) |
|---|---|---|
| Backend tests (isolated :8001 instance, `keystone_test` DB) | `docker compose exec backend python -m pytest -q tests` | 66 passed |
| Demo answers + extraction vs ground truth | `python backend/tests/eval.py http://localhost:8000` | 5/5 answers pass; extraction precision 1.00, recall 0.67 |
| MCP server | pipe JSON-RPC into `python mcp/keystone_mcp.py` | All 7 tools listed; read tools return data |
| Audit chain | `GET /audit/verify` | Valid |
| Full UI flow | `scripts/record-demo.mjs` | Every scene passes |

`eval.py` and the recorder write answers and audit rows: restore the snapshot afterwards.

Recall 0.67: the model skips the MTG-2025-05-14 decision because DEC-006 already records it, which is intended.

**Success metrics (slide):**
- 5/5 demo answers correct, every sentence cited
- 100% refusal when there is no evidence
- 2/2 affected decisions flagged within ~13 s of a policy upload
- 0 actions run without human approval, with a hash-chained audit trail
- 0 bytes leave the machine: fully local, ~10 s per answer

---

## 13. Legal, privacy, security (summary)

Unchanged from the original §12. Say "tamper-evident", not "regulatory-grade". Keystone does not make anyone DPDP
compliant. Pseudonymisation/erasure is a design, not a built feature. Permissions: the visibility filter is built;
RBAC is the first roadmap item.

---

## 14. Known limitations

| Limitation | What we say |
|---|---|
| Extraction quality bounds the graph | Provenance on every fact, human review screen, measured precision/recall |
| Open-textured clauses | `not_checkable`, never guessed |
| Exceptions, waivers, decision conflicts | Not modelled; the ontology has room |
| Permissions | Restricted-visibility user list at retrieval; RBAC and source ACLs are roadmap |
| Executor output | Writes `.eml` files to `outbox/`; real Jira/Gmail are roadmap |
| Ingestion Review edit | API only, no button |
| Auth | Demo role picker and `X-User` header; real auth out of scope |
| Single-tenant | Isolation per graph is the path |
| Audit log | Tamper-evident, not regulatory-grade |
| Speech-to-text | `base.en` can mishear names ("VendorCo" came out as "vendor co-contract"; the answer was still right) |
| Data | Synthetic |

---

## 15. Reconciling with the deck (updated)

| Deck says | Reality now | How to handle it |
|---|---|---|
| PostgreSQL + pgvector for semantic chunks | Retrieval in Graphiti; Postgres holds documents | "Postgres holds the documents behind every citation; retrieval runs in the graph." |
| Vault watcher ingests new notes | Built (polling `inbox/`) | True as stated |
| 3 policy versions | Retention v1–v3 + procurement v1–v2 | More than promised |
| 14B extraction / 8B answers | One 7B model (`qwen2.5-7b-16k`) for both | "We sized the model to run on a laptop GPU." |
| Next.js frontend | React + Vite | Irrelevant to judges; don't raise it |
| Names behind pseudonymous IDs | Design claim | Present as design, don't demo |

---

## 16. Judge Q&A (changes from the original §16)

All original answers still hold. Updated ones:

| Question | Answer |
|---|---|
| "Do you use MCP?" | Yes. Keystone runs its own MCP server: any MCP client can ask questions, check compliance, list flags and verify the audit chain. Its one write tool can only create a proposal, so a human still approves. Real Jira/Gmail tools are next. |
| "Who can see what?" | Restricted documents are filtered at retrieval, before the model sees them; you saw Priya refused on a restricted decision. Full RBAC with source-level ACLs is the first roadmap item. |
| "How do you know the audit log is intact?" | The server recomputes every hash and names the first broken row, and the browser checks it independently. |
| "Does voice go to the cloud?" | No. Whisper runs on this machine with bundled weights. We avoided the browser's speech API because Chrome sends that audio to Google. |
| "How accurate is it?" | 5/5 demo answers against a hand-written answer key; extraction precision 1.00, recall 0.67, and the one miss is a duplicate it skips on purpose. |

---

## 17. Changes from the 25 Sept plan

| Plan | Now |
|---|---|
| Qwen3 14B extraction + 8B answers | `qwen2.5-7b-16k` for both |
| Next.js frontend | React + Vite |
| Executor calls an MCP tool | Executor writes `.eml` directly; MCP server exposed separately for clients |
| 3 compliance outcomes | 4 (`no_clause` added), plus "as of today" result |
| `make seed/snapshot/restore` | `app.seed`, `scripts/snapshot.ps1`, `scripts/restore.ps1`, `scripts/setup-demo.ps1` |
| Voice not planned | Local Whisper: chat mic + meeting audio ingest |
| verify_chain should-have | `GET /audit/verify` + browser check |
