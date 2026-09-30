// The knowledge graph the particles settle into. Decisions: small glowing brown/orange spheres. Clauses: cream
// rounded cubes. People: spheres that morph into a minimal glowing glyph (head + rounded shoulders). Edges grow
// in as thin burnt-umber lines. On the timeline (p 0.75–0.95) nodes light up on their date, superseded/expired
// ones fade to Old Silver at 40%, and RET-2.1@v3 sends a red ripple to DEC-007, which pulses red.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import {
  SphereGeometry, LatheGeometry, Vector2, Vector3, Matrix4, Quaternion, Euler, Color, MeshStandardMaterial,
  BufferGeometry, BufferAttribute, ShaderMaterial, AdditiveBlending,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KS } from '../palette';
import { NODES, EDGES, NODE_INDEX, NODE_DAYS, BREACH, describeNode } from '../demoGraph';
import { NODE_POS } from '../layout';
import { ramp, smooth, easeOutQuart, easeInOutCubic, clamp01, dayAt, timelineOn, breachAt } from '../timeline';
import { withInstanceFade, addFadeAttributes } from './instanceFade';

const N = NODES.length;
const BY_KIND = { decision: [], clause: [], person: [] };
NODES.forEach((n, i) => BY_KIND[n.kind].push(i));
const BREACH_CLAUSE = NODE_INDEX.get(BREACH.clause);
const BREACH_DEC = NODE_INDEX.get(BREACH.decision);
const EDGE_ENDS = EDGES.map(e => [NODE_INDEX.get(e.source), NODE_INDEX.get(e.target)]);

function glyphGeometry() {
  const head = new SphereGeometry(0.085, 20, 14);
  head.translate(0, 0.13, 0);
  // Rounded shoulders: a lathe profile, symmetric around y, so it reads as a bust from any orbit angle.
  const profile = [[0, -0.13], [0.13, -0.13], [0.165, -0.1], [0.172, -0.06], [0.155, -0.02], [0.11, 0.015], [0.05, 0.03], [0, 0.032]]
    .map(([x, y]) => new Vector2(x, y));
  const shoulders = new LatheGeometry(profile, 28);
  const merged = mergeGeometries([head.toNonIndexed(), shoulders.toNonIndexed()]);
  head.dispose();
  shoulders.dispose();
  return merged;
}

const edgeVert = /* glsl */ `
  attribute float aT;
  attribute vec3 aState; // x: visibility, y: hover highlight, z: 1 = the FLAGS edge
  varying float vT;
  varying vec3 vState;
  void main() {
    vT = aT;
    vState = aState;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const edgeFrag = /* glsl */ `
  uniform float uGrow;
  uniform float uRipple;
  uniform vec3 uUmber;
  uniform vec3 uBrown;
  uniform vec3 uRed;
  varying float vT;
  varying vec3 vState;
  void main() {
    if (vState.z > 0.5) {
      if (vT > uRipple) discard;
      float band = exp(-pow((vT - uRipple) * 7.0, 2.0));
      gl_FragColor = vec4(uRed * (1.0 + band * 1.6), vState.x * (0.5 + band * 0.5));
      return;
    }
    if (vT > uGrow) discard;
    vec3 c = mix(uUmber, uBrown, vState.y);
    gl_FragColor = vec4(c, vState.x * mix(0.85, 1.0, vState.y));
  }
`;

const haloVert = /* glsl */ `
  attribute vec3 aColor;
  attribute vec2 aAS; // alpha, size
  uniform float uPixel;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aAS.x;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aAS.y * uPixel * (10.0 / -mv.z);
  }
