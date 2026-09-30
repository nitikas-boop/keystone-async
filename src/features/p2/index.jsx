// Person 2's screens. The Dashboard mounts `views` as their own nav group and `HeaderWidget` in the top bar.
// view: { id, label, short, Icon, render: (props) => JSX }. Only this file and its folder are edited by Person 2.
import React, { useState } from 'react';
import { Scale } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './i18n';
import Audio from './Audio';
import Proposals from './Proposals';
import Reports from './Reports';
import ScanReport from './ScanReport';
import SessionStatus from './SessionStatus';

const TABS = ['proposals', 'scan', 'reports', 'audio'];

function Hub(props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('proposals');
  return (
    <div className="h-full overflow-y-auto space-y-3 pr-1">
      <nav className="flex gap-1" aria-label={t('navLong')}>
        {TABS.map(k => (
          <button key={k} onClick={() => setTab(k)} aria-current={tab === k ? 'page' : undefined}
                  className={`h-8 px-3 rounded-md text-[13px] border ${tab === k ? 'bg-white border-slate-300 font-semibold' : 'border-transparent text-[#475569]'}`}>
            {t(`tabs.${k}`)}
          </button>
        ))}
      </nav>
      {tab === 'proposals' && <Proposals {...props} />}
      {tab === 'scan' && <ScanReport onChanged={props.onChanged} />}
      {tab === 'reports' && <Reports initialAsOf={props.asOfDate} />}
      {tab === 'audio' && <Audio onChanged={props.onChanged} />}
    </div>
  );
}

export const views = [
  { id: 'P2', label: 'Knowledge & Conflicts', short: 'Knowledge', Icon: Scale, render: (props) => <Hub {...props} /> },
];
export const HeaderWidget = SessionStatus;
