import React, { useCallback, useEffect, useState } from 'react';
import {
  approvePolicyProposal, collision as fetchCollision, collisions as fetchCollisions, createProposal, policyProposals,
  rejectPolicyProposal, resolveCollision, scanDecisionConflicts, startReview, submitProposal,
} from '../../api/p2';
import { errText, Field, inputCls, Msg, Section, Table } from './common';

// C: policy proposals (draft -> proposed -> in_review -> active | rejected), the duplicate check's matches with the
// author's choice, the review lock, and collisions shown as two plain columns with the authority's ruling.
const EMPTY = { policy_id: 'POL-RET', clause_id: 'RET-2.1', title: '', clause_text: '', field: 'retention_days_max',
  new_value: '', effective_from: '', rationale: '' };

const ago = (iso) => `${Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000))} min ago`;
const value = (p) => (p.field ? `${p.field} = ${JSON.stringify(p.new_value)}` : '—');

export default function Proposals({ currentUser, onChanged }) {
  const me = currentUser?.id;
  const [rows, setRows] = useState([]);
  const [cols, setCols] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState(null);
  const [matches, setMatches] = useState(null);  // {id, list} after a submit that needs the author's choice
  const [choiceReason, setChoiceReason] = useState('');
  const [detail, setDetail] = useState(null);

  const load = useCallback(() => {
    policyProposals().then(setRows).catch(e => setMsg({ text: errText(e) }));
    fetchCollisions().then(setCols).catch(e => setMsg({ text: errText(e) }));
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, ok) => {
    // Approvals and rulings ingest a policy version; the scanner words each new flag with the local model.
    setMsg({ ok: true, text: 'Working… (an approval or ruling can take up to a minute)' });
    try {
      const out = await fn();
      setMsg({ ok: true, text: typeof ok === 'function' ? ok(out) : ok });
      load();
      onChanged?.();
      return out;
    } catch (e) {
      setMsg({ text: errText(e) });
      return null;
    }
  };

  const create = () => act(() => createProposal({ ...form, field: form.field || null,
    new_value: form.new_value === '' ? null : Number(form.new_value) }),
  p => `Draft ${p.ref} created; you now hold the claim on clause ${p.clause_id}.`).then(p => p && setForm(EMPTY));

  const submit = async (p, resolution = null) => {
    setMsg(null);
    try {
      const out = await submitProposal(p.id, resolution);
      setMatches(null);
      setChoiceReason('');
      const collide = (out.matches || []).filter(m => m.action === 'collide').length;
      setMsg({ ok: true, text: `${out.ref} is ${out.status}.` + (collide ? ` ${collide} conflict(s) sent to the authority as collisions.` : '') });
      load();
    } catch (e) {
      if (e.status === 409 && e.detail?.matches) setMatches({ id: p.id, list: e.detail.matches });
      else setMsg({ text: errText(e) });
    }
  };

  const openCollision = (id) => fetchCollision(id).then(setDetail).catch(e => setMsg({ text: errText(e) }));

  return (
    <div className="space-y-4">
      <Msg msg={msg} />
      <Section title="New draft proposal">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {['policy_id', 'clause_id', 'title', 'field'].map(k => (
            <Field key={k} label={k}><input className={inputCls} value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} /></Field>
          ))}
          <Field label="new_value"><input type="number" className={inputCls} value={form.new_value} onChange={e => setForm({ ...form, new_value: e.target.value })} /></Field>
          <Field label="effective_from"><input type="date" className={inputCls} value={form.effective_from} onChange={e => setForm({ ...form, effective_from: e.target.value })} /></Field>
          <Field label="rationale"><input className={inputCls} value={form.rationale} onChange={e => setForm({ ...form, rationale: e.target.value })} /></Field>
        </div>
        <Field label="clause_text"><textarea rows={2} className={inputCls} value={form.clause_text} onChange={e => setForm({ ...form, clause_text: e.target.value })} /></Field>
        <button className="btn-secondary" onClick={create}>Create draft (claims the clause)</button>
      </Section>

      {matches && (
        <Section title={`Possible duplicate or overlap for PROP-${matches.id}: choose what to do`}>
          <Table head={['Match', 'Layers', 'Similarity', 'Label', 'Action', 'Reason']}
                 rows={matches.list.map(m => ({ key: m.ref, cells: [m.ref, m.layers.join(', '), m.similarity ?? '—', m.label, m.action, m.reason] }))} />
          <Field label="Reason (required for Keep both)"><input className={inputCls} value={choiceReason} onChange={e => setChoiceReason(e.target.value)} /></Field>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => submit({ id: matches.id }, { choice: 'cancel', reason: choiceReason })}>Cancel my proposal</button>
            {matches.list.map(m => (
              <React.Fragment key={m.ref}>
                <button className="btn-secondary" onClick={() => submit({ id: matches.id }, { choice: 'link', target_ref: m.ref })}>Link to {m.ref}</button>
                <button className="btn-secondary" onClick={() => submit({ id: matches.id }, { choice: 'supersede', target_ref: m.ref })}>Supersede {m.ref}</button>
              </React.Fragment>
            ))}
            <button className="btn-secondary" onClick={() => submit({ id: matches.id }, { choice: 'keep_both', reason: choiceReason })}>Keep both</button>
          </div>
        </Section>
      )}

      <Section title="Policy proposals" actions={<button className="btn-secondary" onClick={load}>Refresh</button>}>
        <Table head={['Ref', 'Clause', 'Change', 'Effective', 'Author', 'Status', 'In progress', 'Actions']} empty="No policy proposals yet."
          rows={rows.map(p => ({ key: p.id, cells: [
            p.ref, p.clause_id, value(p), p.effective_from, p.author_id, p.status + (p.decision_reason ? ` (${p.decision_reason})` : ''),
            p.claim ? `${p.claim.owner_id} is working on this (claimed ${ago(p.claim.created_at)})` : '—',
            <div key="a" className="flex flex-wrap gap-1">
              {p.status === 'draft' && p.author_id === me && <button className="btn-secondary" onClick={() => submit(p)}>Submit</button>}
              {p.status === 'proposed' && p.author_id !== me && <button className="btn-secondary" onClick={() => act(() => startReview(p.id), `Reviewing ${p.ref}; it is locked for everyone else.`)}>Start review</button>}
              {p.status === 'in_review' && p.reviewer_id === me && <>
                <button className="btn-secondary" onClick={() => act(() => approvePolicyProposal(p.id), o => `${p.ref} approved: ${o.document_id} is the new policy version; scanner raised ${o.flags.length} flag(s).`)}>Approve</button>
                <button className="btn-secondary" onClick={() => { const r = window.prompt('Reason for rejecting'); if (r) act(() => rejectPolicyProposal(p.id, r), `${p.ref} rejected.`); }}>Reject</button>
              </>}
            </div>,
          ] }))} />
      </Section>

      <Section title="Collisions" actions={<button className="btn-secondary" onClick={() => act(scanDecisionConflicts, o => `${o.length} decision-vs-decision collision(s) open.`)}>Check decisions for conflicts</button>}>
        <Table head={['#', 'Type', 'Side A', 'Side B', 'Clause', 'Authority', 'Status', '']} empty="No collisions."
          rows={cols.map(c => ({ key: c.id, cells: [c.id, c.type, c.ref_a, c.ref_b, c.clause_id || '—', c.authority_id,
            c.status + (c.outcome ? `: ${c.outcome}` : ''), <button key="o" className="btn-secondary" onClick={() => openCollision(c.id)}>Open</button>] }))} />
      </Section>

      {detail && <CollisionDetail c={detail} onClose={() => setDetail(null)}
        onRule={(outcome, reason, merged) => act(() => resolveCollision(detail.id, outcome, reason, merged),
          o => `Collision #${o.id} resolved (${o.outcome}); ruling ${o.ruling_decision_id} recorded.`).then(o => o && setDetail(null))} />}
    </div>
  );
}

