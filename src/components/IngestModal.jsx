import React, { useEffect, useRef, useState } from 'react';
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  ShieldAlert,
  ArrowRight,
  Square
} from 'lucide-react';
import { fetchDecisions, fetchPolicies, transcribe, uploadDocument } from '../api';
import IdChip from './IdChip';
import { impactLabel } from '../utils/entities';
import { day, plural } from '../utils/format';
import retV3 from '../../data/demo-upload/POL-RET-v3.md?raw';
import procV2 from '../../data/vault/policies/POL-PROC-v2.md?raw';

// Presets are the real files, imported verbatim, so the demo uploads exactly what is committed in data/.
const PRESET_FILES = {
  'RET-v3': { filename: 'POL-RET-v3.md', label: 'Policy RET-2.1 v3', content: retV3 },
  'PROC-v2': { filename: 'POL-PROC-v2.md', label: 'Procurement PROC-3.1 v2', content: procV2 },
};

// Minimal front-matter read (flat keys only), to know which record a file would create before uploading it.
function frontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text || '');
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return fm;
}

function docIdOf(fm) {
  if (!fm) return null;
  if (fm.doc_type === 'policy_version') return fm.policy_id && fm.version ? `${fm.policy_id}@${fm.version}` : null;
  if (fm.doc_type === 'decision') return fm.decision_id || null;
  if (fm.doc_type === 'meeting_note') return fm.doc_id || null;
  return null;
}

// The server answers 0 (unreachable), 422 (the document itself is wrong) or 503 (local model down).
function explain(err, stage) {
  const d = typeof err.detail === 'string' ? err.detail : err.message;
  if (err.status === 0) return { title: 'Backend unreachable', text: `${d}. Is the Docker stack running?` };
  if (err.status === 503) return { title: 'Local model unreachable (Ollama)', text: d };
  if (stage === 'transcribe') return { title: 'Transcription failed (local Whisper)', text: d };
  if (err.status === 422) return { title: 'The document was rejected: check its front-matter', text: d };
  return { title: `Upload failed (HTTP ${err.status})`, text: d };
}

