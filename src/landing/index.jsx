// Entry point for the landing intro. Kept tiny on purpose: three.js and everything 3D live in lazy chunks, so the
// dashboard bundle is unaffected. VITE_LANDING_3D=0 removes the intro entirely.
import { lazy, Suspense, useState } from 'react';

const Intro3D = lazy(() => import('./KeystoneIntro'));
const IntroStatic = lazy(() => import('./StaticFallback'));

function supports3D() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function Gate(props) {
  const [use3D] = useState(supports3D);
  const Intro = use3D ? Intro3D : IntroStatic;
  return (
    <Suspense fallback={<div aria-hidden="true" style={{ height: '100vh', background: '#11100D' }} />}>
      <Intro {...props} />
    </Suspense>
  );
}

export default function KeystoneIntro(props) {
  if (import.meta.env.VITE_LANDING_3D === '0') return null;
  return <Gate {...props} />;
}
