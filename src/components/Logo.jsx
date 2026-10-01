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
        // The PNG is a multicolour mark on white: multiply drops the white, and grayscale keeps it to one calm
        // tone (white stays white, so no box) that sits on the Ice & Butter palette.
        style={{ height: size, width: 'auto', filter: 'grayscale(1) contrast(1.2)' }}
      />

      {showText && (
        <div className="flex flex-col justify-center leading-none">
          <div className="flex items-center gap-1.5">
            <span className="font-heading font-bold text-lg leading-none tracking-tight text-kb-navy">
              KeyStone
            </span>
            <span className="px-1.5 py-0.5 text-[11px] leading-none font-mono uppercase bg-kb-ice border border-kb-cobalt/50 text-kb-cobalt-ink rounded tracking-wider font-semibold">
              SOVEREIGN
            </span>
          </div>
          {subtitle && (
            <span className="mt-1 text-[11px] leading-none font-mono tracking-wider text-kb-muted uppercase">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
