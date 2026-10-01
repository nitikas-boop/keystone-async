import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, FolderKanban, Lock, Network, ShieldOff, Users } from 'lucide-react';
import * as p1 from '../../api/p1';
import { useApp } from '../../context';
import { day } from '../../utils/format';
import { ErrorNote } from './ui';

// B, the employee's workspace: only what their jurisdiction covers (the backend filters every list; nothing here
// hides records itself), what they cannot do, and who leads each department.
const TABS = [
  { id: 'decisions', label: 'My Assigned Decisions', note: 'note-yellow', tilt: '-rotate-1' },
  { id: 'policies', label: 'Department Policies', note: 'note-green', tilt: 'rotate-1' },
  { id: 'org', label: 'Public Org Chart', note: 'note-lavender', tilt: '-rotate-[0.5deg]' },
];
const inr = (v) => `₹${Number(v).toLocaleString('en-IN')}`;

export default function EmployeeDashboard({ me }) {
  const { openEntity } = useApp();
  const [tab, setTab] = useState('decisions');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    Promise.all([p1.decisions(), p1.policies(), p1.people()])
      .then(([decisions, policies, people]) => setData({ decisions, policies, people }), setError);
  }, []);

  const scope = me.assigned_projects?.length ? me.assigned_projects : null;
  const projects = useMemo(() => {
    const by = {};
    for (const d of data?.decisions || []) (by[d.attributes?.project || 'No project'] ||= []).push(d);
    for (const p of scope || []) by[p] ||= [];
    return Object.entries(by).sort(([a], [b]) => a.localeCompare(b));
  }, [data, scope]);
  const head = data?.people.find(p => p.role === 'lead' && p.team_id === me.team_id);

  return (
    <div className="flex flex-col gap-4" data-testid="employee-dashboard">
      <section className="notebook rounded-2xl p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-heading font-semibold text-[18px] text-kb-navy">My workspace</h2>
            <p className="text-[13px] text-kb-muted">{me.display_name} · {me.designation} · {me.department || 'no department'}</p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[12px]">
            <span className="hl-yellow px-2 py-0.5 rounded-md">Jurisdiction: {scope ? scope.join(', ') : `${me.department || 'your team'}'s projects`}</span>
            <span className="hl-pink px-2 py-0.5 rounded-md">
              Approval authority: {me.approval_authority_inr == null ? 'no ceiling' : me.approval_authority_inr === 0 ? 'none (read-only)' : inr(me.approval_authority_inr)}
            </span>
          </div>
        </div>
        <p className="text-[12.5px] text-kb-muted flex items-start gap-1.5">
          <ShieldOff size={14} className="shrink-0 mt-0.5 text-kb-alert" aria-hidden="true" />
          Approving proposals, accepting extracted facts, changing policies and ingesting anything above your authority need a lead.
          Decisions outside your jurisdiction show as locked in the Temporal Graph; opening one tells you who to ask, and the attempt is audited.
        </p>
      </section>

      <ErrorNote error={error} />
      {!data && !error && <p className="text-[13px] text-kb-muted px-1">Loading your jurisdiction…</p>}

      {data && (
        <>
          <section aria-label="Projects in your jurisdiction" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map(([name, ds]) => {
              const latest = [...ds].sort((a, b) => (b.attributes?.decided_on || '').localeCompare(a.attributes?.decided_on || ''))[0];
              return (
                <div key={name} className="notebook rounded-xl p-4 flex flex-col gap-2 border-l-4 border-l-kb-cobalt">
                  <div className="flex items-center gap-2 font-semibold text-[14px] text-kb-navy"><FolderKanban size={15} className="text-kb-cobalt-ink" aria-hidden="true" /> {name}</div>
                  <p className="text-[12.5px] text-kb-muted">{ds.length} decision(s) you can read{latest ? `; latest ${day(latest.attributes?.decided_on)}: ${latest.label}` : ''}.</p>
                  {name !== 'No project' && (
                    <button className="btn-secondary self-start" onClick={() => openEntity(name, 'project', { view: 'GRAPH' })}>
                      <Network size={13} /> Open in the graph
                    </button>
                  )}
                </div>
              );
            })}
          </section>

          <div className="flex gap-3 flex-wrap px-1 pt-1" role="tablist" aria-label="Your records">
            {TABS.map(t => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                className={`${t.note} ${t.tilt} px-4 py-2 rounded-md text-[13px] font-semibold shadow-sm cursor-pointer transition-transform hover:rotate-0 ${tab === t.id ? 'ring-2 ring-offset-1 ring-kb-line-strong rotate-0' : 'opacity-80'}`}>
                {t.label}
              </button>
            ))}
          </div>

          <section className="notebook rounded-2xl p-4" role="tabpanel">
            {tab === 'decisions' && (
              data.decisions.length === 0 ? <Empty>No decision is recorded in your jurisdiction yet.</Empty> : (
                <ul className="flex flex-col divide-y divide-dashed divide-kb-line-strong">
                  {[...data.decisions].sort((a, b) => (b.attributes?.decided_on || '').localeCompare(a.attributes?.decided_on || '')).map(d => (
                    <li key={d.id} className="py-2 flex items-start gap-3 text-[13px]">
                      <button className="font-mono text-[12px] px-1.5 py-0.5 rounded hl-yellow cursor-pointer shrink-0" onClick={() => openEntity(d.id, 'decision', { view: 'GRAPH' })}>{d.id}</button>
                      <div className="min-w-0">
                        <div className="font-medium text-kb-navy">{d.label}</div>
                        <div className="text-[12px] text-kb-muted">{day(d.attributes?.decided_on)} · {d.attributes?.project || 'no project'} · {d.attributes?.status || 'recorded'}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            )}
            {tab === 'policies' && (
              data.policies.length === 0 ? (
                <Empty>
                  No policy is owned by the {me.department || 'your'} department yet. Other departments' policies are outside your
                  jurisdiction{head ? <>; ask your department head, <b>{head.name}</b> ({head.designation}).</> : '.'}
                </Empty>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.policies.map(p => {
                    const v = p.versions[p.versions.length - 1];
                    return (
                      <li key={p.policy_id} className="text-[13px] flex items-start gap-2">
                        <BookOpen size={14} className="text-kb-cobalt-ink mt-0.5 shrink-0" aria-hidden="true" />
                        <div><b>{p.policy_id} {v.version}</b> <span className="text-kb-muted">in force from {day(v.valid_from)}</span>
                          <div className="text-[12.5px] text-kb-muted">{v.clauses.map(c => `${c.clause_id} ${c.title}`).join(' · ')}</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )
            )}
            {tab === 'org' && <OrgChart people={data.people} me={me} />}
          </section>
        </>
      )}
    </div>
  );
}

function Empty({ children }) {
  return <p className="text-[13px] text-kb-muted flex items-start gap-2"><Lock size={14} className="mt-0.5 shrink-0 text-kb-muted/70" aria-hidden="true" /><span>{children}</span></p>;
}

function OrgChart({ people, me }) {
  const teams = {};
  for (const p of people) (teams[p.team || 'Organisation'] ||= []).push(p);
  const rank = { owner: 0, lead: 1, compliance: 1, member: 2, auditor: 3 };
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Object.entries(teams).sort(([a], [b]) => (a === 'Organisation' ? -1 : b === 'Organisation' ? 1 : a.localeCompare(b))).map(([team, ps]) => (
        <div key={team} className="rounded-xl bg-kb-bg/70 border border-kb-line p-3">
          <div className="flex items-center gap-1.5 font-semibold text-[13px] mb-1.5"><Users size={13} aria-hidden="true" /> {team}</div>
          <ul className="flex flex-col gap-1 text-[12.5px]">
            {[...ps].sort((a, b) => rank[a.role] - rank[b.role] || a.name.localeCompare(b.name)).map(p => (
              <li key={p.user_id} className={p.user_id === me.user_id ? 'font-semibold' : ''}>
                {p.name} <span className="text-kb-muted">· {p.designation || p.role}</span>
                {(p.role === 'lead' || p.role === 'compliance') && <span className="ml-1 hl-green px-1 rounded text-[11px]">lead</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
