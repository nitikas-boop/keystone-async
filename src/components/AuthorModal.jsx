import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FilePlus2, Loader2, Plus, Trash2, X } from 'lucide-react';
import { fetchDecisions, fetchDocument, fetchPolicies, uploadDocument } from '../api';
import { useApp } from '../context';
import DateField from './DateField';
import IdChip from './IdChip';
import { impactLabel } from '../utils/entities';
import { day, inr, plural, todayIST } from '../utils/format';
import {
  CLAUSE_NEEDS, clauseInForce, decisionDoc, nextDecisionId, nextVersion, policyDoc, validateDecision, validatePolicy,
} from '../utils/frontMatter';

// "Record a decision" and "Add policy version": forms that write the same Markdown + front-matter a person would,
// show it before saving, and send it to the existing POST /documents. Nothing here writes anywhere else.
export default function AuthorModal({ mode, onMode, onClose, onSaved, onProceed }) {
  const [known, setKnown] = useState(null);  // {decisions, policies}
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!mode) return;
    setResult(null); setFailure(null);
    Promise.all([fetchDecisions(), fetchPolicies()])
      .then(([decisions, policies]) => setKnown({ decisions, policies }))
      .catch(e => setLoadError(e.message));
  }, [mode]);

  if (!mode) return null;

  const save = async (id, markdown) => {
    setSaving(true); setFailure(null);
    try {
      const res = await uploadDocument(new File([markdown], `${id}.md`, { type: 'text/markdown' }));
      setResult(res);
      onSaved(res);
    } catch (err) {
      const d = typeof err.detail === 'string' ? err.detail : err.message;
      setFailure(err.status === 0 ? `${d}. Is the Docker stack running?` : d);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" role="dialog" aria-modal="true" aria-labelledby="author-title">
      <div className="w-full max-w-5xl max-h-[calc(100dvh-2rem)] flex flex-col paper-sheet-elevated text-[13px]">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-sky-50 text-[#0284C7]"><FilePlus2 size={18} aria-hidden="true" /></div>
          <h3 id="author-title" className="font-heading font-bold text-[15px] text-[#0F172A]">
            {mode === 'decision' ? 'Record a decision' : 'Add a policy version'}
          </h3>
          {!result && (
            <div className="flex gap-1 p-0.5 rounded-lg bg-slate-100 border border-slate-200 ml-2" role="tablist">
              {[['decision', 'Decision'], ['policy', 'Policy version']].map(([m, label]) => (
                <button key={m} role="tab" aria-selected={mode === m} onClick={() => onMode(m)}
                  className={`h-7 px-2.5 rounded-md cursor-pointer ${mode === m ? 'bg-white font-semibold shadow-xs' : 'text-[#475569]'}`}>{label}</button>
              ))}
            </div>
          )}
          <button onClick={onClose} className="ml-auto icon-btn" aria-label="Close" title="Close"><X size={16} /></button>
        </div>

        {loadError && <p className="p-5 text-rose-700">Could not load the existing records: {loadError}</p>}
        {!loadError && !known && <p className="p-5 text-[#64748B] flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading policies and decisions…</p>}
        {known && result && <Saved res={result} onClose={onClose} onProceed={onProceed} />}
        {known && !result && mode === 'decision' && <DecisionForm known={known} saving={saving} failure={failure} onSave={save} onCancel={onClose} />}
        {known && !result && mode === 'policy' && <PolicyForm known={known} saving={saving} failure={failure} onSave={save} onCancel={onClose} />}
      </div>
    </div>
  );
}

// Form on the left, the exact document on the right, problems and Save underneath.
function Layout({ form, markdown, problems, note, saving, failure, saveLabel, onSave, onCancel }) {
  return (
    <>
      <div className="flex-1 min-h-0 grid md:grid-cols-2 overflow-hidden">
        <div className="overflow-y-auto p-5 space-y-3 border-r border-slate-100">{form}</div>
        <div className="overflow-y-auto p-5 bg-slate-50 space-y-2">
          <div className="text-[12px] text-[#475569]">Preview: the document that will be ingested</div>
          <pre className="font-mono text-[12px] text-[#334155] whitespace-pre-wrap leading-relaxed" data-testid="author-preview">{markdown}</pre>
        </div>
      </div>
      <div className="px-5 py-3 border-t border-slate-100 space-y-2">
        {problems.length > 0 && (
          <ul className="text-[12.5px] text-amber-900 space-y-0.5" aria-label="Problems">
            {problems.map(p => <li key={p} className="flex items-start gap-1.5"><AlertTriangle size={13} className="shrink-0 mt-0.5" aria-hidden="true" />{p}</li>)}
          </ul>
        )}
        {note && <p className="text-[12.5px] text-[#475569]">{note}</p>}
        {failure && <p className="p-2 rounded-md bg-rose-50 border border-rose-200 text-rose-900" role="alert">The server rejected it, nothing was saved: <span className="font-mono">{failure}</span></p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="btn-secondary">Cancel</button>
          <button onClick={onSave} disabled={problems.length > 0 || saving}
            className="px-4 py-2 rounded-lg btn-sky-gradient text-white font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            {saving && <Loader2 size={14} className="animate-spin" />} {saveLabel}
          </button>
        </div>
      </div>
    </>
  );
}

const Field = ({ label, hint, children }) => (
  <label className="block">
    <span className="block text-[12px] font-medium text-[#334155] mb-1">{label}</span>
    {children}
    {hint && <span className="block text-[12px] text-[#64748B] mt-0.5">{hint}</span>}
  </label>
);

function DecisionForm({ known, saving, failure, onSave, onCancel }) {
  const { team, titles, isReader } = useApp();
  const ids = known.decisions.map(d => d.id);
  const visible = known.decisions.filter(d => isReader || d.provenance?.visibility !== 'restricted');
  const allClauses = [...new Set(known.policies.flatMap(p => p.versions.flatMap(v => v.clauses.map(c => c.clause_id))))].sort();
  const projects = [...new Set(known.decisions.map(d => d.attributes?.project).filter(Boolean))].sort();
  const meetings = [...titles.keys()].filter(k => /^MTG-/.test(k)).sort();
  const [f, setF] = useState(() => ({ id: nextDecisionId(ids), title: '', decidedOn: todayIST(), owner: '', project: '',
    reliedOn: [], fields: {}, effect: 'completed', supersedes: '', source: '', visibility: 'org', reasons: '' }));
  const set = (patch) => setF(x => ({ ...x, ...patch }));
  const setField = (k, v) => setF(x => ({ ...x, fields: { ...x.fields, [k]: v } }));

  // The decision fields the checked clauses need for the deterministic check (e.g. amount and approver role).
  const inForce = f.reliedOn.map(cid => [cid, clauseInForce(known.policies, cid, f.decidedOn)]);
  const needs = inForce.flatMap(([, c]) => (c?.checkable ? Object.keys(c.fields || {}) : [])
    .flatMap(rf => (CLAUSE_NEEDS[rf] || []).map(n => ({ ...n, roles: Object.keys(c.fields[rf] || {}) }))))
    .filter((n, i, all) => all.findIndex(m => m.key === n.key) === i);
  const doc = { ...f, fields: Object.fromEntries(needs.map(n => [n.key, f.fields[n.key]])) };
  const markdown = decisionDoc(doc);
  const problems = validateDecision(doc, { decisionIds: ids, policies: known.policies });

  return (
    <Layout markdown={markdown} problems={problems} saving={saving} failure={failure} saveLabel="Save decision"
      onSave={() => onSave(f.id, markdown)} onCancel={onCancel}
      note="Saving stores the decision and links it in the graph to its owner, project and the clause versions in force on its date. Compliance is checked when someone asks or opens it."
      form={<>
        <div className="grid grid-cols-[8rem_1fr] gap-3">
          <Field label="ID"><input className="field w-full font-mono" value={f.id} onChange={e => set({ id: e.target.value.toUpperCase() })} /></Field>
          <Field label="Title"><input className="field w-full" value={f.title} placeholder="Sign the Acme hosting contract" onChange={e => set({ title: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Decided on"><DateField value={f.decidedOn} onChange={v => set({ decidedOn: v })} label="Decided on" /></Field>
          <Field label="Decided by">
            <select className="field w-full" value={f.owner} onChange={e => set({ owner: e.target.value })}>
              <option value="">Choose a person…</option>
              {team.map(p => <option key={p.id} value={p.id}>{p.name} ({p.role})</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Project">
            <input className="field w-full" list="author-projects" value={f.project} onChange={e => set({ project: e.target.value })} />
            <datalist id="author-projects">{projects.map(p => <option key={p} value={p} />)}</datalist>
          </Field>
          <Field label="Effect" hint={f.effect === 'ongoing' ? 'A standing practice: re-checked when a later policy version changes.' : 'A one-off action, judged by the rule in force when it was taken.'}>
            <select className="field w-full" value={f.effect} onChange={e => set({ effect: e.target.value })}>
              <option value="completed">One-off (completed)</option>
              <option value="ongoing">Ongoing practice</option>
            </select>
          </Field>
        </div>
        <fieldset>
          <legend className="text-[12px] font-medium text-[#334155] mb-1">Policy clauses it relied on</legend>
          <div className="flex flex-wrap gap-1.5">
            {allClauses.map(cid => {
              const on = f.reliedOn.includes(cid);
              const c = clauseInForce(known.policies, cid, f.decidedOn);
              return (
                <label key={cid} className={`px-2 py-1 rounded-md border cursor-pointer ${on ? 'border-sky-400 bg-sky-50' : 'border-slate-200'}`}>
                  <input type="checkbox" className="mr-1.5 align-middle" checked={on}
                    onChange={() => set({ reliedOn: on ? f.reliedOn.filter(x => x !== cid) : [...f.reliedOn, cid] })} />
                  <span className="font-mono">{cid}</span>
                  <span className="ml-1 text-[12px] text-[#64748B]">{c ? `${c.version} on that date` : 'not in force then'}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        {needs.length > 0 && (
          <div className="rounded-lg border border-slate-200 p-3 space-y-2">
            <p className="text-[12px] text-[#475569]">These clauses are machine-checked, so Keystone needs the values the check compares:</p>
            <div className="grid grid-cols-2 gap-3">
              {needs.map(n => (
                <Field key={n.key} label={n.label} hint={n.kind === 'number' && f.fields[n.key] && n.key === 'amount_inr' && /^\d+$/.test(f.fields[n.key]) ? inr(Number(f.fields[n.key])) : null}>
                  {n.kind === 'role'
                    ? <select className="field w-full" value={f.fields[n.key] || ''} onChange={e => setField(n.key, e.target.value)}>
                        <option value="">Choose…</option>
                        {n.roles.map(r => <option key={r}>{r}</option>)}
                      </select>
                    : <input className="field w-full" inputMode="numeric" value={f.fields[n.key] || ''} onChange={e => setField(n.key, e.target.value.replace(/[^\d.]/g, ''))} />}
                </Field>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Replaces an earlier decision (optional)">
            <select className="field w-full" value={f.supersedes} onChange={e => set({ supersedes: e.target.value })}>
              <option value="">None</option>
              {visible.map(d => <option key={d.id} value={d.id}>{d.id}: {d.label}</option>)}
            </select>
          </Field>
          <Field label="Discussed in (optional)">
            <select className="field w-full" value={f.source} onChange={e => set({ source: e.target.value })}>
              <option value="">No meeting note</option>
              {meetings.map(m => <option key={m} value={m}>{m}: {titles.get(m)}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Reason" hint="Why it was decided. This is what answers to “why did we…?” quote.">
          <textarea className="field w-full h-24 py-1.5" value={f.reasons} onChange={e => set({ reasons: e.target.value })} />
        </Field>
        <Field label="Who can see it">
          <select className="field w-full" value={f.visibility} onChange={e => set({ visibility: e.target.value })}>
            <option value="org">Everyone in the organisation</option>
            <option value="restricted">Restricted (CEO, compliance lead, admin)</option>
          </select>
        </Field>
      </>}
    />
  );
}

// Rules a new clause can carry, matching the checkable fields in backend/app/compliance.py.
const RULE_TEMPLATES = {
  none: {},
  retention: { retention_days_max: null },
  approval: { approver_threshold_inr: { CTO: null, CEO: null } },
};

function PolicyForm({ known, saving, failure, onSave, onCancel }) {
  const [policyId, setPolicyId] = useState(known.policies[0]?.policy_id || 'NEW');
  const [f, setF] = useState(null);
  const prev = known.policies.find(p => p.policy_id === policyId)?.versions.slice().sort((a, b) => a.valid_from.localeCompare(b.valid_from)).pop();

  // Start from the latest version: its clauses, and its title from the stored front-matter.
  useEffect(() => {
    const p = known.policies.find(x => x.policy_id === policyId);
    const base = { policyId: p ? policyId : 'POL-', version: p ? nextVersion(p.versions.map(v => v.version)) : 'v1', title: '',
      effectiveFrom: todayIST(), summary: '',
      clauses: prev ? prev.clauses.map(c => ({ ...c, fields: structuredClone(c.fields || {}) })) : [{ clause_id: '', title: '', text: '', fields: {}, checkable: false }] };
    setF(base);
    if (prev) fetchDocument(prev.document_id).then(d => setF(x => (x && !x.title ? { ...x, title: d.front_matter?.title || '' } : x))).catch(() => {});
  }, [policyId]);

  const markdown = useMemo(() => (f ? policyDoc(f) : ''), [f]);
  if (!f) return null;
  const problems = validatePolicy(f, { policies: known.policies });
  const set = (patch) => setF(x => ({ ...x, ...patch }));
  const setClause = (i, patch) => setF(x => ({ ...x, clauses: x.clauses.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const was = (i, get) => {
    const old = prev?.clauses.find(c => c.clause_id === f.clauses[i].clause_id);
    return old ? get(old) : undefined;
  };
  const num = (v) => (v === '' ? null : Number(v));

  return (
    <Layout markdown={markdown} problems={problems} saving={saving} failure={failure} saveLabel="Save and run the impact scanner"
      onSave={() => onSave(`${f.policyId}-${f.version}`, markdown)} onCancel={onCancel}
      note="Saving runs the impact scanner: every decision that relied on a changed clause is re-checked, and flags and proposals may be raised for review. Nothing is sent without a human approving it."
      form={<>
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Field label="Policy">
            <select className="field w-full" value={policyId} onChange={e => setPolicyId(e.target.value)}>
              {known.policies.map(p => <option key={p.policy_id}>{p.policy_id}</option>)}
              <option value="NEW">A new policy…</option>
            </select>
          </Field>
          <Field label="Version"><input className="field w-full font-mono" value={f.version} onChange={e => set({ version: e.target.value })} /></Field>
        </div>
        {policyId === 'NEW' && <Field label="New policy ID"><input className="field w-full font-mono" value={f.policyId} onChange={e => set({ policyId: e.target.value.toUpperCase() })} /></Field>}
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Title"><input className="field w-full" value={f.title} onChange={e => set({ title: e.target.value })} /></Field>
          <Field label="Takes effect" hint={prev ? `${prev.version} took effect ${day(prev.valid_from)}` : null}>
            <DateField value={f.effectiveFrom} onChange={v => set({ effectiveFrom: v })} label="Takes effect" />
          </Field>
        </div>
        <Field label="What changed (optional)"><input className="field w-full" value={f.summary} placeholder="Lowers the CTO approval ceiling." onChange={e => set({ summary: e.target.value })} /></Field>

        {f.clauses.map((c, i) => {
          const fields = c.fields || {};
          return (
            <fieldset key={i} className="rounded-lg border border-slate-200 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input className="field w-28 font-mono" aria-label="Clause ID" placeholder="RET-5.1" value={c.clause_id} onChange={e => setClause(i, { clause_id: e.target.value })} />
                <input className="field flex-1" aria-label="Clause title" placeholder="Clause title" value={c.title} onChange={e => setClause(i, { title: e.target.value })} />
                <button className="icon-btn" aria-label={`Remove clause ${c.clause_id}`} title="Remove clause"
                  onClick={() => set({ clauses: f.clauses.filter((_, j) => j !== i) })}><Trash2 size={13} /></button>
              </div>
              <textarea className="field w-full h-16 py-1.5" aria-label="Clause text" value={c.text} onChange={e => setClause(i, { text: e.target.value })} />
              {was(i, o => o.text) !== undefined && was(i, o => o.text) !== c.text && <p className="text-[12px] text-[#92400E]">Text changed from {prev.version}.</p>}
              {'retention_days_max' in fields && (
                <Field label="Maximum retention (days)" hint={was(i, o => o.fields?.retention_days_max) !== undefined && was(i, o => o.fields?.retention_days_max) !== fields.retention_days_max ? `was ${was(i, o => o.fields?.retention_days_max)} in ${prev.version}` : null}>
                  <input className="field w-32" inputMode="numeric" value={fields.retention_days_max ?? ''}
                    onChange={e => setClause(i, { fields: { ...fields, retention_days_max: num(e.target.value.replace(/\D/g, '')) } })} />
                </Field>
              )}
              {'approver_threshold_inr' in fields && (
                <div className="grid grid-cols-2 gap-3">
                  {Object.keys(fields.approver_threshold_inr).map(role => {
                    const old = was(i, o => o.fields?.approver_threshold_inr?.[role]);
                    const v = fields.approver_threshold_inr[role];
                    return (
                      <Field key={role} label={`${role} may approve up to (₹)`} hint={`${v == null ? 'Empty = no limit' : inr(v)}${old !== undefined && old !== v ? ` · was ${old == null ? 'no limit' : inr(old)}` : ''}`}>
                        <input className="field w-full" inputMode="numeric" value={v ?? ''}
                          onChange={e => setClause(i, { fields: { ...fields, approver_threshold_inr: { ...fields.approver_threshold_inr, [role]: num(e.target.value.replace(/\D/g, '')) } } })} />
                      </Field>
                    );
                  })}
                </div>
              )}
              {!c.clause_id || prev?.clauses.some(o => o.clause_id === c.clause_id) ? null : (
                <Field label="Machine-checkable rule">
                  <select className="field" value={'retention_days_max' in fields ? 'retention' : 'approver_threshold_inr' in fields ? 'approval' : 'none'}
                    onChange={e => setClause(i, { fields: structuredClone(RULE_TEMPLATES[e.target.value]), checkable: e.target.value !== 'none' })}>
                    <option value="none">None (open-textured, judged by people)</option>
                    <option value="retention">Maximum retention in days</option>
                    <option value="approval">Approval ceilings by role</option>
                  </select>
                </Field>
              )}
              <label className="flex items-center gap-1.5 text-[12.5px] text-[#334155]">
                <input type="checkbox" checked={!!c.checkable} onChange={e => setClause(i, { checkable: e.target.checked })} />
                Machine-checkable (the deterministic check compares decisions against its values)
              </label>
            </fieldset>
          );
        })}
        <button className="btn-secondary" onClick={() => set({ clauses: [...f.clauses, { clause_id: '', title: '', text: '', fields: {}, checkable: false }] })}>
          <Plus size={13} /> Add a clause
        </button>
      </>}
    />
  );
}

function Saved({ res, onClose, onProceed }) {
  const flags = res.flags || [];
  const isPolicy = res.doc_type === 'policy_version';
  return (
    <div className="p-5 space-y-3">
      <p className="flex items-center gap-2 flex-wrap"><CheckCircle2 size={16} className="text-emerald-700" aria-hidden="true" />
        Stored <IdChip id={res.document_id} withTitle /> ({res.doc_type.replace('_', ' ')}), dated {day(res.ref_time)}.</p>
      {isPolicy && (flags.length === 0
        ? <p className="text-[#475569]">The impact scanner raised no flags: no recorded decision relied on a clause this version changed in a way that matters.</p>
        : <>
            <p>The impact scanner raised {plural(flags.length, 'flag')}:</p>
            <ul className="space-y-1.5">
              {flags.map(fl => (
                <li key={fl.id} className="flex items-center gap-2 flex-wrap">
                  <span className="px-1.5 py-0.5 rounded badge-note-rose text-[12px]">{impactLabel(fl.impact_type)}</span>
                  <IdChip id={fl.decision_id} type="decision" withTitle />
                  {fl.proposal_id ? <>proposal <IdChip id={`#${fl.proposal_id}`} type="proposal" /> waits in the Inbox</> : 'historical only'}
                </li>
              ))}
            </ul>
          </>)}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="btn-secondary">Close</button>
        {isPolicy && flags.some(fl => fl.proposal_id) && <button onClick={() => { onClose(); onProceed('proposals'); }} className="px-4 py-2 rounded-lg btn-sky-gradient text-white font-medium cursor-pointer">Open the Inbox →</button>}
      </div>
    </div>
  );
}
