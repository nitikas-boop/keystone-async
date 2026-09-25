import React from 'react';

export default function Logo({ size = 32, showText = true, subtitle = "TEMPORAL KNOWLEDGE GRAPH" }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
        {/* Crisp Geometric Keystone Emblem */}
        <svg 
          width={size} 
          height={size} 
          viewBox="0 0 36 36" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="skyIndigoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0284C7" />
              <stop offset="100%" stopColor="#6366F1" />
            </linearGradient>
          </defs>

          {/* Clean faceted Keystone polygon */}
          <polygon 
            points="18,3 33,10 33,26 18,33 3,26 3,10" 
            fill="url(#skyIndigoGradient)" 
            stroke="#38BDF8" 
            strokeWidth="1.5"
            strokeLinejoin="round"
          />

          {/* Paper structural facets */}
          <path 
            d="M18 3 L18 16 M33 10 L18 16 M33 26 L18 23 M18 33 L18 23 M3 26 L18 23 M3 10 L18 16" 
            stroke="rgba(255, 255, 255, 0.45)" 
            strokeWidth="1" 
          />

          {/* Central Anchor Node */}
          <circle cx="18" cy="18" r="3.5" fill="#FFFFFF" />
          <circle cx="18" cy="18" r="1.75" fill="#0284C7" />
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-heading font-bold text-lg tracking-tight text-[#0F172A] flex items-center">
              KEY<span className="text-[#0284C7]">STONE</span>
            </span>
            <span className="px-1.5 py-0.2 text-[9.5px] font-mono uppercase bg-sky-50 border border-sky-200 text-[#0284C7] rounded tracking-wider font-semibold">
              SOVEREIGN
            </span>
          </div>
          {subtitle && (
            <span className="text-[9px] font-mono tracking-wider text-[#64748B] uppercase">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
