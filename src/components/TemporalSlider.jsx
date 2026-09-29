import React, { useState, useEffect } from 'react';
import { Clock, Play, Pause, Info } from 'lucide-react';
import { fetchPolicies, fetchFlags } from '../api';
import { clauseRef, inr } from '../utils/format';

// Everything here comes from the backend (/policies, /flags): milestones are the real policy version start dates,
// "Active Clauses" is the version in force on the as-of date, and the staleness badge appears only when an
// ONGOING_PRACTICE_BREACH flag exists whose triggering version is in force.

function summary(clause) {
  const f = clause?.fields || {};
  if (f.retention_days_max != null) return `${f.retention_days_max}d max`;
  if (f.approver_threshold_inr?.CTO != null) return `${inr(f.approver_threshold_inr.CTO)} CTO ceiling`;
  return '';
}

const mainClause = v => v.clauses.find(c => c.checkable && Object.keys(c.fields || {}).length) || v.clauses[0];
const inForce = (v, d) => v.valid_from <= d && (!v.valid_to || d < v.valid_to);

export default function TemporalSlider({ asOfDate, onDateChange, refreshKey = 0 }) {
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
  const today = new Date().toLocaleDateString('en-CA');
  const timelineDates = [
    ...versions.map(v => ({
      date: v.valid_from,
      label: new Date(v.valid_from).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
      policyTag: `${clauseRef(mainClause(v).clause_id, v.version)} (${summary(mainClause(v))})`,
    })),
    { date: today, label: 'Today', policyTag: '' },
  ].sort((a, b) => a.date.localeCompare(b.date))
   .reduce((acc, p) => {  // versions starting the same day share one milestone
     const last = acc[acc.length - 1];
     if (last && last.date === p.date) {
       last.policyTag = [last.policyTag, p.policyTag].filter(Boolean).join(' · ');
       return acc;
     }
     return [...acc, { ...p }];
   }, []);

  // The last milestone on or before the as-of date (chips set dates between milestones).
  const activeIndex = Math.max(0, timelineDates.reduce((acc, p, i) => (p.date <= asOfDate ? i : acc), -1));

  const active = policies
    .map(p => p.versions.find(v => inForce(v, asOfDate)))
    .filter(Boolean)
    .map(v => ({ id: v.policy_id, label: `${mainClause(v).clause_id}@${v.version} (${summary(mainClause(v))})` }));

  const stale = breaches.some(f => versions.some(v =>
    v.version === f.new_version && v.clauses.some(c => c.clause_id === f.clause_id) && inForce(v, asOfDate)));

  useEffect(() => {
    if (!isPlaying) return undefined;
    const timer = setInterval(() => {
      const nextIdx = (activeIndex + 1) % timelineDates.length;
      onDateChange(timelineDates[nextIdx].date);
      if (nextIdx === timelineDates.length - 1) setIsPlaying(false);
    }, 1600);
    return () => clearInterval(timer);
  }, [isPlaying, activeIndex, timelineDates, onDateChange]);

  return (
    <div className="w-full paper-sheet px-3.5 py-2.5 flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-100 font-mono text-[11.5px] text-[#0369A1]">
            <Clock size={13} className="text-[#0284C7]" />
            <span className="text-[#64748B] font-medium">As-Of Date:</span>
            <span className="font-bold text-[#0F172A]">{asOfDate}</span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 font-mono text-[11px]">
            <span className="text-[#64748B]">Active Clauses:</span>
            {error && <span className="text-rose-600">policies unavailable: {error}</span>}
            {!error && active.length === 0 && <span className="text-[#64748B]">none in force</span>}
            {active.map(a => (
              <span key={a.id} className={`px-2 py-0.5 rounded-md ${a.id === 'POL-RET' ? 'badge-note-amber' : 'badge-note-lavender'}`}>
                {a.label}
              </span>
            ))}
          </div>

          {stale && (
            <div className="flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded-md badge-note-rose">
              <Info size={12} />
              <span>Policy Impact: Ongoing Breach Flagged</span>
            </div>
          )}
        </div>

        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-mono text-[#0F172A] flex items-center gap-1.5 transition-colors cursor-pointer"
          title={isPlaying ? "Pause Timeline" : "Play Timeline Progression"}
        >
          {isPlaying ? <Pause size={12} /> : <Play size={12} />}
          <span>{isPlaying ? 'Pause' : 'Animate Timeline'}</span>
        </button>
      </div>

      <div className="relative">
        <input
          type="range"
          min="0"
          max={timelineDates.length - 1}
          step="1"
          value={activeIndex}
          onChange={(e) => onDateChange(timelineDates[parseInt(e.target.value)].date)}
          className="w-full accent-[#0284C7] cursor-pointer h-1.5 bg-slate-100 rounded-lg appearance-none"
        />
        <div className="flex justify-between items-start mt-1">
          {timelineDates.map((pt, idx) => {
            const isSelected = activeIndex === idx;
            const isPast = idx < activeIndex;
            return (
              <button
                key={pt.date}
                onClick={() => onDateChange(pt.date)}
                className="group flex flex-col items-center focus:outline-none transition-all cursor-pointer"
                style={{ width: `${100 / timelineDates.length}%` }}
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full border transition-all ${
                    isSelected
                      ? 'bg-[#0284C7] border-white scale-125 shadow-sm ring-2 ring-sky-300'
                      : isPast
                      ? 'bg-slate-400 border-white'
                      : 'bg-slate-200 border-white group-hover:bg-sky-300'
                  }`}
                />
                <span className={`text-[10px] font-mono mt-1 transition-colors text-center truncate w-full ${
                  isSelected ? 'text-[#0284C7] font-bold' : 'text-[#64748B] group-hover:text-[#0F172A]'
                }`}>
                  {pt.label}
                </span>
                <span className="hidden lg:block text-[9px] font-mono text-[#94A3B8] truncate max-w-[85px]">
                  {pt.policyTag}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
