import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { heartbeat, modelStatus } from '../../api/p2';
import { setLanguage } from './i18n';

// L1 status line (cold | loading | ready | failed) and the I language switch, in the top bar. While signed in it
// sends a heartbeat every minute so the model stays loaded; with no heartbeat the backend unloads it when idle.
export default function SessionStatus() {
  const { t, i18n } = useTranslation();
  const [s, setS] = useState(null);

  useEffect(() => {
    let alive = true;
    const poll = () => modelStatus().then(x => alive && setS(x)).catch(() => alive && setS(null));
    poll();
    const fast = setInterval(poll, 5000);
    const beat = setInterval(() => heartbeat().catch(() => {}), 60000);
    return () => { alive = false; clearInterval(fast); clearInterval(beat); };
  }, []);

  const status = s?.status;
  const cls = { ready: 'badge-note-green', loading: 'badge-note-sky', failed: 'badge-note-rose' }[status] || 'badge-note-slate';
  const title = s ? `${s.model} · sessions: ${s.active_sessions}` + (s.load_seconds ? ` · loaded in ${s.load_seconds} s` : '')
    + (s.error ? ` · ${s.error}` : '') + (s.resident ? ` · resident: ${s.resident.map(m => m.name).join(', ') || 'none'}` : '')
    : 'GET /session/model-status did not answer';
  return (
    <div className="flex items-center gap-2">
      <span className={`h-8 inline-flex items-center text-[12px] px-2 rounded-lg whitespace-nowrap ${cls}`} title={title} data-testid="model-status">
        {status ? t(`model.${status}`) : '—'}
      </span>
      <label className="sr-only" htmlFor="kst-lang">{t('lang')}</label>
      <select id="kst-lang" value={i18n.language} onChange={e => setLanguage(e.target.value)}
              className="h-8 text-[12px] border border-kb-line-strong rounded-lg bg-kb-bg px-1.5" title={t('lang')}>
        <option value="en">English</option>
        <option value="hi">हिंदी</option>
      </select>
    </div>
  );
}
