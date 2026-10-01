import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import * as p1 from '../../api/p1';
import { Badge, Btn, ErrorNote, Field, Input, Section, Select, Table, useAction, useLoad, when } from './ui';

// A, B, G, H: the organisation page. Tabs depend on the role; the server enforces every rule regardless.
const ROLES = ['member', 'lead', 'compliance', 'auditor', 'owner'];

export default function OrgAdmin({ me, notify }) {
  const admin = me.role === 'owner' || me.role === 'lead';
  const tabs = [
    admin && ['members', 'Members'], me.role === 'owner' && ['code', 'Join code'], ['teams', 'Teams'],
    me.role === 'owner' && ['access', 'Access'], ['plugins', 'Plugins'], ['devices', 'Linked devices'],
  ].filter(Boolean);
  const [tab, setTab] = useState(tabs[0][0]);
  const orgInfo = useLoad(p1.org);
  return (
    <div className="p-4 flex flex-col gap-3 max-w-6xl">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-heading font-semibold text-[15px]">{orgInfo.data?.name || me.org_name}</h2>
        <Badge tone="sky">you: {me.role}</Badge>
        <div className="flex gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200" role="tablist">
          {tabs.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`h-8 px-3 rounded-lg text-[13px] cursor-pointer ${tab === id ? 'bg-white font-semibold shadow-xs' : 'text-[#475569]'}`}>{label}</button>
          ))}
        </div>
      </div>
      {tab === 'members' && <Members me={me} />}
      {tab === 'code' && <JoinCode info={orgInfo} />}
      {tab === 'teams' && <Teams me={me} />}
      {tab === 'access' && <Access />}
      {tab === 'plugins' && <Plugins me={me} />}
      {tab === 'devices' && <Devices me={me} notify={notify} />}
    </div>
  );
}

function Members({ me }) {
  const list = useLoad(() => p1.members());
  const teams = useLoad(p1.teams);
  const [pick, setPick] = useState({});
  const [run, busy, error] = useAction();
  const act = (fn) => run(async () => { await fn(); await list.reload(); });
  const teamOpts = [{ value: '', label: 'No team' }, ...(teams.data || []).map(t => ({ value: t.id, label: t.name }))];
  const all = list.data || [];
  const pending = all.filter(m => m.status === 'pending');
  const owner = me.role === 'owner';
  return (
    <>
      <Section title={`Join requests (${pending.length})`} hint="Pending members see nothing until approved. A team lead admits members into their own team.">
        <ErrorNote error={list.error || error} />
        <Table head={['Name', 'Employee ID', 'Requested', 'Role', 'Team', 'Designation', '']} empty="No pending requests."
          rows={pending.map(m => {
            const p = pick[m.user_id] || { role: 'member', team_id: '', designation: '' };
            const set = (k) => (e) => setPick(s => ({ ...s, [m.user_id]: { ...p, [k]: e.target.value } }));
            return [m.name, <span className="font-mono">{m.employee_id}</span>, when(m.joined_at),
              owner ? <Select value={p.role} onChange={set('role')} options={ROLES} /> : 'member',
              owner ? <Select value={p.team_id} onChange={set('team_id')} options={teamOpts} /> : 'your team',
              owner ? <Input placeholder="e.g. Engineer" value={p.designation} onChange={set('designation')} aria-label={`Designation for ${m.name}`} /> : 'set by the owner',
              <div className="flex gap-1">
                <Btn kind="approve" disabled={busy} onClick={() => act(() => p1.approveJoin(m.user_id, { role: p.role, team_id: p.team_id || null, designation: p.designation || null }))}>Approve</Btn>
                <Btn kind="danger" disabled={busy} onClick={() => act(() => p1.rejectJoin(m.user_id))}>Reject</Btn>
              </div>];
          })} />
      </Section>
      <Section title="Members" hint={owner ? 'Change a role or team, or remove someone: access changes at once and is audited.' : 'Your team.'}>
        <Table head={['Name', 'Employee ID', 'Designation', 'Role', 'Team', 'Status', '']}
          rows={all.filter(m => m.status !== 'pending').map(m => [
            m.name, <span className="font-mono">{m.employee_id}</span>,
            owner && m.status === 'active'
              ? <Input defaultValue={m.designation || ''} placeholder="—" disabled={busy} aria-label={`Designation of ${m.name}`}
                  onBlur={e => e.target.value.trim() !== (m.designation || '') && act(() => p1.editMember(m.user_id, { designation: e.target.value }))} />
              : m.designation || '—',
            owner && m.status === 'active' ? <Select value={m.role} disabled={busy} onChange={e => act(() => p1.editMember(m.user_id, { role: e.target.value }))} options={ROLES} /> : m.role,
            owner && m.status === 'active' ? <Select value={m.team_id || ''} disabled={busy} onChange={e => e.target.value && act(() => p1.editMember(m.user_id, { team_id: e.target.value }))} options={teamOpts} />
              : (teams.data || []).find(t => t.id === m.team_id)?.name || '—',
            <Badge tone={m.status === 'active' ? 'green' : 'slate'}>{m.status}{m.role === 'auditor' && m.audit_from ? ` · ${m.audit_from}…${m.audit_to}` : ''}</Badge>,
            owner && m.status === 'active' && m.user_id !== me.user_id
              ? <Btn kind="danger" disabled={busy} onClick={() => window.confirm(`Remove ${m.name}? Their sessions and linked phones stop working at once.`) && act(() => p1.editMember(m.user_id, { status: 'removed' }))}>Remove</Btn> : null,
          ])} />
      </Section>
    </>
  );
}

