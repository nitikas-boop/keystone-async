import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { confirmBaseline, latestScan, rescan } from '../../api/p2';
import { errText, Msg, Section, Table } from './common';

// L2 scan report: "2 new, 1 updated, 0 missing" for the latest sign-in scan, only in scopes this user may access.
// New and updated files wait in Ingestion Review; nothing here ingests anything.
export default function ScanReport({ onOpenReview, onChanged }) {
  const { t } = useTranslation();
  const [run, setRun] = useState(undefined);
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => latestScan().then(setRun).catch(e => setMsg({ text: errText(e) })), []);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, ok) => {
    setMsg(null);
    try { setMsg({ ok: true, text: ok(await fn()) }); await load(); onChanged?.(); }
    catch (e) { setMsg({ text: errText(e) }); }
  };

  return (
    <Section title={t('scan.title')} actions={<>
      <button className="btn-secondary" onClick={() => act(rescan, r => `Scan #${r.id}: ${t('scan.summary', { n: r.new, u: r.updated, m: r.missing })}`)}>{t('scan.rescan')}</button>
      {onOpenReview && <button className="btn-secondary" onClick={onOpenReview}>{t('scan.review')}</button>}
    </>}>
      <Msg msg={msg} />
      {run === null && <p className="text-[13px]">{t('scan.none')}</p>}
      {run && <>
        <p className="text-[13px]" data-testid="scan-summary">
          Scan #{run.id} by {run.triggered_by} at {run.started_at.slice(0, 19).replace('T', ' ')} UTC: <b>{t('scan.summary', { n: run.new, u: run.updated, m: run.missing })}</b>
          {run.capped && ' (capped; the next scan continues)'}
        </p>
        {(run.status === 'awaiting_baseline' || run.baseline_files > 0) && (
          <p className="text-[12.5px] badge-note-amber px-2 py-1.5 rounded-md flex items-center gap-2">
            {t('scan.baseline')}
            <button className="btn-secondary" onClick={() => act(() => confirmBaseline(run.id), o => `${o.queued} file(s) queued for Ingestion Review.`)}>{t('scan.confirm')}</button>
          </p>
        )}
        <Table head={['File', 'Change', 'Scope', 'Modified', 'Review']} empty="No new, updated or missing files you can see."
          rows={run.files.map(f => ({ key: f.id, cells: [f.path, f.change, f.scope, f.modified, f.review_status + (f.ingested_source_id ? ` → ${f.ingested_source_id}` : '')] }))} />
      </>}
    </Section>
  );
}
