import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Clock, Edit3, Inbox, Loader2, Lock, Mail, XCircle } from 'lucide-react';
import { fetchFlags, fetchPolicies } from '../api';
import { useApp } from '../context';
import IdChip from './IdChip';
import { clauseRef, day, inr, plural, polish, shortHash, ts } from '../utils/format';
import { displayName } from '../utils/people';

// Review queue: GET /proposals, joined with GET /flags (why) and GET /policies (what changed), plus the audit rows
// already written for each proposal. Approve / Edit / Reject call the existing endpoints; nothing else is simulated.
const SEVERITY = {
  action_needed: { label: 'Action needed', cls: 'badge-note-rose' },
  informational: { label: 'Informational', cls: 'badge-note-amber' },
  historical: { label: 'Historical', cls: 'badge-note-slate' },
};
const IMPACT = {
  ONGOING_PRACTICE_BREACH: 'an ongoing practice now breaches the new rule',
  RULE_CHANGED_SINCE: 'the rule changed after this one-off decision',
  SUPERSEDED: 'the decision was already superseded',
  MCP_PROPOSAL: 'a proposal made through the MCP server',
};

// proposed -> approved -> executing (approved, executor not done yet) -> executed; or proposed -> rejected.
function stageOf(p, watching) {
  if (p.status === 'executed') return 'executed';
  if (p.status === 'rejected') return 'rejected';
  if (p.status === 'approved') return watching ? 'executing' : 'approved';
  return 'proposed';
}

function StatusChip({ p, watching }) {
  const s = stageOf(p, watching);
  const map = {
    proposed: ['badge-note-amber', Clock, 'Proposed'],
    approved: ['badge-note-sky', CheckCircle2, 'Approved, waiting for executor'],
    executing: ['badge-note-sky', Loader2, 'Executing'],
    executed: ['badge-note-green', CheckCircle2, 'Executed'],
    rejected: ['badge-note-rose', XCircle, 'Rejected'],
  };
  const [cls, Icon, label] = map[s];
  return (
    <span className={`inline-flex items-center gap-1 text-[12px] px-1.5 py-0.5 rounded-md whitespace-nowrap ${cls}`}>
      <Icon size={12} className={s === 'executing' ? 'animate-spin' : ''} aria-hidden="true" /> {label}
    </span>
  );
}

