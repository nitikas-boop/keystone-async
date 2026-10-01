import React, { useCallback, useEffect, useState } from 'react';
import { audioBlobUrl, audioForDocument, ignoreScanFile, ingestScanFile, scanFiles } from '../../api/p2';
import { errText, inputCls } from './common';

// L2 in Ingestion Review: files the sign-in scan found NEW or UPDATED, in scopes this user may access. Nothing is
// ingested until a person clicks Ingest. Files without front-matter need a confirmed date (suggested: modified date).
export default function ScannedFiles({ onChanged, onNotify }) {
  const [files, setFiles] = useState([]);
  const [form, setForm] = useState({});  // id -> {meeting_date, doc_id, consent}
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => scanFiles().then(setFiles).catch(() => setFiles([])), []);
  useEffect(() => { load(); }, [load]);
  if (!files.length) return null;

  const run = async (f, fn, ok) => {
    setBusy(f.id);
    try { const out = await fn(); onNotify?.(ok(out), 'success'); await load(); onChanged?.(); }
    catch (e) { onNotify?.(`${f.path}: ${errText(e)}`, 'warning'); await load(); }
    setBusy(null);
  };
  const val = (f, k, d) => form[f.id]?.[k] ?? d;
  const set = (f, k, v) => setForm(s => ({ ...s, [f.id]: { ...s[f.id], [k]: v } }));

  return (
    <section className="rounded-xl border border-kb-cobalt/50 bg-kb-ice/40 p-3 space-y-2" data-testid="scanned-files">
      <h3 className="font-semibold text-[13px]">Files from the sign-in directory scan ({files.length} waiting)</h3>
      <p className="text-[12px] text-kb-muted">The folder decides the access level. Markdown with front-matter keeps its own dates;
        other files need the date confirmed. Audio goes to transcription and needs recorded consent.</p>
      {files.map(f => (
        <div key={f.id} className="flex flex-wrap items-end gap-2 text-[12.5px] bg-kb-bg border border-kb-line rounded-md p-2">
          <div className="min-w-[16rem]"><span className="font-mono">{f.path}</span> · {f.change} · scope {f.scope}
            {f.error && <div className="text-kb-alert">{f.error}</div>}</div>
          <label className="flex flex-col">Date<input type="date" className={inputCls} value={val(f, 'meeting_date', f.modified)}
            onChange={e => set(f, 'meeting_date', e.target.value)} /></label>
          {!f.is_audio && <label className="flex flex-col">Doc ID (no front-matter only)<input className={inputCls} placeholder="suggested from file name"
            value={val(f, 'doc_id', '')} onChange={e => set(f, 'doc_id', e.target.value)} /></label>}
          {f.is_audio && <label className="flex items-center gap-1"><input type="checkbox" checked={!!val(f, 'consent', false)}
            onChange={e => set(f, 'consent', e.target.checked)} />recording consent</label>}
          <button className="btn-approve" disabled={busy === f.id} onClick={() => run(f, () => ingestScanFile(f.id, {
            meeting_date: val(f, 'meeting_date', f.modified), doc_id: val(f, 'doc_id', '') || null, consent: !!val(f, 'consent', false) }),
          o => (f.is_audio ? `${f.path} transcribed: map its speakers under Knowledge → Audio.`
            : `${o.result.document_id} ingested from ${f.path}; ${o.result.pending_review} fact(s) to review.`))}>
            {busy === f.id ? 'Working…' : 'Ingest'}</button>
          <button className="btn-secondary" disabled={busy === f.id} onClick={() => run(f, () => ignoreScanFile(f.id), () => `${f.path} ignored.`)}>Ignore</button>
        </div>
      ))}
    </section>
  );
}

let playing = null;

// F: a fact extracted from a transcript cites "[mm:ss] Speaker: ..."; clicking plays the recording from there.
export function AudioStamp({ docId, raw, span }) {
  if (!raw || span?.start == null || !/-AUDIO-\d+$/.test(docId || '')) return null;
  const line = raw.slice(raw.lastIndexOf('\n', span.start) + 1, span.start + 1);
  const m = /^\[(\d\d):(\d\d)\]/.exec(line);
  if (!m) return null;
  const at = Number(m[1]) * 60 + Number(m[2]);
  const play = async () => {
    try {
      const a = await audioForDocument(docId);
      if (!a.audio_available) { window.alert('The raw audio was deleted; the transcript remains.'); return; }
      playing?.pause();
      playing = new Audio(await audioBlobUrl(a.id));
      playing.addEventListener('loadedmetadata', () => { playing.currentTime = at; playing.play(); }, { once: true });
    } catch (e) { window.alert(errText(e)); }
  };
  return <button className="text-[12px] text-kb-cobalt-ink underline mt-1" onClick={play} title="Play the recording from this moment">▶ {m[1]}:{m[2]}</button>;
}
