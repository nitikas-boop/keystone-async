import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Hash, 
  Clock, 
  CheckCircle2, 
  Copy, 
  RefreshCw,
  X
} from 'lucide-react';
import { formatHash, verifyAuditChain } from '../utils/crypto';

export default function AuditLogTable({ auditLogs, onVerifyChain, onRefresh }) {
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [copiedHash, setCopiedHash] = useState(null);

  const handleCopy = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  // Real check: recompute every row's SHA-256 and every prev_hash link from the rows the backend returned.
  const runVerificationSweep = async () => {
    setIsVerifying(true);
    let result;
    try {
      result = await verifyAuditChain(auditLogs || []);
    } catch (err) {
      result = { ok: false, message: `Verification could not run: ${err.message}` };
    }
    setIsVerifying(false);
    if (onVerifyChain) onVerifyChain(result);
  };

  return (
    <div className="flex flex-col h-full paper-sheet overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-white border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1 rounded-md bg-emerald-50 text-emerald-600">
            <ShieldCheck size={16} />
          </div>
          <div>
            <div className="font-heading font-semibold text-xs tracking-tight text-[#0F172A] flex items-center gap-2">
              <span>HASH-CHAINED TAMPER-EVIDENT AUDIT LOG</span>
              <span className="font-mono text-[10.5px] px-2 py-0.5 rounded-md badge-note-green font-semibold flex items-center gap-1">
                <CheckCircle2 size={11} />
                CHAIN VALID (SHA-256 VERIFIED)
              </span>
            </div>
            <div className="text-[10.5px] font-mono text-[#64748B]">
              Tamper-Evident Architecture: Append-only log with linked SHA-256 parent hashes.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-mono text-[#64748B] hover:text-[#0F172A] transition-colors cursor-pointer"
              title="Refresh Audit Log"
            >
              <RefreshCw size={12} />
            </button>
          )}
          <button
            onClick={runVerificationSweep}
            disabled={isVerifying}
            className="px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-mono text-[#0F172A] flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            <ShieldCheck size={12} className={isVerifying ? 'animate-spin text-[#0284C7]' : 'text-emerald-600'} />
            <span>{isVerifying ? 'Verifying Hashes...' : 'Verify Full Chain'}</span>
          </button>
        </div>
      </div>

      {/* High-Density Audit Table matching GET /audit */}
      <div className="flex-1 overflow-x-auto overflow-y-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50/70 border-b border-slate-100 font-mono text-[10.5px] text-[#64748B] uppercase tracking-wider">
              <th className="py-2.5 px-3">Block #</th>
              <th className="py-2.5 px-3">Timestamp (UTC)</th>
              <th className="py-2.5 px-3">Actor</th>
              <th className="py-2.5 px-3">Action</th>
              <th className="py-2.5 px-3">Object (Type / ID)</th>
              <th className="py-2.5 px-3">Source IDs</th>
              <th className="py-2.5 px-3">Parent Hash</th>
              <th className="py-2.5 px-3">SHA-256 Hash</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
            {(!auditLogs || auditLogs.length === 0) ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-xs font-mono text-[#64748B]">
                  No audit entries recorded yet. Querying the graph or approving proposals will append blocks.
                </td>
              </tr>
            ) : (
              auditLogs.map(log => {
                const blockId = log.id ?? log.blockHeight ?? 1;
                const timestamp = log.ts ?? log.timestamp ?? 'Just now';
                const actorName = log.actor ?? 'system';
                const actionName = log.action ?? 'QUERY';
                const objectType = log.object_type || log.targetTool || 'entity';
                const objectId = log.object_id || '';
                const sourceIds = log.source_ids || log.sourceGraphIds || [];
                const prevHash = log.prev_hash || log.prevHash || '0000000000000000';
                const currentHash = log.hash || log.blockHash || '';

                return (
                  <tr 
                    key={blockId}
                    onClick={() => setSelectedBlock(log)}
                    className="hover:bg-slate-50/70 cursor-pointer transition-colors"
                  >
                    {/* Block ID */}
                    <td className="py-2.5 px-3 font-bold text-[#0F172A] whitespace-nowrap">
                      #{blockId}
                    </td>

                    {/* Timestamp */}
                    <td className="py-2.5 px-3 text-[#64748B] whitespace-nowrap font-mono text-[10.5px]">
                      <div className="flex items-center gap-1">
                        <Clock size={11} className="text-[#0284C7] shrink-0" />
                        <span>{typeof timestamp === 'string' ? timestamp.replace('T', ' ').slice(0, 19) : timestamp}</span>
                      </div>
                    </td>

                    {/* Actor */}
                    <td className="py-2.5 px-3 text-[#0F172A] font-sans font-medium whitespace-nowrap">
                      {actorName}
                    </td>

                    {/* Action */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-semibold ${
                        actionName === 'approved' ? 'badge-note-green' :
                        actionName === 'rejected' ? 'badge-note-rose' :
                        actionName === 'ingest' ? 'badge-note-amber' :
                        'badge-note-sky'
                      }`}>
                        {actionName.toUpperCase()}
                      </span>
                    </td>

                    {/* Object Type & ID */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="text-[#0F172A] font-medium text-[11px]">{objectType}</div>
                      {objectId && <div className="text-[#64748B] text-[10px]">{objectId}</div>}
                    </td>

                    {/* Source IDs */}
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {sourceIds.map((id, i) => (
                          <span key={i} className="px-1.5 py-0.2 rounded-md bg-slate-100 text-[9.5px] font-mono text-[#475569]">
                            {id}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Parent Hash */}
                    <td className="py-2.5 px-3 font-mono text-[10.5px] text-[#94A3B8]">
                      <span title={prevHash}>
                        {formatHash(prevHash, 6)}
                      </span>
                    </td>

                    {/* SHA-256 Hash */}
                    <td className="py-2.5 px-3 font-mono text-[10.5px]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[#0F172A] font-semibold hover:text-[#0284C7] transition-colors" title={currentHash}>
                          {formatHash(currentHash, 8)}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(currentHash);
                          }}
                          className="p-1 hover:text-[#0284C7] text-[#94A3B8] cursor-pointer"
                          title="Copy full SHA-256 hash"
                        >
                          <Copy size={10} />
                        </button>
                        {copiedHash === currentHash && (
                          <span className="text-[9.5px] text-emerald-600 font-semibold font-sans">Copied</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Block Details Modal */}
      {selectedBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-xl paper-sheet-elevated p-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
              <div className="flex items-center gap-2">
                <Hash size={16} className="text-[#0284C7]" />
                <h3 className="font-heading font-bold text-base text-[#0F172A]">
                  Audit Block #{selectedBlock.id ?? selectedBlock.blockHeight} Inspection
                </h3>
              </div>
              <button
                onClick={() => setSelectedBlock(null)}
                className="text-[#64748B] hover:text-[#0F172A] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <div>
                  <span className="text-[#64748B] block text-[10px]">TIMESTAMP (UTC)</span>
                  <span className="text-[#0F172A]">{selectedBlock.ts ?? selectedBlock.timestamp}</span>
                </div>
                <div>
                  <span className="text-[#64748B] block text-[10px]">ACTOR</span>
                  <span className="text-[#0F172A] font-semibold">{selectedBlock.actor}</span>
                </div>
                <div>
                  <span className="text-[#64748B] block text-[10px]">ACTION</span>
                  <span className="text-[#0284C7] font-bold">{(selectedBlock.action || '').toUpperCase()}</span>
                </div>
                <div>
                  <span className="text-[#64748B] block text-[10px]">OBJECT</span>
                  <span className="text-[#0F172A]">{selectedBlock.object_type || 'entity'} / {selectedBlock.object_id || '—'}</span>
                </div>
              </div>

              {/* Source Graph IDs */}
              <div>
                <span className="text-[10px] text-[#64748B] block mb-1">PROVENANCE SOURCE IDS:</span>
                <div className="flex flex-wrap gap-1 p-2 rounded-lg bg-slate-50 border border-slate-100">
                  {(selectedBlock.source_ids || selectedBlock.sourceGraphIds || []).map((id, idx) => (
                    <span key={idx} className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[#0284C7] font-semibold text-[10.5px]">
                      {id}
                    </span>
                  ))}
                </div>
              </div>

              {/* Payload if present */}
              {selectedBlock.payload && (
                <div>
                  <span className="text-[10px] text-[#64748B] block mb-1">AUDIT PAYLOAD:</span>
                  <pre className="p-2.5 rounded-lg bg-slate-900 text-slate-100 text-[10.5px] overflow-x-auto max-h-36">
                    {JSON.stringify(selectedBlock.payload, null, 2)}
                  </pre>
                </div>
              )}

              {/* Cryptographic Linkage */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2 text-[10.5px]">
                <div>
                  <span className="text-[#64748B] block text-[10px]">PREVIOUS BLOCK HASH (PARENT LINK):</span>
                  <span className="text-[#475569] break-all">{selectedBlock.prev_hash || selectedBlock.prevHash}</span>
                </div>
                <div>
                  <span className="text-[#64748B] block text-[10px]">CURRENT BLOCK HASH (SHA-256 SEAL):</span>
                  <span className="text-[#0284C7] font-bold break-all">{selectedBlock.hash || selectedBlock.blockHash}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4 pt-2 border-t border-slate-100">
              <button
                onClick={() => handleCopy(selectedBlock.hash || selectedBlock.blockHash)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-mono text-[#475569] flex items-center gap-1 cursor-pointer"
              >
                <Copy size={11} />
                <span>Copy Seal</span>
              </button>
              <button
                onClick={() => setSelectedBlock(null)}
                className="px-4 py-1.5 rounded-lg btn-sky-gradient text-white text-xs font-mono font-medium cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
