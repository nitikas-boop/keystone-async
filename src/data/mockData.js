// Keystone Synthetic Enterprise Graph & Compliance Dataset
// Fictional Organization: "Nimbus Ledger" (7-person Bengaluru Fintech Startup)

export const ORG_METADATA = {
  name: "Nimbus Ledger Technologies",
  location: "Bengaluru, Karnataka, India",
  regulatoryJurisdiction: "RBI Digital Lending & India DPDP Act 2025/2026",
  deploymentMode: "Sovereign Self-Hosted (FalkorDB / Neo4j + Ollama Local Cluster)",
  activeVersion: "Keystone Engine v2.4-temporal"
};

export const TEAM_MEMBERS = [
  { id: "P-101", name: "Aditi Sen", role: "Chief Executive Officer", joined: "2023-11-01", status: "Active" },
  { id: "P-102", name: "Vikram Rao", role: "Former CTO", joined: "2023-11-01", left: "2025-03-31", status: "Departed" },
  { id: "P-103", name: "Kavya Nair", role: "Chief Technology Officer", joined: "2025-04-15", status: "Active" },
  { id: "P-104", name: "Rohan Gupta", role: "Head of Operations", joined: "2024-01-10", status: "Active" },
  { id: "P-105", name: "Priya Sharma", role: "Compliance & Risk Lead", joined: "2024-02-01", status: "Active" },
  { id: "P-106", name: "Anand Verma", role: "Sr. Infrastructure Engineer", joined: "2024-03-15", status: "Active" },
  { id: "P-107", name: "Meera Iyer", role: "Data & Financial Analyst", joined: "2024-05-01", status: "Active" }
];

export const POLICIES = [
  {
    docId: "POL-RET-2024",
    title: "Customer Data & Audit Trail Retention Policy",
    category: "Data Privacy & Compliance",
    versions: [
      {
        version: "v1",
        effectiveFrom: "2024-01-01",
        effectiveTo: "2024-12-31",
        clauseId: "RET-2.1 v1",
        clauseName: "Customer Raw Audit Log Retention Window",
        description: "Customer telemetry and raw interaction logs may be retained for up to 365 calendar days from event generation.",
        limitDays: 365,
        mandatedBy: "Standard IT Audit Guideline 2023"
      },
      {
        version: "v2",
        effectiveFrom: "2025-01-01",
        effectiveTo: "2026-08-31",
        clauseId: "RET-2.1 v2",
        clauseName: "Customer Raw Audit Log Retention Window (Tightened)",
        description: "Customer telemetry and raw interaction logs must not be retained longer than 180 calendar days, after which automated anonymization or purge must trigger.",
        limitDays: 180,
        mandatedBy: "Interim DPDP Preparedness Directive"
      },
      {
        version: "v3",
        effectiveFrom: "2026-09-01",
        effectiveTo: null,
        clauseId: "RET-2.1 v3",
        clauseName: "Strict 90-Day Ephemeral Retention Mandate",
        description: "Strict 90-day retention ceiling for unencrypted raw user logs. Mandatory cryptographic hash sealing for compliance verification.",
        limitDays: 90,
        mandatedBy: "India DPDP Rules Enactment & RBI Master Direction 2026"
      }
    ]
  },
  {
    docId: "POL-PROC-2024",
    title: "Procurement Spend Authority & Counter-Signing Policy",
    category: "Financial Governance",
    versions: [
      {
        version: "v1",
        effectiveFrom: "2024-01-01",
        effectiveTo: "2025-06-30",
        clauseId: "PROC-1.4 v1",
        clauseName: "Executive Spend Discretion Ceiling",
        description: "CTO holds unilateral signing authority for software infrastructure licenses up to ₹5,00,000 without requiring CEO co-signature.",
        limitInr: 500000,
        mandatedBy: "Founder Seed Delegation Matrix"
      },
      {
        version: "v2",
        effectiveFrom: "2025-07-01",
        effectiveTo: null,
        clauseId: "PROC-1.4 v2",
        clauseName: "Executive Spend Discretion Ceiling (Dual Signoff)",
        description: "CTO unilateral threshold reduced to ₹2,00,000. Any purchase exceeding ₹2,00,000 strictly requires co-signing by CEO Aditi Sen.",
        limitInr: 200000,
        mandatedBy: "Series-A Audit Committee Controls"
      }
    ]
  },
  {
    docId: "POL-SOV-2025",
    title: "Sovereign Infrastructure & Local Model Hosting Policy",
    category: "Infrastructure Security",
    versions: [
      {
        version: "v1",
        effectiveFrom: "2025-02-15",
        effectiveTo: null,
        clauseId: "SOV-3.1 v1",
        clauseName: "Sovereign Data Boundary & On-Prem Inference",
        description: "All core organizational intelligence, graph nodes, and LLM inference pipelines must execute within customer-owned hardware or private VPC in India with zero 3rd-party cloud AI egress.",
        limitDays: null,
        mandatedBy: "National Data Sovereignty Directives"
      }
    ]
  }
];

