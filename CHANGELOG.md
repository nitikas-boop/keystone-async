# Changelog

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
