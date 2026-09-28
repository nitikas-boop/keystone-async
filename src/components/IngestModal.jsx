import React, { useState, useRef } from 'react';
import { 
  Upload, 
  CheckCircle2, 
  AlertTriangle,
  Info,
  Sparkles, 
  X,
  FileCode,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { uploadDocument, transcribe } from '../api';
import retV3 from '../../data/demo-upload/POL-RET-v3.md?raw';
import procV2 from '../../data/vault/policies/POL-PROC-v2.md?raw';

// Presets are the real files, imported verbatim, so the demo uploads exactly what is committed in data/.
const PRESET_FILES = {
  'RET-v3': {
    filename: 'POL-RET-v3.md',
    title: 'Customer Data Retention Policy (v3 - 90 Days)',
    desc: 'Sets RET-2.1 to 90-day ceiling (breaks DEC-007 180-day practice)',
    impactExpected: 'ONGOING_PRACTICE_BREACH on DEC-007',
    content: retV3
  },
  'PROC-v2': {
    filename: 'POL-PROC-v2.md',
    title: 'Procurement Approval Policy (v2 - ₹2 Lakh Ceiling)',
    desc: 'Reduces CTO unilateral threshold from ₹5L to ₹2L',
    impactExpected: 'RULE_CHANGED_SINCE on DEC-004',
    content: procV2
  }
};

export default function IngestModal({ isOpen, onClose, onPolicyUploaded, onProceedToQueue }) {
  const [selectedPreset, setSelectedPreset] = useState('RET-v3');
  const [customFile, setCustomFile] = useState(null);
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestStep, setIngestStep] = useState('');
  const [ingestComplete, setIngestComplete] = useState(false);
  const [returnedFlags, setReturnedFlags] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('audio/') && !/\.(wav|mp3|m4a|webm|ogg)$/i.test(file.name)) {
      setCustomFile(file);
      return;
    }
    // Meeting audio: transcribe locally, then upload the transcript as an ordinary meeting_note document.
    // Meeting date comes from the filename (meeting-YYYY-MM-DD.wav), else today.
    const meetingDate = file.name.match(/\d{4}-\d{2}-\d{2}/)?.[0] || new Date().toISOString().slice(0, 10);
    setErrorMsg(null);
    setIsIngesting(true);
    setIngestStep(`Transcribing ${file.name} locally (Whisper, no network)...`);
    try {
      const { markdown } = await transcribe(file, file.name, meetingDate, `Meeting ${meetingDate} (audio)`);
      setTranscript(markdown);
      setCustomFile(new File([markdown], `MTG-${meetingDate}-AUDIO.md`, { type: 'text/markdown' }));
    } catch (err) {
      setErrorMsg(`Transcription failed: ${err.message}`);
    } finally {
      setIsIngesting(false);
      setIngestStep('');
    }
  };

  const handleUpload = async () => {
    setIsIngesting(true);
    setErrorMsg(null);
    setIngestStep("Preparing multipart document payload...");

    let fileToUpload;
    if (customFile) {
      fileToUpload = customFile;
    } else {
      const preset = PRESET_FILES[selectedPreset];
      fileToUpload = new File([preset.content], preset.filename, { type: 'text/markdown' });
    }

    try {
      setIngestStep(`Uploading ${fileToUpload.name} to POST /documents...`);
      const res = await uploadDocument(fileToUpload);

      setIngestStep("Parsing front-matter & extracting structured clauses...");
      const flags = res.flags || [];
      setReturnedFlags(flags);
      setIngestComplete(true);

      if (onPolicyUploaded) {
        onPolicyUploaded(res);
      }
    } catch (err) {
      // Never simulate a scanner result: a failed upload must look failed.
      setErrorMsg(err.message);
    } finally {
      setIsIngesting(false);
      setIngestStep('');
    }
  };

  const handleResetAndClose = () => {
    setIngestComplete(false);
    setReturnedFlags([]);
    setCustomFile(null);
    setTranscript(null);
    setErrorMsg(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in">
      <div className="w-full max-w-xl paper-sheet-elevated p-6 relative">
        <button
          onClick={handleResetAndClose}
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
              Ingest Document & Trigger Policy Impact Scanner
            </h3>
            <p className="text-xs text-[#64748B]">
              Upload markdown policy version or decision document to <code className="text-[11px] font-mono bg-slate-100 px-1 py-0.5 rounded">POST /documents</code>.
            </p>
          </div>
        </div>

        {!ingestComplete ? (
          <div className="space-y-4">
            <div>
              <label className="text-[10.5px] font-mono text-[#64748B] uppercase tracking-wider block mb-1.5">
                Select Demo Policy Version or Upload Local File:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setSelectedPreset('RET-v3'); setCustomFile(null); }}
                  className={`p-3 rounded-xl text-left border transition-all cursor-pointer ${
                    selectedPreset === 'RET-v3' && !customFile
                      ? 'bg-sky-50/70 border-sky-300 text-[#0F172A] shadow-xs'
                      : 'bg-white border-slate-200 text-[#64748B] hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-heading font-semibold">
                    <span>Policy RET-2.1 v3</span>
                    <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded-md badge-note-rose">DEMO HERO</span>
                  </div>
                  <div className="text-[10.5px] font-mono text-[#0284C7] mt-1 font-medium">
                    90-Day Raw Log Ceiling
                  </div>
                  <div className="text-[10px] text-[#64748B] mt-0.5">
                    Triggers ONGOING_PRACTICE_BREACH on DEC-007
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => { setSelectedPreset('PROC-v2'); setCustomFile(null); }}
                  className={`p-3 rounded-xl text-left border transition-all cursor-pointer ${
                    selectedPreset === 'PROC-v2' && !customFile
                      ? 'bg-sky-50/70 border-sky-300 text-[#0F172A] shadow-xs'
                      : 'bg-white border-slate-200 text-[#64748B] hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-heading font-semibold">
                    <span>Procurement PROC-3.1 v2</span>
                  </div>
                  <div className="text-[10.5px] font-mono text-[#0284C7] mt-1 font-medium">
                    ₹2,00,000 CTO Ceiling
                  </div>
                  <div className="text-[10px] text-[#64748B] mt-0.5">
                    Triggers RULE_CHANGED_SINCE on DEC-004
                  </div>
                </button>
              </div>
            </div>

            {/* Custom File Upload Option */}
            <div className="pt-1">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".md,.txt,.json,.wav,.mp3,.m4a,.webm,.ogg,audio/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`w-full p-2.5 rounded-lg border border-dashed text-center text-xs font-mono transition-colors cursor-pointer ${
                  customFile 
                    ? 'border-sky-400 bg-sky-50/50 text-[#0284C7]' 
                    : 'border-slate-300 hover:border-slate-400 text-[#64748B]'
                }`}
              >
                {customFile ? `Selected custom file: ${customFile.name}` : '+ Or browse a Markdown document, or meeting audio (transcribed locally)...'}
              </button>
            </div>

            {/* Markdown Preview with Front-matter */}
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 font-mono text-[11px]">
              <pre className="text-[#334155] whitespace-pre-wrap max-h-36 overflow-y-auto leading-relaxed">
                {transcript && customFile ? transcript.trim() : customFile ? `[Custom file ready for upload: ${customFile.name}]` : PRESET_FILES[selectedPreset].content.trim()}
              </pre>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2 text-xs text-rose-900">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Upload failed. Nothing was ingested and the scanner did not run.</div>
                  <div className="font-mono text-[11px] mt-0.5 break-all">{errorMsg}</div>
                </div>
              </div>
            )}

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
                  onClick={handleResetAndClose}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-100 text-xs font-mono text-[#475569] hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  className="px-4 py-2 rounded-lg btn-sky-gradient text-white text-xs font-mono font-medium flex items-center gap-1.5 cursor-pointer shadow-xs hover:brightness-105"
                >
                  <Sparkles size={13} />
                  <span>Upload & Run Scanner</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Scanner Output State */
          <div className="space-y-4 animate-fade-in">
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-heading font-semibold text-xs text-emerald-950">
                  Ingestion Successful & Impact Scanner Executed
                </h4>
                <p className="text-[11px] text-emerald-800 font-mono mt-0.5">
                  Document ingested into PostgreSQL + Neo4j with valid-time metadata.
                </p>
              </div>
            </div>

            {/* Scanner Flags Returned */}
            <div>
              <div className="flex items-center gap-2 mb-2 font-mono text-xs font-semibold text-[#0F172A]">
                <ShieldAlert size={14} className="text-rose-600" />
                <span>Impact Scanner Findings ({returnedFlags.length} Flag{returnedFlags.length === 1 ? '' : 's'} Raised):</span>
              </div>

              {returnedFlags.length === 0 ? (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono text-[#64748B]">
                  No retroactive conflicts detected against existing decisions.
                </div>
              ) : (
                <div className="space-y-2">
                  {returnedFlags.map((flag, idx) => (
                    <div 
                      key={idx}
                      className="p-3 rounded-lg border bg-rose-50/60 border-rose-200 text-rose-950 font-mono text-xs"
                    >
                      <div className="flex items-center justify-between font-bold mb-1">
                        <span className="px-2 py-0.5 rounded badge-note-rose text-[10.5px]">
                          {flag.impact_type}
                        </span>
                        <span className="text-[#0284C7] text-[11px]">
                          Target: {flag.decision_id}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-700 font-sans mt-1">
                        Flag <span className="font-mono">{flag.id}</span> recorded in the graph and the audit log.
                      </p>
                      <div className="mt-2 text-[10px] text-slate-500 font-mono flex items-center gap-1">
                        <ArrowRight size={10} className="text-[#0284C7]" />
                        <span>{flag.proposal_id
                          ? `Proposal #${flag.proposal_id} queued for human review.`
                          : 'Historical record only: no action proposed.'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => { handleResetAndClose(); onProceedToQueue(); }}
                className="px-4 py-2 rounded-lg btn-sky-gradient text-white text-xs font-mono font-medium cursor-pointer"
              >
                Proceed to Review Queue →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
