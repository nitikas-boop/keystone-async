import React, { useState } from 'react';
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

export default function LandingPage({ onLaunchConsole }) {
  const [activeTab, setActiveTab] = useState('temporal');
  const [sliderPreviewDate, setSliderPreviewDate] = useState('2025-05-15');
  const [activeWorkflowStep, setActiveWorkflowStep] = useState(2);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('sk-sov-nimbus-ledger-2026-prod');

  const workflowSteps = [
    {
      num: "01",
      title: "Ingest Docs",
      subtitle: "Front-matter & Dates",
      desc: "Meeting notes, policy PDFs, and decision logs ingested with explicit effective_from timestamps.",
      tag: "PostgreSQL & Vector",
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
      desc: "Every claim cites a node ID. The system strictly refuses ungrounded questions.",
      tag: "Local Qwen, Grounded",
      color: "badge-note-green"
    },
    {
      num: "05",
      title: "Human Approval",
      subtitle: "Gated Action",
      desc: "Actions land in the review queue. Only human sign-off triggers external tool execution.",
      tag: "SHA-256 Audit Trail",
      color: "badge-note-rose"
    }
  ];

  return (
    <div className="relative min-h-screen bg-[#F8FAFC] text-[#0F172A] overflow-x-hidden">
      {/* Subtle Sky Ambient Blurs */}
      <div className="absolute top-0 left-1/3 w-96 h-96 bg-sky-200/40 rounded-full filter blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-10 w-96 h-96 bg-indigo-100/50 rounded-full filter blur-3xl pointer-events-none" />

      {/* Navigation Bar */}
      <nav className="sticky top-0 z-40 w-full bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-6 py-4 flex items-center justify-between">
        <Logo size={32} subtitle="SOVEREIGN DECISION MEMORY" />

        <div className="hidden md:flex items-center gap-6 text-xs font-mono">
          <a href="#features" className="text-[#64748B] hover:text-[#0F172A] transition-colors">
            Core Features
          </a>
          <a href="#workflow" className="text-[#64748B] hover:text-[#0F172A] transition-colors">
            5-Stage Pipeline
          </a>
          <a href="#comparison" className="text-[#64748B] hover:text-[#0F172A] transition-colors">
            Architecture Matrix
          </a>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md badge-note-green text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-ping"></span>
            <span>Local Engine Active</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowLoginModal(true)}
            className="px-4 py-2 rounded-lg btn-sky-gradient text-white text-xs font-mono font-medium flex items-center gap-2 group cursor-pointer shadow-sm"
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
          <span className="w-2 h-2 rounded-full bg-[#0284C7]"></span>
          <span>TRACK 1: SOVEREIGN AI</span>
          <span className="text-slate-300">|</span>
          <span>TEMPORAL KNOWLEDGE GRAPH</span>
        </div>

        {/* Primary Headline */}
        <h1 className="text-4xl md:text-6xl font-bold font-heading tracking-tight leading-tight max-w-4xl text-[#0F172A]">
          A Sovereign AI That Remembers <span className="text-[#0284C7]">Why Every Decision Was Made.</span>
        </h1>

        {/* Subheadline */}
        <p className="mt-5 text-base md:text-lg text-[#64748B] max-w-2xl font-sans leading-relaxed">
          Link every organizational decision to the exact policy clause version and timestamp in force. 
          Point-in-time compliance, zero context loss, and hard human-in-the-loop execution.
        </p>

        {/* Action CTAs */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
          <button
            onClick={() => setShowLoginModal(true)}
            className="px-6 py-3.5 rounded-xl btn-sky-gradient text-white text-sm font-mono font-semibold flex items-center gap-2 shadow-md hover:scale-102 transition-all cursor-pointer"
          >
            <Sparkles size={16} />
            <span>Launch Sovereign Console</span>
            <ArrowRight size={16} />
          </button>

          <a
            href="#workflow"
            className="px-5 py-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-mono text-[#0F172A] flex items-center gap-2 transition-colors shadow-2xs"
          >
            <GitBranch size={15} className="text-[#0284C7]" />
            <span>Explore 5-Stage Architecture</span>
          </a>
        </div>

        {/* Metric Notes Grid */}
        <div className="mt-12 w-full grid grid-cols-2 md:grid-cols-4 gap-3 text-left">
          <div className="paper-sheet p-3.5">
            <div className="font-mono text-lg font-bold text-[#0F172A] flex items-center gap-1.5">
              <span>Point-in-Time</span>
              <CheckCircle2 size={16} className="text-emerald-600" />
            </div>
            <div className="text-[11px] font-mono text-[#64748B] mt-0.5">
              Reconstructs exact rules active then
            </div>
          </div>

          <div className="paper-sheet p-3.5">
            <div className="font-mono text-lg font-bold text-[#0284C7] flex items-center gap-1.5">
              <span>Bi-Temporal</span>
              <Clock size={16} className="text-[#0284C7]" />
            </div>
            <div className="text-[11px] font-mono text-[#64748B] mt-0.5">
              Valid-time + Ingestion-time tracking
            </div>
          </div>

          <div className="paper-sheet p-3.5">
            <div className="font-mono text-lg font-bold text-[#D97706] flex items-center gap-1.5">
              <span>SHA-256</span>
              <ShieldCheck size={16} className="text-[#D97706]" />
            </div>
            <div className="text-[11px] font-mono text-[#64748B] mt-0.5">
              Immutable hash-chained audit trail
            </div>
          </div>

          <div className="paper-sheet p-3.5">
            <div className="font-mono text-lg font-bold text-emerald-700 flex items-center gap-1.5">
              <span>100% Local</span>
              <Lock size={16} className="text-emerald-700" />
            </div>
            <div className="text-[11px] font-mono text-[#64748B] mt-0.5">
              Ollama + Neo4j / Zero API egress
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Feature Showcase Section */}
      <section id="features" className="py-14 px-6 max-w-5xl mx-auto border-t border-slate-200/80">
        <div className="text-center mb-8">
          <span className="font-mono text-xs text-[#0284C7] uppercase tracking-wider font-semibold">
            Interactive Feature Showcase
          </span>
          <h2 className="text-2xl md:text-3xl font-heading font-bold text-[#0F172A] mt-1">
            Beyond Flat RAG: Structured Temporal Governance
          </h2>
          <p className="text-xs font-sans text-[#64748B] max-w-xl mx-auto mt-2">
            Ordinary search engines retrieve words. Keystone understands which rule had authority at the moment of execution.
          </p>
        </div>

        {/* Feature Tab Selector (Tabbed Notes Metaphor) */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
          {[
            { id: 'temporal', label: '1. Temporal "As-Of" Context', icon: Clock },
            { id: 'clause', label: '2. Clause-Level Compliance', icon: FileText },
            { id: 'staleness', label: '3. Staleness Scanner', icon: AlertTriangle },
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
                    ? 'bg-sky-50 border-sky-300 text-[#0284C7] font-semibold shadow-xs'
                    : 'bg-white border-slate-200 text-[#64748B] hover:border-slate-300 hover:text-[#0F172A]'
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
              <h3 className="text-lg font-heading font-bold text-[#0F172A]">
                The "As-Of" Date Horizon Engine
              </h3>
              <p className="text-xs text-[#475569] leading-relaxed">
                When an auditor asks if a 2024 vendor contract complied with internal policy, Keystone rewinds graph traversal to that exact timestamp. It evaluates against the rules valid then, not subsequent amendments.
              </p>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs space-y-2">
                <div className="flex justify-between text-[#64748B]">
                  <span>INTERACTIVE HORIZON SLIDER:</span>
                  <span className="text-[#0284C7] font-bold">{sliderPreviewDate}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="1"
                  value={sliderPreviewDate === '2024-02-14' ? 0 : sliderPreviewDate === '2025-05-15' ? 1 : 2}
                  onChange={(e) => {
                    const vals = ['2024-02-14', '2025-05-15', '2026-09-24'];
                    setSliderPreviewDate(vals[parseInt(e.target.value)]);
                  }}
                  className="w-full accent-[#0284C7] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-[#64748B]">
                  <span>Q1 2024 (v1 Active)</span>
                  <span>Q2 2025 (v2 Active)</span>
                  <span>Sep 2026 (v3 Active)</span>
                </div>
              </div>

              <div className="text-xs font-mono p-2.5 rounded-lg bg-white border border-slate-200 text-[#0F172A] shadow-2xs">
                {sliderPreviewDate === '2024-02-14' && "Policy in force: RET-2.1 v1 (Max 365 days). DEC-2024-001 (180d) is fully COMPLIANT."}
                {sliderPreviewDate === '2025-05-15' && "Policy in force: RET-2.1 v2 (Max 180 days). DEC-2024-001 (180d) is border-line COMPLIANT."}
                {sliderPreviewDate === '2026-09-24' && "Policy in force: RET-2.1 v3 (Max 90 days). DEC-2024-001 (180d) is flagged as CONFLICT/STALE!"}
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 font-mono text-xs">
              <div className="text-[10px] text-[#64748B] border-b border-slate-200 pb-2 mb-3 flex items-center justify-between">
                <span>GRAPH RETRIEVAL PAYLOAD</span>
                <span className="text-emerald-700 font-medium">REPRODUCIBLE</span>
              </div>
              <pre className="text-[11px] text-[#0369A1] overflow-x-auto leading-relaxed">
{`{
  "query": "Is 180d log retention compliant?",
  "evaluation_horizon": "${sliderPreviewDate}",
  "active_clause": "${sliderPreviewDate < '2025-01-01' ? 'RET-2.1 v1 (365d)' : sliderPreviewDate < '2026-09-01' ? 'RET-2.1 v2 (180d)' : 'RET-2.1 v3 (90d)'}",
  "verdict": "${sliderPreviewDate >= '2026-09-01' ? 'VIOLATION_DETECTED' : 'POINT_IN_TIME_COMPLIANT'}",
  "provenance_chain": [
    "DEC-2024-001 -> RELIED_ON -> RET-2.1",
    "Source doc: MeetingNotes-2024-02.md"
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
              <h3 className="text-lg font-heading font-bold text-[#0F172A]">
                Clause-Level Linking, Not Just Flat PDFs
              </h3>
              <p className="text-xs text-[#475569] leading-relaxed">
                Standard enterprise search cites a 40-page PDF and leaves the human to figure it out. Keystone extracts structured clauses (<span className="text-[#0284C7] font-mono font-medium">RET-2.1</span>, <span className="text-[#0284C7] font-mono font-medium">PROC-1.4</span>) with numeric parameters (<span className="text-[#0284C7] font-mono">retention_days: 90</span>, <span className="text-[#0284C7] font-mono">threshold_inr: 200000</span>).
              </p>
              <div className="flex items-center gap-2 text-xs font-mono text-emerald-700">
                <CheckCircle2 size={15} />
                <span>Deterministic checks first, LLM natural language explanation second.</span>
              </div>
            </div>

            <div className="space-y-2 font-mono text-xs">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex justify-between text-[#0F172A] font-bold text-[11px]">
                  <span>CLAUSE: RET-2.1 v1</span>
                  <span className="text-[#64748B]">Jan 2024 – Dec 2024</span>
                </div>
                <div className="text-[#475569] text-[11px] mt-1">Customer raw log retention ceiling: 365 Days</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex justify-between text-[#0F172A] font-bold text-[11px]">
                  <span>CLAUSE: RET-2.1 v2</span>
                  <span className="text-[#64748B]">Jan 2025 – Aug 2026</span>
                </div>
                <div className="text-[#475569] text-[11px] mt-1">Tightened ceiling: 180 Days</div>
              </div>
              <div className="p-3 rounded-lg bg-sky-50 border border-sky-200">
                <div className="flex justify-between text-[#0284C7] font-bold text-[11px]">
                  <span>CLAUSE: RET-2.1 v3 (Current)</span>
                  <span className="text-[#64748B]">Sep 2026 – Present</span>
                </div>
                <div className="text-[#0F172A] text-[11px] mt-1">Strict ceiling: 90 Days (DPDP Act alignment)</div>
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
              <h3 className="text-lg font-heading font-bold text-[#0F172A]">
                Event-Driven Contradiction Scanner
              </h3>
              <p className="text-xs text-[#475569] leading-relaxed">
                Rather than waiting for an auditor to discover a discrepancy, ingesting a new policy version immediately triggers Keystone's Staleness Scanner. It locates every still-active decision relying on obsolete clauses and raises a staged remediation proposal.
              </p>
              <div className="p-3 rounded-lg badge-note-amber text-xs font-mono flex items-center gap-2">
                <Info size={15} className="shrink-0" />
                <span>Automatically flags DEC-2024-001 (180d) when RET-2.1 v3 (90d) is uploaded.</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs space-y-1.5">
              <div className="text-[10px] text-[#64748B]">LIVE SCANNER OUTPUT</div>
              <div className="text-[#991B1B] font-bold">[FLAG]: Decision Contradiction Found</div>
              <div className="text-[#334155] text-[11px]">
                Target: DEC-2025-019 (Purge Daemon)<br/>
                Old Clause: RET-2.1 v2 (180d)<br/>
                New Clause: RET-2.1 v3 (90d)<br/>
                Action Staged: Review Queue ACT-809
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Gated MCP Execution */}
        {activeTab === 'gated' && (
          <div className="paper-sheet p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
            <div className="space-y-3.5">
              <div className="inline-block px-2.5 py-0.5 rounded-md badge-note-green font-mono text-[11px] font-semibold">
                STAGE 5 ACTION GATE
              </div>
              <h3 className="text-lg font-heading font-bold text-[#0F172A]">
                Structural Human-in-the-Loop Execution
              </h3>
              <p className="text-xs text-[#475569] leading-relaxed">
                The AI model physically does not possess credentials or network permissions to execute tool actions. The agent drafts a proposal; a human clicks Approve; only then does the separate executor act (today it writes the notification to outbox/; MCP tools are on the roadmap) and record the SHA-256 block.
              </p>
              <div className="text-xs font-mono text-emerald-700 flex items-center gap-1.5">
                <ShieldCheck size={15} />
                <span>Zero runaway autonomy. 100% auditable liability.</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs space-y-1.5">
              <div className="flex justify-between text-[10px] text-[#64748B]">
                <span>EXECUTOR PIPELINE</span>
                <span className="text-[#0284C7] font-semibold">GATE: LOCKED</span>
              </div>
              <div className="text-xs text-[#334155] bg-white p-2 rounded border border-slate-200">
                1. Scanner: flagged DEC-007 against RET-2.1@v3<br/>
                2. Human: Farhan Qureshi approved the proposal<br/>
                3. Executor: wrote outbox/proposal-N.eml<br/>
                4. Audit: row appended with SHA-256 hash chain
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 5-Stage Architecture Flow Graphic */}
      <section id="workflow" className="py-14 px-6 max-w-5xl mx-auto border-t border-slate-200/80">
        <div className="text-center mb-10">
          <span className="font-mono text-xs text-[#0284C7] uppercase tracking-wider font-semibold">
            Official Brief 5-Stage Realization
          </span>
          <h2 className="text-2xl md:text-3xl font-heading font-bold text-[#0F172A] mt-1">
            Data → Knowledge → Memory → Reasoning → Action
          </h2>
          <p className="text-xs font-sans text-[#64748B] max-w-xl mx-auto mt-2">
            Most hackathon submissions stop at a flat chatbot. Keystone takes the full journey to gated, auditable action.
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
                  isSelected ? 'border-sky-400 ring-2 ring-sky-100 bg-sky-50/20' : 'hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs text-[#0284C7] font-bold">{step.num}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-[#64748B]">
                      STAGE {idx + 1}
                    </span>
                  </div>
                  <h4 className="font-heading font-semibold text-sm text-[#0F172A]">
                    {step.title}
                  </h4>
                  <div className="text-[10px] font-mono text-[#0284C7] mt-0.5 font-medium">
                    {step.subtitle}
                  </div>
                  <p className="text-[11px] text-[#64748B] mt-2 leading-snug">
                    {step.desc}
                  </p>
                </div>

                <div className="mt-4 pt-2 border-t border-slate-100 font-mono text-[9.5px]">
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
      <section id="comparison" className="py-14 px-6 max-w-5xl mx-auto border-t border-slate-200/80">
        <div className="text-center mb-8">
          <span className="font-mono text-xs text-[#0284C7] uppercase tracking-wider font-semibold">
            Competitive Differentiation
          </span>
          <h2 className="text-2xl md:text-3xl font-heading font-bold text-[#0F172A] mt-1">
            Why Keystone Outclasses Existing Paradigms
          </h2>
        </div>

        <div className="paper-sheet overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 font-mono text-[11px] text-[#0F172A]">
                <th className="py-3 px-4">Architecture</th>
                <th className="py-3 px-4">Core Capability</th>
                <th className="py-3 px-4">Critical Deficiency</th>
                <th className="py-3 px-4">Keystone Advantage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans text-xs">
              <tr className="hover:bg-slate-50/50">
                <td className="py-3 px-4 font-mono font-bold text-[#0F172A]">Vector RAG / Chatbots</td>
                <td className="py-3 px-4 text-[#64748B]">Finds similar text snippets</td>
                <td className="py-3 px-4 text-rose-700">Cannot answer which policy version applied on past date</td>
                <td className="py-3 px-4 text-emerald-700 font-mono font-medium">Bi-temporal valid-time edges</td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="py-3 px-4 font-mono font-bold text-[#0F172A]">ADRs / Notion Logs</td>
                <td className="py-3 px-4 text-[#64748B]">Captures a decision once</td>
                <td className="py-3 px-4 text-rose-700">Static; never flags when a past decision goes stale</td>
                <td className="py-3 px-4 text-emerald-700 font-mono font-medium">Automated Staleness Scanner</td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="py-3 px-4 font-mono font-bold text-[#0F172A]">Enterprise AI (Obin, Palantir)</td>
                <td className="py-3 px-4 text-[#64748B]">Governed bank workflows</td>
                <td className="py-3 px-4 text-rose-700">Sales-led, $500k+ contracts, heavy enterprise lock-in</td>
                <td className="py-3 px-4 text-emerald-700 font-mono font-medium">Open & self-hostable in 1 Docker</td>
              </tr>
              <tr className="hover:bg-sky-50/40 bg-sky-50/20">
                <td className="py-3 px-4 font-mono font-bold text-[#0284C7]">Keystone Sovereign Engine</td>
                <td className="py-3 px-4 text-[#0F172A]">Decisions + Clauses + Time + Actions</td>
                <td className="py-3 px-4 text-emerald-700 font-medium">None — Pure point-in-time sovereign stack</td>
                <td className="py-3 px-4 text-[#0284C7] font-mono font-bold">100% Owned & Verifiable</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Sign-In Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-md paper-sheet-elevated p-6 relative">
            <button
              onClick={() => setShowLoginModal(false)}
              className="absolute top-4 right-4 text-[#64748B] hover:text-[#0F172A] text-xs font-mono cursor-pointer"
            >
              ✕ Close
            </button>

            <div className="flex items-center gap-2 mb-4">
              <Key size={18} className="text-[#0284C7]" />
              <h3 className="font-heading font-bold text-base text-[#0F172A]">
                Authenticate Sovereign Workspace
              </h3>
            </div>

            <p className="text-xs text-[#64748B] mb-4">
              Select a pre-authenticated role for Nimbus Ledger:
            </p>

            <div className="space-y-2 mb-4">
              <button
                onClick={() => {
                  setShowLoginModal(false);
                  onLaunchConsole("p-priya", "Priya Menon (Ops Lead)");
                }}
                className="w-full p-3 rounded-xl bg-white hover:bg-sky-50 border border-slate-200 hover:border-sky-200 text-left flex items-center justify-between text-xs transition-colors group cursor-pointer shadow-2xs"
              >
                <div>
                  <div className="font-heading font-semibold text-[#0F172A] group-hover:text-[#0284C7]">
                    Priya Menon
                  </div>
                  <div className="text-[10.5px] font-mono text-[#64748B]">
                    Role: Ops Lead
                  </div>
                </div>
                <span className="text-[10.5px] font-mono text-[#0284C7] font-medium">Select Role →</span>
              </button>

              <button
                onClick={() => {
                  setShowLoginModal(false);
                  onLaunchConsole("p-karthik", "Karthik Rao (CTO)");
                }}
                className="w-full p-3 rounded-xl bg-white hover:bg-sky-50 border border-slate-200 hover:border-sky-200 text-left flex items-center justify-between text-xs transition-colors group cursor-pointer shadow-2xs"
              >
                <div>
                  <div className="font-heading font-semibold text-[#0F172A] group-hover:text-[#0284C7]">
                    Karthik Rao
                  </div>
                  <div className="text-[10.5px] font-mono text-[#64748B]">
                    Role: Chief Technology Officer
                  </div>
                </div>
                <span className="text-[10.5px] font-mono text-[#0284C7] font-medium">Select Role →</span>
              </button>

              <button
                onClick={() => {
                  setShowLoginModal(false);
                  onLaunchConsole("p-ananya", "Ananya Rao (CEO)");
                }}
                className="w-full p-3 rounded-xl bg-white hover:bg-sky-50 border border-slate-200 hover:border-sky-200 text-left flex items-center justify-between text-xs transition-colors group cursor-pointer shadow-2xs"
              >
                <div>
                  <div className="font-heading font-semibold text-[#0F172A] group-hover:text-[#0284C7]">
                    Ananya Rao
                  </div>
                  <div className="text-[10.5px] font-mono text-[#64748B]">
                    Role: Chief Executive Officer
                  </div>
                </div>
                <span className="text-[10.5px] font-mono text-[#0284C7] font-medium">Select Role →</span>
              </button>
            </div>

            <div className="pt-3 border-t border-slate-100">
              <label className="text-[10.5px] font-mono text-[#64748B] uppercase tracking-wider block mb-1">
                Or Connect via Sovereign API Key:
              </label>
              <input
                type="text"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-[#0F172A] mb-3 focus:outline-none focus:border-sky-400"
              />
              <button
                onClick={() => {
                  setShowLoginModal(false);
                  onLaunchConsole("nitika", "Nitika (Keystone Admin)");
                }}
                className="w-full py-2.5 rounded-lg btn-sky-gradient text-white text-xs font-mono font-medium flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Terminal size={13} />
                <span>Initialize Console Session</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-slate-200 text-center text-xs font-mono text-[#64748B] bg-white">
        <div className="flex flex-wrap items-center justify-center gap-4 mb-2">
          <span>Keystone Sovereign AI</span>
          <span>•</span>
          <span>ASYNC'26 Track 1 (Sovereign AI)</span>
          <span>•</span>
          <span>PostgreSQL + Neo4j/Graphiti + Ollama</span>
        </div>
        <div className="text-[10px] text-[#94A3B8]">
          Designed for high-density regulatory compliance and knowledge continuity in India under DPDP Act 2025/2026.
        </div>
      </footer>
    </div>
  );
}
