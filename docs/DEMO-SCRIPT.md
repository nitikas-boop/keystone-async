# Keystone demo: voice-over script

Narration for the recorded walkthrough (`demo-recording/v2/keystone-demo-v2.webm`, silent, 6:20). Timestamps are where
each scene starts in that recording; each scene is held long enough to read its lines at a normal pace (about 150
words a minute). The "while it thinks" lines cover the model's answer time; on a slower machine answers take longer,
so when presenting live, keep talking over those stretches rather than waiting in silence.

A caption pill at the bottom of the video names each scene; crop or blur it if you record your own voice-over and
prefer a clean frame.

Recording setup: 1536x864 viewport (1920x1080 at 125% scaling), backend on `localhost:8000`, seeded demo data
(`nimbus-seed`). Re-record with `scripts/record-demo.mjs` (it uploads RET-2.1 v3 and approves the proposal, so restore
the snapshot afterwards). Everything runs on one laptop: Postgres, Neo4j/Graphiti and Ollama (qwen2.5 7B).

---

## 1. Landing page (0:02)

> Every company makes decisions based on the rules in force at the time. A year later the rule has changed, the
> person who decided has moved on, and nobody can say whether that decision was right *then*, or whether it is
> still right *now*.
>
> This is Keystone: a sovereign decision memory. It links every decision to the exact version of the policy clause
> it relied on, with the date it was in force, and it runs entirely on local hardware. No data leaves the machine.

## 2. Enter the workspace (0:30)

> For the demo we sign in as one of the Nimbus Ledger team. Priya is the Ops Lead.

## 3. Ask (0:36)

> This is Ask. On the left, the conversation. On the right, the evidence for each answer: only the records that
> answer used, on a timeline, so you ask on the left and see exactly what it rests on, on the right. Decisions in
> purple, policy clauses in amber, people in blue.

## 4. Q1: history of Project Atlas (0:56)

> First, a history question: *Show the history of Project Atlas.*
>
> *(while it thinks)* The question goes to a local model, but the answer is built from the graph: the model may
> only state facts it can cite.
>
> Three decisions, in order, with owners: standardise on AWS Mumbai in November 2024, move to an India-hosted
> provider in May 2025, then standardise on FastAPI in February 2026. Each sentence carries its source.

## 5. Citations and the inspector (1:20)

> Click any citation and the graph selects that node. The inspector shows who decided, when, the recorded rationale,
> and the provenance: the source document and the exact quote it was extracted from.

## 6. Q2: why we left AWS (1:34)

> *Why did we move off AWS in May 2025?*
>
> *(while it thinks)* This one needs the rationale, which lives in a meeting note, not the decision log.
>
> Vikram Shah, May 20th 2025: data residency and cost. And it cites the meeting note from May 14th where that was
> discussed.

## 7. Q3 by voice: VendorCo contract (1:52)

> Now a compliance question, and this time Priya just asks it out loud. *Was the four lakh VendorCo contract
> approved correctly in March 2025?*
>
> *(while it transcribes)* The audio never leaves this laptop. Whisper runs locally on the backend, the text goes
> into exactly the same pipeline as a typed question. We deliberately do not use the browser's speech API: Chrome
> sends that audio to Google.
>
> *(while it thinks)* Compliance is never left to the language model. Keystone runs a deterministic check against
> the clause fields: thresholds, day counts, roles.
>
> Yes: in March 2025 the procurement policy, version 1, let the CTO sign up to five lakh. But the policy changed in
> July 2025. Under version 2 the CTO ceiling is two lakh, so the same contract today would need the CEO. Compliant
> then, non-compliant now, and both clause versions are cited.

## 7b. Visibility filter (2:14)

> Some records are restricted. DEC-008, the quarterly access-review decision, is marked restricted in its
> front-matter. Priya asks *Why do we run quarterly access reviews?*
>
> She gets the ordinary refusal. The restricted node is filtered out at retrieval, before anything reaches the
> model, so it cannot leak into an answer, and the refusal does not even hint that something is hidden. Ask the same
> question as Ananya, the CEO, or Farhan in compliance, and it is answered with its citation.

## 8. Temporal Graph (2:46)

> The Temporal Graph shows every record on one timeline, with the policy milestones across the top. The console
> opens beside it, and it is the same conversation.

## 9. Q4: 180-day retention in Q2 2025 (2:58)

> *Was keeping customer logs for 180 days compliant in Q2 2025?*
>
> Yes: retention clause RET-2.1 version 2 allowed exactly 180 days from January 2025. At the limit, but compliant.

## 10. Time travel (3:12)

> Now move the timeline back to January 2024. The graph shows what was true then: version 1 of the retention
> clause, 365 days, and none of the later decisions exist yet. Forward to January 2025: version 2 takes over.
> July 2025: the procurement ceiling drops. And back to today. Bi-temporal: we know both when something was true
> and when we learned it.

## 11. A policy changes: ingest RET-2.1 v3 (3:37)

> Here is the scenario that matters. Legal publishes version 3 of the retention policy: raw logs may now be kept
> for 90 days, not 180. We ingest the Markdown document.
>
> *(while it runs)* It is parsed into clause versions with valid-from dates, and the impact scanner checks every
> decision that relied on the old version.

## 12. Scanner result (3:56)

> The scanner flags DEC-007, the decision to keep customer logs for 180 days, as an ongoing practice breach: it was
> compliant when made, but the practice now exceeds the new limit. DEC-002 is marked superseded, for the record
> only. And Keystone drafts a remediation action, but does not execute it.

## 13. Human-in-the-loop approval (4:20)

> Nothing leaves Keystone without a human. The proposal waits in the Inbox with its reasoning and citations.
> The reviewer can edit, reject, or approve. We approve.

## 14. Executor (4:34)

> A separate executor process picks up only approved actions. Here it writes the notification email to the outbox;
> in production that is the integration point for mail or ticketing.

## 14b. Meeting audio in (4:46)

> A lot of decisions are made out loud. Here is the recording of today's security sync. We drop the audio file into
> Ingest Document.
>
> *(while it transcribes)* Again, transcribed locally. Keystone turns the transcript into an ordinary meeting note
> with dated front-matter, so nothing new is trusted: it goes through the same extraction, provenance and review
> path as a written note.

## 15. Inbox: extracted facts (5:12)

> And here it is: the model found the decision in the recording, Karthik moving all internal tools to single
> sign-on with Keycloak, with the exact sentence it came from. Facts extracted from meeting notes are never trusted
> blindly. Each one shows the source sentence and the model's confidence, and a person accepts or rejects it before
> it enters the graph.

## 16. Audit trail (5:26)

> Every question, ingestion, flag, approval and execution is written to an append-only audit log. Each row is
> SHA-256 hash-chained to the previous one. Verify Full Chain recomputes every hash: if anyone edits a row, the
> chain breaks at that point. The check runs twice, independently: in the browser, and on the server through
> `GET /audit/verify`, which names the first broken row.

## 17. Q5: the refusal (5:48)

> Last, a trick question. *Why did we choose MongoDB?*
>
> We never did. There is no such decision in the record, so Keystone says so, instead of inventing a plausible
> answer. No evidence, no answer.

## 18. Close (6:04)

> One more thing you cannot see on screen: Keystone is also an MCP server. Any MCP client, Claude Desktop or an IDE
> agent, can ask it questions, check compliance, verify the audit chain, and propose an action. Propose only: the
> proposal lands in this same Inbox and waits for a human.
>
> Keystone: every decision linked to the rule that was in force, compliance checked deterministically, policy
> changes traced to their impact, a human approving every action, and a tamper-evident trail. All on local hardware.
> Thank you.
