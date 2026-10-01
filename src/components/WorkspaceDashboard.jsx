import React, { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, FileSearch, ListChecks, MessageCircle, RefreshCw, ScrollText, Table2, Users } from 'lucide-react';
import * as p1 from '../api/p1';
import { useApp } from '../context';
import { day, polish } from '../utils/format';

// Dashboard for every role, scoped on the server (GET /dashboard): executives see the organisation, leads their
// domain and teams, members their own work. Every number here comes from that endpoint; nothing is hardcoded.
const SCOPE = { org: 'Organisation-wide', domain: 'Your domain', personal: 'Your work' };
const STATE = { active: 'badge-note-green', superseded: 'badge-note-slate', stale: 'badge-note-amber' };

function Tile({ label, value, hint, Icon, onClick, tone = 'text-kb-cobalt-ink' }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      className={`paper-sheet p-4 text-left flex flex-col gap-1 min-w-0 ${onClick ? 'cursor-pointer hover:border-kb-cobalt/50' : ''}`}>
      <span className="flex items-center gap-1.5 text-[12.5px] text-kb-muted"><Icon size={14} className={tone} aria-hidden="true" /> {label}</span>
      <span className="font-heading text-[26px] font-bold text-kb-navy leading-tight">{value ?? '—'}</span>
      {hint && <span className="text-[12px] text-kb-muted truncate">{hint}</span>}
    </Tag>
  );
}

function Card({ title, Icon, children, empty, count }) {
  return (
    <section className="paper-sheet p-4 flex flex-col gap-2 min-w-0">
      <h3 className="font-heading font-semibold text-[13.5px] text-kb-navy flex items-center gap-1.5">
        <Icon size={14} className="text-kb-cobalt-ink" aria-hidden="true" /> {title}
      </h3>
      {count === 0 ? <p className="text-[12.5px] text-kb-muted">{empty}</p> : children}
    </section>
  );
}

const Li = ({ children, onClick }) => (
  <li>
    <button type="button" onClick={onClick} disabled={!onClick}
      className="w-full text-left px-2 py-1.5 rounded-lg text-[13px] flex items-center gap-2 hover:bg-kb-bg-soft cursor-pointer disabled:cursor-default disabled:hover:bg-transparent">
      {children}
    </button>
  </li>
);

