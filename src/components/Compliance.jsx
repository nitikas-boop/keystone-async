import React from 'react';
import { CheckCircle2, CircleSlash, HelpCircle, XCircle } from 'lucide-react';
import IdChip from './IdChip';
import { day, polish } from '../utils/format';

// The four deterministic outcomes (§6.5). Icon + word + colour, never colour alone.
const RESULT = {
  compliant: { label: 'Compliant', Icon: CheckCircle2, cls: 'badge-note-green' },
  non_compliant: { label: 'Non-compliant', Icon: XCircle, cls: 'badge-note-rose' },
  not_checkable: { label: 'Not checkable', Icon: HelpCircle, cls: 'badge-note-slate' },
  no_clause: { label: 'No clause relied on', Icon: CircleSlash, cls: 'badge-note-slate' },
};

export function ResultChip({ result, prefix }) {
  const r = RESULT[result] || { label: result || '—', Icon: HelpCircle, cls: 'badge-note-slate' };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[12px] whitespace-nowrap ${r.cls}`}>
      <r.Icon size={12} aria-hidden="true" />
      {prefix && <span className="opacity-80">{prefix}</span>}
      <span className="font-medium">{r.label}</span>
    </span>
  );
}

// Then-vs-now from GET /decisions/{id}/compliance (or the `compliance` entries of an /ask answer).
export function ThenNow({ c, compact = false }) {
  if (!c) return null;
  const thenClause = (c.checks || []).map(k => k.source_id);
  const nowClause = (c.current || []).map(k => k.source_id);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <ResultChip result={c.result} prefix={`Then (${day(c.decided_on)}):`} />
        {thenClause.map(id => <IdChip key={`t${id}`} id={id} type="clause" />)}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <ResultChip result={c.current_result} prefix={`As of ${day(c.as_of)}:`} />
        {nowClause.map(id => <IdChip key={`n${id}`} id={id} type="clause" />)}
      </div>
      {!compact && [...(c.checks || []), ...(c.current || [])].map((k, i) => k.explanation && (
        <p key={i} className="text-[12.5px] text-ks-text-2 leading-relaxed">{polish(k.explanation)}</p>
      ))}
    </div>
  );
}
