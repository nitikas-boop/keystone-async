import React, { useCallback, useEffect, useState } from 'react';
import { audioBlobUrl, audioSource, audioSources, deleteAudioFile, ingestAudio, uploadAudio } from '../../api/p2';
import { useApp } from '../../context';
import { errText, Field, inputCls, Msg, Section, Table } from './common';

const stamp = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// F: upload a recording (meeting date and consent from the uploader), get a local timestamped transcript, map who
// spoke each segment, then send it to Ingestion Review as candidates. Raw audio can be deleted; the transcript stays.
export default function Audio({ onChanged }) {
  const { team } = useApp();
  const [file, setFile] = useState(null);
  const [date, setDate] = useState('');
  const [title, setTitle] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [current, setCurrent] = useState(null);  // {id, segments, ...}
  const [speakers, setSpeakers] = useState({});
  const [list, setList] = useState([]);
  const [player, setPlayer] = useState(null);     // {id, url, at}

  const load = useCallback(() => audioSources().then(setList).catch(e => setMsg({ text: errText(e) })), []);
  useEffect(() => { load(); }, [load]);

  const upload = async () => {
    setBusy(true); setMsg(null);
    try {
      const a = await uploadAudio(file, date, title, consent);
      setCurrent(a); setSpeakers({});
      setMsg({ ok: true, text: `Transcribed locally: ${a.segments.length} segment(s). Map the speakers, then send to review.` });
      load();
    } catch (e) { setMsg({ text: errText(e) }); }
    setBusy(false);
  };

  const ingest = async () => {
    setBusy(true); setMsg(null);
    try {
      const out = await ingestAudio(current.id, speakers);
      setMsg({ ok: true, text: `${out.document_id} created; ${out.pending_review} candidate fact(s) wait in Ingestion Review.` });
      setCurrent(null); load(); onChanged?.();
    } catch (e) { setMsg({ text: errText(e) }); }
    setBusy(false);
  };

  const play = async (id, at = 0) => {
    try { setPlayer({ id, at, url: player?.id === id ? player.url : await audioBlobUrl(id) }); }
    catch (e) { setMsg({ text: errText(e) }); }
  };

  const names = ['Speaker 1', ...team.map(p => p.name)];
  return (
    <div className="space-y-4">
      <Msg msg={msg} />
      <Section title="Upload meeting audio">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Audio (.wav .mp3 .m4a)"><input type="file" accept=".wav,.mp3,.m4a,.webm,.ogg" onChange={e => setFile(e.target.files[0] || null)} /></Field>
          <Field label="Meeting date"><input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} /></Field>
          <Field label="Title"><input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} /></Field>
          <label className="flex items-center gap-1.5 text-[12.5px]"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
            Participants know this meeting was recorded and transcribed</label>
          <button className="btn-secondary" disabled={!file || !date || !title || busy} onClick={upload}>{busy ? 'Working…' : 'Transcribe locally'}</button>
        </div>
      </Section>

      {current && (
        <Section title={`Transcript #${current.id}: map speakers`} actions={<button className="btn-secondary" disabled={busy} onClick={ingest}>Send to Ingestion Review</button>}>
          <Table head={['Time', 'Speaker', 'Text']} rows={current.segments.map((s, i) => ({ key: i, cells: [
            <button key="t" className="text-kb-cobalt-ink underline" onClick={() => play(current.id, s.start)}>{stamp(s.start)}</button>,
            <select key="s" className={inputCls} value={speakers[i] || 'Speaker 1'} onChange={e => setSpeakers({ ...speakers, [i]: e.target.value })}>
              {names.map(n => <option key={n}>{n}</option>)}
            </select>, s.text] }))} />
        </Section>
      )}

      {player && <audio key={player.url} src={player.url} controls autoPlay className="w-full" onLoadedMetadata={e => { e.currentTarget.currentTime = player.at; }} />}

      <Section title="Audio sources" actions={<button className="btn-secondary" onClick={load}>Refresh</button>}>
        <Table head={['#', 'Title', 'Meeting', 'Uploader', 'Consent', 'Source', 'Raw audio']} empty="No audio uploaded yet."
          rows={list.map(a => ({ key: a.id, cells: [a.id, a.title, a.meeting_date, a.uploader_id, a.consent_flag ? 'recorded' : '—',
            a.document_id || <button key="m" className="btn-secondary" onClick={() => audioSource(a.id).then(x => { setCurrent(x); setSpeakers({}); })}>Map speakers</button>,
            a.audio_available ? <span key="r" className="flex gap-1">
              <button className="btn-secondary" onClick={() => play(a.id)}>Play</button>
              <button className="btn-secondary" onClick={() => window.confirm('Delete the raw audio? The transcript stays.') &&
                deleteAudioFile(a.id).then(load).catch(e => setMsg({ text: errText(e) }))}>Delete audio</button></span>
              : `deleted ${a.audio_deleted_at?.slice(0, 10)}`] }))} />
      </Section>
    </div>
  );
}
