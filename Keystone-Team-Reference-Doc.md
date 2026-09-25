# Keystone — Team Reference Doc

**Working reference · written 25 Sept 2026 · supersedes every earlier draft of this document.**
Team: minty jamun · ASYNC'26 Track 1 (Sovereign AI) · Ramaiah Institute of Technology

This is the single source of truth for the build. Where this document and any older draft disagree, this document wins. Where this document and the **submitted deck** (`keystone-mintyjamun.pptx`) disagree, the deck wins on what we promised judges, and this document records how we deliver it.

---

## 0. Where we are

| Milestone | Date | Status |
|---|---|---|
| Idea submission (deck only) | 22 Sept 2026 | **Done** — 6 slides on the official template, submitted |
| Guided build phase, with mentors | 22–28 Sept 2026 | **In progress — 4 days left including today** |
| Final build, on campus, 24 hours | 30 Sept – 1 Oct 2026 | Upcoming |

Two things still need an answer from the organizers (ask on Discord today, write the answers here):

1. Is code written during the guided phase allowed in the final submission, or must the 24 hours start from an empty repo?
2. Does pre-written synthetic data and configuration count as pre-built work?

If the answer to (1) is "start clean", the guided phase becomes rehearsal: we write the dataset, pin the environment, prove every risky step once, and then re-type fast during the 24 hours. Plan for that answer.

---

## 1. What Keystone is — the one-paragraph version

**Keystone is temporal decision intelligence for organizations.** It records the decisions an organization made, why it made them, which rule was in force at that moment, and it raises a flag when a rule changes in a way that affects a past decision. It runs entirely on the organization's own hardware, and no agent action executes until a human approves it.

The sentence to lead with:

> "A decision was correct when we made it. The rules changed. What happens now?"

**What Keystone is not, and we should never say it is:**

- Not "a sovereign second brain" — that is the competition's category, not our product definition. It tells a judge nothing.
- Not "AI compliance for any regulation." We answer questions about **machine-checkable clauses** (a number, a threshold, a period). Open-textured clauses go to a human, by design.
- Not a claim that we invented temporal graphs, context graphs, RAG, MCP, human approval, or knowledge graphs. All of these exist.

**What we actually claim as ours:** a policy/decision ontology with clause-level linking, a deterministic compliance check evaluated against the clause version valid on the decision date, a policy-impact scanner that re-runs that check when a policy changes, and a structurally enforced approval gate with a tamper-evident audit trail. That combination, self-hosted, aimed at small regulated teams, is the claim that survived searching.

---

## 2. The official brief and how we cover it

**The challenge:** individuals and organizations need to run intelligent systems without handing their data, knowledge and operational context to a third party — a system that privately understands an organization's knowledge, remembers what it learns, reasons across it, and safely executes tasks.

**The five stages:** Data → Knowledge → Memory → Reasoning → Action. Most teams stop at stage 2–3. Our demo reaches stage 5, which is where the points are.

**Coverage of the nine "what could you build" bullets.** Judges tick these mentally. Show them, and be honest about depth — claiming "Full" on something thin is how you lose the room.

| # | Official bullet | How Keystone covers it | Depth in MVP |
|---|---|---|---|
| 1 | Open-weight/local models for private inference | Ollama serving open-weight models for extraction and answers; local embeddings | Full |
| 2 | Personal or organizational knowledge base | Postgres document/chunk store + the temporal graph | Full |
| 3 | Persistent long-term memory | The temporal graph itself is the long-term memory | Full |
| 4 | Semantic, keyword or graph retrieval | Graphiti hybrid retrieval: embeddings + BM25 + graph traversal | Full |
| 5 | Automatic ingestion of documents | Manual upload plus a polling folder watcher on the vault | Full, shallow — say "polling, not event-driven" |
| 6 | Connections between people, projects, concepts, decisions | The core of the product | Full — differentiator |
| 7 | Agentic tool execution via MCP | Keystone exposes an MCP server (read tools + one propose-only write tool); one gated action | Partial — say so |
| 8 | Controlled execution, reviewed and audited | Review queue + separate executor + hash-chained audit log | Full — differentiator |
| 9 | Local-first / self-hosted | One `docker compose up` | Full |

We do **not** use Mem0 or Letta. Conversational context is the last 4–6 chat turns held in the prompt. Two memory systems is a question we would have to answer and gain nothing from.

---

## 3. The problem

**The story to tell — one person, not two abstractions:**

> Priya joins a small fintech as ops lead. In her first week an auditor asks whether a ₹4 lakh vendor contract signed fourteen months ago followed the procurement policy. The person who signed it has left the company, and the policy has changed since. Today that is two days of email and PDF archaeology. With Keystone it is one question.

**The root cause:** organizations have no persistent, time-aware record connecting decisions to the context that justified them at the time. A document store can't fix it, because documents don't version themselves against each other. A person's memory can't fix it, because people leave. What is missing is a system that treats *"what was true when this happened"* as a queryable fact.

**Who feels it:** ops and compliance leads at regulated 10–50 person startups; their new hires; the auditors who ask.

**What a "decision" means here** — extraction quality depends on having a definition:

> A decision is a recorded choice between options, with an owner, a date, and at least one stated reason.

Anything below that bar is stored as a note, not a decision node. And because real notes are messier than that ("let's keep the logs for about six months, subject to compliance sign-off"), every extracted decision passes through a human review screen before it counts. **Keystone is AI-assisted institutional memory, not automatic organizational truth.** Saying that first is stronger than being caught on it.

**Evidence discipline:** we have no survey data. Either quote real people ("we spoke to four startup ops leads; all four said…") or use no numbers at all. Do not invent a statistic about hours lost.

---

## 4. Market research — verified claims and safe wordings

We searched the space before claiming novelty. Claiming "nobody does this" in front of judges who know the field is how a pitch dies.

