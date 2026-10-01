// Scroll motion for the landing only, loaded lazily (GSAP + ScrollTrigger + SplitText, Lenis).
//  - useLenis: smooth scrolling while the landing is mounted, kept in sync with ScrollTrigger.
//  - useReveal: [data-reveal] elements. Hero ("load") plays once on mount; everything else is scrubbed by scroll
//    and reverses on the way up: "words" (staggered words, ~12px rise), "lines" (line by line), "item" (20px, 80ms
//    stagger within [data-reveal-group]). [data-count] numbers count up.
// Safety: nothing is hidden until GSAP has loaded; reduced motion does nothing at all; every scroll trigger's end is
// clamped to the page so the last section always completes; unmount reverts all inline styles.
import { useEffect } from 'react';
import Lenis from 'lenis';

let loading = null;
export function loadGsap() {
  loading ||= Promise.all([import('gsap'), import('gsap/ScrollTrigger'), import('gsap/SplitText')]).then(([g, s, t]) => {
    g.gsap.registerPlugin(s.ScrollTrigger, t.SplitText);
    return { gsap: g.gsap, ScrollTrigger: s.ScrollTrigger, SplitText: t.SplitText };
  });
  return loading;
}

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function useLenis(lenisRef) {
  useEffect(() => {
    if (reducedMotion()) return undefined;
    const html = document.documentElement;
    const prev = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto'; // index.css sets smooth, which fights Lenis
    const lenis = new Lenis({ lerp: 0.12, smoothWheel: true, autoRaf: false });
    lenisRef.current = lenis;
    let raf = 0, cancelled = false, off = () => {};
    loadGsap().then(({ gsap, ScrollTrigger }) => {
      if (cancelled) return;
      const tick = (t) => lenis.raf(t * 1000);
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
      off = () => gsap.ticker.remove(tick);
    }).catch(() => {
      const loop = (t) => { lenis.raf(t); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    });
    return () => {
      cancelled = true;
      off();
      cancelAnimationFrame(raf);
      lenis.destroy();
      lenisRef.current = null;
      html.style.scrollBehavior = prev;
    };
  }, [lenisRef]);
}

export function useReveal(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || reducedMotion()) return undefined;
    let ctx = null, cancelled = false, ro = null, timer = 0;
    loadGsap().then(({ gsap, ScrollTrigger, SplitText }) => {
      if (cancelled) return;
      ctx = gsap.context(() => {
        const scrub = (trigger) => ({ trigger, start: 'top 88%', end: 'clamp(top 52%)', scrub: 0.6 });

        // Hero: a short entrance on load (it is already in view).
        const heroWords = [], heroRest = [];
        root.querySelectorAll('[data-reveal-load] [data-reveal]').forEach((el) => (el.dataset.reveal === 'words' ? heroWords : heroRest).push(el));
        heroWords.forEach((el) => SplitText.create(el, { type: 'words', autoSplit: true,
          onSplit: (s) => gsap.from(s.words, { autoAlpha: 0, y: 14, duration: 0.7, ease: 'power3.out', stagger: 0.06 }) }));
        if (heroRest.length) gsap.from(heroRest, { autoAlpha: 0, y: 16, duration: 0.7, ease: 'power3.out', stagger: 0.09, delay: 0.15 });

        root.querySelectorAll('[data-reveal]').forEach((el) => {
          if (el.closest('[data-reveal-load]')) return;
          const kind = el.dataset.reveal;
          if (kind === 'words') {
            SplitText.create(el, { type: 'words', autoSplit: true,
              onSplit: (s) => gsap.from(s.words, { autoAlpha: 0, y: 12, ease: 'power2.out', stagger: 0.08, scrollTrigger: scrub(el) }) });
          } else if (kind === 'lines') {
            SplitText.create(el, { type: 'lines', autoSplit: true,
              onSplit: (s) => gsap.from(s.lines, { autoAlpha: 0, y: 12, ease: 'power2.out', stagger: 0.12, scrollTrigger: scrub(el) }) });
          }
        });
        root.querySelectorAll('[data-reveal-group]').forEach((group) => {
          const items = group.querySelectorAll(':scope [data-reveal="item"]');
          if (items.length && !group.closest('[data-reveal-load]')) {
            gsap.from(items, { autoAlpha: 0, y: 20, ease: 'power2.out', stagger: 0.08, scrollTrigger: scrub(group) });
          }
        });
        root.querySelectorAll('[data-count]').forEach((el) => {
          const to = Number(el.dataset.count), suffix = el.dataset.suffix || '';
          const o = { v: 0 };
          gsap.to(o, { v: to, ease: 'power1.out', scrollTrigger: scrub(el), onUpdate: () => { el.textContent = `${Math.round(o.v)}${suffix}`; } });
        });
      }, root);
      ro = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(() => ScrollTrigger.refresh(), 150); });
      ro.observe(root);
    }).catch(() => { /* animation is optional: content stays visible */ });
    return () => { cancelled = true; clearTimeout(timer); ro?.disconnect(); ctx?.revert(); };
  }, [rootRef]);
}
