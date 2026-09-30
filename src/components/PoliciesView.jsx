import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, RefreshCw } from 'lucide-react';
import { fetchPolicies } from '../api';
import IdChip from './IdChip';
import { clauseRef, day, inr } from '../utils/format';

// Read-only view of GET /policies: every policy version with its clauses, and a side-by-side comparison of one
// clause's structured fields across versions. (A full policy diff/editor is roadmap; this only reads.)
const FIELD_ROWS = [
  { key: 'retention_days_max', label: 'Max retention', fmt: v => (v == null ? '—' : `${v} days`) },
  { key: 'approver_threshold_inr.CTO', label: 'CTO approval ceiling', fmt: v => (v == null ? 'No limit set' : inr(v)) },
  { key: 'approver_threshold_inr.CEO', label: 'CEO approval ceiling', fmt: v => (v == null ? 'No limit set' : inr(v)) },
];

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

export default function PoliciesView({ focus, refreshKey = 0, asOfDate }) {
  const [policies, setPolicies] = useState(null);
  const [error, setError] = useState(null);
  const [clauseId, setClauseId] = useState(null);

  const load = () => fetchPolicies().then(p => { setPolicies(p); setError(null); }).catch(e => setError(e.message));
  useEffect(() => { load(); }, [refreshKey]);

  // Every clause ID across all policies, with its versions in effective order.
  const clauses = useMemo(() => {
    const out = {};
    for (const p of policies || []) {
      for (const v of p.versions) {
        for (const c of v.clauses) {
          (out[c.clause_id] ||= { policyId: p.policy_id, versions: [] }).versions.push({ ...c, version: v.version,
            validFrom: v.valid_from, validTo: v.valid_to, documentId: v.document_id });
        }
      }
    }
    for (const c of Object.values(out)) c.versions.sort((a, b) => a.validFrom.localeCompare(b.validFrom));
    return out;
  }, [policies]);

  useEffect(() => {
    const want = focus?.split('@')[0];
    if (want && clauses[want]) setClauseId(want);
    else if (!clauseId && Object.keys(clauses).length) setClauseId(Object.keys(clauses).sort()[0]);
  }, [focus, clauses]);

  const sel = clauses[clauseId];
  const fieldRows = sel ? FIELD_ROWS.filter(r => sel.versions.some(v => get(v.fields, r.key) !== undefined)) : [];

  return (
    <div className="flex h-full paper-sheet overflow-hidden">
      <aside className="w-72 shrink-0 border-r border-ks-line flex flex-col min-h-0">
        <div className="px-4 py-3 border-b border-ks-line flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen size={15} className="text-ks-gold" aria-hidden="true" />
            <h2 className="font-heading font-semibold text-sm text-ks-text">Policies</h2>
          </div>
          <button onClick={load} className="icon-btn" aria-label="Refresh policies" title="Refresh">
            <RefreshCw size={13} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {error && <p className="text-[13px] text-ks-red-text">Could not load policies: {error}</p>}
          {!error && !policies && <p className="text-[13px] text-ks-muted">Loading…</p>}
          {(policies || []).map(p => (
            <section key={p.policy_id}>
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ks-muted mb-1.5">{p.policy_id}</h3>
              <ol className="space-y-1.5">
                {p.versions.map(v => {
                  const current = v.valid_from <= asOfDate && (!v.valid_to || asOfDate < v.valid_to);
                  return (
                    <li key={v.version} className="rounded-lg border border-ks-line p-2">
                      <div className="flex items-center justify-between gap-2">
                        <IdChip id={v.document_id} type="policy_version" />
                        {current && <span className="text-[11.5px] px-1.5 py-0.5 rounded badge-note-green">In force on {day(asOfDate)}</span>}
                      </div>
                      <div className="text-[12px] text-ks-muted mt-1">
                        {day(v.valid_from)} → {v.valid_to ? day(v.valid_to) : 'no end date'}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {v.clauses.map(c => (
                          <button key={c.clause_id} onClick={() => setClauseId(c.clause_id)}
                            className={`text-[12px] font-mono px-1.5 py-0.5 rounded border cursor-pointer ${clauseId === c.clause_id ? 'border-ks-gold bg-ks-gold/15 text-ks-gold' : 'border-ks-line text-ks-text-2 hover:bg-ks-raised'}`}>
                            {clauseRef(c.clause_id, v.version)}
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col min-h-0">
        <div className="px-5 py-3 border-b border-ks-line">
          <h2 className="font-heading font-semibold text-sm text-ks-text">
            {sel ? <>Clause {clauseId} across {sel.versions.length} version{sel.versions.length === 1 ? '' : 's'}</> : 'Select a clause'}
          </h2>
          <p className="text-[12.5px] text-ks-muted">Read-only. Changed values are marked with the previous value. Dates are the effective dates from each version's front-matter.</p>
        </div>
        {sel && (
          <div className="flex-1 overflow-auto p-5">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="text-left font-medium text-ks-muted p-2 w-48 align-bottom">Field</th>
                  {sel.versions.map(v => (
                    <th key={v.version} className="text-left p-2 align-bottom border-l border-ks-line">
                      <IdChip id={clauseRef(clauseId, v.version)} type="clause" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ks-line">
                <Row label="Effective from" versions={sel.versions} value={v => day(v.validFrom)} />
                <Row label="Effective to" versions={sel.versions} value={v => (v.validTo ? day(v.validTo) : 'In force (no end date)')} />
                {fieldRows.map(r => (
                  <Row key={r.key} label={r.label} versions={sel.versions} value={v => r.fmt(get(v.fields, r.key))} diff />
                ))}
                <Row label="Machine-checkable" versions={sel.versions} value={v => (v.checkable ? 'Yes' : 'No (open-textured)')} diff />
                <Row label="Title" versions={sel.versions} value={v => v.title} diff />
                <Row label="Clause text" versions={sel.versions} value={v => v.text} diff prose />
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

function Row({ label, versions, value, diff = false, prose = false }) {
  return (
    <tr>
      <td className="p-2 text-ks-muted align-top">{label}</td>
      {versions.map((v, i) => {
        const now = value(v), before = i > 0 ? value(versions[i - 1]) : null;
        const changed = diff && i > 0 && now !== before;
        return (
          <td key={v.version} className={`p-2 align-top border-l border-ks-line ${changed ? 'bg-ks-gold/10' : ''} ${prose ? 'leading-relaxed' : ''}`}>
            <span className={changed ? 'font-semibold text-ks-text' : 'text-ks-text'}>{now}</span>
            {changed && !prose && <span className="block text-[12px] text-ks-gold">changed from {before}</span>}
            {changed && prose && <span className="block text-[12px] text-ks-gold mt-1">changed in this version</span>}
          </td>
        );
      })}
    </tr>
  );
}