export const DECISIONS = [
  {
    id: "DEC-2024-001",
    title: "Set Transaction & Log Retention Window to 180 Days",
    decidedOn: "2024-02-14",
    owner: "Vikram Rao (Former CTO)",
    ownerId: "P-102",
    reliedOnClause: "RET-2.1 v1",
    status: "Active",
    rationale: "Selected 180 days to comfortably comply with RET-2.1 v1 (which permitted up to 365 days) while optimizing storage SSD costs across our initial server racks.",
    project: "Project Sentinel",
    isStaleUnderV3: true,
    historicalCompliance: [
      { period: "2024-02 to 2024-12", policyVersion: "RET-2.1 v1 (Max 365d)", compliant: true, reason: "180 days <= 365 days limit" },
      { period: "2025-01 to 2026-08", policyVersion: "RET-2.1 v2 (Max 180d)", compliant: true, reason: "180 days == 180 days ceiling (Borderline Valid)" },
      { period: "2026-09 onwards", policyVersion: "RET-2.1 v3 (Max 90d)", compliant: false, reason: "CONFLICT: 180 days exceeds 90-day ceiling! Stale decision flagged." }
    ]
  },
  {
    id: "DEC-2024-004",
    title: "Approve FinCore Telemetry ₹4,00,000 Annual Contract",
    decidedOn: "2024-08-10",
    owner: "Vikram Rao (Former CTO)",
    ownerId: "P-102",
    reliedOnClause: "PROC-1.4 v1",
    status: "Active",
    rationale: "Unilateral approval by CTO. Fully valid under PROC-1.4 v1 (threshold was ₹5,00,000). Enabled high-throughput stream metrics for core ledger services.",
    project: "Project Sentinel",
    historicalCompliance: [
      { period: "2024-08 to 2025-06", policyVersion: "PROC-1.4 v1 (Threshold ₹5L)", compliant: true, reason: "₹4L < ₹5L unilateral limit" },
      { period: "2025-07 onwards", policyVersion: "PROC-1.4 v2 (Threshold ₹2L)", compliant: false, reason: "Grandfathered contract; renewal will require CEO Aditi Sen co-signature." }
    ]
  },
  {
    id: "DEC-2025-002",
    title: "Migrate Cloud Workloads from AWS us-east-1 to Bengaluru Private DC",
    decidedOn: "2025-03-03",
    owner: "Vikram Rao (Former CTO) & Anand Verma (Sr. Infra)",
    ownerId: "P-102",
    reliedOnClause: "SOV-3.1 v1",
    status: "Active",
    rationale: "Eliminated USD cross-border ingress/egress fees saving 42% monthly burn and fulfilled upcoming DPDP Act data sovereignty obligations.",
    project: "Project Atlas",
    historicalCompliance: [
      { period: "2025-03 onwards", policyVersion: "SOV-3.1 v1", compliant: true, reason: "Strict on-prem residency achieved." }
    ]
  },
  {
    id: "DEC-2025-007",
    title: "Knowledge Continuity Protocol & Engineering Hand-off to Kavya Nair",
    decidedOn: "2025-04-15",
    owner: "Aditi Sen (CEO)",
    ownerId: "P-101",
    reliedOnClause: "SOV-3.1 v1",
    status: "Active",
    rationale: "Following Vikram Rao's departure on March 31, 2025, instantiated Keystone temporal graph to index past decision traces and eliminate onboarding knowledge debt.",
    project: "Governance"
  },
  {
    id: "DEC-2025-011",
    title: "Project Atlas Phase 1: Bi-Temporal Ledger Indexing Rollout",
    decidedOn: "2025-07-22",
    owner: "Kavya Nair (CTO) & Anand Verma",
    ownerId: "P-103",
    reliedOnClause: "SOV-3.1 v1",
    status: "Active",
    rationale: "Separated transaction event-time from graph ingestion-time to guarantee reproducible point-in-time state reconstruction for banking auditors.",
    project: "Project Atlas"
  },
  {
    id: "DEC-2025-019",
    title: "Project Atlas Phase 2: Automated 180-Day Purge Daemon Setup",
    decidedOn: "2025-11-12",
    owner: "Rohan Gupta (Ops) & Priya Sharma (Compliance)",
    ownerId: "P-104",
    reliedOnClause: "RET-2.1 v2",
    status: "Active",
    rationale: "Cron configured to purge customer raw audit buckets older than 180 days in accordance with RET-2.1 v2.",
    project: "Project Atlas",
    isStaleUnderV3: true,
    historicalCompliance: [
      { period: "2025-11 to 2026-08", policyVersion: "RET-2.1 v2 (Max 180d)", compliant: true, reason: "Purge daemon precisely matches 180-day mandate" },
      { period: "2026-09 onwards", policyVersion: "RET-2.1 v3 (Max 90d)", compliant: false, reason: "CONFLICT: Purge cron is retaining logs for 180 days while v3 mandates 90 days!" }
    ]
  },
  {
    id: "DEC-2026-003",
    title: "Deploy Local Qwen 2.5 / Ollama High-Throughput Cluster",
    decidedOn: "2026-02-18",
    owner: "Kavya Nair (CTO)",
    ownerId: "P-103",
    reliedOnClause: "SOV-3.1 v1",
    status: "Active",
    rationale: "Host 14B Qwen model locally with vLLM container to evaluate compliance prompts without any cloud API telemetry.",
    project: "Project Atlas"
  }
];

