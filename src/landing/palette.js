// Keystone poster palette for three.js. The same tokens live as CSS variables in landing.css (.ks-intro).
export const KS = {
  bg: '#11100D',      // smoky black: background and fog
  surface: '#1B1915',
  text: '#EDE3D2',    // warm cream
  muted: '#828D85',   // dolphin gray
  subtle: '#7F858B',  // old silver: expired / superseded only
  umber: '#7B3221',   // fills only: edges, shadow tones, rim light
  brown: '#AC5840',   // decision nodes, crevices
  orange: '#EE7A45',  // primary accent: keystone glow
  red: '#E4483B',     // alerts only: the DEC-007 breach
  gold: '#F2C46D',    // emphasis: year counter
  stone: '#D6C7B0',   // limestone
};

// Particle colours, weighted: orange, brown, gold, cream.
export const PARTICLE_MIX = [
  [KS.orange, 0.38],
  [KS.brown, 0.22],
  [KS.gold, 0.22],
  [KS.text, 0.18],
];
