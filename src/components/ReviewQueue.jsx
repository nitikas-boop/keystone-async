import React, { useState } from 'react';
import { 
  ShieldCheck, 
  CheckCircle2, 
  XCircle, 
  Edit3, 
  Terminal, 
  Lock
} from 'lucide-react';
import confetti from 'canvas-confetti';

export default function ReviewQueue({ 
  queueItems, 
  onApproveAction, 
  onRejectAction, 
  onEditAction 
}) {
  const [selectedAction, setSelectedAction] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editParams, setEditParams] = useState('');

  const triggerConfetti = () => {
    confetti({
      particleCount: 40,
      spread: 60,
      origin: { y: 0.8 },
      colors: ['#0284C7', '#38BDF8', '#F59E0B', '#10B981']
    });
  };

  const handleApprove = (action) => {
    triggerConfetti();
    onApproveAction(action.id);
  };

  const handleOpenEdit = (action) => {
    setSelectedAction(action);
    setEditParams(JSON.stringify(action.parameters, null, 2));
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    try {
      const parsed = JSON.parse(editParams);
      onEditAction(selectedAction.id, parsed);
      setIsEditing(false);
      setSelectedAction(null);
    } catch (err) {
      alert("Invalid JSON format in parameters");
    }
  };

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
              <span className="font-mono text-[10px] px-2 py-0.5 rounded-md badge-note-sky font-semibold">
                STAGE 5: CONTROLLED MCP EXECUTION
              </span>
            </div>
            <div className="text-[10.5px] font-mono text-[#64748B]">
              Structural Enactment: Models propose actions; humans verify; executor calls tools.
            </div>
          </div>
        </div>

        <div className="text-[11px] font-mono px-2.5 py-0.5 rounded-lg bg-slate-50 border border-slate-200 text-[#0F172A]">
          {queueItems.filter(i => i.status === 'Pending Approval').length} Actions Pending Sign-off
        </div>
      </div>

      {/* Action Table */}
      <div className="flex-1 overflow-x-auto overflow-y-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50/70 border-b border-slate-100 font-mono text-[10.5px] text-[#64748B] uppercase tracking-wider">
              <th className="py-2.5 px-3">ID / Priority</th>
              <th className="py-2.5 px-3">Proposed Action</th>
              <th className="py-2.5 px-3">Reasoning Chain & Trigger</th>
              <th className="py-2.5 px-3">Target MCP Tool</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3 text-right">Human Verification</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-sans">
            {queueItems.map(item => {
              const isPending = item.status === 'Pending Approval';

              return (
                <tr 
                  key={item.id}
                  className={`hover:bg-slate-50/60 transition-colors ${
                    !isPending ? 'opacity-70 bg-slate-50/30' : ''
                  }`}
                >
                  {/* ID & Priority */}
                  <td className="py-3 px-3 align-top font-mono">
                    <span className="font-bold text-[#0F172A] block text-[11px]">{item.id}</span>
                    <span className={`inline-block mt-1 text-[9.5px] px-1.5 py-0.2 rounded-md font-semibold ${
                      item.severity === 'CRITICAL' ? 'badge-note-rose' :
                      item.severity === 'HIGH' ? 'badge-note-amber' :
                      'badge-note-lavender'
                    }`}>
                      {item.severity}
                    </span>
                  </td>

                  {/* Proposed Action */}
                  <td className="py-3 px-3 align-top max-w-[240px]">
                    <div className="font-heading font-semibold text-[#0F172A] text-[12px] leading-snug">
                      {item.proposedAction}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 font-mono text-[10px] text-[#64748B]">
                      <span>Source:</span>
                      <span className="text-[#0284C7]">{item.sourceDecisionId}</span>
                      <span>•</span>
                      <span className="text-[#D97706]">{item.sourceClauseId}</span>
                    </div>
                  </td>

                  {/* Reasoning Chain */}
                  <td className="py-3 px-3 align-top max-w-[320px]">
                    <p className="text-[#334155] text-[11px] leading-relaxed">
                      {item.reasoningChain}
                    </p>
                    {item.parameters && (
                      <div className="mt-1.5 p-1.5 rounded-md bg-slate-50 border border-slate-100 font-mono text-[10px] text-[#64748B]">
                        <span className="text-[#0284C7] font-semibold">Payload: </span>
                        {JSON.stringify(item.parameters)}
                      </div>
                    )}
                  </td>

                  {/* Target MCP Tool */}
                  <td className="py-3 px-3 align-top font-mono">
                    <div className="p-1.5 rounded-md bg-slate-50 border border-slate-200 text-[10.5px] text-[#0F172A] flex items-center gap-1.5">
                      <Terminal size={11} className="text-[#0284C7]" />
                      <span className="truncate">{item.targetMcpTool}</span>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="py-3 px-3 align-top">
                    <span className={`inline-flex items-center gap-1 text-[10.5px] font-mono px-2 py-0.5 rounded-md ${
                      isPending 
                        ? 'badge-note-amber' 
                        : item.status === 'Approved'
                        ? 'badge-note-green'
                        : 'badge-note-rose'
                    }`}>
                      {isPending ? 'Pending Sign-off' : item.status === 'Approved' ? '✓ Executed & Logged' : '✗ Rejected'}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="py-3 px-3 align-top text-right">
                    {isPending ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleApprove(item)}
                          className="px-2.5 py-1 rounded-md btn-sky-gradient text-white text-[11px] font-mono font-medium flex items-center gap-1 cursor-pointer"
                          title="Execute via MCP executor process and write to hash-chained audit log"
                        >
                          <CheckCircle2 size={12} />
                          <span>Approve</span>
                        </button>
                        <button
                          onClick={() => handleOpenEdit(item)}
                          className="p-1 rounded-md hover:bg-slate-100 border border-slate-200 text-[#64748B] hover:text-[#0F172A] text-[11px] cursor-pointer"
                          title="Edit Payload Parameters"
                        >
                          <Edit3 size={12} />
                        </button>
                        <button
                          onClick={() => onRejectAction(item.id)}
                          className="p-1 rounded-md hover:bg-rose-50 border border-slate-200 text-[#64748B] hover:text-rose-600 text-[11px] cursor-pointer"
                          title="Reject Proposed Action"
                        >
                          <XCircle size={12} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] font-mono text-[#94A3B8]">
                        Archived in Block #{item.archivedBlock || 105}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Edit Parameters Modal */}
      {isEditing && selectedAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg paper-sheet-elevated p-5">
            <h3 className="font-heading font-bold text-base text-[#0F172A] mb-1">
              Edit MCP Tool Call Payload
            </h3>
            <p className="text-xs text-[#64748B] mb-3">
              Action: <span className="text-[#0284C7] font-mono font-semibold">{selectedAction.id}</span> — {selectedAction.proposedAction}
            </p>

            <div className="mb-4">
              <label className="text-[10px] font-mono text-[#64748B] uppercase tracking-wider block mb-1">
                JSON Parameters for {selectedAction.targetMcpTool}:
              </label>
              <textarea
                value={editParams}
                onChange={(e) => setEditParams(e.target.value)}
                rows={6}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-lg p-2.5 text-xs font-mono text-[#0F172A] focus:outline-none focus:border-sky-400"
              />
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
                Save & Stage
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
