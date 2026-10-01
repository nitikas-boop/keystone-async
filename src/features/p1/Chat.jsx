import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, FileText, Hash, Lock, Megaphone, MessageCircle, Plus, Search, Send, Settings2, Sparkles, Users, X } from 'lucide-react';
import * as p1 from '../../api/p1';
import { todayIST } from '../../utils/format';
import { Badge, Btn, ErrorNote, Field, Input, useAction, useLoad } from './ui';

// Human chat: Organization (public org channels, private ones for their members), Teams (only the teams you are in;
// membership is the access, history included) and DMs (every employee; only the two participants read them, not
// even an admin). Polls every 3 s. Chat is never ingested or read by the model unless someone promotes a message to
// a decision note or saves the thread as a meeting note (both go to Ingestion Review).
const SCOPES = [['org', 'Organization', Hash], ['team', 'Teams', Users], ['dm', 'DMs', MessageCircle]];
const POLL_MS = 3000;

// **bold**, _italic_, `code` and @mentions; everything else is plain text (no HTML is ever injected).
function Formatted({ text, me }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|_[^_\s][^_]*_|@[a-z0-9_.-]+)/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(p)) return <code key={i} className="px-1 rounded bg-kb-ice/60 text-[12px]">{p.slice(1, -1)}</code>;
    if (/^_[^_\s][^_]*_$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
    if (/^@[a-z0-9_.-]+$/.test(p)) {
      return <span key={i} className={`px-0.5 rounded font-medium ${p.slice(1) === me ? 'bg-kb-butter text-kb-navy' : 'text-kb-cobalt-ink'}`}>{p}</span>;
    }
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}

function Count({ n, strong }) {
  if (!n) return null;
  return <span className={`ml-auto min-w-5 h-5 px-1 rounded-full text-[11px] font-bold flex items-center justify-center ${strong ? 'bg-kb-alert text-white' : 'bg-kb-navy text-white'}`}>{n}</span>;
}

