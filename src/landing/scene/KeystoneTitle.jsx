// KEYSTONE in Playfair Display, bundled locally (troika loads the .woff from our own origin, never Google).
// Fades in and slowly grows while the keystone slides out, then dissolves with the shatter.
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import playfairUrl from '@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff?url';
import { KS } from '../palette';
import { smooth, easeOutQuart, ramp } from '../timeline';

export default function KeystoneTitle({ prog }) {
  const ref = useRef(null);
  useFrame(() => {
    const t = ref.current;
    if (!t) return;
    const p = prog.damped;
    const inA = smooth(p, 0.17, 0.27);
    const out = smooth(p, 0.33, 0.43);
    const o = inA * (1 - out);
    t.visible = o > 0.002;
    t.fillOpacity = o;
    t.outlineOpacity = o * 0.35;
    t.scale.setScalar(0.82 + 0.3 * easeOutQuart(ramp(p, 0.16, 0.4)) + 0.12 * out);
    t.position.y = 0.95 + 0.25 * out;
  });
  return (
    <Text ref={ref} font={playfairUrl} fontSize={0.6} letterSpacing={0.34} color={KS.text}
          anchorX="center" anchorY="middle" position={[0, 0.95, 1.4]} fillOpacity={0}
          outlineWidth={0.012} outlineBlur={0.08} outlineColor={KS.orange} outlineOpacity={0}
          material-toneMapped={false} material-fog={false}>
      KEYSTONE
    </Text>
  );
}
