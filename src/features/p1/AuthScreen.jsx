import React, { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import Logo from '../../components/Logo';
import * as p1 from '../../api/p1';
import { Btn, ErrorNote, Field, Input, useAction } from './ui';

// A: sign in with employee ID and password, join an organisation with its code, or register a new organisation.
const TABS = [['login', 'Sign in'], ['join', 'Join an organisation'], ['register', 'Register an organisation']];

export default function AuthScreen({ onSignedIn, onBack }) {
  const [tab, setTab] = useState('login');
  const [form, setForm] = useState({});
  const [done, setDone] = useState(null);  // {kind: 'pending' | 'registered', ...}
  const [run, busy, error] = useAction();
  const [demo, setDemo] = useState([]);
  useEffect(() => { p1.demoAccounts().then(setDemo, () => setDemo([])); }, []);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      if (tab === 'login') return onSignedIn(await p1.login(form.employee_id, form.password));
      if (tab === 'join') {
        const r = await p1.join(form);
        if (r.status === 'active') return onSignedIn(await p1.me());
        return setDone({ kind: 'pending', org: r.org_name });
      }
      const r = await p1.register(form);
      setDone({ kind: 'registered', code: r.join_code, me: r });
    });
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[#F8FAFC] p-4">
      <div className="w-full max-w-md paper-sheet-elevated p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Logo size={26} subtitle="" />
          {onBack && <button className="text-[12.5px] text-[#64748B] hover:text-[#0F172A] cursor-pointer" onClick={onBack}>← Back</button>}
        </div>

        {done?.kind === 'pending' && (
          <div className="flex flex-col gap-3 text-[13px]">
            <h2 className="font-heading font-semibold text-base">Request sent to {done.org}</h2>
            <p className="text-[#475569]">Your join request is pending. The Owner or a Team lead has to approve it before you can sign in.</p>
            <Btn onClick={() => { setDone(null); setTab('login'); }}>Back to sign in</Btn>
          </div>
        )}

        {done?.kind === 'registered' && (
          <div className="flex flex-col gap-3 text-[13px]">
            <h2 className="font-heading font-semibold text-base">{done.me.org_name} is ready</h2>
            <p className="text-[#475569]">Share this join code with your team. It is shown once; Keystone stores only its hash. You can rotate it later.</p>
            <div className="font-mono text-2xl tracking-widest text-center py-3 rounded-lg bg-slate-50 border border-slate-200" data-testid="join-code">{done.code}</div>
            <Btn kind="primary" onClick={() => onSignedIn(done.me)}>Continue to the workspace</Btn>
          </div>
        )}

        {!done && (
          <>
            <div className="flex gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200" role="tablist">
              {TABS.map(([id, label]) => (
                <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                  className={`flex-1 h-8 rounded-lg text-[12.5px] cursor-pointer ${tab === id ? 'bg-white font-semibold shadow-xs' : 'text-[#475569]'}`}>
                  {label}
                </button>
              ))}
            </div>
            <form onSubmit={submit} className="flex flex-col gap-3">
              {tab === 'register' && <Field label="Organisation name"><Input required value={form.org_name || ''} onChange={set('org_name')} /></Field>}
              {tab === 'join' && <Field label="Join code"><Input required placeholder="ABCD-EF23" className="font-mono uppercase" value={form.join_code || ''} onChange={set('join_code')} /></Field>}
              <Field label="Employee ID"><Input required autoComplete="username" value={form.employee_id || ''} onChange={set('employee_id')} /></Field>
              <Field label="Password"><Input required type="password" autoComplete={tab === 'login' ? 'current-password' : 'new-password'} minLength={tab === 'login' ? undefined : 8} value={form.password || ''} onChange={set('password')} /></Field>
              {tab !== 'login' && (
                <>
                  <Field label="Your name"><Input required value={form.display_name || ''} onChange={set('display_name')} /></Field>
                  <Field label="Designation (optional)"><Input placeholder="e.g. Compliance lead" value={form.designation || ''} onChange={set('designation')} /></Field>
                </>
              )}
              <ErrorNote error={error} />
              <Btn kind="primary" type="submit" disabled={busy} className="flex items-center justify-center gap-2">
                <KeyRound size={14} /> {busy ? 'Working…' : TABS.find(t => t[0] === tab)[1]}
              </Btn>
            </form>
            {tab === 'login' && demo.length > 0 && (
              <div className="flex flex-col gap-1.5 pt-3 border-t border-slate-100">
                <span className="text-[12px] text-[#64748B]">Demo workspace <b>Nimbus Ledger</b>: sign in with one click as</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {demo.map(d => (
                    <button key={d.employee_id} type="button" disabled={busy}
                      onClick={() => run(async () => onSignedIn(await p1.demoLogin(d.employee_id)))}
                      className="text-left px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-sky-50 hover:border-sky-200 cursor-pointer disabled:opacity-50">
                      <div className="text-[12.5px] font-semibold text-[#0F172A]">{d.display_name}</div>
                      <div className="text-[11.5px] text-[#64748B]">{d.designation} · {d.role}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
