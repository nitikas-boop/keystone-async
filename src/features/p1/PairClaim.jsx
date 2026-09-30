import React, { useEffect, useRef, useState } from 'react';
import { Smartphone } from 'lucide-react';
import * as p1 from '../../api/p1';
import { Btn, ErrorNote, Field, Input, useAction } from './ui';

// H, the phone's side: the QR on the laptop opens this page with ?pair=<token>; claiming it gives this phone its own
// session (listed under Linked devices, revocable). Without a token, scan the QR here (camera needs HTTPS or localhost).
export default function PairClaim({ token: initial, onDone, onCancel }) {
  const [token, setToken] = useState(initial || '');
  const [label, setLabel] = useState(() => (/iPhone|iPad/.test(navigator.userAgent) ? 'iPhone'
    : /Android/.test(navigator.userAgent) ? 'Android phone' : 'Phone'));
  const [scan, setScan] = useState(false);
  const [run, busy, error] = useAction();
  const scanner = useRef(null);

  useEffect(() => {
    if (!scan) return undefined;
    let stopped = false;
    import('html5-qrcode').then(({ Html5QrcodeScanner }) => {
      if (stopped) return;
      scanner.current = new Html5QrcodeScanner('pair-scanner', { fps: 10, qrbox: 220 }, false);
      scanner.current.render((text) => {
        const t = new URL(text, window.location.href).searchParams.get('pair') || text;
        setToken(t); setScan(false);
      }, () => {});
    });
    return () => { stopped = true; scanner.current?.clear().catch(() => {}); };
  }, [scan]);

  const claim = () => run(async () => {
    const me = await p1.claimPairing(token.trim(), label.trim() || 'Phone');
    window.history.replaceState(null, '', window.location.pathname);
    onDone(me);
  });

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[#F8FAFC] p-4">
      <div className="w-full max-w-sm paper-sheet-elevated p-5 flex flex-col gap-3 text-[13px]">
        <h2 className="font-heading font-semibold text-base flex items-center gap-2"><Smartphone size={16} /> Link this phone</h2>
        <p className="text-[#475569]">This phone will get its own Keystone session for approvals. You can revoke it from the laptop at any time.</p>
        <Field label="Pairing code"><Input value={token} onChange={e => setToken(e.target.value)} className="font-mono" /></Field>
        <Field label="Name for this device"><Input value={label} onChange={e => setLabel(e.target.value)} /></Field>
        {scan && <div id="pair-scanner" />}
        <ErrorNote error={error} />
        <Btn kind="primary" disabled={busy || !token.trim()} onClick={claim}>{busy ? 'Linking…' : 'Link this phone'}</Btn>
        {!initial && <Btn onClick={() => setScan(s => !s)}>{scan ? 'Stop scanning' : 'Scan the QR code'}</Btn>}
        {onCancel && <Btn onClick={onCancel}>Cancel</Btn>}
      </div>
    </div>
  );
}
