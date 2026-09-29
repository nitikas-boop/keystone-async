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

// Every record ID in the app renders through this: the entity's colour and icon, monospace ID, and a click that
// opens the record (graph node, proposal, policy, audit block). `label` adds readable text after the ID.
export default function IdChip({ id, type, label, onClick, className = '', title }) {
  const { openEntity } = useApp();
  if (!id) return <span className="text-[#64748B]">—</span>;
  const t = type || typeOfId(id);
  const m = typeMeta(t);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); (onClick || openEntity)(id, t); }}
      title={title || `Open ${m.label.toLowerCase()} ${id}`}
      className={`inline-flex items-center gap-1 max-w-full px-1.5 py-0.5 rounded-md border text-[12px] leading-tight align-middle cursor-pointer hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600 ${className}`}
      style={{ background: m.fill, borderColor: `${m.stroke}40`, color: m.text }}
    >
      <Glyph paths={m.icon} color={m.stroke} />
      <span className="font-mono truncate">{id}</span>
      {label && <span className="font-sans truncate">{label}</span>}
    </button>
  );
}
