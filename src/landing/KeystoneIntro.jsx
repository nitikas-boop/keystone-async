// Scroll-driven 3D intro. One scroll progress value drives everything: Lenis smooths the page scroll, the canvas
// damps it again (see scene/Scene.jsx), and the DOM chrome below reads the same damped value every frame.
import { useCallback, useEffect, useRef, useState } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { gsap } from 'gsap';
import '@fontsource/playfair-display/600.css';
import '@fontsource/playfair-display/700.css';
import './landing.css';
import Scene from './scene/Scene';
import Tooltip from './Tooltip';
import { CARDS, dayAt, window01, clamp01 } from './timeline';
import { fromDay } from './demoGraph';
import { Words, measureCard, revealCard } from './cardReveal';

// Base transform of each positioned card (see landing.css); the fade adds a small rise on top.
const CARD_BASE = { hero: 'translateX(-50%)', graph: 'translateY(-50%)', people: 'translateY(-50%)', time: 'translateY(-50%)', final: 'translate(-50%, -50%)' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function KeystoneIntro({ onLaunchConsole }) {
  const sectionRef = useRef(null);
  const cardRefs = useRef({});
  const lineRef = useRef(null);
  const yearRef = useRef(null);
  const yearSubRef = useRef(null);
  const skipRef = useRef(null);
  const lenisRef = useRef(null);
  const invalidateRef = useRef(null);
  const last = useRef({ cards: {}, year: '', sub: '', skip: -1, yearO: -1 });
  const groups = useRef({}); // per card: its headline words and body lines, for the scroll-scrubbed text reveal
  // raw: scroll progress now; damped: what the scene shows (eases behind raw); snap: jump without gliding.
  const [prog] = useState(() => ({ raw: 0, damped: 0, snap: false, animating: false }));
  const [lite] = useState(() => window.innerWidth < 768);
  const [tip, setTip] = useState(null);

  useEffect(() => {
    const html = document.documentElement;
    const prevBehavior = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto'; // index.css sets smooth, which fights Lenis

    const lenis = new Lenis({ lerp: 0.1, smoothWheel: true, autoRaf: false });
    lenisRef.current = lenis;
    const raf = (t) => lenis.raf(t * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    const measure = () => {
      const el = sectionRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const span = el.offsetHeight - window.innerHeight;
      prog.raw = clamp01((window.scrollY - top) / (span || 1));
      invalidateRef.current?.();
    };
    lenis.on('scroll', measure);
    window.addEventListener('resize', measure);
    measure();
    prog.damped = prog.raw;

    return () => {
      window.removeEventListener('resize', measure);
      gsap.ticker.remove(raf);
      lenis.destroy();
      lenisRef.current = null;
      html.style.scrollBehavior = prevBehavior;
    };
  }, [prog]);

  // Measure each card's words into headline / body lines; again once fonts load and on resize (lines rewrap).
  useEffect(() => {
    const measureAll = () => {
      for (const c of CARDS) {
        const el = cardRefs.current[c.id];
        if (el && c.id !== 'hero') groups.current[c.id] = measureCard(el);
      }
      invalidateRef.current?.();
    };
    measureAll();
    document.fonts?.ready.then(measureAll);
    window.addEventListener('resize', measureAll);
    return () => window.removeEventListener('resize', measureAll);
  }, []);

  // Called from inside the render loop with the damped progress; writes styles directly (no React re-render).
  const onFrame = useCallback((p) => {
    const L = last.current;
    for (const c of CARDS) {
      const el = cardRefs.current[c.id];
      if (!el) continue;
      const o = Math.round(window01(p, c.range[0], c.range[1], 0.028) * 1000) / 1000;
      if (L.cards[c.id] === o) continue;
      L.cards[c.id] = o;
      el.style.opacity = o;
      el.style.visibility = o > 0.002 ? 'visible' : 'hidden';
      el.style.pointerEvents = o > 0.6 ? 'auto' : 'none';
      el.style.transform = `${CARD_BASE[c.id]} translateY(${((1 - o) * 18).toFixed(2)}px)`;
    }
    for (const c of CARDS) {
      const g = groups.current[c.id];
      if (g && (L.cards[c.id] ?? 0) > 0) revealCard(g, p, c.range[0]);
    }
    if (lineRef.current) lineRef.current.style.transform = `scaleY(${p.toFixed(4)})`;

    const yo = Math.round(window01(p, 0.77, 0.95, 0.025) * 1000) / 1000;
    if (yearRef.current && yo !== L.yearO) {
      L.yearO = yo;
      yearRef.current.style.opacity = yo;
    }
    if (yo > 0) {
      const iso = fromDay(Math.floor(dayAt(p)));
      const y = iso.slice(0, 4);
      const text = y === '2026' ? `${MONTHS[+iso.slice(5, 7) - 1]} ${y}` : y;
      if (text !== L.year && yearRef.current) { L.year = text; yearRef.current.firstChild.nodeValue = text; }
      if (iso !== L.sub && yearSubRef.current) { L.sub = iso; yearSubRef.current.textContent = iso; }
    }
    const so = p < 0.94 ? 1 : 0;
    if (skipRef.current && so !== L.skip) {
      L.skip = so;
      skipRef.current.style.opacity = so;
      skipRef.current.style.pointerEvents = so ? 'auto' : 'none';
      skipRef.current.tabIndex = so ? 0 : -1;
    }
  }, []);

  const landingTop = () => {
    const el = sectionRef.current;
    return el ? el.getBoundingClientRect().top + window.scrollY + el.offsetHeight : 0;
  };
  const skip = () => {
    prog.snap = true; // jump straight to the end instead of fast-forwarding the whole story
    lenisRef.current?.scrollTo(landingTop(), { immediate: true });
  };
  const explore = () => lenisRef.current?.scrollTo(landingTop(), { duration: 1.4 });
  const launch = () => {
    lenisRef.current?.scrollTo(0, { immediate: true });
    window.scrollTo(0, 0);
    onLaunchConsole('p-priya', 'Priya Menon (Ops Lead)');
  };

  const card = (id) => (el) => { cardRefs.current[id] = el; };

  return (
    <section ref={sectionRef} className="ks-intro" style={{ height: '600vh' }} aria-label="Keystone introduction">
      <div className="ks-stage">
        <div className="ks-canvas" aria-hidden="true">
          <Scene prog={prog} lite={lite} onFrame={onFrame} invalidateRef={invalidateRef} onHover={setTip} />
        </div>
        <div className="ks-vignette" />

        <div className="ks-overlay">
          <div ref={card('hero')} className="ks-card ks-card--hero" style={{ opacity: 1, visibility: 'visible' }}>
            <div className="ks-eyebrow">Keystone · temporal decision memory</div>
            <h2>A decision was correct when we made it. The rules changed. What happens now?</h2>
            <p>Scroll to see what Keystone remembers.</p>
          </div>
          <div ref={card('graph')} className="ks-card ks-card--left">
            <div className="ks-eyebrow">Knowledge graph</div>
            <h2><Words parts="Every decision linked to the exact rule in force." /></h2>
            <p><Words parts={[['DEC-007', 'ks-mono'], ' relied on ', ['RET-2.1@v2', 'ks-mono'], ', the retention clause in force on 2025-06-18.']} /></p>
          </div>
          <div ref={card('people')} className="ks-card ks-card--left">
            <div className="ks-eyebrow">Ownership</div>
            <h2><Words parts="Every decision has an owner, even after they leave." /></h2>
            <p><Words parts="Vikram left in August 2025. His four decisions still point to him, and to the rules he relied on." /></p>
          </div>
          <div ref={card('time')} className="ks-card ks-card--left">
            <div className="ks-eyebrow">Point-in-time compliance</div>
            <h2><Words parts="Policy changes, flagged the same day." /></h2>
            <p><Words parts={[['RET-2.1@v3', 'ks-mono'], ' cuts retention to 90 days on 2026-09-28. ', ['DEC-007', 'ks-mono'], ' keeps logs for 180, so it is flagged the day the rule takes effect.']} /></p>
          </div>
          <div ref={card('final')} className="ks-card ks-card--final">
            <div className="ks-eyebrow">Human in the loop · sovereign by design</div>
            <h2><Words parts="Every action approved by a human. Everything on your own hardware." /></h2>
            <div className="ks-actions">
              <button type="button" className="ks-btn ks-btn--primary" onClick={launch}>Launch console →</button>
              <button type="button" className="ks-btn ks-btn--ghost" onClick={explore}>Explore ↓</button>
            </div>
          </div>
        </div>

        <div ref={yearRef} className="ks-year" aria-hidden="true">2024<small ref={yearSubRef}>2024-01-01</small></div>
        <button ref={skipRef} type="button" className="ks-skip" onClick={skip}>Skip intro ↓</button>
        <div className="ks-progress" aria-hidden="true"><i ref={lineRef} /></div>
        {tip && <Tooltip tip={tip} />}
      </div>
    </section>
  );
}
