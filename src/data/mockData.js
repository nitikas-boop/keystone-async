// Keystone Synthetic Enterprise Graph & Compliance Dataset
// Fictional Organization: "Nimbus Ledger" (7-person Bengaluru Fintech Startup)
// Follows Keystone-Team-Reference-Doc.md §7

export const ORG_METADATA = {
  name: "Nimbus Ledger Technologies",
  location: "Bengaluru, Karnataka, India",
  regulatoryJurisdiction: "RBI Digital Lending & India DPDP Act 2025/2026",
  deploymentMode: "Sovereign Self-Hosted (Neo4j / Graphiti + Ollama Local Cluster)",
  activeVersion: "Keystone Engine v2.4-temporal"
};

export const TEAM_MEMBERS = [
  { id: "p-ananya", name: "Ananya Rao", role: "Chief Executive Officer", joined: "2024-01-01", status: "Active" },
  { id: "p-vikram", name: "Vikram Shah", role: "Former CTO", joined: "2024-01-01", left: "2025-08-31", status: "Departed" },
  { id: "p-karthik", name: "Karthik Rao", role: "Chief Technology Officer", joined: "2025-09-01", status: "Active" },
  { id: "p-priya", name: "Priya Menon", role: "Head of Operations", joined: "2026-05-01", status: "Active" },
  { id: "p-farhan", name: "Farhan Qureshi", role: "Compliance & Risk Lead", joined: "2024-03-01", status: "Active" },
  { id: "p-divya", name: "Divya Nair", role: "Sr. Software Engineer", joined: "2024-02-01", status: "Active" },
  { id: "p-rohit", name: "Rohit Kulkarni", role: "Infrastructure Engineer", joined: "2024-06-01", status: "Active" },
  { id: "p-sneha", name: "Sneha Iyer", role: "Financial & Data Analyst", joined: "2024-09-01", status: "Active" }
];

export const POLICIES = [
  {
    docId: "POL-RET",
    title: "Customer Data & Audit Trail Retention Policy",
    category: "Data Privacy & Compliance",
    versions: [
      {
        version: "v1",
        effectiveFrom: "2024-01-15",
        effectiveTo: "2025-01-05",
        clauseId: "RET-2.1@v1",
        clauseName: "Customer Raw Audit Log Retention Window",
        description: "Customer telemetry and raw interaction logs may be retained for up to 365 calendar days from event generation.",
        limitDays: 365,
        mandatedBy: "Standard IT Audit Guideline 2023"
      },
      {
        version: "v2",
        effectiveFrom: "2025-01-06",
        effectiveTo: "2026-09-27",
        clauseId: "RET-2.1@v2",
        clauseName: "Customer Raw Audit Log Retention Window (Tightened)",
        description: "Customer telemetry and raw interaction logs must not be retained longer than 180 calendar days, after which automated anonymization or purge must trigger.",
        limitDays: 180,
        mandatedBy: "Interim DPDP Preparedness Directive"
      },
      {
        version: "v3",
        effectiveFrom: "2026-09-28",
        effectiveTo: null,
        clauseId: "RET-2.1@v3",
        clauseName: "Strict 90-Day Ephemeral Retention Mandate",
        description: "Strict 90-day retention ceiling for unencrypted raw user logs. Mandatory cryptographic hash sealing for compliance verification.",
        limitDays: 90,
        mandatedBy: "India DPDP Rules Enactment & RBI Master Direction 2026"
      }
    ]
  },
  {
    docId: "POL-PROC",
    title: "Procurement Spend Authority & Sign-off Policy",
    category: "Financial Governance",
    versions: [
      {
        version: "v1",
        effectiveFrom: "2024-01-15",
        effectiveTo: "2025-06-30",
        clauseId: "PROC-3.1@v1",
        clauseName: "Executive Spend Discretion Ceiling",
        description: "CTO holds unilateral signing authority for software infrastructure licenses up to ₹5,00,000 without requiring CEO co-signature.",
        limitInr: 500000,
        mandatedBy: "Founder Seed Delegation Matrix"
      },
      {
        version: "v2",
        effectiveFrom: "2025-07-01",
        effectiveTo: null,
        clauseId: "PROC-3.1@v2",
        clauseName: "Executive Spend Discretion Ceiling (Dual Signoff)",
        description: "CTO unilateral threshold reduced to ₹2,00,000. Any purchase exceeding ₹2,00,000 strictly requires co-signing by CEO Ananya Rao.",
        limitInr: 200000,
        mandatedBy: "Series-A Audit Committee Controls"
      }
    ]
  }
];

