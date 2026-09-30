"""J. Reports: compliance as of a date, and an audit-prep pack for a period. Markdown and PDF.
Every line cites its source in [brackets]. A report contains only what the requester may see (can_access), and
every count is computed after that filter, so a count never hints at hidden records.
ponytail: deterministic tables only; an LLM-written narrative, graph snapshot, Word export and scheduling are
roadmap (spec J MVP)."""
import json
from datetime import date, datetime, timezone

from fpdf import FPDF

from . import compliance, config, db, graph
from .contracts import can_access
from .reasoning import LOW_CONFIDENCE

PRIVILEGED = {'owner', 'compliance', 'auditor'}  # may see audit-chain size and head hash


def cell(v) -> str:
    return str('—' if v in (None, '') else v).replace('|', '/').replace('\n', ' ')


def table(head: list[str], rows: list[list]) -> list[str]:
    if not rows:
        return ['_None visible to you._', '']
    return ['| ' + ' | '.join(head) + ' |', '|' + '---|' * len(head)] + \
        ['| ' + ' | '.join(cell(c) for c in r) + ' |' for r in rows] + ['']


async def visible_decisions(user: dict) -> list[dict]:
    rows = await graph.q('MATCH (n:Entity {group_id: $g, type: "Decision"}) WHERE coalesce(n.rejected, false) = false '
                         'AND n.decided_on IS NOT NULL RETURN properties(n) AS p ORDER BY n.decided_on, n.key',
                         g=config.GROUP_ID)
    return [r['p'] for r in rows if can_access(user, {'type': 'decision', 'id': r['p']['key'],
                                                      'project': r['p'].get('project'),
                                                      'visibility': r['p'].get('visibility') or 'org'})]


def verdict(checks: list[dict], overall: str) -> str:
    srcs = ' '.join(f"[{c['source_id']}]" for c in checks)
    return f"{overall.replace('_', ' ')} {srcs}".strip()


def header(title: str, user: dict, scope: str) -> list[str]:
    now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    return [f'# {title}', '', f"Generated {now} for {user['user_id']} ({user['role']}). {scope}",
            'Contains only records visible to the requester. Every line cites its source in [brackets].', '']


async def _clauses(on: date) -> list:
    return await db.pool.fetch('SELECT * FROM policy_clauses WHERE effective_from <= $1 AND '
                               '(effective_to IS NULL OR effective_to > $1) ORDER BY policy_id, clause_id', on)


async def _decision_rows(user: dict, decs: list[dict], on: date | None) -> list[list]:
    """on=None: judged by the clause in force when decided; else also as of `on`."""
    rows = []
    for d in decs:
        res = await compliance.evaluate(d['key'], on or date.fromisoformat(d['decided_on']), LOW_CONFIDENCE, explain=False)
        then = verdict(res['checks'], res['result']) if res else 'no clause'
        row = [f"[{d['key']}]", d['name'], d.get('owner'), d['decided_on'], d.get('status', 'active'), then]
        if on:
            row.append(verdict(res['current'], res['current_result']) if res else 'no clause')
        rows.append(row)
    return rows


async def _visible_flags(user: dict, keys: set[str], until: date, since: date | None = None) -> list:
    rows = await db.pool.fetch(
        'SELECT f.*, c.effective_from, p.id AS pid, p.status AS pstatus, p.decided_by, p.decided_at FROM flags f '
        'JOIN policy_clauses c ON c.clause_id=f.clause_id AND c.version=f.new_version '
        'LEFT JOIN proposals p ON p.flag_id=f.id WHERE c.effective_from <= $1 AND ($2::date IS NULL OR '
        'c.effective_from >= $2) ORDER BY c.effective_from, f.id', until, since)
    return [r for r in rows if r['decision_id'] in keys]


async def compliance_report(user: dict, as_of: date) -> str:
    decs = [d for d in await visible_decisions(user) if d['decided_on'] <= as_of.isoformat()]
    keys = {d['key'] for d in decs}
    rows = await _decision_rows(user, decs, as_of)
    flags = await _visible_flags(user, keys, as_of)
    breaches = sum(1 for r in rows if r[-1].startswith('non compliant'))
    out = header(f'Compliance report as of {as_of}', user, f'Decisions are judged by the clause in force when they '
                 f'were decided and by the clause in force on {as_of}.')
    out += ['## Summary', '', f'- {len(decs)} recorded decision(s) visible to you as of {as_of}.',
            f'- {breaches} non-compliant under the rules in force on {as_of}.',
            f'- {len(flags)} staleness flag(s) raised by policy changes in force by then.', '']
    out += ['## Policies in force', '']
    out += table(['Clause', 'Title', 'In force from', 'Structured rule'],
                 [[f"[{c['clause_id']}@{c['version']}]", c['title'], c['effective_from'],
                   ', '.join(f'{k}={json.dumps(v)}' for k, v in (c['fields'] or {}).items()) or 'not checkable'] for c in await _clauses(as_of)])
    out += ['## Decisions', '']
    out += table(['Decision', 'Title', 'Owner', 'Decided', 'Status', 'When decided', f'As of {as_of}'], rows)
    out += ['## Staleness flags', '']
    out += table(['Flag', 'Decision', 'Impact', 'Clause change', 'Review'],
                 [[f['id'], f"[{f['decision_id']}]", f['impact_type'],
                   f"[{f['clause_id']}@{f['old_version']}] -> [{f['clause_id']}@{f['new_version']}]",
                   f"#{f['pid']} {f['pstatus']}" + (f" by {f['decided_by']}" if f['decided_by'] else '') if f['pid'] else '—']
                  for f in flags])
    return '\n'.join(out)


