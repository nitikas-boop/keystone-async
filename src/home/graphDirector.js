// What the landing graph should show right now. The engine (TemporalGraph) reads these fields every frame:
//   day      – time cursor (days since epoch): hero nodes appear as their date passes
//   storyP   – scroll-story position 0…6 (Remember, Understand, Connect, Evolve, Detect, Explain)
//   pc       – policy change 0…1: v3 appears → v2→v3 link draws → pulse → DEC-007 alert, DEC-002 superseded
//   explain  – 0…1 focus on DEC-007's lineage (story step 6)
// A hero director scripts itself from elapsed time; a story director is written by ScrollTrigger.
import { T_START, T_END } from './layout';

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const sub = (x, a, b) => clamp01((x - a) / (b - a));
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// "Present" before the change: the day the sweep ends; RET-2.1 v3 then arrives via the policy-change loop.
export const PRESENT = T_END;

const SWEEP = 6.5;   // s: 2024 → Present on first view
const CYCLE = 12.5;  // s: one policy-change loop
const PLAY = 5.5;    // s: 0 → 1
const HOLD = 4.2;    // s: settled, notification visible
const BACK = 1.4;    // s: relax back

export function createHeroDirector({ reduced = false } = {}) {
  return {
    mode: 'hero', day: reduced ? PRESENT : T_START, storyP: 6, pc: reduced ? 1 : 0, explain: 0,
    update(t) {
      if (reduced) return;
      this.day = T_START + (PRESENT - T_START) * easeInOut(clamp01(t / SWEEP));
      const c = t - SWEEP - 1.5;
      if (c < 0) { this.pc = 0; return; }
      const k = c % CYCLE;
      this.pc = k < PLAY ? easeInOut(k / PLAY) : k < PLAY + HOLD ? 1 : k < PLAY + HOLD + BACK ? 1 - easeInOut((k - PLAY - HOLD) / BACK) : 0;
    },
  };
}

export function createStoryDirector({ reduced = false } = {}) {
  let last = 0;
  return {
    mode: 'story', day: PRESENT, storyP: 0, target: 0, pc: 0, explain: 0,
    update(t) {
      // ScrollTrigger writes `target`; storyP glides after it so the graph eases to a stop instead of jerking.
      const dt = Math.min(0.05, Math.max(0, t - last));
      last = t;
      this.storyP = reduced ? this.target : this.storyP + (this.target - this.storyP) * Math.min(1, dt * 6);
      if (Math.abs(this.target - this.storyP) < 1e-4) this.storyP = this.target;
      this.pc = sub(this.storyP, 3, 4.6);
      this.explain = sub(this.storyP, 4.95, 5.45);
    },
  };
}
