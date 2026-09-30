import React, { useEffect, useState } from 'react';
import { ArrowLeft, ChevronDown, GitBranch, Loader2 } from 'lucide-react';
import { fetchDecisionCompliance, fetchDocument, fetchPolicies } from '../api';
import { useApp } from '../context';
import IdChip from './IdChip';
import { ThenNow } from './Compliance';
import { ProposalStatus } from './GraphVisualizer';
import { IMPACT } from '../utils/entities';
import { clauseInForce } from '../utils/frontMatter';
import { day, polish, ts } from '../utils/format';
import { displayName } from '../utils/people';

const ACTIONS = { query: 'Asked about in a question', flag_created: 'Flag raised by the impact scanner', action_proposed: 'Action proposed',
  approved: 'Proposal approved', rejected: 'Proposal rejected', executed: 'Executor sent the notification', extraction_reviewed: 'Extracted fact reviewed' };

// One decision on one page: what it was, the clause versions it relied on then and now, what happened to it since
// (later policy versions, replacements, flags, proposals, audit entries), and the deterministic check then vs now.
// Read-only: GET /documents/{id}, /policies, /decisions/{id}/compliance, plus the lists the dashboard already holds.
export default function DecisionPage({ row, decisions, flags, proposals, auditLogs, onBack }) {
  const { team, openEntity } = useApp();
  const [doc, setDoc] = useState(null);
  const [policies, setPolicies] = useState([]);
  const [compliance, setCompliance] = useState({ loading: true });

  const load = () => {
    setCompliance({ loading: true });
    fetchDecisionCompliance(row.id).then(data => setCompliance({ data })).catch(e => setCompliance({ error: e.message }));
  };
  useEffect(() => {
    setDoc(null);
    fetchDocument(row.id).then(setDoc).catch(() => setDoc(false));
    fetchPolicies().then(setPolicies).catch(() => {});
    load();
  }, [row.id]);

  const fm = doc?.front_matter || {};
  const relied = (fm.relied_on || []).map(cid => {
    const then = clauseInForce(policies, cid, row.decidedOn);
    const later = policies.flatMap(p => p.versions).filter(v => v.valid_from > row.decidedOn && v.clauses.some(c => c.clause_id === cid))
      .map(v => ({ ...v.clauses.find(c => c.clause_id === cid), version: v.version, validFrom: v.valid_from }));
    return { cid, then, later };
  });
  const replacedBy = decisions.filter(d => d.id !== row.id && d.supersedes === row.id);
  const myFlags = flags.filter(f => f.decision_id === row.id);
  const myProposals = proposals.filter(p => p.decision_id === row.id);
  const myAudit = auditLogs.filter(r => (r.source_ids || []).includes(row.id) || r.object_id === row.id).slice().reverse();

  // What happened, oldest first. Every entry is a dated record from the backend.
  const events = [
    { date: row.decidedOn, text: <>Decided by {displayName(row.owner, team)}{fm.source ? <> after <IdChip id={fm.source} withTitle /></> : null}</> },
    ...relied.flatMap(r => r.later.map(v => ({ date: v.validFrom, text: <><IdChip id={`${r.cid}@${v.version}`} type="clause" /> took effect{v.fields && r.then && JSON.stringify(v.fields) !== JSON.stringify(r.then.fields) ? ' and changed its limits' : ''}</> }))),
    ...replacedBy.map(d => ({ date: d.decidedOn, text: <>Replaced by <IdChip id={d.id} type="decision" withTitle /></> })),
    ...myFlags.map(f => ({ date: f.created_at?.slice(0, 10), text: <>Flagged: {IMPACT[f.impact_type]?.label || f.impact_type} (<IdChip id={`${f.clause_id}@${f.new_version}`} type="clause" />)</> })),
    ...myProposals.flatMap(p => [
      { date: p.created_at?.slice(0, 10), text: <>Proposal <IdChip id={`#${p.id}`} type="proposal" /> drafted</> },
      p.decided_at && { date: p.decided_at.slice(0, 10), text: <>Proposal #{p.id} {p.status === 'rejected' ? 'rejected' : 'approved'} by {displayName(p.decided_by, team)}</> },
      p.executed_at && { date: p.executed_at.slice(0, 10), text: <>Notification sent (<span className="font-mono">outbox/{p.outbox_file}</span>)</> },
    ].filter(Boolean)),
  ].filter(e => e.date).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="h-full paper-sheet flex flex-col overflow-hidden" aria-label={`Decision ${row.id}`}>
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="btn-secondary"><ArrowLeft size={13} /> All decisions</button>
        <div className="min-w-0">
          <h2 className="font-heading font-semibold text-[16px] text-[#0F172A] leading-snug">{row.title}</h2>
          <div className="text-[12.5px] text-[#475569] flex items-center gap-1.5 flex-wrap">
            <span className="font-mono">{row.id}</span>
            <span>{[displayName(row.owner, team), day(row.decidedOn), row.project, row.status.charAt(0).toUpperCase() + row.status.slice(1),
              row.effect && (row.effect === 'ongoing' ? 'ongoing practice' : 'one-off')].filter(Boolean).map(x => ` · ${x}`).join('')}</span>
            {row.restricted && <span className="px-1 rounded badge-note-slate">restricted</span>}
          </div>
        </div>
        <button onClick={() => openEntity(row.id, 'decision', { view: 'GRAPH' })} className="btn-secondary ml-auto"><GitBranch size={13} /> Show in graph</button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 grid lg:grid-cols-[1fr_22rem] gap-6 text-[13px]">
        <div className="space-y-5 min-w-0">
          <section>
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[#64748B] mb-1.5">Why</h3>
            <p className="leading-relaxed text-[#1E293B]">{row.reasons || '—'}</p>
            <p className="text-[12px] text-[#64748B] mt-1">Recorded in <span className="font-mono">{row.provenance?.source_doc || '—'}</span>
              {row.extracted ? ', extracted from a meeting note and accepted by a reviewer' : ''}.</p>
          </section>

          <section>
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[#64748B] mb-1.5">Compliance, then vs now</h3>
            {compliance.loading && <p className="flex items-center gap-2 text-[#475569]"><Loader2 size={14} className="animate-spin" /> Running the deterministic check and asking the local model to word it…</p>}
            {compliance.error && <p className="text-rose-700">Check failed: {compliance.error} <button className="underline cursor-pointer" onClick={load}>Retry</button></p>}
            {compliance.data && <ThenNow c={compliance.data} />}
          </section>

          <section>
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[#64748B] mb-1.5">Rules it relied on</h3>
            {doc === null && <p className="text-[#64748B]">Loading…</p>}
            {doc !== null && relied.length === 0 && <p className="text-[#475569]">No policy clause is recorded for this decision, so it has nothing to be checked against.</p>}
            <ul className="space-y-2">
              {relied.map(r => (
                <li key={r.cid} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.then ? <IdChip id={`${r.cid}@${r.then.version}`} type="clause" /> : <span className="font-mono">{r.cid}</span>}
                    <span className="text-[#475569]">in force when decided</span>
                    <button className="ml-auto text-[12.5px] underline text-[#0369A1] cursor-pointer" onClick={() => openEntity(r.cid, 'clause', { view: 'POLICIES' })}>Compare versions</button>
                  </div>
                  {r.then && <p className="mt-1 text-[#334155]">{polish(r.then.text)}</p>}
                  {r.later.map(v => (
                    <p key={v.version} className="mt-1.5 pl-2 border-l-2 border-amber-300 text-[#334155]">
                      <span className="font-semibold">Since {day(v.validFrom)} ({v.version}):</span> {polish(v.text)}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          </section>

          {myFlags.length > 0 && (
            <section>
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[#64748B] mb-1.5">Policy impact</h3>
              <ul className="space-y-2">
                {myFlags.map(f => (
                  <li key={f.id} className="rounded-lg border border-slate-200 p-2.5">
                    <span className={`text-[12px] px-1.5 py-0.5 rounded ${IMPACT[f.impact_type]?.cls || 'badge-note-slate'}`}>{IMPACT[f.impact_type]?.label || f.impact_type}</span>
                    <p className="mt-1 text-[#334155] leading-relaxed">{polish(f.explanation)}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <ProposalStatus items={myProposals} auditLogs={auditLogs} team={team} openEntity={openEntity} />

          {doc && (
            <details className="group">
              <summary className="cursor-pointer text-[#0369A1] flex items-center gap-1 select-none">
                <ChevronDown size={13} className="group-open:rotate-180 transition-transform" aria-hidden="true" /> Source document
              </summary>
              <pre className="mt-2 p-3 rounded-lg bg-slate-50 border border-slate-200 font-mono text-[12px] whitespace-pre-wrap">{doc.body}</pre>
            </details>
          )}
        </div>

        <aside className="space-y-5">
          <section>
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[#64748B] mb-2">What happened</h3>
            <ol className="relative border-l border-slate-200 ml-1.5 space-y-3" aria-label="Timeline">
              {events.map((e, i) => (
                <li key={i} className="pl-4 relative">
                  <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-[#4F46E5]" aria-hidden="true" />
                  <div className="text-[12px] text-[#64748B]">{day(e.date)}</div>
                  <div className="flex items-center gap-1.5 flex-wrap text-[#1E293B]">{e.text}</div>
                </li>
              ))}
            </ol>
          </section>
          <section>
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[#64748B] mb-2">Audit entries naming it ({myAudit.length})</h3>
            {myAudit.length === 0 && <p className="text-[#475569]">None yet.</p>}
            <ul className="space-y-1">
              {myAudit.slice(0, 12).map(r => (
                <li key={r.id}>
                  <button className="text-left w-full rounded-md px-2 py-1 hover:bg-slate-50 cursor-pointer" onClick={() => openEntity(`block:${r.id}`, 'audit')}>
                    <span className="font-mono text-[12px] text-[#0369A1]">Block {r.id}</span>{' '}
                    <span className="text-[#1E293B]">{ACTIONS[r.action] || r.action}</span>
                    <span className="block text-[12px] text-[#64748B]">{displayName(r.actor, team)} · {ts(r.ts).ist}</span>
                  </button>
                </li>
              ))}
            </ul>
            {myAudit.length > 12 && <button className="text-[12.5px] underline text-[#0369A1] cursor-pointer" onClick={() => openEntity(`block:${myAudit[0].id}`, 'audit')}>See all in the Audit Trail</button>}
          </section>
        </aside>
      </div>
    </div>
  );
}
