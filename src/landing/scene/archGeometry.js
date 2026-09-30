// Extruded, slightly bevelled stone blocks for the arch. Each block is centred on its own centroid so it can be
// nudged and rotated in place; tiny seeded offsets keep the masonry from looking machine-perfect.
import { Shape, Vector2, ExtrudeGeometry } from 'three';
import { voussoirs, pillarStones, centroid, ARCH } from '../archShapes';

export function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function block(pts, depth, rng, still) {
  const [cx, cy] = centroid(pts);
  const shape = new Shape(pts.map(([x, y]) => new Vector2(x - cx, y - cy)));
  const geometry = new ExtrudeGeometry(shape, {
    depth, curveSegments: 4, steps: 1,
    bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelOffset: -0.03, bevelSegments: 2,
  });
  geometry.translate(0, 0, -depth / 2);
  // Shift UVs per block so neighbours don't show the same stone pattern.
  const uv = geometry.attributes.uv;
  const du = rng() * 20, dv = rng() * 20;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + du, uv.getY(i) + dv);
  const j = (s) => (rng() - 0.5) * 2 * s;
  return {
    geometry,
    position: [cx + (still ? 0 : j(0.012)), cy + (still ? 0 : j(0.01)), still ? 0 : j(0.035)],
    rotation: [still ? 0 : j(0.012), still ? 0 : j(0.015), still ? 0 : j(0.01)],
  };
}

export function buildArch(seed = 7) {
  const rng = mulberry32(seed);
  const blocks = [];
  let keystone = null;
  for (const v of voussoirs()) {
    const b = block(v.pts, ARCH.depth, rng, v.keystone);
    if (v.keystone) keystone = b; else blocks.push(b);
  }
  for (const pts of pillarStones()) blocks.push(block(pts, ARCH.depth + 0.1, rng, false));
  return { blocks, keystone };
}
