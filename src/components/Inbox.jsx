import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, CheckCheck, ChevronRight, FileSearch, GitBranch, Inbox as InboxIcon, ListChecks, MessageCircle, RefreshCw, Table2 } from 'lucide-react';
import * as p1 from '../api/p1';
import { fetchDecisions } from '../api';
import { useApp } from '../context';
import { day, polish } from '../utils/format';
import { displayName } from '../utils/people';

// One tab, two segments. My Inbox: everything this person must deal with (GET /inbox, already scoped by the server
// to what they may approve, own, review or read). Decision Registry: every decision they may see, so a reviewer
// has the decision's context next to the action they approve.
const FILTERS = [['all', 'All'], ['action', 'Needs my action'], ['unread', 'Unread'], ['notification', 'Notifications']];
const ICON = { approval: ListChecks, agent_action: ListChecks, flag: AlertTriangle, ingestion: FileSearch, decision_review: Table2,
  correction: AlertTriangle, dm: MessageCircle, mention: MessageCircle, channel: MessageCircle };
const TYPE = { approval: 'Approval', agent_action: 'Agent action', flag: 'Staleness flag', ingestion: 'Ingestion review',
  decision_review: 'Decision review', correction: 'Correction', dm: 'Direct message', mention: 'Mention', channel: 'Channel' };

function DecisionContext({ id, decisions }) {
  const { team, openEntity } = useApp();
  const d = decisions?.find(x => x.id === id);
  if (!id) return null;
  if (!d) return <p className="text-[12.5px] text-[#64748B]">{decisions ? `${id} is not a decision you can see today.` : 'Loading decision…'}</p>;
  const a = d.attributes || {};
  return (
    <div className="flex flex-col gap-2 text-[13px]">
      <div className="text-[11.5px] uppercase tracking-wide text-[#64748B] font-semibold">Decision context</div>
      <div className="font-semibold text-[#0F172A]">{polish(d.label)} <span className="font-mono text-[12px] text-[#64748B]">{d.id}</span></div>
      <dl className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-1 text-[12.5px]">
        <dt className="text-[#64748B]">Owner</dt><dd>{a.owner ? displayName(a.owner, team) : '—'}</dd>
        <dt className="text-[#64748B]">Decided on</dt><dd>{day(a.decided_on || d.valid_from)}</dd>
        <dt className="text-[#64748B]">Project</dt><dd>{a.project || '—'}</dd>
        <dt className="text-[#64748B]">Status</dt><dd className="capitalize">{a.status || 'active'} · {a.effect || '—'}</dd>
      </dl>
      {a.reasons && <p className="text-[12.5px] text-[#334155] leading-relaxed">{polish(a.reasons)}</p>}
      <div className="flex gap-2 flex-wrap">
        <button type="button" className="btn-secondary" onClick={() => openEntity(d.id, 'decision', { view: 'GRAPH' })}><GitBranch size={13} /> Open in graph</button>
        <button type="button" className="btn-secondary" onClick={() => openEntity(d.id, 'decision', { view: 'REGISTRY' })}><Table2 size={13} /> Open in registry</button>
      </div>
    </div>
  );
}