function Side({ s }) {
  const impact = s.impact?.counts;
  return (
    <div className="border border-kb-line rounded-md p-3 text-[12.5px] space-y-1">
      <div className="font-semibold">{s.ref} ({s.kind})</div>
      {s.kind === 'proposal' && <>
        <div>Author: {s.author_id} · created {s.created_at?.slice(0, 10)} · status {s.status}</div>
        <div>Clause {s.clause_id}: {value(s)} from {s.effective_from}</div>
        <div className="text-kb-muted">{s.clause_text}</div>
        {impact && <div>If adopted (from /whatif): {Object.entries(impact).map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`).join(', ') || 'no recorded decision relies on it'}</div>}
      </>}
      {s.kind === 'clause' && <><div>Active clause</div><div>{JSON.stringify(s.fields)}</div><div className="text-kb-muted">{s.clause_text}</div></>}
      {s.kind === 'decision' && <><div>{s.title}</div><div>Decided {s.decided_on} · {JSON.stringify(s.fields)}</div></>}
    </div>
  );
}

function CollisionDetail({ c, onClose, onRule }) {
  const [outcome, setOutcome] = useState('approve_a');
  const [reason, setReason] = useState('');
  const [merged, setMerged] = useState({ clause_text: '', new_value: '', effective_from: '' });
  return (
    <Section title={`Collision #${c.id} (type ${c.type}) · authority ${c.authority_id} · ${c.status}`}
             actions={<button className="btn-secondary" onClick={onClose}>Close</button>}>
      {c.in_force && <p className="text-[12.5px]">In force now: {c.in_force.ref} {JSON.stringify(c.in_force.fields)}</p>}
      <p className="text-[12.5px] text-kb-muted">{c.summary?.reason}</p>
      <div className="grid grid-cols-2 gap-3">{(c.sides || []).map(s => <Side key={s.ref} s={s} />)}</div>
      {c.status === 'open' && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-3 text-[12.5px]">
            {[['approve_a', `Approve ${c.ref_a}`], ['approve_b', `Approve ${c.ref_b}`], ['merge', 'Merge into a new proposal'],
              ['reject_both', 'Reject both'], ['request_changes', 'Request changes']].map(([v, l]) => (
              <label key={v} className="flex items-center gap-1"><input type="radio" name="outcome" checked={outcome === v} onChange={() => setOutcome(v)} />{l}</label>
            ))}
          </div>
          {outcome === 'merge' && (
            <div className="grid grid-cols-3 gap-2">
              <Field label="merged clause_text"><input className={inputCls} value={merged.clause_text} onChange={e => setMerged({ ...merged, clause_text: e.target.value })} /></Field>
              <Field label="merged new_value"><input type="number" className={inputCls} value={merged.new_value} onChange={e => setMerged({ ...merged, new_value: e.target.value })} /></Field>
              <Field label="merged effective_from"><input type="date" className={inputCls} value={merged.effective_from} onChange={e => setMerged({ ...merged, effective_from: e.target.value })} /></Field>
            </div>
          )}
          <Field label="Reason for the ruling (stored as a Decision)"><textarea rows={2} className={inputCls} value={reason} onChange={e => setReason(e.target.value)} /></Field>
          <button className="btn-secondary" onClick={() => onRule(outcome, reason, outcome === 'merge' ? {
            clause_text: merged.clause_text, ...(merged.new_value !== '' && { new_value: Number(merged.new_value) }),
            ...(merged.effective_from && { effective_from: merged.effective_from }) } : null)}>Record ruling</button>
        </div>
      )}
      {c.status === 'resolved' && <p className="text-[12.5px]">Ruled {c.outcome} by {c.resolved_by}: {c.ruling_reason} ({c.ruling_decision_id})</p>}
    </Section>
  );
}