function JoinCode({ info }) {
  const [fresh, setFresh] = useState(null);
  const [opts, setOpts] = useState({ expires_in_hours: '', max_uses: '' });
  const [run, busy, error] = useAction();
  const o = info.data;
  const num = (v) => (v === '' ? undefined : Number(v));
  const act = (fn) => run(async () => { await fn(); await info.reload(); });
  if (!o) return <ErrorNote error={info.error} />;
  return (
    <Section title="Join code" hint="8 characters without look-alikes (no 0/O, 1/I). Stored hashed and never logged; shown only when created. Joins are rate-limited per address.">
      <ErrorNote error={error} />
      {fresh && <div className="flex items-center gap-3"><span className="font-mono text-2xl tracking-widest px-4 py-2 rounded-lg bg-slate-50 border border-slate-200">{fresh.join_code}</span>
        <span className="text-[12.5px] text-[#64748B]">New code. Copy it now; it will not be shown again.</span></div>}
      <div className="text-[13px] flex gap-3 flex-wrap">
        <Badge tone={o.code?.disabled ? 'rose' : 'green'}>{o.code?.disabled ? 'disabled' : 'active'}</Badge>
        <span>Uses: {o.code?.uses}{o.code?.max_uses != null && ` / ${o.code.max_uses}`}</span>
        <span>Expires: {o.code?.expires_at ? when(o.code.expires_at) : 'never'}</span>
        <span>Approval: {o.require_approval ? 'required' : 'off'}</span>
      </div>
      <div className="flex gap-2 items-end flex-wrap">
        <Field label="Expires in (hours)"><Input type="number" min="1" value={opts.expires_in_hours} onChange={e => setOpts(s => ({ ...s, expires_in_hours: e.target.value }))} className="w-32" /></Field>
        <Field label="Max uses"><Input type="number" min="1" value={opts.max_uses} onChange={e => setOpts(s => ({ ...s, max_uses: e.target.value }))} className="w-28" /></Field>
        <Btn kind="primary" disabled={busy} onClick={() => act(async () => setFresh(await p1.rotateCode({ expires_in_hours: num(opts.expires_in_hours), max_uses: num(opts.max_uses) })))}>Generate new code</Btn>
        <Btn disabled={busy} onClick={() => act(() => p1.codeSettings({ disabled: !o.code?.disabled }))}>{o.code?.disabled ? 'Enable code' : 'Disable code'}</Btn>
        <Btn disabled={busy} onClick={() => act(() => p1.codeSettings({ require_approval: !o.require_approval }))}>{o.require_approval ? 'Turn approval off' : 'Require approval'}</Btn>
      </div>
    </Section>
  );
}

function Teams({ me }) {
  const list = useLoad(p1.teams);
  const dir = useLoad(p1.people);
  const [form, setForm] = useState({ name: '', lead_id: '', projects: '' });
  const [run, busy, error] = useAction();
  const name = (id) => (dir.data || []).find(p => p.user_id === id)?.name || id;
  return (
    <Section title="Teams" hint="A team owns projects. An item labelled 'team' is visible to the team that owns its project (plus Owner and Compliance).">
      <ErrorNote error={list.error || error} />
      <Table head={['Team', 'Lead', 'Projects', 'Members']} rows={(list.data || []).map(t => [
        t.name, t.lead_id ? name(t.lead_id) : '—', t.projects.join(', ') || '—', t.members.map(name).join(', ')])} />
      {me.role === 'owner' && (
        <div className="flex gap-2 items-end flex-wrap">
          <Field label="New team"><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></Field>
          <Field label="Lead"><Select value={form.lead_id} onChange={e => setForm(f => ({ ...f, lead_id: e.target.value }))}
            options={[{ value: '', label: 'None' }, ...(dir.data || []).map(p => ({ value: p.user_id, label: p.name }))]} /></Field>
          <Field label="Projects (comma-separated)"><Input value={form.projects} onChange={e => setForm(f => ({ ...f, projects: e.target.value }))} /></Field>
          <Btn kind="primary" disabled={busy || !form.name.trim()} onClick={() => run(async () => {
            await p1.createTeam({ name: form.name, lead_id: form.lead_id || null, projects: form.projects.split(',').map(s => s.trim()).filter(Boolean) });
            setForm({ name: '', lead_id: '', projects: '' }); await list.reload();
          })}>Create team</Btn>
        </div>
      )}
    </Section>
  );
}

