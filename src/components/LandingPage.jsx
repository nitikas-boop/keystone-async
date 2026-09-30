import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, ChevronDown, Menu, Play, ShieldCheck, Sparkles, X } from 'lucide-react';
import Logo from './Logo';
import { healthCheck } from '../api';

const users = [['p-priya', 'Priya Menon', 'Ops Lead'], ['p-karthik', 'Karthik Rao', 'CTO'], ['p-ananya', 'Ananya Rao', 'CEO'], ['nitika', 'Nitika', 'Keystone Admin']];
const features = [
  ['01', 'Temporal intelligence', 'Reconstruct the exact policy, context, and decision trail that was true when action happened.', '⌁'],
  ['02', 'Grounded answers', 'Every response carries clause-level provenance, hashes, and the source material behind it.', '◌'],
  ['03', 'Human-gated action', 'Turn insight into accountable execution with approvals before anything reaches the outside world.', '◈'],
];
const stats = [['14k+', 'decisions mapped'], ['98.4%', 'answer confidence'], ['100%', 'local processing'], ['0', 'unverified actions']];

function AnimatedSphere() {
  return <div className="sphere-wrap" aria-hidden="true"><div className="sphere"><span /><span /><span /><span /><span /><span /></div><div className="sphere-orbit orbit-one" /><div className="sphere-orbit orbit-two" /></div>;
}

export default function LandingPage({ onLaunchConsole }) {
  const [engineOk, setEngineOk] = useState(null);
  const [modal, setModal] = useState(false);
  const [menu, setMenu] = useState(false);
  const [word, setWord] = useState(0);
  const words = ['remember', 'connect', 'prove', 'act'];

  useEffect(() => { healthCheck().then((health) => setEngineOk(Boolean(health?.ollama && Object.values(health.ollama).every(Boolean)))); }, []);
  useEffect(() => { const timer = setInterval(() => setWord((value) => (value + 1) % words.length), 2200); return () => clearInterval(timer); }, []);
  const launch = (id, name, role) => { setModal(false); onLaunchConsole(id, `${name} (${role})`); };

  return <div className="optimus-landing">
    <header className="site-nav"><a href="#top" className="brand"><Logo size={34} subtitle="SOVEREIGN DECISION MEMORY" /></a><nav className={menu ? 'nav-links open' : 'nav-links'}><a href="#system">System</a><a href="#workflow">Workflow</a><a href="#proof">Proof</a><span className="status"><i className={engineOk === false ? 'offline' : ''} />{engineOk ? 'Engine online' : 'Local engine'}</span></nav><div className="nav-actions"><button className="nav-login" onClick={() => setModal(true)}>Open console <ArrowRight size={14} /></button><button className="menu-button" aria-label="Toggle navigation" onClick={() => setMenu(!menu)}>{menu ? <X /> : <Menu />}</button></div></header>
    <main id="top">
      <section className="hero-section"><div className="hero-grid" /><AnimatedSphere /><div className="hero-content"><p className="eyebrow"><span /> The platform for accountable intelligence</p><h1>Remember <em>{words[word]}.</em><br /><span>Act with proof.</span></h1><p className="hero-copy">Keystone is the sovereign memory layer for teams that need to understand not just what happened, but why — and what was true at the exact moment it happened.</p><div className="hero-actions"><button className="primary-button" onClick={() => setModal(true)}>Launch sovereign console <ArrowRight size={17} /></button><a className="secondary-button" href="#system"><Play size={15} /> Explore the system</a></div><div className="hero-note"><ShieldCheck size={16} /> Local-first by design <span>•</span> Human approval always required</div></div><div className="scroll-cue">Scroll to explore <ChevronDown size={15} /></div></section>
      <section className="stats-strip">{stats.map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</section>
      <section id="system" className="section system-section"><div className="section-intro"><p className="eyebrow">01 / Core system</p><h2>Not a chatbot.<br /><span>A memory layer.</span></h2><p>Flat retrieval finds similar words. Keystone finds the governing reality behind a decision.</p></div><div className="feature-grid">{features.map(([number, title, text, icon], index) => <article className={index === 1 ? 'feature-card featured' : 'feature-card'} key={title}><div className="feature-top"><span>{number}</span><b>{icon}</b></div><h3>{title}</h3><p>{text}</p><a href="#workflow">Learn more <ArrowRight size={14} /></a></article>)}</div></section>
      <section id="workflow" className="workflow-section"><div className="section workflow-inner"><div className="section-intro"><p className="eyebrow">02 / Five-stage pipeline</p><h2>From raw context<br /><span>to trusted action.</span></h2><p>Select the stage that matters. Every step keeps its receipts.</p></div><div className="pipeline"><div className="pipeline-line" />{['Ingest', 'Connect', 'Ask', 'Prove', 'Approve'].map((item, i) => <div className="pipeline-step" key={item}><span>0{i + 1}</span><i /><h3>{item}</h3><p>{['Policies enter as dated records.', 'Graph links people and outcomes.', 'Query reality at any date.', 'Verify provenance and hashes.', 'Humans gate every action.'][i]}</p></div>)}</div></div></section>
      <section id="proof" className="section proof-section"><div className="proof-copy"><p className="eyebrow">03 / Operating principles</p><h2>Built for<br /><span>the audit.</span></h2><p>Trust is not a feature we bolt on later. It is the architecture.</p><button className="secondary-button dark" onClick={() => setModal(true)}>Meet the console <ArrowRight size={15} /></button></div><div className="proof-list">{[['Point-in-time', 'Exact rules, reconstructed.'], ['Bi-temporal', 'Valid and ingestion time.'], ['SHA-256', 'Tamper-evident trail.'], ['100% local', 'Zero API egress.']].map(([title, text], i) => <div key={title}><span>0{i + 1}</span><div><h3>{title}</h3><p>{text}</p></div><Check size={18} /></div>)}</div></section>
      <section className="cta-section"><p className="eyebrow">Ready when you are</p><h2>Make every decision<br /><em>defensible.</em></h2><button className="primary-button" onClick={() => setModal(true)}>Open the console <ArrowRight size={17} /></button></section>
    </main>
    <footer><span>Keystone / sovereign decision memory</span><span>Built for accountable intelligence</span></footer>
    {modal && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setModal(false)}><div className="operator-modal" role="dialog" aria-modal="true" aria-labelledby="operator-title"><div className="modal-head"><div><p className="eyebrow">Authorized access</p><h2 id="operator-title">Choose operator</h2></div><button onClick={() => setModal(false)} aria-label="Close"><X size={20} /></button></div>{users.map(([id, name, role]) => <button className="user-row" key={id} onClick={() => launch(id, name, role)}><span><strong>{name}</strong><small>{role}</small></span><ArrowRight size={16} /></button>)}<p className="modal-foot"><ShieldCheck size={15} /> Local auth / audit logging enabled</p></div></div>}
  </div>;
}
