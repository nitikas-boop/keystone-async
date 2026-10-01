// "How it works": a sticky graph panel that evolves with scroll next to six short steps
// (Capture → Understand → Remember → Evolve → Detect → Explain, told as Remember · Understand · Connect · Evolve ·
// Detect · Explain). One ScrollTrigger maps the steps' scroll range to the story position; scrolling up reverses it.
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import TemporalGraph from './TemporalGraph';
import { ExplainCard } from './LineageCard';
import { createStoryDirector, clamp01 } from './graphDirector';
import { loadGsap } from './motion';
import { POLICY_CHANGE } from './graphData';
import { useCompact, useReducedMotion } from './hooks';

const Graph = memo(TemporalGraph);

const STEPS = [
  { key: 'Remember', title: 'Remember what was decided.', body: 'Decisions and the policy versions around them, each with its real date. Nothing is summarised away.' },
  { key: 'Understand', title: 'Understand why.', body: 'Every decision links to its reason, the exact clause version it relied on, and the meeting note it came from.' },
  { key: 'Connect', title: 'Connect it all.', body: 'People, projects and earlier decisions join the record. Owners stay attached, even after they leave.' },
  { key: 'Evolve', title: 'Policies evolve.', body: 'RET-2.1 v3 arrives on 2026-09-28 and cuts customer log retention from 180 to 90 days. The new version links to the one it replaces.' },
  { key: 'Detect', title: 'Detect what the change breaks.', body: `The scanner walks the graph the same day: ${POLICY_CHANGE.affected.length} historical decisions are affected. DEC-007 is now an ongoing breach; DEC-002 was already superseded.` },
  { key: 'Explain', title: 'Explain it, with sources.', body: 'Open DEC-007 and see exactly why it existed: the reason, the clause version in force, and the sentence it came from.' },
];

export default function ScrollStory() {
  const reduced = useReducedMotion();
  const compact = useCompact();
  const director = useMemo(() => createStoryDirector({ reduced }), [reduced]);
  const stepsRef = useRef(null);
  const barRefs = useRef([]);
  const explainRef = useRef(null);
  const last = useRef({ step: -1, ex: -1 });

  useEffect(() => {
    let st = null, cancelled = false;
    const setFromScroll = () => {
      // Fallback without GSAP: derive the position from the steps' place in the viewport.
      const el = stepsRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const p = clamp01((window.innerHeight * 0.6 - r.top) / (r.height - window.innerHeight * 0.4));
      director.target = p * 6;
    };
    loadGsap().then(({ ScrollTrigger }) => {
      if (cancelled) return;
      st = ScrollTrigger.create({
        trigger: stepsRef.current, start: 'top 60%', end: 'bottom 80%',
        onUpdate: (self) => { director.target = self.progress * 6; },
      });
      director.target = st.progress * 6;
    }).catch(() => { window.addEventListener('scroll', setFromScroll, { passive: true }); setFromScroll(); });
    return () => { cancelled = true; st?.kill(); window.removeEventListener('scroll', setFromScroll); };
  }, [director]);

  const onFrame = useCallback((d) => {
    const L = last.current;
    const step = Math.min(STEPS.length - 1, Math.max(0, Math.floor(d.storyP + 0.35)));
    if (step !== L.step) {
      L.step = step;
      barRefs.current.forEach((el, i) => el?.classList.toggle('is-on', i <= step));
    }
    const ex = Math.round(d.explain * 100) / 100;
    if (ex !== L.ex && explainRef.current) {
      L.ex = ex;
      const s = explainRef.current.style;
      s.opacity = ex;
      s.visibility = ex > 0 ? 'visible' : 'hidden';
      s.transform = `translateY(${((1 - ex) * 10).toFixed(1)}px)`;
    }
  }, []);

  return (
    <section id="how" className="kb-story" aria-labelledby="kb-story-title">
      <div className="kb-wrap">
        <div className="kb-story__intro">
          <div className="kb-mono-label">How it works</div>
          <h2 id="kb-story-title" data-reveal="words">One graph, from a decision to its evidence.</h2>
          <p data-reveal="lines">Keystone keeps decisions, the rules they relied on and the evidence behind them in a single temporal graph. Scroll to watch it remember, connect, evolve, detect and explain.</p>
        </div>
        <div className="kb-story__grid">
          <div ref={stepsRef} className="kb-story__steps">
            {STEPS.map((s, i) => (
              <article key={s.key} className="kb-step">
                <div className="kb-step__num kb-mono-label"><span>0{i + 1}</span><i aria-hidden="true" /><span>{s.key}</span></div>
                <h3 data-reveal="words">{s.title}</h3>
                <p data-reveal="lines">{s.body}</p>
              </article>
            ))}
          </div>
          <div className="kb-story__panel">
            <div className="kb-story__frame kb-graph-frame">
              <Graph director={director} compact={compact} still={reduced} onFrame={onFrame}
                     ariaLabel="The Nimbus Ledger graph, changing with each step of the story" />
              <div ref={explainRef} className="kb-explain"><ExplainCard /></div>
            </div>
            <div className="kb-story__steps-bar" aria-hidden="true">
              {STEPS.map((s, i) => <span key={s.key} ref={(el) => { barRefs.current[i] = el; }}>{s.key}</span>)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
