import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  promoteWhatIf, reportText, slashCompliance, slashExplain, slashFlags, slashHistory, slashWhois, whatIf,
} from '../../api/p2';
import IdChip from '../../components/IdChip';
import { ThenNow } from '../../components/Compliance';
import { day, polish } from '../../utils/format';
import { errText } from './common';

// D: slash commands in the console. /whatif (alias /what-if) is a dry run labelled HYPOTHETICAL; the others read
// records through server endpoints that apply the access filter.
export const SLASH_HELP = 'Commands: /whatif <change> · /asof YYYY-MM-DD · /flags · /compliance DEC-004 · /history <project> · '
  + '/whois <person> · /explain <flag> · /report [YYYY-MM-DD]';

const COMMANDS = ['whatif', 'what-if', 'asof', 'flags', 'compliance', 'history', 'whois', 'explain', 'report', 'help'];

export function parseSlash(text) {
  const m = /^\s*\/([a-z-]+)\b\s*(.*)$/i.exec(text || '');
  if (!m) return null;
  const cmd = m[1].toLowerCase();
  return { cmd: COMMANDS.includes(cmd) ? cmd : 'help', arg: m[2].trim() };
}

export async function runSlash({ cmd, arg }, text, asOf, { onAsOf }) {
  const need = (what) => { if (!arg) throw new Error(`/${cmd} needs ${what}. ${SLASH_HELP}`); };
  switch (cmd) {
    case 'whatif':
    case 'what-if':
      need('a hypothetical, e.g. "/whatif retention drops to 60 days"');
      return { kind: 'whatif', data: await whatIf(text, asOf) };
    case 'asof':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(arg)) throw new Error('/asof needs a date as YYYY-MM-DD');
      onAsOf(arg);
      return { kind: 'text', text: `The session's as-of date is now ${day(arg)}.` };
    case 'flags':
      return { kind: 'flags', data: await slashFlags() };
    case 'compliance':
      need('a decision ID');
      return { kind: 'compliance', data: await slashCompliance(arg.toUpperCase(), asOf) };
    case 'history':
      need('a project');
      return { kind: 'history', data: await slashHistory(arg) };
    case 'whois':
      need('a person');
      return { kind: 'whois', data: await slashWhois(arg) };
    case 'explain':
      need('a flag ID');
      return { kind: 'explain', data: await slashExplain(arg) };
    case 'report':
      return { kind: 'report', asOf: arg || asOf, md: await reportText('compliance', { as_of: arg || asOf }) };
    default:
      return { kind: 'text', text: SLASH_HELP };
  }
}

const Card = ({ children, tone = 'bg-white border-slate-200' }) => (
  <div className={`max-w-[92%] rounded-xl p-3.5 border text-[13px] text-[#1E293B] leading-relaxed space-y-2 ${tone}`}>{children}</div>
);
const Chips = ({ ids, onCitationClick }) => ids.map(id => (
  <IdChip key={id} id={id} className="ml-0.5 kst-citation" onClick={() => onCitationClick?.(id)} />
));

const VERDICT = {
  would_violate: '✗ would violate', would_violate_if_repeated: '✗ would violate if repeated (one-off, not retroactive)',
  already_non_compliant: '✗ already non-compliant', still_compliant: '✓ still compliant',
  would_become_compliant: '✓ would become compliant', not_checkable: '– not checkable',
};

