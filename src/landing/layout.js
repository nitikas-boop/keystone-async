// Precomputed 3D force layout of the demo graph. d3-force-3d seeds nodes deterministically, so every load
// produces the same shape; 300 ticks over 23 nodes takes well under a millisecond budget at import.
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceX, forceY, forceZ } from 'd3-force-3d';
import { NODES, EDGES } from './demoGraph';

export const GRAPH_CENTER = [0, 0.7, 0];
const RADIUS = 3.4; // world units the layout is scaled to

function compute() {
  const nodes = NODES.map(n => ({ id: n.id }));
  const links = EDGES.filter(e => e.type !== 'FLAGS').map(e => ({ source: e.source, target: e.target }));
  const sim = forceSimulation(nodes, 3)
    .force('link', forceLink(links).id(d => d.id).distance(34).strength(0.6))
    .force('charge', forceManyBody().strength(-90))
    .force('center', forceCenter(0, 0, 0))
    // People without decisions (Rohit, Sneha, Priya) would drift off; a weak pull keeps them in frame.
    .force('x', forceX(0).strength(0.04))
    .force('y', forceY(0).strength(0.06))
    .force('z', forceZ(0).strength(0.04))
    .stop();
  for (let i = 0; i < 300; i++) sim.tick();

  let max = 0;
  for (const n of nodes) max = Math.max(max, Math.hypot(n.x, n.y, n.z));
  const k = RADIUS / (max || 1);
  const out = new Float32Array(nodes.length * 3);
  nodes.forEach((n, i) => {
    out[i * 3] = n.x * k + GRAPH_CENTER[0];
    out[i * 3 + 1] = n.y * k * 0.8 + GRAPH_CENTER[1]; // slightly flattened: reads better on a wide screen
    out[i * 3 + 2] = n.z * k + GRAPH_CENTER[2];
  });
  return out;
}

export const NODE_POS = compute();