export const GRAPH_NODES = [
  // Decisions
  { id: "DEC-2024-001", label: "DEC-2024-001\n(180d Log Retention)", type: "decision", date: "2024-02-14", color: "#E04E38", glow: "#6B173E", x: 220, y: 150 },
  { id: "DEC-2024-004", label: "DEC-2024-004\n(₹4L FinCore Contract)", type: "decision", date: "2024-08-10", color: "#E04E38", glow: "#6B173E", x: 140, y: 310 },
  { id: "DEC-2025-002", label: "DEC-2025-002\n(Migrate AWS to Local DC)", type: "decision", date: "2025-03-03", color: "#E04E38", glow: "#6B173E", x: 340, y: 260 },
  { id: "DEC-2025-007", label: "DEC-2025-007\n(Knowledge Continuity)", type: "decision", date: "2025-04-15", color: "#E04E38", glow: "#6B173E", x: 490, y: 180 },
  { id: "DEC-2025-011", label: "DEC-2025-011\n(Atlas Bi-temporal)", type: "decision", date: "2025-07-22", color: "#E04E38", glow: "#6B173E", x: 580, y: 290 },
  { id: "DEC-2025-019", label: "DEC-2025-019\n(Atlas 180d Purge Daemon)", type: "decision", date: "2025-11-12", color: "#E04E38", glow: "#6B173E", x: 420, y: 400 },
  { id: "DEC-2026-003", label: "DEC-2026-003\n(Local Ollama Cluster)", type: "decision", date: "2026-02-18", color: "#E04E38", glow: "#6B173E", x: 710, y: 220 },

  // Clauses
  { id: "RET-2.1-v1", label: "RET-2.1 v1\n(Max 365d)", type: "clause", validFrom: "2024-01-01", validTo: "2024-12-31", color: "#F5A623", glow: "#B37D19", x: 300, y: 60 },
  { id: "RET-2.1-v2", label: "RET-2.1 v2\n(Max 180d)", type: "clause", validFrom: "2025-01-01", validTo: "2026-08-31", color: "#F5A623", glow: "#B37D19", x: 460, y: 60 },
  { id: "RET-2.1-v3", label: "RET-2.1 v3\n(Max 90d - DPDP)", type: "clause", validFrom: "2026-09-01", validTo: null, color: "#F5A623", glow: "#B37D19", x: 620, y: 60 },
  { id: "PROC-1.4-v1", label: "PROC-1.4 v1\n(Limit ₹5L)", type: "clause", validFrom: "2024-01-01", validTo: "2025-06-30", color: "#F5A623", glow: "#B37D19", x: 70, y: 220 },
  { id: "PROC-1.4-v2", label: "PROC-1.4 v2\n(Limit ₹2L)", type: "clause", validFrom: "2025-07-01", validTo: null, color: "#F5A623", glow: "#B37D19", x: 70, y: 410 },
  { id: "SOV-3.1-v1", label: "SOV-3.1 v1\n(Sovereign Boundary)", type: "clause", validFrom: "2025-02-15", validTo: null, color: "#F5A623", glow: "#B37D19", x: 480, y: 490 },

  // Persons
  { id: "P-101", label: "Aditi Sen\n(CEO)", type: "person", color: "#FF5A36", glow: "#E04E38", x: 380, y: 150 },
  { id: "P-102", label: "Vikram Rao\n(Ex-CTO)", type: "person", color: "#FF5A36", glow: "#E04E38", x: 190, y: 230 },
  { id: "P-103", label: "Kavya Nair\n(CTO)", type: "person", color: "#FF5A36", glow: "#E04E38", x: 670, y: 350 },
  { id: "P-104", label: "Rohan Gupta\n(Ops Lead)", type: "person", color: "#FF5A36", glow: "#E04E38", x: 310, y: 460 },
  { id: "P-105", label: "Priya Sharma\n(Compliance)", type: "person", color: "#FF5A36", glow: "#E04E38", x: 530, y: 430 },
  { id: "P-106", label: "Anand Verma\n(Infra Lead)", type: "person", color: "#FF5A36", glow: "#E04E38", x: 260, y: 360 }
];