`;
const haloFrag = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = pow(max(0.0, 1.0 - d), 2.2) * vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

export default function Graph({ prog, onHover, lite }) {
  const invalidate = useThree((s) => s.invalidate);
  const groupRef = useRef(null);
  const meshRefs = { decision: useRef(null), clause: useRef(null), person: useRef(null), glyph: useRef(null) };
  const labelRef = useRef(null);
  const hoverRef = useRef(-1);

  const res = useMemo(() => {
    const fadeMat = (color, emissive, intensity, roughness) =>
      withInstanceFade(new MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness, metalness: 0.05 }));
    const geo = {
      decision: new SphereGeometry(0.15, 24, 16),
      clause: new RoundedBoxGeometry(0.28, 0.28, 0.28, 4, 0.06),
      person: new SphereGeometry(0.15, 24, 16),
      glyph: glyphGeometry(),
    };
    const counts = { decision: BY_KIND.decision.length, clause: BY_KIND.clause.length, person: BY_KIND.person.length, glyph: BY_KIND.person.length };
    const fade = {};
    for (const k of Object.keys(geo)) fade[k] = addFadeAttributes(geo[k], counts[k]);
    const mat = {
      decision: fadeMat('#ffffff', KS.orange, lite ? 0.4 : 0.75, 0.45),
      clause: fadeMat('#ffffff', KS.stone, 0.22, 0.6),
      // People are cream and self-lit; their soft orange glow comes from the halo sprites.
      person: fadeMat('#ffffff', KS.text, 0.3, 0.5),
      glyph: fadeMat('#ffffff', KS.text, lite ? 0.35 : 0.45, 0.5),
    };

    // Edges: two vertices each, aT runs 0 → 1 from source to target so the line can grow.
    const E = EDGES.length;
    const epos = new Float32Array(E * 6), et = new Float32Array(E * 2), estate = new Float32Array(E * 6);
    EDGES.forEach((e, k) => {
      const a = NODE_INDEX.get(e.source) * 3, b = NODE_INDEX.get(e.target) * 3;
      epos.set([NODE_POS[a], NODE_POS[a + 1], NODE_POS[a + 2], NODE_POS[b], NODE_POS[b + 1], NODE_POS[b + 2]], k * 6);
      et.set([0, 1], k * 2);
      const flag = e.type === 'FLAGS' ? 1 : 0;
      estate[k * 6 + 2] = flag;
      estate[k * 6 + 5] = flag;
    });
    const edgeGeo = new BufferGeometry();
    edgeGeo.setAttribute('position', new BufferAttribute(epos, 3));
    edgeGeo.setAttribute('aT', new BufferAttribute(et, 1));
    const edgeState = new BufferAttribute(estate, 3);
    edgeGeo.setAttribute('aState', edgeState);
    const edgeMat = new ShaderMaterial({
      vertexShader: edgeVert, fragmentShader: edgeFrag, transparent: true, depthWrite: false,
      uniforms: {
        uGrow: { value: 0 }, uRipple: { value: 0 },
        uUmber: { value: new Color(KS.umber).multiplyScalar(2.2) }, // burnt umber, lifted so thin lines survive a dim projector
        uBrown: { value: new Color(KS.orange) },
        uRed: { value: new Color(KS.red) },
      },
    });

    // Halos: a soft orange glow behind each person glyph, plus the red breach pulse on DEC-007.
    const H = BY_KIND.person.length + 1;
    const hpos = new Float32Array(H * 3), hcol = new Float32Array(H * 3), has = new Float32Array(H * 2);
    const orange = new Color(KS.orange), red = new Color(KS.red).multiplyScalar(1.6);
    BY_KIND.person.forEach((i, j) => { hpos.set(NODE_POS.subarray(i * 3, i * 3 + 3), j * 3); hcol.set([orange.r, orange.g, orange.b], j * 3); });
    hpos.set(NODE_POS.subarray(BREACH_DEC * 3, BREACH_DEC * 3 + 3), (H - 1) * 3);
    hcol.set([red.r, red.g, red.b], (H - 1) * 3);
    const haloGeo = new BufferGeometry();
    haloGeo.setAttribute('position', new BufferAttribute(hpos, 3));
    haloGeo.setAttribute('aColor', new BufferAttribute(hcol, 3));
    const haloAS = new BufferAttribute(has, 2);
    haloGeo.setAttribute('aAS', haloAS);
    const haloMat = new ShaderMaterial({
      vertexShader: haloVert, fragmentShader: haloFrag, transparent: true, depthWrite: false, blending: AdditiveBlending,
      uniforms: { uPixel: { value: 1 } },
    });

    const base = {
      decision: new Color(KS.brown), clause: new Color(KS.stone), person: new Color(KS.text), glyph: new Color(KS.text),
    };
    return {
      geo, mat, fade, edgeGeo, edgeMat, edgeState, haloGeo, haloMat, haloAS, base,
      silver: new Color(KS.subtle), red: new Color(KS.red),
      // Per-node state for this frame (preallocated; the render loop writes into these).
      alpha: new Float32Array(N), sil: new Float32Array(N), reveal: new Float32Array(N),
      m4: new Matrix4(), q: new Quaternion(), qId: new Quaternion(), eul: new Euler(), v: new Vector3(), s: new Vector3(), c: new Color(),
    };
  }, [lite]);

  useEffect(() => () => {
    Object.values(res.geo).forEach((g) => g.dispose());
    Object.values(res.mat).forEach((m) => m.dispose());
    res.edgeGeo.dispose(); res.edgeMat.dispose(); res.haloGeo.dispose(); res.haloMat.dispose();
    document.body.style.cursor = '';
  }, [res]);

  useFrame(({ clock, viewport }) => {
    const p = prog.damped;
    const g = groupRef.current;
    g.visible = p > 0.5;
    prog.animating = false;
    if (!g.visible) return;

    const day = dayAt(p);
    const tl = timelineOn(p);
    const dim = 1 - 0.5 * smooth(p, 0.95, 1);
    const redOn = smooth(p, 0.925, 0.94);
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 4.2);
    if (redOn > 0 && p < 0.999) prog.animating = true; // the breach pulse is the one time-based animation
    const morph = easeInOutCubic(ramp(p, 0.655, 0.735));
    const { alpha, sil, reveal } = res;
    const hovered = hoverRef.current;

    for (let i = 0; i < N; i++) {
      const d = NODE_DAYS[i];
      const appear = clamp01((day - d.from + 12) / 24);
      const s = tl * clamp01((day - d.until) / 28);
      let a, rv;
      if (i === BREACH_CLAUSE) {
        a = tl * appear;
        rv = easeOutQuart(a);
      } else {
        rv = easeOutQuart(ramp(p, 0.53 + (i % 7) * 0.008, 0.62 + (i % 7) * 0.008));
        a = rv * (1 - tl + tl * (0.12 + 0.88 * appear));
      }
      sil[i] = s;
      alpha[i] = a * (1 - 0.6 * s) * dim;
      reveal[i] = rv * (i === hovered ? 1.3 : 1);
    }

    const { m4, q, qId, eul, v, s: sc, c, base, silver, red } = res;
    eul.set(p * 5, p * 7, 0);
    q.setFromEuler(eul);
    for (const kind of ['decision', 'clause', 'person', 'glyph']) {
      const mesh = meshRefs[kind].current;
      const list = kind === 'glyph' ? BY_KIND.person : BY_KIND[kind];
      const f = res.fade[kind];
      for (let j = 0; j < list.length; j++) {
        const i = list[j];
        let k = reveal[i];
        if (kind === 'person') k *= 1 - morph;
        if (kind === 'glyph') k *= morph;
        v.fromArray(NODE_POS, i * 3);
        sc.setScalar(Math.max(k, 1e-4));
        m4.compose(v, kind === 'clause' ? q : qId, sc);
        mesh.setMatrixAt(j, m4);
        c.copy(base[kind]).lerp(silver, sil[i]);
        let glow = (1 - 0.85 * sil[i]) * dim;
        if (i === BREACH_DEC && redOn > 0) { c.lerp(red, redOn); glow *= 1 - 0.9 * redOn; }
        mesh.setColorAt(j, c);
        f.sil.array[j] = sil[i];
        f.alpha.array[j] = kind === 'person' ? alpha[i] * (1 - morph) : kind === 'glyph' ? alpha[i] * morph : alpha[i];
        f.glow.array[j] = glow;
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      f.alpha.needsUpdate = true;
      f.glow.needsUpdate = true;
      f.sil.needsUpdate = true;
      mesh.computeBoundingSphere();
    }

    // Edges: grow in, then follow the dimmer endpoint; brighten those touching the hovered node.
    const est = res.edgeState.array;
    for (let k = 0; k < EDGES.length; k++) {
      const [a, b] = EDGE_ENDS[k];
      const vis = EDGES[k].type === 'FLAGS' ? (breachAt(p) > 0 ? dim : 0) : Math.min(alpha[a], alpha[b]);
      const hi = hovered >= 0 && (a === hovered || b === hovered) ? 1 : 0;
      est[k * 6] = est[k * 6 + 3] = vis;
      est[k * 6 + 1] = est[k * 6 + 4] = hi;
    }
    res.edgeState.needsUpdate = true;
    res.edgeMat.uniforms.uGrow.value = easeInOutCubic(ramp(p, 0.56, 0.67));
    res.edgeMat.uniforms.uRipple.value = breachAt(p);

    const has = res.haloAS.array;
    BY_KIND.person.forEach((i, j) => {
      has[j * 2] = 0.55 * morph * alpha[i] * (1 - sil[i]);
      has[j * 2 + 1] = lite ? 60 : 85;
    });
    const hb = BY_KIND.person.length;
    has[hb * 2] = redOn * (0.55 + 0.45 * pulse) * dim;
    has[hb * 2 + 1] = 70 + 60 * pulse * redOn;
    res.haloAS.needsUpdate = true;
    res.haloMat.uniforms.uPixel.value = viewport.dpr;

    if (labelRef.current) labelRef.current.style.opacity = (redOn * (1 - smooth(p, 0.935, 0.955))).toFixed(3);
    if (hovered >= 0 && p < 0.6) setHover(-1);
  });

  function setHover(i, e) {
    if (i !== hoverRef.current) {
      hoverRef.current = i;
      document.body.style.cursor = i >= 0 ? 'pointer' : '';
      invalidate();
    }
    onHover(i >= 0 && e ? { info: describeNode(NODES[i]), x: e.nativeEvent.clientX, y: e.nativeEvent.clientY } : null);
  }
  const handlers = (list) => ({
    onPointerMove: (e) => {
      const i = list[e.instanceId];
      if (i === undefined || prog.damped < 0.6 || res.alpha[i] < 0.3) return;
      e.stopPropagation();
      setHover(i, e);
    },
    onPointerOut: (e) => { if (list[e.instanceId] === hoverRef.current) setHover(-1); },
  });

  return (
    <group ref={groupRef} visible={false}>
      <lineSegments geometry={res.edgeGeo} material={res.edgeMat} frustumCulled={false} renderOrder={1} />
      <instancedMesh ref={meshRefs.decision} args={[res.geo.decision, res.mat.decision, BY_KIND.decision.length]} frustumCulled={false} {...handlers(BY_KIND.decision)} />
      <instancedMesh ref={meshRefs.clause} args={[res.geo.clause, res.mat.clause, BY_KIND.clause.length]} frustumCulled={false} {...handlers(BY_KIND.clause)} />
      <instancedMesh ref={meshRefs.person} args={[res.geo.person, res.mat.person, BY_KIND.person.length]} frustumCulled={false} {...handlers(BY_KIND.person)} />
      <instancedMesh ref={meshRefs.glyph} args={[res.geo.glyph, res.mat.glyph, BY_KIND.person.length]} frustumCulled={false} {...handlers(BY_KIND.person)} />
      <points geometry={res.haloGeo} material={res.haloMat} frustumCulled={false} renderOrder={3} />
      <Html position={Array.from(NODE_POS.subarray(BREACH_DEC * 3, BREACH_DEC * 3 + 3))} zIndexRange={[2, 0]}>
        <div ref={labelRef} className="ks-breach" style={{ opacity: 0 }}><i />Policy impact: ongoing breach</div>
      </Html>
    </group>
  );
}
