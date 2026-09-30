// Precomputed force layout of the landing graph: organic, not symmetric, with time flowing loosely left to right
// (a weak x-pull toward each node's date) so the temporal strip underneath reads naturally. d3-force seeds nodes
// deterministically, so every load produces the same shape.
import { forceSimulation, forceLink, forceManyBody, forceX, forceY, forceCollide } from 'd3-force';
import { NODES, EDGES, POLICY_CHANGE } from './graphData';
import { toDay } from '../landing/demoGraph';

export const VIEW = { w: 760, h: 520, pad: 44 };
export const T_START = toDay('2024-01-01');
export const T_END = toDay('2026-09-30');
export const RADIUS = { decision: 7.5, policy: 8.5, clause: 6.5, evidence: 5, person: 5 };
const LINK_DIST = { MADE_BY: 78, RELIED_ON: 60, SUPERSEDES: 66, SOURCE: 54, CONTAINS: 44, PREVIOUS: 62, ATTENDED: 92, DISCUSSES: 70 };

function compute(compact) {
  const keep = (n) => !compact || !(n.kind === 'person' || n.kind === 'policy');
  const nodes = NODES.map((n, i) => ({ i, id: n.id, kind: n.kind, t: (toDay(n.date) - T_START) / (T_END - T_START), keep: keep(n) }))
    .filter(n => n.keep);
  const ids = new Set(nodes.map(n => n.id));
  const links = EDGES.filter(e => ids.has(e.source) && ids.has(e.target)).map(e => ({ source: e.source, target: e.target, type: e.type }));
  const inner = VIEW.w - 2 * VIEW.pad;
  const sim = forceSimulation(nodes)
    .force('link', forceLink(links).id(d => d.id).distance(d => LINK_DIST[d.type] || 50).strength(0.35))
    .force('charge', forceManyBody().strength(compact ? -240 : -230).distanceMax(320))
    .force('x', forceX(d => VIEW.pad + d.t * inner).strength(0.18))
    .force('y', forceY(VIEW.h / 2).strength(0.035))
    .force('collide', forceCollide(d => RADIUS[d.kind] + 14))
    .stop();
  for (let k = 0; k < 360; k++) sim.tick();

  // Fit into the view box.
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const n of nodes) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); }
  const s = Math.min((VIEW.w - 2 * VIEW.pad) / (x1 - x0 || 1), (VIEW.h - 2 * VIEW.pad) / (y1 - y0 || 1));
  const ox = (VIEW.w - (x1 - x0) * s) / 2, oy = (VIEW.h - (y1 - y0) * s) / 2;
  const pos = new Map(nodes.map(n => [n.id, { x: ox + (n.x - x0) * s, y: oy + (n.y - y0) * s }]));
  // RET-2.1 v3 arrives late: place it just beyond v2, toward the present, so the v2 → v3 link reads clearly.
  if (pos.has(POLICY_CHANGE.to) && pos.has(POLICY_CHANGE.from)) {
    const a = pos.get(POLICY_CHANGE.from), b = pos.get(POLICY_CHANGE.to);
    b.x = Math.max(b.x, a.x + 70);
    b.x = Math.min(b.x, VIEW.w - VIEW.pad);
  }
  return pos;
}

const cache = {};
export function layoutFor(compact) {
  const key = compact ? 'c' : 'f';
  return (cache[key] ||= compute(compact));
}
