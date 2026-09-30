// The landing's temporal knowledge graph: SVG, one requestAnimationFrame loop that writes attributes through refs
// (React renders the structure once; nothing re-renders per frame). Ambient motion (drift, breathing, a butter
// particle along Policy → Rule → Decision), cursor proximity, hover/focus lineage, the time cursor and the policy
// change are all read from a `director` (see graphDirector.js). Pauses off-screen; reduced motion draws one static
// frame and only redraws on interaction. Without JS or before the first frame, every node is drawn visible.
import { useEffect, useMemo, useRef } from 'react';
import { NODES, EDGES, POLICY_CHANGE } from './graphData';
import { layoutFor, VIEW, RADIUS, T_START, T_END } from './layout';
import { toDay } from '../landing/demoGraph';
import { clamp01, sub } from './graphDirector';

const KIND_LABEL = { decision: 'Decision', policy: 'Policy version', clause: 'Clause', evidence: 'Meeting note', person: 'Person' };
// Story step at which a node / edge type appears (0 Remember, 1 Understand, 2 Connect).
const STORY_FIRST = new Set(['DEC-002', 'DEC-004', 'DEC-007', 'DEC-009', 'POL-RET@v1', 'POL-RET@v2', 'POL-PROC@v1', 'POL-PROC@v2']);
const STORY_SECOND_KINDS = new Set(['clause', 'evidence']);
const EDGE_STAGE = { RELIED_ON: 1, SOURCE: 1, CONTAINS: 1, DISCUSSES: 1, PREVIOUS: 1 };

