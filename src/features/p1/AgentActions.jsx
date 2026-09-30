import React, { useEffect, useState } from 'react';
import { Bot } from 'lucide-react';
import * as p1 from '../../api/p1';
import { Badge, Btn, ErrorNote, Field, Input, Section, Select, Table, useAction, useLoad, when } from './ui';

// E/G: the gate for agent-originated messages (keystone-comms over MCP). The agent only proposes; a person edits,
// approves or rejects here (or on a linked phone); the executor process delivers approved actions into chat.
const TONE = { proposed: 'amber', approved: 'sky', executed: 'green', rejected: 'slate', failed: 'rose' };

export default function AgentActions({ me }) {
  const [status, setStatus] = useState('');
  const list = useLoad(() => p1.actions(status), [status]);
  const dir = useLoad(p1.people);
  const [draft, setDraft] = useState({ tool: 'ping_user', user_id: '', text: '', ref_id: '' });
  const [edits, setEdits] = useState({});
  const [run, busy, error] = useAction();
  const act = (fn) => run(async () => { await fn(); await list.reload(); });
  const { reload } = list;
  useEffect(() => { const t = setInterval(reload, 5000); return () => clearInterval(t); }, [reload]);  // executor progress

  const propose = () => act(async () => {
    const key = draft.tool === 'ping_user' ? 'reason' : 'body';
    await p1.proposeAction(draft.tool, { user_id: draft.user_id, [key]: draft.text, ref_id: draft.ref_id || undefined });
    setDraft(d => ({ ...d, text: '', ref_id: '' }));
  });

  const rows = (list.data || []).map(a => {
    const text = a.payload.reason ?? a.payload.body;
    const editing = edits[a.id] !== undefined;
    return [
      <span className="font-mono">#{a.id}</span>,
      <div className="flex flex-col gap-1"><span className="font-mono text-[12px]">{a.tool}</span>{a.via === 'mcp' && <Badge>via MCP</Badge>}</div>,
      <span>{a.payload.user_id || `channel ${a.payload.channel_id}`}{a.payload.ref_id && <> · <span className="font-mono">{a.payload.ref_id}</span></>}</span>,
      editing ? <Input value={edits[a.id]} onChange={e => setEdits(s => ({ ...s, [a.id]: e.target.value }))} className="w-full" />
        : <span className="whitespace-pre-wrap">{text}</span>,
      <div className="flex flex-col gap-1"><Badge tone={TONE[a.status]}>{a.status}</Badge>
        <span className="text-[11.5px] text-[#64748B]">{a.proposed_by}{a.decided_by && ` → ${a.decided_by}`}</span>
        {a.result?.error && <span className="text-[11.5px] text-rose-700">{a.result.error}</span>}</div>,
      <span className="text-[12px] text-[#64748B]">{when(a.created_at)}</span>,
      a.status === 'proposed' ? (
        <div className="flex gap-1 flex-wrap">
          {editing
            ? <Btn disabled={busy} onClick={() => act(async () => { await p1.editAction(a.id, { [a.payload.reason !== undefined ? 'reason' : 'body']: edits[a.id] }); setEdits(s => { const n = { ...s }; delete n[a.id]; return n; }); })}>Save</Btn>
            : <Btn disabled={busy} onClick={() => setEdits(s => ({ ...s, [a.id]: text }))}>Edit</Btn>}
          <Btn kind="approve" disabled={busy || editing} onClick={() => act(() => p1.approveAction(a.id))}>Approve</Btn>
          <Btn kind="danger" disabled={busy} onClick={() => act(() => p1.rejectAction(a.id))}>Reject</Btn>
        </div>) : null,
    ];
  });

  return (
    <div className="p-4 flex flex-col gap-3 max-w-6xl">
      <Section title={<span className="flex items-center gap-2"><Bot size={15} className="text-[#0284C7]" /> Agent actions</span>}
        hint={me.role === 'owner' ? 'Every agent action in the organisation.' : 'Actions an agent drafted for you. Nothing is sent until you approve it.'}
        actions={<Select value={status} onChange={e => setStatus(e.target.value)}
          options={[{ value: '', label: 'All statuses' }, ...Object.keys(TONE)]} />}>
        <ErrorNote error={list.error || error} />
        <Table head={['', 'Tool', 'To', 'Message', 'Status', 'Created', '']} rows={rows} empty="No agent actions yet." />
      </Section>

      <Section title="Draft an action as an agent would"
        hint="The same call the keystone-comms MCP server makes: it only creates a proposal in the list above.">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
          <Field label="Tool"><Select value={draft.tool} onChange={e => setDraft(d => ({ ...d, tool: e.target.value }))} options={['ping_user', 'send_dm']} /></Field>
          <Field label="To"><Select value={draft.user_id} onChange={e => setDraft(d => ({ ...d, user_id: e.target.value }))}
            options={[{ value: '', label: 'Choose…' }, ...(dir.data || []).map(p => ({ value: p.user_id, label: p.name }))]} /></Field>
          <Field label={draft.tool === 'ping_user' ? 'Reason' : 'Message'}><Input value={draft.text} onChange={e => setDraft(d => ({ ...d, text: e.target.value }))} /></Field>
          <Field label="About item (optional)"><Input className="font-mono" placeholder="DEC-007" value={draft.ref_id} onChange={e => setDraft(d => ({ ...d, ref_id: e.target.value }))} /></Field>
        </div>
        <div><Btn kind="primary" disabled={busy || !draft.user_id || !draft.text.trim()} onClick={propose}>Propose</Btn></div>
      </Section>
    </div>
  );
}