| Claim | Verdict | Wording that is safe to say out loud |
|---|---|---|
| Foundation Capital: context graphs are AI's trillion-dollar opportunity | **Verified.** Published 22 Dec 2025 by Jaya Gupta and Ashu Garg; defines a context graph as a living record of decision traces across entities and time, so precedent becomes searchable | "Foundation Capital, December 2025: context graphs — systems of record for decisions — are AI's trillion-dollar opportunity." |
| Gartner: over 50% of AI agent systems will use context graphs by 2028 | **Verified via secondary sources only** — the report is paywalled | Keep the number, attribute it as widely reported. Do not add "for guardrails, observability and audit trails" — that phrasing is unconfirmed. |
| A near-identical project called DecisionGraph exists with no policy versioning | **Wrong as stated.** At least two public projects use the name. One is a hackathon build with an explicit approval gate and revalidation when upstream evidence changes. The other stores decisions *and policies* as linked Markdown with MCP integration | "Existing projects track decisions or gate actions. None we found answer *was this compliant under the policy version in force at that time* from bi-temporal edges." |
| Obin AI: funded, ex-JPMorgan and ex-Google founders, March 2026 | **Verified.** Emerged from stealth 18 Mar 2026, \$7M seed led by Motive Partners. CEO Apoorv Saxena, JPMorgan's former head of AI; CTO Valliappa Lakshmanan, ex-Google. Institutions retain ownership of models, data and IP | "Obin AI (\$7M seed, March 2026) sells governed AI agents to large financial institutions." |
| Obin builds "persistent compliance memory" and says Palantir AIP, Bloomberg AI and Kensho don't accumulate compliance intelligence | **Misattributed — never say this.** That framing comes from a third-party blog by a memory-tool company, not from Obin. Obin positions itself as an agentic workforce for finance | Say nothing about Palantir, Bloomberg or Kensho. A judge who checks will catch it. |
| "Domain Intelligence Engines" with a five-element audit trail | **Weak.** Sphere Inc. describes a five-*layer* "Company Brain" with citations and preserved access controls; the page is on a preview domain | "Enterprise vendors already sell cited, access-controlled institutional-memory AI to professional-services firms." Drop any element count. |

**Competitors to know even if they don't go on a slide:**

- **Zep** — the company behind Graphiti — sells hosted agent memory on the same temporal graph we build on. Answer: Zep is a memory layer for agents; Keystone is an end-user product with a compliance model and review queue on top.
- **Neo4j's open-source agent-memory work** targets the same context-graph idea.
- **ADRs, Notion, Confluence, Google Workspace AI search** — the free alternatives small teams already use. They find what was written; none of them say which rule applied on a past date, or tell you a decision has gone stale.

**Honest framing of our innovation:** an already-validated enterprise thesis, applied to a segment nobody funded is serving, as an open self-hostable build — combining decision memory, clause-level policy versioning and a hard approval gate on the exact stack the organizers listed.

**Never say:** "almost nobody builds approval gates", "no one does decision graphs", "nothing like this exists", or "Graphiti is our innovation".

---

## 5. Differentiation table (this is the one on the deck)

| Capability | Keystone | Drive + RAG chatbot | ADRs / Notion logs | Obin AI, Sphere |
|---|---|---|---|---|
| Names the policy version in force on a past date | Yes | No | No | Yes |
| Links a decision to a clause version, not a document | Yes | No | No | Partly |
| Flags past decisions when a policy changes | Yes | No | No | Partly |
| Ships the product: UI, review queue, audit log | Yes | Chat only | No | Yes |
| Self-hosted, open, affordable at 10–50 people | Yes | Yes | Yes | No |

Note for whoever presents: the Obin/Sphere column is a category judgment from their public positioning, not a tested claim. If asked "how do you know Obin can do that?", say exactly that — we assume the funded enterprise products can, and we compete on accessibility, not on out-building them.

---

## 6. Architecture

Everything runs on the organization's own server or VPC. One `docker compose` stack: FastAPI, Postgres, Neo4j Community, Ollama, the Next.js frontend, the executor.

### 6.1 The two stores, and what each is for

- **Neo4j Community + Graphiti** — entities, relationships, validity time, retrieval. Graphiti runs hybrid retrieval (embeddings + BM25 + graph traversal) inside the graph database, so **it is our search layer**.
- **PostgreSQL** — records and accountability: original documents and chunks (so every citation opens the exact source passage), the review queue, the audit log, users, policy metadata, extraction provenance.

**We are not using pgvector as a retrieval layer.** Two competing vector searches is work we don't need and a question we can't answer cleanly. The deck's architecture slide shows pgvector holding semantic chunks; the honest live version of that line is: *"Postgres holds the documents and chunks behind every citation; retrieval runs in the graph."* If someone asks why two databases: **graph for meaning and time, relational for records and accountability.**

Backend choice is settled: **Neo4j Community Edition.** It is Graphiti's best-documented backend and its browser is the better debugging tool. FalkorDB is the fallback only if Neo4j's memory footprint fights the local model on the demo machine. **Do not switch mid-build.**

### 6.2 Ontology (typed entities passed to Graphiti)

```
Person        ─MADE_BY(reverse)→      Decision
Decision      ─ABOUT→                 Project
Decision      ─RELIED_ON→             Clause@PolicyVersion
Decision      ─JUSTIFIED_BY→          MeetingNote | Document
Decision      ─SUPERSEDES→            Decision
Clause        ─BELONGS_TO→            PolicyVersion
PolicyVersion ─SUPERSEDES→            PolicyVersion
Flag          ─AFFECTS→               Decision
Flag          ─CAUSED_BY→             Clause@PolicyVersion
```

Every edge carries **valid time** (when the fact was true in the world) and **ingestion time** (when we learned it). That bi-temporality is what lets an "as of" query work at all.

### 6.3 Where the dates come from — the single most dangerous bug

Graphiti timestamps each ingested episode with a reference time. **If we ingest everything on 1 October, every fact looks like it became true on 1 October, and every "at the time" answer is silently wrong while looking confident.**

Rules, non-negotiable:

- Every source file carries YAML front-matter with its real date (`effective_from`, `decided_on`, `meeting_date`).
- The ingestion pipeline passes that date as the episode reference time. Never `datetime.now()`.
- Ingest in chronological order.
- **Policy version validity comes from metadata, never from the model.** We do not ask an 8B model to guess when a policy took effect.
- A smoke test that must pass before anything else: ingest two documents dated a year apart, query "as of" a date between them, confirm only the earlier one is visible.

### 6.4 Policies are clauses, not documents

A policy is not one fact. Store `PolicyVersion → HAS_CLAUSE → Clause`, each clause with a stable ID (`RET-2.1`) and **structured fields** where the text allows it:

```yaml
clause_id: RET-2.1
title: Customer log retention
text: "Customer activity logs shall be retained for no longer than 180 days."
fields:
  retention_days_max: 180
checkable: true
```

Clauses whose meaning is open-textured — *"personal data may be retained only as long as necessary for the purpose for which it was collected"* — get `checkable: false`. They are still stored, still cited, still shown to the user, but they are never machine-evaluated. The compliance checker returns **`not_checkable`** and routes to a human.

That third answer state matters. It is what makes the compliance claim honest, and it is a better answer to "what about vague policies?" than any hedge.

### 6.5 Compliance check (deterministic, not model judgment)

For a decision `D` and each clause it relied on:

1. Resolve the clause version whose validity window contains `D.decided_on`.
2. Look up a comparison rule for that clause's structured field (`retention_days <= retention_days_max`, `amount_inr <= approver_threshold_inr[approver_role]`).
3. Return one of: `compliant`, `non_compliant`, `not_checkable`.
4. The local model is used **only** to write the human-readable explanation, citing both the decision and the clause version.

Deterministic first, model second. It is more reliable, and it is the answer to "what if it hallucinates a conflict?"

### 6.6 Policy impact scanner (not "contradiction detection")

When a new PolicyVersion is ingested:

1. Diff the structured clause fields against the previous version.
2. Find active decisions with `RELIED_ON` edges to the changed clauses.
3. Re-run the deterministic check against the new version.
4. Classify the result (below).
5. Write a `Flag` node, a review-queue item, and an audit row.

**"Contradiction" is too blunt a word — these are five different things and the UI should say which:**

| Type | Meaning | Example in our data | Severity |
|---|---|---|---|
| `ONGOING_PRACTICE_BREACH` | The decision creates a continuing practice that the new rule no longer allows | 180-day log retention vs a new 90-day cap | Action needed |
| `RULE_CHANGED_SINCE` | A completed one-off act that would need different approval today; not retroactively wrong | ₹4 lakh contract signed under the old ₹5 lakh threshold | Informational |
| `SUPERSEDED` | A later decision replaced this one | The 300-day retention decision replaced by the 180-day one | Historical |
| `EXCEPTION` | A waiver or scoped exemption applies | Not modelled — out of scope | — |
| `DECISION_CONFLICT` | Two active decisions disagree with each other | Not modelled — out of scope | — |

Call the feature **Policy impact** in the UI. It is more accurate than "contradiction detection", and the distinction between a breach and an informational change is a point in our favour, not a hedge.

### 6.7 Answering rules

- Every sentence in an answer cites a source ID. Uncited claims are rejected and regenerated once.
- If retrieval returns nothing above the relevance threshold, the answer is **"I have no recorded decision about that"** — never a guess. We demo this deliberately.
- Every answer renders with the graph subgraph it came from and an "as of" date control.

### 6.8 Provenance on every extracted fact

This is the fix for the biggest technical risk in the whole project. Every node and edge the extractor produces carries:

| Field | Example |
|---|---|
| `source_doc` | `meeting-notes/2025-05-14.md` |
| `source_span` | character offsets, plus the quoted sentence |
| `confidence` | 0.0–1.0 from the extraction pass |
| `extracted_by` | `qwen3:14b` / `human` |
| `human_verified` | `true` / `false` |
| `visibility` | `org` / `restricted` |

The UI shows the quoted source sentence next to every extracted fact. A wrong answer then becomes visibly a wrong *extraction*, which a human fixes — instead of a confident sentence with nothing behind it. Nothing with `human_verified: false` and low confidence should be used in a compliance answer without a visible warning.

### 6.9 The approval gate is structural, not polite

```
Local LLM ──writes──▶ proposal row (status: proposed)
                            │
                     human clicks Approve  (status: approved)
                            │
                     executor process ──▶ MCP tool ──▶ outbox/
                            │
                     audit log (hash-chained)
```

The model never holds credentials and never calls a tool. A separate executor process polls for rows with `status = approved` — a status only a human can set through the UI — and calls the MCP tool. The sentence to say in the demo:

> "The model physically cannot execute. Only the executor can, and only on rows a human approved."

**The MCP surface, concretely** (this must exist as an artifact, not as a bullet):

- Keystone runs its own MCP server exposing `ask(question, as_of)` and `compliance_check(decision_id)` as read tools, so any MCP client can query the graph. That is brief bullet #7 from the other direction.
- One write tool, `draft_notification(to, subject, body)`, which **does not send anything**. It inserts a proposal row. The executor, after approval, writes an `.eml` file into `outbox/`.
- Real Jira/Gmail integrations are roadmap. Say so.

### 6.10 Audit log row

Append-only Postgres table. The application database user has `INSERT` and `SELECT` grants only — no `UPDATE`, no `DELETE`.

```
id            bigserial
ts            timestamptz (UTC)
actor         'user:nitika' | 'system:scanner' | 'executor'
action        'query' | 'flag_created' | 'action_proposed' | 'approved' | 'rejected' | 'executed'
object_type   'decision' | 'flag' | 'proposal' | 'answer'
object_id     text
source_ids    text[]
payload_hash  sha256 of the payload
prev_hash     sha256 of the previous row
hash          sha256(canonical_json(row without hash))
```

Genesis row has `prev_hash` = 64 zeros. A `verify_chain()` endpoint recomputes the chain and returns the first broken row.

Call it a **tamper-evident audit trail**. Do not call it "regulatory-grade auditability" — that would also require access control, key management, retention policy, backups and incident response, and a judge from a compliance background will know that.

### 6.11 Sovereignty checklist — verify each one, don't assume

Our headline is Sovereign AI. One dependency phoning home breaks it.

- [ ] LLM: local via Ollama
- [ ] **Embeddings: local** (`nomic-embed-text` or `bge-m3`). Graphiti defaults to OpenAI embeddings — if we don't set this explicitly, every document goes to a cloud API while we demo sovereignty. Configure on day one.
- [ ] **Telemetry: disabled.** Graphiti's MCP server collects anonymous telemetry by default and can be turned off. Turn it off and be able to point at the setting.
- [ ] Graph, database, executor, outbox: all local
- [ ] Network: run the demo with the machine's network off for one rehearsal, and confirm everything still works. That is the most convincing 20 seconds available to us.
- [ ] If a hosted model is used for extraction under time pressure: synthetic data only, and say so unprompted.

