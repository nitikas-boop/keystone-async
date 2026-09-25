import React, { useState } from 'react';
import { 
  Upload, 
  CheckCircle2, 
  Info,
  Sparkles, 
  X
} from 'lucide-react';

export default function IngestModal({ isOpen, onClose, onPolicyUploaded }) {
  const [selectedPreset, setSelectedPreset] = useState('RET-v3');
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestStep, setIngestStep] = useState('');
  const [ingestComplete, setIngestComplete] = useState(false);
  const [conflictFound, setConflictFound] = useState(false);

  if (!isOpen) return null;

  const handleSimulateIngest = () => {
    setIsIngesting(true);
    setIngestStep("Chunking document & parsing front-matter metadata (effective_from: 2026-09-01)...");

    setTimeout(() => {
      setIngestStep("Extracting typed triples via local Qwen model: (RET-2.1 v3)-[:SUPERSEDES]->(RET-2.1 v2)...");
    }, 600);

    setTimeout(() => {
      setIngestStep("Running deterministic Staleness Scanner against active decisions (DEC-2024-001, DEC-2025-019)...");
    }, 1200);

    setTimeout(() => {
      setIsIngesting(false);
      setIngestComplete(true);
      setConflictFound(true);
      if (onPolicyUploaded) {
        onPolicyUploaded();
      }
    }, 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in">
      <div className="w-full max-w-xl paper-sheet-elevated p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#64748B] hover:text-[#0F172A] transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-sky-50 text-[#0284C7]">
            <Upload size={18} />
          </div>
          <div>
            <h3 className="font-heading font-bold text-base text-[#0F172A]">
              Ingest Document & Trigger Staleness Scanner
            </h3>
            <p className="text-xs text-[#64748B]">
              Extract entities, create bi-temporal edges, and automatically scan for policy conflicts.
            </p>
          </div>
        </div>

        {!ingestComplete ? (
          <div className="space-y-4">
            <div>
              <label className="text-[10.5px] font-mono text-[#64748B] uppercase tracking-wider block mb-1.5">
                Select Demonstration Ingestion Episode:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedPreset('RET-v3')}
                  className={`p-3 rounded-xl text-left border transition-all cursor-pointer ${
                    selectedPreset === 'RET-v3'
                      ? 'bg-sky-50/60 border-sky-300 text-[#0F172A] shadow-xs'
                      : 'bg-white border-slate-200 text-[#64748B] hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-heading font-semibold">
                    <span>Policy RET-2.1 v3</span>
                    <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded-md badge-note-sky">CORE DEMO</span>
                  </div>
                  <div className="text-[10.5px] font-mono text-[#0284C7] mt-1 font-medium">
                    90-Day Raw Log Ceiling
                  </div>
                  <div className="text-[10px] text-[#64748B] mt-0.5">
                    Triggers staleness flag on DEC-2024-001 (180d)
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedPreset('PROC-v2')}
                  className={`p-3 rounded-xl text-left border transition-all cursor-pointer ${
                    selectedPreset === 'PROC-v2'
                      ? 'bg-sky-50/60 border-sky-300 text-[#0F172A]'
                      : 'bg-white border-slate-200 text-[#64748B] hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-heading font-semibold">
                    <span>Procurement PROC-1.4 v2</span>
                  </div>
                  <div className="text-[10.5px] font-mono text-[#0284C7] mt-1 font-medium">
                    ₹2,00,000 Threshold
                  </div>
                  <div className="text-[10px] text-[#64748B] mt-0.5">
                    Requires CEO co-signature above ₹2L
                  </div>
                </button>
              </div>
            </div>

            {/* Markdown Preview with Front-matter */}
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 font-mono text-[11px]">
              <div className="text-[#64748B] mb-1">---</div>
              <div className="text-[#64748B]">doc_id: <span className="text-[#0F172A]">POL-RET-2024-v3</span></div>
              <div className="text-[#64748B]">doc_type: <span className="text-[#0F172A]">policy_version</span></div>
              <div className="text-[#64748B]">effective_from: <span className="text-[#0284C7] font-semibold">2026-09-01</span></div>
              <div className="text-[#64748B]">clause_id: <span className="text-[#0F172A]">RET-2.1 v3</span></div>
              <div className="text-[#64748B]">retention_days: <span className="text-[#0284C7] font-bold">90</span></div>
              <div className="text-[#64748B] my-1">---</div>
              <div className="text-[#334155] text-[10.5px] italic">
                # Clause RET-2.1 (v3): Customer raw telemetry logs must not be retained beyond 90 days. Mandatory deletion daemons must be recalibrated.
              </div>
            </div>

            {isIngesting ? (
              <div className="p-3 rounded-lg bg-sky-50 border border-sky-200 flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-[#0284C7] border-t-transparent rounded-full animate-spin shrink-0"></div>
                <div className="text-xs font-mono text-[#0284C7]">
                  {ingestStep}
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-100 text-xs font-mono text-[#475569] hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSimulateIngest}
                  className="px-4 py-2 rounded-lg btn-sky-gradient text-white text-xs font-mono font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles size={13} />
                  <span>Execute Ingestion & Scan</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 rounded-lg badge-note-green text-xs flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>
                Document ingested into PostgreSQL chunk index and FalkorDB graph. 1 clause node and 2 edges registered.
              </span>
            </div>

            {/* Calm, Non-Alarmist Contradiction Highlight */}
            {conflictFound && (
              <div className="p-3.5 rounded-lg badge-note-rose text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold font-mono text-[11.5px]">
                  <Info size={15} />
                  <span>Staleness Scanner Flag Detected</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  New policy clause <span className="font-mono font-semibold">RET-2.1 v3</span> (limit: 90 days) supersedes previous rule and identifies that past decision <span className="font-mono font-semibold">DEC-2024-001</span> and purge cron <span className="font-mono font-semibold">DEC-2025-019</span> are retaining logs for 180 days.
                </p>
                <div className="text-[10.5px] font-mono bg-white/80 p-2 rounded-md border border-rose-200 text-[#991B1B]">
                  A remediation proposal has been placed in the <strong>Human-in-the-Loop Review Queue</strong> for verification.
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg btn-sky-gradient text-white text-xs font-mono font-medium cursor-pointer"
              >
                Close & View Updated Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