function Row({ active, onClick, Icon, label, sub, unread, mentions, locked }) {
  return (
    <button type="button" onClick={onClick}
      className={`w-full text-left min-h-8 px-2 py-1 rounded-lg text-[13px] flex items-center gap-1.5 cursor-pointer ${active ? 'bg-kb-ice text-kb-cobalt-ink font-semibold' : unread ? 'font-semibold text-kb-navy hover:bg-kb-ice/60' : 'text-kb-navy hover:bg-kb-ice/60'}`}>
      <Icon size={13} className="shrink-0" />
      <span className="truncate">{label}{sub && <span className="block text-[11.5px] font-normal text-kb-muted truncate">{sub}</span>}</span>
      {locked && <Lock size={11} className="shrink-0 text-kb-muted/70" aria-label="private" />}
      <Count n={mentions || unread} strong={!!mentions} />
    </button>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-kb-navy/25 flex items-center justify-center p-4" role="dialog" aria-label={title}>
      <div className="paper-sheet-elevated bg-kb-bg rounded-2xl w-full max-w-md p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-semibold text-[14px]">{title}</h3>
          <button type="button" onClick={onClose} className="icon-btn" aria-label="Close"><X size={14} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PeoplePicker({ people, value, onChange, exclude = [] }) {
  const [q, setQ] = useState('');
  const shown = people.filter(p => !exclude.includes(p.user_id) && `${p.name} ${p.designation}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="flex flex-col gap-1.5">
      <Input placeholder="Search people" value={q} onChange={e => setQ(e.target.value)} />
      <div className="max-h-40 overflow-y-auto flex flex-col border border-kb-line rounded-lg p-1">
        {shown.map(p => (
          <label key={p.user_id} className="flex items-center gap-2 text-[13px] px-1.5 py-1 rounded hover:bg-kb-bg-soft cursor-pointer">
            <input type="checkbox" checked={value.includes(p.user_id)}
              onChange={e => onChange(e.target.checked ? [...value, p.user_id] : value.filter(x => x !== p.user_id))} />
            {p.name} <span className="text-kb-muted text-[12px]">{p.designation}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function NewChannel({ onClose, onCreated, people, team }) {
  const [f, setF] = useState({ name: '', topic: '', is_private: false, members: [] });
  const [run, busy, error] = useAction();
  const submit = (e) => {
    e.preventDefault();
    run(async () => onCreated(await p1.createChannel({ ...f, team_id: team?.id || null, members: f.is_private ? f.members : [] })));
  };
  return (
    <Modal title={team ? `New channel in ${team.name}` : 'New organization channel'} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Name"><Input required autoFocus placeholder="e.g. vendor-reviews" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Topic"><Input placeholder="What this channel is for" value={f.topic} onChange={e => setF({ ...f, topic: e.target.value })} /></Field>
        {!team && (
          <fieldset className="flex gap-4 text-[13px]">
            <label className="flex items-center gap-1.5"><input type="radio" checked={!f.is_private} onChange={() => setF({ ...f, is_private: false })} /> Public (everyone)</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked={f.is_private} onChange={() => setF({ ...f, is_private: true })} /> Private</label>
          </fieldset>
        )}
        {team && <p className="text-[12.5px] text-kb-muted">Every member of {team.name} can read and post here.</p>}
        {!team && f.is_private && <Field label="Members"><PeoplePicker people={people} value={f.members} onChange={m => setF({ ...f, members: m })} /></Field>}
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" type="submit" disabled={busy}>Create channel</Btn></div>
      </form>
    </Modal>
  );
}

function NewTeam({ onClose, onCreated, people, me }) {
  const [f, setF] = useState({ name: '', description: '', members: [] });
  const [run, busy, error] = useAction();
  const submit = (e) => { e.preventDefault(); run(async () => onCreated(await p1.createTeam(f))); };
  return (
    <Modal title="New team" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Name"><Input required autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Description"><Input value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Members (you are the team owner)"><PeoplePicker people={people} exclude={[me]} value={f.members} onChange={m => setF({ ...f, members: m })} /></Field>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" type="submit" disabled={busy}>Create team</Btn></div>
      </form>
    </Modal>
  );
}

function ManageTeam({ team, people, onClose, onChanged }) {
  const [run, busy, error] = useAction();
  const [add, setAdd] = useState([]);
  const name = (id) => people.find(p => p.user_id === id)?.name || id;
  const change = (body) => run(async () => { await p1.editTeam(team.id, body); await onChanged(); });
  return (
    <Modal title={`Manage ${team.name}`} onClose={onClose}>
      <div className="flex flex-col gap-1">
        {team.members.map(m => (
          <div key={m} className="flex items-center justify-between text-[13px]">
            <span>{name(m)} {m === team.lead_id && <Badge tone="sky">owner</Badge>}</span>
            {m !== team.lead_id && <Btn kind="danger" disabled={busy} onClick={() => change({ remove_member: m })}>Remove</Btn>}
          </div>
        ))}
      </div>
      <Field label="Add members"><PeoplePicker people={people} exclude={team.members} value={add} onChange={setAdd} /></Field>
      <ErrorNote error={error} />
      <div className="flex justify-end gap-2">
        <Btn onClick={onClose}>Done</Btn>
        <Btn kind="primary" disabled={busy || !add.length} onClick={() => run(async () => {
          for (const m of add) await p1.editTeam(team.id, { add_member: m });
          setAdd([]); await onChanged();
        })}>Add {add.length || ''}</Btn>
      </div>
    </Modal>
  );
}

export default function Chat({ me, notify, can = () => false, focus = null }) {
  const chans = useLoad(p1.channels);
  const dir = useLoad(p1.people);
  const teams = useLoad(p1.teams);
  const [scope, setScope] = useState('org');
  const [cid, setCid] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [ref, setRef] = useState('');
  const [card, setCard] = useState(null);
  const [q, setQ] = useState('');
  const [dialog, setDialog] = useState(null);  // {kind: 'channel' | 'team' | 'manage', team?}
  const [run, busy, error] = useAction();
  const end = useRef(null);
  const list = useMemo(() => chans.data || [], [chans.data]);
  const people = useMemo(() => (dir.data || []).filter(p => p.user_id !== me.user_id), [dir.data, me.user_id]);
  const myTeams = (teams.data || []).filter(t => t.is_member);
  const current = list.find(c => c.id === cid);
  const reloadChans = chans.reload;

  // Channel list (unread counts) refreshes on its own; the open channel's messages poll faster.
  useEffect(() => { const t = setInterval(reloadChans, POLL_MS * 2); return () => clearInterval(t); }, [reloadChans]);
  useEffect(() => { if (cid == null && list.length) setCid((list.find(c => c.name === 'general') || list[0]).id); }, [list, cid]);
  const load = useCallback(() => (cid == null ? Promise.resolve() : p1.messages(cid).then(setMsgs).catch(() => setMsgs([]))), [cid]);
  useEffect(() => { load(); const t = setInterval(load, POLL_MS); return () => clearInterval(t); }, [load]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs.length, cid]);
  useEffect(() => { if (current) setScope(current.scope); }, [current?.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const open = (id) => { setCid(id); setMsgs([]); p1.markRead(id).then(reloadChans).catch(() => {}); };
  useEffect(() => { if (focus?.cid) open(focus.cid); }, [focus]);  // eslint-disable-line react-hooks/exhaustive-deps
  const send = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    run(async () => {
      const r = await p1.postMessage(cid, text, ref.trim());
      setText(''); setRef('');
      if (r.asks_keystone) notify?.('Keystone is answering in this channel…');
      await load();
    });
  };
  const dmWith = (userId) => run(async () => {
    const r = await p1.openDm([userId]);
    await reloadChans(); open(r.id); setScope('dm'); setQ('');
  });
  const save = () => {
    const title = window.prompt('Title for the meeting note', `${current?.name || 'Chat'} discussion`);
    if (title) run(async () => { const r = await p1.saveThread(cid, title, todayIST()); notify?.(`Saving as ${r.document_id} (${r.visibility}); it will appear in Ingestion Review.`); });
  };
  const promote = (m) => {
    const title = window.prompt('Title for the decision note (goes to Ingestion Review)', m.body.slice(0, 60));
    if (title) run(async () => { const r = await p1.promoteMessage(cid, m.id, title, todayIST()); notify?.(`Promoted to ${r.document_id}; a reviewer checks it in Ingestion Review.`); });
  };
  const showCard = (userId) => { if (userId !== 'keystone') p1.personCard(userId).then(setCard).catch(() => {}); };

  const org = list.filter(c => c.scope === 'org');
  const dms = list.filter(c => c.scope === 'dm').sort((a, b) => String(b.last_at || '').localeCompare(String(a.last_at || '')));
  const inDm = new Set(dms.flatMap(d => d.with));
  const match = (s) => s.toLowerCase().includes(q.toLowerCase());
  const scopeUnread = (sc) => list.filter(c => c.scope === sc).reduce((n, c) => n + (c.unread || 0), 0);

  return (
    <div className="h-full flex gap-3 p-4 min-h-0">
      <aside className="w-64 shrink-0 paper-sheet p-3 flex flex-col gap-2 min-h-0" aria-label="Conversations">
        <div className="flex p-0.5 rounded-lg bg-kb-ice/60 border border-kb-line" role="tablist" aria-label="Chat scope">
          {SCOPES.map(([id, label, I]) => (
            <button key={id} type="button" role="tab" aria-selected={scope === id} onClick={() => { setScope(id); setQ(''); }}
              className={`flex-1 h-8 rounded-md text-[12.5px] flex items-center justify-center gap-1 cursor-pointer ${scope === id ? 'bg-kb-bg font-semibold shadow-xs text-kb-cobalt-ink' : 'text-kb-muted hover:text-kb-navy'}`}>
              <I size={12} /> {label}
              {scopeUnread(id) > 0 && <span className="w-1.5 h-1.5 rounded-full bg-kb-navy" aria-label="unread" />}
            </button>
          ))}
        </div>
        <ErrorNote error={chans.error} />

        <div className="flex-1 overflow-y-auto flex flex-col gap-0.5 min-h-0">
          {scope === 'org' && <>
            {can('channel.create') && <Btn className="mb-1 flex items-center gap-1.5 justify-center" onClick={() => setDialog({ kind: 'channel' })}><Plus size={13} /> Channel</Btn>}
            {org.map(c => <Row key={c.id} active={c.id === cid} onClick={() => open(c.id)} Icon={c.name === 'announcements' ? Megaphone : Hash}
              label={c.name} unread={c.unread} mentions={c.mentions} locked={c.is_private} />)}
          </>}

          {scope === 'team' && <>
            {can('team.create') && <Btn className="mb-1 flex items-center gap-1.5 justify-center" onClick={() => setDialog({ kind: 'team' })}><Plus size={13} /> Team</Btn>}
            {teams.data && myTeams.length === 0 && (
              <div className="text-[13px] text-kb-muted p-2 text-center">You&apos;re not in any team yet.</div>
            )}
            {myTeams.map(t => (
              <div key={t.id} className="flex flex-col gap-0.5 mb-2">
                <div className="flex items-center gap-1 px-1 text-[11.5px] uppercase tracking-wide text-kb-muted font-semibold">
                  <span className="truncate" title={t.description || ''}>{t.name}</span>
                  <span className="font-normal normal-case">· {t.members.length}</span>
                  {t.can_manage && <>
                    <button type="button" className="ml-auto icon-btn" title={`New channel in ${t.name}`} aria-label={`New channel in ${t.name}`} onClick={() => setDialog({ kind: 'channel', team: t })}><Plus size={12} /></button>
                    <button type="button" className="icon-btn" title={`Manage ${t.name} members`} aria-label={`Manage ${t.name}`} onClick={() => setDialog({ kind: 'manage', team: t })}><Settings2 size={12} /></button>
                  </>}
                </div>
                {list.filter(c => c.team_id === t.id).map(c => <Row key={c.id} active={c.id === cid} onClick={() => open(c.id)} Icon={Hash}
                  label={c.name} unread={c.unread} mentions={c.mentions} />)}
              </div>
            ))}
          </>}

          {scope === 'dm' && <>
            <div className="relative mb-1">
              <Search size={13} className="absolute left-2.5 top-2.5 text-kb-muted/70" />
              <Input className="w-full pl-7" placeholder="Search everyone" value={q} onChange={e => setQ(e.target.value)} aria-label="Search people to message" />
            </div>
            {dms.filter(d => match(d.name)).map(d => <Row key={d.id} active={d.id === cid} onClick={() => open(d.id)} Icon={MessageCircle}
              label={d.name} unread={d.unread} />)}
            {people.filter(p => !inDm.has(p.user_id) && match(`${p.name} ${p.designation || ''}`)).length > 0 && (
              <div className="px-1 pt-2 text-[11.5px] uppercase tracking-wide text-kb-muted font-semibold">Start a conversation</div>
            )}
            {people.filter(p => !inDm.has(p.user_id) && match(`${p.name} ${p.designation || ''}`)).map(p => (
              <Row key={p.user_id} onClick={() => dmWith(p.user_id)} Icon={MessageCircle} label={p.name} sub={p.designation} />
            ))}
          </>}
        </div>
      </aside>

      <section className="flex-1 min-w-0 paper-sheet p-3 flex flex-col min-h-0" aria-label="Messages">
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-kb-line">
          <div className="min-w-0">
            <div className="font-heading font-semibold text-[14px] truncate">
              {current ? (current.scope === 'dm' ? current.name : `#${current.name}`) : 'No conversation'}
              {current && <span className="ml-2 text-[12px] font-normal text-kb-muted">
                {current.scope === 'dm' ? 'private: only the two of you' : current.scope === 'team' ? `${current.team_name} · ${current.members} member(s)` : current.is_private ? `private · ${current.members} member(s)` : 'everyone in the organization'}
              </span>}
            </div>
            {current?.topic && <div className="text-[12px] text-kb-muted truncate">{current.topic}</div>}
          </div>
          <Btn disabled={!cid || busy || msgs.length === 0} onClick={save} className="flex items-center gap-1.5 shrink-0" title="Send this thread to Ingestion Review as a meeting note">
            <FileText size={13} /> Save as meeting note
          </Btn>
        </div>
        <div className="flex-1 overflow-y-auto py-2 flex flex-col gap-2.5 min-h-0">
          {msgs.length === 0 && <p className="text-[13px] text-kb-muted">No messages yet. Use **bold**, _italic_, `code`, @user_id to mention, or @keystone to ask the decision memory.</p>}
          {msgs.map(m => (
            <div key={m.id} className="group text-[13px] relative pr-8">
              <div className="flex items-center gap-2">
                <button className="font-semibold hover:underline cursor-pointer flex items-center gap-1" onClick={() => showCard(m.sender_id)}>
                  {m.sender_id === 'keystone' && <Bot size={13} className="text-kb-cobalt-ink" />}{m.sender}
                </button>
                <span className="text-[11.5px] text-kb-muted/70">{new Date(m.created_at).toLocaleString()}</span>
                {m.is_agent_drafted && <Badge tone="lavender">agent-drafted · approved by {m.approved_by}</Badge>}
              </div>
              <div className="whitespace-pre-wrap text-kb-navy"><Formatted text={m.body} me={me.user_id} /></div>
              {m.ref && (
                <div className="mt-1 inline-flex items-center gap-2 px-2 py-1 rounded-lg border border-kb-line bg-kb-bg-soft text-[12.5px]">
                  {m.ref.restricted ? <><Lock size={12} /> Restricted item</>
                    : <><span className="font-mono">{m.ref.id}</span> {m.ref.label !== m.ref.id && m.ref.label} {m.ref.type && <Badge>{m.ref.type}</Badge>}</>}
                </div>
              )}
              {!me.perms?.read_only && (
                <button type="button" onClick={() => promote(m)} title="Promote to decision note (Ingestion Review)" aria-label="Promote to decision note"
                  className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 focus:opacity-100 icon-btn"><Sparkles size={13} /></button>
              )}
            </div>
          ))}
          <div ref={end} />
        </div>
        <ErrorNote error={error} />
        {current && !current.can_post ? (
          <p className="pt-2 border-t border-kb-line text-[12.5px] text-kb-muted flex items-center gap-1.5"><Lock size={12} /> {current.name === 'announcements' ? 'Only executives post in #announcements. You can read it.' : 'You have read-only access.'}</p>
        ) : (
          <form onSubmit={send} className="flex gap-2 pt-2 border-t border-kb-line">
            <Input className="flex-1" placeholder={current ? `Message ${current.scope === 'dm' ? current.name : `#${current.name}`}` : 'Pick a conversation'} value={text} onChange={e => setText(e.target.value)} disabled={!cid} />
            <Input className="w-32 font-mono" placeholder="Share item ID" value={ref} onChange={e => setRef(e.target.value)} disabled={!cid} title="A decision or clause ID (e.g. DEC-007) to attach as a card" />
            <Btn kind="primary" type="submit" disabled={!cid || busy} className="flex items-center gap-1.5"><Send size={13} /> Send</Btn>
          </form>
        )}
      </section>

      {card && (
        <aside className="w-64 shrink-0 paper-sheet p-3 flex flex-col gap-2 text-[13px]">
          <div className="flex justify-between items-start">
            <div><div className="font-semibold">{card.name}</div><div className="text-[12px] text-kb-muted">{card.designation}</div></div>
            <button className="text-kb-muted cursor-pointer" onClick={() => setCard(null)} aria-label="Close">✕</button>
          </div>
          <div className="text-[12.5px]">Role: <b>{card.role}</b>{card.team && <> · Team: <b>{card.team}</b></>}</div>
          {card.user_id !== me.user_id && <Btn onClick={() => dmWith(card.user_id)}>Message {card.name.split(' ')[0]}</Btn>}
          <div className="text-[12px] text-kb-muted">Decisions they own that you can see</div>
          {card.decisions.length === 0 ? <div className="text-[12.5px] text-kb-muted">None visible to you.</div>
            : card.decisions.map(d => <div key={d.id} className="text-[12.5px]"><span className="font-mono">{d.id}</span> {d.label}</div>)}
        </aside>
      )}

      {dialog?.kind === 'channel' && <NewChannel team={dialog.team} people={people} onClose={() => setDialog(null)}
        onCreated={async (c) => { setDialog(null); await reloadChans(); open(c.id); setScope(c.scope); }} />}
      {dialog?.kind === 'team' && <NewTeam people={people} me={me.user_id} onClose={() => setDialog(null)}
        onCreated={async () => { setDialog(null); await Promise.all([teams.reload(), reloadChans()]); setScope('team'); }} />}
      {dialog?.kind === 'manage' && <ManageTeam team={(teams.data || []).find(t => t.id === dialog.team.id) || dialog.team} people={dir.data || []}
        onClose={() => setDialog(null)} onChanged={() => Promise.all([teams.reload(), reloadChans()])} />}
    </div>
  );
}
