import React, { useEffect, useRef, useState } from 'react';
import { Menu, Pin, PinOff } from 'lucide-react';

// Left navigation: a 56px icon rail that expands to 240px on hover or keyboard focus, overlaying the content (no
// layout shift). Pinned keeps it open and reserves its width. Touch screens: the menu button toggles it.
// items: [{id, label, Icon, badge?}] — already filtered by the caller to what the role can use (no dead links).
export default function Sidebar({ items, active, onSelect, user }) {
  const [pinned, setPinned] = useState(() => { try { return localStorage.getItem('kst.nav.pinned') === '1'; } catch { return false; } });
  const [hover, setHover] = useState(false);
  const [tapped, setTapped] = useState(false);
  const ref = useRef(null);
  const open = pinned || hover || tapped;

  const pin = () => setPinned(p => {
    try { localStorage.setItem('kst.nav.pinned', p ? '0' : '1'); } catch { /* storage unavailable: in memory only */ }
    return !p;
  });
  // A tap outside closes the touch-opened sidebar.
  useEffect(() => {
    if (!tapped) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setTapped(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [tapped]);

  return (
    <div className={`relative shrink-0 z-40 transition-[width] duration-150 ${pinned ? 'w-60' : 'w-14'}`}>
      <nav
        ref={ref}
        aria-label="Main"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHover(false); }}
        className={`absolute inset-y-0 left-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden transition-[width,box-shadow] duration-150 ${
          open ? 'w-60' : 'w-14'} ${open && !pinned ? 'shadow-xl' : ''}`}
      >
        <div className="h-12 shrink-0 flex items-center gap-1 px-2.5 border-b border-slate-100">
          <button type="button" onClick={() => setTapped(t => !t)} aria-expanded={open} aria-label={open ? 'Collapse navigation' : 'Expand navigation'}
            className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center text-[#475569] hover:bg-slate-100 cursor-pointer">
            <Menu size={17} />
          </button>
          {open && (
            <button type="button" onClick={pin} aria-pressed={pinned} title={pinned ? 'Unpin the sidebar' : 'Pin the sidebar open'}
              className="ml-auto h-8 px-2 rounded-lg flex items-center gap-1.5 text-[12px] text-[#64748B] hover:bg-slate-100 cursor-pointer whitespace-nowrap">
              {pinned ? <PinOff size={13} /> : <Pin size={13} />} {pinned ? 'Unpin' : 'Pin'}
            </button>
          )}
        </div>

        <ul className="flex-1 py-2 flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden">
          {items.map(({ id, label, Icon, badge }) => {
            const on = active === id;
            return (
              <li key={id} className="px-2">
                <button type="button" onClick={() => { onSelect(id); setTapped(false); }} aria-current={on ? 'page' : undefined}
                  title={open ? undefined : label}
                  className={`relative w-full h-10 rounded-lg flex items-center gap-3 px-2.5 text-[13.5px] whitespace-nowrap cursor-pointer transition-colors ${
                    on ? 'bg-sky-50 text-[#0369A1] font-semibold' : 'text-[#334155] hover:bg-slate-100'}`}>
                  <Icon size={18} className={`shrink-0 ${on ? 'text-[#0284C7]' : 'text-[#64748B]'}`} aria-hidden="true" />
                  <span className={open ? '' : 'sr-only'}>{label}</span>
                  {badge > 0 && (
                    <span aria-label={`${badge} waiting`}
                      className={`min-w-5 h-5 px-1 rounded-full bg-[#0284C7] text-white text-[11px] font-bold flex items-center justify-center ${
                        open ? 'ml-auto' : 'absolute top-0.5 right-0.5 min-w-4 h-4 text-[10px]'}`}>
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {user && (
          <div className="shrink-0 border-t border-slate-100 p-2.5 flex items-center gap-2.5" title={`${user.name} · ${user.role}`}>
            <span className="h-9 w-9 shrink-0 rounded-full bg-sky-100 text-[#0369A1] font-semibold text-[13px] flex items-center justify-center">
              {(user.name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()}
            </span>
            {open && (
              <div className="min-w-0 leading-tight">
                <div className="text-[13px] font-semibold text-[#0F172A] truncate">{user.name}</div>
                <div className="text-[11.5px] text-[#64748B] truncate capitalize">{user.role}</div>
              </div>
            )}
          </div>
        )}
      </nav>
    </div>
  );
}