function Actions({ item, run }) {
  const [editing, setEditing] = useState(null);
  const r = item.ref;
  const reason = () => window.prompt('Reason (the proposer sees it)') ?? null;
  if (item.type === 'approval') {
    return (
      <div className="flex flex-col gap-2">
        {editing ? (
          <form className="flex flex-col gap-1.5" onSubmit={(e) => { e.preventDefault(); run(() => p1.editProposal(r.id, editing)).then(() => setEditing(null)); }}>
            <input className="field" value={editing.subject} onChange={e => setEditing({ ...editing, subject: e.target.value })} aria-label="Subject" />
            <textarea className="field min-h-24" value={editing.body} onChange={e => setEditing({ ...editing, body: e.target.value })} aria-label="Body" />
            <div className="flex gap-2"><button className="btn-approve" type="submit">Save</button><button className="btn-secondary" type="button" onClick={() => setEditing(null)}>Cancel</button></div>
          </form>
        ) : (
          <div className="flex gap-2 flex-wrap">
            <button type="button" className="btn-approve" onClick={() => run(() => p1.approveProposal(r.id))}>Approve</button>
            <button type="button" className="btn-secondary" onClick={() => p1.proposals(null).then(ps => { const p = ps.find(x => x.id === r.id); if (p) setEditing({ subject: p.subject, body: p.body }); })}>Edit</button>
            <button type="button" className="btn-danger" onClick={() => { const why = reason(); if (why !== null) run(() => p1.rejectProposal(r.id, why)); }}>Reject</button>
          </div>
        )}
      </div>
    );
  }
  if (item.type === 'agent_action') {
    return (
      <div className="flex gap-2">
        <button type="button" className="btn-approve" onClick={() => run(() => p1.approveAction(r.id))}>Approve</button>
        <button type="button" className="btn-danger" onClick={() => { const why = reason(); if (why !== null) run(() => p1.rejectAction(r.id, why)); }}>Reject</button>
      </div>
    );
  }
  if (item.type === 'decision_review') {
    return (
      <div className="flex gap-2">
        <button type="button" className="btn-approve" onClick={() => run(() => p1.acceptDecisionProposal(r.id))}>Accept into ingestion</button>
        <button type="button" className="btn-danger" onClick={() => { const why = reason(); if (why !== null) run(() => p1.rejectDecisionProposal(r.id, why)); }}>Reject</button>
      </div>
    );
  }
  if (item.type === 'flag' && r.can_resolve) {
    return <button type="button" className="btn-approve" onClick={() => run(() => p1.resolveFlag(r.id, window.prompt('Resolution note (optional)') || null))}>Resolve flag</button>;
  }
  if (item.type === 'correction') {
    return <button type="button" className="btn-approve" onClick={() => run(() => p1.correctionDone(r.notification_id))}>Mark handled</button>;
  }
  return null;
}

