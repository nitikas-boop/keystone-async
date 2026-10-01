import React, { useState } from 'react';
import { reportBlob, reportText } from '../../api/p2';
import { todayIST } from '../../utils/format';
import { errText, Field, inputCls, Msg, Section } from './common';

// J: generate a report (only what this user may see), preview the Markdown, download Markdown or PDF.
export default function Reports({ initialKind = 'compliance', initialAsOf }) {
  const [kind, setKind] = useState(initialKind);
  const [asOf, setAsOf] = useState(initialAsOf || todayIST());
  const [from, setFrom] = useState(`${todayIST().slice(0, 4)}-01-01`);
  const [to, setTo] = useState(todayIST());
  const [md, setMd] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const params = kind === 'compliance' ? { as_of: asOf } : { date_from: from, date_to: to };
  const name = kind === 'compliance' ? `keystone-compliance-${asOf}` : `keystone-audit-prep-${from}-${to}`;

  const generate = async () => {
    setBusy(true); setMsg(null);
    try { setMd(await reportText(kind, params)); } catch (e) { setMsg({ text: errText(e) }); }
    setBusy(false);
  };
  const download = async (format) => {
    try {
      const url = URL.createObjectURL(await reportBlob(kind, params, format));
      const a = Object.assign(document.createElement('a'), { href: url, download: `${name}.${format}` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setMsg({ text: errText(e) }); }
  };

  return (
    <Section title="Reports">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Report">
          <select className={inputCls} value={kind} onChange={e => { setKind(e.target.value); setMd(''); }}>
            <option value="compliance">Compliance as of a date</option>
            <option value="audit-prep">Audit-prep pack</option>
          </select>
        </Field>
        {kind === 'compliance'
          ? <Field label="As of"><input type="date" className={inputCls} value={asOf} onChange={e => setAsOf(e.target.value)} /></Field>
          : <>
            <Field label="From"><input type="date" className={inputCls} value={from} onChange={e => setFrom(e.target.value)} /></Field>
            <Field label="To"><input type="date" className={inputCls} value={to} onChange={e => setTo(e.target.value)} /></Field>
          </>}
        <button className="btn-secondary" onClick={generate} disabled={busy}>{busy ? 'Generating…' : 'Generate'}</button>
        <button className="btn-secondary" onClick={() => download('md')}>Download Markdown</button>
        <button className="btn-secondary" onClick={() => download('pdf')}>Download PDF</button>
      </div>
      <Msg msg={msg} />
      {md && <pre className="text-[12px] whitespace-pre-wrap bg-kb-bg border border-kb-line rounded-md p-3 max-h-[60vh] overflow-auto" data-testid="report-preview">{md}</pre>}
    </Section>
  );
}
