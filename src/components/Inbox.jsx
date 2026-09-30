import React from 'react';
import { FileSearch, Inbox as InboxIcon, ListChecks } from 'lucide-react';

// Everything waiting for a person, in one place: proposals from the impact scanner (or an MCP client) and facts the
// model extracted from meeting notes. The two lists are the existing Review Queue and Ingestion Review screens.
export default function Inbox({ tab, onTab, pendingProposals, pendingFacts, proposals, facts }) {
  const TABS = [
    { id: 'proposals', label: 'Proposed actions', hint: 'approve, edit or reject what Keystone wants to send', Icon: ListChecks, n: pendingProposals },
    { id: 'facts', label: 'Extracted facts', hint: 'accept, edit or reject what the model read from meeting notes', Icon: FileSearch, n: pendingFacts },
  ];
  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-heading font-semibold text-sm text-[#0F172A] flex items-center gap-2">
          <InboxIcon size={15} className="text-[#0284C7]" aria-hidden="true" /> Inbox
        </h2>
        <div className="flex gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200" role="tablist" aria-label="Inbox">
          {TABS.map(({ id, label, hint, Icon, n }) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => onTab(id)} title={`${label}: ${hint}`}
              className={`h-8 px-3 rounded-lg flex items-center gap-1.5 text-[13px] cursor-pointer ${tab === id ? 'bg-white font-semibold shadow-xs' : 'text-[#475569] hover:text-[#0F172A]'}`}>
              <Icon size={14} className={tab === id ? 'text-[#0284C7]' : ''} aria-hidden="true" /> {label}
              <span className={`min-w-5 h-5 px-1 rounded-full text-[11.5px] font-bold flex items-center justify-center ${n ? 'bg-[#0284C7] text-white' : 'bg-slate-200 text-[#475569]'}`}>{n}</span>
            </button>
          ))}
        </div>
        <span className="text-[12.5px] text-[#64748B]">{pendingProposals + pendingFacts === 0 ? 'Nothing is waiting for you.' : `${pendingProposals + pendingFacts} waiting for a person.`}</span>
      </div>
      <div className="flex-1 min-h-0">{tab === 'proposals' ? proposals : facts}</div>
    </div>
  );
}
