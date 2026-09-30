import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, FileText, Hash, Lock, MessageCircle, Send, Users } from 'lucide-react';
import * as p1 from '../../api/p1';
import { todayIST } from '../../utils/format';
import { Badge, Btn, ErrorNote, Input, Select, useAction, useLoad } from './ui';

// E: channels (global, team, group, DM), messages, @mentions, @keystone, cards, people cards, and "Save as meeting
// note". Polling, no WebSockets. Chat is never read by the model unless someone saves a thread.
const ICON = { global: Hash, team: Users, group: Users, dm: MessageCircle };
// Messaging scope above the message box: the whole organisation (#general), a team (or group), or one person.
const SCOPES = [['org', 'Organisation', Hash], ['team', 'Team', Users], ['dm', '1 to 1', MessageCircle]];
const scopeOf = (type) => (type === 'global' ? 'org' : type === 'dm' ? 'dm' : 'team');

export default function Chat({ me, notify }) {
  const chans = useLoad(p1.channels);
  const dir = useLoad(p1.people);
  const [cid, setCid] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [ref, setRef] = useState('');
  const [card, setCard] = useState(null);
  const [dmWith, setDmWith] = useState('');
  const [pickDm, setPickDm] = useState(false);  // '1 to 1' chosen but no person picked yet
  const [run, busy, error] = useAction();
  const end = useRef(null);
  const list = chans.data || [];
  const current = list.find(c => c.id === cid);

  useEffect(() => { if (cid == null && chans.data?.length) setCid(chans.data[0].id); }, [chans.data, cid]);
  const load = useCallback(() => (cid == null ? Promise.resolve() : p1.messages(cid).then(setMsgs).catch(() => setMsgs([]))), [cid]);
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [load]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs.length]);

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
  const openDmWith = (userId) => run(async () => {
    const r = await p1.openDm([userId]);
    await chans.reload(); setCid(r.id); setDmWith(''); setPickDm(false);
  });
  const openDm = () => openDmWith(dmWith);
  const scope = pickDm ? 'dm' : current ? scopeOf(current.type) : 'org';
  const inScope = (sc) => list.filter(c => scopeOf(c.type) === sc);
  const chooseScope = (sc) => {
    const first = inScope(sc)[0];
    setPickDm(sc === 'dm');
    if (sc !== 'dm' && first) setCid(first.id);
  };
  const save = () => {
    const title = window.prompt('Title for the meeting note', `${current?.name || 'Chat'} discussion`);
    if (!title) return;
    run(async () => {
      const r = await p1.saveThread(cid, title, todayIST());
      notify?.(`Saving as ${r.document_id} (${r.visibility}); it will appear in Ingestion Review.`);
    });
  };
  const showCard = (userId) => { if (userId !== 'keystone') p1.personCard(userId).then(setCard).catch(() => {}); };

  return (
    <div className="h-full flex gap-3 p-4 min-h-0">
      <aside className="w-60 shrink-0 paper-sheet p-3 flex flex-col gap-2 min-h-0">
        <h3 className="font-heading font-semibold text-[13px]">Channels</h3>
        <ErrorNote error={chans.error} />
        <nav className="flex flex-col gap-0.5 overflow-y-auto">
          {list.map(c => {
            const I = ICON[c.type] || Hash;
            return (
              <button key={c.id} onClick={() => setCid(c.id)}
                className={`text-left h-8 px-2 rounded-lg text-[13px] flex items-center gap-1.5 cursor-pointer ${c.id === cid ? 'bg-sky-50 text-[#0369A1] font-semibold' : 'hover:bg-slate-100'}`}>
                <I size={13} /> <span className="truncate">{c.name}</span>
                {(c.type === 'dm' || c.type === 'group') && <Lock size={11} className="ml-auto text-[#94A3B8]" aria-label="private" />}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-1.5 pt-2 border-t border-slate-100">
          <span className="text-[12px] text-[#64748B]">Direct message</span>
          <Select value={dmWith} onChange={e => setDmWith(e.target.value)}
            options={[{ value: '', label: 'Choose a person…' }, ...(dir.data || []).filter(p => p.user_id !== me.user_id)
              .map(p => ({ value: p.user_id, label: `${p.name}${p.designation ? ` · ${p.designation}` : ''}` }))]} />
          <Btn disabled={!dmWith || busy} onClick={openDm}>Open DM</Btn>
        </div>
      </aside>

      <section className="flex-1 min-w-0 paper-sheet p-3 flex flex-col min-h-0">
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div className="font-heading font-semibold text-[14px]">{current ? current.name : 'No channel'}
            {current && <span className="ml-2 text-[12px] font-normal text-[#64748B]">{current.type} · {current.members} member(s)</span>}</div>
          <Btn disabled={!cid || busy || msgs.length === 0} onClick={save} className="flex items-center gap-1.5" title="Send this thread to Ingestion Review as a meeting note">
            <FileText size={13} /> Save as meeting note
          </Btn>
        </div>
        <div className="flex-1 overflow-y-auto py-2 flex flex-col gap-2 min-h-0">
          {msgs.length === 0 && <p className="text-[13px] text-[#64748B]">No messages yet. Type <span className="font-mono">@keystone</span> and a question to ask the decision memory here.</p>}
          {msgs.map(m => (
            <div key={m.id} className="text-[13px]">
              <div className="flex items-center gap-2">
                <button className="font-semibold hover:underline cursor-pointer flex items-center gap-1" onClick={() => showCard(m.sender_id)}>
                  {m.sender_id === 'keystone' && <Bot size={13} className="text-[#0284C7]" />}{m.sender}
                </button>
                <span className="text-[11.5px] text-[#94A3B8]">{new Date(m.created_at).toLocaleString()}</span>
                {m.is_agent_drafted && <Badge tone="lavender">agent-drafted · approved by {m.approved_by}</Badge>}
              </div>
              <div className="whitespace-pre-wrap text-[#334155]">{m.body}</div>
              {m.ref && (
                <div className="mt-1 inline-flex items-center gap-2 px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-[12.5px]">
                  {m.ref.restricted ? <><Lock size={12} /> Restricted item</>
                    : <><span className="font-mono">{m.ref.id}</span> {m.ref.label !== m.ref.id && m.ref.label} {m.ref.type && <Badge>{m.ref.type}</Badge>}</>}
                </div>
              )}
            </div>
          ))}
          <div ref={end} />
        </div>
        <ErrorNote error={error} />
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 flex-wrap" role="group" aria-label="Messaging scope">
          <span className="text-[12px] text-[#64748B]">Send to</span>
          <div className="flex gap-1 p-0.5 rounded-lg bg-slate-100 border border-slate-200">
            {SCOPES.map(([id, label, I]) => (
              <button key={id} type="button" aria-pressed={scope === id} onClick={() => chooseScope(id)}
                disabled={id === 'team' && inScope('team').length === 0}
                className={`h-7 px-2.5 rounded-md text-[12.5px] flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${scope === id ? 'bg-white font-semibold shadow-xs text-[#0369A1]' : 'text-[#475569] hover:text-[#0F172A]'}`}>
                <I size={12} /> {label}
              </button>
            ))}
          </div>
          {scope === 'team' && inScope('team').length > 1 && (
            <Select className="h-7 text-[12.5px]" value={cid ?? ''} onChange={e => setCid(Number(e.target.value))}
              options={inScope('team').map(c => ({ value: c.id, label: `#${c.name}` }))} />
          )}
          {scope === 'dm' && (
            <Select className="h-7 text-[12.5px]" aria-label="Person"
              value={pickDm ? '' : (dir.data || []).find(p => current?.name === p.name)?.user_id || ''}
              onChange={e => e.target.value && openDmWith(e.target.value)}
              options={[{ value: '', label: 'Choose a person…' }, ...(dir.data || []).filter(p => p.user_id !== me.user_id)
                .map(p => ({ value: p.user_id, label: p.name }))]} />
          )}
          {current && !pickDm && <span className="text-[12px] text-[#64748B]">{scope === 'org' ? 'everyone in the organisation' : scope === 'team' ? `${current.members} member(s)` : `private: only you and ${current.name}`}</span>}
        </div>
        <form onSubmit={send} className="flex gap-2 pt-2">
          <Input className="flex-1" placeholder="Message (use @user_id to mention, @keystone to ask)" value={text} onChange={e => setText(e.target.value)} disabled={!cid || pickDm} />
          <Input className="w-36 font-mono" placeholder="Share item ID" value={ref} onChange={e => setRef(e.target.value)} disabled={!cid || pickDm} title="A decision or clause ID (e.g. DEC-007) to attach as a card" />
          <Btn kind="primary" type="submit" disabled={!cid || pickDm || busy} className="flex items-center gap-1.5"><Send size={13} /> Send</Btn>
        </form>
      </section>

      {card && (
        <aside className="w-64 shrink-0 paper-sheet p-3 flex flex-col gap-2 text-[13px]">
          <div className="flex justify-between items-start">
            <div><div className="font-semibold">{card.name}</div><div className="text-[12px] text-[#64748B]">{card.designation}</div></div>
            <button className="text-[#64748B] cursor-pointer" onClick={() => setCard(null)} aria-label="Close">✕</button>
          </div>
          <div className="text-[12.5px]">Role: <b>{card.role}</b>{card.team && <> · Team: <b>{card.team}</b></>}</div>
          <div className="text-[12px] text-[#64748B]">Decisions they own that you can see</div>
          {card.decisions.length === 0 ? <div className="text-[12.5px] text-[#64748B]">None visible to you.</div>
            : card.decisions.map(d => <div key={d.id} className="text-[12.5px]"><span className="font-mono">{d.id}</span> {d.label}</div>)}
        </aside>
      )}
    </div>
  );
}