### 6.12 Data flow

```
Documents with date front-matter
        │
        ▼
Ingestion: chunk → local LLM extraction → provenance fields
        │
   ┌────┴─────────────────────────┐
   ▼                              ▼
PostgreSQL                  Graphiti / Neo4j
docs, chunks, queue,        entities, relations,
audit, provenance           valid time
   │                              │
   │        ┌─────────────────────┤
   │        ▼                     │
   │   Policy impact scanner      │
   │        │                     │
   └────────┼──────────┬──────────┘
            │          ▼
            │   Retrieval (hybrid + as-of filter)
            │          │
            │          ▼
            │   Compliance engine (deterministic)
            │          │
            │          ▼
            │   Local LLM: cited answer / explanation
            │          │
            │     ┌────┴────┐
            │     ▼         ▼
            │  Answer    Proposal row
            │  + graph       │
            │                ▼
            │          Review queue → human approves
            │                │
            │                ▼
            └────────▶ Executor → MCP tool → outbox/ → audit log
```

---

## 7. The dataset — "Nimbus Ledger"

A synthetic 7-person Bengaluru fintech. Synthetic data is normal at this stage; be upfront about it if asked, and say real data is the first step after the hackathon.

**Format rule:** every file is Markdown with YAML front-matter. It works in Obsidian, it parses trivially, and it puts the dates where the ingestion pipeline needs them.

### 7.1 People

| ID | Name | Role | Joined | Left |
|---|---|---|---|---|
| `p-ananya` | Ananya Rao | CEO | Jan 2024 | — |
| `p-vikram` | Vikram Shah | CTO | Jan 2024 | **Aug 2025** |
| `p-priya` | Priya Menon | Ops lead | **May 2026** | — |
| `p-farhan` | Farhan Qureshi | Compliance lead | Mar 2024 | — |
| `p-divya` | Divya Nair | Engineer | Feb 2024 | — |
| `p-rohit` | Rohit Kulkarni | Engineer | Jun 2024 | — |
| `p-sneha` | Sneha Iyer | Analyst | Sep 2024 | — |

Vikram leaving is the knowledge-loss story: he owns the two most interesting decisions. Priya joining in May 2026 is the newcomer who asks.

### 7.2 Policy A — Customer Data Retention (`POL-RET`)

| Version | Effective from | Clause RET-2.1 (`retention_days_max`) |
|---|---|---|
| v1 | 2024-01-15 | 365 |
| v2 | 2025-01-06 | 180 |
| v3 | 2026-09-28 | **90** — uploaded live during the demo |

Also carries `RET-4.2`, an open-textured clause with `checkable: false`, so the `not_checkable` path has something real to hit.

### 7.3 Policy B — Procurement Approval (`POL-PROC`)

| Version | Effective from | Clause PROC-3.1 |
|---|---|---|
| v1 | 2024-01-15 | CTO may approve up to ₹5,00,000; above that, CEO sign-off |
| v2 | 2025-07-01 | CTO may approve up to ₹2,00,000; above that, CEO sign-off |

Policy B carries the **point-in-time** story: the rule genuinely moved, so "what applied then" and "what applies now" give different answers. Policy A carries the **staleness** story: an ongoing practice that a new version breaks.

### 7.4 Decisions (10)

Front-matter on each: `decision_id`, `decided_on`, `owner`, `project`, `relied_on`, `status`, `effect` (`ongoing` | `completed`), structured `fields`, `reasons` (prose), `source`.

| ID | Date | Owner | Decision | Relied on | Role in the demo |
|---|---|---|---|---|---|
| DEC-001 | 2024-03-12 | Vikram | Adopt an Obsidian vault for internal notes | — | Context |
| DEC-002 | 2024-07-22 | Ananya | Retain customer logs 300 days | RET-2.1 @ v1 (365) | Compliant then; **superseded** by DEC-007 |
| DEC-003 | 2024-11-05 | Vikram | Standardise on AWS Mumbai | — | Baseline for the switch |
| **DEC-004** | **2025-03-14** | **Vikram** | **Sign VendorCo contract, ₹4,00,000** | **PROC-3.1 @ v1 (≤ ₹5L)** | **Point-in-time hero.** Compliant when made; would need CEO sign-off today |
| DEC-005 | 2025-04-02 | Divya | Nightly encrypted backups | — | Supporting |
| **DEC-006** | **2025-05-20** | **Vikram** | **Move from AWS to an India-hosted cloud provider** | — | **"Why did we" hero.** Owner has since left; reasons: data residency + cost |
| **DEC-007** | **2025-06-18** | **Ananya** | **Reduce customer log retention to 180 days** | **RET-2.1 @ v2 (180)** | **Staleness hero.** Compliant exactly at the limit; `effect: ongoing`; v3 breaks it |
| DEC-008 | 2025-09-09 | Farhan | Quarterly access reviews | — | Context |
| DEC-009 | 2025-11-25 | Vikram's successor | Approve analytics tool, ₹1,80,000 | PROC-3.1 @ v2 (≤ ₹2L) | Shows the checker returning `compliant` after the rule changed |
| DEC-010 | 2026-02-10 | Divya | Standardise internal services on FastAPI | — | No clause applies — clean "nothing to check" |

### 7.5 Meeting notes (3, prose only, dated front-matter)

| File | Date | Contains |
|---|---|---|
| `2025-05-14.md` | 14 May 2025 | The cloud-provider debate that produced DEC-006 — the source the "why" answer must cite |
| `2025-06-11.md` | 11 Jun 2025 | The retention debate that produced DEC-007 |
| `2025-08-12.md` | 12 Aug 2025 | **A decision that is not in the decision log**: the team agrees to keep anonymised logs for 24 months. Extraction has to find this on its own, and the checker must return `not_checkable` because RET-2.1 covers customer logs, not anonymised ones |

That last one is deliberate. It proves the extraction pass does real work, and it demonstrates the honest refusal-to-judge path.

### 7.6 Ground-truth file

A JSON file listing every expected entity and edge, plus the exact expected answer to each demo query. It is three things at once: the extraction evaluation set, the regression test, and the answer key. **Write it at the same time as the dataset, not after.**

---

