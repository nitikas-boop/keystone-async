import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Edit3, FileSearch, Loader2, PartyPopper, RefreshCw, XCircle } from 'lucide-react';
import { editExtraction, fetchDocument, fetchExtractions, reviewExtraction } from '../api';
import { useApp } from '../context';
import IdChip from './IdChip';
import { day, plural, polish, ts } from '../utils/format';
import { displayName } from '../utils/people';
import ScannedFiles, { AudioStamp } from '../features/p2/ScannedFiles';

// Ingestion review (§6.8): facts the local model extracted from meeting notes, grouped by source document and
// sentence. The supporting sentence is shown once, highlighted inside its document. Accept, edit (PATCH, which
// accepts with corrections) or reject each fact; every decision is an audit row.
const meetingDate = (docId) => /(\d{4}-\d{2}-\d{2})/.exec(docId || '')?.[1];

export default function IngestionReview({ onNotify, auditLogs = [], onChanged, refreshKey = 0 }) {
  const { team, isReader, restrictedIds } = useApp();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(new Set());
  const [showHistory, setShowHistory] = useState(false);
  const [docs, setDocs] = useState({});  // document_id -> raw text (for highlighting the span in context)

  const load = useCallback(async () => {
    try {
      setRows(await fetchExtractions());
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  // GET /extractions has no visibility filter (KNOWN_ISSUES.md). Restricted facts are hidden here, without a count.
  // A reviewer-added fact can carry visibility 'org' although its document is restricted (KNOWN_ISSUES.md), so a
  // row is hidden when its own flag, its document, or a node it names is restricted.
  const visible = useMemo(() => {
    const all = rows || [];
    if (isReader) return all;
    const secretDocs = new Set(all.filter(r => r.provenance.visibility === 'restricted').map(r => r.document_id));
    const secretKeys = new Set(all.filter(r => r.provenance.visibility === 'restricted' && r.kind === 'node').map(r => r.source));
    return all.filter(r => r.provenance.visibility !== 'restricted' && !secretDocs.has(r.document_id)
      && !secretKeys.has(r.source) && !secretKeys.has(r.target) && !restrictedIds.has(r.source) && !restrictedIds.has(r.target));
  }, [rows, isReader, restrictedIds]);
  const pending = visible.filter(r => r.status === 'pending');
  const reviewed = visible.filter(r => r.status !== 'pending');
  const shown = showHistory ? visible : pending;

  // Who reviewed each extraction and when: the extraction_reviewed audit rows (object_id = extraction id).
  const reviewOf = useMemo(() => {
    const m = {};
    for (const a of auditLogs) if (a.action === 'extraction_reviewed' && a.object_type === 'extraction') m[a.object_id] = a;
    return m;
  }, [auditLogs]);

  useEffect(() => {
    for (const id of new Set(shown.map(r => r.document_id))) {
      if (docs[id] === undefined) {
        setDocs(d => ({ ...d, [id]: null }));
        fetchDocument(id).then(doc => setDocs(d => ({ ...d, [id]: doc.body }))).catch(() => setDocs(d => ({ ...d, [id]: '' })));
      }
    }
  }, [shown, docs]);

  const review = async (ids, decision, changes) => {
    setBusy(b => new Set([...b, ...ids]));
    let ok = 0;
    const failed = [];
    for (const id of ids) {
      try {
        if (decision === 'edit') await editExtraction(id, changes);
        else await reviewExtraction(id, decision);
        ok++;
      } catch (e) {
        failed.push(`#${id}: ${e.message}`);
      }
    }
    const verb = { accept: 'accepted', reject: 'rejected', edit: 'edited and accepted' }[decision];
    if (ok) onNotify(`${plural(ok, 'fact')} ${verb}; each is an audit-log row.`, 'success');
    if (failed.length) onNotify(`Review failed for ${failed.join('; ')}`, 'warning');
    setBusy(b => new Set([...b].filter(x => !ids.includes(x))));
    await load();
    if (onChanged) onChanged();
  };

  // document -> sentence (quote) -> facts
  const groups = useMemo(() => {
    const out = [];
    for (const r of shown) {
      let g = out.find(x => x.doc === r.document_id);
      if (!g) out.push(g = { doc: r.document_id, sentences: [] });
      const q = r.provenance.source_span;
      const key = `${q.start ?? 'x'}:${q.quote}`;
      let s = g.sentences.find(x => x.key === key);
      if (!s) g.sentences.push(s = { key, span: q, facts: [] });
      s.facts.push(r);
    }
    // Newest document first (extraction ids grow with each ingest).
    const newest = (g) => Math.max(...g.sentences.flatMap(x => x.facts.map(f => f.id)));
    return out.sort((a, b) => newest(b) - newest(a));
  }, [shown]);

  // Names for extracted nodes, so edges read "Reduce customer log retention … · made by Ananya Rao".
  const nameOf = useMemo(() => Object.fromEntries(visible.filter(r => r.kind === 'node').map(r => [r.source, r.text])), [visible]);
  const subject = (key) => nameOf[key] || key;

  const lastReview = reviewed.map(r => reviewOf[String(r.id)]).filter(Boolean).sort((a, b) => b.id - a.id)[0];
  const counts = { accepted: reviewed.filter(r => r.status === 'accepted').length, rejected: reviewed.filter(r => r.status === 'rejected').length };

  return (
    <div className="flex flex-col h-full paper-sheet overflow-hidden">
      <div className="px-4 py-3 bg-kb-bg border-b border-kb-line flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1 rounded-md bg-kb-butter text-kb-navy"><FileSearch size={14} aria-hidden="true" /></div>
          <div className="min-w-0">
            <h2 className="font-heading font-semibold text-[13px] text-kb-navy">Extracted facts</h2>
            <p className="text-[12px] text-kb-muted truncate">
              Facts the local model extracted from meeting notes. A fact counts only after a person accepts it.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[12px] px-2 py-0.5 rounded-lg bg-kb-bg-soft border border-kb-line">{plural(pending.length, 'fact')} pending</span>
          <label className="flex items-center gap-1.5 text-[13px] text-kb-navy cursor-pointer">
            <input type="checkbox" checked={showHistory} onChange={e => setShowHistory(e.target.checked)} />
            Show reviewed history ({reviewed.length})
          </label>
          <button onClick={load} className="icon-btn" aria-label="Refresh" title="Refresh"><RefreshCw size={13} /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <ScannedFiles key={refreshKey} onNotify={onNotify} onChanged={() => { load(); if (onChanged) onChanged(); }} />
        {error && <p className="text-kb-alert text-[13px]">Could not load extractions: {error}</p>}
        {!error && rows === null && <p className="text-kb-muted text-[13px]">Loading…</p>}

        {rows && pending.length === 0 && (
          <div className="rounded-xl border border-kb-cobalt/50 bg-kb-ice p-4 text-[13px] text-kb-cobalt-ink">
            <div className="flex items-center gap-2 font-semibold"><PartyPopper size={16} aria-hidden="true" /> All caught up: no extracted facts are waiting for review.</div>
            {reviewed.length > 0 && (
              <p className="mt-1">
                {plural(reviewed.length, 'fact')} reviewed earlier: {counts.accepted} accepted, {counts.rejected} rejected
                {lastReview && <> (latest by {displayName(lastReview.actor, team)}, {ts(lastReview.ts).ist})</>}.
                {!showHistory && <> <button className="underline cursor-pointer" onClick={() => setShowHistory(true)}>Show them</button>.</>}
              </p>
            )}
            <p className="mt-1 text-kb-cobalt-ink">New facts appear here after a meeting note (Markdown or audio) is ingested.</p>
          </div>
        )}

        {groups.map(g => {
          const pend = g.sentences.flatMap(s => s.facts).filter(f => f.status === 'pending').map(f => f.id);
          const date = meetingDate(g.doc);
          return (
            <section key={g.doc} className="rounded-xl border border-kb-line">
              <header className="px-3 py-2 border-b border-kb-line bg-kb-bg-soft/70 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <IdChip id={g.doc} type="meeting_note" />
                  {date && <span className="text-[13px] text-kb-navy">Meeting of {day(date)}</span>}
                </div>
                {pend.length > 0 && (
                  <div className="flex gap-1.5">
                    <button className="btn-secondary" disabled={pend.some(id => busy.has(id))} onClick={() => review(pend, 'accept')}>
                      <CheckCircle2 size={13} /> Accept all {pend.length}
                    </button>
                    <button className="btn-danger" disabled={pend.some(id => busy.has(id))} onClick={() => review(pend, 'reject')}>
                      <XCircle size={13} /> Reject all {pend.length}
                    </button>
                  </div>
                )}
              </header>
              <div className="divide-y divide-kb-line">
                {g.sentences.map(s => (
                  <div key={s.key} className="p-3 grid grid-cols-1 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-3">
                    <div>
                      <Context raw={docs[g.doc]} span={s.span} />
                      <AudioStamp docId={g.doc} raw={docs[g.doc]} span={s.span} />
                    </div>
                    <ul className="space-y-2">
                      {s.facts.map(f => (
                        <Fact key={f.id} f={f} subject={subject} team={team} review={reviewOf[String(f.id)]}
                              busy={busy.has(f.id)} onReview={(d, ch) => review([f.id], d, ch)} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Context({ raw, span }) {
  const quote = polish(span.quote || '');
  if (span.start == null) {
    return (
      <blockquote className="text-[13px] leading-relaxed text-kb-navy border-l-2 border-kb-line-strong pl-3">
        {quote.startsWith('added in review') ? <em>{quote}</em> : <>“{quote}”
        <span className="block not-italic text-[12px] text-kb-navy mt-1">This quote was not found verbatim in the source document.</span></>}
      </blockquote>
    );
  }
  if (raw === undefined || raw === null) {
    return <blockquote className="text-[13px] leading-relaxed text-kb-navy border-l-2 border-kb-line-strong pl-3">“{quote}”</blockquote>;
  }
  const a = Math.max(0, span.start - 160), b = Math.min(raw.length, span.end + 160);
  return (
    <blockquote className="text-[13px] leading-relaxed text-kb-muted border-l-2 border-kb-line-strong pl-3" aria-label="Source sentence in context">
      {a > 0 && '… '}{raw.slice(a, span.start)}
      <mark className="bg-kb-butter text-kb-navy rounded px-0.5">{raw.slice(span.start, span.end)}</mark>
      {raw.slice(span.end, b)}{b < raw.length && ' …'}
    </blockquote>
  );
}

function factText(f, subject, team) {
  if (f.kind === 'node') return <><strong className="font-semibold">{f.type}:</strong> {polish(f.text)}</>;
  const s = <span className="font-medium">{polish(subject(f.source))}</span>;
  switch (f.type) {
    case 'MADE_BY': return <>{s} · made by <IdChip id={f.target} type="person" label={displayName(f.target, team)} /></>;
    case 'ABOUT': return <>{s} · about <span className="font-medium">{f.target}</span></>;
    case 'JUSTIFIED_BY': return <>{s} · justified by the meeting of {day(meetingDate(f.target))}</>;
    case 'SUPERSEDES': return <>{s} · supersedes <IdChip id={f.target} type="decision" /></>;
    case 'RELIED_ON': return <>{s} · relied on <IdChip id={f.target} type="clause" /></>;
    default: return <>{s} · {f.type} · {f.target}</>;
  }
}

function Fact({ f, subject, team, review, busy, onReview }) {
  const { canApprove } = useApp();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(f.text);
  const p = f.provenance;
  const addedByHuman = p.extracted_by === 'human' && (p.source_span.quote || '').startsWith('added in review');
  const origin = addedByHuman ? 'added by a reviewer' : p.extracted_by === 'human' ? 'corrected by a reviewer'
    : `extracted by ${p.extracted_by} · model-reported confidence ${p.confidence}`;
  return (
    <li className={`rounded-lg border p-2.5 ${f.status === 'pending' ? 'border-kb-line bg-kb-bg' : 'border-kb-line bg-kb-bg-soft'}`}>
      <div className="text-[13px] text-kb-navy leading-relaxed">{factText(f, subject, team)}</div>
      <div className="text-[12px] text-kb-muted mt-1">#{f.id} · {origin}</div>
      {editing ? (
        <form className="mt-2 space-y-1.5" onSubmit={e => { e.preventDefault(); onReview('edit', f.kind === 'node' ? { name } : { fact: name }); setEditing(false); }}>
          <label className="block text-[12px] text-kb-muted">{f.kind === 'node' ? 'Name' : 'Fact text'}
            <input className="field w-full mt-0.5" value={name} onChange={e => setName(e.target.value)} required />
          </label>
          <p className="text-[12px] text-kb-muted">Saving calls PATCH /extractions/{f.id}: the fact is accepted with your correction.</p>
          <div className="flex gap-1.5">
            <button type="submit" className="btn-approve" disabled={busy}>Save and accept</button>
            <button type="button" className="btn-secondary" onClick={() => { setName(f.text); setEditing(false); }}>Cancel</button>
          </div>
        </form>
      ) : f.status === 'pending' ? (
        <div className={`flex gap-1.5 mt-2 flex-wrap ${canApprove ? '' : 'opacity-50 cursor-not-allowed'}`}>
          <button className="btn-approve disabled:cursor-not-allowed" disabled={busy || !canApprove} onClick={() => onReview('accept')}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Accept
          </button>
          <button className="btn-secondary disabled:cursor-not-allowed" disabled={busy || !canApprove} onClick={() => setEditing(true)}><Edit3 size={13} /> Edit</button>
          <button className="btn-danger disabled:cursor-not-allowed" disabled={busy || !canApprove} onClick={() => onReview('reject')}><XCircle size={13} /> Reject</button>
          {!canApprove && <p className="text-[12px] text-kb-muted w-full">Read-only for you: only a team lead, compliance or the owner can decide.</p>}
        </div>
      ) : (
        <div className={`mt-1.5 inline-flex items-center gap-1 text-[12px] px-1.5 py-0.5 rounded ${f.status === 'accepted' ? 'badge-note-green' : 'badge-note-rose'}`}>
          {f.status === 'accepted' ? <CheckCircle2 size={12} aria-hidden="true" /> : <XCircle size={12} aria-hidden="true" />}
          Reviewed · {f.status}{review ? <> · by {displayName(review.actor, team)} · {ts(review.ts).ist}</> : ''}
        </div>
      )}
    </li>
  );
}
