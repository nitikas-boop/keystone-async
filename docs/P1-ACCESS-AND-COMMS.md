# Person 1: access, identity and comms (branch `rudra-split1`)

Features A (identity, org, login), B (roles and access filter), G (MCP and plugins), E (messaging and notifications)
and H (phone pairing and approval), built on the Commit 0 contract. No contract signature changed.

## Run it

```
docker compose exec postgres sh /docker-entrypoint-initdb.d/migrate.sh   # applies sql/p1/*.sql to both databases
docker compose restart backend executor
docker compose exec backend python -m pytest -q tests                     # full suite
docker compose exec backend python -m pytest -q tests/test_p1_*.py        # Person 1 only
```

From Git Bash, prefix the first command with `MSYS_NO_PATHCONV=1`.

On an empty `organizations` table the backend seeds the synthetic Nimbus Ledger org (id = `GROUP_ID`, so it owns the
existing graph), three teams and nine users. Employee IDs: NL-000 Nitika (owner), NL-001 Ananya (owner), NL-003 Priya
(Operations lead), NL-004 Farhan (compliance), NL-005 Divya and NL-006 Rohit (Engineering members), NL-007 Sneha
(Operations member), NL-008 Karthik (Engineering lead), AUD-001 Meera (auditor, 2025 only). Password and join code:
`DEMO_PASSWORD` and `DEMO_JOIN_CODE` in `.env.example`.

## What each part does

| | Where | Notes |
|---|---|---|
| A | `identity.py`, `routers_p1/auth.py`, `routers_p1/org.py` | Argon2 passwords, HS256 JWT in an HTTP-only cookie (MCP gets it as a Bearer token). Register org, join with code (pending until an owner or lead approves), code rotate / disable / expiry / max uses, hashed, per-IP rate limits. `on_login` fires in the background after sign-in. |
| B | `access.py`, `contracts/__init__.py`, `graph.py`, `retrieval/graphiti.py`, `views.py`, `routers_p1/access.py` | One `can_access`. Filtering happens in `graph.read`/`neighbours` and in retrieval ranking, so hidden nodes never reach a prompt. Every route except sign-in and `/health` needs a session. Grants, relabelling (org / team / restricted), people cards, `restricted_view` audit. `include_restricted` is ignored. |
| G | `plugins/`, `routers_p1/plugins.py`, `mcp/keystone_mcp.py`, `mcp/keystone_comms.py` | Both MCP servers sign in as a user and get an agent session that cannot approve. YAML rule packs (`plugins/rulepacks/`) with an on/off switch; `contracts.load_rules(org_id)` returns the enabled rules. |
| E | `comms.py`, `routers_p1/chat.py`, `routers_p1/actions.py`, `executor.py` | #general, one channel per team, group channels, DMs (not even the owner can read them). @mentions, `@keystone` (answers with what every channel member may see), cards that show "Restricted item", "Save as meeting note" into Ingestion Review, bell. Agent actions (`ping_user`, `send_dm`, `post_to_channel`) are proposals; a person approves; the executor delivers. |
| H | `routers_p1/devices.py`, `src/features/p1/PairClaim.jsx`, `MobileApprove.jsx` | 60-second one-time QR token, device sessions (30 days, revocable), linked-devices list, `device_paired` audit, phone approval screen. Push and passkeys not built (no trusted certificate). |

Frontend: `src/features/p1/` (sign-in, Chat, Agent actions, Organisation page, bell, phone screens) and `src/api/p1.js`.
`LandingPage.jsx` lost its persona picker; its buttons open the real sign-in.

Audit events added beyond the agreed list: `org_created`, `join_rejected`, `code_changed`, `member_removed`,
`access_changed`, `access_revoked`, `device_revoked`, `plugin_enabled`, `plugin_disabled`, `thread_saved`,
`notification_sent`, `agent_message_failed`; approvals of agent actions use `approved` / `rejected` / `edited` with
object type `proposed_action`.

## For Person 2 at merge

- `reasoning.py` still drops restricted nodes by the old `RESTRICTED_READERS` list. Retrieval is filtered per user
  now, so that check is redundant and wrong for grants (a granted member is still dropped). Delete it.
- `ingest.py` and `scanner.py` query `config.GROUP_ID`; use `graph.gid()` so a second org's uploads land in its own
  partition. Stamp `contracts.label_for(front_matter)` onto nodes (team, project) so team-scoped items produced by
  extraction are visible to their team; chat notes are relabelled after ingestion until then.
- The knowledge tables (`documents`, `policy_clauses`, `flags`, `proposals`, `extractions`) have no `org_id`. They
  are treated as the default org's; `/policies` is unfiltered and a second org uploading `DEC-004` would overwrite
  Nimbus's row. Add `org_id` to their keys before multi-org is demoed.
- Tests: send `X-User` (the test backend runs with `KEYSTONE_DEV_AUTH=1`). A request with no credentials reads as the
  Commit 0 demo owner there; it can never write.
- `Dashboard.jsx` fetches `/audit` for every role; leads and members now get a 403 toast.

## Phone on the LAN

The backend port is bound to 127.0.0.1 in `docker-compose.yml`. For a real phone: publish 8000 on the LAN (an
untracked `docker-compose.override.yml`), run Vite with `--host`, add the laptop's address to `CORS_ORIGIN_REGEX`, and
open the app by that address before pairing. Camera scanning inside the app needs HTTPS; the phone's own camera app
opening the QR link works over plain HTTP.