function prepare(compact) {
  const pos = layoutFor(compact);
  const nodes = [];
  const index = new Map();
  NODES.forEach((n) => {
    const p = pos.get(n.id);
    if (!p) return;
    const k = nodes.length;
    index.set(n.id, k);
    const from = toDay(n.date);
    // Seeded per-node motion so the drift looks organic but is stable between loads.
    const h = [...n.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    nodes.push({
      ...n, x: p.x, y: p.y, r: RADIUS[n.kind] * (compact ? 1.25 : 1), from,
      until: n.until ? toDay(n.until) : Infinity,
      endsWithChange: n.until === POLICY_CHANGE.date, // v2 and its policy expire when v3 arrives, not by the calendar
      late: n.id === POLICY_CHANGE.to || n.id === POLICY_CHANGE.toPolicy,
      recency: 0.62 + 0.38 * clamp01((from - T_START) / (T_END - T_START)),
      ph1: (h % 628) / 100, ph2: ((h >> 3) % 628) / 100, amp: 2 + ((h >> 5) % 20) / 10,
      storyAt: STORY_FIRST.has(n.id) ? 0 : STORY_SECOND_KINDS.has(n.kind) ? 1 : 2,
      nb: new Set(),
    });
  });
  const edges = [];
  for (const e of EDGES) {
    const a = index.get(e.source), b = index.get(e.target);
    if (a === undefined || b === undefined) continue;
    nodes[a].nb.add(b); nodes[b].nb.add(a);
    edges.push({ a, b, type: e.type, late: e.late, storyAt: Math.max(nodes[a].storyAt, nodes[b].storyAt, EDGE_STAGE[e.type] ?? 2) });
  }
  // Distance (in hops) from the new clause, for the pulse that travels outward through the graph.
  const src = index.get(POLICY_CHANGE.to) ?? index.get(POLICY_CHANGE.from);
  const hop = new Array(nodes.length).fill(99);
  hop[src] = 0;
  const q = [src];
  while (q.length) { const i = q.shift(); for (const j of nodes[i].nb) if (hop[j] > hop[i] + 1) { hop[j] = hop[i] + 1; q.push(j); } }
  nodes.forEach((n, i) => { n.hop = hop[i]; });
  // Particle routes: Policy → Rule → Decision, and meeting note → decision.
  const chains = [];
  for (const n of nodes) {
    if (n.kind === 'policy' && !n.late) {
      const c = index.get(n.clause);
      if (c === undefined) continue;
      for (const e of edges) if (e.type === 'RELIED_ON' && e.b === c) chains.push([index.get(n.id), c, e.a]);
    }
  }
  if (!chains.length) for (const e of edges) if (e.type === 'RELIED_ON') chains.push([e.b, e.a]);
  return { nodes, edges, index, chains, breach: index.get(POLICY_CHANGE.breach), superseded: index.get(POLICY_CHANGE.superseded) };
}

// reduced: one static frame, redrawn only on interaction. still: keeps redrawing (e.g. driven by scroll) but with no
// drift, breathing or particles.
export default function TemporalGraph({ director, compact = false, reduced = false, still = false, onFocusNode, onFrame, className = '', ariaLabel }) {
  const g = useMemo(() => prepare(compact), [compact]);
  const svgRef = useRef(null);
  const nodeRefs = useRef([]);
  const haloRefs = useRef([]);
  const ringRefs = useRef([]);
  const labelRefs = useRef([]);
  const edgeRefs = useRef([]);
  const partRefs = useRef([]);
  const alertRef = useRef(null);
  const supRef = useRef(null);
  const pulseRef = useRef(null);
  const st = useRef({ focus: -1, pinned: false, px: -1e4, py: -1e4, emph: null, parts: [], nextPart: 2, elapsed: 0, draw: null });

  useEffect(() => {
    const S = st.current;
    const N = g.nodes.length;
    S.emph = new Float32Array(N).fill(1);
    S.parts = [0, 1, 2].map(() => ({ on: false }));
    const cur = new Float32Array(N * 2); // current drifted positions
    const alpha = new Float32Array(N);
    let raf = 0, last = 0, running = false;
    const calm = reduced || still;

    const draw = (dt) => {
      const d = director;
      d.update?.(S.elapsed);
      const t = calm ? 0 : S.elapsed;
      const story = d.mode === 'story';
      const pc = d.pc;
      const expireV2 = sub(pc, 0.6, 0.8);
      const pulseR = sub(pc, 0.4, 0.78) * 6; // hops
      const focus = S.focus >= 0 ? S.focus : d.explain > 0.01 ? g.breach : -1;
      const focusAmt = S.focus >= 0 ? 1 : d.explain;
      const k = calm ? 1 : Math.min(1, dt * 7);

      for (let i = 0; i < N; i++) {
        const n = g.nodes[i];
        let a;
        if (n.late) a = sub(pc, 0.15, 0.32);
        else if (story) a = clamp01((d.storyP - n.storyAt + 0.3) * 2.5);
        else a = clamp01((d.day - n.from + 30) / 60);
        const expired = n.endsWithChange ? expireV2 : d.day >= n.until ? 1 : 0;
        const x = n.x + (calm ? 0 : Math.sin(t * 0.42 + n.ph1) * n.amp);
        const y = n.y + (calm ? 0 : Math.cos(t * 0.35 + n.ph2) * n.amp);
        cur[i * 2] = x; cur[i * 2 + 1] = y;
        const near = Math.max(0, 1 - Math.hypot(S.px - x, S.py - y) / 90);
        const target = focus < 0 ? 1 : i === focus || g.nodes[focus].nb.has(i) ? 1 : 1 - 0.75 * focusAmt;
        S.emph[i] += (target - S.emph[i]) * k;
        const breathe = calm ? 1 : 0.94 + 0.06 * Math.sin(t * 0.8 + n.ph2);
        let op = a * n.recency * (1 - 0.65 * expired) * breathe * S.emph[i];
        op = Math.min(1, op + near * 0.2 * a);
        alpha[i] = a;
        const grow = 1 + (i === focus ? 0.15 * focusAmt : 0) + near * 0.06;
        const el = nodeRefs.current[i];
        if (el) {
          el.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${(grow * (0.6 + 0.4 * a)).toFixed(3)})`);
          el.style.opacity = op.toFixed(3);
        }
        // Butter glow: newly arrived nodes, the pulse front, and the decisions the change affects.
        const fresh = story ? 0 : clamp01(1 - (d.day - n.from) / 80) * a;
        const front = pc > 0 && pc < 1 ? Math.max(0, 1 - Math.abs(n.hop - pulseR) * 1.2) * sub(pc, 0.4, 0.5) : 0;
        const affected = (i === g.breach || i === g.superseded) ? sub(pc, 0.55, 0.72) * 0.9 : 0;
        const halo = haloRefs.current[i];
        if (halo) halo.style.opacity = Math.max(fresh * 0.9, front, affected, n.late ? a * (1 - sub(pc, 0.8, 1)) * 0.8 : 0).toFixed(3);
        const ring = ringRefs.current[i];
        if (ring) ring.style.opacity = (i === focus ? focusAmt : 0).toFixed(3);
        const lb = labelRefs.current[i];
        if (lb) lb.style.opacity = (i === focus ? focusAmt : 0).toFixed(3);
      }

      // The two affected decisions: DEC-007 turns alert; DEC-002 gets a superseded ring.
      const hit = sub(pc, 0.55, 0.72);
      if (alertRef.current && g.breach !== undefined) {
        alertRef.current.setAttribute('transform', nodeRefs.current[g.breach]?.getAttribute('transform') || '');
        alertRef.current.style.opacity = (hit * alpha[g.breach]).toFixed(3);
      }
      if (supRef.current && g.superseded !== undefined) {
        supRef.current.setAttribute('transform', nodeRefs.current[g.superseded]?.getAttribute('transform') || '');
        supRef.current.style.opacity = (hit * 0.9).toFixed(3);
      }
      // Soft pulse ring around the new clause.
      const src = g.index.get(POLICY_CHANGE.to);
      if (pulseRef.current && src !== undefined) {
        const p = sub(pc, 0.36, 0.7);
        pulseRef.current.setAttribute('cx', cur[src * 2].toFixed(2));
        pulseRef.current.setAttribute('cy', cur[src * 2 + 1].toFixed(2));
        pulseRef.current.setAttribute('r', (10 + p * 240).toFixed(1));
        pulseRef.current.style.opacity = (p > 0 && p < 1 ? (1 - p) * 0.55 : 0).toFixed(3);
      }

      for (let e = 0; e < g.edges.length; e++) {
        const ed = g.edges[e];
        const el = edgeRefs.current[e];
        if (!el) continue;
        const x1 = cur[ed.a * 2], y1 = cur[ed.a * 2 + 1], x2 = cur[ed.b * 2], y2 = cur[ed.b * 2 + 1];
        el.setAttribute('x1', x1.toFixed(2)); el.setAttribute('y1', y1.toFixed(2));
        el.setAttribute('x2', x2.toFixed(2)); el.setAttribute('y2', y2.toFixed(2));
        // Links draw in from their source as both ends become visible (the v2 → v3 link with the change).
        let drawn;
        if (ed.late) drawn = sub(pc, 0.3, 0.46);
        else if (story) drawn = clamp01((d.storyP - ed.storyAt + 0.15) * 2.2);
        else drawn = Math.min(alpha[ed.a], alpha[ed.b]);
        const len = Math.hypot(x2 - x1, y2 - y1);
        el.setAttribute('stroke-dasharray', `${len.toFixed(1)} ${len.toFixed(1)}`);
        el.setAttribute('stroke-dashoffset', (len * (1 - drawn)).toFixed(1));
        const inFocus = focus >= 0 && (ed.a === focus || ed.b === focus);
        const exp = (g.nodes[ed.a].endsWithChange || g.nodes[ed.b].endsWithChange) ? expireV2 : 0;
        let op = (ed.late ? 0.9 : 0.5 * (1 - 0.5 * exp)) * Math.min(S.emph[ed.a], S.emph[ed.b]);
        if (focus >= 0 && !inFocus) op *= 1 - 0.7 * focusAmt;
        el.style.opacity = (drawn > 0 ? op : 0).toFixed(3);
        const strong = inFocus && focusAmt > 0.5;
        if (el.__strong !== strong) { el.__strong = strong; el.setAttribute('class', strong ? 'kb-edge kb-edge--on' : `kb-edge${ed.late ? ' kb-edge--late' : ''}`); }
      }

      // Particles: now and then one travels Policy → Rule → Decision, 1.5 s per edge.
      if (!calm && !compact) {
        if (S.elapsed > S.nextPart) {
          S.nextPart = S.elapsed + 3 + ((S.elapsed * 7919) % 1) * 2.5;
          const free = S.parts.find(p => !p.on);
          const options = g.chains.filter(c => c.every(i => alpha[i] > 0.85 && S.emph[i] > 0.5));
          if (free && options.length) Object.assign(free, { on: true, path: options[Math.floor((S.elapsed * 104729) % options.length)], t0: S.elapsed });
        }
        S.parts.forEach((p, j) => {
          const el = partRefs.current[j];
          if (!el) return;
          if (!p.on) { el.style.opacity = '0'; return; }
          const u = (S.elapsed - p.t0) / 1.5;
          const seg = Math.floor(u);
          if (seg >= p.path.length - 1) { p.on = false; el.style.opacity = '0'; return; }
          const f = u - seg, a = p.path[seg], b = p.path[seg + 1];
          const e = f * f * (3 - 2 * f);
          el.setAttribute('transform', `translate(${(cur[a * 2] + (cur[b * 2] - cur[a * 2]) * e).toFixed(2)} ${(cur[a * 2 + 1] + (cur[b * 2 + 1] - cur[a * 2 + 1]) * e).toFixed(2)})`);
          const total = p.path.length - 1;
          el.style.opacity = (Math.min(1, u * 3, (total - u) * 3) * 0.95).toFixed(3);
        });
      }
      onFrame?.(d, S.elapsed);
    };
    S.draw = () => draw(1);

    const loop = (now) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      S.elapsed += dt;
      draw(dt);
      raf = requestAnimationFrame(loop);
    };
    const start = () => { if (running || reduced) return; running = true; last = 0; raf = requestAnimationFrame(loop); };
    const stop = () => { running = false; cancelAnimationFrame(raf); };

    draw(1);
    if (reduced) return () => { S.draw = null; };
    const io = new IntersectionObserver(([en]) => (en.isIntersecting ? start() : stop()), { rootMargin: '80px' });
    io.observe(svgRef.current);
    return () => { io.disconnect(); stop(); S.draw = null; };
  }, [g, director, reduced, still, compact, onFrame]);

  // Pointer: proximity brightening, and hover / focus / tap lineage.
  const toView = (e) => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!m) return null;
    const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    return p.matrixTransform(m.inverse());
  };
  const setFocus = (i, pin) => {
    const S = st.current;
    if (i < 0 && S.pinned && !pin) return;
    S.focus = i;
    S.pinned = !!pin && i >= 0;
    if (i >= 0) {
      const el = nodeRefs.current[i];
      const r = el?.getBoundingClientRect();
      onFocusNode?.(g.nodes[i], r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null);
    } else onFocusNode?.(null, null);
    if (reduced) S.draw?.();
  };
  const nodeHandlers = (i) => ({
    onPointerEnter: (e) => { if (e.pointerType === 'mouse') setFocus(i); },
    onPointerLeave: (e) => { if (e.pointerType === 'mouse') setFocus(-1); },
    onClick: () => { const S = st.current; setFocus(S.focus === i && S.pinned ? -1 : i, true); },
    onFocus: () => setFocus(i),
    onBlur: () => { st.current.pinned = false; setFocus(-1); },
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFocus(i, true); }
      if (e.key === 'Escape') { st.current.pinned = false; setFocus(-1); }
    },
  });

  return (
    <svg ref={svgRef} viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} className={`kb-graph ${className}`} role="group"
         aria-label={ariaLabel || 'Temporal knowledge graph of the Nimbus Ledger decisions, policies, meeting notes and people'}
         onPointerMove={(e) => { const p = toView(e); if (p) { st.current.px = p.x; st.current.py = p.y; } }}
         onPointerLeave={() => { st.current.px = -1e4; st.current.py = -1e4; }}>
      <circle ref={pulseRef} className="kb-pulse" r="10" cx="0" cy="0" style={{ opacity: 0 }} />
      <g>
        {g.edges.map((e, k) => (
          <line key={k} ref={(el) => { edgeRefs.current[k] = el; }} className={`kb-edge${e.late ? ' kb-edge--late' : ''}`}
                x1={g.nodes[e.a].x} y1={g.nodes[e.a].y} x2={g.nodes[e.b].x} y2={g.nodes[e.b].y}
                style={e.late ? { opacity: 0 } : undefined} />
        ))}
      </g>
      <g>
        {g.nodes.map((n, i) => (
          <g key={n.id} ref={(el) => { nodeRefs.current[i] = el; }} transform={`translate(${n.x} ${n.y})`}
             className={`kb-node kb-node--${n.kind}`} style={n.late ? { opacity: 0 } : undefined}
             role="button" tabIndex={0} aria-label={`${KIND_LABEL[n.kind]} ${n.id}: ${n.title}`} {...nodeHandlers(i)}>
            <circle ref={(el) => { haloRefs.current[i] = el; }} className="kb-node__halo" r={n.r + 9} style={{ opacity: 0 }} />
            <circle ref={(el) => { ringRefs.current[i] = el; }} className="kb-node__ring" r={n.r + 4.5} style={{ opacity: 0 }} />
            <circle className="kb-node__dot" r={n.r} />
            <circle className="kb-node__hit" r={Math.max(n.r + 8, 14)} />
            <text ref={(el) => { labelRefs.current[i] = el; }} className="kb-node__label" y={-(n.r + 9)} textAnchor="middle" style={{ opacity: 0 }}>
              {n.id.replace('@', ' ')}
            </text>
          </g>
        ))}
      </g>
      {g.breach !== undefined && <g ref={alertRef} className="kb-affected" style={{ opacity: 0 }} aria-hidden="true">
        <circle className="kb-affected__dot" r={g.nodes[g.breach].r} />
        <circle className="kb-affected__ring" r={g.nodes[g.breach].r + 5} />
      </g>}
      {g.superseded !== undefined && <g ref={supRef} className="kb-superseded" style={{ opacity: 0 }} aria-hidden="true">
        <circle r={g.nodes[g.superseded].r + 5} />
      </g>}
      {!compact && [0, 1, 2].map((j) => (
        <g key={j} ref={(el) => { partRefs.current[j] = el; }} className="kb-particle" style={{ opacity: 0 }} aria-hidden="true">
          <circle className="kb-particle__glow" r="7" />
          <circle className="kb-particle__dot" r="3" />
        </g>
      ))}
    </svg>
  );
}
