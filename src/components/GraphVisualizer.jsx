import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronRight, ChevronLeft, ListTree, Loader2, Maximize2, Network, ZoomIn, ZoomOut } from 'lucide-react';
import { fetchDecisionCompliance, fetchDecisions, fetchFlags, fetchGraphView, fetchPolicies } from '../api';
import { useApp } from '../context';
import IdChip from './IdChip';
import { ThenNow } from './Compliance';
import { RELATIONS, TYPES, impactLabel, nodeTitle, typeMeta } from '../utils/entities';
import { layout } from '../utils/graphLayout';
import { day, inr, month, polish, todayIST } from '../utils/format';
import { displayName } from '../utils/people';

// The temporal graph, from GET /graph/view (server-side visibility filter). Positions come from a deterministic
// layout over every node known today (x = date, one lane per type), so nodes stay put while the as-of date moves;
// the as-of view then only changes each node's state: not yet valid (faded), superseded (grey), in force, flagged.
const LANE_LABEL = { policy_version: 'Policy versions', clause: 'Clauses', flag: 'Impact flags', decision: 'Decisions',
  meeting_note: 'Meeting notes', project: 'Projects', person: 'People' };
const R = 13;

const clip = (t) => (t.length > 34 ? `${t.slice(0, 33)}…` : t);

