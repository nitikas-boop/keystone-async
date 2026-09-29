import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Play, Pause, Info } from 'lucide-react';
import { fetchPolicies, fetchFlags } from '../api';
import DateField from './DateField';
import { addDays, clauseRef, day, daysBetween, inr, month, todayIST } from '../utils/format';

// Everything here comes from the backend (/policies, /flags): milestones are the real policy version start dates,
// "In force" is the version valid on the as-of date, and the impact badge appears only when an
// ONGOING_PRACTICE_BREACH flag exists whose triggering version is in force. The axis is proportional to real
// dates: the slider moves day by day, and each milestone sits exactly where its date falls on the track.
function summary(clause) {
  const f = clause?.fields || {};
  if (f.retention_days_max != null) return `${f.retention_days_max}-day max`;
  if (f.approver_threshold_inr?.CTO != null) return `${inr(f.approver_threshold_inr.CTO)} CTO ceiling`;
  return '';
}

const mainClause = v => v.clauses.find(c => c.checkable && Object.keys(c.fields || {}).length) || v.clauses[0];
const inForce = (v, d) => v.valid_from <= d && (!v.valid_to || d < v.valid_to);
const THUMB = 16;  // px; matches .kst-range thumb in index.css so markers line up with the thumb centre

export default function TemporalSlider({ asOfDate, onDateChange, refreshKey = 0, collapsed = false, onToggleCollapsed }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [policies, setPolicies] = useState([]);
  const [breaches, setBreaches] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([fetchPolicies(), fetchFlags('ONGOING_PRACTICE_BREACH')])
      .then(([p, f]) => { setPolicies(p); setBreaches(f); setError(null); })
      .catch(e => setError(e.message));
  }, [refreshKey]);

  const versions = policies.flatMap(p => p.versions);
  const today = todayIST();
  const milestones = [
    ...versions.map(v => ({ date: v.valid_from, refs: [clauseRef(mainClause(v).clause_id, v.version)],
                            detail: [`${clauseRef(mainClause(v).clause_id, v.version)}: ${summary(mainClause(v))}`] })),
    { date: today, refs: [], detail: [], today: true },
  ].sort((a, b) => a.date.localeCompare(b.date))
   .reduce((acc, p) => {  // versions starting the same day share one milestone
     const last = acc[acc.length - 1];
     if (last && last.date === p.date) {
       last.refs.push(...p.refs); last.detail.push(...p.detail); last.today = last.today || p.today;
       return acc;
     }
     return [...acc, { ...p, refs: [...p.refs], detail: [...p.detail] }];
   }, []);

  const start = milestones[0]?.date || today;
  const end = milestones.reduce((m, p) => (p.date > m ? p.date : m), today);
  const span = Math.max(daysBetween(start, end), 1);
  const pct = d => Math.min(1, Math.max(0, daysBetween(start, d) / span));
  const at = p => `calc(${THUMB / 2}px + (100% - ${THUMB}px) * ${pct(p)})`;
  // Labels of milestones closer than ~12% of the track alternate rows so none is cut off.
  let lastPct = -1, row = 0;
  const placed = milestones.map(m => {
    const p = pct(m.date);
    row = p - lastPct < 0.12 ? 1 - row : 0;
    lastPct = p;
    return { ...m, p, row, align: p < 0.06 ? 'left' : p > 0.94 ? 'right' : 'center' };
  });

  const active = policies
    .map(p => p.versions.find(v => inForce(v, asOfDate)))
    .filter(Boolean)
    .map(v => ({ id: v.policy_id, label: `${clauseRef(mainClause(v).clause_id, v.version)} (${summary(mainClause(v))})` }));

  const stale = breaches.some(f => versions.some(v =>
    v.version === f.new_version && v.clauses.some(c => c.clause_id === f.clause_id) && inForce(v, asOfDate)));

  const activeIndex = Math.max(0, milestones.reduce((acc, p, i) => (p.date <= asOfDate ? i : acc), -1));
  useEffect(() => {
    if (!isPlaying) return undefined;
    const timer = setInterval(() => {
      const nextIdx = (activeIndex + 1) % milestones.length;
      onDateChange(milestones[nextIdx].date);
      if (nextIdx === milestones.length - 1) setIsPlaying(false);
    }, 1600);
    return () => clearInterval(timer);
  }, [isPlaying, activeIndex, milestones, onDateChange]);

  return (
    <div className="w-full paper-sheet px-3.5 py-2 flex flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[#475569]">As of</span>
          <DateField value={asOfDate} min={start} max={end} label="As-of date" onChange={d => d && onDateChange(d)} />
          {asOfDate !== today && (
            <button className="text-[12.5px] text-[#0369A1] underline cursor-pointer" onClick={() => onDateChange(today)}>Back to today</button>
          )}
          <span className="text-[#475569]">In force:</span>
          {error && <span className="text-rose-700">policies unavailable: {error}</span>}
          {!error && active.length === 0 && <span className="text-[#475569]">no policy version</span>}
          {active.map(a => (
            <span key={a.id} className="px-2 py-0.5 rounded-md border border-[#B4530940] bg-[#FEF3C7] text-[#92400E] font-mono text-[12px]">{a.label}</span>
          ))}
          {stale && (
            <span className="flex items-center gap-1 text-[12px] px-2 py-0.5 rounded-md badge-note-rose">
              <Info size={12} aria-hidden="true" /> Policy impact: an ongoing practice breaches a clause in force
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!collapsed && (
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="btn-secondary"
              title={isPlaying ? 'Pause' : 'Step through each policy change'}
            >
              {isPlaying ? <Pause size={12} /> : <Play size={12} />}
              <span>{isPlaying ? 'Pause' : 'Animate Timeline'}</span>
            </button>
          )}
          {onToggleCollapsed && (
            <button onClick={onToggleCollapsed} className="btn-secondary" aria-expanded={!collapsed}
                    title={collapsed ? 'Show the policy timeline' : 'Hide the policy timeline'}>
              {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
              <span>{collapsed ? 'Timeline' : 'Hide timeline'}</span>
            </button>
          )}
        </div>
      </div>

      {!collapsed && <div className="relative pt-1">
        <input
          type="range" min={0} max={span} step={1} value={Math.round(pct(asOfDate) * span)}
          onChange={(e) => onDateChange(addDays(start, Number(e.target.value)))}
          className="kst-range w-full" aria-label="As-of date on the policy timeline" aria-valuetext={day(asOfDate)}
        />
        {/* Dots sit on the track at their date; labels sit below, alternating rows when dates are close. */}
        <div className="relative h-10">
          {placed.map(m => {
            const sel = m.date === asOfDate;
            return (
              <button
                key={m.date}
                onClick={() => onDateChange(m.date)}
                title={[day(m.date), ...m.detail].join(' · ')}
                className="absolute top-0 cursor-pointer group"
                style={{ left: at(m.date), transform: m.align === 'left' ? 'translateX(-5px)' : m.align === 'right' ? 'translateX(calc(-100% + 5px))' : 'translateX(-50%)' }}
              >
                <span className={`block w-2.5 h-2.5 rounded-full border-2 ${m.align === 'left' ? '' : m.align === 'right' ? 'ml-auto' : 'mx-auto'} ${sel ? 'bg-[#0284C7] border-white ring-2 ring-sky-300' : m.date <= asOfDate ? 'bg-slate-500 border-white' : 'bg-slate-200 border-slate-400'}`}
                      aria-hidden="true" />
                <span className={`block whitespace-nowrap text-[12px] leading-tight ${sel ? 'text-[#0284C7] font-semibold' : 'text-[#334155] group-hover:text-[#0F172A]'}`}
                      style={{ marginTop: m.row ? 16 : 2 }}>
                  {m.today ? 'Today' : month(m.date)}{m.refs.length ? <span className="font-mono text-[11.5px] text-[#475569]"> · {m.refs.join(', ')}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>}
    </div>
  );
}