export default function ReviewQueue({
  queueItems, auditLogs = [], onApproveAction, onRejectAction, onEditAction, compact = false,
  focusId, watchingId, watchTimedOut, refreshKey = 0,
}) {
  const { team, openEntity, restrictedIds, isReader } = useApp();
  const [flags, setFlags] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [showAll, setShowAll] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    fetchFlags().then(setFlags).catch(() => setFlags([]));
    fetchPolicies().then(setPolicies).catch(() => setPolicies([]));
  }, [refreshKey, queueItems.length]);
  useEffect(() => { if (focusId != null) setSelectedId(Number(focusId)); }, [focusId]);

  // GET /proposals has no visibility filter (KNOWN_ISSUES.md): hide proposals about restricted decisions here.
  const items = (queueItems || [])
    .filter(p => isReader || !restrictedIds.has(p.decision_id))
    .sort((a, b) => (b.status === 'proposed') - (a.status === 'proposed') || b.id - a.id);
  const shown = showAll ? items : items.filter(p => p.status === 'proposed' || p.status === 'approved');
  const pending = items.filter(p => p.status === 'proposed').length;
  const selected = items.find(p => p.id === selectedId) || (!compact && shown[0]) || null;

  const header = (
    <div className="px-4 py-3 bg-white border-b border-slate-100 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="p-1 rounded-md bg-teal-50 text-[#0F766E]"><Lock size={14} aria-hidden="true" /></div>
        <div className="min-w-0">
          <h2 className="font-heading font-semibold text-[13px] tracking-tight text-[#0F172A]">Review queue</h2>
          <p className="text-[12px] text-[#64748B] truncate">
            The scanner and MCP clients can only propose. A person approves; then the executor writes an email file to outbox/.
          </p>
        </div>
      </div>
      <span className="text-[12px] px-2 py-0.5 rounded-lg bg-slate-50 border border-slate-200 text-[#0F172A] whitespace-nowrap">
        {plural(pending, 'proposal')} awaiting a decision
      </span>
    </div>
  );

  const list = (
    <ul className="divide-y divide-slate-100" aria-label="Proposals">
      {shown.map(p => {
        const flag = flags.find(f => f.id === p.flag_id);
        const sev = SEVERITY[p.severity] || SEVERITY.informational;
        const active = selected?.id === p.id;
        return (
          <li key={p.id}>
            <button
              onClick={() => (compact ? openEntity(`#${p.id}`, 'proposal') : setSelectedId(p.id))}
              aria-current={active ? 'true' : undefined}
              className={`w-full text-left px-4 py-2.5 cursor-pointer hover:bg-slate-50 ${active && !compact ? 'bg-sky-50/70 border-l-2 border-[#0284C7]' : 'border-l-2 border-transparent'}`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[12.5px] font-semibold text-[#0F172A]">#{p.id}</span>
                <span className={`text-[11.5px] px-1.5 py-0.5 rounded ${sev.cls}`}>{sev.label}</span>
                <StatusChip p={p} watching={watchingId === p.id} />
              </div>
              <div className="text-[13px] text-[#0F172A] mt-1 leading-snug">
                <span className="font-mono">{p.decision_id}</span> vs <span className="font-mono">{clauseRef(p.clause_id, flag?.new_version)}</span>
                <span className="text-[#475569]"> · {IMPACT[p.impact_type] || p.impact_type}</span>
              </div>
              <div className="text-[12px] text-[#64748B] mt-0.5">Proposed {ts(p.created_at).ist}</div>
            </button>
          </li>
        );
      })}
    </ul>
  );

  const empty = (
    <div className="p-8 text-center text-[13px] text-[#475569]">
      <Inbox size={22} className="mx-auto mb-2 text-[#64748B]" aria-hidden="true" />
      {items.length === 0
        ? 'No proposals yet. The impact scanner creates one when a new policy version makes a past decision non-compliant.'
        : 'Nothing is waiting for a decision. Switch to "All" to see decided proposals.'}
    </div>
  );

  if (compact) {
    return (
      <div className="flex flex-col h-full paper-sheet overflow-hidden">
        {header}
        <div className="flex-1 overflow-y-auto">{shown.length ? list : empty}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full paper-sheet overflow-hidden">
      {header}
      <div className="flex-1 flex min-h-0">
        <div className="w-[22rem] shrink-0 border-r border-slate-100 flex flex-col min-h-0">
          <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-1 text-[12.5px]" role="tablist">
            {[['Open', false], ['All', true]].map(([label, all]) => (
              <button key={label} role="tab" aria-selected={showAll === all} onClick={() => setShowAll(all)}
                className={`px-2 py-1 rounded-md cursor-pointer ${showAll === all ? 'bg-slate-100 font-semibold text-[#0F172A]' : 'text-[#475569] hover:bg-slate-50'}`}>
                {label} ({all ? items.length : items.filter(p => p.status === 'proposed' || p.status === 'approved').length})
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">{shown.length ? list : empty}</div>
        </div>
        <div className="flex-1 min-w-0 overflow-y-auto">
          {selected
            ? <Detail key={selected.id} p={selected} flag={flags.find(f => f.id === selected.flag_id)} policies={policies}
                      auditLogs={auditLogs} team={team} watching={watchingId === selected.id} timedOut={watchTimedOut === selected.id}
                      onApprove={onApproveAction} onReject={onRejectAction} onEdit={onEditAction} />
            : <div className="p-8 text-center text-[13px] text-[#64748B]">Select a proposal to see what approving it would do.</div>}
        </div>
      </div>
    </div>
  );
}

function clauseValue(policies, clauseId, version) {
  for (const pol of policies) {
    const v = pol.versions.find(x => x.version === version && x.clauses.some(c => c.clause_id === clauseId));
    if (v) {
      const f = v.clauses.find(c => c.clause_id === clauseId).fields || {};
      if (f.retention_days_max != null) return { text: `${f.retention_days_max}-day retention ceiling`, from: v.valid_from };
      if (f.approver_threshold_inr?.CTO != null) return { text: `${inr(f.approver_threshold_inr.CTO)} CTO ceiling`, from: v.valid_from };
      return { text: 'not machine-checkable', from: v.valid_from };
    }
  }
  return null;
}

function Detail({ p, flag, policies, auditLogs, team, watching, timedOut, onApprove, onReject, onEdit }) {
  const [mode, setMode] = useState('view');  // view | edit | reject
  const [draft, setDraft] = useState({ to: p.to, subject: p.subject, body: p.body });
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const stage = stageOf(p, watching);
  const rows = useMemo(() => auditLogs
    .filter(r => r.object_type === 'proposal' && String(r.object_id) === String(p.id)
      || (flag && r.object_type === 'flag' && r.object_id === flag.id))
    .sort((a, b) => a.id - b.id), [auditLogs, p.id, flag]);
  const rejectedRow = rows.find(r => r.action === 'rejected');
  const recipientId = (p.to || '').split('@')[0];
  const recipient = team.find(m => m.id === recipientId);
  const then = flag?.old_version && clauseValue(policies, p.clause_id, flag.old_version);
  const now = flag && clauseValue(policies, p.clause_id, flag.new_version);
  const sev = SEVERITY[p.severity] || SEVERITY.informational;
  const act = async (fn) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  // Status changes (approved, executed, rejected) are announced at the top: bring it into view.
  const topRef = useRef(null);
  useEffect(() => { topRef.current?.parentElement?.scrollTo({ top: 0, behavior: 'smooth' }); }, [stage]);

  return (
    <article ref={topRef} className="p-5 space-y-5 text-[13px] text-[#1E293B]" aria-label={`Proposal ${p.id}`} aria-live="polite">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-heading font-semibold text-[16px] text-[#0F172A]">Proposal #{p.id}</h3>
            <span className={`text-[12px] px-1.5 py-0.5 rounded ${sev.cls}`}>{sev.label}</span>
            <span className="text-[12px] font-mono text-[#475569]">{p.impact_type}</span>
          </div>
          <Stepper p={p} stage={stage} team={team} />
        </div>
      </header>

      {/* What approving does, in plain words */}
      <section className="rounded-lg border border-teal-200 bg-teal-50/60 p-3 leading-relaxed">
        {stage === 'proposed' && <>
          <strong>Approving</strong> makes the executor write one email file to <span className="font-mono">outbox/</span> (it names
          it <span className="font-mono">proposal-{p.id}.eml</span>) addressed to{' '}
          <strong>{recipient ? recipient.name : p.to}</strong> ({p.to}), about <span className="font-mono">{p.decision_id}</span>:
          {' '}{IMPACT[p.impact_type] || p.impact_type}. <strong>Nothing else is executed</strong>: no email is sent, no record is changed.
        </>}
        {stage === 'approved' && <>Approved. The executor polls every ~2 s and has not written the file yet. Is the executor container running?</>}
        {stage === 'executing' && <>Approved. Waiting for the executor to write <span className="font-mono">outbox/proposal-{p.id}.eml</span> and its audit row…
          {timedOut && <span className="block text-rose-800 mt-1">No executor result after 60 s. Check that the executor container is running (<span className="font-mono">docker compose ps</span>).</span>}</>}
        {stage === 'executed' && <>Executed {ts(p.executed_at).ist}: the executor wrote <span className="font-mono font-semibold">outbox/{p.outbox_file}</span>.
          {rows.find(r => r.action === 'executed') && <> Audit block <AuditRef row={rows.find(r => r.action === 'executed')} />.</>}</>}
        {stage === 'rejected' && <>Rejected {ts(p.decided_at).ist} by {displayName(p.decided_by, team)}. Nothing was executed.
          {rejectedRow && <> Reason recorded (hash <span className="font-mono">{shortHash(rejectedRow.payload_hash)}</span>) in audit block <AuditRef row={rejectedRow} />.
          The audit log keeps only the hash of the reason.</>}</>}
      </section>

      {/* Involved records */}
      <section>
        <h4 className="text-[12px] font-semibold uppercase tracking-wide text-[#475569] mb-2">Involved records</h4>
        <div className="flex items-center gap-2 flex-wrap">
          <IdChip id={p.decision_id} type="decision" />
          <span className="text-[12px] text-[#475569] flex items-center gap-1">relied on <ArrowRight size={12} /></span>
          {flag?.old_version
            ? <IdChip id={clauseRef(p.clause_id, flag.old_version)} type="clause" label={then?.text} />
            : <span className="text-[12px] text-[#64748B]">no earlier clause version</span>}
          {flag && <>
            <span className="text-[12px] text-[#475569] flex items-center gap-1">superseded by <ArrowRight size={12} /></span>
            <IdChip id={clauseRef(p.clause_id, flag.new_version)} type="clause" label={now && `${now.text}, from ${day(now.from)}`} />
          </>}
        </div>
        {flag && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <IdChip id={flag.id} type="flag" />
            <span className="text-[12px] text-[#475569]">
              then: {flag.old_result?.replace('_', '-') || 'n/a'} · now: {flag.new_result.replace('_', '-')}
            </span>
          </div>
        )}
      </section>

      {/* Full reasoning, no truncation */}
      {flag && (
        <section>
          <h4 className="text-[12px] font-semibold uppercase tracking-wide text-[#475569] mb-1.5">Why the scanner raised it</h4>
          <p className="leading-relaxed">{polish(flag.explanation)}</p>
          <p className="text-[12px] text-[#64748B] mt-1">Worded by the local model from the deterministic check result.</p>
        </section>
      )}

      {/* The proposal as stored */}
      <section>
        <div className="flex items-center justify-between mb-1.5">
          <h4 className="text-[12px] font-semibold uppercase tracking-wide text-[#475569] flex items-center gap-1.5">
            <Mail size={13} aria-hidden="true" /> The proposal (as stored)
          </h4>
          {mode === 'view' && stage === 'proposed' && (
            <button className="btn-secondary" onClick={() => setMode('edit')}><Edit3 size={13} /> Edit draft</button>
          )}
        </div>
        {mode === 'edit' ? (
          <form className="space-y-2" onSubmit={e => { e.preventDefault(); act(async () => { await onEdit(p.id, draft); setMode('view'); }); }}>
            <label className="block"><span className="text-[12px] text-[#475569]">To</span>
              <input className="field w-full font-mono" type="email" required value={draft.to} onChange={e => setDraft(d => ({ ...d, to: e.target.value }))} /></label>
            <label className="block"><span className="text-[12px] text-[#475569]">Subject</span>
              <input className="field w-full" required value={draft.subject} onChange={e => setDraft(d => ({ ...d, subject: e.target.value }))} /></label>
            <label className="block"><span className="text-[12px] text-[#475569]">Body</span>
              <textarea className="w-full rounded-lg border border-slate-300 p-2 text-[13px] leading-relaxed" rows={9} required value={draft.body}
                        onChange={e => setDraft(d => ({ ...d, body: e.target.value }))} /></label>
            <p className="text-[12px] text-[#64748B]">Saving calls PATCH /proposals/{p.id} and adds an "edited" audit row.</p>
            <div className="flex gap-2">
              <button type="submit" className="btn-approve" disabled={busy}>Save draft</button>
              <button type="button" className="btn-secondary" onClick={() => { setDraft({ to: p.to, subject: p.subject, body: p.body }); setMode('view'); }}>Cancel</button>
            </div>
          </form>
        ) : (
          <dl className="rounded-lg border border-slate-200 divide-y divide-slate-100">
            <div className="grid grid-cols-[5rem_1fr] p-2"><dt className="text-[#475569]">To</dt><dd className="font-mono break-all">{p.to}</dd></div>
            <div className="grid grid-cols-[5rem_1fr] p-2"><dt className="text-[#475569]">Subject</dt><dd>{polish(p.subject)}</dd></div>
            <div className="grid grid-cols-[5rem_1fr] p-2"><dt className="text-[#475569]">Body</dt><dd className="whitespace-pre-wrap leading-relaxed">{polish(p.body)}</dd></div>
          </dl>
        )}
        <p className="text-[12px] text-[#64748B] mt-1">
          The executor writes these fields into the email file; it adds its own From, Date and approval headers when it runs.
        </p>
      </section>

      {/* Audit rows */}
      <section>
        <h4 className="text-[12px] font-semibold uppercase tracking-wide text-[#475569] mb-1.5">Audit trail for this proposal</h4>
        <ol className="space-y-1">
          {rows.map(r => (
            <li key={r.id} className="flex items-center gap-2 flex-wrap">
              <AuditRef row={r} />
              <span className="font-mono text-[12px]">{r.action}</span>
              <span>by {displayName(r.actor, team)}</span>
              <span className="text-[#64748B] text-[12px]">{ts(r.ts).ist}</span>
            </li>
          ))}
          {stage === 'proposed' && (
            <li className="text-[#475569] text-[12.5px] pt-1">
              Approving adds <span className="font-mono">approved</span> (by you), then <span className="font-mono">executed</span> (by the executor, with the file's SHA-256).
              Rejecting adds <span className="font-mono">rejected</span> with the hash of your reason.
            </li>
          )}
        </ol>
      </section>

      {/* Decision */}
      {stage === 'proposed' && mode !== 'edit' && (
        <section className="border-t border-slate-100 pt-4">
          {mode === 'reject' ? (
            <form className="space-y-2" onSubmit={e => { e.preventDefault(); act(() => onReject(p.id, reason.trim())); }}>
              <label className="block">
                <span className="text-[13px] font-medium">Reason for rejecting (required, recorded in the audit log as a hash)</span>
                <textarea className="w-full mt-1 rounded-lg border border-slate-300 p-2 text-[13px]" rows={3} required minLength={3}
                          value={reason} onChange={e => setReason(e.target.value)} autoFocus />
              </label>
              <div className="flex gap-2">
                <button type="submit" className="btn-danger" disabled={busy || reason.trim().length < 3}><XCircle size={14} /> Reject proposal</button>
                <button type="button" className="btn-secondary" onClick={() => setMode('view')}>Cancel</button>
              </div>
            </form>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <button className="btn-approve" disabled={busy} onClick={() => act(() => onApprove(p.id))}>
                <CheckCircle2 size={15} /> Approve: executor writes the email file
              </button>
              <button className="btn-danger" onClick={() => setMode('reject')}><XCircle size={14} /> Reject…</button>
            </div>
          )}
        </section>
      )}
    </article>
  );
}

function AuditRef({ row }) {
  const { openEntity } = useApp();
  return (
    <button onClick={() => openEntity(`block:${row.id}`, 'audit')} className="font-mono text-[12px] px-1.5 py-0.5 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 cursor-pointer"
            title={`Open audit block ${row.id}`}>
      block {row.id}
    </button>
  );
}

function Stepper({ p, stage, team }) {
  const steps = stage === 'rejected'
    ? [['Proposed', p.created_at], ['Rejected', p.decided_at]]
    : [['Proposed', p.created_at], ['Approved', p.decided_at], ['Executing', null], ['Executed', p.executed_at]];
  const at = { proposed: 0, approved: 1, executing: 1, executed: 3, rejected: 1 }[stage];
  return (
    <ol className="flex items-center gap-1.5 mt-2 flex-wrap" aria-label="Status">
      {steps.map(([label, when], i) => {
        const done = i <= at;
        const current = stage === 'executing' && label === 'Executing';
        return (
          <li key={label} className="flex items-center gap-1.5">
            {i > 0 && <span className={`w-5 h-px ${done ? 'bg-[#0F766E]' : 'bg-slate-300'}`} aria-hidden="true" />}
            <span className={`text-[12px] px-1.5 py-0.5 rounded-md border ${done ? (label === 'Rejected' ? 'badge-note-rose' : 'border-teal-300 bg-teal-50 text-[#115E59]') : current ? 'badge-note-sky' : 'border-slate-200 text-[#64748B]'}`}
                  title={when ? ts(when).full : undefined}>
              {done ? '✓ ' : current ? '… ' : ''}{label}{when && done ? ` · ${ts(when).time}` : ''}
              {label === 'Approved' && done && p.decided_by ? ` · ${displayName(p.decided_by, team)}` : ''}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