export const DECISIONS = [
  {
    id: "DEC-001",
    title: "Adopt an Obsidian vault for internal notes",
    decidedOn: "2024-03-12",
    owner: "Vikram Shah (CTO)",
    ownerId: "p-vikram",
    reliedOnClause: null,
    status: "Active",
    rationale: "Standardized on local Markdown front-matter note taking for internal documentation and knowledge preservation.",
    project: "Internal Ops"
  },
  {
    id: "DEC-002",
    title: "Retain customer logs 300 days",
    decidedOn: "2024-07-22",
    owner: "Ananya Rao (CEO)",
    ownerId: "p-ananya",
    reliedOnClause: "RET-2.1@v1",
    status: "Superseded",
    rationale: "Selected 300 days to comfortably comply with RET-2.1@v1 (365 days max). Later superseded by DEC-007.",
    project: "Data Platform",
    supersededBy: "DEC-007"
  },
  {
    id: "DEC-003",
    title: "Standardise on AWS Mumbai",
    decidedOn: "2024-11-05",
    owner: "Vikram Shah (CTO)",
    ownerId: "p-vikram",
    reliedOnClause: null,
    status: "Superseded",
    rationale: "Initial cloud baseline deployment in AWS ap-south-1 (Mumbai) before the 2025 sovereign cloud switch.",
    project: "Infrastructure"
  },
  {
    id: "DEC-004",
    title: "Sign VendorCo contract, ₹4,00,000",
    decidedOn: "2025-03-14",
    owner: "Vikram Shah (CTO)",
    ownerId: "p-vikram",
    reliedOnClause: "PROC-3.1@v1",
    status: "Active",
    rationale: "Approved software license contract for ₹4,00,000. Fully compliant under PROC-3.1@v1 in force on 14 Mar 2025 (CTO threshold ₹5,00,000). Under today's v2 ceiling (₹2,00,000), renewal requires CEO sign-off.",
    project: "Core Banking",
    historicalCompliance: [
      { period: "2025-03 to 2025-06", policyVersion: "PROC-3.1@v1 (Limit ₹5L)", compliant: true, reason: "₹4L <= ₹5L unilateral CTO threshold" },
      { period: "2025-07 onwards", policyVersion: "PROC-3.1@v2 (Limit ₹2L)", compliant: false, reason: "RULE_CHANGED_SINCE: Under v2, contracts over ₹2L require CEO co-signature." }
    ]
  },
  {
    id: "DEC-005",
    title: "Nightly encrypted backups",
    decidedOn: "2025-04-02",
    owner: "Divya Nair (Engineer)",
    ownerId: "p-divya",
    reliedOnClause: null,
    status: "Active",
    rationale: "Implemented automated nightly snapshot backups with AES-256 GCM encryption for sovereign database cluster.",
    project: "Infrastructure"
  },
  {
    id: "DEC-006",
    title: "Move from AWS to an India-hosted cloud provider",
    decidedOn: "2025-05-20",
    owner: "Vikram Shah (CTO)",
    ownerId: "p-vikram",
    reliedOnClause: null,
    status: "Active",
    rationale: "Relocated core ledger workloads from AWS to an Indian sovereign cloud provider. Grounded in meeting notes (2025-05-14) citing data residency obligations under DPDP directives and 42% cost reduction in variable egress fees.",
    project: "Infrastructure"
  },
  {
    id: "DEC-007",
    title: "Reduce customer log retention to 180 days",
    decidedOn: "2025-06-18",
    owner: "Ananya Rao (CEO)",
    ownerId: "p-ananya",
    reliedOnClause: "RET-2.1@v2",
    status: "Active",
    rationale: "Reduced log retention from 300 to 180 days to match tightened RET-2.1@v2 (effective Jan 2025, 180 days max). Ongoing practice: flagged as ONGOING_PRACTICE_BREACH when RET-2.1@v3 (90 days) takes effect.",
    project: "Data Platform",
    isStaleUnderV3: true,
    historicalCompliance: [
      { period: "2025-06 to 2026-09", policyVersion: "RET-2.1@v2 (Max 180d)", compliant: true, reason: "180 days == 180 days ceiling (Fully compliant at the time)" },
      { period: "2026-09 onwards", policyVersion: "RET-2.1@v3 (Max 90d)", compliant: false, reason: "ONGOING_PRACTICE_BREACH: 180-day ongoing retention violates 90-day cap under v3!" }
    ]
  },
  {
    id: "DEC-008",
    title: "Quarterly access reviews",
    decidedOn: "2025-09-09",
    owner: "Farhan Qureshi (Compliance)",
    ownerId: "p-farhan",
    reliedOnClause: null,
    status: "Active",
    rationale: "Established quarterly credential rotation and RBAC verification sweeps for all engineers accessing production pods.",
    project: "Security"
  },
  {
    id: "DEC-009",
    title: "Approve analytics tool, ₹1,80,000",
    decidedOn: "2025-11-25",
    owner: "Karthik Rao (CTO)",
    ownerId: "p-karthik",
    reliedOnClause: "PROC-3.1@v2",
    status: "Active",
    rationale: "Signed analytics vendor license for ₹1,80,000. Compliant under PROC-3.1@v2 (₹1,80,000 <= ₹2,00,000 unilateral CTO threshold).",
    project: "Analytics"
  },
  {
    id: "DEC-010",
    title: "Standardise internal services on FastAPI",
    decidedOn: "2026-02-10",
    owner: "Divya Nair (Engineer)",
    ownerId: "p-divya",
    reliedOnClause: null,
    status: "Active",
    rationale: "Unified all internal microservices and API gateways on FastAPI for high-throughput async processing and OpenAPI parity.",
    project: "Core Platform"
  }
];

