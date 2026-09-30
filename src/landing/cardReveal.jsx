// Scroll-scrubbed text reveal for the intro's glass cards. Headline words fade in and rise ~12px one after
// another, then the body follows line by line. Everything is a pure function of the card's local scroll
// progress t (0 → 1), so scrolling back up hides it again in reverse. Words are visible by default: styles are
// only written once the render loop runs.
import { clamp01, ramp } from './timeline';

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

// Words of a string (or of rich parts: strings and [text, className] pairs) as inline-block spans.
export function Words({ parts }) {
  const list = typeof parts === 'string' ? [parts] : parts;
  const out = [];
  list.forEach((part, k) => {
    if (Array.isArray(part)) {
      out.push(<span key={`${k}`} className={`ks-w ${part[1]}`}>{part[0]}</span>);
      return;
    }
    part.split(/(\s+)/).forEach((w, j) => {
      if (!w) return;
      out.push(/^\s+$/.test(w) ? ' ' : <span key={`${k}-${j}`} className="ks-w">{w}</span>);
    });
  });
  return out;
}

// Groups a card's words: headline words in order, then body words by rendered line (measured from layout),
// with the action row, if any, as the final line.
export function measureCard(card) {
  const head = [...card.querySelectorAll('h2 .ks-w')];
  const lines = [];
  for (const block of card.querySelectorAll('p')) {
    let top = null, line = null;
    for (const w of block.querySelectorAll('.ks-w')) {
      const y = w.offsetTop;
      if (top === null || Math.abs(y - top) > 4) { top = y; line = []; lines.push(line); }
      line.push(w);
    }
  }
  const actions = card.querySelector('.ks-actions');
  if (actions) lines.push([actions]);
  return { head, lines, t: -1 };
}

function set(el, e) {
  if (e > 0.999) e = 1;
  el.style.opacity = e;
  el.style.transform = e >= 1 ? '' : `translateY(${((1 - e) * 12).toFixed(2)}px)`;
}

// Card window starts at `a` (see CARDS in timeline.js): the words play over [a - 0.022, a + 0.05], ending
// before the end of the scroll so the last card always finishes (p never passes 1).
export function revealCard(g, p, a) {
  const end = Math.min(a + 0.05, 0.99);
  const t = Math.round(ramp(p, Math.min(a - 0.022, end - 0.03), end) * 1000) / 1000;
  if (t === g.t) return;
  g.t = t;
  const n = g.head.length;
  g.head.forEach((w, i) => set(w, easeOutCubic(clamp01((t - (0.45 * i) / Math.max(n - 1, 1)) / 0.25))));
  const L = g.lines.length;
  g.lines.forEach((line, j) => {
    const e = easeOutCubic(clamp01((t - (0.55 + (0.15 * j) / Math.max(L - 1, 1))) / 0.3));
    for (const w of line) set(w, e);
  });
}
