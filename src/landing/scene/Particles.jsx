// One THREE.Points draw for the whole shatter. Every particle has three precomputed homes: a point on the
// keystone's surface (MeshSurfaceSampler), a place on a slow burst sphere, and a target (a cluster around one
// graph node, or a faint background star). The vertex shader blends between them from two scroll uniforms.
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, BufferAttribute, ShaderMaterial, AdditiveBlending, Mesh, Color, Vector3, Matrix4 } from 'three';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import { PARTICLE_MIX } from '../palette';
import { NODES, BREACH } from '../demoGraph';
import { NODE_POS, GRAPH_CENTER } from '../layout';
import { ramp, smooth } from '../timeline';
import { mulberry32 } from './archGeometry';

const vert = /* glsl */ `
  attribute vec3 aSurface;
  attribute vec3 aBurst;
  attribute vec3 aTarget;
  attribute vec3 aColor;
  attribute vec3 aMeta; // x: size in px, y: stagger seed, z: 1 = star, 0 = node particle
  uniform mat4 uKey;
  uniform vec3 uBurstC;
  uniform float uShatter;
  uniform float uGather;
  uniform float uPixel;
  uniform float uDim;
  varying vec3 vColor;
  varying float vAlpha;

  float easeOutQuart(float t) { t = clamp(t, 0.0, 1.0); return 1.0 - pow(1.0 - t, 4.0); }
  float easeInOutCubic(float t) {
    t = clamp(t, 0.0, 1.0);
    return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
  }

  void main() {
    float seed = aMeta.y;
    vec3 surface = (uKey * vec4(aSurface, 1.0)).xyz;
    float ts = easeOutQuart((uShatter - seed * 0.3) / 0.7);
    vec3 burst = uBurstC + aBurst * (0.55 + 0.45 * ts);   // the sphere keeps swelling slowly
    vec3 p = mix(surface, burst, ts);

    float tg = easeInOutCubic((uGather - fract(seed * 5.31) * 0.35) / 0.65);
    vec3 target = aTarget;
    p = mix(p, target, tg);
    // A gentle sideways swirl while in transit, zero at both ends.
    float w = tg * (1.0 - tg) * 4.0;
    p += vec3(sin(seed * 31.0 + tg * 3.0), cos(seed * 17.0 + tg * 2.0), sin(seed * 11.0)) * 0.45 * w;

    float appear = smoothstep(0.0, 0.08, uShatter);
    float settled = mix(1.0, aMeta.z > 0.5 ? 0.32 : 0.55, smoothstep(0.7, 1.0, tg));
    vAlpha = appear * settled * uDim;
    vColor = aColor;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aMeta.x * uPixel * mix(1.0, 1.25, ts * (1.0 - tg));
  }
`;
const frag = /* glsl */ `
  uniform float uBoost;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.05, d) * vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor * uBoost, a);
  }
`;

function pickColor(rng, colors) {
  let r = rng();
  for (const [c, w] of colors) { if ((r -= w) <= 0) return c; }
  return colors[0][0];
}

export default function Particles({ prog, keystoneRef, keystoneGeometry, count, burstCenter, lite }) {
  const { geometry, material } = useMemo(() => {
    const rng = mulberry32(99);
    const sampler = new MeshSurfaceSampler(new Mesh(keystoneGeometry)).setRandomGenerator(rng).build();
    const colors = PARTICLE_MIX.map(([hex, w]) => [new Color(hex), w]);

    const surface = new Float32Array(count * 3), burst = new Float32Array(count * 3), target = new Float32Array(count * 3);
    const color = new Float32Array(count * 3), meta = new Float32Array(count * 3);
    const v = new Vector3();

    // Node clusters: 20–40 particles per node (the breach clause arrives later on the timeline, not from the burst).
    const owners = [];
    NODES.forEach((n, i) => {
      if (n.id === BREACH.clause) return;
      const k = 20 + Math.floor(rng() * 21);
      for (let j = 0; j < k; j++) owners.push(i);
    });

    for (let i = 0; i < count; i++) {
      sampler.sample(v);
      surface.set([v.x, v.y, v.z], i * 3);

      // Burst: a thick spherical shell, denser toward the middle.
      const u = rng() * 2 - 1, th = rng() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const r = 1.1 + 1.9 * Math.sqrt(rng());
      burst.set([s * Math.cos(th) * r, u * r * 0.85, s * Math.sin(th) * r], i * 3);

      const isStar = i >= owners.length;
      if (!isStar) {
        const n = owners[i] * 3;
        const cu = rng() * 2 - 1, ct = rng() * Math.PI * 2, cs = Math.sqrt(1 - cu * cu), cr = 0.12 + 0.2 * Math.cbrt(rng());
        target.set([NODE_POS[n] + cs * Math.cos(ct) * cr, NODE_POS[n + 1] + cu * cr, NODE_POS[n + 2] + cs * Math.sin(ct) * cr], i * 3);
      } else {
        // Background stars on a far shell around the graph.
        const su = rng() * 2 - 1, st = rng() * Math.PI * 2, ss = Math.sqrt(1 - su * su), sr = 13 + rng() * 12;
        target.set([GRAPH_CENTER[0] + ss * Math.cos(st) * sr, GRAPH_CENTER[1] + su * sr * 0.7, GRAPH_CENTER[2] + ss * Math.sin(st) * sr], i * 3);
      }
      const c = pickColor(rng, colors);
      color.set([c.r, c.g, c.b], i * 3);
      meta.set([isStar ? 1 + rng() * 0.8 : 1.4 + rng() * 1.6, rng(), isStar ? 1 : 0], i * 3);
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(surface.slice(), 3)); // bounds only; the shader positions
    geometry.setAttribute('aSurface', new BufferAttribute(surface, 3));
    geometry.setAttribute('aBurst', new BufferAttribute(burst, 3));
    geometry.setAttribute('aTarget', new BufferAttribute(target, 3));
    geometry.setAttribute('aColor', new BufferAttribute(color, 3));
    geometry.setAttribute('aMeta', new BufferAttribute(meta, 3));
    const material = new ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: AdditiveBlending,
      uniforms: {
        uKey: { value: new Matrix4() },
        uBurstC: { value: new Vector3(...burstCenter) },
        uShatter: { value: 0 }, uGather: { value: 0 }, uPixel: { value: 1 }, uDim: { value: 1 },
        uBoost: { value: lite ? 1.1 : 2.4 }, // >1 so only the particles cross the bloom threshold
      },
    });
    return { geometry, material };
  }, [keystoneGeometry, count, burstCenter, lite]);

  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  useFrame(({ viewport }) => {
    const p = prog.damped;
    const u = material.uniforms;
    const key = keystoneRef.current;
    if (key) {
      key.updateMatrixWorld();
      u.uKey.value.copy(key.matrixWorld);
    }
    u.uShatter.value = ramp(p, 0.3, 0.46);
    u.uGather.value = ramp(p, 0.43, 0.63);
    u.uPixel.value = viewport.dpr;
    u.uDim.value = 1 - 0.5 * smooth(p, 0.95, 1);
  });

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />;
}