export const GRAPH_EDGES = [
  // Decisions linked to clauses
  { source: "DEC-2024-001", target: "RET-2.1-v1", relation: "RELIED_ON", validFrom: "2024-02-14", validTo: "2024-12-31" },
  { source: "DEC-2024-001", target: "RET-2.1-v2", relation: "COMPLIANT_WITH", validFrom: "2025-01-01", validTo: "2026-08-31" },
  { source: "DEC-2024-001", target: "RET-2.1-v3", relation: "CONTRADICTED_BY", validFrom: "2026-09-01", validTo: null, isConflict: true },
  
  { source: "DEC-2024-004", target: "PROC-1.4-v1", relation: "RELIED_ON", validFrom: "2024-08-10", validTo: null },
  { source: "DEC-2025-002", target: "SOV-3.1-v1", relation: "RELIED_ON", validFrom: "2025-03-03", validTo: null },
  { source: "DEC-2025-011", target: "SOV-3.1-v1", relation: "RELIED_ON", validFrom: "2025-07-22", validTo: null },
  { source: "DEC-2025-019", target: "RET-2.1-v2", relation: "RELIED_ON", validFrom: "2025-11-12", validTo: "2026-08-31" },
  { source: "DEC-2025-019", target: "RET-2.1-v3", relation: "CONTRADICTED_BY", validFrom: "2026-09-01", validTo: null, isConflict: true },
  { source: "DEC-2026-003", target: "SOV-3.1-v1", relation: "RELIED_ON", validFrom: "2026-02-18", validTo: null },

  // Decisions made by persons
  { source: "DEC-2024-001", target: "P-102", relation: "MADE_BY", validFrom: "2024-02-14", validTo: null },
  { source: "DEC-2024-004", target: "P-102", relation: "MADE_BY", validFrom: "2024-08-10", validTo: null },
  { source: "DEC-2025-002", target: "P-102", relation: "CO_AUTHORED", validFrom: "2025-03-03", validTo: null },
  { source: "DEC-2025-002", target: "P-106", relation: "EXECUTED_BY", validFrom: "2025-03-03", validTo: null },
  { source: "DEC-2025-007", target: "P-101", relation: "MANDATED_BY", validFrom: "2025-04-15", validTo: null },
  { source: "DEC-2025-011", target: "P-103", relation: "ARCHITECTED_BY", validFrom: "2025-07-22", validTo: null },
  { source: "DEC-2025-019", target: "P-104", relation: "DEPLOYED_BY", validFrom: "2025-11-12", validTo: null },
  { source: "DEC-2025-019", target: "P-105", relation: "AUDITED_BY", validFrom: "2025-11-12", validTo: null },
  { source: "DEC-2026-003", target: "P-103", relation: "COMMISSIONED_BY", validFrom: "2026-02-18", validTo: null },

  // Policy clause lineage (SUPERSEDES)
  { source: "RET-2.1-v2", target: "RET-2.1-v1", relation: "SUPERSEDES", validFrom: "2025-01-01", validTo: null },
  { source: "RET-2.1-v3", target: "RET-2.1-v2", relation: "SUPERSEDES", validFrom: "2026-09-01", validTo: null },
  { source: "PROC-1.4-v2", target: "PROC-1.4-v1", relation: "SUPERSEDES", validFrom: "2025-07-01", validTo: null }
];

