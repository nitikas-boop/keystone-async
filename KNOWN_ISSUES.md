# Known issues

Found during the frontend pass on branch `frontend-rework` (29 Sept 2026). That pass changed only the
frontend, so the backend issues below are **recorded, not fixed**. Each has the evidence and the smallest fix.

## Backend

### 1. MCP `propose_action` fails with HTTP 500
`POST /proposals` (`backend/app/main.py`, `create_proposal`) writes an audit row with action `'proposed'` and
actor `f'{who}:mcp'` (e.g. `user:priya:mcp`). Both break the `audit_log` CHECK constraints in
`backend/sql/init.sql`:

- `action` must be one of `query, flag_created, action_proposed, approved, rejected, executed, edited,
  extraction_reviewed, policy_ingested`, and `'proposed'` is not in the list.
- `actor` must match `^(user:[a-z0-9_.-]+|system:scanner|system:watcher|executor)$`, and the colon in
  `user:priya:mcp` does not match.

The INSERT is in the same transaction as the proposal, so the whole call rolls back and the MCP client gets a
500. Confirmed by running the same INSERT inside a transaction that was then rolled back:
`ERROR: new row for relation "audit_log" violates check constraint "audit_log_action_check"`. No backend
test covers `POST /proposals`. The MCP server still lists all 7 tools, and its 6 read tools work.
**Fix:** audit with action `action_proposed`, actor `who`, and `{'via': 'mcp'}` in the payload. Add a test.

### 2. Restricted items are returned by list endpoints to every user
§6.11 of the reference says list views hide restricted items unless `include_restricted=true`. Only
`/graph/view`, `/timeline`, `/projects/{id}/timeline` and `/nodes/{id}/source` do that. These do not:

| Endpoint | What leaks (seed data, as `X-User: priya`) |
|---|---|
| `GET /graph` | `DEC-008` and `MTG-2025-08-12-DEC-008` nodes and their edges (restricted) |
| `GET /decisions` | `DEC-008`, `MTG-2025-08-12-DEC-008` with full attributes and reasons |
| `GET /extractions` | rows 8–15 from the restricted `MTG-2025-08-12`, including the source quote |
| `GET /flags`, `GET /proposals` | no visibility filter (no restricted rows in the seed, but none would be hidden) |
| `GET /audit` | `source_ids` of the extraction reviews name `MTG-2025-08-12-DEC-008` |
| `GET /documents/{id}` | returns the raw text of `DEC-008` and `MTG-2025-08-12` (HTTP 200) |

Retrieval for `/ask` *is* filtered: Priya's question about DEC-008 is refused correctly.

**What the frontend does now:** the graph uses `/graph/view` (server-filtered). The Decision register,
Ingestion Review, flags, proposals and audit source IDs are filtered in the browser for users outside
`RESTRICTED_READERS`. The frontend mirrors that list in `src/utils/people.js` because no endpoint reports it.
That hides the items **on screen only**: the data is still in the HTTP responses (visible in dev tools).
Checked on 30 Sept with the seed restored, signed in as Priya. A script read the rendered text, titles and
aria-labels of all seven screens, the reviewed-history toggle, every audit-row drawer, and Ctrl+K searches
for "008", "anonym" and "access". It found no `DEC-008`, `MTG-2025-08-12`, or restricted titles or quotes.
**Fix:** apply `_visible()` in those endpoints, keyed on the `X-User` header, and expose a `GET /me` with the
reader flag.

### 3. `GET /audit` returns at most 500 rows per call
`limit` is capped at 500 (`min(limit, 500)`). The endpoint does page with `after_id`, so the frontend follows
the cursor and the browser check covers every row. Any other client that calls `/audit` once sees only the
first 500. **Fix:** document `after_id` paging or return a `next_after_id`.

### 4. `GET /decisions/{id}/compliance` makes one model call per check
`compliance.evaluate(..., explain=True)` asks the local model to word every clause check (then and now):
about 3.3 s for DEC-004. A register that loaded compliance for every row would take tens of seconds. The
frontend therefore loads it only when a decision is opened. **Fix:** accept `?explain=false` (the function
already supports it) for list use.

### 5. Model-worded amounts use Western digit grouping
`scanner.explain_flag` and `compliance.evaluate` pass raw integers (500000) to the model, which writes
"₹500,000". The seeded DEC-004 flag and proposal text already contain this. The frontend rewrites
₹-prefixed numbers to Indian grouping for display (`src/utils/format.js`, `fixRupees`). The stored text is
unchanged. **Fix:** pass pre-formatted amounts (`₹5,00,000`) in the prompt facts.

### 6. The audit log stores only `payload_hash`
The payload itself is not stored, so a proposal's rejection reason is recorded only as a hash and cannot be
shown again. The UI says "reason recorded (hash …)". **Fix (schema change, not done):** store the canonical
payload next to its hash. It is not part of the row hash, so the chain would be unaffected.

### 7. A reviewer-added fact loses its document's visibility
`extract.add_edge` inserts the extraction row without a `visibility` column, so it gets the default `'org'` even
when its source node and document are restricted. In the seed, extraction #16
(`MTG-2025-08-12-DEC-008 RELIED_ON RET-2.1@v2`) is `org` while its document `MTG-2025-08-12` is restricted.
The frontend hides it by also checking the row's document and node. **Fix:** copy `p.get('visibility')`
into the INSERT.

### 8. `human_verified` is set to false when an extraction is rejected
`extract.review` sets `human_verified = decision != 'reject'`, so a fact a human rejected reads as "not
verified". The UI shows "reviewed · rejected · by <name> · <time>" from the audit log instead.

### 9. `GET /answers/{id}` has no visibility filter
Anyone who knows an answer ID gets the stored response, including answers that cite restricted records
(an answer Ananya got about `DEC-008` opens for any `X-User`). Answer IDs are random UUIDs, but the new
"Copy link" button (`#answer=<id>`) makes them easy to share. **What the frontend does now:** before showing a
linked answer to a user outside `RESTRICTED_READERS`, it checks every cited and retrieved ID against the
restricted set and shows "That answer is not available to you" instead. On screen only, as in #2.
**Fix:** check the stored response's node IDs against `_visible()` for the `X-User`, and return 404 when any
is hidden.

### 10. Decisions and meeting notes are ingested without an audit row
`ingest._ingest` audits `policy_ingested` for policy versions only. A decision recorded from the new form
(or uploaded as Markdown), and a meeting note, are stored with no `audit_log` entry; only the later review
of a meeting note's extracted facts is audited. The decision page therefore shows no "recorded" block for
them. **Fix:** audit `decision_ingested` / `meeting_ingested` with the document's sha256, as for policies
(needs the action added to `audit_log_action_check`).

### 11. `POST /documents` replaces an existing document with the same ID
The insert is `ON CONFLICT (id) DO UPDATE`, so uploading `DEC-004.md` with other content silently rewrites
`DEC-004`. The upload dialog warns and needs a tick before re-uploading a known ID, and the authoring forms
refuse an ID or policy version that already exists. A multi-file upload skips files whose ID exists unless
that file is ticked. **Fix:** reject
a changed document for an existing ID unless the request says it is a replacement.
