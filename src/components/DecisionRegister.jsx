import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, FilePlus2, RefreshCw, Table2 } from 'lucide-react';
import { fetchDecisions, fetchFlags, fetchGraphView } from '../api';
import { useApp } from '../context';
import IdChip from './IdChip';
import DecisionPage from './DecisionPage';
import DateField from './DateField';
import { day, polish, todayIST } from '../utils/format';
import { displayName } from '../utils/people';
import { IMPACT } from '../utils/entities';

// Decision register: GET /decisions (as of today) + GET /flags, and SUPERSEDES edges from GET /graph/view. Opening a
// row opens its decision page, which is the only place compliance is computed (one model call per open).
const COLS = [
  { key: 'title', label: 'Decision' },
  { key: 'ownerName', label: 'Owner' },
  { key: 'decidedOn', label: 'Decided on' },
  { key: 'project', label: 'Project' },
  { key: 'reliedOn', label: 'Relied on' },
  { key: 'state', label: 'Status' },
  { key: 'flagCount', label: 'Policy impact' },
];
const STATE_CLS = { active: 'badge-note-green', superseded: 'badge-note-slate', stale: 'badge-note-amber' };


// asOf: the register as of that date (the same "as of" control as the graph); onRecord: Record (executives, leads)
// or Propose (members) a decision.
export default function DecisionRegister({ refreshKey = 0, focus, proposals = [], auditLogs = [], onRecord, recordLabel = 'Record a decision' }) {
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
  const [supersedes, setSupersedes] = useState({});  // decision -> the decision it replaced
  const [relied, setRelied] = useState({});          // decision -> ['RET-2.1@v2', ...]
  const [state, setState] = useState('');
  const [asOf, setAsOf] = useState(() => todayIST());

  const load = () => Promise.all([fetchDecisions(asOf), fetchFlags(), fetchGraphView(asOf, isReader)])
    .then(([d, f, g]) => {
      setDecisions(d); setFlags(f); setError(null);
      setSupersedes(Object.fromEntries(g.edges.filter(e => e.relation === 'SUPERSEDES' && /^DEC-/.test(e.source)).map(e => [e.source, e.target])));
      const r = {};
      g.edges.filter(e => e.relation === 'RELIED_ON').forEach(e => { (r[e.source] ||= []).push(e.target); });
      setRelied(r);
    })
    .catch(e => setError(e.message));
  useEffect(() => { load(); }, [refreshKey, asOf]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (focus) setOpenId(focus); }, [focus]);

  const rows = useMemo(() => (decisions || [])
    // /decisions returns restricted decisions to everyone (KNOWN_ISSUES.md); the register hides them unless the
    // viewer is a restricted reader, matching what retrieval allows.
    .filter(d => isReader || d.provenance?.visibility !== 'restricted')
    .map(d => {
      const a = d.attributes || {};
      const fl = flags.filter(f => f.decision_id === d.id);
      const replaced = a.status === 'superseded' || Object.values(supersedes).includes(d.id);
      const stale = fl.some(f => f.impact_type !== 'SUPERSEDED' && !f.resolved_at);
      return { id: d.id, title: polish(d.label), owner: a.owner, ownerName: a.owner ? displayName(a.owner, team) : '—',
        project: a.project || '—', decidedOn: a.decided_on || d.valid_from, status: a.status || '—', effect: a.effect,
        reasons: polish(a.reasons), flags: fl, flagCount: fl.length, restricted: d.provenance?.visibility === 'restricted',
        extracted: d.provenance?.extracted_by && d.provenance.extracted_by !== 'human', provenance: d.provenance,
        supersedes: supersedes[d.id], reliedOn: (relied[d.id] || []).join(', '),
        state: replaced ? 'superseded' : stale ? 'stale' : 'active' };
    }), [decisions, flags, team, isReader, supersedes, relied]);

  const owners = [...new Set(rows.map(r => r.ownerName))].sort();
  const projects = [...new Set(rows.map(r => r.project))].sort();
  const shown = rows
    .filter(r => (!q || `${r.id} ${r.title} ${r.reasons}`.toLowerCase().includes(q.toLowerCase()))
      && (!owner || r.ownerName === owner) && (!project || r.project === project) && (!flaggedOnly || r.flagCount)
      && (!state || r.state === state))
    .sort((a, b) => String(a[sort.key] ?? '').localeCompare(String(b[sort.key] ?? ''), undefined, { numeric: true }) * sort.dir);

  const open = rows.find(r => r.id === openId);
  if (open) {
    return <DecisionPage row={open} decisions={rows} flags={flags} proposals={proposals} auditLogs={auditLogs} onBack={() => setOpenId(null)} />;
  }

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
          <select value={state} onChange={e => setState(e.target.value)} className="field" aria-label="Filter by status">
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="superseded">Superseded</option>
            <option value="stale">Stale</option>
          </select>
          <label className="flex items-center gap-1.5 text-[13px] text-[#334155] cursor-pointer">
            <input type="checkbox" checked={flaggedOnly} onChange={e => setFlaggedOnly(e.target.checked)} /> Flagged only
          </label>
          <span className="flex items-center gap-1.5 text-[12.5px] text-[#64748B]">As of <DateField value={asOf} onChange={v => v && setAsOf(v)} label="Registry as of" /></span>
          <span className="ml-auto text-[12.5px] text-[#64748B]">{shown.length} of {rows.length} decisions</span>
          <button onClick={load} className="icon-btn" aria-label="Refresh decisions" title="Refresh"><RefreshCw size={13} /></button>
          {onRecord && <button onClick={onRecord} className="btn-secondary"><FilePlus2 size={13} /> {recordLabel}</button>}
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
              {error && <tr><td colSpan={COLS.length} className="p-6 text-center text-rose-700">Could not load decisions: {error}</td></tr>}
              {!error && !decisions && <tr><td colSpan={COLS.length} className="p-6 text-center text-[#64748B]">Loading…</td></tr>}
              {decisions && shown.length === 0 && <tr><td colSpan={COLS.length} className="p-6 text-center text-[#64748B]">No decisions match these filters.</td></tr>}
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
                  <td className="py-2 px-3 whitespace-nowrap">{day(r.decidedOn)}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{r.project}</td>
                  <td className="py-2 px-3 whitespace-nowrap font-mono text-[12px]">{r.reliedOn || '—'}</td>
                  <td className="py-2 px-3 whitespace-nowrap"><span className={`text-[12px] px-1.5 py-0.5 rounded capitalize ${STATE_CLS[r.state]}`}>{r.state}</span></td>
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

    </div>
  );
}
