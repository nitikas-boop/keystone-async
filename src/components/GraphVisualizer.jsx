import React, { useState, useRef, useEffect } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Clock, 
  AlertTriangle, 
  ShieldCheck, 
  FileText, 
  Info,
  Layers,
  ChevronRight
} from 'lucide-react';

const NODE_COORDINATES = {
  "DEC-001": { x: 100, y: 150 },
  "DEC-002": { x: 260, y: 150 },
  "DEC-003": { x: 120, y: 280 },
  "DEC-004": { x: 380, y: 280 },
  "DEC-005": { x: 200, y: 400 },
  "DEC-006": { x: 500, y: 220 },
  "DEC-007": { x: 620, y: 150 },
  "DEC-008": { x: 520, y: 400 },
  "DEC-009": { x: 680, y: 300 },
  "DEC-010": { x: 740, y: 400 },

  "RET-2.1@v1": { x: 260, y: 60 },
  "RET-2.1-v1": { x: 260, y: 60 },
  "RET-2.1@v2": { x: 620, y: 60 },
  "RET-2.1-v2": { x: 620, y: 60 },
  "RET-2.1@v3": { x: 800, y: 60 },
  "RET-2.1-v3": { x: 800, y: 60 },
  "PROC-3.1@v1": { x: 380, y: 450 },
  "PROC-3.1-v1": { x: 380, y: 450 },
  "PROC-3.1@v2": { x: 680, y: 450 },
  "PROC-3.1-v2": { x: 680, y: 450 },

  "p-ananya": { x: 420, y: 150 },
  "p-vikram": { x: 280, y: 240 },
  "p-karthik": { x: 680, y: 220 },
  "p-priya": { x: 520, y: 320 },
  "p-farhan": { x: 380, y: 370 },
  "p-divya": { x: 180, y: 340 }
};

