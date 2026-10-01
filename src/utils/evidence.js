// An answer as a portable evidence record: the question, who asked, the as-of date, each cited sentence, the cited
// sources with their quotes, the deterministic compliance result, and the audit block that recorded the query.
// Everything comes from the /ask (or GET /answers/{id}) response and the audit log; nothing is added.
import { day, polish, shortHash, ts } from './format.js';

const RESULT = { compliant: 'Compliant', non_compliant: 'Non-compliant', not_checkable: 'Not checkable', no_clause: 'No clause relied on' };

export const answerLink = (id) => `${window.location.origin}${window.location.pathname}#answer=${encodeURIComponent(id)}`;

export function auditRowFor(auditLogs, answerId) {
  return (auditLogs || []).find(r => r.object_type === 'answer' && String(r.object_id) === String(answerId)) || null;
}

export function evidenceMarkdown(res, { askedBy, auditRow, link } = {}) {
  const out = [`# Keystone evidence: ${res.question || 'answer'}`, ''];
  if (askedBy) out.push(`- Asked by: ${askedBy}`);
  if (auditRow) out.push(`- Asked at: ${ts(auditRow.ts).ist} (${ts(auditRow.ts).utc})`);
  out.push(`- Evaluated as of: ${day(res.as_of)} (only facts valid on that date were used)`);
  if (res.answer_id) out.push(`- Answer ID: ${res.answer_id}`);
  if (link) out.push(`- Link: ${link}`);
  out.push('', '## Answer', '');
  if (res.refused) out.push(polish(res.answer));
  else if (res.sentences?.length) res.sentences.forEach(s => out.push(`${polish(s.text)} ${(s.source_ids || []).map(i => `[${i}]`).join('')}`, ''));
  else out.push(polish(res.answer));

  if (!res.refused && res.citations?.length) {
    out.push('', '## Sources', '');
    for (const c of res.citations) {
      out.push(`- **${c.id}** ${polish(c.title || '')}${c.date ? `, ${day(c.date)}` : ''}${c.source_doc ? ` (source: ${c.source_doc})` : ''}`);
      if (c.quote) out.push(`  > ${c.quote.replace(/\n/g, ' ')}`);
    }
  }
  if (res.compliance?.length) {
    out.push('', '## Compliance, then vs now (deterministic check)', '');
    for (const c of res.compliance) {
      const then = (c.checks || []).map(k => k.source_id).join(', ');
      const now = (c.current || []).map(k => k.source_id).join(', ');
      out.push(`- **${c.decision_id}**: then (${day(c.decided_on)}) ${RESULT[c.result] || c.result}${then ? ` under ${then}` : ''};`
        + ` as of ${day(c.as_of)} ${RESULT[c.current_result] || c.current_result}${now ? ` under ${now}` : ''}.`);
    }
  }
  if (res.warnings?.length) {
    out.push('', `Uses facts not yet reviewed by a person, with low model-reported confidence: ${res.warnings.map(w => w.fact_id).join(', ')}.`);
  }
  out.push('', '## Integrity', '');
  out.push(auditRow
    ? `This query is block ${auditRow.id} of Keystone's tamper-evident audit log (row hash ${shortHash(auditRow.hash)}). `
      + 'Anyone with access can recompute the chain in the Audit Trail or with GET /audit/verify.'
    : 'The audit block for this query was not found in the loaded audit log.');
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}

const esc = (s) => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// A printable page (the browser's Print dialog saves it as PDF). Rendered from the same Markdown, line by line.
export function evidenceHtml(md) {
  const body = md.split('\n').map(l => {
    if (l.startsWith('# ')) return `<h1>${esc(l.slice(2))}</h1>`;
    if (l.startsWith('## ')) return `<h2>${esc(l.slice(3))}</h2>`;
    if (l.startsWith('  > ')) return `<blockquote>${esc(l.slice(4))}</blockquote>`;
    const inline = esc(l.replace(/^- /, '')).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    if (l.startsWith('- ')) return `<li>${inline}</li>`;
    return l.trim() ? `<p>${inline}</p>` : '';
  }).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Keystone evidence</title><style>
body{font:14px/1.55 system-ui,sans-serif;color:#0f172a;max-width:46rem;margin:2rem auto;padding:0 1rem}
h1{font-size:20px}h2{font-size:15px;margin-top:1.4em;border-bottom:1px solid #e2e8f0}li{margin:.2em 0}
blockquote{margin:.2em 0 .6em 1.2em;color:#475569;font-style:italic}</style></head><body>${body}</body></html>`;
}
