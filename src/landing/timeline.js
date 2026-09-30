// The whole intro is a function of one damped scroll value p in [0, 1]. Stage windows overlap by ~0.05 so every
// scene cross-fades into the next; nothing here depends on wall-clock time.
import { toDay, BREACH } from './demoGraph';

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const ramp = (p, a, b) => clamp01((p - a) / (b - a));
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
export const smooth = (p, a, b) => { const t = ramp(p, a, b); return t * t * (3 - 2 * t); };
// 1 inside [a, b], easing in over `f` before a and out over `f` after b.
export const window01 = (p, a, b, f = 0.03) => smooth(p, a - f, a) * (1 - smooth(p, b, b + f));

export const STAGE = {
  arch: [0, 0.15],
  slide: [0.15, 0.3],
  shatter: [0.3, 0.45],
  graph: [0.45, 0.65],
  people: [0.65, 0.75],
  time: [0.75, 0.95],
  handoff: [0.95, 1],
};

// Timeline: 0.75 → 0.90 covers 2024-01-01 → the breach day, 0.90 → 0.95 the last two days, so the red ripple
// has room to play instead of fitting in a sliver of scroll.
const T0 = toDay('2024-01-01');
const TB = toDay(BREACH.date);
const TEND = toDay('2026-09-30');
export const BREACH_DAY = TB;
export function dayAt(p) {
  if (p <= 0.75) return T0;
  if (p <= 0.9) return T0 + (TB - T0) * easeInOutCubic(ramp(p, 0.75, 0.9));
  return TB + (TEND - TB) * ramp(p, 0.9, 0.95);
}
export const breachAt = (p) => ramp(p, 0.9, 0.935); // ripple travel along RET-2.1@v3 → DEC-007
export const timelineOn = (p) => smooth(p, 0.735, 0.78);

// Glass cards: [in, out] in p. The first is visible from the top; the last stays to the end.
export const CARDS = [
  { id: 'hero', range: [-1, 0.12] },
  { id: 'graph', range: [0.56, 0.64] },
  { id: 'people', range: [0.67, 0.745] },
  { id: 'time', range: [0.8, 0.915] },
  { id: 'final', range: [0.972, 2] },
];