function WhatIf({ d, onCitationClick }) {
  const { t } = useTranslation();
  const [promoted, setPromoted] = useState(null);
  const h = d.hypothetical;
  return (
    <Card tone="bg-amber-50 border-amber-300">
      <div className="font-bold tracking-wide text-amber-900" data-testid="hypothetical-label">{t('hypothetical')}</div>
      {h.kind === 'policy_change' ? <>
        <div className="font-semibold">What-if: {h.clause_id} {h.field}{h.role ? `[${h.role}]` : ''} = {h.new_value}
          {h.effective_from && ` from ${day(h.effective_from)}`}</div>
        <div>{d.scope}: {d.impact.rows.length} checked</div>
        <table className="text-[12.5px] w-full">
          <tbody>
            {d.impact.rows.map(r => (
              <tr key={r.decision_id} className="align-top">
                <td className="pr-2"><IdChip id={r.decision_id} type="decision" withTitle onClick={() => onCitationClick?.(r.decision_id)} /></td>
                <td className="pr-2">owner {r.owner || '—'}</td>
                <td className="pr-2">{r.before.decision_value} vs {r.before.limit} → {r.after.limit}</td>
                <td>{VERDICT[r.verdict] || r.verdict}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </> : <>
        <div className="font-semibold">What-if: {h.name} leaves</div>
        <div>{d.scope}: {d.person.decisions.length} decision(s) lose their owner
          {d.person.authority_for.length > 0 && `; authority for ${d.person.authority_for.join(', ')}`}</div>
      </>}
      <p>{polish(d.explanation)} <Chips ids={d.citations.slice(0, 2)} onCitationClick={onCitationClick} /></p>
      <div className="text-[12.5px]">Suggested actions: {d.suggested_actions.join(' · ')}</div>
      {d.can_promote && !promoted && (
        <button className="btn-secondary" onClick={() => promoteWhatIf(d.simulation_id).then(setPromoted).catch(e => setPromoted({ error: errText(e) }))}>
          {t('promote')}</button>
      )}
      {promoted && <div className="text-[12.5px]">{promoted.error || `Draft ${promoted.ref} created (${promoted.clause_id}, effective ${promoted.effective_from}); submit it under Knowledge → Proposals.`}</div>}
      <div className="text-[11.5px] text-[#64748B]">Simulation #{d.simulation_id}: logged, never written to the graph.</div>
    </Card>
  );
}

export function SlashResult({ out, onCitationClick }) {
  const d = out.data;
  switch (out.kind) {
    case 'whatif':
      return <WhatIf d={d} onCitationClick={onCitationClick} />;
    case 'flags':
      return (
        <Card>
          <div className="font-semibold">{d.length} staleness flag(s) you can see</div>
          {d.map(f => (
            <div key={f.id} className="text-[12.5px]">
              <IdChip id={f.decision_id} type="decision" withTitle onClick={() => onCitationClick?.(f.decision_id)} /> {f.impact_type} under {f.clause_id}@{f.new_version}
              {f.proposal_id && ` · review #${f.proposal_id} ${f.proposal_status}`} · <span className="font-mono">{f.id}</span>
            </div>
          ))}
        </Card>
      );
    case 'explain':
      return <Card><div className="font-semibold">{d.flag_id}: {d.impact_type} ({d.severity})</div>
        <p>{polish(d.explanation)} <Chips ids={d.citations} onCitationClick={onCitationClick} /></p></Card>;
    case 'compliance':
      return <Card><div className="font-semibold">Compliance of {d.decision_id}</div><ThenNow c={d} compact /></Card>;
    case 'history':
      return (
        <Card>
          <div className="font-semibold">{d.name}: {d.decisions.length} decision(s)</div>
          {d.decisions.map(x => (
            <div key={x.id} className="text-[12.5px]">{day(x.decidedOn)} · <IdChip id={x.id} type="decision" withTitle onClick={() => onCitationClick?.(x.id)} />
              {x.owner && ` · ${x.owner.name}`} · {x.reason}</div>
          ))}
        </Card>
      );
    case 'whois':
      return (
        <Card>
          <div className="font-semibold">{d.name} ({d.id})</div>
          <div>Role: {d.role || '—'} · joined {day(d.joined)}{d.left && ` · left ${day(d.left)}`}
            {d.authority_for.length > 0 && ` · authority for ${d.authority_for.join(', ')}`}</div>
          <div>Owns {d.decisions.length} active decision(s) you can see: <Chips ids={d.decisions.map(x => x.decision_id)} onCitationClick={onCitationClick} /></div>
        </Card>
      );
    case 'report':
      return <Card><div className="font-semibold">Compliance report as of {day(out.asOf)} (download it as PDF under Knowledge → Reports)</div>
        <pre className="text-[11.5px] whitespace-pre-wrap max-h-80 overflow-auto">{out.md}</pre></Card>;
    default:
      return <Card>{out.text}</Card>;
  }
}
