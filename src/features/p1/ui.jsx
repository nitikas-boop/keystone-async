import React, { useCallback, useEffect, useState } from 'react';

// Small plain building blocks for the Person 1 screens (no theming, no animation).
export function Section({ title, hint, actions, children }) {
  return (
    <section className="paper-sheet p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-heading font-semibold text-[14px] text-[#0F172A]">{title}</h3>
          {hint && <p className="text-[12.5px] text-[#64748B] mt-0.5">{hint}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-[12.5px] text-[#334155]">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

export const inputCls = 'h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-[13px] text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400';

export function Input(props) {
  return <input {...props} className={`${inputCls} ${props.className || ''}`} />;
}

export function Select({ options, ...props }) {
  return (
    <select {...props} className={`${inputCls} ${props.className || ''}`}>
      {options.map(o => typeof o === 'string'
        ? <option key={o} value={o}>{o}</option>
        : <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Btn({ kind = 'secondary', className = '', ...props }) {
  const cls = { primary: 'btn-sky-gradient text-white h-9 px-3 rounded-lg text-[13px] font-medium cursor-pointer disabled:opacity-50',
    secondary: 'btn-secondary', approve: 'btn-approve', danger: 'btn-danger' }[kind];
  return <button type="button" {...props} className={`${cls} ${className}`} />;
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return <div role="alert" className="badge-note-rose text-[12.5px] px-3 py-2 rounded-lg">{String(error.message || error)}</div>;
}

export function Badge({ tone = 'slate', children }) {
  return <span className={`badge-note-${tone} text-[11.5px] px-1.5 py-0.5 rounded-md whitespace-nowrap`}>{children}</span>;
}

export function Table({ head, rows, empty = 'Nothing here.' }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[#64748B] border-b border-slate-200">
            {head.map(h => <th key={h} className="py-1.5 pr-3 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={head.length} className="py-3 text-[#64748B]">{empty}</td></tr>
            : rows.map((cells, i) => (
              <tr key={i} className="border-b border-slate-100 align-top">
                {cells.map((c, j) => <td key={j} className="py-1.5 pr-3">{c}</td>)}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

// Load once (and again on reload()), keeping the error to show it rather than failing silently.
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => fn().then(data => setState({ data, error: null, loading: false }),
    error => setState(s => ({ ...s, error, loading: false }))), deps);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

// Runs an action, surfacing its error; returns a [run, busy, error] triple.
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = useCallback(async (fn) => {
    setBusy(true); setError(null);
    try { return await fn(); } catch (e) { setError(e); return undefined; } finally { setBusy(false); }
  }, []);
  return [run, busy, error];
}

export const when = (iso) => (iso ? new Date(iso).toLocaleString() : '—');