export const GRAPH_NODES = [
  // Decisions
  { id: "DEC-001", label: "DEC-001\n(Obsidian Vault)", type: "decision", date: "2024-03-12", color: "#6366F1", glow: "#4338CA", x: 100, y: 150 },
  { id: "DEC-002", label: "DEC-002\n(300d Log Retention)", type: "decision", date: "2024-07-22", color: "#6366F1", glow: "#4338CA", x: 260, y: 150 },
  { id: "DEC-003", label: "DEC-003\n(AWS Mumbai Standard)", type: "decision", date: "2024-11-05", color: "#6366F1", glow: "#4338CA", x: 120, y: 280 },
  { id: "DEC-004", label: "DEC-004\n(₹4L VendorCo Contract)", type: "decision", date: "2025-03-14", color: "#6366F1", glow: "#4338CA", x: 380, y: 280 },
  { id: "DEC-005", label: "DEC-005\n(Nightly Backups)", type: "decision", date: "2025-04-02", color: "#6366F1", glow: "#4338CA", x: 200, y: 400 },
  { id: "DEC-006", label: "DEC-006\n(Switch to India Cloud)", type: "decision", date: "2025-05-20", color: "#6366F1", glow: "#4338CA", x: 500, y: 220 },
  { id: "DEC-007", label: "DEC-007\n(180d Retention)", type: "decision", date: "2025-06-18", color: "#6366F1", glow: "#4338CA", x: 620, y: 150 },
  { id: "DEC-008", label: "DEC-008\n(Quarterly Access Review)", type: "decision", date: "2025-09-09", color: "#6366F1", glow: "#4338CA", x: 520, y: 400 },
  { id: "DEC-009", label: "DEC-009\n(₹1.8L Analytics Tool)", type: "decision", date: "2025-11-25", color: "#6366F1", glow: "#4338CA", x: 680, y: 300 },
  { id: "DEC-010", label: "DEC-010\n(FastAPI Standard)", type: "decision", date: "2026-02-10", color: "#6366F1", glow: "#4338CA", x: 740, y: 400 },

  // Clauses
  { id: "RET-2.1-v1", label: "RET-2.1 @ v1\n(Max 365d)", type: "clause", validFrom: "2024-01-15", validTo: "2025-01-05", color: "#D97706", glow: "#B45309", x: 260, y: 60 },
  { id: "RET-2.1-v2", label: "RET-2.1 @ v2\n(Max 180d)", type: "clause", validFrom: "2025-01-06", validTo: "2026-09-27", color: "#D97706", glow: "#B45309", x: 620, y: 60 },
  { id: "RET-2.1-v3", label: "RET-2.1 @ v3\n(Max 90d - DPDP)", type: "clause", validFrom: "2026-09-28", validTo: null, color: "#D97706", glow: "#B45309", x: 800, y: 60 },
  { id: "PROC-3.1-v1", label: "PROC-3.1 @ v1\n(Limit ₹5L)", type: "clause", validFrom: "2024-01-15", validTo: "2025-06-30", color: "#D97706", glow: "#B45309", x: 380, y: 450 },
  { id: "PROC-3.1-v2", label: "PROC-3.1 @ v2\n(Limit ₹2L)", type: "clause", validFrom: "2025-07-01", validTo: null, color: "#D97706", glow: "#B45309", x: 680, y: 450 },

  // Persons
  { id: "p-ananya", label: "Ananya Rao\n(CEO)", type: "person", color: "#0284C7", glow: "#0369A1", x: 420, y: 150 },
  { id: "p-vikram", label: "Vikram Shah\n(Ex-CTO)", type: "person", color: "#0284C7", glow: "#0369A1", x: 280, y: 240 },
  { id: "p-karthik", label: "Karthik Rao\n(CTO)", type: "person", color: "#0284C7", glow: "#0369A1", x: 680, y: 220 },
  { id: "p-priya", label: "Priya Menon\n(Ops Lead)", type: "person", color: "#0284C7", glow: "#0369A1", x: 520, y: 320 },
  { id: "p-farhan", label: "Farhan Qureshi\n(Compliance)", type: "person", color: "#0284C7", glow: "#0369A1", x: 380, y: 370 },
  { id: "p-divya", label: "Divya Nair\n(Engineer)", type: "person", color: "#0284C7", glow: "#0369A1", x: 180, y: 340 }
];

