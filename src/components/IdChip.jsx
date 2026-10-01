import React from 'react';
import { useApp } from '../context';
import { typeMeta, typeOfId } from '../utils/entities';

function Glyph({ paths, color, size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

export function TypeGlyph({ type, size }) {
  const m = typeMeta(type);
  return <Glyph paths={m.icon} color={m.stroke} size={size} />;
}

// Every record ID in the app renders through this: the entity's colour and icon, and a click that opens the record
// (graph node, proposal, policy, audit block). The record's title (from the shared title lookup) is always in the
// tooltip; with `withTitle` (or an explicit `label`) the readable text leads and the ID follows, smaller.
export default function IdChip({ id, type, label, withTitle = false, onClick, className = '', title }) {
  const { openEntity, titles } = useApp();
  if (!id) return <span className="text-kb-muted">—</span>;
  const t = type || typeOfId(id);
  const m = typeMeta(t);
  const known = titles?.get(id);
  const text = label || (withTitle ? known : null);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); (onClick || openEntity)(id, t); }}
      title={title || `${known ? `${known} (${id})` : id}. Open this ${m.label.toLowerCase()}`}
      className={`inline-flex items-center gap-1 max-w-full px-1.5 py-0.5 rounded-md border text-[12px] leading-tight align-middle cursor-pointer hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-kb-cobalt ${className}`}
      style={{ background: m.fill, borderColor: `${m.stroke}40`, color: m.text }}
    >
      <Glyph paths={m.icon} color={m.stroke} />
      {text
        ? <><span className="font-sans truncate">{text}</span><span className="font-mono text-[11px] opacity-75 shrink-0">{id}</span></>
        : <span className="font-mono truncate shrink-0">{id}</span>}
    </button>
  );
}