export default function IngestModal({ isOpen, onClose, onPolicyUploaded, onProceedToQueue, onAuthor }) {
  const [selectedPreset, setSelectedPreset] = useState('RET-v3');
  const [customFile, setCustomFile] = useState(null);
  const [customText, setCustomText] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [stages, setStages] = useState([]);   // [{key, label, state: running|done|failed, note, startedAt, endedAt}]
  const [result, setResult] = useState(null);
  const [failure, setFailure] = useState(null);
  const [cancelled, setCancelled] = useState(false);
  const [known, setKnown] = useState({ policies: [], decisions: [] });
  const [confirmDup, setConfirmDup] = useState(false);
  const [batch, setBatch] = useState(null);   // several Markdown files: [{file, text, fm, id, state, res, error}]
  const [dragOver, setDragOver] = useState(false);
  const [, tick] = useState(0);
  const abortRef = useRef(null);
  const fileInputRef = useRef(null);
  const running = stages.some(s => s.state === 'running');

  // What is already ingested, so presets and custom files can say "already in the record" before upload.
  useEffect(() => {
    if (!isOpen) return;
    Promise.all([fetchPolicies(), fetchDecisions()])
      .then(([p, d]) => setKnown({ policies: p.flatMap(x => x.versions), decisions: d.map(x => x.id) }))
      .catch(() => {});
  }, [isOpen]);

  useEffect(() => {  // elapsed-time display while a stage runs
    if (!running) return undefined;
    const t = setInterval(() => tick(n => n + 1), 500);
    return () => clearInterval(t);
  }, [running]);

  if (!isOpen) return null;

  const content = customFile ? customText : PRESET_FILES[selectedPreset].content;
  const fm = frontMatter(content);
  const docId = docIdOf(fm);
  const existingVersion = fm?.doc_type === 'policy_version' && known.policies.find(v => v.document_id === docId);
  const duplicate = !!(existingVersion || (fm?.doc_type === 'decision' && known.decisions.includes(docId)));

  const presetInfo = (key) => {
    const f = frontMatter(PRESET_FILES[key].content);
    const id = docIdOf(f);
    const have = known.policies.find(v => v.document_id === id);
    const prev = known.policies.filter(v => v.policy_id === f.policy_id && v.valid_from < f.effective_from)
      .sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0];
    return { id, have, prev, effective: f.effective_from };
  };

  const setStage = (key, patch) => setStages(ss => ss.map(s => (s.key === key ? { ...s, ...patch } : s)));
  const reset = () => { setStages([]); setResult(null); setFailure(null); setCancelled(false); setConfirmDup(false); };

  // Several files: policies first (so decisions can rely on their clauses), then decisions, then meeting notes.
  const ORDER = { policy_version: 0, decision: 1, meeting_note: 2 };
  const startBatch = async (files) => {
    const items = await Promise.all(files.map(async (file) => {
      const text = await file.text();
      const fm = frontMatter(text);
      return { file, text, fm, id: docIdOf(fm), state: fm ? 'waiting' : 'invalid' };
    }));
    items.sort((a, b) => (ORDER[a.fm?.doc_type] ?? 3) - (ORDER[b.fm?.doc_type] ?? 3));
    reset(); setCustomFile(null); setCustomText(null); setTranscript(null);
    setBatch(items);
  };

  // A file whose ID is already ingested waits for an explicit tick (known loads after the dialog opens).
  const isKnown = (id) => known.decisions.includes(id) || known.policies.some(v => v.document_id === id);
  const shownBatch = batch?.map(x => (x.state === 'waiting' && isKnown(x.id) && !x.confirmed ? { ...x, state: 'exists' } : x));

  const runBatch = async () => {
    for (let i = 0; i < shownBatch.length; i++) {
      if (shownBatch[i].state !== 'waiting') continue;
      setBatch(b => b.map((x, j) => (j === i ? { ...x, state: 'running' } : x)));
      try {
        const res = await uploadDocument(batch[i].file);
        setBatch(b => b.map((x, j) => (j === i ? { ...x, state: 'done', res } : x)));
        if (onPolicyUploaded) onPolicyUploaded(res);
      } catch (err) {
        setBatch(b => b.map((x, j) => (j === i ? { ...x, state: 'failed', error: explain(err, 'upload') } : x)));
      }
    }
  };

  const takeFiles = (list) => {
    const files = [...(list || [])];
    if (files.length > 1) {
      const audio = files.filter(f => f.type.startsWith('audio/') || /\.(wav|mp3|m4a|webm|ogg)$/i.test(f.name));
      if (audio.length) { setFailure({ title: 'Audio goes one file at a time', text: 'Drop a single recording to transcribe it; several files must all be Markdown.' }); return; }
      startBatch(files);
      return;
    }
    if (files[0]) handleFile(files[0]);
  };

  const handleFileChange = (e) => {
    const list = e.target.files;
    takeFiles(list);
    e.target.value = '';
  };

  const handleFile = async (file) => {
    setBatch(null);
    reset();
    setTranscript(null);
    if (!file.type.startsWith('audio/') && !/\.(wav|mp3|m4a|webm|ogg)$/i.test(file.name)) {
      setCustomFile(file);
      setCustomText(await file.text());
      return;
    }
    // Meeting audio: transcribe locally, then upload the transcript as an ordinary meeting_note document.
    // Meeting date comes from the filename (meeting-YYYY-MM-DD.wav), else today.
    const meetingDate = file.name.match(/\d{4}-\d{2}-\d{2}/)?.[0] || new Date().toISOString().slice(0, 10);
    const ctl = new AbortController();
    abortRef.current = ctl;
    setCustomFile(null);
    setStages([{ key: 'transcribe', label: `Transcribe ${file.name} locally (Whisper)`, state: 'running', startedAt: Date.now() }]);
    try {
      const { markdown } = await transcribe(file, file.name, meetingDate, `Meeting ${meetingDate} (audio)`, ctl.signal);
      setTranscript(markdown);
      setCustomFile(new File([markdown], `MTG-${meetingDate}-AUDIO.md`, { type: 'text/markdown' }));
      setCustomText(markdown);
      setStage('transcribe', { state: 'done', endedAt: Date.now(), note: 'Transcript ready below. Read it, then upload.' });
    } catch (err) {
      if (err.name === 'AbortError') { setStage('transcribe', { state: 'failed', endedAt: Date.now(), note: 'Cancelled.' }); return; }
      setStage('transcribe', { state: 'failed', endedAt: Date.now() });
      setFailure(explain(err, 'transcribe'));
    }
  };

  const handleUpload = async () => {
    const file = customFile || new File([PRESET_FILES[selectedPreset].content], PRESET_FILES[selectedPreset].filename, { type: 'text/markdown' });
    const ctl = new AbortController();
    abortRef.current = ctl;
    setFailure(null);
    setCancelled(false);
    const keep = stages.filter(s => s.key === 'transcribe' && s.state === 'done');
    // One request does parse -> store -> extract (meeting notes) / scan (policies) on the server; the UI does not
    // pretend to see inside it. Its results are listed stage by stage once the response arrives.
    setStages([...keep, { key: 'server', label: `Upload ${file.name}: the server parses, stores, extracts and scans in one request`,
                          state: 'running', startedAt: Date.now() }]);
    try {
      const res = await uploadDocument(file, ctl.signal);
      setStage('server', { state: 'done', endedAt: Date.now() });
      setResult(res);
      if (onPolicyUploaded) onPolicyUploaded(res);
    } catch (err) {
      if (err.name === 'AbortError') {
        setStage('server', { state: 'failed', endedAt: Date.now(), note: 'Stopped waiting.' });
        setCancelled(true);
        return;
      }
      setStage('server', { state: 'failed', endedAt: Date.now() });
      setFailure(explain(err, 'upload'));
    }
  };

  const clearAll = () => { reset(); setCustomFile(null); setCustomText(null); setTranscript(null); setBatch(null); };
  const handleResetAndClose = () => {
    if (running) abortRef.current?.abort();
    clearAll();
    onClose();
  };

  const flags = result?.flags || [];
  const isPolicy = result?.doc_type === 'policy_version';
  const isMeeting = result?.doc_type === 'meeting_note';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" role="dialog" aria-modal="true" aria-labelledby="ingest-title">
      <div className="w-full max-w-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto paper-sheet-elevated p-5 relative text-[13px]">
        <button onClick={handleResetAndClose} className="absolute top-4 right-4 icon-btn" aria-label="Close" title="Close">
          <X size={16} />
        </button>

        <div className="flex items-center gap-3 mb-4 pr-10">
          <div className="p-2 rounded-lg bg-sky-50 text-[#0284C7]"><Upload size={18} aria-hidden="true" /></div>
          <div>
            <h3 id="ingest-title" className="font-heading font-bold text-[15px] text-[#0F172A]">Ingest a document</h3>
            <p className="text-[12.5px] text-[#475569]">
              A policy version, decision or meeting note in Markdown with YAML front-matter, or meeting audio (transcribed on this machine).
            </p>
          </div>
        </div>

        {batch ? (
          <BatchList batch={shownBatch} setBatch={setBatch} onRun={runBatch} onClear={clearAll} onClose={handleResetAndClose}
            onInbox={(view) => { handleResetAndClose(); onProceedToQueue(view); }} />
        ) : !result ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(PRESET_FILES).map(([key, preset]) => {
                const info = presetInfo(key);
                const sel = selectedPreset === key && !customFile;
                return (
                  <button key={key} type="button" disabled={running}
                    onClick={() => { setSelectedPreset(key); clearAll(); }}
                    className={`p-3 rounded-xl text-left border transition-all cursor-pointer ${sel ? 'bg-sky-50/70 border-sky-400 shadow-xs' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                    aria-pressed={sel}>
                    <div className="flex items-center justify-between gap-2 font-semibold text-[#0F172A]">
                      <span>{preset.label}</span>
                      {info.have
                        ? <span className="text-[11.5px] px-1.5 py-0.5 rounded badge-note-slate font-normal">already ingested</span>
                        : <span className="text-[11.5px] px-1.5 py-0.5 rounded badge-note-sky font-normal">new version</span>}
                    </div>
                    {key === 'RET-v3' ? (
                      <p className="text-[12.5px] text-[#475569] mt-1 leading-snug">
                        Lowers the RET-2.1 retention ceiling to 90 days{info.prev ? ` (from ${info.prev.clauses.find(c => c.clause_id === 'RET-2.1')?.fields?.retention_days_max} days in ${info.prev.version})` : ''}, effective {day(info.effective)}.
                        {info.have ? ' Uploading it again changes nothing: the scanner raises no new flags.'
                          : ' In the demo data the scanner flags DEC-007 (ongoing breach, a proposal is queued) and DEC-002 (superseded, historical only).'}
                      </p>
                    ) : (
                      <p className="text-[12.5px] text-[#475569] mt-1 leading-snug">
                        Lowers the CTO approval ceiling on PROC-3.1 to ₹2,00,000, effective {day(info.effective)}.
                        {info.have ? ' It is already in the seed data (it is what flags DEC-004), so uploading it again raises no new flags.'
                          : ' In the demo data the scanner flags DEC-004 (rule changed since).'}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            <div>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple
                     accept=".md,.txt,.wav,.mp3,.m4a,.webm,.ogg,audio/*" data-testid="ingest-file" />
              <button type="button" disabled={running} onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); if (!running) takeFiles(e.dataTransfer.files); }}
                className={`w-full p-2.5 rounded-lg border border-dashed text-center transition-colors cursor-pointer ${dragOver ? 'border-sky-500 bg-sky-50' : customFile ? 'border-sky-400 bg-sky-50/50 text-[#0369A1]' : 'border-slate-300 hover:border-slate-400 text-[#475569]'}`}>
                {customFile ? `Selected: ${customFile.name}` : '+ Choose or drop Markdown documents (several at once), or one meeting recording (transcribed locally)…'}
              </button>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between gap-2 mb-1 text-[12px] text-[#475569]">
                <span>{transcript ? 'Transcript, as it will be uploaded' : 'Front-matter and text'}</span>
                {docId && <span className="font-mono">creates or updates {docId}</span>}
              </div>
              <pre className="font-mono text-[12px] text-[#334155] whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed">
                {(content || '').trim() || '(waiting for the transcript)'}
              </pre>
              {customFile && !fm && <p className="mt-1 text-amber-800">No YAML front-matter found: the server will reject this file.</p>}
            </div>

            {duplicate && (
              <div className="p-3 rounded-lg badge-note-amber flex items-start gap-2">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <div className="font-semibold">{docId} is already ingested{existingVersion ? ` (in force from ${day(existingVersion.valid_from)})` : ''}.</div>
                  <p>Uploading it again replaces the stored text with this file; for an unchanged policy the scanner raises no new flags.</p>
                  <label className="flex items-center gap-1.5 mt-1 cursor-pointer">
                    <input type="checkbox" checked={confirmDup} onChange={e => setConfirmDup(e.target.checked)} /> Upload it again anyway
                  </label>
                </div>
              </div>
            )}

            {onAuthor && !running && (
              <p className="text-[12.5px] text-[#475569]">
                No file? Fill in a form instead:{' '}
                <button type="button" className="underline text-[#0369A1] cursor-pointer" onClick={() => { clearAll(); onAuthor('decision'); }}>Record a decision</button>
                {' · '}
                <button type="button" className="underline text-[#0369A1] cursor-pointer" onClick={() => { clearAll(); onAuthor('policy'); }}>Add a policy version</button>
              </p>
            )}

            <Stages stages={stages} />

            {cancelled && (
              <div className="p-3 rounded-lg badge-note-amber">
                Stopped waiting for the server. If the upload had already reached it, the ingest may still finish:
                check the Inbox and the Audit Trail in a moment.
              </div>
            )}
            {failure && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2 text-rose-900" role="alert">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <div className="font-semibold">{failure.title}. Nothing was ingested and the scanner did not run.</div>
                  <div className="font-mono text-[12px] mt-0.5 break-all">{failure.text}</div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              {running ? (
                <button type="button" onClick={() => abortRef.current?.abort()} className="btn-secondary">
                  <Square size={12} /> Cancel
                </button>
              ) : (
                <>
                  <button type="button" onClick={handleResetAndClose} className="btn-secondary">Close</button>
                  <button type="button" onClick={handleUpload} disabled={(duplicate && !confirmDup) || (!!customFile && !fm) || !content}
                    className="px-4 py-2 rounded-lg btn-sky-gradient text-white font-medium flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed">
                    <Upload size={14} />
                    <span>Upload & Run Scanner</span>
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          /* Results: what the server reported, per stage */
          <div className="space-y-3">
            <Stages stages={stages} />
            <ul className="rounded-lg border border-slate-200 divide-y divide-slate-100">
              <li className="p-2.5 flex items-center gap-2 flex-wrap"><CheckCircle2 size={15} className="text-emerald-700" aria-hidden="true" />
                Stored <IdChip id={result.document_id} /> ({result.doc_type.replace('_', ' ')}), dated {day(result.ref_time)} from its front-matter.</li>
              {isMeeting && (
                <li className="p-2.5 flex items-start gap-2">
                  {result.extraction_error
                    ? <><AlertTriangle size={15} className="text-rose-700 shrink-0 mt-0.5" aria-hidden="true" /><span>Extraction failed: <span className="font-mono">{result.extraction_error}</span></span></>
                    : <><CheckCircle2 size={15} className="text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>Extracted {plural(result.extracted?.nodes ?? 0, 'node')} and {plural(result.extracted?.edges ?? 0, 'edge')}
                        {result.extracted?.already_known ? ` (${result.extracted.already_known} already recorded elsewhere, not queued)` : ''};
                        {' '}{plural(result.pending_review ?? 0, 'fact')} now wait in the Inbox.</span></>}
                </li>
              )}
              {!isPolicy && <li className="p-2.5 text-[#475569]">The impact scanner runs only when a policy version is ingested.</li>}
            </ul>

            {isPolicy && (
              <div>
                <div className="flex items-center gap-2 mb-2 font-semibold text-[#0F172A]">
                  <ShieldAlert size={15} className="text-rose-600" aria-hidden="true" />
                  <span>Impact Scanner Findings ({plural(flags.length, 'flag')} raised)</span>
                </div>
                {flags.length === 0 ? (
                  <p className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[#475569]">
                    No new flags: no past decision relied on a clause this version changed in a way that makes it
                    non-compliant, or the flags already exist from an earlier upload.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {flags.map(flag => (
                      <li key={flag.id} className="p-3 rounded-lg border bg-rose-50/60 border-rose-200">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded badge-note-rose text-[12px]" title={flag.impact_type}>{impactLabel(flag.impact_type)}</span>
                          <IdChip id={flag.decision_id} type="decision" withTitle />
                        </div>
                        <p className="mt-1.5 flex items-center gap-1 flex-wrap text-[#334155]">
                          <ArrowRight size={12} className="text-[#0284C7]" aria-hidden="true" />
                          {flag.proposal_id ? <>Proposal <IdChip id={`#${flag.proposal_id}`} type="proposal" /> queued for human review.</>
                            : 'Historical only: no action proposed.'}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={clearAll} className="btn-secondary">Ingest another</button>
              <button type="button" onClick={() => { handleResetAndClose(); onProceedToQueue(isMeeting ? 'EXTRACTIONS' : 'QUEUE'); }}
                className="px-4 py-2 rounded-lg btn-sky-gradient text-white font-medium cursor-pointer">
                {isMeeting ? 'Review the extracted facts →' : 'Open the Inbox →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const TYPE_LABEL = { policy_version: 'policy version', decision: 'decision', meeting_note: 'meeting note' };

function BatchList({ batch, setBatch, onRun, onClear, onClose, onInbox }) {
  const started = batch.some(x => !['waiting', 'invalid', 'exists'].includes(x.state));
  const busy = batch.some(x => x.state === 'running');
  const done = started && !busy;
  const flags = batch.flatMap(x => x.res?.flags || []);
  const facts = batch.reduce((n, x) => n + (x.res?.pending_review || 0), 0);
  return (
    <div className="space-y-3">
      <p className="text-[#475569]">{batch.length} files, uploaded one after another in this order: policy versions first, so decisions can rely on their clauses.</p>
      <ol className="rounded-lg border border-slate-200 divide-y divide-slate-100" aria-label="Files">
        {batch.map((x, i) => (
          <li key={i} className="p-2.5 flex items-start gap-2">
            {x.state === 'running' && <Loader2 size={15} className="animate-spin text-[#0284C7] shrink-0 mt-0.5" aria-hidden="true" />}
            {x.state === 'done' && <CheckCircle2 size={15} className="text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />}
            {(x.state === 'failed' || x.state === 'invalid') && <AlertTriangle size={15} className="text-rose-700 shrink-0 mt-0.5" aria-hidden="true" />}
            {(x.state === 'waiting' || x.state === 'exists') && <span className="w-[15px] shrink-0" />}
            <div className="min-w-0">
              <div><span className="font-mono">{x.file.name}</span>
                {x.fm && <span className="text-[#64748B]"> · {TYPE_LABEL[x.fm.doc_type] || x.fm.doc_type} {x.id}</span>}</div>
              {x.state === 'invalid' && <div className="text-rose-800 text-[12.5px]">No YAML front-matter: skipped.</div>}
              {(x.state === 'exists' || x.confirmed) && !started && (
                <label className="flex items-center gap-1.5 text-[12.5px] text-amber-900 cursor-pointer">
                  <input type="checkbox" checked={!!x.confirmed}
                    onChange={e => setBatch(b => b.map((y, j) => (j === i ? { ...y, confirmed: e.target.checked } : y)))} />
                  {x.id} is already ingested: skipped unless you tick this (uploading replaces its stored text)
                </label>
              )}
              {x.state === 'failed' && <div className="text-rose-800 text-[12.5px]">{x.error.title}: <span className="font-mono">{x.error.text}</span></div>}
              {x.state === 'done' && (
                <div className="text-[12.5px] text-[#475569]">
                  Stored, dated {day(x.res.ref_time)}.
                  {x.res.doc_type === 'policy_version' && ` Scanner raised ${plural(x.res.flags?.length || 0, 'flag')}.`}
                  {x.res.doc_type === 'meeting_note' && ` ${plural(x.res.pending_review || 0, 'fact')} to review.`}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      <div className="flex justify-end gap-2">
        {!busy && <button type="button" onClick={onClear} className="btn-secondary">{done ? 'Ingest more' : 'Choose other files'}</button>}
        {!started && <button type="button" onClick={onRun} disabled={!batch.some(x => x.state === 'waiting')}
          className="px-4 py-2 rounded-lg btn-sky-gradient text-white font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"><Upload size={14} /> Upload all</button>}
        {done && (flags.some(f => f.proposal_id) || facts > 0)
          ? <button type="button" onClick={() => onInbox(flags.some(f => f.proposal_id) ? 'QUEUE' : 'EXTRACTIONS')} className="px-4 py-2 rounded-lg btn-sky-gradient text-white font-medium cursor-pointer">Open the Inbox →</button>
          : done && <button type="button" onClick={onClose} className="btn-secondary">Close</button>}
      </div>
    </div>
  );
}

function Stages({ stages }) {
  if (!stages.length) return null;
  const secs = (s) => (((s.endedAt || Date.now()) - s.startedAt) / 1000).toFixed(1);
  return (
    <ol className="space-y-1.5" aria-label="Progress" aria-live="polite">
      {stages.map(s => (
        <li key={s.key} className="flex items-start gap-2">
          {s.state === 'running' && <Loader2 size={15} className="animate-spin text-[#0284C7] shrink-0 mt-0.5" aria-hidden="true" />}
          {s.state === 'done' && <CheckCircle2 size={15} className="text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />}
          {s.state === 'failed' && <AlertTriangle size={15} className="text-rose-700 shrink-0 mt-0.5" aria-hidden="true" />}
          <span>
            {s.label} <span className="text-[#64748B] font-mono text-[12px]">{secs(s)} s</span>
            {s.state === 'running' && <span className="text-[#64748B]"> (the local model can take a minute)</span>}
            {s.note && <span className="block text-[12px] text-[#475569]">{s.note}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