## 8. The demo

Four minutes, one story, run in this order. Every step below has been chosen to keep the live failure surface small.

| # | Step | What it proves |
|---|---|---|
| 1 | "Show the history of Project Atlas." | Graph traversal, ordered timeline with owners and reasons — not retrieval |
| 2 | "Why did we move off AWS in May 2025?" | Decision memory: owner (who has left), date, two reasons, cited meeting note, no later supersession |
| 3 | "Was the ₹4 lakh VendorCo contract approved correctly in March 2025?" | **Point-in-time compliance.** Answer: yes — PROC-3.1 v1, in force on 14 Mar 2025, let the CTO approve up to ₹5,00,000. Under today's v2 the same contract would need CEO sign-off |
| 4 | "Was keeping customer logs for 180 days compliant in Q2 2025?" | The as-of control. Answer: yes — RET-2.1 v2, in force from Jan 2025, capped retention at 180 days, and the decision sits exactly at that limit. Drag the date back to 2024 and the graph shows v1 (365) instead |
| 5 | **Upload Policy A v3 (90 days) live** | The scanner runs on ingest; a flag appears on DEC-007, classified `ONGOING_PRACTICE_BREACH`, citing both clause versions |
| 6 | Approve the proposed notification in the review queue | Stage 5, gated. The executor writes the `.eml` into `outbox/` |
| 7 | Show the audit rows and run `verify_chain()` | Tamper-evident trail: policy uploaded → flagged → proposed → approved by a named human → executed |
| 8 | "Why did we choose MongoDB?" | **"I have no recorded decision about MongoDB."** A deliberate clean refusal is one of the strongest trust signals available |

### 8.1 Shrink the live surface

Step 5 is the moment the whole pitch rests on, and full live ingestion is the most breakable path we have: PDF parsing, malformed JSON from a local model, embedding failure, duplicate entities, date parsing, timeouts.

So:

- **The graph is pre-built and snapshotted before the demo.** The live demo queries; it does not rebuild.
- **Policy v3 is a pre-written Markdown file with structured clause fields already in front-matter.** The live step is parse → deterministic clause diff → scanner → flag. No live LLM extraction on the critical path.
- If asked whether the graph was pre-built: *"Yes. Ingestion is the heavy step and we built the graph beforehand, exactly as a real deployment would on day one. Everything you're seeing query and flag is running live on this machine."* That is a good answer. Pretending otherwise is not.
- **Record a clean 3-minute backup video the moment the demo works end to end.** If the venue Wi-Fi, the laptop or the model fails, play it and keep talking. Non-negotiable.

---

## 9. Feature list

### The eight things that must work

If these eight work beautifully and nothing else exists, we have a strong project.

1. Upload a structured policy version
2. Upload decision and meeting-note documents
3. Build the temporal graph with correct valid time
4. "Why did we decide X?" → cited answer with owner, date, reasons
5. "Was it compliant when it was made?" → clause version in force on that date
6. Upload a new policy version
7. Automatically flag affected decisions, classified by impact type
8. Human reviews and approves a proposed action → audit record

### Must-have

- Ingestion with front-matter dates as reference time
- Entity + relationship extraction with provenance fields (§6.8)
- Clause-level policy versioning (v1/v2/v3, correctly timestamped)
- Deterministic compliance check with three outcomes
- Query interface with forced citations and the no-evidence refusal
- "As of" date control
- Policy impact scanner triggered on ingest of a new version
- Review queue: proposed / approve / edit / reject
- Executor + one MCP write tool writing to `outbox/`
- Append-only hash-chained audit log + read-only audit view
- Graph view of the subgraph behind an answer
- Ingestion review screen (accept / edit / reject each extracted fact)
- Polling folder watcher on the vault — *the deck's architecture slide claims it; it is ~30 lines. Build it, don't put it on the live demo path.*

### Should-have

- Extraction precision/recall measured against the ground-truth file
- Answer-correctness script over the demo queries, run after every change
- `visibility` field enforced as a simple retrieval filter (§11.3)
- Keystone's own MCP server exposing the read tools
- `verify_chain()` endpoint

### Roadmap (future slide only — do not build now)

Real Jira/Gmail MCP integrations · policy diff view · role-based access control · confidence and provenance shown per edge in the graph UI · Slack/Teams bot · multi-tenant hosting · Drive/SharePoint/Notion import · fine-tuned extraction model · event-driven ingestion · backup and restore of graph + audit log · pseudonymisation and erasure workflow

### Do not build, under any circumstance, until everything above is solid

Mem0 · Letta · real Slack/Teams/Jira/Gmail integrations · multi-tenancy · real authentication · fine-tuning · multiple graph backends · complex agent orchestration · autonomous execution

### Explicitly out of scope, as a design principle

**Fully autonomous action execution with no human approval.** We are deliberately never building this. It is a stated boundary, not a missing feature, and it is exactly what the brief's "controlled execution" bullet asks for.

---

## 10. Environment and setup

### 10.1 Models

Figures are approximate — verify on the Ollama library page before relying on them. The deck commits to a 14B-class model for extraction and an 8B for answers, so **confirm the hardware clears that today**.

| Role | Candidate | Rough memory | Pick it when |
|---|---|---|---|
| Extraction | Qwen3 14B | ~10–12 GB at 4-bit | Best machine has a 12 GB+ GPU or 32 GB unified memory |
| Extraction | gpt-oss-20b | ~16 GB | A 16 GB+ GPU is available |
| Answering | Qwen3 8B | ~6 GB | Any laptop with 16 GB RAM |
| Embeddings | `nomic-embed-text` or `bge-m3` | <1 GB | Always local, even if the LLM falls back |

Graphiti depends on structured JSON output and its own documentation warns that small local models frequently produce invalid output and break ingestion. Mitigations in order: the biggest model the best machine runs, Ollama's structured-output mode, offline pre-built graph, and — only if extraction still fails — a hosted model for **ingestion only**, over synthetic data, stated out loud.

### 10.2 Hardware

Postgres + Neo4j + an 8B model + a Next.js dev server need roughly 16 GB RAM together without swapping; the 14B extraction pass wants more. **Decide today whose machine is the demo machine**, and run the one-time ingestion on the strongest machine available.

### 10.3 Pinned and reproducible

