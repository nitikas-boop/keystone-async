import React, { useState } from 'react';
import { 
  ShieldCheck, 
  CheckCircle2, 
  XCircle, 
  Edit3, 
  Terminal, 
  Lock,
  Mail,
  Clock,
  Send
} from 'lucide-react';
import { useApp } from '../context';
import { plural, polish, ts } from '../utils/format';
import { displayName } from '../utils/people';

export default function ReviewQueue({ 
  queueItems, 
  onApproveAction, 
  onRejectAction, 
  onEditAction 
}) {
  const [selectedAction, setSelectedAction] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ to: '', subject: '', body: '' });

  const { team } = useApp();
  const handleApprove = (action) => onApproveAction(action.id);

  const handleOpenEdit = (action) => {
    setSelectedAction(action);
    setEditForm({
      to: action.to || (action.parameters?.recipient || ''),
      subject: action.subject || action.proposedAction || '',
      body: action.body || action.reasoningChain || ''
    });
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (selectedAction) {
      onEditAction(selectedAction.id, {
        to: editForm.to,
        subject: editForm.subject,
        body: editForm.body
      });
      setIsEditing(false);
      setSelectedAction(null);
    }
  };

  const handleRejectPrompt = (action) => {
    const reason = prompt("Enter rejection reason (optional):", "Rejected by reviewer");
    if (reason !== null) {
      onRejectAction(action.id, reason);
    }
  };

  const pendingCount = (queueItems || []).filter(i => 
    i.status === 'proposed' || i.status === 'Pending Approval'
  ).length;

  return (
    <div className="flex flex-col h-full paper-sheet overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-white border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1 rounded-md bg-sky-50 text-[#0284C7]">
            <Lock size={14} />
          </div>
          <div>
            <div className="font-heading font-semibold text-xs tracking-tight text-[#0F172A] flex items-center gap-2">
              <span>HUMAN-IN-THE-LOOP REVIEW QUEUE</span>
            </div>
            <div className="text-[12px] text-[#64748B]">
              The scanner and MCP clients can only propose. A human approves; then the executor writes an email file to outbox/.
            </div>
          </div>
        </div>

        <div className="text-[11px] font-mono px-2.5 py-0.5 rounded-lg bg-slate-50 border border-slate-200 text-[#0F172A]">
          {plural(pendingCount, 'proposal')} awaiting a decision
        </div>
      </div>

      {/* Action Table */}
      <div className="flex-1 overflow-x-auto overflow-y-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50/70 border-b border-slate-100 font-mono text-[10.5px] text-[#64748B] uppercase tracking-wider">
              <th className="py-2.5 px-3">ID / Severity</th>
              <th className="py-2.5 px-3">Subject / Proposed Action</th>
              <th className="py-2.5 px-3">Reasoning & Body</th>
              <th className="py-2.5 px-3">Target / Recipient</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3 text-right">Human Verification</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-sans">
            {(!queueItems || queueItems.length === 0) ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-xs font-mono text-[#64748B]">
                  No proposals in the review queue. Actions will appear here when the scanner detects a policy change.
                </td>
              </tr>
            ) : (
              queueItems.map(item => {
                const isProposed = item.status === 'proposed' || item.status === 'Pending Approval';
                const isApproved = item.status === 'approved' || item.status === 'Approved';
                const isRejected = item.status === 'rejected' || item.status === 'Rejected';
                const isExecuted = item.status === 'executed';

                const subjectText = item.subject;
                const bodyText = item.body;
                const decId = item.decision_id;
                const clauseId = item.clause_id;

                return (
                  <tr 
                    key={item.id}
                    className={`hover:bg-slate-50/60 transition-colors ${
                      !isProposed ? 'opacity-75 bg-slate-50/30' : ''
                    }`}
                  >
                    {/* ID & Severity */}
                    <td className="py-3 px-3 align-top font-mono">
                      <span className="font-bold text-[#0F172A] block text-[11px]">#{item.id}</span>
                      <span className={`inline-block mt-1 text-[9.5px] px-1.5 py-0.2 rounded-md font-semibold ${
                        !isProposed ? 'badge-note-lavender' :
                        item.severity === 'action_needed' ? 'badge-note-rose' : 'badge-note-amber'
                      }`}>
                        {isProposed ? item.severity.replace('_', ' ').toUpperCase() : 'RESOLVED'}
                      </span>
                    </td>

                    {/* Proposed Action / Subject */}
                    <td className="py-3 px-3 align-top max-w-[240px]">
                      <div className="font-heading font-semibold text-[#0F172A] text-[12px] leading-snug">
                        {polish(subjectText)}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 font-mono text-[10px] text-[#64748B]">
                        <span>Source:</span>
                        <span className="text-[#0284C7] font-medium">{decId}</span>
                        <span>•</span>
                        <span className="text-[#D97706] font-medium">{clauseId}</span>
                      </div>
                      {item.created_at && (
                        <div className="text-[9.5px] font-mono text-[#94A3B8] mt-0.5">
                          {ts(item.created_at).ist}
                        </div>
                      )}
                    </td>

                    {/* Reasoning Chain / Body */}
                    <td className="py-3 px-3 align-top max-w-[320px]">
                      <p className="text-[#334155] text-[11px] leading-relaxed whitespace-pre-line line-clamp-3">
                        {polish(bodyText)}
                      </p>
                    </td>

                    {/* Target / Recipient */}
                    <td className="py-3 px-3 align-top font-mono">
                      <div className="p-1.5 rounded-md bg-slate-50 border border-slate-200 text-[10.5px] text-[#0F172A] flex items-center gap-1.5">
                        {item.to ? <Mail size={11} className="text-[#0284C7] shrink-0" /> : <Terminal size={11} className="text-[#0284C7] shrink-0" />}
                        <span className="truncate">{item.to}</span>
                      </div>
                      {item.decided_by && (
                        <div className="text-[9.5px] text-[#64748B] mt-1 font-sans">
                          Decided by: <span className="font-semibold text-[#0F172A]" title={item.decided_by}>{displayName(item.decided_by, team)}</span>
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3 align-top">
                      <span className={`inline-flex items-center gap-1 text-[10.5px] font-mono px-2 py-0.5 rounded-md ${
                        isProposed
                          ? 'badge-note-amber' 
                          : isApproved
                          ? 'badge-note-green'
                          : isExecuted
                          ? 'badge-note-lavender'
                          : 'badge-note-rose'
                      }`}>
                        {isProposed && '● Proposed'}
                        {isApproved && '✓ Approved'}
                        {isExecuted && '✓ Executed'}
                        {isRejected && '✗ Rejected'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3 align-top text-right">
                      {isProposed ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleApprove(item)}
                            className="px-2.5 py-1 rounded-md btn-sky-gradient text-white text-[11px] font-mono font-medium flex items-center gap-1 cursor-pointer shadow-xs hover:brightness-105"
                            title="Approve proposed action"
                          >
                            <CheckCircle2 size={12} />
                            <span>Approve</span>
                          </button>
                          <button
                            onClick={() => handleOpenEdit(item)}
                            className="p-1 rounded-md hover:bg-slate-100 border border-slate-200 text-[#64748B] hover:text-[#0F172A] text-[11px] cursor-pointer"
                            title="Edit Proposal Details"
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            onClick={() => handleRejectPrompt(item)}
                            className="p-1 rounded-md hover:bg-rose-50 border border-slate-200 text-[#64748B] hover:text-rose-600 text-[11px] cursor-pointer"
                            title="Reject Proposed Action"
                          >
                            <XCircle size={12} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] font-mono text-[#94A3B8]">
                          {isExecuted ? `Executed: ${item.outbox_file || '.eml in outbox'}` : isApproved ? 'Approved, awaiting executor' : 'Rejected'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Proposal Modal */}
      {isEditing && selectedAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-lg paper-sheet-elevated p-5">
            <h3 className="font-heading font-bold text-base text-[#0F172A] mb-1">
              Edit Proposal #{selectedAction.id}
            </h3>
            <p className="text-xs text-[#64748B] mb-3">
              Decision: <span className="text-[#0284C7] font-mono font-semibold">{selectedAction.decision_id || selectedAction.sourceDecisionId}</span> — Clause: <span className="text-[#D97706] font-mono font-semibold">{selectedAction.clause_id || selectedAction.sourceClauseId}</span>
            </p>

            <div className="space-y-3 mb-4">
              <div>
                <label className="text-[10px] font-mono text-[#64748B] uppercase tracking-wider block mb-1">
                  Recipient Email (to):
                </label>
                <input
                  type="email"
                  value={editForm.to}
                  onChange={(e) => setEditForm(prev => ({ ...prev, to: e.target.value }))}
                  className="w-full bg-[#F8FAFC] border border-slate-200 rounded-lg p-2 text-xs font-mono text-[#0F172A] focus:outline-none focus:border-sky-400"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono text-[#64748B] uppercase tracking-wider block mb-1">
                  Subject:
                </label>
                <input
                  type="text"
                  value={editForm.subject}
                  onChange={(e) => setEditForm(prev => ({ ...prev, subject: e.target.value }))}
                  className="w-full bg-[#F8FAFC] border border-slate-200 rounded-lg p-2 text-xs font-heading font-medium text-[#0F172A] focus:outline-none focus:border-sky-400"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono text-[#64748B] uppercase tracking-wider block mb-1">
                  Notification Body:
                </label>
                <textarea
                  value={editForm.body}
                  onChange={(e) => setEditForm(prev => ({ ...prev, body: e.target.value }))}
                  rows={5}
                  className="w-full bg-[#F8FAFC] border border-slate-200 rounded-lg p-2.5 text-xs font-sans text-[#0F172A] leading-relaxed focus:outline-none focus:border-sky-400"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-mono text-[#475569] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-1.5 rounded-lg btn-sky-gradient text-white text-xs font-mono font-medium cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