function MyInbox({ onOpen, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [sel, setSel] = useState(null);
  const [decisions, setDecisions] = useState(null);
  const load = useCallback(() => p1.inbox().then(d => { setData(d); setError(null); }, setError), []);
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);
  useEffect(() => { fetchDecisions().then(setDecisions).catch(() => setDecisions([])); }, []);
  const run = (fn) => fn().then(() => { setSel(null); load(); onChanged?.(); }, e => setError(e));

  const items = useMemo(() => (data?.items || []).filter(i => filter === 'all' || i.category === filter), [data, filter]);
  const n = (c) => (data?.items || []).filter(i => i.category === c && !(c === 'notification' && i.read)).length;
  const selected = items.find(i => i.key === sel);
  const open = (i) => {
    setSel(i.key);
    if (i.category === 'notification' && !i.read) p1.readNotification(i.ref.notification_id).then(load).catch(() => {});
  };

  return (
    <div className="flex h-full gap-4 min-h-0">
      <div className="flex-1 min-w-0 paper-sheet flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <div className="flex gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200" role="tablist" aria-label="Filter inbox">
            {FILTERS.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}
                className={`h-7 px-2.5 rounded-lg text-[12.5px] flex items-center gap-1.5 cursor-pointer ${filter === id ? 'bg-white font-semibold shadow-xs' : 'text-[#475569] hover:text-[#0F172A]'}`}>
                {label}{id !== 'all' && <span className={`min-w-4 h-4 px-1 rounded-full text-[10.5px] font-bold flex items-center justify-center ${n(id) ? 'bg-[#0284C7] text-white' : 'bg-slate-200 text-[#475569]'}`}>{n(id)}</span>}
              </button>
            ))}
          </div>
          {data && <span className="text-[12.5px] text-[#64748B]">{data.counts.pending} pending · {data.counts.unread} unread</span>}
          <button type="button" className="ml-auto btn-secondary" onClick={() => p1.inboxReadAll().then(load)}><CheckCheck size={13} /> Mark all read</button>
          <button type="button" className="icon-btn" onClick={load} aria-label="Refresh inbox" title="Refresh"><RefreshCw size={13} /></button>
        </div>
        {error && <div role="alert" className="m-3 badge-note-rose text-[12.5px] px-3 py-2 rounded-lg">{error.status === 403 ? "You don't have permission: " : ''}{error.message}</div>}
        <ul className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {!data && !error && <li className="p-6 text-center text-[13px] text-[#64748B]">Loading…</li>}
          {data && items.length === 0 && <li className="p-6 text-center text-[13px] text-[#64748B]">Nothing here. You&apos;re all caught up.</li>}
          {items.map(i => {
            const I = ICON[i.type] || Bell;
            const unread = i.category === 'unread' || (i.category === 'notification' && !i.read);
            return (
              <li key={i.key}>
                <button type="button" onClick={() => open(i)}
                  className={`w-full text-left px-4 py-2.5 flex items-start gap-3 cursor-pointer hover:bg-slate-50 ${sel === i.key ? 'bg-sky-50/70' : ''}`}>
                  <I size={15} className={`mt-0.5 shrink-0 ${i.urgent ? 'text-amber-600' : 'text-[#0284C7]'}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[13px] truncate ${unread || i.category === 'action' ? 'font-semibold text-[#0F172A]' : 'text-[#475569]'}`}>{i.title}</span>
                    <span className="block text-[12px] text-[#64748B] truncate">
                      {TYPE[i.type] || (i.category === 'notification' ? 'Notification' : i.type)}{i.detail ? ` · ${i.detail}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11.5px] text-[#94A3B8]">{i.created_at ? new Date(i.created_at).toLocaleDateString() : ''}</span>
                  {unread && <span className="mt-1.5 w-2 h-2 rounded-full bg-[#0284C7] shrink-0" aria-label="unread" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <aside className="w-[380px] shrink-0 paper-sheet p-4 flex flex-col gap-3 overflow-y-auto" aria-label="Selected item">
        {!selected && <p className="text-[13px] text-[#64748B]">Select an item to act on it. Approvals show the decision they concern next to the buttons.</p>}
        {selected && <>
          <div>
            <div className="text-[11.5px] uppercase tracking-wide text-[#64748B] font-semibold">{TYPE[selected.type] || 'Notification'}</div>
            <div className="font-semibold text-[14px] text-[#0F172A] mt-0.5">{selected.title}</div>
            {selected.detail && <p className="text-[12.5px] text-[#475569] mt-1 whitespace-pre-wrap">{selected.detail}</p>}
          </div>
          <Actions item={selected} run={run} />
          <button type="button" className="self-start text-[12.5px] text-[#0284C7] hover:underline flex items-center gap-1 cursor-pointer" onClick={() => onOpen(selected)}>
            Open source <ChevronRight size={12} />
          </button>
          {selected.ref?.decision_id && <div className="pt-3 border-t border-slate-100"><DecisionContext id={selected.ref.decision_id} decisions={decisions} /></div>}
        </>}
      </aside>
    </div>
  );
}

export default function Inbox({ segment, onSegment, registry, onOpen, onChanged }) {
  const SEGMENTS = [['mine', 'My Inbox', InboxIcon], ['registry', 'Decision Registry', Table2]];
  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <div className="flex items-center gap-3">
        <div className="flex gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200" role="tablist" aria-label="Inbox">
          {SEGMENTS.map(([id, label, I]) => (
            <button key={id} role="tab" aria-selected={segment === id} onClick={() => onSegment(id)}
              className={`h-8 px-3 rounded-lg flex items-center gap-1.5 text-[13px] cursor-pointer ${segment === id ? 'bg-white font-semibold shadow-xs' : 'text-[#475569] hover:text-[#0F172A]'}`}>
              <I size={14} className={segment === id ? 'text-[#0284C7]' : ''} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0">{segment === 'mine' ? <MyInbox onOpen={onOpen} onChanged={onChanged} /> : registry}</div>
    </div>
  );
}