The highest-value guided-phase deliverable is a stack that boots clean on someone else's laptop. Graphiti is moving quickly and its issue tracker has open items around MCP behaviour, local models and backends — **pin an exact version and do not chase updates during the build.**

- One `docker-compose.yml`, versions pinned for Neo4j, Postgres and the app image
- `requirements.txt` with pinned Graphiti, FastAPI and driver versions
- `.env.example` with every key, including the local embedder and the telemetry opt-out
- `make seed` — wipes and re-ingests the dataset in chronological order
- `make snapshot` / `make restore` — saves and restores the graph database
- Hardcoded auth is fine. Do not burn hours on real auth.

If a teammate breaks the graph at 3 a.m., restore must be one command.

---

## 11. ICP, business model, market

### 11.1 Who we sell to

**Wedge: early-stage Indian fintech and healthtech startups, 10–50 people.** This narrowing matters — it is the only segment where both halves of our demo land on the same buyer. They have startup-grade turnover (the knowledge-continuity pain) *and* real regulatory exposure (the compliance pain). Pitching "startups and labs and agencies" and then demoing a compliance query is a split story judges will notice.

**Expansion: compliance teams** in larger fintech, healthtech and legal, once the versioning and audit layer is proven.

Do not say ICP 1 has "no real incumbent". Notion, Confluence and Google Workspace all ship AI search over company docs, and ADR templates are free. The honest version: *"they can search what was written; none of them can say which rule applied on a past date, or tell you a decision has gone stale."*

### 11.2 Business model

Open-source core, self-hosted, free. Paid tier is **managed deployment inside the customer's own cloud account** — not "run it in our cloud", which would break the sovereignty promise we just spent four minutes making. Plus connectors, SSO and support.

The fair objection: why would a 10-person startup operate Neo4j + Postgres + Ollama + Keystone? Answer honestly — most won't operate it themselves, which is exactly what the managed-in-your-cloud tier is for. The open self-hosted core is what makes it adoptable without procurement.

**Market sizing:** bottom-up only — target orgs × realistic annual price, with a sourced count of Indian fintech/healthtech startups in the 10–50 employee band. If we don't have the source, leave the number off the slide. An invented TAM is worse than no TAM.

---

## 12. Legal, privacy and security — stated carefully

### 12.1 Data protection

India's Digital Personal Data Protection Rules were notified in November 2025 with a phased rollout; the principal obligations — notice, security safeguards, breach notification, data-principal rights — apply from May 2027.

Safe wording: *"India's DPDP framework is entering phased implementation, which raises the value of auditable data practices and records of what applied when."*

Do **not** say "every Indian startup has a compliance clock running to May 2027", and do **not** imply Keystone makes anyone DPDP compliant. It doesn't. It keeps records that help with governance.

Self-hosting **reduces** — not avoids — legal risk: it removes third-party transfer risk, but the organization is still the data fiduciary and still responsible for security.

### 12.2 Erasure and pseudonymisation

There is a real tension between an append-only audit log and a right to erasure, and we should raise it before a judge does.

Design: personal identifiers live in one lookup table keyed by pseudonymous ID; the graph and audit log store only the ID. Deleting the lookup row removes the person while the decision history stays intact.

But be precise about the limits: personal data can also sit in source documents, node summaries, edge properties, embeddings, backups and caches. Deleting one row does not erase all of it. So say:

> "We are designing the architecture to support pseudonymisation and a future erasure workflow."

Not: "we solve right to erasure." The deck's line — names behind pseudonymous IDs so erasure doesn't break history — is a *design* claim, and it is fine as long as nobody promises a working demo of it. It is in the roadmap, not the Must-have list.

### 12.3 Permissions — the honest gap

This is the largest missing piece for a real product, and we should be the ones to name it.

If an intern can ask "what did the CEO decide about the acquisition?", then *the AI remembers everything* becomes *the AI leaks everything*. For an organizational knowledge system, permission-aware retrieval is arguably as important as temporal retrieval.

What we do in the MVP: every document carries a `visibility` label (`org` | `restricted`), inherited by the nodes and edges extracted from it, and applied as a filter at retrieval. One flag, one filter — enough to show the mechanism is designed in rather than bolted on later.

What the full version needs, and what we say when asked: user → role → project and document permissions → graph visibility → answer, with source-level ACLs inherited from the originating document, so the system can know a decision exists without exposing the confidential board note behind it.

### 12.4 Scalability, honestly

- The bottleneck is **LLM extraction, not the database.** Ingestion cost grows with document volume. Mitigations: incremental ingestion, a cheap model to triage whether a document is decision-relevant at all, the big model only on the ones that are.
- A 50-person org producing a few decisions a week creates thousands of nodes a year — small for Neo4j. Scale is not our risk; extraction quality is.
- The MVP is **single-tenant.** Isolation would be one graph database per org, or Graphiti's `group_id` partitioning inside one database. Say "single-tenant today, isolated per graph by design" — not "per-tenant by construction".

---

## 13. Known limitations — name them before you're asked

Listing these costs nothing and buys credibility. Every one of them has a fair answer.

| Limitation | What we say |
|---|---|
| The graph is only as good as the extraction | Every fact carries its source sentence, confidence and an extracted-by/verified flag; every extraction passes a human review screen; we measure accuracy against a hand-labelled set |
| Open-textured policy clauses can't be machine-checked | We mark them `checkable: false` and return `not_checkable` rather than guessing. Structured clauses are checked deterministically |
| Precedence is more than version-at-time | Exceptions, waivers, grandfather clauses, department and regional policies, contractual overrides — real orgs have all of these. Not modelled in the MVP; the ontology has room for them |
| "Decision" is a narrow definition | Deliberately. Anything that doesn't meet it is stored as a note. Human confirmation is part of the design, not a gap |
| Permissions aren't enforced yet | A `visibility` filter exists; full RBAC and source-level ACLs are the first roadmap item |
| Erasure is partial | Pseudonymisation is designed; full erasure across documents, embeddings and backups is future work |
| Single-tenant | Isolation per graph is the scaling path |
| The data is synthetic | A 7-person fintech written to exercise the temporal cases. Real data is the first step after the hackathon |
| The audit log is tamper-evident, not regulatory-grade | Regulatory-grade also needs access control, key management, retention and incident response |

---

