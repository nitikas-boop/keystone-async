// The dark 3D intro's own poster palette (kept self-contained: the app itself now uses Ice & Butter).
// The same tokens live as CSS variables in landing.css (.ks-intro).
export const KS = {
  bg: '#11100D', surface: '#1B1915', text: '#EDE3D2', muted: '#828D85', subtle: '#7F858B', umber: '#7B3221',
  brown: '#AC5840', orange: '#EE7A45', red: '#E4483B', gold: '#F2C46D', stone: '#D6C7B0',
};

// Particle colours, weighted: orange, brown, gold, cream.
export const PARTICLE_MIX = [
  [KS.orange, 0.38],
  [KS.brown, 0.22],
  [KS.gold, 0.22],
  [KS.text, 0.18],
];
