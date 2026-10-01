import React, { useCallback, useEffect, useState } from 'react';
import { Bell as BellIcon, Lock } from 'lucide-react';
import * as p1 from '../../api/p1';

// E: the in-app notification bell (polling). Text is generic and built on the server; items the viewer may not see
// read "Restricted item".
export default function Bell() {
  const [data, setData] = useState({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const load = useCallback(() => p1.notifications().then(setData).catch(() => {}), []);
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);

  const readAll = () => p1.readAllNotifications().then(load);
  return (
    <div className="relative">
      <button onClick={() => { setOpen(o => !o); if (!open) load(); }} aria-label={`Notifications, ${data.unread} unread`}
        className="relative h-8 w-8 rounded-lg flex items-center justify-center text-kb-muted hover:bg-kb-ice/60 cursor-pointer" title="Notifications">
        <BellIcon size={15} />
        {data.unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-kb-alert text-white text-[10px] leading-none font-bold flex items-center justify-center">{data.unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-10 w-80 max-h-96 overflow-y-auto paper-sheet-elevated p-2 z-50 text-[13px]" role="dialog" aria-label="Notifications">
          <div className="flex items-center justify-between px-1 pb-1.5 border-b border-kb-line">
            <b>Notifications</b>
            <button className="text-[12px] text-kb-cobalt-ink cursor-pointer" onClick={readAll}>Mark all read</button>
          </div>
          {data.items.length === 0 && <p className="p-2 text-kb-muted">Nothing yet.</p>}
          {data.items.map(n => (
            <button key={n.id} onClick={() => !n.read && p1.readNotification(n.id).then(load)}
              className={`w-full text-left px-2 py-1.5 rounded-lg hover:bg-kb-bg-soft cursor-pointer ${n.read ? 'text-kb-muted' : 'font-medium'}`}>
              <div>{n.text}</div>
              <div className="text-[11.5px] text-kb-muted/70 flex items-center gap-1">
                {n.restricted ? <><Lock size={10} /> Restricted item</> : n.ref_id && <span className="font-mono">{n.ref_id}</span>}
                <span>· {new Date(n.created_at).toLocaleString()}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
