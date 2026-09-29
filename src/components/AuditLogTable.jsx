import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Download, FlaskConical, Loader2, RefreshCw, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { canonicalRow, sha256, verifyAuditChain } from '../utils/crypto';
import { verifyAuditServer } from '../api';
import { useApp } from '../context';
import IdChip from './IdChip';
import { plural, shortHash, ts } from '../utils/format';
import { displayName } from '../utils/people';

// Hash-chained audit log (§6.10), read from GET /audit (all rows, paged by after_id). Two independent checks run
// side by side: the server's GET /audit/verify (names the first broken row) and a recomputation in this browser.
// "Block" is the row's position in the chain; the database id is in the row drawer.
const ACTIONS = ['policy_ingested', 'query', 'flag_created', 'action_proposed', 'approved', 'rejected', 'executed',
  'edited', 'extraction_reviewed'];
const ACTION_STYLE = { approved: 'badge-note-green', executed: 'badge-note-green', rejected: 'badge-note-rose',
  flag_created: 'badge-note-amber', action_proposed: 'badge-note-amber' };
const GENESIS = '0'.repeat(64);
const TAMPER_ENABLED = import.meta.env.VITE_DEV_TAMPER === '1';

function istDate(iso) {
  return new Date(new Date(iso).getTime() + 330 * 60000).toISOString().slice(0, 10);
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

export default function AuditLogTable({ auditLogs, onRefresh, focusBlock }) {
  const { team, isReader, restrictedIds, openEntity } = useApp();
  const [server, setServer] = useState(null);     // {ok, rows, first_broken_id, message, at} | {error}
  const [browser, setBrowser] = useState(null);   // {ok, checked, total, brokenPos, brokenId, message, at} | {running}
  const [filters, setFilters] = useState({ actor: '', action: '', from: '', to: '', q: '' });
  const [hover, setHover] = useState(null);       // chain position under the pointer
  const [drawer, setDrawer] = useState(null);     // row
  const [sim, setSim] = useState(null);           // {pos, rows, result}: tamper simulation on a copy
  const [copied, setCopied] = useState(null);

  const rows = useMemo(() => [...(auditLogs || [])].sort((a, b) => a.id - b.id).map((r, i) => ({ ...r, pos: i + 1 })), [auditLogs]);

  const verify = useCallback(async () => {
    setBrowser({ running: true, checked: 0, total: rows.length });
    setServer(null);
    verifyAuditServer()
      .then(s => setServer({ ...s, at: new Date().toISOString() }))
      .catch(e => setServer({ error: e.message, at: new Date().toISOString() }));
    try {
      const r = await verifyAuditChain(rows, (done, total) => setBrowser(b => ({ ...b, checked: done, total })));
      setBrowser({ ...r, total: rows.length, at: new Date().toISOString() });
    } catch (e) {
      setBrowser({ error: e.message, at: new Date().toISOString() });
    }
  }, [rows]);

  // Verify on open and whenever the rows change, so the status shown is always the result of a check that ran.
  useEffect(() => { if (rows.length) verify(); }, [rows, verify]);
  useEffect(() => {
    if (focusBlock == null) return;
    const r = rows.find(x => x.id === Number(focusBlock));
    if (r) setDrawer(r);
  }, [focusBlock, rows]);

  const actors = [...new Set(rows.map(r => r.actor))].sort();
  const shown = rows.filter(r => (!filters.actor || r.actor === filters.actor) && (!filters.action || r.action === filters.action)
    && (!filters.from || istDate(r.ts) >= filters.from) && (!filters.to || istDate(r.ts) <= filters.to)
    && (!filters.q || `${r.object_type} ${r.object_id} ${r.source_ids.join(' ')}`.toLowerCase().includes(filters.q.toLowerCase())));
  const filtered = shown.length !== rows.length;

  // Restricted IDs are masked on screen for non-readers (the hash check still uses the real values).
  const masked = (id) => !isReader && restrictedIds.has(id);

  const exportRows = (fmt) => {
    const cols = ['id', 'ts', 'actor', 'action', 'object_type', 'object_id', 'source_ids', 'payload_hash', 'prev_hash', 'hash'];
    const data = shown.map(r => Object.fromEntries(cols.map(c => [c, r[c]])));
    if (fmt === 'json') return download('keystone-audit.json', JSON.stringify(data, null, 2), 'application/json');
    const esc = v => `"${String(Array.isArray(v) ? v.join(' ') : v).replace(/"/g, '""')}"`;
    download('keystone-audit.csv', [cols.join(','), ...data.map(r => cols.map(c => esc(r[c])).join(','))].join('\n'), 'text/csv');
  };

  const simulate = async () => {
    const pos = drawer?.pos || Math.ceil(rows.length / 2);
    const copy = rows.map(r => (r.pos === pos ? { ...r, actor: 'user:mallory' } : r));
    const result = await verifyAuditChain(copy);
    setSim({ pos, result });
  };

  const brokenPos = sim ? sim.result.brokenPos : browser?.brokenPos;
  const copy = (text) => { navigator.clipboard.writeText(text); setCopied(text); setTimeout(() => setCopied(null), 1500); };

  return (
    <div className="flex h-full gap-4 min-h-0">
      <div className="flex-1 min-w-0 flex flex-col paper-sheet overflow-hidden">
        {/* Header + verification */}
        <div className="px-4 py-3 bg-white border-b border-slate-100 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-heading font-semibold text-[13px] text-[#0F172A] flex items-center gap-2">
                <ShieldCheck size={15} className="text-emerald-700" aria-hidden="true" /> Tamper-evident audit log
              </h2>
              <p className="text-[12px] text-[#64748B]">
                Append-only. Each block stores the SHA-256 hash of the block before it, so changing any block breaks every later link.
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {onRefresh && <button onClick={onRefresh} className="icon-btn" aria-label="Reload the audit log" title="Reload"><RefreshCw size={13} /></button>}
              <button onClick={() => { setSim(null); verify(); }} className="btn-secondary" disabled={browser?.running}>
                <ShieldCheck size={13} /> Verify Full Chain
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <VerifyCard title="Server check (GET /audit/verify)" v={server} kind="server" />
            <VerifyCard title={sim ? 'Browser check · SIMULATED TAMPER' : 'Browser check (recomputed here)'} v={sim ? { ...sim.result, total: rows.length, at: new Date().toISOString() } : browser} kind="browser" sim={!!sim} />
          </div>
          {sim && (
            <div className="p-2 rounded-lg badge-note-amber text-[12.5px] flex items-center justify-between gap-2">
              <span>Simulation: block {sim.pos}'s actor was changed to <span className="font-mono">user:mallory</span> in an in-memory copy in this browser.
                The database was not touched. The browser check now fails at block {sim.result.brokenPos}.</span>
              <button className="btn-secondary" onClick={() => setSim(null)}>Reset</button>
            </div>
          )}
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
            <select className="field" value={filters.actor} onChange={e => setFilters(f => ({ ...f, actor: e.target.value }))} aria-label="Filter by actor">
              <option value="">All actors</option>
              {actors.map(a => <option key={a} value={a}>{displayName(a, team)}</option>)}
            </select>
            <select className="field" value={filters.action} onChange={e => setFilters(f => ({ ...f, action: e.target.value }))} aria-label="Filter by action">
              <option value="">All actions</option>
              {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <label className="flex items-center gap-1 text-[#475569]">From <input type="date" className="field" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} /></label>
            <label className="flex items-center gap-1 text-[#475569]">to <input type="date" className="field" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} /></label>
            <input className="field w-44" placeholder="Object or source ID" value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} aria-label="Filter by object or source ID" />
            {filtered && <button className="text-[#0369A1] underline cursor-pointer" onClick={() => setFilters({ actor: '', action: '', from: '', to: '', q: '' })}>Clear</button>}
            <span className="ml-auto text-[#475569]">{filtered ? `${shown.length} of ${plural(rows.length, 'block')}` : plural(rows.length, 'block')}</span>
            <button className="btn-secondary" onClick={() => exportRows('json')}><Download size={13} /> JSON</button>
            <button className="btn-secondary" onClick={() => exportRows('csv')}><Download size={13} /> CSV</button>
            {TAMPER_ENABLED && (
              <button className="btn-danger" onClick={simulate} title="Dev only (VITE_DEV_TAMPER=1): alter a copy of one block in this browser and re-run the check">
                <FlaskConical size={13} /> Simulate tamper{drawer ? ` on block ${drawer.pos}` : ''}
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse text-[13px]">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="border-b border-slate-200 text-[12px] text-[#475569]">
                <th className="py-2 px-3 font-medium">Block</th>
                <th className="py-2 px-3 font-medium">Time (IST)</th>
                <th className="py-2 px-3 font-medium">Actor</th>
                <th className="py-2 px-3 font-medium">Action</th>
                <th className="py-2 px-3 font-medium">Object</th>
                <th className="py-2 px-3 font-medium">Source IDs</th>
                <th className="py-2 px-3 font-medium">Parent hash</th>
                <th className="py-2 px-3 font-medium">Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-[#475569]">No audit entries yet. Asking a question or approving a proposal appends a block.</td></tr>
              )}
              {shown.map(r => {
                const parentHover = hover != null && r.pos === hover - 1;
                const broken = brokenPos === r.pos;
                return (
                  <tr key={r.id} onClick={() => setDrawer(r)} onMouseEnter={() => setHover(r.pos)} onMouseLeave={() => setHover(null)}
                      tabIndex={0} onKeyDown={e => e.key === 'Enter' && setDrawer(r)}
                      className={`cursor-pointer hover:bg-slate-50 ${broken ? 'bg-rose-50' : ''} ${drawer?.id === r.id ? 'bg-sky-50/60' : ''}`}>
                    <td className="py-2 px-3 font-mono font-semibold whitespace-nowrap">
                      {r.pos}{broken && <span className="ml-1 text-[11.5px] font-sans font-normal px-1 rounded badge-note-rose">broken</span>}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap font-mono text-[12px] text-[#334155]" title={ts(r.ts).full}>{ts(r.ts).ist}</td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {displayName(r.actor, team)}
                      <span className="block font-mono text-[11px] text-[#64748B]">{r.actor}</span>
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <span className={`px-1.5 py-0.5 rounded-md font-mono text-[12px] ${ACTION_STYLE[r.action] || 'badge-note-slate'}`}>{r.action}</span>
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap"><ObjectRef r={r} masked={masked} openEntity={openEntity} /></td>
                    <td className="py-2 px-3">
                      <div className="flex flex-wrap gap-1 max-w-[16rem]">
                        {r.source_ids.filter(id => !masked(id)).map(id => <IdChip key={id} id={id} />)}
                        {r.source_ids.some(masked) && <span className="px-1.5 rounded bg-slate-100 text-[12px] text-[#475569]" title="Hidden: restricted">restricted</span>}
                      </div>
                    </td>
                    <td className={`py-2 px-3 font-mono text-[12px] whitespace-nowrap ${hover === r.pos ? 'bg-amber-100' : ''}`}
                        title={r.prev_hash}>
                      {r.prev_hash === GENESIS ? <span className="font-sans">genesis (64 zeros)</span> : shortHash(r.prev_hash)}
                    </td>
                    <td className={`py-2 px-3 font-mono text-[12px] whitespace-nowrap ${parentHover ? 'bg-amber-100' : ''}`} title={r.hash}>
                      {shortHash(r.hash)}
                      <button onClick={e => { e.stopPropagation(); copy(r.hash); }} className="ml-1 align-middle text-[#64748B] hover:text-[#0369A1] cursor-pointer"
                              aria-label={`Copy hash of block ${r.pos}`}><Copy size={11} /></button>
                      {copied === r.hash && <span className="ml-1 font-sans text-[11.5px] text-emerald-700">copied</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-1.5 border-t border-slate-100 text-[12px] text-[#475569]">
          Hover a block: its parent hash and the previous block's hash light up together. They must be identical for the chain to hold.
        </p>
      </div>

      {drawer && <Drawer r={drawer} rows={rows} team={team} masked={masked} openEntity={openEntity} onClose={() => setDrawer(null)} />}
    </div>
  );
}

function VerifyCard({ title, v, kind, sim }) {
  let body, cls = 'border-slate-200 bg-slate-50';
  if (!v) body = <span className="text-[#475569]">Not run yet</span>;
  else if (v.running) {
    const pct = v.total ? Math.round((v.checked / v.total) * 100) : 0;
    body = (
      <span className="flex items-center gap-2 w-full">
        <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Hashing {v.checked}/{v.total}
        <span className="flex-1 h-1.5 rounded bg-slate-200 overflow-hidden"><span className="block h-full bg-[#0284C7]" style={{ width: `${pct}%` }} /></span>
      </span>
    );
  } else if (v.error) {
    cls = 'border-rose-200 bg-rose-50';
    body = <span className="text-rose-800">Could not run: {v.error}</span>;
  } else if (v.ok) {
    cls = 'border-emerald-200 bg-emerald-50';
    const n = kind === 'server' ? v.rows : v.checked;
    body = <span className="text-[#14532D] flex items-center gap-1"><ShieldCheck size={13} aria-hidden="true" /> Valid · {plural(n, 'block')} · verified {ts(v.at).time}</span>;
  } else {
    cls = 'border-rose-200 bg-rose-50';
    const pos = kind === 'server' ? `row id ${v.first_broken_id}` : `block ${v.brokenPos}`;
    body = <span className="text-rose-900 flex items-center gap-1"><ShieldAlert size={13} aria-hidden="true" /> Broken at {pos} · {ts(v.at).time}</span>;
  }
  return (
    <div className={`rounded-lg border px-2.5 py-1.5 text-[12.5px] ${cls} ${sim ? 'ring-2 ring-amber-300' : ''}`} title={v?.message || ''}>
      <div className="text-[12px] font-semibold text-[#334155]">{title}</div>
      <div className="flex items-center min-h-5">{body}</div>
    </div>
  );
}

function ObjectRef({ r, masked, openEntity }) {
  const id = r.object_id;
  if (r.object_type === 'proposal') return <IdChip id={`#${id}`} type="proposal" label="proposal" />;
  if (r.object_type === 'flag' || r.object_type === 'policy_version' || r.object_type === 'decision') {
    return masked(id) ? <span className="text-[#475569]">restricted</span> : <IdChip id={id} type={r.object_type === 'decision' ? 'decision' : undefined} />;
  }
  if (r.object_type === 'extraction') {
    return (
      <button className="text-[12.5px] underline decoration-dotted cursor-pointer text-[#5B21B6]" onClick={e => { e.stopPropagation(); openEntity(id, 'extraction'); }}>
        extraction #{id}
      </button>
    );
  }
  return <span className="text-[12.5px] text-[#334155]" title={id}>{r.object_type} <span className="font-mono text-[11.5px]">{shortHash(id, 4)}</span></span>;
}

function Drawer({ r, rows, team, masked, openEntity, onClose }) {
  const [recomputed, setRecomputed] = useState(null);
  const canonical = canonicalRow(r);
  useEffect(() => { sha256(canonical).then(setRecomputed).catch(() => setRecomputed('')); }, [canonical]);
  // The hash is recomputed on the real values; restricted IDs are only masked in what is displayed.
  const secretIds = [...r.source_ids, r.object_id].filter(masked);
  const shownCanonical = secretIds.reduce((txt, id) => txt.split(JSON.stringify(id)).join('"[restricted]"'), canonical);
  const prev = rows.find(x => x.pos === r.pos - 1);
  return (
    <aside className="w-[26rem] shrink-0 paper-sheet flex flex-col overflow-hidden" aria-label={`Audit block ${r.pos}`}>
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-heading font-semibold text-[14px]">Block {r.pos} <span className="font-normal text-[#475569] text-[12.5px]">(database id {r.id})</span></h3>
        <button className="icon-btn" onClick={onClose} aria-label="Close block details"><X size={14} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 text-[13px]">
        <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5">
          <dt className="text-[#64748B]">Time</dt><dd>{ts(r.ts).ist}<span className="block text-[12px] text-[#475569] font-mono">{r.ts}</span></dd>
          <dt className="text-[#64748B]">Actor</dt><dd>{displayName(r.actor, team)} <span className="font-mono text-[12px] text-[#475569]">{r.actor}</span></dd>
          <dt className="text-[#64748B]">Action</dt><dd className="font-mono">{r.action}</dd>
          <dt className="text-[#64748B]">Object</dt><dd><ObjectRef r={r} masked={masked} openEntity={openEntity} /></dd>
        </dl>
        {r.action === 'rejected' && (
          <p className="p-2 rounded-md badge-note-slate">Reason recorded (hash <span className="font-mono">{shortHash(r.payload_hash)}</span>). The log stores only the hash of the payload, not the reason text.</p>
        )}
        <section>
          <h4 className="text-[12px] font-semibold text-[#475569] mb-1">Canonical payload that was hashed</h4>
          {secretIds.length > 0 && <p className="text-[12px] text-[#475569] mb-1">Restricted IDs are masked here; the hash below is recomputed on the real values.</p>}
          <pre className="p-2.5 rounded-lg bg-slate-900 text-slate-100 text-[11.5px] whitespace-pre-wrap break-all">{shownCanonical}</pre>
          <p className="text-[12px] text-[#475569] mt-1">
            <span className="font-mono">payload_hash</span> is the SHA-256 of the action's own payload; the payload itself is not stored.
          </p>
        </section>
        <section className="space-y-1 font-mono text-[12px]">
          <div><span className="font-sans text-[#64748B]">Stored hash</span><div className="break-all">{r.hash}</div></div>
          <div><span className="font-sans text-[#64748B]">Recomputed in this browser</span><div className="break-all">{recomputed ?? '…'}</div></div>
          <div className={`font-sans ${recomputed === r.hash ? 'text-emerald-800' : 'text-rose-800'}`}>
            {recomputed == null ? '' : recomputed === r.hash ? '✓ Match: this block has not changed since it was written.' : '✗ Mismatch: this block was altered.'}
          </div>
          <div className="pt-1"><span className="font-sans text-[#64748B]">Parent hash</span><div className="break-all">{r.prev_hash}</div></div>
          <div className="font-sans">
            {r.prev_hash === GENESIS ? 'Genesis block: its parent is 64 zeros.'
              : prev && prev.hash === r.prev_hash ? `✓ Equals block ${prev.pos}'s hash.` : `✗ Does not equal block ${prev?.pos}'s hash.`}
          </div>
        </section>
      </div>
    </aside>
  );
}