export const DEMO_QUERIES = [
  {
    id: "q-1",
    shortLabel: "Cloud Vendor Switch (2025)",
    query: "Why did we switch from AWS to a local cloud provider in 2025?",
    asOfDateSuggested: "2025-06-01",
    answer: "Nimbus Ledger transitioned workloads from AWS us-east-1 to a Bengaluru Private Datacenter on **March 3, 2025** via [DEC-2025-002]. \n\nThe decision was authored by **Vikram Rao (Former CTO)** and **Anand Verma (Sr. Infra Lead)**, grounded in the Sovereign Infrastructure Policy clause [SOV-3.1 @ v1].\n\n**Primary Rationale:**\n1. **Cost Reduction:** Eliminated variable USD egress charges, resulting in an audited **42% reduction** in recurring cloud expenditure.\n2. **Regulatory Sovereignty:** Direct adherence to upcoming India DPDP Act data residency directives prohibiting cross-border storage of domestic banking telemetry.\n\n*Graph check confirms no subsequent reversal or contradictory decision has been recorded.*",
    citations: [
      { id: "DEC-2025-002", label: "DEC-2025-002", type: "decision", date: "2025-03-03", title: "AWS to Bengaluru DC Migration" },
      { id: "SOV-3.1-v1", label: "SOV-3.1 @ v1", type: "clause", date: "2025-02-15", title: "Sovereign Data Boundary & On-Prem Inference" }
    ],
    highlightNodes: ["DEC-2025-002", "SOV-3.1-v1", "P-102", "P-106"]
  },
  {
    id: "q-2",
    shortLabel: "180-Day Retention in Q2 2025",
    query: "Was keeping customer logs for 180 days compliant in Q2 2025?",
    asOfDateSuggested: "2025-06-30",
    answer: "### Point-in-Time Compliance Assessment: **YES (COMPLIANT AT THE TIME)**\n\nAs of **Q2 2025 (evaluated at May 15, 2025)**, the active policy clause in force was [RET-2.1 @ v2] (effective Jan 1, 2025 – Aug 31, 2026), which mandated a maximum retention ceiling of **180 calendar days**.\n\n- **Historical Precedent:** The practice originated under [DEC-2024-001] (authored by Vikram Rao on Feb 14, 2024), which was initially compliant under [RET-2.1 @ v1] (365-day ceiling).\n- **Compliance at Q2 2025:** Exact match (180 days practice <= 180 days policy ceiling).\n\n⚠️ **Temporal Advisory Alert (Future Horizon):**\nWhen evaluated against the current timeline after **September 1, 2026**, the newly ratified [RET-2.1 @ v3] lowered the retention ceiling to **90 days**. Consequently, this practice has now been flagged as **STALE** by the Keystone Staleness Scanner, and an automated remediation task has been deposited into the Human-in-the-Loop Review Queue.",
    citations: [
      { id: "DEC-2024-001", label: "DEC-2024-001", type: "decision", date: "2024-02-14", title: "180d Customer Log Retention" },
      { id: "RET-2.1-v2", label: "RET-2.1 @ v2", type: "clause", date: "2025-01-01", title: "180-Day Ceiling Directive" },
      { id: "RET-2.1-v3", label: "RET-2.1 @ v3", type: "clause", date: "2026-09-01", title: "90-Day Ephemeral Mandate" }
    ],
    highlightNodes: ["DEC-2024-001", "RET-2.1-v2", "RET-2.1-v3"]
  },
  {
    id: "q-3",
    shortLabel: "Staleness Scanner & Conflicts",
    query: "Has anything changed that affects a decision we made in the past?",
    asOfDateSuggested: "2026-09-20",
    answer: "### Proactive Contradiction Scanner: **2 CRITICAL STALENESS FLAGS DETECTED**\n\nThe activation of policy update [RET-2.1 @ v3] on September 1, 2026 has rendered two historically valid engineering decisions obsolete:\n\n1. **[DEC-2024-001] (180-Day Log Retention Window):**\n   - *Past Rule:* [RET-2.1 @ v1] allowed up to 365 days; [RET-2.1 @ v2] allowed 180 days.\n   - *Current Rule:* [RET-2.1 @ v3] strictly restricts raw log retention to **90 days**.\n   - *Conflict:* Retention duration exceeds the statutory ceiling by 90 days.\n\n2. **[DEC-2025-019] (Automated Purge Cron Daemon):**\n   - *Current Config:* Cron currently purges partitions older than 180 days.\n   - *Required Config:* Daemon must be recalibrated to purge partitions older than 90 days.\n\n⚡ **Automated Action Staged:** Keystone has drafted a configuration patch action into the **Human-in-the-Loop Review Queue** to update the cron pipeline via MCP tool `mcp://internal-devops/update-config` upon admin sign-off.",
    citations: [
      { id: "DEC-2024-001", label: "DEC-2024-001", type: "decision", date: "2024-02-14", title: "Log Retention Window" },
      { id: "DEC-2025-019", label: "DEC-2025-019", type: "decision", date: "2025-11-12", title: "Purge Daemon Setup" },
      { id: "RET-2.1-v3", label: "RET-2.1 @ v3", type: "clause", date: "2026-09-01", title: "90-Day Policy Enactment" }
    ],
    highlightNodes: ["DEC-2024-001", "DEC-2025-019", "RET-2.1-v3"]
  },
  {
    id: "q-4",
    shortLabel: "History of Project Atlas",
    query: "Show the history of Project Atlas.",
    asOfDateSuggested: "2026-09-24",
    answer: "### Project Atlas — Bi-Temporal Knowledge Trace & Lineage\n\nTraversing the organizational graph reveals 3 major sequential turning points for **Project Atlas**:\n\n1. **2025-03-03 — [DEC-2025-002] Infrastructure Sovereignty Migration:**\n   - *Owners:* Vikram Rao (Former CTO) & Anand Verma.\n   - Relocated core ledger and Kafka nodes from AWS us-east-1 to local Bengaluru datacenter to enforce sovereign boundary under [SOV-3.1 @ v1].\n\n2. **2025-07-22 — [DEC-2025-011] Bi-Temporal Ledger Indexing Rollout:**\n   - *Owners:* Kavya Nair (CTO) & Anand Verma.\n   - Implemented point-in-time state reconstruction ensuring valid-time and transaction-time are indexed independently for audit reproducibility.\n\n3. **2025-11-12 — [DEC-2025-019] Automated 180-Day Purge Daemon Setup:**\n   - *Owners:* Rohan Gupta & Priya Sharma.\n   - Configured retention purger against [RET-2.1 @ v2]. *(Currently flagged for 90-day update)*.\n\n4. **2026-02-18 — [DEC-2026-003] Local Ollama Cluster Commissioning:**\n   - *Owner:* Kavya Nair.\n   - Dedicated GPU node deployed for zero-cloud LLM inference.",
    citations: [
      { id: "DEC-2025-002", label: "DEC-2025-002", type: "decision", date: "2025-03-03", title: "AWS to Bengaluru DC Migration" },
      { id: "DEC-2025-011", label: "DEC-2025-011", type: "decision", date: "2025-07-22", title: "Atlas Bi-temporal Architecture" },
      { id: "DEC-2025-019", label: "DEC-2025-019", type: "decision", date: "2025-11-12", title: "Automated Purge Daemon" },
      { id: "DEC-2026-003", label: "DEC-2026-003", type: "decision", date: "2026-02-18", title: "Local Ollama Cluster" }
    ],
    highlightNodes: ["DEC-2025-002", "DEC-2025-011", "DEC-2025-019", "DEC-2026-003", "SOV-3.1-v1"]
  },
  {
    id: "q-5",
    shortLabel: "Trick Query (MongoDB Choice)",
    query: "Why did we choose MongoDB?",
    asOfDateSuggested: "2026-09-24",
    answer: "### 🛑 Clean Refusal — No Ungrounded Hallucination\n\n**I have no recorded decision regarding MongoDB in the Nimbus Ledger knowledge graph.**\n\n- No document, meeting note, or architectural decision record (ADR) mentions MongoDB as an approved or considered persistence store.\n- Core ledger stores in the graph are strictly registered as **PostgreSQL (relational & pgvector)** and **Graphiti/FalkorDB (temporal graph engine)** under [DEC-2025-011].\n\n*Keystone strictly refuses to synthesize hypothetical justifications when provenance edges are absent.*",
    citations: [],
    highlightNodes: []
  }
];

