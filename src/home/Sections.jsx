// Landing sections after the scroll story: features, stats, "Run it yourself", final CTA, footer.
import { useState } from 'react';
import { CalendarClock, BellRing, ShieldCheck, Copy, Check, ArrowRight } from 'lucide-react';
import Logo from '../components/Logo';

const FEATURES = [
  { Icon: CalendarClock, title: 'Point-in-time compliance',
    body: 'Every answer is checked against the policy version that was in force on the date you ask about, not today’s.',
    meta: 'as_of 2025-06-30 → RET-2.1@v2 (180 days) → DEC-007 compliant' },
  { Icon: BellRing, title: 'Decisions go stale out loud',
    body: 'When a policy changes, the scanner walks the graph the same day and flags every historical decision it affects.',
    meta: 'RET-2.1@v3 → DEC-007 · ONGOING_PRACTICE_BREACH' },
  { Icon: ShieldCheck, title: 'The model cannot act',
    body: 'The local model only proposes. A person approves in the review queue, and every step lands in a hash-chained audit log.',
    meta: 'proposed → approved (Priya) → executed · sha256 chain' },
];

const STATS = [
  { value: '0', label: 'cloud AI calls' },
  { value: '100%', count: 100, suffix: '%', label: 'on your hardware' },
  { value: 'qwen2.5 7B', label: 'runs locally' },
  { value: 'Verified', label: 'audit chain' },
];

// From the README's quick start.
const RUN = [
  ['sh scripts/create_models.sh', 'once per machine: local models'],
  ['cp .env.example .env', ''],
  ['docker compose up -d --build --wait', 'Postgres, Neo4j, API :8000, executor'],
  ['docker compose exec backend python -m app.seed', 'the Nimbus Ledger demo data'],
  ['npm install && npm run dev', 'http://localhost:5173'],
];

export function Features() {
  return (
    <section id="features" className="kb-section" aria-labelledby="kb-features-title">
      <div className="kb-wrap">
        <div className="kb-section__head">
          <div className="kb-mono-label">What it does</div>
          <h2 id="kb-features-title" data-reveal="words">A record that knows which rule applied when.</h2>
          <p data-reveal="lines">Built for small regulated teams that need to answer an auditor with sources, not recollection.</p>
        </div>
        <div className="kb-features" data-reveal-group>
          {FEATURES.map(({ Icon, title, body, meta }) => (
            <article key={title} className="kb-feature" data-reveal="item" tabIndex={0}>
              <div className="kb-feature__icon"><Icon size={18} aria-hidden="true" /></div>
              <h3>{title}</h3>
              <p>{body}</p>
              <div className="kb-feature__meta"><div><code>{meta}</code></div></div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Stats() {
  return (
    <section className="kb-section kb-section--soft" aria-label="Keystone at a glance" style={{ paddingTop: 64, paddingBottom: 64 }}>
      <div className="kb-wrap">
        <div className="kb-stats" data-reveal-group>
          {STATS.map(s => (
            <div key={s.label} className="kb-stat" data-reveal="item">
              <b {...(s.count ? { 'data-count': s.count, 'data-suffix': s.suffix } : {})}>{s.value}</b>
              <span className="kb-mono-label">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function RunIt() {
  const [copied, setCopied] = useState(false);
  const text = RUN.map(([c]) => c).join('\n');
  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }).catch(() => {});
  };
  return (
    <section id="run" className="kb-section" aria-labelledby="kb-run-title">
      <div className="kb-wrap kb-run">
        <div className="kb-section__head" style={{ marginBottom: 0 }}>
          <div className="kb-mono-label">Run it yourself</div>
          <h2 id="kb-run-title" data-reveal="words">Five commands. Nothing leaves the machine.</h2>
          <p data-reveal="lines">Postgres, Neo4j and the models all run locally through Docker and Ollama. Telemetry is off.</p>
        </div>
        <div className="kb-code" data-reveal-group>
          <div data-reveal="item">
            <div className="kb-code__bar">
              <span className="kb-mono-label">Terminal</span>
              <button type="button" className="kb-copy" onClick={copy} aria-label="Copy the commands">
                {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}{copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre>{RUN.map(([c, note]) => (
              <div key={c}><span>{c}</span>{note && <span className="c">{'  # '}{note}</span>}</div>
            ))}</pre>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FinalCta({ onLaunch, onSignIn }) {
  return (
    <section className="kb-section kb-section--soft kb-cta" aria-labelledby="kb-cta-title">
      <div className="kb-wrap">
        <div className="kb-mono-label">Try the demo workspace</div>
        <h2 id="kb-cta-title" data-reveal="words" style={{ marginTop: 12 }}>Know why every decision was made, and when it stopped being right.</h2>
        <p data-reveal="lines">Open the Nimbus Ledger workspace and ask about any decision, as of any date.</p>
        <div className="kb-hero__ctas" data-reveal-group>
          <button type="button" className="kb-btn kb-btn--primary" onClick={onLaunch} data-reveal="item">
            Launch console <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button type="button" className="kb-btn kb-btn--outline" onClick={onSignIn} data-reveal="item">Sign in</button>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="kb-footer">
      <div className="kb-wrap">
        <Logo size={24} subtitle="" />
        <span className="kb-mono-label">Sovereign decision memory · ASYNC’26 Track 1</span>
        <span className="kb-mono-label">PostgreSQL · Neo4j / Graphiti · Ollama</span>
      </div>
    </footer>
  );
}