export const GRAPH_EDGES = [
  // Decisions linked to clauses
  { source: "DEC-002", target: "RET-2.1-v1", relation: "RELIED_ON", validFrom: "2024-07-22", validTo: "2025-01-05" },
  { source: "DEC-004", target: "PROC-3.1-v1", relation: "RELIED_ON", validFrom: "2025-03-14", validTo: "2025-06-30" },
  { source: "DEC-007", target: "RET-2.1-v2", relation: "RELIED_ON", validFrom: "2025-06-18", validTo: "2026-09-27" },
  { source: "DEC-007", target: "RET-2.1-v3", relation: "CONTRADICTED_BY", validFrom: "2026-09-28", validTo: null, isConflict: true },
  { source: "DEC-009", target: "PROC-3.1-v2", relation: "RELIED_ON", validFrom: "2025-11-25", validTo: null },

  // Decisions made by persons
  { source: "DEC-001", target: "p-vikram", relation: "MADE_BY", validFrom: "2024-03-12", validTo: null },
  { source: "DEC-002", target: "p-ananya", relation: "MADE_BY", validFrom: "2024-07-22", validTo: null },
  { source: "DEC-003", target: "p-vikram", relation: "MADE_BY", validFrom: "2024-11-05", validTo: null },
  { source: "DEC-004", target: "p-vikram", relation: "MADE_BY", validFrom: "2025-03-14", validTo: null },
  { source: "DEC-005", target: "p-divya", relation: "MADE_BY", validFrom: "2025-04-02", validTo: null },
  { source: "DEC-006", target: "p-vikram", relation: "MADE_BY", validFrom: "2025-05-20", validTo: null },
  { source: "DEC-007", target: "p-ananya", relation: "MADE_BY", validFrom: "2025-06-18", validTo: null },
  { source: "DEC-008", target: "p-farhan", relation: "MADE_BY", validFrom: "2025-09-09", validTo: null },
  { source: "DEC-009", target: "p-karthik", relation: "MADE_BY", validFrom: "2025-11-25", validTo: null },
  { source: "DEC-010", target: "p-divya", relation: "MADE_BY", validFrom: "2026-02-10", validTo: null },

  // Policy clause lineage (SUPERSEDES)
  { source: "RET-2.1-v2", target: "RET-2.1-v1", relation: "SUPERSEDES", validFrom: "2025-01-06", validTo: null },
  { source: "RET-2.1-v3", target: "RET-2.1-v2", relation: "SUPERSEDES", validFrom: "2026-09-28", validTo: null },
  { source: "PROC-3.1-v2", target: "PROC-3.1-v1", relation: "SUPERSEDES", validFrom: "2025-07-01", validTo: null },

  // Decision supersession
  { source: "DEC-007", target: "DEC-002", relation: "SUPERSEDES", validFrom: "2025-06-18", validTo: null }
];

