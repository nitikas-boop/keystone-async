// Scroll-scrubbed reveal for the landing sections below the 3D intro: headings, paragraphs, cards and buttons
// fade in and rise ~20px as their section enters the viewport, ~80ms apart, and play back in reverse on the way
// up. GSAP loads lazily, so the dashboard bundle is untouched.
//
// Safety: content is fully visible until GSAP has loaded and set its start state; reduced motion skips the
// whole thing; every trigger is clamped to the scrollable range so nothing can stay stuck part-way (even the
// last section at the bottom of the page completes); unmount reverts every inline style.
import { useEffect } from 'react';

const TARGETS = 'h1, h2, h3, p, .paper-sheet, .paper-sheet-interactive, .paper-sheet-elevated, table, pre, button, a, [role="tab"]';

// Keep only the outermost matches, so a card and the paragraph inside it don't both animate (and compound).
function outermost(els) {
  const set = new Set(els);
  return els.filter((el) => {
    for (let p = el.parentElement; p; p = p.parentElement) if (set.has(p)) return false;
    return true;
  });
}

export default function useScrollReveal(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    let ctx = null, ro = null, cancelled = false, refreshTimer = 0;

    Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(([{ gsap }, { ScrollTrigger }]) => {
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      ctx = gsap.context(() => {
        for (const section of root.querySelectorAll(':scope > section, :scope > footer')) {
          const items = outermost([...section.querySelectorAll(TARGETS)]);
          if (!items.length) continue;
          gsap.fromTo(items, { autoAlpha: 0, y: 20 }, {
            autoAlpha: 1, y: 0, ease: 'power2.out', duration: 0.5, stagger: 0.08,
            scrollTrigger: { trigger: section, start: 'clamp(top 88%)', end: 'clamp(top 45%)', scrub: 0.6 },
          });
        }
      }, root);
      // The lazy intro above changes the page height after mount: re-measure when it does.
      ro = new ResizeObserver(() => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => ScrollTrigger.refresh(), 120); });
      ro.observe(document.body);
    }).catch(() => { /* animation is optional: content simply stays visible */ });

    return () => {
      cancelled = true;
      clearTimeout(refreshTimer);
      ro?.disconnect();
      ctx?.revert();
    };
  }, [rootRef]);
}
