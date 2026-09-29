// Deterministic graph layout: x is proportional to the node's date (valid-from / decided-on), y is one lane per
// entity type. Nodes in a lane that would sit closer than `minGap` are moved to a sub-row, so no two nodes
// overlap. Same input -> same positions, and positions depend only on the node set, not on the as-of date,
// so nodes stay put while the timeline moves.
import { addDays, daysBetween } from './format.js';

export const LANE_ORDER = ['policy_version', 'clause', 'flag', 'decision', 'meeting_note', 'project', 'person'];

export function layout(nodes, { width = 1200, padX = 70, top = 40, rowGap = 58, laneGap = 26, minGap = 96, today } = {}) {
  const dated = nodes.map(n => n.date).filter(Boolean).sort();
  const start = dated[0] || today || '2024-01-01';
  let end = [dated[dated.length - 1], today].filter(Boolean).sort().pop() || start;
  if (end === start) end = addDays(start, 1);
  const span = daysBetween(start, end);
  const x = (d) => padX + (daysBetween(start, d) / span) * (width - 2 * padX);

  const byLane = {};
  for (const n of [...nodes].sort((a, b) => a.id.localeCompare(b.id))) {
    (byLane[n.type] ||= []).push(n);
  }
  const laneTypes = [...LANE_ORDER.filter(t => byLane[t]), ...Object.keys(byLane).filter(t => !LANE_ORDER.includes(t)).sort()];

  const pos = {};
  const lanes = [];
  let y = top;
  for (const type of laneTypes) {
    const members = byLane[type];
    const undated = members.filter(n => !n.date);
    const items = members.filter(n => n.date).map(n => ({ id: n.id, x: x(n.date) }));
    undated.forEach((n, i) => items.push({ id: n.id, x: padX + ((i + 1) / (undated.length + 1)) * (width - 2 * padX) }));
    items.sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
    const rowsLastX = [];
    for (const it of items) {
      let r = rowsLastX.findIndex(last => it.x - last >= minGap);
      if (r === -1) { r = rowsLastX.length; rowsLastX.push(-Infinity); }
      rowsLastX[r] = it.x;
      pos[it.id] = { x: Math.round(it.x), y: Math.round(y + r * rowGap) };
    }
    const rows = Math.max(rowsLastX.length, 1);
    lanes.push({ type, y0: y - rowGap / 2, y1: y + (rows - 1) * rowGap + rowGap / 2 });
    y += rows * rowGap + laneGap;
  }

  // Axis ticks: 1 Jan and 1 Jul of each year in range.
  const ticks = [];
  for (let yr = Number(start.slice(0, 4)); yr <= Number(end.slice(0, 4)); yr++) {
    for (const m of ['01', '07']) {
      const d = `${yr}-${m}-01`;
      if (d >= start && d <= end) ticks.push({ date: d, x: Math.round(x(d)) });
    }
  }
  return { pos, lanes, ticks, width, height: y - laneGap + 10, start, end, x };
}
