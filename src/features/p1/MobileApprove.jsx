import React, { useCallback, useEffect, useState } from 'react';
import { Bell, Check, LogOut, RefreshCw, X } from 'lucide-react';
import * as p1 from '../../api/p1';
import { Badge, Btn, ErrorNote, useAction, when } from './ui';

// H: the phone screen. What waits for this person: review-queue proposals (with the flag's reasoning and citations)
// and agent actions they asked for. Approve or reject; the executor on the server does the rest.
export default function MobileApprove({ me, onSignOut, onDesktop }) {
  const [data, setData] = useState({ proposals: [], actions: [], flags: [], unread: 0 });
  const [loadError, setLoadError] = useState(null);
  const [run, busy, error] = useAction();

  const load = useCallback(() => Promise.all([p1.proposals('proposed'), p1.actions('proposed'), p1.flags(), p1.notifications()])
    .then(([proposals, actions, flags, n]) => { setData({ proposals, actions, flags, unread: n.unread }); setLoadError(null); })
    .catch(e => (e.status === 401 ? onSignOut() : setLoadError(e))), [onSignOut]);  // revoked or expired: sign in again
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);

  const act = (fn) => run(async () => { await fn(); await load(); });
  const flagOf = (p) => data.flags.find(f => f.id === p.flag_id);
  const total = data.proposals.length + data.actions.length;

  return (
    <div className="min-h-dvh bg-[#F8FAFC] text-[#0F172A]">
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 h-14 flex items-center justify-between">
        <div className="leading-tight">
          <div className="font-heading font-semibold text-[14px]">Keystone approvals</div>
          <div className="text-[11.5px] text-[#64748B]">{me.display_name} · {me.via === 'device' ? 'linked phone' : me.role}</div>
        </div>
        <div className="flex items-center gap-1">
          <span className="relative p-2" title="Unread notifications"><Bell size={16} />
            {data.unread > 0 && <span className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] flex items-center justify-center">{data.unread}</span>}
          </span>
          <button className="p-2 cursor-pointer" onClick={load} aria-label="Refresh"><RefreshCw size={16} /></button>
          <button className="p-2 cursor-pointer text-rose-600" onClick={onSignOut} aria-label="Sign out"><LogOut size={16} /></button>
        </div>
      </header>

      <main className="p-4 flex flex-col gap-3 max-w-xl mx-auto">
        <ErrorNote error={loadError || error} />
        <p className="text-[13px] text-[#475569]">{total === 0 ? 'Nothing is waiting for you.' : `${total} waiting for your decision.`}</p>

        {data.proposals.map(p => {
          const f = flagOf(p);
          return (
            <article key={`p${p.id}`} className="paper-sheet p-4 flex flex-col gap-2 text-[13px]">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge tone="amber">Proposal #{p.id}</Badge>
                <span className="font-mono text-[12px]">{p.decision_id}</span><span className="text-[#64748B]">·</span>
                <span className="font-mono text-[12px]">{p.clause_id}</span>
              </div>
              <div className="font-semibold">{p.subject}</div>
              <div className="text-[#334155] whitespace-pre-wrap">{p.body}</div>
              {f && <div className="text-[12.5px] text-[#475569] bg-slate-50 border border-slate-200 rounded-lg p-2">
                <b>Why:</b> {f.explanation} <span className="font-mono">[{f.decision_id} · {f.clause_id}@{f.new_version}]</span>
              </div>}
              <div className="text-[12px] text-[#64748B]">To {p.to} · {when(p.created_at)}</div>
              <div className="flex gap-2">
                <Btn kind="approve" disabled={busy} className="flex-1 flex items-center justify-center gap-1" onClick={() => act(() => p1.approveProposal(p.id))}><Check size={14} /> Approve</Btn>
                <Btn kind="danger" disabled={busy} className="flex-1 flex items-center justify-center gap-1" onClick={() => act(() => p1.rejectProposal(p.id, 'rejected from phone'))}><X size={14} /> Reject</Btn>
              </div>
            </article>
          );
        })}

        {data.actions.map(a => (
          <article key={`a${a.id}`} className="paper-sheet p-4 flex flex-col gap-2 text-[13px]">
            <div className="flex items-center gap-2"><Badge tone="lavender">Agent action #{a.id}</Badge><span className="font-mono text-[12px]">{a.tool}</span>
              {a.via === 'mcp' && <Badge>via MCP</Badge>}</div>
            <div className="text-[#334155]">To <b>{a.payload.user_id || `channel ${a.payload.channel_id}`}</b>{a.payload.ref_id && <> about <span className="font-mono">{a.payload.ref_id}</span></>}</div>
            <div className="whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded-lg p-2">{a.payload.reason || a.payload.body}</div>
            <div className="flex gap-2">
              <Btn kind="approve" disabled={busy} className="flex-1 flex items-center justify-center gap-1" onClick={() => act(() => p1.approveAction(a.id))}><Check size={14} /> Approve</Btn>
              <Btn kind="danger" disabled={busy} className="flex-1 flex items-center justify-center gap-1" onClick={() => act(() => p1.rejectAction(a.id, 'rejected from phone'))}><X size={14} /> Reject</Btn>
            </div>
          </article>
        ))}
        {onDesktop && <Btn onClick={onDesktop}>Open the full workspace</Btn>}
      </main>
    </div>
  );
}