export default function GraphVisualizer({ 
  asOfDate, 
  selectedNodeId, 
  onSelectNode, 
  highlightNodeIds = [],
  onOpenCitation,
  liveGraphData = null
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const svgRef = useRef(null);
  const canvasRef = useRef(null);
  const viewRef = useRef({ zoom, pan });
  useEffect(() => { viewRef.current = { zoom, pan }; }, [zoom, pan]);

  // Wheel zooms toward the cursor. Native listener: React's onWheel is passive and cannot stop the page scrolling.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const { zoom: z, pan: p } = viewRef.current;
      const next = Math.min(3, Math.max(0.4, z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      const r = el.getBoundingClientRect();
      // transform-origin is the canvas centre: keep the point under the cursor fixed while scaling.
      const mx = e.clientX - r.left - r.width / 2;
      const my = e.clientY - r.top - r.height / 2;
      const k = next / z;
      setZoom(next);
      setPan({ x: mx - k * (mx - p.x), y: my - k * (my - p.y) });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Live graph only. An empty or unreachable backend shows an empty graph, never the mock one.
  const baseNodes = (liveGraphData?.nodes || []).map((n, idx) => {
        const id = n.id;
        const type = (n.type || 'decision').toLowerCase();
        const coords = NODE_COORDINATES[id] || {
          x: 140 + (idx % 5) * 140,
          y: 120 + Math.floor(idx / 5) * 120
        };
        return {
          id,
          label: n.label || id,
          type,
          date: n.valid_from || n.attributes?.decided_on,
          validFrom: n.valid_from,
          validTo: n.valid_to,
          attributes: n.attributes || {},
          provenance: n.provenance || {},
          x: coords.x,
          y: coords.y
        };
      });

  const baseEdges = (liveGraphData?.edges || []).map(e => ({
        source: e.source,
        target: e.target,
        relation: e.relation || 'RELATES_TO',
        validFrom: e.valid_from,
        validTo: e.valid_to,
        isConflict: e.relation === 'AFFECTS',
        provenance: e.provenance
      }));

  // Staleness comes from the scanner: a decision is stale when a Flag AFFECTS it as of the chosen date.
  const nodeById = Object.fromEntries(baseNodes.map(n => [n.id, n]));
  const flagsFor = (decisionId) => baseEdges
    .filter(e => e.relation === 'AFFECTS' && e.target === decisionId && (!e.validFrom || e.validFrom.slice(0, 10) <= asOfDate))
    .map(e => {
      const cause = baseEdges.find(c => c.source === e.source && c.relation === 'CAUSED_BY');
      return { id: e.source, impactType: nodeById[e.source]?.attributes?.impact_type, clause: cause?.target };
    });
  const targetsOf = (id, relation) => baseEdges.filter(e => e.source === id && e.relation === relation).map(e => e.target);

  // Compute node active states based on asOfDate
  const processedNodes = baseNodes.map(node => {
    let isActiveAtDate = true;
    let isStaleAtDate = false;

    if (node.type === 'clause') {
      if (node.validFrom && asOfDate < node.validFrom) {
        isActiveAtDate = false;
      }
      if (node.validTo && asOfDate > node.validTo) {
        isActiveAtDate = false;
      }
    } else if (node.type === 'decision') {
      if (node.date && asOfDate < node.date) {
        isActiveAtDate = false;
      }
      if (flagsFor(node.id).length > 0) {
        isStaleAtDate = true;
      }
    }

    // Modern calm pastel colors
    let fillColor = '#EEF2FF';
    let strokeColor = '#6366F1';
    let textColor = '#3730A3';

    if (node.type === 'clause') {
      fillColor = '#FEF3C7';
      strokeColor = '#D97706';
      textColor = '#92400E';
    } else if (node.type === 'person') {
      fillColor = '#E0F2FE';
      strokeColor = '#0284C7';
      textColor = '#0369A1';
    }

    return {
      ...node,
      fillColor,
      strokeColor,
      textColor,
      isActiveAtDate,
      isStaleAtDate
    };
  });

  // Compute edges state based on asOfDate
  const processedEdges = baseEdges.map(edge => {
    let status = 'active';
    if (edge.validFrom && asOfDate < edge.validFrom) {
      status = 'future';
    } else if (edge.validTo && asOfDate > edge.validTo) {
      status = 'expired';
    } else if (edge.isConflict && asOfDate >= edge.validFrom) {
      status = 'conflict';
    }

    return {
      ...edge,
      status
    };
  });

  // Fit the viewBox to the nodes (plus room for labels): nodes without fixed coordinates are laid out on a grid
  // that can extend past the old fixed 850x560 box, which cut the graph off.
  const viewBox = (() => {
    if (!processedNodes.length) return '0 0 850 560';
    const xs = processedNodes.map(n => n.x), ys = processedNodes.map(n => n.y);
    const minX = Math.min(...xs) - 90, maxX = Math.max(...xs) + 90;
    const minY = Math.min(...ys) - 50, maxY = Math.max(...ys) + 70;
    return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
  })();

  // A node absent from the graph as of this date has nothing to inspect: the inspector stays closed.
  const activeNodeData = processedNodes.find(n => n.id === selectedNodeId) || null;

  // Inspector shows exactly what the graph holds; missing fields stay visibly missing ("—").
  const attrs = activeNodeData?.attributes || {};
  const activeDecision = activeNodeData?.type === 'decision'
    ? {
        id: activeNodeData.id,
        title: activeNodeData.label,
        decidedOn: attrs.decided_on || activeNodeData.validFrom || '—',
        owner: attrs.owner || '—',
        project: attrs.project || '—',
        rationale: attrs.reasons || '—',
        reliedOnClause: targetsOf(activeNodeData.id, 'RELIED_ON')[0] || null,
        flags: flagsFor(activeNodeData.id)
      }
    : null;

  const activeClause = activeNodeData?.type === 'clause'
    ? (() => {
        let fields = {};
        try { fields = JSON.parse(attrs.fields_json || '{}'); } catch { fields = {}; }
        const policyVersion = targetsOf(activeNodeData.id, 'BELONGS_TO')[0];
        return {
          policy: { title: nodeById[policyVersion]?.label || policyVersion || attrs.policy_id || '—' },
          version: {
            clauseName: activeNodeData.label,
            clauseId: activeNodeData.id,
            effectiveFrom: activeNodeData.validFrom || '—',
            effectiveTo: activeNodeData.validTo,
            limitDays: fields.retention_days_max,
            limitInr: fields.approver_threshold_inr?.CTO,
            description: attrs.text || '—'
          }
        };
      })()
    : null;

  const activePerson = activeNodeData?.type === 'person'
    ? {
        id: activeNodeData.id,
        name: activeNodeData.label,
        role: attrs.role || '—',
        joined: attrs.joined || '—',
        left: attrs.left
      }
    : null;

  const handleMouseDown = (e) => {
    if (e.target.tagName === 'svg' || e.target.classList.contains('canvas-bg')) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="relative w-full h-full flex flex-col paper-sheet overflow-hidden select-none bg-[#F8FAFC]">
      {/* Top Controls Toolbar */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none">
        {/* Graph Legend */}
        <div className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200 shadow-sm text-xs text-[#0F172A]">
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#6366F1]"></span>
            <span>Decisions</span>
          </div>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#D97706]"></span>
            <span>Clauses</span>
          </div>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0284C7]"></span>
            <span>People</span>
          </div>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#991B1B]">
            <span className="w-2 h-2 rounded-full bg-rose-400"></span>
            <span>Staleness Flag</span>
          </div>
        </div>

        {/* Filter & Zoom Controls */}
        <div className="pointer-events-auto flex items-center gap-1.5 p-1 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200 shadow-sm">
          <button 
            onClick={() => setZoom(z => Math.min(z + 0.15, 3))}
            className="p-1.5 rounded hover:bg-slate-100 text-[#64748B] hover:text-[#0F172A] transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn size={14} />
          </button>
          <button 
            onClick={() => setZoom(z => Math.max(z - 0.15, 0.4))}
            className="p-1.5 rounded hover:bg-slate-100 text-[#64748B] hover:text-[#0F172A] transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut size={14} />
          </button>
          <button 
            onClick={resetView}
            className="p-1.5 rounded hover:bg-slate-100 text-[#64748B] hover:text-[#0F172A] transition-colors cursor-pointer"
            title="Reset View"
          >
            <RotateCcw size={14} />
          </button>
          <div className="h-4 w-px bg-slate-200 mx-0.5"></div>
          <button 
            onClick={() => setInspectorOpen(!inspectorOpen)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-mono flex items-center gap-1 transition-colors cursor-pointer ${
              inspectorOpen ? 'bg-sky-50 text-[#0284C7] font-semibold border border-sky-200' : 'text-[#64748B] hover:bg-slate-100'
            }`}
          >
            <Info size={12} />
            <span>Inspector</span>
          </button>
        </div>
      </div>

      {/* SVG Canvas */}
      <div 
        ref={canvasRef}
        className={`w-full h-full relative cursor-grab active:cursor-grabbing overflow-hidden ${
          inspectorOpen && activeNodeData ? 'pr-[21rem]' : ''  /* keep nodes out from under the inspector */
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {/* Subtle dot pattern background */}
        <div 
          className="absolute inset-0 canvas-bg opacity-35 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #CBD5E1 1px, transparent 0)`,
            backgroundSize: '20px 20px'
          }}
        />

        {processedNodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="max-w-xs text-center p-4 rounded-xl bg-white/90 border border-slate-200 shadow-xs">
              <div className="font-heading font-semibold text-xs text-[#0F172A]">No graph data as of {asOfDate}</div>
              <p className="text-[11px] text-[#64748B] mt-1 leading-relaxed">
                The knowledge graph is empty or nothing was valid on this date. Seed the vault or restore a
                snapshot, or move the as-of date.
              </p>
            </div>
          </div>
        )}

        <svg
          ref={svgRef}
          className="w-full h-full"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.1s ease-out'
          }}
          viewBox={viewBox}
        >
          <defs>
            <marker id="arrow-active-light" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#64748B" />
            </marker>
            <marker id="arrow-clause-light" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#D97706" />
            </marker>
            <marker id="arrow-conflict-light" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#E11D48" />
            </marker>
          </defs>

          {/* Render Graph Edges */}
          <g className="edges">
            {processedEdges.map((edge, idx) => {
              const sourceNode = processedNodes.find(n => n.id === edge.source);
              const targetNode = processedNodes.find(n => n.id === edge.target);
              if (!sourceNode || !targetNode) return null;

              const isHighlighted = highlightNodeIds.includes(edge.source) && highlightNodeIds.includes(edge.target);
              const isSelectedConnected = selectedNodeId === edge.source || selectedNodeId === edge.target;

              const dx = targetNode.x - sourceNode.x;
              const dy = targetNode.y - sourceNode.y;
              const cx = (sourceNode.x + targetNode.x) / 2 - dy * 0.12;
              const cy = (sourceNode.y + targetNode.y) / 2 + dx * 0.12;
              const pathData = `M ${sourceNode.x} ${sourceNode.y} Q ${cx} ${cy} ${targetNode.x} ${targetNode.y}`;

              let strokeColor = '#94A3B8';
              let strokeWidth = 1.5;
              let strokeDash = 'none';
              let markerEnd = 'url(#arrow-active-light)';
              let opacity = 0.75;

              if (edge.status === 'conflict') {
                strokeColor = '#F43F5E';
                strokeWidth = 2.2;
                strokeDash = '5 4';
                markerEnd = 'url(#arrow-conflict-light)';
                opacity = 1;
              } else if (edge.status === 'expired') {
                strokeColor = '#CBD5E1';
                strokeWidth = 1.2;
                strokeDash = '3 3';
                opacity = 0.4;
              } else if (edge.status === 'future') {
                strokeColor = '#E2E8F0';
                strokeWidth = 1;
                opacity = 0.25;
              } else if (edge.relation === 'SUPERSEDES') {
                strokeColor = '#D97706';
                markerEnd = 'url(#arrow-clause-light)';
                strokeWidth = 2;
              }

              if (isSelectedConnected || isHighlighted) {
                strokeWidth = Math.max(strokeWidth, 2.5);
                strokeColor = '#0284C7';
                opacity = 1;
              }

              return (
                <g key={`edge-${idx}`}>
                  <path
                    d={pathData}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={strokeDash}
                    markerEnd={markerEnd}
                    opacity={opacity}
                  />
                  <text
                    x={cx}
                    y={cy - 4}
                    fill={edge.status === 'conflict' ? '#E11D48' : '#64748B'}
                    fontSize="8.5"
                    fontFamily="var(--font-mono)"
                    textAnchor="middle"
                    className="select-none pointer-events-none font-medium"
                  >
                    {edge.relation}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Render Graph Nodes */}
          <g className="nodes">
            {processedNodes.map((node) => {
              const isSelected = selectedNodeId === node.id;
              const isHighlighted = highlightNodeIds.includes(node.id);
              const isHovered = hoveredNode === node.id;
              
              const r = node.type === 'decision' ? 24 : node.type === 'clause' ? 22 : 20;

              return (
                <g 
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  className="cursor-pointer transition-all duration-150"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectNode(node.id);
                  }}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                >
                  {/* Subtle ring if selected or hovered */}
                  {(isSelected || isHighlighted || isHovered) && (
                    <circle
                      r={r + 6}
                      fill="none"
                      stroke={node.isStaleAtDate ? '#F43F5E' : '#38BDF8'}
                      strokeWidth="2"
                      opacity="0.8"
                    />
                  )}

                  {/* Main Node Body */}
                  <circle
                    r={r}
                    fill={node.isStaleAtDate ? '#FFF1F2' : node.fillColor}
                    stroke={node.isStaleAtDate ? '#E11D48' : node.strokeColor}
                    strokeWidth={isSelected ? 2.5 : 1.75}
                    className="transition-colors"
                  />

                  {/* Icon glyph inside node */}
                  {node.type === 'decision' && (
                    <g transform="translate(-7, -7) scale(0.65)" fill="none" stroke="#4F46E5" strokeWidth="2">
                      <polygon points="12 2 2 7 12 12 22 7 12 2" />
                      <polyline points="2 17 12 22 22 17" />
                    </g>
                  )}
                  {node.type === 'clause' && (
                    <g transform="translate(-7, -7) scale(0.65)" fill="none" stroke="#D97706" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                    </g>
                  )}
                  {node.type === 'person' && (
                    <g transform="translate(-7, -7) scale(0.65)" fill="none" stroke="#0284C7" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </g>
                  )}

                  {/* Gentle warning badge on conflicted node */}
                  {node.isStaleAtDate && (
                    <g transform="translate(10, -18)">
                      <circle cx="6" cy="6" r="7.5" fill="#E11D48" />
                      <text x="6" y="9.5" fill="#FFFFFF" fontSize="10" fontWeight="bold" textAnchor="middle">!</text>
                    </g>
                  )}

                  {/* Node Multi-Line Label */}
                  <g transform={`translate(0, ${r + 14})`}>
                    {node.label.split('\n').map((line, lIdx) => (
                      <text
                        key={lIdx}
                        x="0"
                        y={lIdx * 11}
                        fill={lIdx === 0 ? '#0F172A' : '#64748B'}
                        fontSize={lIdx === 0 ? "10" : "8.5"}
                        fontFamily="var(--font-heading)"
                        fontWeight={lIdx === 0 ? "600" : "normal"}
                        textAnchor="middle"
                        className="select-none pointer-events-none"
                      >
                        {line}
                      </text>
                    ))}
                  </g>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Slide-out Paper Sheet Inspector */}
      {inspectorOpen && activeNodeData && (
        <div className="absolute right-3 bottom-3 top-16 w-80 z-20 paper-sheet-elevated p-4 flex flex-col justify-between overflow-y-auto">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
              <div className="flex items-center gap-2">
                <span 
                  className="w-2.5 h-2.5 rounded-full" 
                  style={{ backgroundColor: activeNodeData.strokeColor }}
                />
                <span className="font-mono text-xs uppercase tracking-wider text-[#0F172A] font-bold">
                  {activeNodeData.type} Details
                </span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-[#475569]">
                {activeNodeData.id}
              </span>
            </div>

            {/* Decision Inspector Content */}
            {activeDecision && (
              <div className="space-y-3 text-xs">
                <div>
                  <h4 className="font-heading font-semibold text-sm text-[#0F172A] leading-snug">
                    {activeDecision.title}
                  </h4>
                  <div className="flex items-center gap-1.5 text-[10.5px] font-mono text-[#64748B] mt-1">
                    <Clock size={11} className="text-[#0284C7]" />
                    <span>Decided: {activeDecision.decidedOn}</span>
                  </div>
                </div>

                {/* Staleness Note */}
                {activeDecision.flags.map(flag => (
                  <div key={flag.id} className="p-2.5 rounded-lg badge-note-rose flex items-start gap-2">
                    <Info size={14} className="text-[#991B1B] shrink-0 mt-0.5" />
                    <div>
                      <div className="text-[11px] font-bold uppercase font-mono">
                        Policy Impact: {flag.impactType || 'flagged'}
                      </div>
                      <p className="text-[11px] mt-0.5 leading-snug">
                        Flagged by the impact scanner against <span className="font-mono font-bold">{flag.clause || 'a changed clause'}</span>.
                      </p>
                    </div>
                  </div>
                ))}

                {/* Provenance trace if available */}
                {activeNodeData.provenance?.source_doc && (
                  <div className="p-2.5 rounded-lg bg-sky-50/70 border border-sky-100 font-mono text-[10.5px]">
                    <div className="text-[#0284C7] font-semibold text-[10px] mb-1 uppercase tracking-wider flex items-center justify-between">
                      <span>PROVENANCE TRACE</span>
                      {activeNodeData.provenance.confidence && (
                        <span>{(activeNodeData.provenance.confidence * 100).toFixed(0)}% CONF</span>
                      )}
                    </div>
                    <div className="text-[#334155] truncate">Doc: {activeNodeData.provenance.source_doc}</div>
                    {activeNodeData.provenance.source_span?.quote && (
                      <div className="text-[#64748B] italic mt-1 bg-white/90 p-1.5 rounded border border-slate-100 text-[10px]">
                        "{activeNodeData.provenance.source_span.quote}"
                      </div>
                    )}
                  </div>
                )}

                {/* Metadata Grid */}
                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100 font-mono text-[11px]">
                  <div>
                    <span className="text-[#64748B] block text-[9.5px]">OWNER</span>
                    <span className="text-[#0F172A] font-medium">{activeDecision.owner}</span>
                  </div>
                  <div>
                    <span className="text-[#64748B] block text-[9.5px]">PROJECT</span>
                    <span className="text-[#0F172A] font-medium">{activeDecision.project}</span>
                  </div>
                  <div className="col-span-2 pt-1 border-t border-slate-200">
                    <span className="text-[#64748B] block text-[9.5px]">RELIED ON CLAUSE</span>
                    {activeDecision.reliedOnClause ? (
                      <button
                        onClick={() => onOpenCitation && onOpenCitation(activeDecision.reliedOnClause)}
                        className="citation-pill-paper mt-1"
                      >
                        <FileText size={10} />
                        {activeDecision.reliedOnClause}
                      </button>
                    ) : (
                      <span className="text-[#0F172A] font-medium block mt-1">None in force as of {asOfDate}</span>
                    )}
                  </div>
                </div>

                {/* Rationale */}
                <div>
                  <span className="text-[10px] font-mono text-[#64748B] uppercase tracking-wider block mb-1">
                    Recorded Rationale:
                  </span>
                  <p className="text-[11px] text-[#334155] bg-slate-50 p-2.5 rounded-lg border border-slate-100 italic leading-relaxed">
                    "{activeDecision.rationale}"
                  </p>
                </div>

                {/* Source Details */}
                {activeDecision.historicalCompliance && (
                  <div>
                    <span className="text-[10px] font-mono text-[#64748B] uppercase tracking-wider block mb-1.5">
                      Source Details:
                    </span>
                    <div className="space-y-1.5 font-mono text-[10px]">
                      {activeDecision.historicalCompliance.map((row, idx) => (
                        <div 
                          key={idx} 
                          className={`p-2 rounded-lg border ${
                            row.compliant 
                              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900' 
                              : 'bg-rose-50/70 border-rose-200 text-rose-900'
                          }`}
                        >
                          <div className="flex justify-between font-semibold">
                            <span>{row.period}</span>
                            <span className={row.compliant ? 'text-emerald-700' : 'text-rose-700'}>
                              {row.compliant ? '✓ Compliant' : '⚠ Stale'}
                            </span>
                          </div>
                          <div className="text-[9.5px] text-[#64748B] mt-0.5">{row.reason}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Clause Inspector Content */}
            {activeClause && (
              <div className="space-y-3 text-xs">
                <div>
                  <h4 className="font-heading font-semibold text-sm text-[#D97706]">
                    {activeClause.version.clauseName}
                  </h4>
                  <div className="text-[10.5px] font-mono text-[#64748B] mt-0.5">
                    Doc: {activeClause.policy.title}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 font-mono text-[11px] space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">CLAUSE ID:</span>
                    <span className="text-[#D97706] font-bold">{activeClause.version.clauseId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">VALID FROM:</span>
                    <span className="text-[#0F172A]">{activeClause.version.effectiveFrom}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">VALID TO:</span>
                    <span className="text-[#0F172A]">{activeClause.version.effectiveTo || 'CURRENT_ACTIVE'}</span>
                  </div>
                  {activeClause.version.limitDays && (
                    <div className="flex justify-between border-t border-slate-200 pt-1">
                      <span className="text-[#64748B]">RETENTION CEILING:</span>
                      <span className="text-[#0284C7] font-bold">{activeClause.version.limitDays} Days</span>
                    </div>
                  )}
                  {activeClause.version.limitInr && (
                    <div className="flex justify-between border-t border-slate-200 pt-1">
                      <span className="text-[#64748B]">SIGNING LIMIT:</span>
                      <span className="text-[#0284C7] font-bold">₹{activeClause.version.limitInr.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-[#334155] bg-slate-50 p-2.5 rounded-lg border border-slate-100 leading-relaxed">
                  {activeClause.version.description}
                </p>
              </div>
            )}

            {/* Person Inspector Content */}
            {activePerson && (
              <div className="space-y-3 text-xs">
                <div>
                  <h4 className="font-heading font-semibold text-sm text-[#0F172A]">
                    {activePerson.name}
                  </h4>
                  <div className="text-[11px] font-mono text-[#0284C7] mt-0.5">
                    {activePerson.role}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 font-mono text-[11px] space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">MEMBER ID:</span>
                    <span className="text-[#0F172A]">{activePerson.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">TENURE:</span>
                    <span className="text-[#0F172A]">{activePerson.joined} → {activePerson.left || 'Present'}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] font-mono text-[#64748B]">
            <span className="flex items-center gap-1 text-emerald-600">
              <ShieldCheck size={12} />
              Bi-temporal Edge Verified
            </span>
            <span>Ref: {activeNodeData.id}</span>
          </div>
        </div>
      )}
    </div>
  );
}