export const DEMO_QUERIES = [
  {
    id: "q-1",
    shortLabel: "Cloud Vendor Switch (2025)",
    query: "Why did we switch from AWS to a local cloud provider in 2025?",
    asOfDateSuggested: "2025-06-01",
    answer: "Nimbus Ledger transitioned workloads from AWS Mumbai to an Indian sovereign cloud provider on **May 20, 2025** via [DEC-006].\n\nThe decision was authored by **Vikram Shah (CTO)**, who left Nimbus Ledger in August 2025. The decision is grounded in meeting notes from **May 14, 2025** (`meeting-notes/2025-05-14.md`).\n\n**Primary Stated Reasons:**\n1. **Data Sovereignty Compliance:** Adherence to incoming India DPDP Act data residency directives requiring domestic storage of core fintech audit telemetry.\n2. **Cost Optimization:** An audited **42% reduction** in variable USD cross-border data egress fees.\n\n*Graph check confirms no subsequent reversal or contradictory decision has been recorded.*",
    citations: [
      { id: "DEC-006", label: "DEC-006", type: "decision", date: "2025-05-20", title: "Move from AWS to India-hosted cloud provider" },
      { id: "p-vikram", label: "Vikram Shah", type: "person", date: "2024-01-01", title: "Vikram Shah (Former CTO)" }
    ],
    highlightNodes: ["DEC-006", "p-vikram"]
  },
  {
    id: "q-2",
    shortLabel: "180-Day Retention in Q2 2025",
    query: "Was keeping customer logs for 180 days compliant in Q2 2025?",
    asOfDateSuggested: "2025-06-30",
    answer: "### Point-in-Time Compliance Assessment: **YES (COMPLIANT AT THE TIME)**\n\nAs of **June 30, 2025**, the active policy clause in force was [RET-2.1@v2] (effective Jan 6, 2025 – Sep 27, 2026), which mandated a maximum retention ceiling of **180 calendar days**.\n\n- **Decision in Force:** Under [DEC-007] (decided June 18, 2025 by Ananya Rao), Nimbus Ledger reduced log retention from 300 days ([DEC-002]) to 180 days.\n- **Compliance at Q2 2025:** Exact match (180 days practice <= 180 days policy ceiling).\n\n⚠️ **Temporal Advisory Alert (Future Horizon):**\nWhen evaluated against the timeline after **September 28, 2026**, the newly ratified [RET-2.1@v3] lowers the retention ceiling to **90 days**. Consequently, [DEC-007] is classified as **ONGOING_PRACTICE_BREACH** by the Keystone Staleness Scanner, and an automated remediation task has been deposited into the Human-in-the-Loop Review Queue.",
    citations: [
      { id: "DEC-007", label: "DEC-007", type: "decision", date: "2025-06-18", title: "Reduce customer log retention to 180 days" },
      { id: "RET-2.1-v2", label: "RET-2.1@v2", type: "clause", date: "2025-01-06", title: "180-Day Ceiling Directive" },
      { id: "RET-2.1-v3", label: "RET-2.1@v3", type: "clause", date: "2026-09-28", title: "90-Day Ephemeral Mandate" }
    ],
    highlightNodes: ["DEC-007", "RET-2.1-v2", "RET-2.1-v3"]
  },
  {
    id: "q-3",
    shortLabel: "VendorCo Contract Approval (Mar 2025)",
    query: "Was the ₹4 lakh VendorCo contract approved correctly in March 2025?",
    // Today, so the answer contrasts "compliant then" (PROC-3.1 v1) with "needs CEO sign-off now" (v2).
    asOfDateSuggested: new Date().toLocaleDateString("en-CA"),
    answer: "### Point-in-Time Compliance: **YES (COMPLIANT WHEN MADE)**\n\nContract signed on **March 14, 2025** via [DEC-004] for ₹4,00,000 by **Vikram Shah (CTO)**.\n\n- **In Force on 14 Mar 2025:** [PROC-3.1@v1] permitted the CTO to unilaterally approve software infrastructure contracts up to **₹5,00,000**.\n- **Deterministic Check:** ₹4,00,000 <= ₹5,00,000 → **COMPLIANT**.\n\nℹ️ **Policy Impact (RULE_CHANGED_SINCE):**\nOn July 1, 2025, [PROC-3.1@v2] reduced the unilateral CTO ceiling to ₹2,00,000, requiring CEO sign-off above ₹2L. This historical decision remains valid, but any renewal or contract modification today requires co-signature by CEO Ananya Rao.",
    citations: [
      { id: "DEC-004", label: "DEC-004", type: "decision", date: "2025-03-14", title: "Sign VendorCo contract, ₹4,00,000" },
      { id: "PROC-3.1-v1", label: "PROC-3.1@v1", type: "clause", date: "2024-01-15", title: "CTO Threshold ₹5L" },
      { id: "PROC-3.1-v2", label: "PROC-3.1@v2", type: "clause", date: "2025-07-01", title: "Dual Signoff Threshold ₹2L" }
    ],
    highlightNodes: ["DEC-004", "PROC-3.1-v1", "PROC-3.1-v2", "p-vikram"]
  },
  {
    id: "q-4",
    shortLabel: "Policy Impact Scanner & Flags",
    query: "Has anything changed that affects a decision we made in the past?",
    asOfDateSuggested: "2026-09-28",
    answer: "### Policy Impact Scanner: **1 CRITICAL BREACH & 1 INFORMATIONAL CHANGE**\n\nThe activation of policy update [RET-2.1@v3] (90-day ceiling) and [PROC-3.1@v2] (₹2L ceiling) has generated 2 flags:\n\n1. **[DEC-007] (180-Day Log Retention Window) — Severity: ACTION NEEDED**\n   - *Impact Classification:* `ONGOING_PRACTICE_BREACH`\n   - *Conflict:* [DEC-007] specifies 180-day retention, while newly ratified [RET-2.1@v3] enforces a strict **90-day** ceiling.\n   - *Action:* Remediation proposal drafted in Review Queue.\n\n2. **[DEC-004] (₹4,00,000 VendorCo Contract) — Severity: INFORMATIONAL**\n   - *Impact Classification:* `RULE_CHANGED_SINCE`\n   - *Note:* Valid when signed under [PROC-3.1@v1] (₹5L limit). Renewals require CEO Ananya Rao co-signing under [PROC-3.1@v2].",
    citations: [
      { id: "DEC-007", label: "DEC-007", type: "decision", date: "2025-06-18", title: "180d Customer Log Retention" },
      { id: "RET-2.1-v3", label: "RET-2.1@v3", type: "clause", date: "2026-09-28", title: "90-Day Policy Enactment" },
      { id: "DEC-004", label: "DEC-004", type: "decision", date: "2025-03-14", title: "VendorCo Contract" }
    ],
    highlightNodes: ["DEC-007", "RET-2.1-v3", "DEC-004"]
  },
  {
    id: "q-5",
    shortLabel: "Trick Query (MongoDB Choice)",
    query: "Why did we choose MongoDB?",
    asOfDateSuggested: "2026-09-24",
    answer: "### 🛑 Clean Refusal — No Ungrounded Hallucination\n\n**I have no recorded decision about MongoDB in the Nimbus Ledger knowledge graph.**\n\n- No document, meeting note, or architectural decision record (ADR) mentions MongoDB as an approved or considered persistence store.\n- Core database systems in the graph are registered as **PostgreSQL** and **Neo4j / Graphiti** under [DEC-001] and [DEC-010].\n\n*Keystone strictly refuses to synthesize hypothetical justifications when provenance edges are absent.*",
    citations: [],
    highlightNodes: []
  }
];