// Places node labels without overlaps: highest-priority labels first, each tries below / above / right / left of
// its node and is dropped (the title still shows on hover) when every spot collides with a label already placed.
function placeLabels(items, nodePts = []) {
  // Node circles are obstacles too, so a label never sits on top of another node.
  const placed = nodePts.map(p => ({ x0: p.x - R, x1: p.x + R, y0: p.y - R, y1: p.y + R, node: p.id }));
  let self = null;
  const hit = (b) => placed.some(o => o.node !== self && b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
  const out = {};
  for (const it of items) {
    self = it.id;
    const w = it.text.length * it.size * 0.56 + 6, h = it.size + 3;
    const edgeAnchor = it.x > it.width - 130 ? 'end' : it.x < 130 ? 'start' : 'middle';
    const box = (dx, dy, anchor) => {
      const x0 = anchor === 'start' ? it.x + dx : anchor === 'end' ? it.x + dx - w : it.x + dx - w / 2;
      return { x0, x1: x0 + w, y0: it.y + dy - h + 3, y1: it.y + dy + 3, dx, dy, anchor };
    };
    const edgeDx = edgeAnchor === 'start' ? -R : edgeAnchor === 'end' ? R : 0;
    const tries = [box(edgeDx, R + 13, edgeAnchor), box(edgeDx, -R - 6, edgeAnchor), box(R + 4, 4, 'start'), box(-R - 4, 4, 'end')];
    const ok = tries.find(b => !hit(b)) || (it.force ? tries[0] : null);
    if (ok) { placed.push(ok); out[it.id] = ok; }
  }
  return out;
}

function clauseSummary(fields = {}, checkable = true) {
  if (fields.retention_days_max != null) return `${fields.retention_days_max}-day retention ceiling`;
  if (fields.approver_threshold_inr?.CTO != null) return `${inr(fields.approver_threshold_inr.CTO)} CTO ceiling`;
  return checkable ? '' : 'not machine-checkable';
}

export default function GraphVisualizer({ asOfDate, selectedNodeId, onSelectNode, highlightNodeIds = [], refreshKey = 0,
  focus: answerFocus = null, onClearFocus, defaultInspector = true, inspectKey = 0 }) {
  const { isReader, team, openEntity } = useApp();
  const [base, setBase] = useState(null);      // every node known today: drives the layout
  const [atDate, setAtDate] = useState(null);  // the same view as of asOfDate: drives node state
  const [decisions, setDecisions] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [flags, setFlags] = useState([]);
  const [error, setError] = useState(null);
  const [hoverNode, setHoverNode] = useState(null);
  const [hoverEdge, setHoverEdge] = useState(null);
  const [inspectorOpen, setInspectorOpen] = useState(defaultInspector);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const [legendOpen, setLegendOpen] = useState(false);
  const [size, setSize] = useState({ w: 900, h: 480 });
  const svgRef = useRef(null);
  const canvasRef = useRef(null);
  const drag = useRef(null);

  // Lay out for the canvas's real size, so the graph fills the width instead of shrinking to fit a fixed box.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const today = todayIST();
    Promise.all([fetchGraphView(today, isReader), fetchDecisions(), fetchPolicies(), fetchFlags()])
      .then(([g, d, p, f]) => { setBase(g); setDecisions(d); setPolicies(p); setFlags(f); setError(null); })
      .catch(e => setError(e.message));
  }, [isReader, refreshKey]);

  useEffect(() => {
    let live = true;
    fetchGraphView(asOfDate, isReader).then(g => live && setAtDate(g)).catch(e => live && setError(e.message));
    return () => { live = false; };
  }, [asOfDate, isReader, refreshKey]);

  // An explicit request to inspect (citation, ID chip, node click) opens the inspector; an answer merely
  // highlighting nodes does not, so the Workspace keeps its width.
  // The same graph serves the Workspace (inspector closed by default) and the Graph tab (open): follow the view.
  useEffect(() => { setInspectorOpen(defaultInspector); }, [defaultInspector]);
  const mountedKey = useRef(inspectKey);
  useEffect(() => { if (inspectKey !== mountedKey.current) setInspectorOpen(true); }, [inspectKey]);

  // Answer-first: after an answer only the records it used are drawn, laid out on their own. "Show full graph" clears it.
  const focusIds = useMemo(() => (answerFocus ? new Set(answerFocus.ids) : null), [answerFocus]);
  const nodes = useMemo(() => (base?.nodes || []).filter(n => !focusIds || focusIds.has(n.id)), [base, focusIds]);
  useEffect(() => { setView({ k: 1, x: 0, y: 0 }); }, [focusIds]);

  const today = todayIST();
  const L = useMemo(() => {
    if (!base) return null;
    const pts = nodes.map(n => ({ id: n.id, type: n.type, date: n.date || n.validFrom }));
    const width = Math.max(560, size.w);
    // The answer view spans only its own dates, so a handful of records uses the whole width.
    const opts = focusIds ? { minGap: 130, maxNudge: 90, rowGap: 46, laneGap: 12, today: undefined } : { today };
    const first = layout(pts, { width, padX: 90, ...opts });
    // The answer view has few rows: spread them over the canvas height (up to 90 px apart).
    if (focusIds && first.height + 60 < size.h) {
      return layout(pts, { width, padX: 90, ...opts, rowGap: Math.min(90, Math.floor(46 * (size.h - 40) / (first.height + 20))) });
    }
    // Too tall for the canvas: tighten rows (never below 30 px, which still clears two node radii).
    if (first.height + 30 <= size.h) return first;
    const rowGap = Math.max(30, Math.floor(36 * size.h / (first.height + 30)));
    return layout(pts, { width, padX: 90, ...opts, rowGap, laneGap: 8, top: 22 });
  }, [base, nodes, focusIds, today, size.w, size.h]);

  const stateById = useMemo(() => Object.fromEntries((atDate?.nodes || []).map(n => [n.id, n])), [atDate]);
  const baseById = useMemo(() => Object.fromEntries((base?.nodes || []).map(n => [n.id, n])), [base]);
  const edges = (atDate?.edges || []).filter(e => !focusIds || (focusIds.has(e.source) && focusIds.has(e.target)));
  const allEdges = base?.edges || [];

  // Focus: the selected (or hovered) node and its one-hop neighbours get labels; everything else is dimmed.
  // In the answer view every drawn record matters, so only hovering dims the rest.
  const focus = hoverNode || (!focusIds && selectedNodeId && baseById[selectedNodeId] ? selectedNodeId : null);
  const neighbours = useMemo(() => {
    if (!focus) return null;
    const s = new Set([focus]);
    for (const e of edges) {
      if (e.source === focus) s.add(e.target);
      if (e.target === focus) s.add(e.source);
    }
    return s;
  }, [focus, edges]);
  const highlighted = new Set(highlightNodeIds);

  // Wheel zooms toward the cursor (native listener: React's onWheel is passive).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const pt = el.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const p = pt.matrixTransform(el.getScreenCTM().inverse());
      setView(v => {
        const k = Math.min(4, Math.max(0.5, v.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        return { k, x: p.x - (p.x - v.x) * (k / v.k), y: p.y - (p.y - v.y) * (k / v.k) };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [L]);

  const svgPoint = (e) => {
    const pt = svgRef.current.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svgRef.current.getScreenCTM().inverse());
  };
  const onPointerDown = (e) => { if (e.target.dataset.bg) { drag.current = { p: svgPoint(e), v: view }; e.currentTarget.setPointerCapture(e.pointerId); } };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const p = svgPoint(e);
    setView(v => ({ ...v, x: drag.current.v.x + (p.x - drag.current.p.x), y: drag.current.v.y + (p.y - drag.current.p.y) }));
  };
  const onPointerUp = () => { drag.current = null; };
  const zoomBy = (f) => setView(v => {
    const cx = (L?.width || 0) / 2, cy = (L?.height || 0) / 2;
    const k = Math.min(4, Math.max(0.5, v.k * f));
    return { k, x: cx - (cx - v.x) * (k / v.k), y: cy - (cy - v.y) * (k / v.k) };
  });

  const nodeState = (id) => {
    const s = stateById[id];
    if (!s) return 'absent';                                   // not yet valid on the as-of date
    if (s.validFrom && s.validFrom > asOfDate) return 'future'; // policy lifecycle shown ahead of time
    if (!s.isActive) return 'superseded';
    return s.isStale ? 'flagged' : 'active';
  };

  const selected = selectedNodeId && baseById[selectedNodeId];
  // The answer view's axis covers only its records' dates: the as-of line shows only when it falls inside.
  const asOfX = L && asOfDate >= L.start && (!focusIds || asOfDate <= L.end) ? L.x(asOfDate > L.end ? L.end : asOfDate) : null;

  // Label text and placement for every drawn node (collision-avoiding; selected and highlighted placed first).
  const labelOf = (n) => {
    const st = nodeState(n.id);
    const inFocus = neighbours ? neighbours.has(n.id) : true;
    if (st === 'absent' || (neighbours && !inFocus)) return null;
    const full = focusIds || (neighbours && inFocus);
    return clip(full ? polish(nodeTitle(stateById[n.id] || n)) || n.id : (n.type === 'person' ? nodeTitle(n) : n.id));
  };
  const labels = !L ? {} : placeLabels(nodes
    .filter(n => L.pos[n.id] && labelOf(n))
    .map(n => {
      const rank = n.id === selectedNodeId ? 0 : highlighted.has(n.id) || n.id === focus ? 1 : neighbours?.has(n.id) ? 2 : 3;
      return { id: n.id, text: labelOf(n), x: L.pos[n.id].x, y: L.pos[n.id].y, width: L.width, rank,
               size: focusIds || (neighbours && neighbours.has(n.id)) ? 12 : 10.5, force: rank <= 1 };
    })
    .sort((a, b) => a.rank - b.rank || a.x - b.x),
    nodes.filter(n => L.pos[n.id] && nodeState(n.id) !== 'absent').map(n => ({ id: n.id, ...L.pos[n.id] })));

  return (
    <div className="w-full h-full flex paper-sheet overflow-hidden select-none">
      <div className="relative flex-1 min-w-0 flex flex-col bg-[#F8FAFC]">
        {/* Toolbar: legend by type and by line style, zoom controls */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-100 bg-white">
          <button className="btn-secondary" onClick={() => setLegendOpen(o => !o)} aria-expanded={legendOpen}>
            <ListTree size={13} /> Legend
          </button>
          <span className="text-[12px] text-[#475569] truncate min-w-0">
            Faded: not yet valid · grey: superseded · red !: flagged{answerFocus ? '' : ' · hover a node for its neighbours, click to inspect'}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <button className="icon-btn" onClick={() => zoomBy(1.25)} aria-label="Zoom in" title="Zoom in"><ZoomIn size={14} /></button>
            <button className="icon-btn" onClick={() => zoomBy(0.8)} aria-label="Zoom out" title="Zoom out"><ZoomOut size={14} /></button>
            <button className="icon-btn" onClick={() => setView({ k: 1, x: 0, y: 0 })} aria-label="Fit graph to view" title="Fit to view"><Maximize2 size={13} /></button>
            <button className="icon-btn" onClick={() => setInspectorOpen(o => !o)} aria-label={inspectorOpen ? 'Hide inspector' : 'Show inspector'}
                    title={inspectorOpen ? 'Hide inspector' : 'Show inspector'}>
              {inspectorOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>
          </div>
        </div>

        {answerFocus && (
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-sky-100 bg-sky-50 text-[12.5px] text-[#0F172A]">
            <span className="min-w-0 truncate" title={answerFocus.question}>
              The {nodes.length} records used to answer “{answerFocus.question}”
            </span>
            <button className="btn-secondary shrink-0 ml-auto" onClick={onClearFocus}><Network size={13} /> Show full graph</button>
          </div>
        )}
        <div ref={canvasRef} className="relative flex-1 min-h-0">
          {legendOpen && (
            <div className="absolute top-2 left-2 z-10 max-w-md rounded-lg border border-slate-200 bg-white/95 shadow-sm p-2.5">
              <Legend />
            </div>
          )}
          {error && <Overlay>Graph unavailable: {error}</Overlay>}
          {!error && !L && <Overlay><Loader2 size={14} className="animate-spin inline mr-1" /> Loading graph…</Overlay>}
          {L && nodes.length === 0 && <Overlay>The graph is empty. Restore the demo snapshot or ingest documents.</Overlay>}
          {L && (
            <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing touch-none" viewBox={`0 0 ${L.width} ${L.height + 26}`}
                 preserveAspectRatio="xMidYMid meet" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
                 role="img" aria-label={`Decision graph as of ${asOfDate}`}>
              <rect data-bg="1" x="-5000" y="-5000" width="10000" height="10000" fill="transparent" />
              <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
                {/* Lanes */}
                {L.lanes.map((ln, i) => (
                  <g key={ln.type} pointerEvents="none">
                    <rect x="0" y={ln.y0} width={L.width} height={ln.y1 - ln.y0} fill={i % 2 ? '#F8FAFC' : '#F1F5F9'} opacity="0.7" />
                    <text x="6" y={ln.y0 + 13} fontSize="11" fill="#475569" fontFamily="var(--font-body)">{LANE_LABEL[ln.type] || ln.type}</text>
                  </g>
                ))}
                {/* Time axis */}
                {L.ticks.map(t => (
                  <g key={t.date} pointerEvents="none">
                    <line x1={t.x} x2={t.x} y1={L.lanes[0]?.y0 || 0} y2={L.height} stroke="#E2E8F0" strokeDasharray="2 4" />
                    <text x={t.x} y={L.height + 18} fontSize="11" fill="#475569" textAnchor="middle" fontFamily="var(--font-mono)">{month(t.date)}</text>
                  </g>
                ))}
                {asOfX != null && (
                  <g style={{ transform: `translateX(${asOfX}px)`, transition: 'transform 500ms ease' }} pointerEvents="none">
                    <line x1="0" x2="0" y1={L.lanes[0]?.y0 || 0} y2={L.height} stroke="#0284C7" strokeWidth="1.5" />
                    {/* keep the date tag inside the canvas at either end */}
                    <g transform={`translate(${Math.min(Math.max(0, 62 - asOfX), L.width - 62 - asOfX)} 0)`}>
                      <rect x="-60" y={L.height + 4} width="120" height="18" rx="4" fill="#0284C7" />
                      <text x="0" y={L.height + 17} fontSize="11" fill="#fff" textAnchor="middle" fontFamily="var(--font-body)">as of {day(asOfDate)}</text>
                    </g>
                  </g>
                )}

                {/* Edges (as of the date), styled by relation; label on hover only */}
                {edges.map(e => {
                  const a = L.pos[e.source], b = L.pos[e.target];
                  if (!a || !b) return null;
                  const rel = RELATIONS[e.relation] || { dash: '', width: 1 };
                  const inFocus = neighbours ? neighbours.has(e.source) && neighbours.has(e.target) && (e.source === focus || e.target === focus) : false;
                  const dim = neighbours && !inFocus;
                  const color = rel.danger ? '#E11D48' : inFocus ? '#0369A1' : '#64748B';
                  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - Math.abs(a.x - b.x) * 0.08;
                  const d = `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
                  return (
                    <g key={e.id} onPointerEnter={() => setHoverEdge(e.id)} onPointerLeave={() => setHoverEdge(null)}>
                      <path d={d} fill="none" stroke="transparent" strokeWidth="10" />
                      <path d={d} fill="none" stroke={color} strokeWidth={rel.width * (inFocus ? 1.6 : 1)} strokeDasharray={rel.dash}
                            opacity={!e.isActive && !rel.danger ? 0.25 : dim ? 0.12 : inFocus ? 0.95 : 0.45}
                            style={{ transition: 'opacity 400ms' }} />
                      {(hoverEdge === e.id) && (
                        <text x={mx} y={my - 4} fontSize="11" textAnchor="middle" fill="#0F172A" fontFamily="var(--font-body)"
                              paintOrder="stroke" stroke="#fff" strokeWidth="3">
                          {RELATIONS[e.relation]?.label || e.relation}{e.isActive ? '' : ' (not in force)'}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Nodes */}
                {nodes.map(n => {
                  const p = L.pos[n.id];
                  if (!p) return null;
                  const st = nodeState(n.id);
                  const m = typeMeta(n.type);
                  const isSel = n.id === selectedNodeId;
                  const lit = highlighted.has(n.id);
                  const inFocus = neighbours ? neighbours.has(n.id) : true;
                  const opacity = st === 'absent' ? 0.1 : st === 'future' ? 0.35 : neighbours && !inFocus ? 0.3 : 1;
                  const grey = st === 'superseded' || st === 'future';
                  const lb = labels[n.id];
                  const label = lb ? labelOf(n) : null;
                  return (
                    <g key={n.id} transform={`translate(${p.x} ${p.y})`} opacity={opacity} style={{ transition: 'opacity 450ms ease' }}
                       className={st === 'absent' ? '' : 'cursor-pointer'} pointerEvents={st === 'absent' ? 'none' : 'auto'}
                       onClick={(ev) => { ev.stopPropagation(); onSelectNode(n.id); }}
                       onPointerEnter={() => setHoverNode(n.id)} onPointerLeave={() => setHoverNode(null)}
                       role="button" tabIndex={st === 'absent' ? -1 : 0} aria-label={`${m.label} ${n.id}, ${st}`}
                       onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && onSelectNode(n.id)}>
                      {(isSel || lit) && <circle r={R + 5} fill="none" stroke={st === 'flagged' ? '#E11D48' : '#0284C7'} strokeWidth="2.5" />}
                      <circle r={R} fill={grey ? '#F1F5F9' : st === 'flagged' ? '#FFE4E6' : m.fill}
                              stroke={grey ? '#94A3B8' : st === 'flagged' ? '#E11D48' : m.stroke}
                              strokeWidth={isSel ? 2.5 : 1.6} strokeDasharray={st === 'future' ? '3 2' : ''}
                              style={{ transition: 'fill 450ms, stroke 450ms' }} />
                      <g transform="translate(-8 -8) scale(0.667)" fill="none" stroke={grey ? '#64748B' : m.stroke} strokeWidth="2.2"
                         strokeLinecap="round" strokeLinejoin="round">
                        {m.icon.map((d, i) => <path key={i} d={d} />)}
                      </g>
                      {st === 'flagged' && (
                        <g transform={`translate(${R - 4} ${-R - 2})`}>
                          <circle r="6.5" fill="#E11D48" /><text y="3.5" fontSize="10" fontWeight="700" fill="#fff" textAnchor="middle">!</text>
                        </g>
                      )}
                      {lb && (
                        <text x={lb.dx} y={lb.dy} fontSize={focusIds || (neighbours && inFocus) ? 12 : 10.5} textAnchor={lb.anchor}
                              fill={grey ? '#475569' : '#0F172A'}
                              fontFamily={label === n.id ? 'var(--font-mono)' : 'var(--font-body)'} fontWeight={isSel ? 600 : 400}
                              paintOrder="stroke" stroke="#F8FAFC" strokeWidth="3" pointerEvents="none">
                          {label}
                        </text>
                      )}
                      <title>{polish(nodeTitle(n)) || n.id}</title>
                    </g>
                  );
                })}
              </g>
            </svg>
          )}
        </div>
      </div>

      {inspectorOpen && (
        <aside className="w-72 xl:w-80 shrink-0 border-l border-slate-200 bg-white overflow-y-auto" aria-label="Inspector">
          {selected
            ? <Inspector node={selected} state={stateById[selected.id]} st={nodeState(selected.id)} asOfDate={asOfDate}
                         allEdges={allEdges} baseById={baseById} decisions={decisions} policies={policies} flags={flags}
                         team={team} openEntity={openEntity} />
            : <p className="p-4 text-[13px] text-[#64748B]">Select a node to inspect it. Answer citations and ID chips elsewhere in the app open here.</p>}
        </aside>
      )}
    </div>
  );
}

function Overlay({ children }) {
  return <div className="absolute inset-0 flex items-center justify-center text-[13px] text-[#475569] pointer-events-none">{children}</div>;
}

function Legend() {
  const types = ['decision', 'clause', 'policy_version', 'person', 'project', 'meeting_note', 'flag'];
  const lines = ['RELIED_ON', 'MADE_BY', 'SUPERSEDES', 'JUSTIFIED_BY', 'AFFECTS'];
  return (
    <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[11.5px] text-[#334155] min-w-0">
      {types.map(t => (
        <span key={t} className="inline-flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={TYPES[t].stroke} strokeWidth="2.4" aria-hidden="true">
            {TYPES[t].icon.map((d, i) => <path key={i} d={d} />)}
          </svg>
          {TYPES[t].label}
        </span>
      ))}
      <span className="text-slate-300" aria-hidden="true">|</span>
      {lines.map(r => (
        <span key={r} className="inline-flex items-center gap-1">
          <svg width="20" height="6" aria-hidden="true"><line x1="0" y1="3" x2="20" y2="3" stroke={RELATIONS[r].danger ? '#E11D48' : '#475569'}
            strokeWidth={Math.max(1.3, RELATIONS[r].width)} strokeDasharray={RELATIONS[r].dash} /></svg>
          {RELATIONS[r].label}
        </span>
      ))}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div>
      <dt className="text-[12px] text-[#64748B]">{label}</dt>
      <dd className="text-[13px] text-[#0F172A]">{children}</dd>
    </div>
  );
}

function Inspector({ node, state, st, asOfDate, allEdges, baseById, decisions, policies, flags, team, openEntity }) {
  const [compliance, setCompliance] = useState(null);
  useEffect(() => { setCompliance(null); }, [node.id]);
  const m = typeMeta(node.type);
  const out = (rel) => allEdges.filter(e => e.source === node.id && e.relation === rel).map(e => e.target);
  const inc = (rel) => allEdges.filter(e => e.target === node.id && e.relation === rel).map(e => e.source);
  const stateText = { absent: `Not yet valid on ${day(asOfDate)}`, future: `Not yet in force on ${day(asOfDate)}`,
    superseded: `Superseded / not in force on ${day(asOfDate)}`, active: `In force on ${day(asOfDate)}`,
    flagged: `Flagged by the impact scanner as of ${day(asOfDate)}` }[st];

  // Clause versions, from GET /policies.
  const clauseVersions = (clauseId) => policies.flatMap(p => p.versions
    .filter(v => v.clauses.some(c => c.clause_id === clauseId))
    .map(v => ({ ...v.clauses.find(c => c.clause_id === clauseId), version: v.version, validFrom: v.valid_from, validTo: v.valid_to })))
    .sort((a, b) => a.validFrom.localeCompare(b.validFrom));

  const prov = node.provenance || {};
  const provenance = (
    <section className="rounded-lg bg-slate-50 border border-slate-200 p-2.5 text-[12.5px] space-y-1">
      <div className="text-[12px] font-semibold text-[#334155]">Provenance</div>
      <div>Source: <span className="font-mono">{prov.sourceDoc || '—'}</span></div>
      <div>
        {prov.sourceDoc === 'system:scanner' || prov.sourceDoc === 'flags'
          ? 'Written by the impact scanner from the deterministic check'
          : <>{prov.extractedBy === 'human' ? 'Recorded in the document itself' : `Extracted by ${prov.extractedBy} · model-reported confidence ${prov.confidence}`}
            {' · '}{prov.humanVerified ? 'human verified' : 'not yet reviewed'}</>}
      </div>
      {prov.sourceSpan?.quote && <blockquote className="italic text-[#475569] border-l-2 border-slate-300 pl-2">“{polish(prov.sourceSpan.quote)}”</blockquote>}
      <div className="text-[#475569]">Valid {day(node.validFrom)} → {node.validTo ? day(node.validTo) : 'no end date'}</div>
    </section>
  );

  let body = null;
  if (node.type === 'decision') {
    const d = decisions.find(x => x.id === node.id);
    const a = d?.attributes || {};
    const relied = out('RELIED_ON');
    // Only flags whose triggering clause version is in force on the as-of date.
    const nodeFlags = flags.filter(f => f.decision_id === node.id
      && (clauseVersions(f.clause_id).find(v => v.version === f.new_version)?.validFrom || '9999') <= asOfDate);
    body = (
      <>
        <h3 className="font-heading font-semibold text-[15px] leading-snug text-[#0F172A]">{polish(d?.label || nodeTitle(node))}</h3>
        <dl className="grid grid-cols-2 gap-2">
          <Row label="Decided">{day(a.decided_on || node.date)}</Row>
          <Row label="Status">{a.status || '—'}{a.effect ? ` · ${a.effect}` : ''}</Row>
          <Row label="Project">{a.project || '—'}</Row>
          <div className="col-span-2"><Row label="Owner">{a.owner ? <IdChip id={a.owner} type="person" label={displayName(a.owner, team)} /> : '—'}</Row></div>
        </dl>
        <section>
          <h4 className="text-[12px] text-[#64748B] mb-1">Relied on</h4>
          {relied.length === 0 && <p className="text-[13px]">No clause is recorded for this decision.</p>}
          {relied.map(cref => {
            const [cid, ver] = cref.split('@');
            const vs = clauseVersions(cid);
            const i = vs.findIndex(v => v.version === ver);
            const cur = vs[i], next = vs[i + 1];
            return (
              <div key={cref} className="text-[13px] leading-relaxed">
                <IdChip id={cref} type="clause" /> {cur && `(${clauseSummary(cur.fields, cur.checkable)})`}
                {next
                  ? <>, superseded by <IdChip id={`${cid}@${next.version}`} type="clause" /> ({clauseSummary(next.fields, next.checkable)}) on {day(next.validFrom)}{next.validFrom > asOfDate ? ', after the as-of date' : ''}.</>
                  : <>, still in force.</>}
                <button className="ml-1 text-[#0369A1] underline cursor-pointer inline-flex items-center gap-0.5"
                        onClick={() => openEntity(cid, 'clause', { view: 'POLICIES' })}>
                  <BookOpen size={12} aria-hidden="true" /> Compare versions
                </button>
              </div>
            );
          })}
        </section>
        {nodeFlags.map(f => (
          <section key={f.id} className="rounded-lg badge-note-rose p-2.5 text-[12.5px]">
            <div className="font-semibold" title={f.impact_type}>Policy impact: {impactLabel(f.impact_type)}</div>
            <p className="mt-0.5 leading-relaxed">{polish(f.explanation)}</p>
          </section>
        ))}
        <section>
          <h4 className="text-[12px] text-[#64748B] mb-1">Recorded reason</h4>
          <p className="text-[13px] leading-relaxed text-[#334155]">{polish(a.reasons) || '—'}</p>
        </section>
        <section>
          <h4 className="text-[12px] text-[#64748B] mb-1">Compliance, then vs now</h4>
          {!compliance && relied.length > 0 && (
            <button className="btn-secondary" onClick={() => {
              setCompliance({ loading: true });
              fetchDecisionCompliance(node.id).then(c => setCompliance({ c })).catch(e => setCompliance({ error: e.message }));
            }}>Run the compliance check</button>
          )}
          {!compliance && relied.length === 0 && <p className="text-[13px]">Nothing to check: no clause relied on.</p>}
          {compliance?.loading && <p className="text-[13px] flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Checking; the local model words the result (a few seconds)…</p>}
          {compliance?.error && <p className="text-[13px] text-rose-700">Check failed: {compliance.error}</p>}
          {compliance?.c && <ThenNow c={compliance.c} />}
        </section>
      </>
    );
  } else if (node.type === 'clause') {
    const [cid, ver] = node.id.split('@');
    const vs = clauseVersions(cid);
    const cur = vs.find(v => v.version === ver);
    body = (
      <>
        <h3 className="font-heading font-semibold text-[15px] text-[#0F172A]">{cur?.title || node.id}</h3>
        <p className="text-[13px] leading-relaxed">{cur?.text || '—'}</p>
        <dl className="grid grid-cols-2 gap-2">
          <Row label="Rule">{cur ? clauseSummary(cur.fields, cur.checkable) || '—' : '—'}</Row>
          <Row label="Effective">{day(cur?.validFrom)} → {cur?.validTo ? day(cur.validTo) : 'no end date'}</Row>
        </dl>
        <button className="btn-secondary" onClick={() => openEntity(cid, 'clause', { view: 'POLICIES' })}><BookOpen size={13} /> Compare all versions of {cid}</button>
        <Related title="Decisions that relied on it" ids={inc('RELIED_ON')} baseById={baseById} />
      </>
    );
  } else if (node.type === 'person') {
    const p = team.find(x => x.id === node.id);
    body = (
      <>
        <h3 className="font-heading font-semibold text-[15px] text-[#0F172A]">{p?.name || nodeTitle(node)}</h3>
        <dl className="grid grid-cols-2 gap-2">
          <Row label="Role">{p?.role || '—'}</Row>
          <Row label="Tenure">{day(p?.joined)} → {p?.left ? day(p.left) : 'present'}</Row>
        </dl>
        <Related title="Decisions made" ids={inc('MADE_BY')} baseById={baseById} />
      </>
    );
  } else if (node.type === 'flag') {
    const f = flags.find(x => x.id === node.id);
    body = (
      <>
        <h3 className="font-heading font-semibold text-[15px] text-[#0F172A]" title={f?.impact_type}>{f ? impactLabel(f.impact_type) : nodeTitle(node)}</h3>
        <p className="text-[13px] leading-relaxed">{polish(f?.explanation) || '—'}</p>
        <Related title="Affects" ids={out('AFFECTS')} baseById={baseById} />
        <Related title="Caused by" ids={out('CAUSED_BY')} baseById={baseById} />
      </>
    );
  } else {
    body = (
      <>
        <h3 className="font-heading font-semibold text-[15px] text-[#0F172A]">{polish(nodeTitle(node))}</h3>
        <Related title={node.type === 'project' ? 'Decisions about it' : node.type === 'meeting_note' ? 'Decisions it justifies' : 'Linked decisions'}
                 ids={[...inc('ABOUT'), ...inc('JUSTIFIED_BY'), ...inc('BELONGS_TO')]} baseById={baseById} />
      </>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: m.text }}>{m.label}</span>
        <IdChip id={node.id} type={node.type} />
      </div>
      <p className={`text-[12.5px] px-2 py-1 rounded ${st === 'flagged' ? 'badge-note-rose' : st === 'active' ? 'badge-note-green' : 'badge-note-slate'}`}>{stateText}</p>
      {body}
      {provenance}
    </div>
  );
}

function Related({ title, ids, baseById }) {
  if (!ids.length) return null;
  return (
    <section>
      <h4 className="text-[12px] text-[#64748B] mb-1">{title}</h4>
      <div className="flex flex-wrap gap-1">
        {[...new Set(ids)].map(id => <IdChip key={id} id={id} type={baseById[id]?.type} />)}
      </div>
    </section>
  );
}
