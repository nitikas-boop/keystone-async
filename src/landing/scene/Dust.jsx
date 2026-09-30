// Faint dust: ambient motes that drift with scroll, and grit that falls from the keystone's gap as it slides out.
// Positions are a pure function of p (no timers), so scrolling back un-falls it.
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, BufferAttribute, ShaderMaterial, AdditiveBlending, Color } from 'three';
import { KS } from '../palette';
import { mulberry32 } from './archGeometry';

const vert = /* glsl */ `
  attribute float aSeed;
  attribute float aFall;
  uniform float uP;
  uniform float uPixel;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    float a;
    if (aFall > 0.5) {
      float t = clamp((uP - 0.165 - aSeed * 0.09) / 0.17, 0.0, 1.0);
      p.y -= t * t * 5.0;
      p.x += (aSeed - 0.5) * t * 0.8;
      p.z += (fract(aSeed * 7.13) - 0.5) * t * 0.6;
      a = sin(3.14159 * t) * 0.75;
    } else {
      p.x += sin(aSeed * 40.0 + uP * 7.0) * 0.4;
      p.y += (aSeed - 0.5) * uP * 2.0 + cos(aSeed * 17.0 + uP * 5.0) * 0.2;
      p.z += cos(aSeed * 23.0 + uP * 6.0) * 0.35;
      a = 0.22 + 0.2 * fract(aSeed * 13.7);
      a *= 1.0 - smoothstep(0.4, 0.52, uP);
    }
    vAlpha = a;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.2 + fract(aSeed * 91.3) * 1.2) * uPixel;
  }
`;
const frag = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

export default function Dust({ prog, count = 420 }) {
  const { geometry, material } = useMemo(() => {
    const rng = mulberry32(21);
    const falling = Math.round(count * 0.4);
    const pos = new Float32Array(count * 3), seed = new Float32Array(count), fall = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      seed[i] = rng();
      if (i < falling) {
        fall[i] = 1;
        pos.set([(rng() - 0.5) * 0.7, 2.75 + rng() * 0.45, (rng() - 0.5) * 1.0], i * 3);
      } else {
        pos.set([(rng() - 0.5) * 13, -3 + rng() * 8, -3 + rng() * 10], i * 3);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(pos, 3));
    geometry.setAttribute('aSeed', new BufferAttribute(seed, 1));
    geometry.setAttribute('aFall', new BufferAttribute(fall, 1));
    const material = new ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: AdditiveBlending,
      uniforms: { uP: { value: 0 }, uPixel: { value: 1 }, uColor: { value: new Color(KS.stone).multiplyScalar(0.8) } },
    });
    return { geometry, material };
  }, [count]);

  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  useFrame(({ viewport }) => {
    const u = material.uniforms;
    u.uP.value = prog.damped;
    u.uPixel.value = viewport.dpr;
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}
