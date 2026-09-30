import React, { useRef } from 'react';
import { CalendarDays } from 'lucide-react';
import { day } from '../utils/format';

// A date picker that displays '30 Sep 2026' (the app's one date format) instead of the browser's locale format.
// The native date input sits invisibly on top, so clicking anywhere opens the browser's own calendar.
export default function DateField({ value, onChange, min, max, label, placeholder = 'Any date', className = '' }) {
  const ref = useRef(null);
  return (
    <span className={`relative inline-flex items-center gap-1.5 h-[1.875rem] px-2 rounded-lg border border-ks-line-strong bg-ks-surface text-[13px] text-ks-text ${className}`}>
      <CalendarDays size={13} className="text-ks-orange shrink-0" aria-hidden="true" />
      <span className={value ? 'font-medium' : 'text-ks-muted'}>{value ? day(value) : placeholder}</span>
      <input
        ref={ref}
        type="date"
        value={value || ''}
        min={min}
        max={max}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        onClick={() => { try { ref.current?.showPicker?.(); } catch { /* picker needs a user gesture; the click is one */ } }}
        className="absolute inset-0 opacity-0 cursor-pointer w-full"
      />
    </span>
  );
}
