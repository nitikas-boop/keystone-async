// The stone arch and its keystone. p 0–0.15: the arch stands still; 0.15–0.30: the keystone slides toward the
// camera with orange-glowing seams; 0.30–0.42: it fades as the particles take over; 0.40+: the arch recedes
// into the fog while the graph forms.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshStandardMaterial, MeshBasicMaterial, BackSide, AdditiveBlending, Color } from 'three';
import { KS } from '../palette';
import { ramp, smooth, easeInOutCubic, easeOutQuart, window01 } from '../timeline';

export default function Arch({ prog, arch, textures, keystoneRef, lite }) {
  const groupRef = useRef(null);
  const shellRef = useRef(null);
  const gapLightRef = useRef(null);

  const { stone, keyMat, shellMat } = useMemo(() => {
    const stone = new MeshStandardMaterial({
      color: '#ffffff', map: textures.map, normalMap: textures.normalMap, roughnessMap: textures.roughnessMap,
      roughness: 1, metalness: 0,
    });
    stone.normalScale.set(0.85, 0.85);
    const keyMat = stone.clone();
    keyMat.transparent = true;
    keyMat.emissive = new Color(KS.orange);
    keyMat.emissiveIntensity = 0;
    const shellMat = new MeshBasicMaterial({
      color: new Color(KS.orange).multiplyScalar(2.2), side: BackSide, transparent: true, opacity: 0,
      blending: AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    return { stone, keyMat, shellMat };
  }, [textures]);

  useEffect(() => () => { stone.dispose(); keyMat.dispose(); shellMat.dispose(); }, [stone, keyMat, shellMat]);

  const k = arch.keystone;
  useFrame(() => {
    const p = prog.damped;
    const recede = easeInOutCubic(ramp(p, 0.4, 0.62));
    const g = groupRef.current;
    g.position.set(0, -1.2 * recede, -18 * recede);
    g.visible = recede < 0.999;

    const key = keystoneRef.current;
    const s = easeInOutCubic(ramp(p, 0.15, 0.3));
    const drift = easeOutQuart(ramp(p, 0.28, 0.46)); // keeps moving while it cracks apart
    key.position.set(k.position[0], k.position[1] + 0.42 * s + 0.3 * drift, k.position[2] + 3.0 * s + 0.7 * drift);
    key.rotation.set(-0.24 * s - 0.2 * drift, 0.32 * s + 0.25 * drift, 0.09 * s + 0.05 * drift);
    const fade = 1 - smooth(p, 0.31, 0.41);
    key.visible = fade > 0.002;
    keyMat.opacity = fade;
    key.scale.setScalar(1 - 0.05 * (1 - fade));

    const glow = window01(p, 0.16, 0.31, 0.05);
    keyMat.emissiveIntensity = 0.22 * glow;
    shellMat.opacity = 0.85 * glow * fade;
    shellRef.current.visible = shellMat.opacity > 0.002;
    gapLightRef.current.intensity = 9 * glow * (1 - recede);
  });

  return (
    <>
      <group ref={groupRef}>
        {arch.blocks.map((b, i) => (
          <mesh key={i} geometry={b.geometry} material={stone} position={b.position} rotation={b.rotation}
                castShadow={!lite} receiveShadow={!lite} />
        ))}
        <pointLight ref={gapLightRef} position={[0, 2.75, 0.3]} color={KS.orange} intensity={0} distance={4.5} decay={2} />
      </group>
      <mesh ref={keystoneRef} geometry={k.geometry} material={keyMat} position={k.position} castShadow={!lite}>
        <mesh ref={shellRef} geometry={k.geometry} material={shellMat} scale={1.045} />
      </mesh>
    </>
  );
}
