// The canvas. frameloop="demand": nothing renders while the page is still. A scroll event invalidates, and the
// Driver keeps invalidating only while the damped progress is still gliding toward the scroll position.
import { memo, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, ToneMapping } from '@react-three/postprocessing';
import { ACESFilmicToneMapping } from 'three';
import { easing } from 'maath';
import { KS } from '../palette';
import { smooth } from '../timeline';
import { buildArch } from './archGeometry';
import { makeStoneTextures } from './stoneTexture';
import CameraRig from './CameraRig';
import Arch from './Arch';
import Dust from './Dust';
import KeystoneTitle from './KeystoneTitle';
import Particles from './Particles';
import Graph from './Graph';

const ACES_FILMIC = 6; // postprocessing's ToneMappingMode.ACES_FILMIC, matching the renderer in lite mode

function Driver({ prog, onFrame, invalidateRef, bloomRef }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidateRef.current = invalidate;
    invalidate();
    return () => { invalidateRef.current = null; };
  }, [invalidate, invalidateRef]);
  useFrame((_, dt) => {
    if (prog.snap) { prog.damped = prog.raw; prog.velocity_damped = 0; prog.snap = false; }
    else easing.damp(prog, 'damped', prog.raw, 0.22, Math.min(dt, 1 / 30));
    if (Math.abs(prog.damped - prog.raw) < 1e-5) prog.damped = prog.raw;
    onFrame(prog.damped);
    // Bloom stays subtle on the stone, a little stronger once the scene is mostly glowing particles.
    if (bloomRef.current) bloomRef.current.intensity = 0.35 + 0.5 * smooth(prog.damped, 0.28, 0.42);
    if (prog.damped !== prog.raw || prog.animating) invalidate();
  }, -2);
  return null;
}

function Lights({ lite }) {
  return (
    <>
      <hemisphereLight args={['#5A4636', KS.bg, 0.6]} />
      {/* warm orange/gold key light from above-left */}
      <directionalLight position={[-6, 8, 7]} color="#FADDB4" intensity={2.3} castShadow={!lite}
                        shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} shadow-normalBias={0.02}
                        shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} />
      {/* burnt-umber rim light from below-right */}
      <directionalLight position={[6, -5, -4]} color={KS.umber} intensity={2.4} />
      <directionalLight position={[4, -2, 6]} color={KS.brown} intensity={0.35} />
    </>
  );
}

function World({ prog, lite, onFrame, invalidateRef, onHover }) {
  const keystoneRef = useRef(null);
  const bloomRef = useRef(null);
  const arch = useMemo(() => buildArch(), []);
  const textures = useMemo(() => makeStoneTextures(lite ? 256 : 512), [lite]);
  const k = arch.keystone.position;
  const burstCenter = useMemo(() => [k[0], k[1] + 0.62, k[2] + 3.55], [k]);

  useEffect(() => () => {
    arch.blocks.forEach((b) => b.geometry.dispose());
    arch.keystone.geometry.dispose();
    Object.values(textures).forEach((t) => t.dispose());
  }, [arch, textures]);

  return (
    <>
      <color attach="background" args={[KS.bg]} />
      <fog attach="fog" args={[KS.bg, 9, 27]} />
      <Driver prog={prog} onFrame={onFrame} invalidateRef={invalidateRef} bloomRef={bloomRef} />
      <CameraRig prog={prog} lite={lite} />
      <Lights lite={lite} />
      <Arch prog={prog} arch={arch} textures={textures} keystoneRef={keystoneRef} lite={lite} />
      <Dust prog={prog} count={lite ? 220 : 420} />
      <KeystoneTitle prog={prog} />
      <Particles prog={prog} keystoneRef={keystoneRef} keystoneGeometry={arch.keystone.geometry}
                 count={lite ? 1200 : 3000} burstCenter={burstCenter} lite={lite} />
      <Graph prog={prog} onHover={onHover} lite={lite} />
      {!lite && (
        <EffectComposer multisampling={4}>
          <Bloom ref={bloomRef} mipmapBlur luminanceThreshold={0.95} luminanceSmoothing={0.2} intensity={0.35} radius={0.7} />
          <ToneMapping mode={ACES_FILMIC} />
        </EffectComposer>
      )}
    </>
  );
}

function Scene(props) {
  const { lite } = props;
  return (
    <Canvas
      frameloop="demand"
      dpr={lite ? [1, 1.25] : [1, 1.75]}
      shadows={!lite}
      camera={{ fov: 40, near: 0.1, far: 80, position: [0, 0.3, 13.5] }}
      gl={{ antialias: lite, powerPreference: 'high-performance', toneMapping: ACESFilmicToneMapping }}
    >
      <World {...props} />
    </Canvas>
  );
}

export default memo(Scene);
