import React, { useEffect, useState } from 'react';
import { Lock, Send } from 'lucide-react';
import * as p1 from '../../api/p1';

// B, jurisdiction: what an employee sees when something is outside their assigned scope. The backend decides and
// audits (ACCESS_DENIED_ATTEMPT); these only show who to ask and send the request as a 1:1 message.

export function ContactLead({ person, what }) {
  const [state, setState] = useState(null);  // null | 'sending' | 'sent' | Error
  if (!person) return null;
  const send = () => { setState('sending'); p1.requestAccess(person.user_id, what).then(() => setState('sent'), setState); };
  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={send} disabled={state === 'sending' || state === 'sent'}
        className="self-start inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white border border-pink-300 text-[12.5px] font-medium text-[#9D174D] hover:bg-pink-50 cursor-pointer disabled:opacity-60 disabled:cursor-default">
        <Send size={13} aria-hidden="true" />
        {state === 'sent' ? `Request sent to ${person.name}` : `Contact Lead: ${person.name} (${person.designation})`}
      </button>
      {state === 'sent' && <span className="text-[11.5px] text-[#9D174D]">Sent as a direct message: it is in their bell and in Chat.</span>}
      {state instanceof Error && <span className="text-[11.5px] text-rose-700">Could not send: {state.message}</span>}
    </div>
  );
}

function Callout({ title, children }) {
  return (
    <div className="note-pink rounded-xl p-3.5 flex flex-col gap-2 text-[13px]" role="note">
      <div className="flex items-center gap-2 font-semibold text-[#831843]"><Lock size={15} aria-hidden="true" /> {title}</div>
      {children}
    </div>
  );
}

// Chat: the /ask jurisdiction refusal (res.restricted = {message, contact, department_head}).
export function RestrictedAnswer({ res, actions }) {
  const r = res.restricted;
  return (
    <div className="max-w-[92%]" data-refusal="restricted">
      <Callout title="Access restricted">
        <p className="text-[#500724] leading-relaxed">{r.message}</p>
        <div className="flex flex-wrap gap-2">
          <ContactLead person={r.contact} what={`"${res.question}"`} />
          {r.department_head && <ContactLead person={r.department_head} what={`"${res.question}"`} />}
        </div>
        {actions}
      </Callout>
    </div>
  );
}

// One request per opening: React StrictMode runs effects twice in development, which would audit the attempt twice.
const checking = new Map();
function checkNode(id) {
  if (!checking.has(id)) {
    checking.set(id, p1.nodeAccess(id));
    setTimeout(() => checking.delete(id), 2000);
  }
  return checking.get(id);
}

// Graph: the drawer for a locked node. Opening it is the access attempt (GET /nodes/{id}/source answers 403).
export function JurisdictionDrawer({ nodeId, onClose }) {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    let live = true;
    setInfo(null);
    checkNode(nodeId).then(
      () => live && setInfo({ open: true }),  // access was granted meanwhile
      (e) => live && setInfo(e.status === 403 && e.detail?.restricted ? e.detail : { error: e }));
    return () => { live = false; };
  }, [nodeId]);
  return (
    <div className="p-4 slide-in-right" aria-live="polite">
      <div className="flex justify-end mb-2">
        <button className="icon-btn" onClick={onClose} aria-label="Close" title="Close (Esc)">×</button>
      </div>
      {!info && <p className="text-[12.5px] text-[#64748B]">Checking your clearance…</p>}
      {info?.open && <p className="text-[12.5px] text-[#166534]">You now have access to {nodeId}. Refresh the graph to see it.</p>}
      {info?.error && <p className="text-[12.5px] text-rose-700">{info.error.message}</p>}
      {info?.restricted && (
        <Callout title="Jurisdiction Restricted">
          <p className="text-[#500724]">You do not have active clearance for node <span className="font-mono font-semibold">{nodeId}</span>.</p>
          <p className="text-[12.5px] text-[#831843] leading-relaxed">{info.message.replace(/^You do not have active clearance for node \S+\.\s*/, '')}</p>
          <ContactLead person={info.contact} what={nodeId} />
          {info.department_head && <ContactLead person={info.department_head} what={nodeId} />}
          <p className="text-[11.5px] text-[#9D174D]">This attempt is recorded in the audit trail.</p>
        </Callout>
      )}
    </div>
  );
}

// Header: the signed-in name doubles as the demo role picker (one click to another demo account) while the demo
// sign-in is enabled; otherwise it is just the name.
export function DemoSwitcher({ me, fallback }) {
  const [accounts, setAccounts] = useState([]);
  useEffect(() => { p1.demoAccounts().then(setAccounts, () => setAccounts([])); }, []);
  if (!accounts.some(a => a.employee_id === me?.employee_id)) return fallback;
  const switchTo = (emp) => p1.demoLogin(emp).then(() => window.location.reload());
  return (
    <select value={me.employee_id} onChange={(e) => switchTo(e.target.value)} aria-label="Switch user (demo accounts)"
      title="Switch user: sign in as another demo account to see what that role sees"
      className="max-w-40 bg-transparent text-right font-semibold text-[13px] text-[#0F172A] cursor-pointer hover:text-[#0284C7] focus:outline-none">
      {accounts.map(a => <option key={a.employee_id} value={a.employee_id}>{a.display_name} ({a.designation})</option>)}
    </select>
  );
}