export const INITIAL_REVIEW_QUEUE = [
  {
    id: "ACT-809",
    proposedAction: "Reconfigure Kafka Log Purge Daemon from 180d to 90d TTL",
    reasoningChain: "Staleness scanner triggered by activation of RET-2.1 v3 (Sep 2026, 90-day max). Past decision DEC-2025-019 is in violation. Updating config ensures compliance with RBI Digital Lending directives.",
    targetMcpTool: "mcp://internal-devops/update-config",
    parameters: { service: "kafka-telemetry-purger", ttl_days: 90, dry_run: false },
    status: "Pending Approval",
    createdAt: "2026-09-21T08:14:22Z",
    sourceDecisionId: "DEC-2025-019",
    sourceClauseId: "RET-2.1 v3",
    severity: "CRITICAL"
  },
  {
    id: "ACT-810",
    proposedAction: "Generate CEO Dual-Signoff Packet for FinCore Telemetry Renewal",
    reasoningChain: "FinCore annual contract (₹4,00,000) originally approved under PROC-1.4 v1. Under current PROC-1.4 v2, spend exceeding ₹2,00,000 requires CEO Aditi Sen co-signature. Preparing review packet for approval.",
    targetMcpTool: "mcp://finance-mailer/stage-executive-docket",
    parameters: { vendor: "FinCore Telemetry Inc.", amount_inr: 400000, required_signoff: "P-101 (CEO)" },
    status: "Pending Approval",
    createdAt: "2026-09-23T11:45:10Z",
    sourceDecisionId: "DEC-2024-004",
    sourceClauseId: "PROC-1.4 v2",
    severity: "HIGH"
  },
  {
    id: "ACT-811",
    proposedAction: "Dispatch DPDP 2026 Read-State Attestation to Compliance Lead",
    reasoningChain: "Audit log integrity check verified 18 blocks without alteration. Packaging sovereign local hash verification certificate for Priya Sharma (Compliance & Risk Lead).",
    targetMcpTool: "mcp://compliance-registry/publish-attestation",
    parameters: { recipient: "priya.sharma@nimbusledger.in", format: "JSON-LD+SHA256" },
    status: "Pending Approval",
    createdAt: "2026-09-24T14:02:00Z",
    sourceDecisionId: "DEC-2025-007",
    sourceClauseId: "SOV-3.1 v1",
    severity: "LOW"
  }
];

