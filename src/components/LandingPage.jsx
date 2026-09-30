import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  LockKeyhole,
  Network,
  ShieldCheck,
  X,
} from 'lucide-react';
import Logo from './Logo';
import { healthCheck } from '../api';

const workflow = [
  ['01', 'Ingest', 'Policies, meetings, and decisions enter as dated records.'],
  ['02', 'Connect', 'A bi-temporal graph links people, clauses, and outcomes.'],
  ['03', 'Ask', 'Query the exact state of your organization at any date.'],
  ['04', 'Prove', 'Every answer carries clause-level provenance and hashes.'],
  ['05', 'Approve', 'Humans gate every action before it reaches the outside world.'],
];

const users = [
  ['p-priya', 'Priya Menon', 'Ops Lead'],
  ['p-karthik', 'Karthik Rao', 'CTO'],
  ['p-ananya', 'Ananya Rao', 'CEO'],
  ['nitika', 'Nitika', 'Keystone Admin'],
];

function StatusDot({ engineOk }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-blue-100/70">
      <span className={`size-2 rounded-full ${engineOk === false ? 'bg-red-400' : 'bg-cyan-300 animate-pulse'}`} />
      {engineOk === null ? 'Checking local engine' : engineOk ? 'Local engine online' : 'Engine unavailable'}
    </span>
  );
}