## 14. Reconciling with the submitted deck

The deck is what judges read. These four points differ from it; handle them as written.

| Deck says | Reality | How to handle it |
|---|---|---|
| "PostgreSQL + pgvector — semantic chunks: what is relevant" | Retrieval runs in Graphiti; Postgres holds documents and records | Narrate as: "Postgres holds the documents and chunks behind every citation; retrieval runs in the graph." Don't contradict the slide, complete it |
| "Vault watcher ingests new notes" | Folder-watch was roadmap | Build the polling watcher. It's cheap and it makes the slide true |
| "3 policy versions" | Three retention versions plus two procurement versions | The slide counts Policy A. Mention Policy B as the second compliance example — more than promised is fine |
| Priya "joins a 20-person fintech"; the seed org is 7 people | Illustrative story vs demo dataset | When telling the story live, say "a small fintech". Also say "the policy has changed since", not "changed twice" — Policy B has two versions in the data |
| "names sit behind pseudonymous IDs, so erasure never breaks history" | A design claim, not a built feature | Present it as design. Don't offer to demo it |

---

## 15. Build plan

### 15.1 Guided phase — 25 to 28 September

The 24 hours should be spent on integration, not on discovering that Neo4j won't start. Everything here is doable now and, if the organizers say guided-phase code can't carry over, everything here is still worth doing as rehearsal.

**Today, 25 Sept**
- [ ] Assign the four lanes to the four members by name (below)
- [ ] Ask the organizers the two questions in §0
- [ ] `docker compose up` brings up Neo4j CE + Postgres cleanly, versions pinned
- [ ] Ollama installed; pull the extraction and answer models; **confirm the demo machine can run a 14B-class model**
- [ ] Local embedder configured; Graphiti telemetry disabled
- [ ] Extraction smoke test: 3 documents → valid JSON → nodes in the graph

**26 Sept**
- [ ] Write the full dataset: 7 people, 5 policy version files, 10 decisions, 3 meeting notes
- [ ] Write the ground-truth JSON alongside it
- [ ] Custom ontology defined and passed to Graphiti as typed entities

**27 Sept**
- [ ] Ingestion pipeline with front-matter dates as reference time, chronological order
- [ ] **The as-of smoke test in §6.3 passes**
- [ ] Ingest the full dataset; `make snapshot` works; `make restore` works
- [ ] FastAPI skeleton, Postgres tables (documents, chunks, queue, audit, provenance)

**28 Sept**
- [ ] Deterministic compliance checker with the three outcomes, unit-tested against the ground truth
- [ ] Policy impact scanner + the clause diff, tested by adding Policy A v3 offline
- [ ] `/ask` endpoint returning a cited answer for demo queries 2 and 4

### 15.2 Final build — 30 Sept to 1 Oct, hours from start

| Hours | Graph + ingestion | Backend + API | Frontend | Reasoning + eval |
|---|---|---|---|---|
| 0–3 | Stack up, restore snapshot, verify as-of test | FastAPI + tables live | Next.js shell: chat + empty panels | Extraction and answer prompts loaded |
| 3–8 | Clause-level edges verified against ground truth | `/ask` wired to hybrid retrieval | Chat with citations panel | Forced-citation + refusal behaviour working |
| 8–12 | Provenance fields on every edge | Review queue + executor + hash-chained audit | Review queue with Approve/Edit/Reject | Compliance-at-time answers for queries 3 and 4 |
| 12–16 | Scanner wired to upload | `/upload` triggers the scanner; `verify_chain()` | Graph view + as-of date control | Flag explanation prompt, impact classification |
| 16–20 | Fix extraction misses; re-snapshot | Answer-correctness test script green | Audit log view; polish | Trick-question refusal; `not_checkable` path |
| 20–24 | **Feature freeze at hour 20.** Everyone: full demo run ×3, record the backup video, rehearse Q&A, one offline run with Wi-Fi off | | | |

### 15.3 Owners

| Lane | Owner | USN |
|---|---|---|
| Graph + ingestion | *(fill today)* | |
| Backend + API + audit | *(fill today)* | |
| Frontend | *(fill today)* | |
| Reasoning + prompting + eval | *(fill today)* | |

Team lead: Nitika Singh (1MS24CI084). Members: 1MS24CI001, 1MS24CI079, 1MS24CI084, 1MS24CI102.

---

## 16. Judge Q&A

Everyone on the team should be able to give these in one breath.

| Question | Answer |
|---|---|
| "Isn't this RAG with extra steps?" | RAG finds text. It can't answer "which rule was in force on 14 March 2025", because documents don't know when they stopped being true. Every fact in our graph carries validity time. |
| "How is this different from Zep or Graphiti?" | Graphiti is the temporal graph engine we build on — it's Zep's open-source project and we credit it. Keystone adds the policy-clause model, the deterministic compliance check, the impact scanner and the gated action layer. |
| "What's your actual innovation, then?" | Clause-level point-in-time compliance from a bi-temporal graph, with a structural approval gate — self-hosted, for teams that can't buy an enterprise product. |
| "What if the model extracts wrong facts?" | Every extracted fact shows its source sentence, confidence and whether a human verified it, and everything passes a review screen. Compliance runs on structured fields, not model judgment. We measure accuracy against a hand-labelled set. |
| "What if it hallucinates an answer?" | Every sentence cites a source; uncited answers are rejected. With no evidence it says so — we'll show that live. |
| "What about vague policy language?" | We mark those clauses unverifiable and return "not machine-checkable, routed to a human". We'd rather refuse than guess on a compliance question. |
| "Can the agent act without approval?" | No, structurally. The model can only write a proposal row. A separate executor acts only on rows a human approved, and every step is hash-chained. |
| "Is your audit log regulatory-grade?" | It's tamper-evident — hash-chained and append-only. Regulatory-grade also needs access control, key management and retention policy; that's roadmap, and we'd rather say so. |
| "Who can see what?" | Documents carry a visibility label that nodes inherit and retrieval filters on. Full role-based access control with source-level ACLs is our first roadmap item — for a knowledge system, permission-aware retrieval matters as much as temporal retrieval. |
| "Did you pre-build the graph?" | Yes — ingestion is the heavy step and a real deployment builds it on day one too. Everything you saw query, flag and execute ran live on this machine. |
| "Did you use a cloud model?" | *(State exactly what we did.)* Production is local by design. Embeddings and queries are local; if extraction used a hosted model it was over synthetic data only. |
| "Is the data real?" | No — a synthetic 7-person fintech with versioned policies, written to exercise the temporal cases. Real data is the first step after the hackathon. |
| "What happens when someone asks to be forgotten?" | Identifiers sit in one table behind pseudonymous IDs, so deleting that row removes the person without breaking the decision history. Full erasure across documents, embeddings and backups is designed, not built. |
| "Does this make us DPDP compliant?" | No. It keeps auditable records of which rule applied when, which is useful for governance. Compliance is the organization's, not ours. |
| "Why would a small startup run all this infrastructure?" | Most won't run it themselves — the open core is for those who will, and the paid tier is managed deployment inside their own cloud account. |
| "How does it scale?" | The bottleneck is extraction, not the graph. Ingestion is incremental, and each org gets an isolated graph. |
| "What's next?" | The same core — decisions linked to time-versioned context — generalizes to vendor-risk tracking, M&A due diligence, and audit prep for any regulated process. |