export const INITIAL_REVIEW_QUEUE = [
  {
    id: 1,
    status: "proposed",
    decision_id: "DEC-007",
    clause_id: "RET-2.1@v3",
    flag_id: "flag-001",
    to: "ananya.rao@nimbusledger.in",
    subject: "Policy Breach: DEC-007 (180d log retention) exceeds new 90d cap under RET-2.1@v3",
    body: "Hi Ananya,\n\nThe ingestion of POL-RET v3 on 2026-09-28 lowered customer log retention to 90 days. Decision DEC-007 (180 days) is now in ONGOING_PRACTICE_BREACH. Please review and confirm automated reconfiguration of the Kafka purge daemon.\n\nRegards,\nKeystone Policy Scanner",
    created_at: "2026-09-28T09:15:00Z",
    decided_by: null,
    decided_at: null,
    executed_at: null,
    severity: "CRITICAL"
  },
  {
    id: 2,
    status: "proposed",
    decision_id: "DEC-004",
    clause_id: "PROC-3.1@v2",
    flag_id: "flag-002",
    to: "ananya.rao@nimbusledger.in",
    subject: "Informational: VendorCo renewal will require CEO co-signature (PROC-3.1@v2)",
    body: "Hi Ananya,\n\nDecision DEC-004 was approved unilaterally by former CTO Vikram Shah under PROC-3.1@v1 (limit ₹5L). Under current PROC-3.1@v2, contracts exceeding ₹2L require CEO co-signing. Preparing renewal review packet.\n\nRegards,\nKeystone Governance Daemon",
    created_at: "2026-09-28T10:00:00Z",
    decided_by: null,
    decided_at: null,
    executed_at: null,
    severity: "HIGH"
  }
];

