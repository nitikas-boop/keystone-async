import React from 'react';

// Plain building blocks for Person 2's test-console screens.
export const errText = (e) => (e?.detail?.message || (typeof e?.detail === 'string' ? e.detail : null) || e?.message || String(e));

export function Section({ title, children, actions }) {
  return (
    <section className="paper-sheet p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading font-semibold text-[14px] text-kb-navy">{title}</h2>
        <div className="flex items-center gap-2">{actions}</div>
      </div>
      {children}
    </section>
  );
}

export function Table({ head, rows, empty = 'Nothing here.' }) {
  if (!rows.length) return <p className="text-[13px] text-kb-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px] border-collapse">
        <thead>
          <tr>{head.map(h => <th key={h} className="text-left font-semibold text-kb-navy border-b border-kb-line px-2 py-1.5">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key ?? i} className="border-b border-kb-line align-top">
              {r.cells.map((c, j) => <td key={j} className="px-2 py-1.5">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-kb-navy">
      <span>{label}</span>
      {children}
    </label>
  );
}

export const inputCls = 'border border-kb-line-strong rounded-md px-2 py-1.5 text-[13px] bg-kb-bg';

export function Msg({ msg }) {
  if (!msg) return null;
  return <p className={`text-[12.5px] px-2 py-1.5 rounded-md ${msg.ok ? 'badge-note-green' : 'badge-note-rose'}`} role="status">{msg.text}</p>;
}
