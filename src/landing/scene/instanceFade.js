// Per-instance opacity and glow for InstancedMesh + MeshStandardMaterial, via instanced attributes:
// aAlpha multiplies the fragment alpha, aGlow multiplies the emissive term, aSil (0–1) swaps the warm glow for
// a cool Old Silver sheen so superseded nodes read as grey rather than muddy brown. Lets one draw call hold nodes that
// are fully lit, ghosted (not yet dated) or faded to Old Silver at 40%.
import { InstancedBufferAttribute } from 'three';

export function withInstanceFade(material) {
  material.transparent = true;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAlpha;\nattribute float aGlow;\nattribute float aSil;\nvarying float vAlpha;\nvarying float vGlow;\nvarying float vSil;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;\nvGlow = aGlow;\nvSil = aSil;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAlpha;\nvarying float vGlow;\nvarying float vSil;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vAlpha;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = mix(totalEmissiveRadiance * vGlow, vec3(0.2, 0.225, 0.245), vSil);');
  };
  return material;
}

export function addFadeAttributes(geometry, count) {
  const alpha = new InstancedBufferAttribute(new Float32Array(count).fill(0), 1);
  const glow = new InstancedBufferAttribute(new Float32Array(count).fill(1), 1);
  geometry.setAttribute('aAlpha', alpha);
  const sil = new InstancedBufferAttribute(new Float32Array(count), 1);
  geometry.setAttribute('aGlow', glow);
  geometry.setAttribute('aSil', sil);
  return { alpha, glow, sil };
}