export const INITIAL_AUDIT_LOGS = [
  {
    id: 104,
    ts: "2026-09-28T10:05:00Z",
    actor: "user:priya",
    action: "query",
    object_type: "answer",
    object_id: "ans-401",
    source_ids: ["DEC-007", "RET-2.1@v3"],
    prev_hash: "7b4c91a0398f6217e4f1a238914bca81907de385e2b0cd2947116f39401bfd82",
    hash: "9a811c7e90f4e45d6291a58066f1082c5a71ebec48f58d0429a3e63989c8a912"
  },
  {
    id: 103,
    ts: "2026-09-28T09:14:22Z",
    actor: "user:priya",
    action: "ingest",
    object_type: "document",
    object_id: "POL-RET-v3",
    source_ids: ["POL-RET", "RET-2.1@v3"],
    prev_hash: "51c4a919864d4b1a82efd978a3c983d5a1094ef2981bc893a74659f138841a54",
    hash: "7b4c91a0398f6217e4f1a238914bca81907de385e2b0cd2947116f39401bfd82"
  },
  {
    id: 102,
    ts: "2026-09-25T14:30:00Z",
    actor: "user:karthik",
    action: "approved",
    object_type: "proposal",
    object_id: "prop-099",
    source_ids: ["DEC-009", "PROC-3.1@v2"],
    prev_hash: "29f8a31874b219e5cc401a88df54b123985ea81b0a884f1a8c9b917c093a8d11",
    hash: "51c4a919864d4b1a82efd978a3c983d5a1094ef2981bc893a74659f138841a54"
  },
  {
    id: 101,
    ts: "2026-09-20T11:20:00Z",
    actor: "user:ananya",
    action: "approved",
    object_type: "proposal",
    object_id: "prop-098",
    source_ids: ["DEC-007"],
    prev_hash: "0000000000000000000000000000000000000000000000000000000000000000",
    hash: "29f8a31874b219e5cc401a88df54b123985ea81b0a884f1a8c9b917c093a8d11"
  }
];

export const TIMELINE_POINTS = [
  { date: "2024-01-15", label: "Jan 2024", event: "RET-2.1@v1 (365d) & PROC-3.1@v1 (₹5L) active" },
  { date: "2024-03-12", label: "Mar 2024", event: "DEC-001 (Adopt Obsidian vault)" },
  { date: "2024-07-22", label: "Jul 2024", event: "DEC-002 (300d log retention chosen)" },
  { date: "2024-11-05", label: "Nov 2024", event: "DEC-003 (Standardise on AWS Mumbai)" },
  { date: "2025-01-06", label: "Jan 2025", event: "RET-2.1@v2 active (180d ceiling)" },
  { date: "2025-03-14", label: "Mar 2025", event: "DEC-004 (VendorCo ₹4L CTO approval)" },
  { date: "2025-05-20", label: "May 2025", event: "DEC-006 (Switch from AWS to India Cloud)" },
  { date: "2025-06-18", label: "Jun 2025", event: "DEC-007 (Reduce log retention to 180d)" },
  { date: "2025-07-01", label: "Jul 2025", event: "PROC-3.1@v2 active (CTO threshold reduced to ₹2L)" },
  { date: "2025-08-31", label: "Aug 2025", event: "Vikram Shah departs (Knowledge-loss milestone)" },
  { date: "2025-09-01", label: "Sep 2025", event: "Karthik Rao joins as CTO" },
  { date: "2025-11-25", label: "Nov 2025", event: "DEC-009 (Approve analytics tool ₹1.8L)" },
  { date: "2026-02-10", label: "Feb 2026", event: "DEC-010 (Standardise on FastAPI)" },
  { date: "2026-05-01", label: "May 2026", event: "Priya Menon joins as Ops Lead" },
  { date: "2026-09-28", label: "Sep 2026", event: "RET-2.1@v3 live upload (90d cap) & Staleness Scan" }
];