function Access() {
  const grants = useLoad(p1.grants);
  const dir = useLoad(p1.people);
  const teams = useLoad(p1.teams);
  const [g, setG] = useState({ user_id: '', resource_id: '' });
  const [l, setL] = useState({ doc: '', visibility: 'team', team: '' });
  const [result, setResult] = useState(null);
  const [run, busy, error] = useAction();
  return (
    <>
      <ErrorNote error={grants.error || error} />
      <Section title="Relabel a source" hint="org: everyone · team: the team owning the project · restricted: Owner, Compliance and people granted it. The document's nodes and edges follow.">
        <div className="flex gap-2 items-end flex-wrap">
          <Field label="Document ID"><Input className="font-mono" placeholder="DEC-005" value={l.doc} onChange={e => setL(s => ({ ...s, doc: e.target.value }))} /></Field>
          <Field label="Visibility"><Select value={l.visibility} onChange={e => setL(s => ({ ...s, visibility: e.target.value }))} options={['org', 'team', 'restricted']} /></Field>
          <Field label="Team (optional)"><Select value={l.team} onChange={e => setL(s => ({ ...s, team: e.target.value }))}
            options={[{ value: '', label: "Follow the project's team" }, ...(teams.data || []).map(t => ({ value: t.id, label: t.name }))]} /></Field>
          <Btn kind="primary" disabled={busy || !l.doc.trim()} onClick={() => run(async () => setResult(await p1.relabel(l.doc.trim(), l.visibility, l.team)))}>Apply</Btn>
        </div>
        {result && <p className="text-[12.5px] text-[#475569]">{result.document_id} is now <b>{result.visibility}</b>: {result.nodes.length} node(s) and {result.edges} edge(s) relabelled.</p>}
      </Section>
      <Section title="Grants" hint="Open one item to one person, whatever its label. Granting and revoking are audited.">
        <Table head={['Person', 'Item', 'Granted by', 'When', '']} empty="No grants."
          rows={(grants.data || []).map(x => [x.name, <span className="font-mono">{x.resource_id}</span>, x.granted_by, when(x.created_at),
            <Btn kind="danger" disabled={busy} onClick={() => run(async () => { await p1.revokeGrant(x.id); await grants.reload(); })}>Revoke</Btn>])} />
        <div className="flex gap-2 items-end flex-wrap">
          <Field label="Person"><Select value={g.user_id} onChange={e => setG(s => ({ ...s, user_id: e.target.value }))}
            options={[{ value: '', label: 'Choose…' }, ...(dir.data || []).map(p => ({ value: p.user_id, label: p.name }))]} /></Field>
          <Field label="Item ID"><Input className="font-mono" placeholder="DEC-008" value={g.resource_id} onChange={e => setG(s => ({ ...s, resource_id: e.target.value }))} /></Field>
          <Btn kind="primary" disabled={busy || !g.user_id || !g.resource_id.trim()} onClick={() => run(async () => {
            await p1.grant(g.user_id, g.resource_id.trim()); setG({ user_id: '', resource_id: '' }); await grants.reload();
          })}>Grant</Btn>
        </div>
      </Section>
    </>
  );
}

