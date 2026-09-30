# Changelog

## Person 2: knowledge, conflicts and reasoning (branch hemanth-split2, 30 Sept 2026)

Built on Commit 0 (the shared contract in `backend/app/contracts`). Every endpoint calls `current_user` and
`can_access`; counts are computed after the filter. Setup on an existing volume:
`docker compose exec postgres sh /docker-entrypoint-initdb.d/zz-apply-folders.sh` and `docker compose build backend`.

- **L. Session start.** Sign-in (the contract's `on_login`) warms the answer model and embedder in the
  background (Ollama `keep_alive`), with a status line in the top bar (not loaded, loading, ready, failed).
  A heartbeat keeps the model loaded; the last logout or 15 idle minutes unload it. The same sign-in scans
  `data/keystone` (`Organisation/`, `Team/<name>/`, `Groups/<name>/`) with a SHA-256 diff: new, updated,
  missing, touched-but-unchanged. The folder sets the access label. The first scan is a baseline an Owner
  confirms. Files wait in Ingestion Review until someone ingests or ignores them; nothing is automatic.
  Measured here (RTX 4060, 8 GB): cold load about 7 s; one 7B model serves answers and extraction.
- **C. Conflicts.** Policy proposals with claims (with expiry and a Team lead or Owner override),
  version-checked edits ("someone changed this, reload") and review locks. Duplicate detection runs in three
  layers (exact, structural, embedding cosine), and the local model only explains a match. Collisions of
  type A (proposal vs proposal), B (proposal vs another active clause) and C (two standing decisions)
  go to the domain authority, who is never a party. The winner becomes a new PolicyVersion through normal
  ingestion, so the staleness scanner runs. The ruling is a Decision (`RUL-n`) that chat can cite.
- **D. `/whatif`** (alias `/what-if`): policy change and person-leaves, labelled "HYPOTHETICAL: nothing has
  changed". Nothing is written except a `simulations` row and an audit row. Authorities can turn a result
  into a draft proposal. Also `/asof`, `/flags`, `/compliance`, `/history`, `/whois`, `/explain` and
  `/report`, all filtered on the server.
- **J. Reports.** Compliance as of a date and an audit-prep pack, as Markdown or PDF
  (Knowledge → Reports, or `/report`).
- **I. Languages.** A Hindi UI switch. Answers are translated sentence by sentence by the local model; the
  citation IDs are never sent to it. About 20-35 s per answer on this GPU, measured.
- **F. Audio.** Upload a recording with its meeting date and recorded consent. It is transcribed locally
  with timestamps, the uploader maps speakers, and the candidates go to Ingestion Review. Each cited quote
  plays the recording from its timestamp. The raw audio can be deleted and the transcript stays.
- Fixes found while testing: pinned `av==15.1.0` (PyAV 16+ broke faster-whisper, including `/transcribe`),
  model load and unload serialised (a logout racing the next login left the model cold), the stub logout
  moved to explicit sign-out, and the scanner self-check.

## Ask vs Temporal Graph (30 Sept 2026)

The two tabs had become the same screen at different widths. Each now has its own job:
- **Ask** (was "Unified Workspace") is the conversation. Next to it is the evidence for the latest answer:
  only the records that answer used, on their own timeline. It stays empty, with a hint, until you ask.
  "Explore in the full graph" jumps to the Temporal Graph.
- **Temporal Graph** is the full graph, the policy timeline and the inspector. The console sits in a rail
  and opens beside the graph when you need it. It is the same conversation, and the last answer's records
  stay highlighted.
- The console's submit button is now **Send**, so it no longer shares a name with the Ask tab.

## Usability pass (30 Sept 2026)

- **Titles before IDs.** Records show their title first, with the ID smaller: Review Queue list and detail,
  the Decisions register, involved-record chips, "How I got this", and scanner results. Every ID chip's
  tooltip names the record. Impact codes read as plain words everywhere: "Still breaching the new rule",
  "Rule changed since", "Replaced, historical only". The code stays in the tooltip.
- **Answer-first graph.** After an answer, the graph shows only the records that answer used, laid out
  across the date range those records span. A banner names the question. "Show full graph" returns to
  everything. A refusal or a new conversation clears it.
- **Simpler Workspace.** Console and graph split 50/50. The embedded review list is gone (the header badge
  counts proposals). The timeline collapses to one line on the Workspace by default and stays open on the
  Graph tab; the choice is remembered per view. The inspector opens when you ask to inspect something, not
  on every answer.
- **One date format:** `30 Sep 2026`. This applies to the as-of picker, audit filters, the graph's as-of
  tag, the console header, and ISO dates inside model-worded text. Dates inside IDs such as
  `MTG-2025-05-14` are left alone. "Back to today" appears when the timeline is elsewhere.
- **Polish.**
  - Rejected proposals show ✕.
  - Ingestion history lists the newest document first.
  - Graph labels avoid other labels and nodes, highest priority first.
  - The graph's colour key sits in the toolbar.
  - The layout works down to 1024 px: tabs become icons with tooltips, and side panels narrow.
- `record-demo.mjs` presses "Show full graph" before the time-travel scene.

## Frontend rework, branch `frontend-rework` (29–30 Sept 2026)

This pass changed the frontend only: `src/`, frontend tests, `scripts/record-demo.mjs` selectors, and docs.
The backend, database schema, audit chain, seed data, snapshots, executor and MCP server are unchanged.
Backend problems found along the way are listed in [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

### Truthfulness
- Every status on screen is computed or removed. The audit badge is the result of a verification that ran,
  with its time, block count and head hash, or the block where it broke. The console's engine badge and
  sovereignty line come from `GET /health`. "Grounding: 100%", "100% CONF", "Bi-temporal Edge Verified" and
  "LOCAL OLLAMA" are gone. Confidence is labelled as model-reported, next to the extractor and review state.
- One style for amounts (Indian grouping, `₹5,00,000`), timestamps (IST with UTC alongside) and clause
  references (`PROC-3.1@v2`), including text written by the local model (`src/utils/format.js`, tested).
- People and audit actors are shown by name, with their ID as secondary.
- Copy matches the reference: the executor writes an `.eml` to `outbox/`, the log is tamper-evident, no
  "Stage 5 / Structural Enactment / executor calls tools", no overclaims on the landing page.

### Screens
- **Review Queue:** list and detail. The detail pane says in plain words what approving does, shows the
  involved records, the scanner's full reasoning, the proposal as stored and its audit rows. After Approve
  the UI polls until the executor has written the file. Reject needs a reason. Edit is an inline draft
  editor.
- **Temporal Graph:** reads `GET /graph/view`, which is filtered for visibility on the server, instead of
  `GET /graph`, which is not. Deterministic layout: x is the date, one lane per entity type
  (`src/utils/graphLayout.js`, tested). Nodes fade or grey out as the as-of date moves. Labels appear on
  focus, and relations are shown by line style. The inspector is docked beside the graph, and the console
  can collapse to give the graph more width.
- **Timeline:** proportional to real dates, with a date picker, and shown only on Workspace and Graph.
- **Ingest Document:** presets know what is already ingested and warn before a duplicate upload. The
  progress list shows only stages the UI can observe. Errors are specific, and Cancel is available.
- **Ingestion Review:** pending facts by default, with history behind a toggle. Facts are grouped by
  document and sentence, with the sentence highlighted in context. Accept, Edit (PATCH) and Reject work per
  fact and in bulk. Reviewed facts show who reviewed them and when.
- **Console:** each answer shows its as-of date, elapsed time, source chips and "How I got this" (retrieved
  nodes, compliance then vs now). Refusals have one distinct look. Errors are specific: Ollama
  unreachable, backend unreachable, or other.
- **Decisions (new):** a sortable, filterable register. Compliance then vs now loads when a row is opened.
- **Policies (new):** a read-only view of versions and clauses, with a side-by-side comparison of a
  clause's fields across versions.
- **Audit Trail:** server and browser verification side by side. Every row is covered: the UI pages
  `/audit` by `after_id`. Linked parent-hash highlighting, filters, JSON/CSV export, and a row drawer with
  the canonical hashed payload. A dev-only tamper simulation runs on an in-memory copy
  (`VITE_DEV_TAMPER=1`).
- **Everywhere:** Ctrl/Cmd+K search. ID chips open their record. Each entity type has one colour and icon.
  Restricted items are hidden in lists for users outside `RESTRICTED_READERS`.

### Tests
- `node --test "src/**/*.test.js"`: formatters (₹ post-processor, timestamps, clause references) and the
  graph layout.
