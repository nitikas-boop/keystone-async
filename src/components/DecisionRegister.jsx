import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, GitBranch, Loader2, RefreshCw, Table2, X } from 'lucide-react';
import { fetchDecisionCompliance, fetchDecisions, fetchFlags } from '../api';
import { useApp } from '../context';
import IdChip from './IdChip';
import { ThenNow } from './Compliance';
import { day, polish } from '../utils/format';
import { displayName } from '../utils/people';
import { IMPACT } from '../utils/entities';

// Decision register: GET /decisions (as of today) + GET /flags. Compliance (then vs now) is loaded only when a row
// is opened, from GET /decisions/{id}/compliance, so the table itself makes no model calls.
const COLS = [
  { key: 'title', label: 'Decision' },
  { key: 'ownerName', label: 'Owner' },
  { key: 'project', label: 'Project' },
  { key: 'decidedOn', label: 'Decided' },
  { key: 'status', label: 'Status' },
  { key: 'flagCount', label: 'Policy impact' },
];


export default function DecisionRegister({ refreshKey = 0, focus }) {
  const { team, isReader, openEntity } = useApp();
  const [decisions, setDecisions] = useState(null);
  const [flags, setFlags] = useState([]);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState({ key: 'decidedOn', dir: 1 });
  const [q, setQ] = useState('');
  const [owner, setOwner] = useState('');
  const [project, setProject] = useState('');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [compliance, setCompliance] = useState({});  // id -> {loading} | {data} | {error}

  const load = () => Promise.all([fetchDecisions(), fetchFlags()])
    .then(([d, f]) => { setDecisions(d); setFlags(f); setError(null); })
    .catch(e => setError(e.message));
  useEffect(() => { load(); }, [refreshKey]);
  useEffect(() => { if (focus) setOpenId(focus); }, [focus]);

  const rows = useMemo(() => (decisions || [])
    // /decisions returns restricted decisions to everyone (KNOWN_ISSUES.md); the register hides them unless the
    // viewer is a restricted reader, matching what retrieval allows.
    .filter(d => isReader || d.provenance?.visibility !== 'restricted')
    .map(d => {
      const a = d.attributes || {};
      const fl = flags.filter(f => f.decision_id === d.id);
      return { id: d.id, title: polish(d.label), owner: a.owner, ownerName: a.owner ? displayName(a.owner, team) : '—',
        project: a.project || '—', decidedOn: a.decided_on || d.valid_from, status: a.status || '—', effect: a.effect,
        reasons: polish(a.reasons), flags: fl, flagCount: fl.length, restricted: d.provenance?.visibility === 'restricted',
        extracted: d.provenance?.extracted_by && d.provenance.extracted_by !== 'human', provenance: d.provenance };
    }), [decisions, flags, team, isReader]);

  const owners = [...new Set(rows.map(r => r.ownerName))].sort();
  const projects = [...new Set(rows.map(r => r.project))].sort();
  const shown = rows
    .filter(r => (!q || `${r.id} ${r.title} ${r.reasons}`.toLowerCase().includes(q.toLowerCase()))
      && (!owner || r.ownerName === owner) && (!project || r.project === project) && (!flaggedOnly || r.flagCount))
    .sort((a, b) => String(a[sort.key] ?? '').localeCompare(String(b[sort.key] ?? ''), undefined, { numeric: true }) * sort.dir);

  const open = rows.find(r => r.id === openId);
  const loadCompliance = (id) => {
    setCompliance(c => ({ ...c, [id]: { loading: true } }));
    fetchDecisionCompliance(id)
      .then(data => setCompliance(c => ({ ...c, [id]: { data } })))
      .catch(e => setCompliance(c => ({ ...c, [id]: { error: e.message } })));
  };
  useEffect(() => { if (openId && !compliance[openId]) loadCompliance(openId); }, [openId]);

  return (
    <div className="flex h-full gap-4 min-h-0">
      <div className="flex-1 min-w-0 paper-sheet flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <Table2 size={15} className="text-[#4F46E5]" aria-hidden="true" />
          <h2 className="font-heading font-semibold text-sm text-[#0F172A] mr-2">Decision register</h2>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search ID, title or reason" aria-label="Search decisions"
            className="field w-56" />
          <select value={owner} onChange={e => setOwner(e.target.value)} className="field" aria-label="Filter by owner">
            <option value="">All owners</option>
            {owners.map(o => <option key={o}>{o}</option>)}
          </select>
          <select value={project} onChange={e => setProject(e.target.value)} className="field" aria-label="Filter by project">
            <option value="">All projects</option>
            {projects.map(p => <option key={p}>{p}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-[13px] text-[#334155] cursor-pointer">
            <input type="checkbox" checked={flaggedOnly} onChange={e => setFlaggedOnly(e.target.checked)} /> Flagged only
          </label>
          <span className="ml-auto text-[12.5px] text-[#64748B]">{shown.length} of {rows.length} decisions (valid today)</span>
          <button onClick={load} className="icon-btn" aria-label="Refresh decisions" title="Refresh"><RefreshCw size={13} /></button>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse text-[13px]">
            <thead className="sticky top-0 bg-slate-50 z-10">
              <tr className="border-b border-slate-200">
                {COLS.map(c => (
                  <th key={c.key} className="py-2 px-3 font-medium text-[#475569]">
                    <button className="inline-flex items-center gap-1 cursor-pointer hover:text-[#0F172A]"
                      onClick={() => setSort(s => ({ key: c.key, dir: s.key === c.key ? -s.dir : 1 }))}
                      aria-label={`Sort by ${c.label}`}>
                      {c.label}
                      {sort.key === c.key && (sort.dir > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {error && <tr><td colSpan={6} className="p-6 text-center text-rose-700">Could not load decisions: {error}</td></tr>}
              {!error && !decisions && <tr><td colSpan={6} className="p-6 text-center text-[#64748B]">Loading…</td></tr>}
              {decisions && shown.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-[#64748B]">No decisions match these filters.</td></tr>}
              {shown.map(r => (
                <tr key={r.id} onClick={() => setOpenId(r.id)} tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && setOpenId(r.id)}
                  className={`cursor-pointer hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-sky-600 ${openId === r.id ? 'bg-sky-50/60' : ''}`}>
                  <td className="py-2 px-3 text-[#0F172A]">
                    <span className="font-medium">{r.title}</span>
                    <span className="block font-mono text-[11.5px] text-[#64748B]">{r.id}</span>
                    {r.restricted && <span className="ml-1.5 text-[11.5px] px-1 rounded badge-note-slate">restricted</span>}
                    {r.extracted && <span className="ml-1.5 text-[11.5px] px-1 rounded badge-note-slate">extracted from a meeting note</span>}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">{r.ownerName}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{r.project}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{day(r.decidedOn)}</td>
                  <td className="py-2 px-3 whitespace-nowrap capitalize">{r.status}</td>
                  <td className="py-2 px-3">
                    <div className="flex flex-wrap gap-1">
                      {r.flags.length === 0 && <span className="text-[#64748B]">None</span>}
                      {r.flags.map(f => (
                        <span key={f.id} className={`text-[12px] px-1.5 py-0.5 rounded ${IMPACT[f.impact_type]?.cls || 'badge-note-slate'}`}>
                          {IMPACT[f.impact_type]?.label || f.impact_type} · {f.clause_id}@{f.new_version}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <aside className="w-[21rem] xl:w-[26rem] shrink-0 paper-sheet flex flex-col overflow-hidden" aria-label={`Decision ${open.id}`}>
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
            <IdChip id={open.id} type="decision" />
            <div className="flex items-center gap-1.5">
              <button onClick={() => openEntity(open.id, 'decision', { view: 'GRAPH' })} className="btn-secondary">
                <GitBranch size={13} /> Show in graph
              </button>
              <button onClick={() => setOpenId(null)} className="icon-btn" aria-label="Close details"><X size={14} /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-[13px]">
            <h3 className="font-heading font-semibold text-[15px] text-[#0F172A] leading-snug">{open.title}</h3>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
              <div><dt className="text-[12px] text-[#64748B]">Owner</dt><dd>{open.owner ? <IdChip id={open.owner} type="person" label={open.ownerName} /> : '—'}</dd></div>
              <div><dt className="text-[12px] text-[#64748B]">Project</dt><dd>{open.project}</dd></div>
              <div><dt className="text-[12px] text-[#64748B]">Decided</dt><dd>{day(open.decidedOn)}</dd></div>
              <div><dt className="text-[12px] text-[#64748B]">Status · effect</dt><dd className="capitalize">{open.status}{open.effect ? ` · ${open.effect}` : ''}</dd></div>
            </dl>
            <section>
              <h4 className="text-[12px] text-[#64748B] mb-1">Recorded reason</h4>
              <p className="leading-relaxed text-[#334155]">{open.reasons || '—'}</p>
              <p className="text-[12px] text-[#64748B] mt-1">Source: <span className="font-mono">{open.provenance?.source_doc || '—'}</span></p>
            </section>
            <section>
              <h4 className="text-[12px] text-[#64748B] mb-1.5">Compliance, then vs now</h4>
              {compliance[open.id]?.loading && (
                <p className="flex items-center gap-2 text-[#475569]"><Loader2 size={14} className="animate-spin" /> Running the deterministic check and asking the local model to word it…</p>
              )}
              {compliance[open.id]?.error && (
                <p className="text-rose-700">Check failed: {compliance[open.id].error} <button className="underline cursor-pointer" onClick={() => loadCompliance(open.id)}>Retry</button></p>
              )}
              {compliance[open.id]?.data && <ThenNow c={compliance[open.id].data} />}
            </section>
            {open.flags.length > 0 && (
              <section>
                <h4 className="text-[12px] text-[#64748B] mb-1.5">Policy impact flags</h4>
                <ul className="space-y-2">
                  {open.flags.map(f => (
                    <li key={f.id} className="rounded-lg border border-slate-200 p-2.5">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className={`text-[12px] px-1.5 py-0.5 rounded ${IMPACT[f.impact_type]?.cls}`}>{IMPACT[f.impact_type]?.label || f.impact_type}</span>
                        <IdChip id={`${f.clause_id}@${f.new_version}`} type="clause" />
                        {f.proposal_id && <IdChip id={`#${f.proposal_id}`} type="proposal" label="proposal" />}
                      </div>
                      <p className="text-[#334155] leading-relaxed">{polish(f.explanation)}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
