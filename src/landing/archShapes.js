// 2D outlines of the arch, shared by the 3D scene (extruded) and the static SVG fallback (drawn flat).
// Units are world units; the springline (where the arch meets the pillars) is y = 0.
export const ARCH = { r1: 2.2, r2: 3.0, keyOuter: 3.3, blocks: 13, gap: 0.0065, depth: 1.1 };
export const KEYSTONE_INDEX = 6;

function arc(r, a0, a1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

// 13 wedge-shaped voussoirs from left (angle π) to right (angle 0); the middle one is the taller keystone.
export function voussoirs() {
  const { r1, r2, keyOuter, blocks, gap } = ARCH;
  const step = Math.PI / blocks;
  const out = [];
  for (let i = 0; i < blocks; i++) {
    const a1 = Math.PI - i * step - gap;
    const a0 = Math.PI - (i + 1) * step + gap;
    const outer = i === KEYSTONE_INDEX ? keyOuter : r2;
    const pts = [...arc(outer, a0, a1, 6), ...arc(r1, a1, a0, 6)];
    out.push({ pts, keystone: i === KEYSTONE_INDEX });
  }
  return out;
}

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

// Each pillar: a plinth, three ashlar courses and an impost block under the springline.
export function pillarStones() {
  const out = [];
  for (const side of [-1, 1]) {
    const c = side * 2.6;
    out.push(rect(c - 0.57, -3.06, c + 0.57, -2.76));
    for (let k = 0; k < 3; k++) {
      const y0 = -2.74 + k * 0.84;
      out.push(rect(c - 0.43, y0, c + 0.43, y0 + 0.82));
    }
    out.push(rect(c - 0.52, -0.22, c + 0.52, -0.02));
  }
  return out;
}

export function centroid(pts) {
  let x = 0, y = 0;
  for (const [px, py] of pts) { x += px; y += py; }
  return [x / pts.length, y / pts.length];
}
