// Procedural weathered-limestone maps, generated on a canvas at load (no texture downloads).
// Tileable value-noise fBm gives the grain; pits and ridged cracks are tinted toward Brown (#AC5840).
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, NoColorSpace } from 'three';

function hash(x, y, period, seed) {
  x = ((x % period) + period) % period;
  y = ((y % period) + period) % period;
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Periodic value noise on [0, 1)², so the texture repeats seamlessly.
function vnoise(u, v, period, seed) {
  const x = u * period, y = v * period;
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, period, seed), b = hash(xi + 1, yi, period, seed);
  const c = hash(xi, yi + 1, period, seed), d = hash(xi + 1, yi + 1, period, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(u, v, base, octaves, seed) {
  let sum = 0, amp = 0.5, norm = 0, period = base;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(u, v, period, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    period *= 2;
  }
  return sum / norm;
}

const STONE = [214, 199, 176];
const BROWN = [172, 88, 64];

export function makeStoneTextures(size = 512) {
  const n = size * size;
  const height = new Float32Array(n);
  const crev = new Float32Array(n);
  const grain = new Float32Array(n);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size, i = y * size + x;
      const base = fbm(u, v, 4, 5, 1);
      const fine = fbm(u, v, 32, 3, 7);
      const ridge = 1 - Math.abs(2 * fbm(u, v, 6, 4, 3) - 1); // thin bright ridges become cracks
      const crack = Math.max(0, (ridge - 0.955) / 0.045);
      const pit = Math.max(0, (0.3 - fine) / 0.3) ** 3;
      const c = Math.min(1, crack * 0.7 + pit * 0.6);
      crev[i] = c;
      grain[i] = fine;
      height[i] = base * 0.7 + fine * 0.3 - c * 0.55;
    }
  }

  const make = () => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    return [cv, ctx, ctx.createImageData(size, size)];
  };
  const [colorCv, colorCtx, colorImg] = make();
  const [normCv, normCtx, normImg] = make();
  const [roughCv, roughCtx, roughImg] = make();

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x, o = i * 4;
      // Albedo: limestone with a little tonal drift, darkened and tinted brown in crevices.
      const shade = 0.98 + (height[i] - 0.45) * 0.24 + (grain[i] - 0.5) * 0.08;
      const t = crev[i] * 0.6;
      for (let k = 0; k < 3; k++) {
        const col = (STONE[k] * (1 - t) + BROWN[k] * t) * shade * (1 - crev[i] * 0.22);
        colorImg.data[o + k] = Math.max(0, Math.min(255, col));
      }
      colorImg.data[o + 3] = 255;

      // Normal from the height field (wrapping at the edges keeps it tileable).
      const xl = (x - 1 + size) % size, xr = (x + 1) % size, yu = (y - 1 + size) % size, yd = (y + 1) % size;
      const dx = (height[y * size + xr] - height[y * size + xl]) * 3.2;
      const dy = (height[yd * size + x] - height[yu * size + x]) * 3.2;
      const len = Math.hypot(dx, dy, 1);
      normImg.data[o] = ((-dx / len) * 0.5 + 0.5) * 255;
      normImg.data[o + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      normImg.data[o + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      normImg.data[o + 3] = 255;

      // Roughness around 0.9 (green channel is what three.js reads).
      const r = Math.min(1, 0.84 + grain[i] * 0.1 + crev[i] * 0.08) * 255;
      roughImg.data[o] = roughImg.data[o + 1] = roughImg.data[o + 2] = r;
      roughImg.data[o + 3] = 255;
    }
  }
  colorCtx.putImageData(colorImg, 0, 0);
  normCtx.putImageData(normImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);

  const tex = (cv, colorSpace) => {
    const t = new CanvasTexture(cv);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(0.42, 0.42);
    t.colorSpace = colorSpace;
    t.anisotropy = 4;
    return t;
  };
  return { map: tex(colorCv, SRGBColorSpace), normalMap: tex(normCv, NoColorSpace), roughnessMap: tex(roughCv, NoColorSpace) };
}
