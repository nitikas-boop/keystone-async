import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import Logo from './Logo';
import { healthCheck } from '../api';
import Hero from '../home/Hero';
import ScrollStory from '../home/ScrollStory';
import { Features, Stats, RunIt, FinalCta, Footer } from '../home/Sections';
import { useLenis, useReveal } from '../home/motion';
import '../home/home.css';

// Public landing page ("Ice & Butter"): hero with the animated temporal knowledge graph, the scroll story, features,
// stats and run-it-yourself. Sign in and Launch console both call onLaunchConsole, which opens the sign-in screen.
export default function LandingPage({ onLaunchConsole }) {
  // Real status: backend up and it can reach Ollama with both models (null = not checked yet).
  const [engineOk, setEngineOk] = useState(null);
  useEffect(() => {
    healthCheck().then(h => setEngineOk(!!h && !!h.ollama && Object.values(h.ollama).every(v => v === true)));
  }, []);
  const rootRef = useRef(null);
  const lenisRef = useRef(null);
  useLenis(lenisRef);
  useReveal(rootRef);

  const launch = () => onLaunchConsole();
  const goTo = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (lenisRef.current) lenisRef.current.scrollTo(el, { offset: -64, duration: 1.2 });
    else el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div ref={rootRef} className="kb-home min-h-screen">
      <nav className="kb-nav" aria-label="Main">
        <div className="kb-wrap">
          <Logo size={30} subtitle="" />
          <div className="kb-nav__links">
            <a href="#how" onClick={(e) => { e.preventDefault(); goTo('how'); }}>How it works</a>
            <a href="#features" onClick={(e) => { e.preventDefault(); goTo('features'); }}>Features</a>
            <a href="#run" onClick={(e) => { e.preventDefault(); goTo('run'); }}>Run it yourself</a>
          </div>
          <div className="kb-nav__actions">
            <span className="kb-status" role="status">
              <span className={`kb-dot ${engineOk === false ? 'kb-dot--alert' : ''}`} style={engineOk === false ? undefined : { background: 'var(--kb-cobalt)' }} aria-hidden="true" />
              {engineOk === null ? 'Checking local engine…' : engineOk ? 'Local engine active' : 'Local model unreachable'}
            </span>
            <button type="button" className="kb-btn kb-btn--outline kb-btn--sm" onClick={launch}>Sign in</button>
            <button type="button" className="kb-btn kb-btn--primary kb-btn--sm" onClick={launch}>
              Launch console <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </nav>

      <main>
        <Hero onLaunch={launch} onHowItWorks={() => goTo('how')} />
        <ScrollStory />
        <Features />
        <Stats />
        <RunIt />
        <FinalCta onLaunch={launch} onSignIn={launch} />
      </main>

      <Footer />
    </div>
  );
}