export default function LandingPage({ onLaunchConsole }) {
  const [engineOk, setEngineOk] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [activeStep, setActiveStep] = useState(2);

  useEffect(() => {
    healthCheck().then((health) => {
      setEngineOk(Boolean(health?.ollama && Object.values(health.ollama).every(Boolean)));
    });
  }, []);

  const launch = (id, name, role) => {
    setShowLoginModal(false);
    onLaunchConsole(id, `${name} (${role})`);
  };

  return (
    <div className="keystone-landing min-h-screen overflow-x-hidden bg-[#f4f8ff] text-[#071a3d]">
      <header className="relative z-20 border-b border-[#8ab6e8]/30 bg-[#06183a] text-white">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-10">
          <Logo size={34} subtitle="SOVEREIGN DECISION MEMORY" />
          <div className="hidden items-center gap-8 font-mono text-[10px] uppercase tracking-[0.18em] text-blue-100/70 md:flex">
            <a href="#system" className="transition-colors hover:text-white">System</a>
            <a href="#workflow" className="transition-colors hover:text-white">Workflow</a>
            <a href="#proof" className="transition-colors hover:text-white">Proof</a>
            <StatusDot engineOk={engineOk} />
          </div>
          <button onClick={() => setShowLoginModal(true)} className="group flex items-center gap-3 border border-cyan-300/60 bg-cyan-300 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#06183a] transition hover:bg-white">
            Open console <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
          </button>
        </nav>
      </header>

      <main>
        <section className="relative border-b border-[#8ab6e8]/40 px-5 pb-16 pt-14 lg:px-10 lg:pb-24 lg:pt-20">
          <div className="pointer-events-none absolute inset-0 blue-grid opacity-70" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="mb-7 inline-flex items-center gap-2 border border-blue-300/80 bg-white px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#14539b]">
                <span className="size-2 bg-[#1477d4]" /> Decision memory / v1.0
              </div>
              <h1 className="max-w-4xl font-heading text-5xl font-black uppercase leading-[0.9] tracking-[-0.07em] text-[#071a3d] sm:text-7xl lg:text-[6.6rem]">
                Remember <span className="text-[#1477d4]">why.</span><br />Act with proof.
              </h1>
              <p className="mt-7 max-w-xl border-l-2 border-[#1477d4] pl-5 font-mono text-sm leading-7 text-[#31557d]">
                Keystone reconstructs the policy, context, and decision trail that was true at the exact moment an action happened. Sovereign, temporal, and human-gated by design.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button onClick={() => setShowLoginModal(true)} className="group flex items-center gap-0 bg-[#071a3d] font-mono text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[#1477d4]">
                  <span className="flex size-11 items-center justify-center bg-[#1477d4] group-hover:bg-cyan-300 group-hover:text-[#071a3d]"><ArrowRight size={17} /></span>
                  <span className="px-5">Launch sovereign console</span>
                </button>
                <a href="#workflow" className="flex items-center border border-[#7ba9dc] bg-white px-5 py-3 font-mono text-xs uppercase tracking-[0.12em] text-[#14539b] transition hover:border-[#071a3d] hover:text-[#071a3d]">See the system</a>
              </div>
            </div>

            <div className="relative border-2 border-[#071a3d] bg-[#071a3d] p-3 shadow-[12px_12px_0_#88b9ed]">
              <div className="flex items-center justify-between border-b border-blue-300/30 pb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-blue-100/60"><span>keystone://system-status</span><span className="text-cyan-300">live</span></div>
              <div className="min-h-[290px] px-2 py-5 font-mono text-xs leading-7 text-blue-100">
                <p className="text-cyan-300">$ keystone inspect --as-of 2025-06-30</p>
                <p className="text-blue-100/60">&gt; loading temporal graph...</p>
                <p className="text-blue-100/60">&gt; resolving policy chain...</p>
                <p className="text-white">&gt; 14 decisions / 08 clauses / 03 actors</p>
                <p className="text-blue-100/60">&gt; verifying SHA-256 provenance...</p>
                <p className="mt-3 border-l-2 border-cyan-300 pl-3 text-cyan-200">STATUS: ANSWER GROUNDED<br />CONFIDENCE: 98.4%<br />HUMAN GATE: REQUIRED</p>
                <p className="mt-6 text-cyan-300">$ <span className="animate-blink">_</span></p>
              </div>
              <div className="grid grid-cols-3 gap-2 border-t border-blue-300/30 pt-3 font-mono text-[9px] uppercase tracking-[0.1em] text-blue-100/60"><span>neo4j / graph</span><span>ollama / local</span><span className="text-right">zero egress</span></div>
            </div>
          </div>
        </section>

        <section id="system" className="mx-auto max-w-7xl px-5 py-16 lg:px-10">
          <div className="mb-8 flex flex-col justify-between gap-4 border-b-2 border-[#071a3d] pb-5 sm:flex-row sm:items-end"><div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#1477d4]">01 / Core system</p><h2 className="mt-2 font-heading text-3xl font-black uppercase tracking-[-0.05em] sm:text-5xl">Not a chatbot.<br /><span className="text-[#1477d4]">A memory layer.</span></h2></div><p className="max-w-sm font-mono text-xs leading-6 text-[#52739a]">Flat retrieval finds similar words. Keystone finds the governing reality behind a decision.</p></div>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              [Network, 'Temporal graph', 'Connect decisions to people, policies, and outcomes across valid-time and ingestion-time.'],
              [FileCheck2, 'Clause-level proof', 'Answers cite the exact policy clause in force, not a vague document or generated summary.'],
              [LockKeyhole, 'Gated execution', 'Actions queue for a human approval. Nothing external happens because a model said so.'],
            ].map(([Icon, title, text], index) => <article key={title} className={`min-h-64 border-2 border-[#7ba9dc] p-6 ${index === 1 ? 'bg-[#1477d4] text-white' : 'bg-white'}`}><Icon className={index === 1 ? 'text-cyan-200' : 'text-[#1477d4]'} size={28} /><p className="mt-10 font-mono text-[10px] uppercase tracking-[0.16em] opacity-70">0{index + 1}</p><h3 className="mt-2 font-heading text-2xl font-black uppercase tracking-[-0.04em]">{title}</h3><p className="mt-3 font-mono text-xs leading-6 opacity-75">{text}</p></article>)}
          </div>
        </section>

        <section id="workflow" className="bg-[#071a3d] px-5 py-16 text-white lg:px-10 lg:py-20">
          <div className="mx-auto max-w-7xl"><div className="mb-10 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-300">02 / Five-stage pipeline</p><h2 className="mt-2 font-heading text-4xl font-black uppercase tracking-[-0.06em] sm:text-6xl">From raw context<br /><span className="text-cyan-300">to trusted action.</span></h2></div><p className="max-w-xs font-mono text-xs leading-6 text-blue-100/60">Select a stage to inspect how the memory layer keeps its receipts.</p></div>
            <div className="grid gap-2 md:grid-cols-5">{workflow.map(([number, title, text], index) => <button key={number} onClick={() => setActiveStep(index)} className={`min-h-48 border p-5 text-left transition ${activeStep === index ? 'border-cyan-300 bg-[#123469]' : 'border-blue-300/30 bg-[#0b2550] hover:border-blue-200'}`}><span className="font-mono text-xs text-cyan-300">{number}</span><h3 className="mt-12 font-heading text-xl font-black uppercase tracking-[-0.04em]">{title}</h3><p className="mt-3 font-mono text-[11px] leading-5 text-blue-100/60">{text}</p></button>)}</div>
            <div className="mt-3 border border-blue-300/30 bg-[#0b2550] p-5 font-mono text-xs text-blue-100/70"><span className="text-cyan-300">ACTIVE STAGE //</span> {workflow[activeStep][1].toUpperCase()} <span className="mx-2 text-blue-100/30">—</span> {workflow[activeStep][2]}</div>
          </div>
        </section>

        <section id="proof" className="mx-auto max-w-7xl px-5 py-16 lg:px-10"><div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-end"><div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#1477d4]">03 / Operating principles</p><h2 className="mt-2 font-heading text-4xl font-black uppercase leading-none tracking-[-0.06em] sm:text-6xl">Built for<br /><span className="text-[#1477d4]">the audit.</span></h2></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['01', 'Point-in-time', 'Exact rules, reconstructed.'], ['02', 'Bi-temporal', 'Valid + ingestion time.'], ['03', 'SHA-256', 'Tamper-evident trail.'], ['04', '100% local', 'Zero API egress.']].map(([num, title, text]) => <div key={num} className="border-t-2 border-[#1477d4] pt-3"><p className="font-mono text-[10px] text-[#1477d4]">{num}</p><h3 className="mt-5 font-heading text-lg font-black uppercase leading-tight">{title}</h3><p className="mt-2 font-mono text-[10px] leading-4 text-[#52739a]">{text}</p></div>)}</div></div></section>
      </main>

      <footer className="border-t border-blue-300/30 bg-[#06183a] px-5 py-7 text-white lg:px-10"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-blue-100/60 sm:flex-row"><span>Keystone / sovereign decision memory</span><span>Built for accountable intelligence</span></div></footer>

      {showLoginModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#06183a]/80 p-5 backdrop-blur-sm"><div role="dialog" aria-modal="true" aria-labelledby="console-title" className="w-full max-w-md border-2 border-[#071a3d] bg-[#f4f8ff] p-6 shadow-[10px_10px_0_#1477d4]"><div className="flex items-start justify-between border-b border-[#8ab6e8] pb-4"><div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#1477d4]">Authorized access</p><h2 id="console-title" className="mt-2 font-heading text-2xl font-black uppercase">Choose operator</h2></div><button aria-label="Close" onClick={() => setShowLoginModal(false)} className="text-[#52739a] transition hover:text-[#071a3d]"><X size={20} /></button></div><div className="flex flex-col gap-2 py-5">{users.map(([id, name, role]) => <button key={id} onClick={() => launch(id, name, role)} className="group flex items-center justify-between border border-[#8ab6e8] bg-white p-3 text-left transition hover:border-[#1477d4] hover:bg-[#eaf3ff]"><span><span className="block font-heading font-bold">{name}</span><span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#52739a]">{role}</span></span><CheckCircle2 size={17} className="text-[#1477d4] opacity-0 transition group-hover:opacity-100" /></button>)}</div><div className="flex items-center gap-2 border-t border-[#8ab6e8] pt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-[#52739a]"><ShieldCheck size={15} className="text-[#1477d4]" /> Local auth / audit logging enabled</div></div></div>}
    </div>
  );
}