function Plugins({ me }) {
  const list = useLoad(p1.plugins);
  const [results, setResults] = useState({});
  const [run, busy, error] = useAction();
  const canToggle = me.role === 'owner' || me.role === 'compliance';
  const show = (id) => run(async () => { const r = await p1.pluginResults(id); setResults(s => ({ ...s, [id]: r })); });
  return (
    <Section title="Plugins" hint="What each plugin can read and do. MCP servers only ever propose; rule packs feed the deterministic checker.">
      <ErrorNote error={list.error || error} />
      {(list.data || []).map(p => (
        <div key={p.id} className="border border-slate-200 rounded-lg p-3 flex flex-col gap-1.5 text-[13px]">
          <div className="flex items-center gap-2 flex-wrap">
            <b>{p.name}</b><Badge>{p.kind.replace('_', ' ')}</Badge><Badge tone={p.enabled ? 'green' : 'slate'}>{p.enabled ? 'enabled' : 'disabled'}</Badge>
            <div className="ml-auto flex gap-1">
              {p.kind === 'rule_pack' && <Btn disabled={busy} onClick={() => show(p.id)}>Run on decisions</Btn>}
              {canToggle && <Btn disabled={busy} onClick={() => run(async () => { await p1.setPlugin(p.id, !p.enabled); await list.reload(); if (results[p.id]) await show(p.id); })}>{p.enabled ? 'Disable' : 'Enable'}</Btn>}
            </div>
          </div>
          {p.description && <p className="text-[#475569]">{p.description}</p>}
          <div className="text-[12.5px]"><span className="text-[#64748B]">Reads:</span> {p.reads.join('; ')}</div>
          <div className="text-[12.5px]"><span className="text-[#64748B]">Can do:</span> {p.does.join('; ')}</div>
          {p.rules.map(r => <div key={r.id} className="text-[12.5px]"><span className="font-mono">{r.id}</span> {r.title} <span className="text-[#94A3B8]">({r.source})</span></div>)}
          {results[p.id] && (
            <div className="mt-1 text-[12.5px]">
              {!results[p.id].enabled ? <span className="text-[#64748B]">Disabled: the checker does not use this pack.</span>
                : results[p.id].results.length === 0 ? <span className="text-[#64748B]">No decision you can see is affected.</span>
                  : results[p.id].results.map(x => x.checks.map(c => (
                    <div key={x.decision_id + c.rule}><span className="font-mono">{x.decision_id}</span> {x.title}: <Badge tone={c.result === 'compliant' ? 'green' : 'rose'}>{c.result}</Badge> <span className="text-[#64748B]">expected {c.expected}, is {JSON.stringify(c.actual)}</span></div>)))}
            </div>
          )}
        </div>
      ))}
    </Section>
  );
}

function Devices({ me, notify }) {
  const list = useLoad(p1.devices);
  const [pairing, setPairing] = useState(null);  // {token, expires_at}
  const [left, setLeft] = useState(0);
  const [run, busy, error] = useAction();
  const isPhone = me.via === 'device';
  const { reload } = list;

  useEffect(() => {
    if (!pairing) return undefined;
    const t = setInterval(async () => {
      const s = Math.max(0, Math.round((new Date(pairing.expires_at) - Date.now()) / 1000));
      setLeft(s);
      const st = await p1.pairingStatus(pairing.token).catch(() => null);
      if (st?.paired) { setPairing(null); notify?.(`Linked ${st.device}`); reload(); }
      else if (s === 0) setPairing(null);
    }, 1500);
    return () => clearInterval(t);
  }, [pairing, reload, notify]);

  const link = pairing && `${window.location.origin}${window.location.pathname}?pair=${encodeURIComponent(pairing.token)}`;
  const local = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  return (
    <Section title="Linked devices" hint="Pair a phone to approve from it. The QR holds a one-time code that expires in about a minute.">
      <ErrorNote error={list.error || error} />
      {!isPhone && !pairing && <div><Btn kind="primary" disabled={busy} onClick={() => run(async () => { const r = await p1.startPairing(); setPairing(r); setLeft(r.ttl_seconds); })}>Pair a phone</Btn></div>}
      {pairing && (
        <div className="flex gap-4 items-center flex-wrap">
          <div className="p-3 bg-white border border-slate-200 rounded-lg"><QRCodeSVG value={link} size={180} /></div>
          <div className="text-[13px] flex flex-col gap-1 max-w-md">
            <span>Scan with the phone camera. Expires in <b>{left}s</b>.</span>
            <span className="font-mono text-[11.5px] break-all text-[#64748B]">{link}</span>
            {local && <span className="badge-note-amber text-[12px] px-2 py-1 rounded-md">This page is on {window.location.hostname}, which a phone cannot reach. Open Keystone by this laptop's LAN address (Vite with --host, backend on :8000 reachable) so the link works on the phone.</span>}
            <Btn onClick={() => setPairing(null)}>Cancel</Btn>
          </div>
        </div>
      )}
      <Table head={['Device', 'Paired', 'Last seen', 'Status', '']} empty="No linked devices."
        rows={(list.data || []).map(d => [d.label, when(d.created_at), when(d.last_seen),
          <Badge tone={d.revoked_at ? 'slate' : 'green'}>{d.revoked_at ? 'revoked' : 'active'}</Badge>,
          !d.revoked_at && !isPhone ? <Btn kind="danger" disabled={busy} onClick={() => run(async () => { await p1.revokeDevice(d.id); await list.reload(); })}>Revoke</Btn> : null])} />
    </Section>
  );
}