---

## 17. Risk register

Ranked by damage. The top five can sink the demo or the pitch.

| # | Risk | Why it matters | Fix | Where |
|---|---|---|---|---|
| 1 | Document dates not wired to episode reference time | Every "at the time" answer silently becomes "as of ingestion day" | Front-matter dates as reference time; chronological ingest; the as-of smoke test | §6.3 |
| 2 | Local model breaks Graphiti's JSON extraction | Ingestion fails mid-build | Biggest model available, structured-output mode, pre-built snapshot, hosted fallback for ingestion only | §10.1 |
| 3 | Bad extraction → confidently wrong compliance answer | More dangerous than ordinary hallucination, because the whole product sits downstream | Provenance and confidence on every fact, human review screen, deterministic checks on structured fields | §6.8 |
| 4 | Live ingestion on the critical path | The most breakable step is the demo's climax | Pre-built graph; v3 arrives pre-structured; live step is the deterministic scan; backup video | §8.1 |
| 5 | A factual error in a market claim | A judge who checks loses trust in everything else | Use only the safe wordings; never the Palantir/Bloomberg/Kensho line | §4 |
| 6 | Embeddings default to OpenAI | The sovereign demo quietly ships documents to a cloud API | Local embedder configured day one | §6.11 |
| 7 | Graphiti telemetry on by default | Same headline, same problem | Disable and be able to point at the setting | §6.11 |
| 8 | Graphiti presented as our innovation | Easy point for a judge who knows Zep | Credit it; claim the compliance layer | §1 |
| 9 | Approval gate described but not enforced | "Can the model bypass it?" | Separate executor; model never holds credentials | §6.9 |
| 10 | Permissions absent | "So anyone can read the CEO's decisions?" | Visibility filter in the MVP, RBAC named as roadmap, raised by us first | §12.3 |
| 11 | Pitch tries to explain the whole architecture | Judge leaves thinking "cool stack, what does it do?" | One story: the rules changed, what happens now | §8 |
| 12 | Wedge and demo point at different buyers | Story feels split | Regulated Indian startups of 10–50 — both pains, one buyer | §11.1 |
| 13 | No evaluation of extraction or answers | "How accurate is it?" has no answer | Ground-truth file, precision/recall, answer-correctness script. **Real numbers or no slide** — never placeholders | §7.6 |
| 14 | Over-claiming on DPDP, erasure, or audit grade | Each is an easy, specific attack | Softened wordings | §12 |
| 15 | Graphiti version drift mid-build | A working stack stops working | Pin the version; don't update during the build | §10.3 |

---

## 18. Outside review, 25 September

An external read of the project scored it roughly 7.8/10 overall: problem quality and demo potential strong (8.5–9), 24-hour feasibility and current scope discipline weakest (5.5–6). The verdict worth carrying into the build:

> The project should not be changed. It should be **narrowed**. The strongest Keystone is a policy-aware temporal decision memory, not a general-purpose sovereign second brain.

Every section above is written to that instruction.

---

## 19. Sources

- Foundation Capital — *Context graphs: AI's trillion-dollar opportunity* (22 Dec 2025): https://foundationcapital.com/ideas/context-graphs-ais-trillion-dollar-opportunity
- Atlan — Gartner on context graphs (secondary source for 50%-by-2028): https://atlan.com/know/gartner-context-graphs/
- DecisionGraph (Destr0yering) — hackathon project with approval gates and revalidation: https://github.com/Destr0yering/decisiongraph
- DecisionGraph (dg) — decisions and policies as linked Markdown: https://deepwiki.com/decisiongraph/dg
- PYMNTS — Obin AI raises \$7M: https://www.pymnts.com/news/investment-tracker/2026/obin-ai-raises-7-million-for-agentic-tools-for-financial-firms/
- BusinessWire — Obin AI emerges from stealth: https://www.businesswire.com/news/home/20260318899337/en/Obin-AI-Emerges-from-Stealth-to-Build-Agentic-Workforce-for-Financial-Institutions
- Obin AI: https://www.obin.ai/
- memU blog — third-party commentary, origin of the Palantir/Bloomberg/Kensho comparison (do not attribute to Obin): https://memu.pro/blog/obin-ai-financial-agentic-workforce-memory
- Sphere — institutional memory AI (preview domain, weak source): https://spw-pi.vercel.app/blogs/institutional-memory-professional-services
- Graphiti README — backends, structured-output requirement, local models: https://github.com/getzep/graphiti/blob/main/README.md
- Graphiti MCP server README — Ollama configuration, small-model warning, telemetry default: https://github.com/getzep/graphiti/blob/main/mcp_server/README.md
- Neo4j — context graphs for AI decision-making: https://neo4j.com/blog/agentic-ai/ai-decision-making/
- Shardul Amarchand Mangaldas — DPDP Act enforcement dates: https://www.amsshardul.com/insight/enforcement-of-the-dpdp-act-and-notification-of-the-dpdp-rules/
- Privacy World — DPDP Rules phased stages: https://www.privacyworld.blog/2025/11/india-passes-the-digital-personal-data-protection-rules-ushering-in-a-new-digital-age-in-india/

Model memory figures in §10.1 are approximate and not from these sources. Verify before relying on them.