export const INITIAL_AUDIT_LOGS = [
  {
    blockHeight: 104,
    timestamp: "2026-09-24 16:30:12 UTC",
    actor: "Priya Sharma (Compliance Lead)",
    action: "VERIFY_POLICY_COMPLIANCE",
    targetTool: "keystone.evaluator.point_in_time",
    sourceGraphIds: ["DEC-2024-001", "RET-2.1-v2"],
    prevHash: "7b4c91a0398f6217e4f1a238914bca81907de385e2b0cd2947116f39401bfd82",
    blockHash: "9a811c7e90f4e45d6291a58066f1082c5a71ebec48f58d0429a3e63989c8a912",
    integrityStatus: "Verified"
  },
  {
    blockHeight: 103,
    timestamp: "2026-09-23 18:12:44 UTC",
    actor: "Kavya Nair (CTO)",
    action: "INGEST_POLICY_VERSION",
    targetTool: "keystone.ingestion.policy_parser",
    sourceGraphIds: ["POL-RET-2024", "RET-2.1-v3"],
    prevHash: "51c4a919864d4b1a82efd978a3c983d5a1094ef2981bc893a74659f138841a54",
    blockHash: "7b4c91a0398f6217e4f1a238914bca81907de385e2b0cd2947116f39401bfd82",
    integrityStatus: "Verified"
  },
  {
    blockHeight: 102,
    timestamp: "2026-09-22 09:05:19 UTC",
    actor: "Anand Verma (Infra Lead)",
    action: "EXECUTE_APPROVED_MCP_TASK",
    targetTool: "mcp://internal-devops/mount-volume",
    sourceGraphIds: ["DEC-2026-003", "SOV-3.1-v1"],
    prevHash: "29f8a31874b219e5cc401a88df54b123985ea81b0a884f1a8c9b917c093a8d11",
    blockHash: "51c4a919864d4b1a82efd978a3c983d5a1094ef2981bc893a74659f138841a54",
    integrityStatus: "Verified"
  },
  {
    blockHeight: 101,
    timestamp: "2026-09-21 14:40:02 UTC",
    actor: "Aditi Sen (CEO)",
    action: "APPROVE_REVIEW_QUEUE_ACTION",
    targetTool: "mcp://executive-ledger/endorse",
    sourceGraphIds: ["DEC-2025-007"],
    prevHash: "0000000000000000000000000000000000000000000000000000000000000000",
    blockHash: "29f8a31874b219e5cc401a88df54b123985ea81b0a884f1a8c9b917c093a8d11",
    integrityStatus: "Genesis_Root"
  }
];

