import { useEffect, useState } from 'react';

function useMedia(query) {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const m = window.matchMedia?.(query);
    if (!m) return undefined;
    const fn = () => setOn(m.matches);
    m.addEventListener('change', fn);
    return () => m.removeEventListener('change', fn);
  }, [query]);
  return on;
}

export const useReducedMotion = () => useMedia('(prefers-reduced-motion: reduce)');
export const useCompact = () => useMedia('(max-width: 767px)');
