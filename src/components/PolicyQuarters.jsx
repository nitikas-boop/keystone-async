import React, { useMemo, useState } from 'react';
import { clauseRef, day } from '../utils/format';

// Policy changes by quarter, and inside a quarter month by month. Built only from GET /policies (the real version
// start dates): a change is a policy version taking effect; "before" is the version it replaced.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const quarterOf = (d) => `${d.slice(0, 4)}-Q${Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1}`;
const label = (q) => `${q.slice(5)} ${q.slice(0, 4)}`;

function summary(clause) {
  const f = clause?.fields || {};
  if (f.retention_days_max != null) return `${f.retention_days_max}-day max`;
  if (f.approver_threshold_inr?.CTO != null) return `₹${(f.approver_threshold_inr.CTO / 100000).toLocaleString('en-IN')}L CTO ceiling`;
  return clause?.checkable === false ? 'not checkable' : '';
}

// Every clause whose text or fields differ from the previous version (all clauses for a first version).
function clauseChanges(v, prev) {
  return v.clauses.flatMap(c => {
    const old = prev?.clauses.find(o => o.clause_id === c.clause_id);
    if (old && JSON.stringify(old.fields || {}) === JSON.stringify(c.fields || {}) && old.text === c.text) return [];
    return [{ id: c.clause_id, title: c.title, before: old ? summary(old) || 'changed' : null, after: summary(c) || c.text }];
  });
}

export default function PolicyQuarters({ policies, asOfDate, onDateChange, today }) {
  const changes = useMemo(() => policies.flatMap(p => {
    const vs = [...p.versions].sort((a, b) => a.valid_from.localeCompare(b.valid_from));
    return vs.map((v, i) => ({ date: v.valid_from, policy: p.policy_id, version: v.version, first: i === 0,
      ref: clauseRef(v.clauses[0]?.clause_id, v.version), clauses: clauseChanges(v, vs[i - 1]),
      future: v.valid_from > today }));
  }).sort((a, b) => a.date.localeCompare(b.date)), [policies, today]);

  const quarters = useMemo(() => {
    if (!changes.length) return [];
    const out = [];
    let [y, q] = [Number(changes[0].date.slice(0, 4)), Number(quarterOf(changes[0].date).slice(6))];
    const last = [changes[changes.length - 1].date, today].sort()[1];
    while (`${y}-Q${q}` <= quarterOf(last)) {
      out.push(`${y}-Q${q}`);
      [y, q] = q === 4 ? [y + 1, 1] : [y, q + 1];
    }
    return out;
  }, [changes, today]);

  const [open, setOpen] = useState(null);
  const [month, setMonth] = useState(null);  // 0..2 within the open quarter, or null for all three
  if (!quarters.length) return null;

  const inQ = changes.filter(c => quarterOf(c.date) === open);
  const firstMonth = open ? (Number(open.slice(6)) - 1) * 3 : 0;
  const monthOf = (c) => Number(c.date.slice(5, 7)) - 1 - firstMonth;
  const shown = month == null ? inQ : inQ.filter(c => monthOf(c) === month);
  const daysIn = (m) => new Date(Number(open.slice(0, 4)), firstMonth + m + 1, 0).getDate();

  return (
    <div className="flex flex-col gap-1.5 pt-1 border-t border-slate-100" data-testid="policy-quarters">
      <div className="flex items-center gap-1 flex-wrap text-[12px]">
        <span className="text-[#475569] mr-1">Policy changes by quarter:</span>
        {quarters.map(q => {
          const n = changes.filter(c => quarterOf(c.date) === q).length;
          return (
            <button key={q} onClick={() => { setOpen(open === q ? null : q); setMonth(null); }} aria-pressed={open === q}
              title={n ? `${n} policy change(s) in ${label(q)}` : `No policy change in ${label(q)}`}
              className={`h-6 px-2 rounded-md border cursor-pointer ${open === q ? 'bg-[#0284C7] border-[#0284C7] text-white'
                : n ? 'bg-white border-slate-300 text-[#0F172A] hover:border-sky-400' : 'bg-slate-50 border-slate-200 text-[#94A3B8]'}`}>
              {label(q)}{n > 0 && <span className={`ml-1 font-semibold ${open === q ? '' : 'text-[#B45309]'}`}>{n}</span>}
            </button>
          );
        })}
      </div>

      {open && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 flex flex-col gap-2">
          <div className="text-[12.5px] text-[#0F172A]">
            <b>{label(open)}</b>: {inQ.length === 0 ? 'no policy changed this quarter.' : `${inQ.length} policy change(s).`}
            {month != null && <button className="ml-2 text-[#0369A1] underline cursor-pointer" onClick={() => setMonth(null)}>Show the whole quarter</button>}
          </div>
          {/* Month by month: one segment per month, each change a dot at its day. Click a month to filter the list. */}
          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={`Months of ${label(open)}`}>
            {[0, 1, 2].map(m => {
              const here = inQ.filter(c => monthOf(c) === m);
              return (
                <button key={m} onClick={() => setMonth(month === m ? null : m)} aria-pressed={month === m}
                  className={`text-left rounded-md border px-2 pt-1 pb-2 cursor-pointer ${month === m ? 'border-[#0284C7] bg-white ring-1 ring-sky-200' : 'border-slate-200 bg-white hover:border-sky-300'}`}>
                  <div className="flex justify-between text-[12px]">
                    <span className="font-semibold">{MONTHS[firstMonth + m]} {open.slice(0, 4)}</span>
                    <span className={here.length ? 'text-[#B45309]' : 'text-[#94A3B8]'}>{here.length ? `${here.length} change(s)` : 'no change'}</span>
                  </div>
                  <div className="relative h-3 mt-1.5">
                    <div className="absolute inset-x-0 top-1/2 h-px bg-slate-300" />
                    {here.map(c => (
                      <span key={c.policy + c.version} title={`${day(c.date)} · ${c.ref}`}
                        className={`absolute top-0 w-3 h-3 rounded-full border-2 border-white -translate-x-1/2 ${c.date === asOfDate ? 'bg-[#0284C7] ring-2 ring-sky-300' : 'bg-[#D97706]'}`}
                        style={{ left: `${((Number(c.date.slice(8, 10)) - 0.5) / daysIn(m)) * 100}%` }} />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
          {shown.length > 0 && (
            <ul className="flex flex-col gap-1">
              {shown.map(c => (
                <li key={c.policy + c.version}>
                  <button onClick={() => onDateChange(c.date)} title="Set the as-of date to the day this version took effect"
                    className={`w-full text-left rounded-md px-2 py-1 text-[12.5px] cursor-pointer border ${c.date === asOfDate ? 'border-sky-300 bg-sky-50' : 'border-transparent hover:bg-white hover:border-slate-200'}`}>
                    <span className="font-mono text-[#475569]">{day(c.date)}</span>{' · '}
                    <b>{c.policy} {c.version}</b>{c.first ? ' (first version)' : ''}{c.future ? ' · takes effect later' : ''}
                    {c.clauses.map(k => (
                      <span key={k.id} className="block pl-4 text-[#334155]">
                        <span className="font-mono">{k.id}</span> {k.title}: {k.before ? <>{k.before} → <b>{k.after}</b></> : <b>{k.after}</b>}
                      </span>
                    ))}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
