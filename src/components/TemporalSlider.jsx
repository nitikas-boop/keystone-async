import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  Calendar, 
  Play, 
  Pause, 
  RotateCcw, 
  ChevronRight, 
  Info,
  ShieldCheck
} from 'lucide-react';
import { TIMELINE_POINTS, POLICIES } from '../data/mockData';

export default function TemporalSlider({ asOfDate, onDateChange }) {
  const [isPlaying, setIsPlaying] = useState(false);

  // Available key dates in chronological order
  const timelineDates = [
    { date: "2024-03-12", label: "Q1 2024", policyTag: "RET v1 (365d)", note: "DEC-001 (Obsidian vault chosen)" },
    { date: "2024-07-22", label: "Q3 2024", policyTag: "RET v1 (365d)", note: "DEC-002 (300d log retention)" },
    { date: "2025-03-15", label: "Q1 2025", policyTag: "PROC v1 (₹5L)", note: "DEC-004 VendorCo ₹4L CTO approval" },
    { date: "2025-06-01", label: "Q2 2025", policyTag: "India Cloud", note: "DEC-006 Switch off AWS to India DC" },
    { date: "2025-06-30", label: "Q2 2025", policyTag: "RET v2 (180d)", note: "DEC-007 (180d log retention)" },
    { date: "2025-07-01", label: "Q3 2025", policyTag: "PROC v2 (₹2L)", note: "PROC-3.1@v2 active (₹2L ceiling)" },
    { date: "2025-11-25", label: "Q4 2025", policyTag: "PROC v2 (₹2L)", note: "DEC-009 Analytics tool ₹1.8L" },
    { date: "2026-09-28", label: "Sep 2026", policyTag: "RET v3 (90d)", note: "STALENESS: 90d mandate active" }
  ];

  const currentIndex = timelineDates.findIndex(p => p.date === asOfDate);
  const activeIndex = currentIndex !== -1 ? currentIndex : timelineDates.length - 1;

  const activeRetClause = asOfDate < '2025-01-06' ? 'RET-2.1@v1 (365d max)' : 
                         asOfDate < '2026-09-28' ? 'RET-2.1@v2 (180d max)' : 
                         'RET-2.1@v3 (90d max)';

  const activeProcClause = asOfDate < '2025-07-01' ? 'PROC-3.1@v1 (₹5L ceiling)' : 'PROC-3.1@v2 (₹2L ceiling)';

  const isConflictZone = asOfDate >= '2026-09-28';

  // Play animation through timeline
  useEffect(() => {
    let timer;
    if (isPlaying) {
      timer = setInterval(() => {
        const nextIdx = (activeIndex + 1) % timelineDates.length;
        onDateChange(timelineDates[nextIdx].date);
        if (nextIdx === timelineDates.length - 1) {
          setIsPlaying(false);
        }
      }, 1600);
    }
    return () => clearInterval(timer);
  }, [isPlaying, activeIndex, timelineDates, onDateChange]);

  return (
    <div className="w-full paper-sheet p-3.5 flex flex-col gap-2.5">
      {/* Top Meta Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          {/* Active Date Pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-100 font-mono text-[11.5px] text-[#0369A1]">
            <Clock size={13} className="text-[#0284C7]" />
            <span className="text-[#64748B] font-medium">As-Of Date:</span>
            <span className="font-bold text-[#0F172A]">{asOfDate}</span>
          </div>

          {/* Active Policies In Force at Selected Timestamp */}
          <div className="hidden md:flex items-center gap-1.5 font-mono text-[11px]">
            <span className="text-[#64748B]">Active Clauses:</span>
            <span className="px-2 py-0.5 rounded-md badge-note-amber">
              {activeRetClause}
            </span>
            <span className="px-2 py-0.5 rounded-md badge-note-lavender">
              {activeProcClause}
            </span>
          </div>

          {/* Gentle Staleness Highlight */}
          {isConflictZone && (
            <div className="flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded-md badge-note-rose">
              <Info size={12} />
              <span>Staleness Scan Active</span>
            </div>
          )}
        </div>

        {/* Animation & Step Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-mono text-[#0F172A] flex items-center gap-1.5 transition-colors cursor-pointer"
            title={isPlaying ? "Pause Timeline" : "Play Timeline Progression"}
          >
            {isPlaying ? <Pause size={12} /> : <Play size={12} />}
            <span>{isPlaying ? 'Pause' : 'Animate Timeline'}</span>
          </button>
        </div>
      </div>

      {/* Slider Track with Milestones */}
      <div className="relative pt-1 pb-1">
        {/* Native Range Slider */}
        <input 
          type="range" 
          min="0" 
          max={timelineDates.length - 1} 
          step="1"
          value={activeIndex}
          onChange={(e) => onDateChange(timelineDates[parseInt(e.target.value)].date)}
          className="w-full accent-[#0284C7] cursor-pointer h-1.5 bg-slate-100 rounded-lg appearance-none"
        />

        {/* Step Nodes / Markers */}
        <div className="flex justify-between items-start mt-2">
          {timelineDates.map((pt, idx) => {
            const isSelected = activeIndex === idx;
            const isPast = idx < activeIndex;

            return (
              <button
                key={idx}
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