async def chain_status(user: dict) -> list[str]:
    rows = await db.pool.fetch('SELECT * FROM audit_log ORDER BY id')
    prev, broken = '0' * 64, None
    for r in rows:
        if r['prev_hash'] != prev or db.row_hash(r) != r['hash']:
            broken = r['id']
            break
        prev = r['hash']
    lines = ['- Hash chain: ' + ('verified, every hash recomputes and every link holds.' if broken is None
                                 else f'BROKEN at row #{broken}.')]
    if user['role'] in PRIVILEGED:
        lines.append(f"- {len(rows)} rows; head hash `{rows[-1]['hash'] if rows else '—'}`.")
    return lines + ['']


async def audit_prep_report(user: dict, date_from: date, date_to: date) -> str:
    if date_from > date_to:
        raise ValueError('date_from must be on or before date_to')
    period = lambda d: date_from.isoformat() <= d <= date_to.isoformat()
    all_decs = await visible_decisions(user)
    decs = [d for d in all_decs if period(d['decided_on'])]
    rows = await _decision_rows(user, decs, None)
    flags = await _visible_flags(user, {d['key'] for d in all_decs}, date_to, date_from)
    versions = await db.pool.fetch(
        'SELECT DISTINCT policy_id, version, effective_from, effective_to FROM policy_clauses WHERE effective_from <= $2 '
        'AND (effective_to IS NULL OR effective_to > $1) ORDER BY policy_id, effective_from', date_from, date_to)
    props = await db.pool.fetch(
        "SELECT * FROM policy_proposals WHERE org_id=$1 AND decided_at IS NOT NULL AND decided_at::date BETWEEN $2 AND $3 "
        'ORDER BY decided_at', user['org_id'], date_from, date_to)
    rulings = [d for d in decs if d['key'].startswith('RUL-')]
    out = header(f'Audit-prep pack {date_from} to {date_to}', user,
                 'Each decision is judged by the clause version in force on the day it was made.')
    out += ['## Summary', '', f'- {len(decs)} decision(s) made in the period, {len(rulings)} of them collision rulings.',
            f'- {sum(1 for r in rows if r[-1].startswith("non compliant"))} non-compliant when made.',
            f'- {len(flags)} staleness flag(s) from policy versions that took effect in the period.', '']
    out += ['## Policy versions in force during the period', '']
    out += table(['Policy', 'Version', 'From', 'To'],
                 [[f"[{v['policy_id']}@{v['version']}]", v['version'], v['effective_from'], v['effective_to'] or 'now']
                  for v in versions])
    out += ['## Decisions made in the period', '']
    out += table(['Decision', 'Title', 'Owner', 'Decided', 'Status', 'Compliance when made'], rows)
    out += ['## Staleness flags and their review', '']
    out += table(['Flag', 'Decision', 'Impact', 'New clause', 'Review'],
                 [[f['id'], f"[{f['decision_id']}]", f['impact_type'], f"[{f['clause_id']}@{f['new_version']}]",
                   (f"#{f['pid']} {f['pstatus']}" + (f" by {f['decided_by']} on {f['decided_at']:%Y-%m-%d}"
                                                     if f['decided_at'] else '')) if f['pid'] else '—'] for f in flags])
    out += ['## Policy proposals decided in the period', '']
    out += table(['Proposal', 'Clause', 'Outcome', 'By', 'On', 'Reason'],
                 [[f"PROP-{p['id']}", f"[{p['clause_id']}]", p['status'], p['reviewer_id'], f"{p['decided_at']:%Y-%m-%d}",
                   p['decision_reason'] or (p['activated_document_id'] and f"[{p['activated_document_id']}]")] for p in props])
    out += ['## Audit log', ''] + await chain_status(user)
    return '\n'.join(out)


PDF_SAFE = {'₹': 'Rs ', '—': '-', '–': '-', '→': '->', '✓': 'OK', '✗': 'X', '’': "'", '‘': "'", '“': '"', '”': '"'}


def latin1(s: str) -> str:
    for a, b in PDF_SAFE.items():
        s = s.replace(a, b)
    return s.encode('latin-1', 'replace').decode('latin-1')  # core PDF fonts are Latin-1 only


def to_pdf(md: str) -> bytes:
    pdf = FPDF(format='A4')
    pdf.set_auto_page_break(True, 15)
    pdf.add_page()
    for line in md.splitlines():
        if line.startswith('|') and set(line) <= set('|-: '):
            continue
        size, style, family = 9, '', 'Helvetica'
        if line.startswith('# '):
            size, style, line = 15, 'B', line[2:]
        elif line.startswith('## '):
            size, style, line = 11.5, 'B', line[3:]
        elif line.startswith('|'):
            size, family, line = 7.5, 'Courier', '  '.join(c.strip() for c in line.strip('|').split('|'))
        pdf.set_font(family, style, size)
        pdf.multi_cell(0, size * 0.55, latin1(line.replace('`', '').replace('_None', 'None').rstrip('_')) or ' ',
                       new_x='LMARGIN', new_y='NEXT')
    return bytes(pdf.output())


if __name__ == '__main__':
    assert table(['a'], []) == ['_None visible to you._', '']
    assert table(['a', 'b'], [[1, None]])[2] == '| 1 | — |'
    assert latin1('₹4 lakh ✓') == 'Rs 4 lakh OK'
    assert to_pdf('# T\n\n| a | b |\n|---|---|\n| 1 | ₹2 |\n').startswith(b'%PDF')
    print('reports self-check ok')
