import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { fetchGraphView, fetchProposals } from '../api';
import { useApp } from '../context';
import { TypeGlyph } from './IdChip';
import { nodeTitle, typeMeta } from '../utils/entities';
import { polish, todayIST } from '../utils/format';

// Ctrl/Cmd+K: search decisions, clauses, policy versions, people, projects, meeting notes and proposals.
// Records come from GET /graph/view (server-side visibility filter, so restricted items are not listed for
// non-readers) and GET /proposals (proposals about restricted decisions hidden).

export default function CommandPalette({ open, onClose }) {
  const { isReader, restrictedIds, openEntity } = useApp();
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setSel(0);
    setTimeout(() => inputRef.current?.focus(), 0);
    Promise.all([fetchGraphView(todayIST(), isReader), fetchProposals()])
      .then(([g, ps]) => setItems([
        ...g.nodes.map(n => ({ id: n.id, type: n.type, title: polish(nodeTitle(n)) })),
        ...ps.filter(p => isReader || !restrictedIds.has(p.decision_id))
          .map(p => ({ id: `#${p.id}`, type: 'proposal', title: `${p.decision_id} vs ${p.clause_id} · ${p.status}` })),
      ]))
      .catch(() => setItems([]));
  }, [open, isReader, restrictedIds]);

  const results = useMemo(() => {
    if (!items) return [];
    const t = q.trim().toLowerCase();
    const scored = items
      .map(it => {
        const hay = `${it.id} ${it.title}`.toLowerCase();
        const score = !t ? 1 : it.id.toLowerCase().startsWith(t) ? 3 : hay.includes(t) ? 2 : 0;
        return { ...it, score };
      })
      .filter(it => it.score > 0);
    return scored.sort((a, b) => b.score - a.score || a.type.localeCompare(b.type) || a.id.localeCompare(b.id)).slice(0, 40);
  }, [items, q]);

  if (!open) return null;
  const go = (it) => { onClose(); openEntity(it.id, it.type); };
  const onKey = (e) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter' && results[sel]) go(results[sel]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-ks-bg/70" onClick={onClose} role="dialog" aria-modal="true" aria-label="Search records">
      <div className="w-full max-w-xl paper-sheet-elevated overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-3 border-b border-ks-line">
          <Search size={16} className="text-ks-muted" aria-hidden="true" />
          <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setSel(0); }} onKeyDown={onKey}
                 placeholder="Search decisions, clauses, people, documents, proposals…" aria-label="Search"
                 role="combobox" aria-expanded="true" aria-controls="palette-results"
                 className="flex-1 h-11 text-[14px] outline-none bg-transparent" />
          <kbd className="text-[11px] font-mono px-1.5 py-0.5 rounded border border-ks-line-strong text-ks-muted">Esc</kbd>
        </div>
        <ul id="palette-results" role="listbox" className="max-h-[50vh] overflow-y-auto py-1">
          {items === null && <li className="px-4 py-3 text-[13px] text-ks-muted">Loading…</li>}
          {items && results.length === 0 && <li className="px-4 py-3 text-[13px] text-ks-muted">No matching record.</li>}
          {results.map((it, i) => (
            <li key={`${it.type}:${it.id}`} role="option" aria-selected={i === sel}>
              <button onClick={() => go(it)} onMouseEnter={() => setSel(i)}
                      className={`w-full text-left px-4 py-2 flex items-center gap-2.5 cursor-pointer ${i === sel ? 'bg-ks-orange/10' : ''}`}>
                <TypeGlyph type={it.type} size={14} />
                <span className="font-mono text-[12.5px] text-ks-text shrink-0">{it.id}</span>
                <span className="text-[13px] text-ks-text-2 truncate">{it.title}</span>
                <span className="ml-auto text-[11.5px] text-ks-muted shrink-0">{typeMeta(it.type).label}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="px-4 py-1.5 border-t border-ks-line text-[11.5px] text-ks-muted">↑ ↓ to move · Enter to open · Ctrl+K to toggle</p>
      </div>
    </div>
  );
}