export default function WorkspaceDashboard({ onOpenInbox, onOpenItem, onNavigate }) {
  const { openEntity } = useApp();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => p1.dashboard().then(x => { setD(x); setError(null); }, setError), []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  if (error) return <div role="alert" className="badge-note-rose text-[13px] px-3 py-2 rounded-lg">Dashboard unavailable: {error.message}</div>;
  if (!d) return <p className="text-[13px] text-kb-muted">Loading your dashboard…</p>;
  const openDecision = (id) => openEntity(id, 'decision', { view: 'REGISTRY' });
  const byStatus = d.decisions_by_status;

  const pendingList = (
    <Card title="Needs your action" Icon={ListChecks} count={d.my_pending.length} empty="Nothing is waiting for you.">
      <ul className="flex flex-col">
        {d.my_pending.map(i => (
          <Li key={i.key} onClick={() => onOpenItem(i)}>
            <span className="min-w-0 flex-1 truncate font-medium">{i.title}</span>
            <span className="text-[11.5px] text-kb-muted shrink-0">{i.type.replace('_', ' ')}</span>
          </Li>
        ))}
      </ul>
    </Card>
  );
  const myDecisions = (
    <Card title={d.scope === 'personal' ? 'My decisions' : 'Decisions you own'} Icon={Table2} count={d.my_decisions.length} empty="You don't own any recorded decision.">
      <ul className="flex flex-col">
        {d.my_decisions.map(x => (
          <Li key={x.id} onClick={() => openDecision(x.id)}>
            <span className="font-mono text-[11.5px] text-kb-muted shrink-0">{x.id}</span>
            <span className="min-w-0 flex-1 truncate">{polish(x.title)}</span>
            <span className={`text-[11.5px] px-1.5 py-0.5 rounded capitalize shrink-0 ${STATE[x.state]}`}>{x.state}</span>
          </Li>
        ))}
      </ul>
    </Card>
  );
  const teams = (
    <Card title={d.scope === 'org' ? 'Team activity (all teams)' : 'Your teams'} Icon={Users} count={d.team_activity.length}
      empty="You're not in any team yet.">
      <ul className="flex flex-col">
        {d.team_activity.map(t => (
          <Li key={t.id} onClick={() => onNavigate('P1_CHAT')}>
            <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
            <span className="text-[12px] text-kb-muted shrink-0">{t.members} member(s) · {t.messages_7d} message(s) this week</span>
          </Li>
        ))}
      </ul>
    </Card>
  );
  const audit = d.recent_audit && (
    <Card title="Recent audit-log activity" Icon={ScrollText} count={d.recent_audit.length} empty="No audit entries yet.">
      <ul className="flex flex-col">
        {d.recent_audit.map(r => (
          <Li key={r.id} onClick={() => openEntity(r.id, 'audit')}>
            <span className="font-mono text-[11.5px] text-kb-muted shrink-0">#{r.id}</span>
            <span className="min-w-0 flex-1 truncate"><b className="font-medium">{r.action}</b> · {r.object_type} {r.object_id}</span>
            <span className="text-[11.5px] text-kb-muted shrink-0">{r.actor.replace('user:', '')}</span>
          </Li>
        ))}
      </ul>
    </Card>
  );

  return (
    <div className="flex flex-col gap-4 max-w-[1400px]">
      <div className="flex items-center gap-2">
        <h2 className="font-heading font-semibold text-[15px] text-kb-navy">Dashboard</h2>
        <span className="text-[12.5px] px-2 py-0.5 rounded-md badge-note-sky">{SCOPE[d.scope]}</span>
        {d.scope !== 'org' && <span className="text-[12.5px] text-kb-muted">Domain: {d.domains.join(', ') || 'none'}</span>}
        <button type="button" className="ml-auto icon-btn" onClick={load} aria-label="Refresh dashboard" title="Refresh"><RefreshCw size={13} /></button>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Tile label={d.scope === 'org' ? 'Pending approvals (org)' : 'Waiting for you'} Icon={ListChecks}
          value={d.scope === 'org' ? d.pending_approvals.total : d.inbox.pending}
          hint={d.scope === 'org' ? `${d.inbox.pending} of them need you` : 'approvals, flags and reviews'} onClick={onOpenInbox} />
        <Tile label="Unread" Icon={MessageCircle} value={d.inbox.unread} hint="messages and notifications" onClick={onOpenInbox} />
        {d.scope === 'org' && <Tile label="Active staleness flags" Icon={AlertTriangle} tone="text-kb-alert" value={d.active_flags.total}
          hint={Object.entries(d.active_flags.by_domain).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(' · ') || 'none open'} />}
        {d.scope === 'domain' && <Tile label="Flags in your domain" Icon={AlertTriangle} tone="text-kb-alert" value={d.domain_flags.length} />}
        {d.scope === 'personal' && <Tile label="My decisions" Icon={Table2} value={d.my_decisions.length}
          hint={`${d.my_decisions.filter(x => x.state === 'stale').length} stale`} />}
        {byStatus && <Tile label={d.scope === 'org' ? 'Decisions' : 'Decisions you own'} Icon={CheckCircle2} tone="text-kb-cobalt-ink"
          value={byStatus.active + byStatus.superseded + byStatus.stale}
          hint={`${byStatus.active} active · ${byStatus.superseded} superseded · ${byStatus.stale} stale`} />}
        {d.scope === 'personal' && <Tile label="Policy changes affecting you" Icon={ScrollText} value={d.policy_changes.filter(p => p.affects_me).length}
          hint="last 12 months" onClick={() => onNavigate('POLICIES')} />}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {pendingList}
        {d.scope === 'org' && (
          <Card title="Ingestion status" Icon={FileSearch} count={1}>
            <p className="text-[12.5px] text-kb-muted">{d.ingestion.pending_facts} extracted fact(s) waiting for review.</p>
            <ul className="flex flex-col">
              {d.ingestion.runs.map(r => (
                <Li key={r.id}>
                  <span className="font-mono text-[11.5px] text-kb-muted">run {r.id}</span>
                  <span className="flex-1">{r.kind} · {day(r.started_at)}</span>
                  <span className={`text-[11.5px] px-1.5 py-0.5 rounded ${r.status === 'succeeded' ? 'badge-note-green' : r.status === 'running' ? 'badge-note-sky' : 'badge-note-rose'}`}>
                    {r.status}{r.ok != null && ` · ${r.ok} ok${r.failed ? `, ${r.failed} failed` : ''}`}
                  </span>
                </Li>
              ))}
            </ul>
          </Card>
        )}
        {d.scope === 'domain' && (
          <Card title="Flags in your domain" Icon={AlertTriangle} count={d.domain_flags.length} empty="No open flags in your domain.">
            <ul className="flex flex-col">
              {d.domain_flags.map(f => (
                <Li key={f.id} onClick={() => openDecision(f.decision_id)}>
                  <span className="font-mono text-[11.5px] text-kb-muted">{f.decision_id}</span>
                  <span className="flex-1 truncate">{f.impact_type.replace(/_/g, ' ').toLowerCase()} · {f.clause}</span>
                </Li>
              ))}
            </ul>
          </Card>
        )}
        {d.scope === 'personal' && (
          <Card title="My proposals" Icon={Activity} count={d.my_proposals.length} empty="You haven't proposed anything yet.">
            <ul className="flex flex-col">
              {d.my_proposals.map(x => (
                <Li key={`${x.kind}${x.id}`}>
                  <span className="flex-1 truncate">{x.title}</span>
                  <span className="text-[11.5px] text-kb-muted capitalize" title={x.reason || ''}>{x.status}{x.reason ? ` · ${x.reason}` : ''}</span>
                </Li>
              ))}
            </ul>
          </Card>
        )}
        {myDecisions}
        {teams}
        {d.scope === 'personal' && (
          <Card title="Recent policy changes" Icon={ScrollText} count={d.policy_changes.length} empty="No policy version took effect in the last 12 months.">
            <ul className="flex flex-col">
              {d.policy_changes.map(p => (
                <Li key={p.document_id} onClick={() => openEntity(p.document_id, 'policy', { view: 'POLICIES' })}>
                  <span className="font-mono text-[11.5px] text-kb-muted">{p.document_id}</span>
                  <span className="flex-1 truncate">from {day(p.effective_from)} · {p.clauses.join(', ')}</span>
                  {p.affects_me && <span className="text-[11.5px] px-1.5 py-0.5 rounded badge-note-amber">affects you</span>}
                </Li>
              ))}
            </ul>
          </Card>
        )}
        {audit}
      </div>
    </div>
  );
}