export const TIMELINE_POINTS = [
  { date: "2024-01-01", label: "Jan 2024", event: "RET-2.1 v1 active (Max 365d)" },
  { date: "2024-02-14", label: "Feb 2024", event: "DEC-2024-001 (180d log policy chosen)" },
  { date: "2024-08-10", label: "Aug 2024", event: "DEC-2024-004 (₹4L FinCore contract signed)" },
  { date: "2025-01-01", label: "Jan 2025", event: "RET-2.1 v2 active (Max 180d)" },
  { date: "2025-03-03", label: "Mar 2025", event: "DEC-2025-002 (AWS to Local DC migration)" },
  { date: "2025-03-31", label: "Mar 2025", event: "Vikram Rao departs (Knowledge-loss risk)" },
  { date: "2025-04-15", label: "Apr 2025", event: "Kavya Nair joins; Keystone protocol instituted" },
  { date: "2025-07-01", label: "Jul 2025", event: "PROC-1.4 v2 active (Threshold reduced to ₹2L)" },
  { date: "2025-07-22", label: "Jul 2025", event: "DEC-2025-011 (Project Atlas bi-temporal rollout)" },
  { date: "2025-11-12", label: "Nov 2025", event: "DEC-2025-019 (180d Purge cron deployed)" },
  { date: "2026-02-18", label: "Feb 2026", event: "DEC-2026-003 (Local Ollama cluster deployed)" },
  { date: "2026-09-01", label: "Sep 2026", event: "RET-2.1 v3 active (Max 90d, DPDP Act)" },
  { date: "2026-09-24", label: "Current (Sep 2026)", event: "Live Evaluation & Conflict Resolution" }
];
