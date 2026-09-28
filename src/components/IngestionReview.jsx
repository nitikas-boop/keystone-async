import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FileSearch, RefreshCw, XCircle } from 'lucide-react';
import { fetchExtractions, reviewExtraction } from '../api';

// Ingestion review (§6.8, §9): every fact the local model extracted from a meeting note, with its source sentence,
// confidence and verification state. A human accepts or rejects each one before it counts.
export default function IngestionReview({ onNotify }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchExtractions());
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const review = async (id, decision) => {
    setBusyId(id);
    try {
      await reviewExtraction(id, decision);
      onNotify(`Extraction #${id} ${decision === 'accept' ? 'accepted' : 'rejected'} and written to the audit log.`, 'success');
      await load();
    } catch (e) {
      onNotify(`Review failed: ${e.message}`, 'warning');
    } finally {
      setBusyId(null);
    }
  };

  const pending = rows ? rows.filter(r => r.status === 'pending').length : 0;

  return (
    <div className="flex flex-col h-full paper-sheet overflow-hidden">
      <div className="px-4 py-3 bg-white border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1 rounded-md bg-sky-50 text-[#0284C7]">
            <FileSearch size={14} />
          </div>
          <div>
            <div className="font-heading font-semibold text-xs tracking-tight text-[#0F172A]">INGESTION REVIEW</div>
            <div className="text-[10.5px] font-mono text-[#64748B]">
              Facts extracted from meeting notes by the local model. Each shows its source sentence; a human accepts or rejects it.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[11px] font-mono px-2.5 py-0.5 rounded-lg bg-slate-50 border border-slate-200 text-[#0F172A]">
            {pending} Pending Review
          </div>
          <button onClick={load} title="Refresh" className="p-1.5 rounded-md border border-slate-200 text-[#64748B] hover:text-[#0F172A] cursor-pointer">
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50/70 border-b border-slate-100 font-mono text-[10.5px] text-[#64748B] uppercase tracking-wider">
              <th className="py-2.5 px-3">ID / Source</th>
              <th className="py-2.5 px-3">Extracted Fact</th>
              <th className="py-2.5 px-3">Source Sentence</th>
              <th className="py-2.5 px-3">Provenance</th>
              <th className="py-2.5 px-3 text-right">Review</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {error && (
              <tr><td colSpan={5} className="py-8 text-center font-mono text-rose-600">Could not load extractions: {error}</td></tr>
            )}
            {!error && rows === null && (
              <tr><td colSpan={5} className="py-8 text-center font-mono text-[#64748B]">Loading…</td></tr>
            )}
            {!error && rows && rows.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center font-mono text-[#64748B]">No extracted facts yet. They appear when a meeting note is ingested.</td></tr>
            )}
            {!error && rows && rows.map(r => {
              const p = r.provenance;
              return (
                <tr key={r.id} className={r.status === 'pending' ? '' : 'opacity-70 bg-slate-50/30'}>
                  <td className="py-3 px-3 align-top font-mono">
                    <span className="font-bold text-[#0F172A] block text-[11px]">#{r.id}</span>
                    <span className="text-[10px] text-[#64748B]">{r.document_id}</span>
                  </td>
                  <td className="py-3 px-3 align-top max-w-[260px]">
                    <span className="font-mono text-[9.5px] px-1.5 rounded-md badge-note-lavender mr-1">{r.type}</span>
                    <span className="text-[#0F172A]">{r.text}</span>
                  </td>
                  <td className="py-3 px-3 align-top max-w-[340px] italic text-[#475569]">
                    “{p.source_span.quote}”
                    {p.source_span.start === null && p.extracted_by !== 'human' && (
                      <span className="not-italic block text-[10px] text-amber-700 font-mono mt-0.5">quote not found verbatim in the source</span>
                    )}
                  </td>
                  <td className="py-3 px-3 align-top font-mono text-[10.5px] text-[#475569] whitespace-nowrap">
                    <div>confidence {p.confidence}</div>
                    <div>by {p.extracted_by}</div>
                    <div className={p.human_verified ? 'text-emerald-700' : 'text-amber-700'}>
                      {p.human_verified ? 'human verified' : 'not verified'}
                    </div>
                  </td>
                  <td className="py-3 px-3 align-top text-right whitespace-nowrap">
                    {r.status === 'pending' ? (
                      <div className="flex justify-end gap-1.5">
                        <button disabled={busyId === r.id} onClick={() => review(r.id, 'accept')}
                          className="px-2.5 py-1 rounded-md btn-sky-gradient text-white text-[11px] font-mono flex items-center gap-1 cursor-pointer disabled:opacity-50">
                          <CheckCircle2 size={12} /> Accept
                        </button>
                        <button disabled={busyId === r.id} onClick={() => review(r.id, 'reject')}
                          className="px-2.5 py-1 rounded-md border border-slate-200 text-[#475569] text-[11px] font-mono flex items-center gap-1 cursor-pointer disabled:opacity-50">
                          <XCircle size={12} /> Reject
                        </button>
                      </div>
                    ) : (
                      <span className={`font-mono text-[10.5px] px-2 py-0.5 rounded-md ${r.status === 'accepted' ? 'badge-note-green' : 'badge-note-rose'}`}>
                        {r.status}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
