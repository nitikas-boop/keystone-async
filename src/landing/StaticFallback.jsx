// Reduced motion or no WebGL: one composed still frame (the arch with its keystone lifted, the graph beside it)
// and every card stacked below. No three.js is loaded on this path.
import '@fontsource/playfair-display/600.css';
import '@fontsource/playfair-display/700.css';
import './landing.css';
import { voussoirs, pillarStones } from './archShapes';
import { NODES, EDGES, NODE_INDEX, BREACH } from './demoGraph';
import { NODE_POS, GRAPH_CENTER } from './layout';
import { KS } from './palette';

const ARCH_S = 62, ARCH_X = 330, ARCH_Y = 420;
const GRAPH_S = 92, GRAPH_X = 830, GRAPH_Y = 330;
const ax = (x) => ARCH_X + x * ARCH_S;
const ay = (y) => ARCH_Y - y * ARCH_S;
const poly = (pts, dx = 0, dy = 0) => pts.map(([x, y]) => `${(ax(x) + dx).toFixed(1)},${(ay(y) + dy).toFixed(1)}`).join(' ');
const gx = (i) => GRAPH_X + (NODE_POS[i * 3] - GRAPH_CENTER[0]) * GRAPH_S;
const gy = (i) => GRAPH_Y - (NODE_POS[i * 3 + 1] - GRAPH_CENTER[1]) * GRAPH_S;

// "Today" in the story: everything superseded or expired by 2026-09-30 is drawn in Old Silver.
const TODAY = '2026-09-30';
const expired = (n) => n.until && n.until <= TODAY;

export default function StaticFallback({ onLaunchConsole }) {
  const blocks = voussoirs();
  const explore = (e) => {
    const section = e.currentTarget.closest('.ks-intro');
    window.scrollTo({ top: section.offsetTop + section.offsetHeight, behavior: 'auto' });
  };
  return (
    <section className="ks-intro ks-static" aria-label="Keystone introduction">
      <h1 className="ks-static-title">KEYSTONE</h1>
      <div className="ks-static-frame">
        <svg viewBox="0 0 1100 640" role="img" aria-label="A stone arch with its keystone lifted out, beside a knowledge graph of decisions, clauses and people">
          <defs>
            <radialGradient id="ks-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={KS.orange} stopOpacity="0.55" />
              <stop offset="100%" stopColor={KS.orange} stopOpacity="0" />
            </radialGradient>
            <linearGradient id="ks-stone" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={KS.stone} />
              <stop offset="100%" stopColor="#B9A68B" />
            </linearGradient>
          </defs>

          {pillarStones().map((pts, i) => (
            <polygon key={`p${i}`} points={poly(pts)} fill="url(#ks-stone)" stroke={KS.brown} strokeOpacity="0.55" strokeWidth="1.5" />
          ))}
          {blocks.map((b, i) => b.keystone ? null : (
            <polygon key={`v${i}`} points={poly(b.pts)} fill="url(#ks-stone)" stroke={KS.brown} strokeOpacity="0.55" strokeWidth="1.5" />
          ))}
          {/* The keystone, lifted out of its gap, seams glowing */}
          <ellipse cx={ax(0)} cy={ay(3.4)} rx="120" ry="90" fill="url(#ks-glow)" />
          {blocks.filter(b => b.keystone).map((b, i) => (
            <polygon key={`k${i}`} points={poly(b.pts, 0, -46)} fill="url(#ks-stone)" stroke={KS.orange} strokeWidth="2.5" />
          ))}

          {EDGES.map((e, k) => {
            const a = NODE_INDEX.get(e.source), b = NODE_INDEX.get(e.target);
            const flag = e.type === 'FLAGS';
            return <line key={k} x1={gx(a)} y1={gy(a)} x2={gx(b)} y2={gy(b)} stroke={flag ? KS.red : KS.umber} strokeWidth={flag ? 2 : 1.4} strokeOpacity={flag ? 0.9 : 0.95} />;
          })}
          {NODES.map((n, i) => {
            const x = gx(i), y = gy(i);
            const old = expired(n);
            const breach = n.id === BREACH.decision;
            const op = old ? 0.4 : 1;
            if (n.kind === 'person') {
              const c = old ? KS.subtle : KS.text;
              return (
                <g key={n.id} opacity={op}>
                  <circle cx={x} cy={y} r="16" fill={KS.orange} opacity="0.18" />
                  <circle cx={x} cy={y - 6} r="4.5" fill={c} />
                  <path d={`M${x - 8} ${y + 7} a8 7 0 0 1 16 0 z`} fill={c} />
                </g>
              );
            }
            if (n.kind === 'clause') {
              return <rect key={n.id} x={x - 7} y={y - 7} width="14" height="14" rx="3.5" fill={old ? KS.subtle : KS.stone} opacity={op} />;
            }
            return (
              <g key={n.id} opacity={op}>
                {breach && <circle cx={x} cy={y} r="15" fill="none" stroke={KS.red} strokeWidth="2" />}
                <circle cx={x} cy={y} r="7.5" fill={old ? KS.subtle : breach ? KS.red : KS.brown} stroke={old ? 'none' : KS.orange} strokeWidth="1.5" />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="ks-static-cards">
        <div className="ks-card">
          <div className="ks-eyebrow">The question</div>
          <h2>A decision was correct when we made it. The rules changed. What happens now?</h2>
        </div>
        <div className="ks-card">
          <div className="ks-eyebrow">Knowledge graph</div>
          <h2>Every decision linked to the exact rule in force.</h2>
        </div>
        <div className="ks-card">
          <div className="ks-eyebrow">Ownership</div>
          <h2>Every decision has an owner, even after they leave.</h2>
        </div>
        <div className="ks-card">
          <div className="ks-eyebrow">Point-in-time compliance</div>
          <div className="ks-static-year">Sep 2026</div>
          <h2 style={{ marginTop: 10 }}>Policy changes, flagged the same day.</h2>
          <p><span className="ks-mono">RET-2.1@v3</span> (90 days) flags <span className="ks-mono">DEC-007</span> (180 days): policy impact, ongoing breach.</p>
        </div>
        <div className="ks-card ks-card--final">
          <div className="ks-eyebrow">Human in the loop · sovereign by design</div>
          <h2>Every action approved by a human. Everything on your own hardware.</h2>
          <div className="ks-actions">
            <button type="button" className="ks-btn ks-btn--primary" onClick={() => onLaunchConsole('p-priya', 'Priya Menon (Ops Lead)')}>Launch console →</button>
            <button type="button" className="ks-btn ks-btn--ghost" onClick={explore}>Explore ↓</button>
          </div>
        </div>
      </div>
    </section>
  );
}
