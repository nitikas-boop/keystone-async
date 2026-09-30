import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, Key, Terminal } from 'lucide-react';
import Logo from './Logo';
import { healthCheck } from '../api';
import Hero from '../home/Hero';
import ScrollStory from '../home/ScrollStory';
import { Features, Stats, RunIt, FinalCta, Footer } from '../home/Sections';
import { useLenis, useReveal } from '../home/motion';
import '../home/home.css';

// Public landing page ("Ice & Butter"): hero with the animated temporal knowledge graph, the scroll story, features,
// stats, run-it-yourself, and the sign-in modal. Launch console and the role picker call onLaunchConsole as before.
export default function LandingPage({ onLaunchConsole }) {
  // Real status: backend up and it can reach Ollama with both models (null = not checked yet).
  const [engineOk, setEngineOk] = useState(null);
  useEffect(() => {
    healthCheck().then(h => setEngineOk(!!h && !!h.ollama && Object.values(h.ollama).every(v => v === true)));
  }, []);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const rootRef = useRef(null);
  const lenisRef = useRef(null);
  useLenis(lenisRef);
  useReveal(rootRef);

  const launch = () => onLaunchConsole("p-priya", "Priya Menon (Ops Lead)");
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
            <button type="button" className="kb-btn kb-btn--outline kb-btn--sm" onClick={() => setShowLoginModal(true)}>Sign in</button>
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
        <FinalCta onLaunch={launch} onSignIn={() => setShowLoginModal(true)} />
      </main>

      {/* Sign-In Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-kb-navy/25 backdrop-blur-xs p-4 kb-tab-in" role="dialog" aria-modal="true" aria-labelledby="kb-signin-title">
          <div className="w-full max-w-md paper-sheet-elevated p-6 relative">
            <button
              onClick={() => setShowLoginModal(false)}
              className="absolute top-4 right-4 text-kb-muted hover:text-kb-navy text-xs font-mono cursor-pointer"
            >
              ✕ Close
            </button>

            <div className="flex items-center gap-2 mb-4">
              <Key size={18} className="text-kb-cobalt-ink" />
              <h3 id="kb-signin-title" className="font-heading font-bold text-base text-kb-navy">
                Enter Workspace
              </h3>
            </div>

            <p className="text-xs text-kb-muted mb-4">
              Nimbus Ledger demo workspace. Pick a role to continue as:
            </p>

            <div className="space-y-2 mb-4">
              <button
                onClick={() => {
                  setShowLoginModal(false);
                  onLaunchConsole("p-priya", "Priya Menon (Ops Lead)");
                }}
                className="w-full p-3 rounded-xl bg-kb-bg hover:bg-kb-ice border border-kb-line hover:border-kb-cobalt/50 text-left flex items-center justify-between text-xs transition-colors group cursor-pointer shadow-2xs"
              >
                <div>
                  <div className="font-heading font-semibold text-kb-navy group-hover:text-kb-cobalt-ink">
                    Priya Menon
                  </div>
                  <div className="text-[12px] font-mono text-kb-muted">
                    Role: Ops Lead
                  </div>
                </div>
                <span className="text-[12px] font-mono text-kb-cobalt-ink font-medium">Select Role →</span>
              </button>

              <button
                onClick={() => {
                  setShowLoginModal(false);
                  onLaunchConsole("p-karthik", "Karthik Rao (CTO)");
                }}
                className="w-full p-3 rounded-xl bg-kb-bg hover:bg-kb-ice border border-kb-line hover:border-kb-cobalt/50 text-left flex items-center justify-between text-xs transition-colors group cursor-pointer shadow-2xs"
              >
                <div>
                  <div className="font-heading font-semibold text-kb-navy group-hover:text-kb-cobalt-ink">
                    Karthik Rao
                  </div>
                  <div className="text-[12px] font-mono text-kb-muted">
                    Role: Chief Technology Officer
                  </div>
                </div>
                <span className="text-[12px] font-mono text-kb-cobalt-ink font-medium">Select Role →</span>
              </button>

              <button
                onClick={() => {
                  setShowLoginModal(false);
                  onLaunchConsole("p-ananya", "Ananya Rao (CEO)");
                }}
                className="w-full p-3 rounded-xl bg-kb-bg hover:bg-kb-ice border border-kb-line hover:border-kb-cobalt/50 text-left flex items-center justify-between text-xs transition-colors group cursor-pointer shadow-2xs"
              >
                <div>
                  <div className="font-heading font-semibold text-kb-navy group-hover:text-kb-cobalt-ink">
                    Ananya Rao
                  </div>
                  <div className="text-[12px] font-mono text-kb-muted">
                    Role: Chief Executive Officer
                  </div>
                </div>
                <span className="text-[12px] font-mono text-kb-cobalt-ink font-medium">Select Role →</span>
              </button>
            </div>

            <div className="pt-3 border-t border-kb-line">
              <button
                onClick={() => {
                  setShowLoginModal(false);
                  onLaunchConsole("nitika", "Nitika (Keystone Admin)");
                }}
                className="w-full py-2.5 rounded-lg btn-sky-gradient text-white text-xs font-mono font-medium flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Terminal size={13} />
                <span>Continue as Keystone Admin</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
