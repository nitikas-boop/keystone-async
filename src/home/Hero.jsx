// Landing hero: copy and CTAs on the left, the animated temporal knowledge graph on the right, with the time strip
// under it, the lineage card on hover / focus, and the butter notice when RET-2.1 v2 → v3 lands.
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowDown } from 'lucide-react';
import TemporalGraph from './TemporalGraph';
import { LineageChip } from './LineageCard';
import { createHeroDirector, PRESENT, sub, clamp01 } from './graphDirector';
import { T_START } from './layout';
import { POLICY_CHANGE } from './graphData';
import { toDay } from './demoGraph';
import { useCompact, useReducedMotion } from './hooks';

const Graph = memo(TemporalGraph);
const frac = (iso) => (toDay(iso) - T_START) / (PRESENT - T_START);
const TICKS = [['2024', 0], ['2025', frac('2025-01-01')], ['2026', frac('2026-01-01')], ['Present', 1]];

export default function Hero({ onLaunch, onHowItWorks }) {
  const reduced = useReducedMotion();
  const compact = useCompact();
  const director = useMemo(() => createHeroDirector({ reduced }), [reduced]);
  const wrapRef = useRef(null);
  const markerRef = useRef(null);
  const fillRef = useRef(null);
  const noticeRef = useRef(null);
  const lastRef = useRef({ f: -1, n: -1 });
  const [focus, setFocus] = useState(null);

  // Runs inside the graph's animation frame: time strip and notice, written straight to the DOM.
  const onFrame = useCallback((d) => {
    const L = lastRef.current;
    const f = Math.round(clamp01((d.day - T_START) / (PRESENT - T_START)) * 1000) / 1000;
    if (f !== L.f) {
      L.f = f;
      if (markerRef.current) markerRef.current.style.left = `${f * 100}%`;
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${f})`;
    }
    const n = Math.round(sub(d.pc, 0.72, 0.86) * 100) / 100;
    if (n !== L.n && noticeRef.current) {
      L.n = n;
      noticeRef.current.style.opacity = n;
      noticeRef.current.style.transform = `translateY(${((1 - n) * 8).toFixed(1)}px)`;
      noticeRef.current.style.visibility = n > 0 ? 'visible' : 'hidden';
    }
  }, []);

  const onFocusNode = useCallback((node, pt) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!node || !pt || !box) { setFocus(null); return; }
    setFocus({ node, x: pt.x - box.left, y: pt.y - box.top, w: box.width, h: box.height });
  }, []);

  const cardStyle = focus && {
    left: Math.max(8, Math.min(focus.x + 18, focus.w - 300)),
    top: focus.y > focus.h - 190 ? focus.y - 150 : focus.y + 18,
  };

  return (
    <section className="kb-hero" aria-labelledby="kb-hero-title" data-reveal-load>
      <div className="kb-hero__copy">
        <div className="kb-mono-label kb-hero__eyebrow">Temporal decision memory · on your own hardware</div>
        <h1 id="kb-hero-title" className="kb-hero__title" data-reveal="words">Keystone</h1>
        <p className="kb-hero__lede" data-reveal="lines">The dynamic record-keeper mapping every evolving decision across time.</p>
        <p className="kb-hero__body" data-reveal="lines">
          Keystone remembers the reasoning, policies, rules and evidence behind every decision. When a policy changes, it
          identifies the historical decisions it affects, and shows exactly why each one was made.
        </p>
        <div className="kb-hero__ctas" data-reveal="item">
          <button type="button" className="kb-btn kb-btn--primary" onClick={onLaunch}>
            Launch console <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button type="button" className="kb-btn kb-btn--outline" onClick={onHowItWorks}>
            See how it works <ArrowDown size={16} aria-hidden="true" />
          </button>
        </div>
        <ul className="kb-hero__legend" aria-label="Graph legend">
          <li><span className="kb-key kb-key--decision" />Decision</li>
          <li><span className="kb-key kb-key--policy" />Policy version</li>
          <li><span className="kb-key kb-key--clause" />Clause</li>
          <li><span className="kb-key kb-key--evidence" />Meeting note</li>
          <li><span className="kb-key kb-key--person" />Person</li>
        </ul>
      </div>

      <div className="kb-hero__visual">
        <div ref={wrapRef} className="kb-graph-frame">
          <Graph director={director} compact={compact} reduced={reduced} onFrame={onFrame} onFocusNode={onFocusNode} />
          <div ref={noticeRef} className="kb-notice" role="status" style={reduced ? { opacity: 1 } : { opacity: 0, visibility: 'hidden' }}>
            <div className="kb-notice__head"><span className="kb-mono-label">Policy changed</span><span className="kb-mono-label">{POLICY_CHANGE.date}</span></div>
            <div className="kb-notice__title">RET-2.1 v2 → v3 · {POLICY_CHANGE.affected.length} historical decisions affected</div>
            <ul className="kb-notice__list">
              <li><span className="kb-dot kb-dot--alert" aria-hidden="true" /><b>DEC-007</b> keeps logs 180 days: ongoing breach</li>
              <li><span className="kb-dot kb-dot--old" aria-hidden="true" /><b>DEC-002</b> superseded, historical only</li>
            </ul>
          </div>
          {focus && <LineageChip node={focus.node} style={cardStyle} />}
        </div>
        <div className="kb-strip" aria-hidden="true">
          <div className="kb-strip__track"><i ref={fillRef} className="kb-strip__fill" style={{ transform: `scaleX(${reduced ? 1 : 0})` }} /></div>
          <span ref={markerRef} className="kb-strip__marker" style={{ left: reduced ? '100%' : '0%' }} />
          {TICKS.map(([label, f]) => (
            <span key={label} className="kb-strip__tick" style={{ left: `${f * 100}%` }}><span>{label}</span></span>
          ))}
        </div>
      </div>
    </section>
  );
}
