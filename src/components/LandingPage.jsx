import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  ArrowRight, 
  Clock, 
  GitBranch, 
  Terminal, 
  CheckCircle2, 
  Lock, 
  AlertTriangle, 
  Sparkles, 
  Key, 
  FileText,
  Layers,
  Info
} from 'lucide-react';
import Logo from './Logo';
import { day } from '../utils/format';
import { healthCheck } from '../api';

export default function LandingPage({ onLaunchConsole }) {
  const [activeTab, setActiveTab] = useState('temporal');
  const [sliderPreviewDate, setSliderPreviewDate] = useState('2025-06-30');
  const [activeWorkflowStep, setActiveWorkflowStep] = useState(2);
  // Real status: backend up and it can reach Ollama with both models (null = not checked yet).
  const [engineOk, setEngineOk] = useState(null);
  useEffect(() => {
    healthCheck().then(h => setEngineOk(!!h && !!h.ollama && Object.values(h.ollama).every(v => v === true)));
  }, []);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const workflowSteps = [
    {
      num: "01",
      title: "Ingest Docs",
      subtitle: "Front-matter & Dates",
      desc: "Meeting notes, policy versions, and decision logs as Markdown, each with its real date in front-matter.",
      tag: "PostgreSQL Records",
      color: "badge-note-lavender"
    },
    {
      num: "02",
      title: "Build Graph",
      subtitle: "Bi-Temporal Triples",
      desc: "Graphiti on Neo4j indexes entities, decisions, and clauses with independent valid-time axes.",
      tag: "Neo4j Temporal Graph",
      color: "badge-note-sky"
    },
    {
      num: "03",
      title: "Query 'As-Of' Date",
      subtitle: "Point-in-Time Traversal",
      desc: "Evaluate any historical event against the exact policy version in force on that date.",
      tag: "Hybrid Traversal",
      color: "badge-note-amber"
    },
    {
      num: "04",
      title: "Sourced Answer",
      subtitle: "Forced Provenance",
      desc: "Every sentence cites a node ID. With no recorded evidence it answers “I have no recorded decision about that”.",
      tag: "Local Qwen, Grounded",
      color: "badge-note-green"
    },
    {
      num: "05",
      title: "Human Approval",
      subtitle: "Gated Action",
      desc: "Actions land in the review queue. Only a human approval lets the executor act (today: an email file in outbox/).",
      tag: "SHA-256 Audit Trail",
      color: "badge-note-green"
    }
  ];

  return (
    <div className="relative min-h-screen bg-ks-bg text-ks-text overflow-x-hidden">
      {/* Subtle Sky Ambient Blurs */}
      <div className="absolute top-0 left-1/3 w-96 h-96 bg-ks-orange/6 rounded-full filter blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-10 w-96 h-96 bg-ks-brown/8 rounded-full filter blur-3xl pointer-events-none" />

      {/* Navigation Bar */}
      <nav className="sticky top-0 z-40 w-full bg-ks-surface/80 backdrop-blur-md border-b border-ks-line/80 px-6 py-4 flex items-center justify-between">
        <Logo size={32} subtitle="SOVEREIGN DECISION MEMORY" />

        <div className="hidden md:flex items-center gap-6 text-xs font-mono">
          <a href="#features" className="text-ks-muted hover:text-ks-text transition-colors">
            Core Features
          </a>
          <a href="#workflow" className="text-ks-muted hover:text-ks-text transition-colors">
            5-Stage Pipeline
          </a>
          <a href="#comparison" className="text-ks-muted hover:text-ks-text transition-colors">
            Architecture Matrix
          </a>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] ${engineOk === false ? 'badge-note-rose' : 'badge-note-green'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${engineOk === false ? 'bg-ks-red' : 'bg-ks-ok animate-ping'}`}></span>
            <span>{engineOk === null ? 'Checking local engine…' : engineOk ? 'Local Engine Active' : 'Local model unreachable'}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowLoginModal(true)}
            className="px-4 py-2 rounded-lg btn-sky-gradient text-ks-on-accent text-xs font-mono font-medium flex items-center gap-2 group cursor-pointer shadow-sm"
          >
            <span>Sign In / Launch Console</span>
            <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-16 pb-16 px-6 max-w-5xl mx-auto flex flex-col items-center text-center">
        {/* Soft Track Pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full badge-note-sky text-xs font-mono mb-6 shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-ks-orange"></span>
          <span>TRACK 1: SOVEREIGN AI</span>
          <span className="text-ks-subtle">|</span>
          <span>TEMPORAL KNOWLEDGE GRAPH</span>
        </div>

        {/* Primary Headline */}
        <h1 className="text-4xl md:text-6xl font-bold font-heading tracking-tight leading-tight max-w-4xl text-ks-text">
          A Sovereign AI That Remembers <span className="text-ks-orange">Why Every Decision Was Made.</span>
        </h1>

        {/* Subheadline */}
        <p className="mt-5 text-base md:text-lg text-ks-muted max-w-2xl font-sans leading-relaxed">
          Link every organizational decision to the exact policy clause version and timestamp in force. 
          Point-in-time compliance, cited answers, and a human approval before anything is executed.
        </p>

        {/* Action CTAs */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
          <button
            onClick={() => setShowLoginModal(true)}
            className="px-6 py-3.5 rounded-xl btn-sky-gradient text-ks-on-accent text-sm font-mono font-semibold flex items-center gap-2 shadow-md hover:scale-102 transition-all cursor-pointer"
          >
            <Sparkles size={16} />
            <span>Launch Sovereign Console</span>
            <ArrowRight size={16} />
          </button>

          <a
            href="#workflow"
            className="px-5 py-3 rounded-xl bg-ks-surface hover:bg-ks-raised border border-ks-line text-xs font-mono text-ks-text flex items-center gap-2 transition-colors shadow-2xs"
          >
            <GitBranch size={15} className="text-ks-orange" />
            <span>Explore 5-Stage Architecture</span>
          </a>
        </div>

        {/* Metric Notes Grid */}
        <div className="mt-12 w-full grid grid-cols-2 md:grid-cols-4 gap-3 text-left">
          <div className="paper-sheet p-3.5">
            <div className="font-mono text-lg font-bold text-ks-text flex items-center gap-1.5">
              <span>Point-in-Time</span>
              <CheckCircle2 size={16} className="text-ks-ok" />
            </div>
            <div className="text-[11px] font-mono text-ks-muted mt-0.5">
              Reconstructs exact rules active then
            </div>
          </div>

          <div className="paper-sheet p-3.5">
            <div className="font-mono text-lg font-bold text-ks-orange flex items-center gap-1.5">
              <span>Bi-Temporal</span>
              <Clock size={16} className="text-ks-orange" />
            </div>
            <div className="text-[11px] font-mono text-ks-muted mt-0.5">
              Valid-time + Ingestion-time tracking
            </div>
          </div>

          <div className="paper-sheet p-3.5">
            <div className="font-mono text-lg font-bold text-ks-gold flex items-center gap-1.5">
              <span>SHA-256</span>
              <ShieldCheck size={16} className="text-ks-gold" />
            </div>
            <div className="text-[11px] font-mono text-ks-muted mt-0.5">
              Tamper-evident hash-chained audit trail
            </div>
          </div>

          <div className="paper-sheet p-3.5">
            <div className="font-mono text-lg font-bold text-ks-ok flex items-center gap-1.5">
              <span>Runs Locally</span>
              <Lock size={16} className="text-ks-ok" />
            </div>
            <div className="text-[11px] font-mono text-ks-muted mt-0.5">
              Ollama + Neo4j, no cloud APIs, telemetry off
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Feature Showcase Section */}
      <section id="features" className="py-14 px-6 max-w-5xl mx-auto border-t border-ks-line/80">
        <div className="text-center mb-8">
          <span className="font-mono text-xs text-ks-orange uppercase tracking-wider font-semibold">
            Interactive Feature Showcase
          </span>
          <h2 className="text-2xl md:text-3xl font-heading font-bold text-ks-text mt-1">
            Beyond Flat RAG: Structured Temporal Governance
          </h2>
          <p className="text-xs font-sans text-ks-muted max-w-xl mx-auto mt-2">
            Ordinary search engines retrieve words. Keystone understands which rule had authority at the moment of execution.
          </p>
        </div>

        {/* Feature Tab Selector (Tabbed Notes Metaphor) */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
          {[
            { id: 'temporal', label: '1. Temporal "As-Of" Context', icon: Clock },
            { id: 'clause', label: '2. Clause-Level Compliance', icon: FileText },
            { id: 'staleness', label: '3. Policy Impact', icon: AlertTriangle },
            { id: 'gated', label: '4. Gated Execution', icon: Lock }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-xl text-xs font-mono flex items-center gap-2 border transition-all cursor-pointer ${
                  isActive
                    ? 'bg-ks-orange/10 border-ks-orange/40 text-ks-orange font-semibold shadow-xs'
                    : 'bg-ks-surface border-ks-line text-ks-muted hover:border-ks-line-strong hover:text-ks-text'
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab 1: Temporal Context */}
        {activeTab === 'temporal' && (
          <div className="paper-sheet p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
            <div className="space-y-3.5">
              <div className="inline-block px-2.5 py-0.5 rounded-md badge-note-sky font-mono text-[11px] font-semibold">
                DEMONSTRATION 1
              </div>
              <h3 className="text-lg font-heading font-bold text-ks-text">
                The "As-Of" Date Horizon Engine
              </h3>
              <p className="text-xs text-ks-muted leading-relaxed">
                When an auditor asks if a 2024 vendor contract complied with internal policy, Keystone rewinds graph traversal to that exact timestamp. It evaluates against the rules valid then, not subsequent amendments.
              </p>

              <div className="p-3 rounded-xl bg-ks-raised border border-ks-line font-mono text-xs space-y-2">
                <div className="flex justify-between text-ks-muted">
                  <span>INTERACTIVE HORIZON SLIDER:</span>
                  <span className="text-ks-orange font-bold">{day(sliderPreviewDate)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="1"
                  value={sliderPreviewDate === '2024-09-01' ? 0 : sliderPreviewDate === '2025-06-30' ? 1 : 2}
                  onChange={(e) => {
                    const vals = ['2024-09-01', '2025-06-30', '2026-09-28'];
                    setSliderPreviewDate(vals[parseInt(e.target.value)]);
                  }}
                  className="w-full accent-ks-orange cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-ks-muted">
                  <span>Sep 2024 (v1 Active)</span>
                  <span>Jun 2025 (v2 Active)</span>
                  <span>Sep 2026 (v3 Active)</span>
                </div>
              </div>

              <div className="text-xs font-mono p-2.5 rounded-lg bg-ks-surface border border-ks-line text-ks-text shadow-2xs">
                {sliderPreviewDate === '2024-09-01' && "Policy in force: RET-2.1 v1 (max 365 days). DEC-007 does not exist yet; DEC-002 (300 days) is compliant."}
                {sliderPreviewDate === '2025-06-30' && "Policy in force: RET-2.1 v2 (max 180 days). DEC-007 (180 days) is compliant, exactly at the limit."}
                {sliderPreviewDate === '2026-09-28' && "Policy in force: RET-2.1 v3 (max 90 days). DEC-007 (180 days) is flagged: still breaching the new rule."}
              </div>
            </div>

            <div className="bg-ks-raised rounded-xl p-4 border border-ks-line font-mono text-xs">
              <div className="text-[11px] text-ks-muted border-b border-ks-line pb-2 mb-3 flex items-center justify-between">
                <span>GRAPH RETRIEVAL PAYLOAD</span>
                <span className="text-ks-ok font-medium">ILLUSTRATIVE</span>
              </div>
              <pre className="text-[11px] text-ks-orange overflow-x-auto leading-relaxed">
{`{
  "query": "Is 180d log retention compliant?",
  "evaluation_horizon": "${sliderPreviewDate}",
  "active_clause": "${sliderPreviewDate < '2025-01-06' ? 'RET-2.1@v1 (365d)' : sliderPreviewDate < '2026-09-28' ? 'RET-2.1@v2 (180d)' : 'RET-2.1@v3 (90d)'}",
  "verdict": "${sliderPreviewDate < '2025-06-18' ? 'NOT_YET_DECIDED' : sliderPreviewDate < '2026-09-28' ? 'COMPLIANT' : 'ONGOING_PRACTICE_BREACH'}",
  "provenance_chain": [
    "DEC-007 -> RELIED_ON -> RET-2.1@v2",
    "Source doc: decisions/DEC-007.md"
  ]
}`}
              </pre>
            </div>
          </div>
        )}

        {/* Tab 2: Clause-Level Compliance */}
        {activeTab === 'clause' && (
          <div className="paper-sheet p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
            <div className="space-y-3.5">
              <div className="inline-block px-2.5 py-0.5 rounded-md badge-note-amber font-mono text-[11px] font-semibold">
                STRUCTURED ONTOLOGY
              </div>
              <h3 className="text-lg font-heading font-bold text-ks-text">
                Clause-Level Linking, Not Just Flat PDFs
              </h3>
              <p className="text-xs text-ks-muted leading-relaxed">
                Standard enterprise search cites a 40-page PDF and leaves the human to figure it out. Keystone extracts structured clauses (<span className="text-ks-orange font-mono font-medium">RET-2.1</span>, <span className="text-ks-orange font-mono font-medium">PROC-1.4</span>) with numeric parameters (<span className="text-ks-orange font-mono">retention_days: 90</span>, <span className="text-ks-orange font-mono">threshold_inr: 200000</span>).
              </p>
              <div className="flex items-center gap-2 text-xs font-mono text-ks-ok">
                <CheckCircle2 size={15} />
                <span>Deterministic checks first, LLM natural language explanation second.</span>
              </div>
            </div>

            <div className="space-y-2 font-mono text-xs">
              <div className="p-3 rounded-lg bg-ks-raised border border-ks-line">
                <div className="flex justify-between text-ks-text font-bold text-[11px]">
                  <span>CLAUSE: RET-2.1 v1</span>
                  <span className="text-ks-muted">Jan 2024 – Dec 2024</span>
                </div>
                <div className="text-ks-muted text-[11px] mt-1">Customer raw log retention ceiling: 365 Days</div>
              </div>
              <div className="p-3 rounded-lg bg-ks-raised border border-ks-line">
                <div className="flex justify-between text-ks-text font-bold text-[11px]">
                  <span>CLAUSE: RET-2.1 v2</span>
                  <span className="text-ks-muted">Jan 2025 – Sep 2026</span>
                </div>
                <div className="text-ks-muted text-[11px] mt-1">Tightened ceiling: 180 Days</div>
              </div>
              <div className="p-3 rounded-lg bg-ks-orange/10 border border-ks-orange/25">
                <div className="flex justify-between text-ks-orange font-bold text-[11px]">
                  <span>CLAUSE: RET-2.1 v3 (Current)</span>
                  <span className="text-ks-muted">Sep 2026 – Present</span>
                </div>
                <div className="text-ks-text text-[11px] mt-1">Strict ceiling: 90 Days</div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Staleness Scanner */}
        {activeTab === 'staleness' && (
          <div className="paper-sheet p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
            <div className="space-y-3.5">
              <div className="inline-block px-2.5 py-0.5 rounded-md badge-note-amber font-mono text-[11px] font-semibold">
                PROACTIVE SCANNER
              </div>
              <h3 className="text-lg font-heading font-bold text-ks-text">
                Policy Impact Scanner
              </h3>
              <p className="text-xs text-ks-muted leading-relaxed">
                Rather than waiting for an auditor to discover a discrepancy, ingesting a new policy version immediately triggers Keystone's policy impact scanner. It locates every still-active decision relying on obsolete clauses and raises a staged remediation proposal.
              </p>
              <div className="p-3 rounded-lg badge-note-amber text-xs font-mono flex items-center gap-2">
                <Info size={15} className="shrink-0" />
                <span>Automatically flags DEC-007 (180 days) when RET-2.1 v3 (90 days) is uploaded.</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-ks-raised border border-ks-line font-mono text-xs space-y-1.5">
              <div className="text-[11px] text-ks-muted">EXAMPLE SCANNER OUTPUT</div>
              <div className="text-ks-red-text font-bold">[FLAG]: ONGOING_PRACTICE_BREACH</div>
              <div className="text-ks-text-2 text-[11px]">
                Target: DEC-007 (180-day customer log retention)<br/>
                Old Clause: RET-2.1 v2 (180d)<br/>
                New Clause: RET-2.1 v3 (90d)<br/>
                Action Staged: notification proposal in the review queue
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Gated MCP Execution */}
        {activeTab === 'gated' && (
          <div className="paper-sheet p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
            <div className="space-y-3.5">
              <div className="inline-block px-2.5 py-0.5 rounded-md badge-note-green font-mono text-[11px] font-semibold">
                HUMAN APPROVAL GATE
              </div>
              <h3 className="text-lg font-heading font-bold text-ks-text">
                Nothing Runs Without a Human Approval
              </h3>
              <p className="text-xs text-ks-muted leading-relaxed">
                The local model has no tools and no credentials: the scanner (and any MCP client) can only create a proposal. A human clicks Approve; only then does the separate executor act. Today it writes the notification as an email file to outbox/. The approval and the execution are appended to the hash-chained audit log.
              </p>
              <div className="text-xs font-mono text-ks-ok flex items-center gap-1.5">
                <ShieldCheck size={15} />
                <span>Every approval and execution is an audit-log row.</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-ks-raised border border-ks-line font-mono text-xs space-y-1.5">
              <div className="flex justify-between text-[11px] text-ks-muted">
                <span>EXAMPLE FLOW (DEMO DATA)</span>
              </div>
              <div className="text-xs text-ks-text-2 bg-ks-surface p-2 rounded border border-ks-line">
                1. Scanner: flagged DEC-007 against RET-2.1@v3<br/>
                2. Human: a reviewer approves the proposal<br/>
                3. Executor: wrote outbox/proposal-N.eml<br/>
                4. Audit: row appended with SHA-256 hash chain
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 5-Stage Architecture Flow Graphic */}
      <section id="workflow" className="py-14 px-6 max-w-5xl mx-auto border-t border-ks-line/80">
        <div className="text-center mb-10">
          <span className="font-mono text-xs text-ks-orange uppercase tracking-wider font-semibold">
            The Brief's Five Stages
          </span>
          <h2 className="text-2xl md:text-3xl font-heading font-bold text-ks-text mt-1">
            Data → Knowledge → Memory → Reasoning → Action
          </h2>
          <p className="text-xs font-sans text-ks-muted max-w-xl mx-auto mt-2">
            Many systems stop at retrieval. Keystone goes all the way to gated, auditable action.
          </p>
        </div>

        {/* Step Flow Notes */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {workflowSteps.map((step, idx) => {
            const isSelected = activeWorkflowStep === idx;
            return (
              <div
                key={idx}
                onClick={() => setActiveWorkflowStep(idx)}
                className={`paper-sheet p-4 cursor-pointer flex flex-col justify-between transition-all ${
                  isSelected ? 'border-ks-orange/60 ring-2 ring-ks-orange/20 bg-ks-orange/5' : 'hover:border-ks-line-strong'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs text-ks-orange font-bold">{step.num}</span>
                    <span className="text-[11px] font-mono px-1.5 py-0.2 rounded bg-ks-raised-2 text-ks-muted">
                      STAGE {idx + 1}
                    </span>
                  </div>
                  <h4 className="font-heading font-semibold text-sm text-ks-text">
                    {step.title}
                  </h4>
                  <div className="text-[11px] font-mono text-ks-orange mt-0.5 font-medium">
                    {step.subtitle}
                  </div>
                  <p className="text-[11px] text-ks-muted mt-2 leading-snug">
                    {step.desc}
                  </p>
                </div>

                <div className="mt-4 pt-2 border-t border-ks-line font-mono text-[11px]">
                  <span className={`px-1.5 py-0.5 rounded-md ${step.color}`}>
                    {step.tag}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Comparison Matrix */}
      <section id="comparison" className="py-14 px-6 max-w-5xl mx-auto border-t border-ks-line/80">
        <div className="text-center mb-8">
          <span className="font-mono text-xs text-ks-orange uppercase tracking-wider font-semibold">
            Competitive Differentiation
          </span>
          <h2 className="text-2xl md:text-3xl font-heading font-bold text-ks-text mt-1">
            How Keystone Differs
          </h2>
        </div>

        <div className="paper-sheet overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-ks-raised/80 border-b border-ks-line font-mono text-[11px] text-ks-text">
                <th className="py-3 px-4">Architecture</th>
                <th className="py-3 px-4">Core Capability</th>
                <th className="py-3 px-4">Critical Deficiency</th>
                <th className="py-3 px-4">Keystone Advantage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ks-line font-sans text-xs">
              <tr className="hover:bg-ks-raised/50">
                <td className="py-3 px-4 font-mono font-bold text-ks-text">Vector RAG / Chatbots</td>
                <td className="py-3 px-4 text-ks-muted">Finds similar text snippets</td>
                <td className="py-3 px-4 text-ks-red-text">Cannot answer which policy version applied on past date</td>
                <td className="py-3 px-4 text-ks-ok font-mono font-medium">Bi-temporal valid-time edges</td>
              </tr>
              <tr className="hover:bg-ks-raised/50">
                <td className="py-3 px-4 font-mono font-bold text-ks-text">ADRs / Notion Logs</td>
                <td className="py-3 px-4 text-ks-muted">Captures a decision once</td>
                <td className="py-3 px-4 text-ks-red-text">Static; never flags when a past decision goes stale</td>
                <td className="py-3 px-4 text-ks-ok font-mono font-medium">Policy impact scanner</td>
              </tr>
              <tr className="hover:bg-ks-raised/50">
                <td className="py-3 px-4 font-mono font-bold text-ks-text">Enterprise AI (Obin AI, Sphere)</td>
                <td className="py-3 px-4 text-ks-muted">Governed AI for large institutions</td>
                <td className="py-3 px-4 text-ks-red-text">Enterprise sales; not built for 10–50 person teams</td>
                <td className="py-3 px-4 text-ks-ok font-mono font-medium">Open & self-hostable in 1 Docker</td>
              </tr>
              <tr className="hover:bg-ks-orange/5 bg-ks-orange/5">
                <td className="py-3 px-4 font-mono font-bold text-ks-orange">Keystone Sovereign Engine</td>
                <td className="py-3 px-4 text-ks-text">Decisions + Clauses + Time + Actions</td>
                <td className="py-3 px-4 text-ks-muted font-medium">Single-tenant; extraction needs human review; demo data is synthetic</td>
                <td className="py-3 px-4 text-ks-orange font-mono font-bold">Self-hosted, every answer cited</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Sign-In Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ks-bg/70 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-md paper-sheet-elevated p-6 relative">
            <button
              onClick={() => setShowLoginModal(false)}
              className="absolute top-4 right-4 text-ks-muted hover:text-ks-text text-xs font-mono cursor-pointer"
            >
              ✕ Close
            </button>

            <div className="flex items-center gap-2 mb-4">
              <Key size={18} className="text-ks-orange" />
              <h3 className="font-heading font-bold text-base text-ks-text">
                Enter Workspace
              </h3>
            </div>

            <p className="text-xs text-ks-muted mb-4">
              Nimbus Ledger demo workspace. Pick a role to continue as:
            </p>

            <div className="space-y-2 mb-4">
              <button
                onClick={() => {
                  setShowLoginModal(false);
                  onLaunchConsole("p-priya", "Priya Menon (Ops Lead)");
                }}
                className="w-full p-3 rounded-xl bg-ks-surface hover:bg-ks-orange/10 border border-ks-line hover:border-ks-orange/25 text-left flex items-center justify-between text-xs transition-colors group cursor-pointer shadow-2xs"
              >
                <div>
                  <div className="font-heading font-semibold text-ks-text group-hover:text-ks-orange">
                    Priya Menon
                  </div>
                  <div className="text-[12px] font-mono text-ks-muted">
                    Role: Ops Lead
                  </div>
                </div>
                <span className="text-[12px] font-mono text-ks-orange font-medium">Select Role →</span>
              </button>

              <button
                onClick={() => {
                  setShowLoginModal(false);
                  onLaunchConsole("p-karthik", "Karthik Rao (CTO)");
                }}
                className="w-full p-3 rounded-xl bg-ks-surface hover:bg-ks-orange/10 border border-ks-line hover:border-ks-orange/25 text-left flex items-center justify-between text-xs transition-colors group cursor-pointer shadow-2xs"
              >
                <div>
                  <div className="font-heading font-semibold text-ks-text group-hover:text-ks-orange">
                    Karthik Rao
                  </div>
                  <div className="text-[12px] font-mono text-ks-muted">
                    Role: Chief Technology Officer
                  </div>
                </div>
                <span className="text-[12px] font-mono text-ks-orange font-medium">Select Role →</span>
              </button>

              <button
                onClick={() => {
                  setShowLoginModal(false);
                  onLaunchConsole("p-ananya", "Ananya Rao (CEO)");
                }}
                className="w-full p-3 rounded-xl bg-ks-surface hover:bg-ks-orange/10 border border-ks-line hover:border-ks-orange/25 text-left flex items-center justify-between text-xs transition-colors group cursor-pointer shadow-2xs"
              >
                <div>
                  <div className="font-heading font-semibold text-ks-text group-hover:text-ks-orange">
                    Ananya Rao
                  </div>
                  <div className="text-[12px] font-mono text-ks-muted">
                    Role: Chief Executive Officer
                  </div>
                </div>
                <span className="text-[12px] font-mono text-ks-orange font-medium">Select Role →</span>
              </button>
            </div>

            <div className="pt-3 border-t border-ks-line">
              <button
                onClick={() => {
                  setShowLoginModal(false);
                  onLaunchConsole("nitika", "Nitika (Keystone Admin)");
                }}
                className="w-full py-2.5 rounded-lg btn-sky-gradient text-ks-on-accent text-xs font-mono font-medium flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Terminal size={13} />
                <span>Continue as Keystone Admin</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-ks-line text-center text-xs font-mono text-ks-muted bg-ks-surface">
        <div className="flex flex-wrap items-center justify-center gap-4 mb-2">
          <span>Keystone Sovereign AI</span>
          <span>•</span>
          <span>ASYNC'26 Track 1 (Sovereign AI)</span>
          <span>•</span>
          <span>PostgreSQL + Neo4j/Graphiti + Ollama</span>
        </div>
        <div className="text-[11px] text-ks-muted">
          Built for small regulated teams that need an auditable record of which rule applied when.
        </div>
      </footer>
    </div>
  );
}
