import React from 'react';

// Swap the brand mark by replacing public/keystone-mark.png (emblem only, no wordmark; the name is rendered as text
// so it stays crisp at header size). It is also the favicon (index.html).
const MARK_SRC = '/keystone-mark.png';
const MARK_ASPECT = 256 / 181;

export default function Logo({ size = 32, showText = true, subtitle = "TEMPORAL KNOWLEDGE GRAPH" }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <img
        src={MARK_SRC}
        alt="Keystone"
        height={size}
        width={Math.round(size * MARK_ASPECT)}
        className="shrink-0 object-contain mix-blend-multiply"
        style={{ height: size, width: 'auto' }}
      />

      {showText && (
        <div className="flex flex-col justify-center leading-none">
          <div className="flex items-center gap-1.5">
            <span className="font-heading font-bold text-lg leading-none tracking-tight text-[#0B1437]">
              KeyStone
            </span>
            <span className="px-1.5 py-0.5 text-[9.5px] leading-none font-mono uppercase bg-sky-50 border border-sky-200 text-[#0284C7] rounded tracking-wider font-semibold">
              SOVEREIGN
            </span>
          </div>
          {subtitle && (
            <span className="mt-1 text-[9px] leading-none font-mono tracking-wider text-[#64748B] uppercase">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
