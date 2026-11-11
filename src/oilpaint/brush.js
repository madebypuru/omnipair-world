// The brush sheet: marks made here rather than drawn by anyone. Each cell holds one mark laid along +v: r is how
// thick the paint stands (for the light that rakes across it), g is where there is paint at all, b is where a
// second colour was picked up and not mixed in. Cells 0..7 are a loaded bristle brush; cells 8..15 (KNIFE) are a
// palette knife: uneven slabs, loaded where the blade landed and dragged thin where it left.
import * as THREE from 'three';

export const BRUSH_COLS = 4;
export const BRUSH_ROWS = 4;
/** The first cell of the knife's marks: 8 slab, 9 wedge, 10 dragged aside, 11 petal, 12 round blob, 13 mostly drag, 14 lipped both sides, 15 leaf. */
export const KNIFE = 8;
const CW = 128, CH = 256;

const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const smooth = (t) => t * t * (3 - 2 * t);
const n1 = (x, seed) => {
  const i = Math.floor(x), f = smooth(x - i);
  return hash(i + seed * 57.3) * (1 - f) + hash(i + 1 + seed * 57.3) * f;
};
const n2 = (x, y, seed) => {
  const i = Math.floor(x), j = Math.floor(y), fx = smooth(x - i), fy = smooth(y - j);
  const h = (a, b) => hash(a * 1.31 + b * 91.7 + seed * 13.9);
  return (h(i, j) * (1 - fx) + h(i + 1, j) * fx) * (1 - fy) + (h(i, j + 1) * (1 - fx) + h(i + 1, j + 1) * fx) * fy;
};
const sstep = (a, b, x) => smooth(Math.min(1, Math.max(0, (x - a) / (b - a))));

// one mark: kind 0 a long stroke that runs dry, 1 a short fat dab, 2 a stroke with a curve to it
function mark(u, v, seed, kind) {
  const bend = kind === 2 ? (seed % 2 ? 0.34 : -0.34) : (hash(seed * 3.1) - 0.5) * 0.12;
  const ub = u - bend * (4 * (v - 0.5) * (v - 0.5) - 0.5);
  const wob = (n1(v * 5, seed + 3) - 0.5) * 0.1;
  const a = Math.abs(ub + wob);
  let half, start, end;
  if (kind === 1) {
    // a pressed dab: fat in the middle, ragged all round
    const r = Math.hypot(ub / 0.66, (v - 0.5) / 0.44);
    const edge = 1 + (n1(Math.atan2(v - 0.5, ub) * 2.2 + 9, seed) - 0.5) * 0.34;
    half = 0.66; start = 0; end = 1;
    const inside = 1 - sstep(edge - 0.16, edge, r);
    const bristle = n1(ub * 11, seed + 11);
    const dry = sstep(0.55, 1.0, r) * 0.9;
    const alpha = inside * (bristle > dry * 0.8 ? 1 : 0.25);
    const ridge = n1(ub * 13 + n1(v * 3, seed) * 1.5, seed + 31);
    const height = alpha * (0.4 + 0.22 * ridge * n1(ub * 9, seed + 5) + 0.3 * sstep(0.45, 0.95, r) + 0.12 * n2(ub * 4, v * 6, seed));
    return [height, alpha, n2(ub * 3.2, v * 1.3, seed + 20)];
  }
  half = 0.6 * (0.8 + 0.2 * Math.sin(Math.PI * Math.min(1, v * 1.15))) * (1 + (n1(v * 7, seed + 1) - 0.5) * 0.1);
  start = 0.05 + 0.05 * n1(ub * 5, seed + 2);
  end = 0.95 - 0.3 * n1(ub * 4.5 + 2, seed + 4) - 0.06 * n1(ub * 19, seed + 6);
  const side = 1 - sstep(half - 0.07, half, a);
  const head = sstep(start, start + 0.035, v);
  const tail = 1 - sstep(end - 0.02, end + 0.015, v);
  // the brush runs dry toward the end: single bristles give out and leave gaps
  const dryness = sstep(end - 0.2, end, v);
  const bristle = n1(ub * 13, seed + 8) * 0.7 + n1(ub * 31, seed + 9) * 0.3;
  const gap = 1 - sstep(dryness * 0.55 - 0.08, dryness * 0.55, bristle) < 0.5 ? 1.0 : 0.0;
  const alpha = side * head * tail * gap;
  const furrow = n1(ub * 12 + n1(v * 2.5, seed + 12) * 1.2, seed + 33) * 0.7 + n1(ub * 29, seed + 34) * 0.3;
  const load = 1 - 0.55 * sstep(0.1, 0.9, v); // thick where the brush touched down, thin where it left
  const squeezed = sstep(half - 0.3, half - 0.06, a); // paint pushed out to the sides of the stroke
  const height = alpha * (0.3 + 0.22 * furrow * (0.5 + 0.5 * n1(ub * 11, seed + 13)) + 0.3 * squeezed + 0.25 * load * (1 - sstep(start, start + 0.25, v)) + 0.1 * n2(ub * 3, v * 7, seed + 14));
  return [Math.min(1, height), alpha, n2(ub * 3.4, v * 1.1, seed + 20)];
}

// one mark of the knife, laid from v = 0 (where the loaded blade touched down) to v = 1 (where it was dragged off).
// No two sides are parallel: each corner sits where it fell. One long side is the blade's edge, clean, with a thin
// lip of paint squeezed up along it; the other is torn and broken. Toward the end the paint runs thin and breaks
// into streaks, so what lies beneath shows through. The paint is
// mostly flat: only the lip, and a crumbly rim where the blade lifted, stand up off the canvas. Distances are in
// half-widths across (u) and lengths along (v).
function knife(u, v, seed, kind) {
  const H = (k) => hash(seed * 1.913 + k * 17.31);
  const tear = (t, s, a) => ((n1(t * 7, s) - 0.5) * 0.09 + (n1(t * 23, s + 1) - 0.5) * 0.05 + (n1(t * 61, s + 2) - 0.5) * 0.03) * a;
  const left = H(1) < 0.5; // the blade's clean edge is on this side
  // the corners: half-widths where it starts and where it ends, on each side
  let l0 = 0.62 + 0.36 * H(2), l1 = 0.4 + 0.55 * H(3), r0 = 0.62 + 0.36 * H(4), r1 = 0.4 + 0.55 * H(5);
  let shift = (H(6) - 0.5) * 0.5; // the end slides over from the start
  const bow = (H(7) - 0.5) * 0.35; // and the whole is a little bent
  let thin0 = 0.6 + 0.25 * H(8); // where the paint begins to give out
  let broken = 1; // how much it breaks up toward the end
  if (kind === 1) { l1 *= 0.3; r1 *= 0.3; } // a wedge
  if (kind === 2) shift = (H(6) < 0.5 ? -1 : 1) * (0.55 + 0.2 * H(9)); // dragged aside
  if (kind === 3) { l0 = l1 = r0 = r1 = 0.9; shift *= 0.4; thin0 = 0.75; broken = 0.35; } // a petal, rounded
  if (kind === 5) { thin0 = 0.4; broken = 1.2; } // mostly drag
  if (kind === 6) { l0 *= 0.8; r0 *= 0.8; thin0 = 0.55; } // foam: lips on both sides
  const centre = shift * (v - 0.5) + bow * (4 * (v - 0.5) * (v - 0.5) - 1);
  const uu = u - centre;
  let wl = l0 + (l1 - l0) * v, wr = r0 + (r1 - r0) * v;
  if (kind === 7) wl = wr = 0.92 * Math.pow(Math.max(0, Math.sin(Math.PI * (v - 0.02) / 0.96)), 0.75);
  // the torn side is ragged on a larger scale than the clean one
  const ragL = left ? 0.5 : 1.6, ragR = left ? 1.6 : 0.5;
  let sideL = uu + wl + tear(v, seed + 3, ragL), sideR = wr - uu + tear(v + 5, seed + 4, ragR);
  const s0 = 0.03 + 0.06 * H(10), s1 = 0.97 - 0.12 * H(11);
  let start = (v - s0 - (H(12) - 0.5) * 0.16 * u - tear(u * 0.4, seed + 5, 0.4)) * 3.5;
  let end = (s1 + (H(13) - 0.5) * 0.3 * u - v + tear(u * 0.5 + 3, seed + 6, 1.2)) * 3.5;
  if (kind === 3) {
    const r = Math.hypot(uu / 0.9, (v - 0.5) / 0.47) * (1 + tear(Math.atan2(v - 0.5, uu) * 0.6, seed + 7, 1.2));
    sideL = sideR = (1 - r) * 0.9; start = end = 1;
  }
  if (kind === 4) {
    const r = Math.hypot(uu / 0.92, (v - 0.5) / 0.47) * (1 + tear(Math.atan2(v - 0.5, uu) * 0.6, seed + 7, 2));
    sideL = sideR = (1 - r) * 0.9; start = end = 1; broken = 0;
  }
  if (kind === 5) end = Math.min(end, (uu * (H(14) < 0.5 ? 1 : -1) + 1.4 - 1.6 * v) * 0.8 + tear(v, seed + 9, 1));
  if (kind === 7) start = end = 1;
  const clean = left ? sideL : sideR, torn = left ? sideR : sideL;
  const e = Math.min(sideL, sideR, start, end);
  if (e <= 0) return [0, 0, 0.3];
  // how thin the paint has run, along the drag
  const thin = sstep(thin0, 1.02, v) * broken;
  // streaks the blade's nicks leave along the drag, and grains of pigment it skips over
  const streak = n2(uu * 4.5 + n1(v * 1.7, seed + 20) * 1.2, v * 3.2, seed + 21) * 0.8 + n1(uu * 17 + v * 4, seed + 22) * 0.2;
  const skip = n2(u * 11, v * 9, seed + 23);
  // alpha stays whole or nothing: the dabs are drawn with alpha to coverage, and a half alpha would show as a
  // screen of dots. The paint thins by breaking instead, into streaks with the paint beneath between them.
  let alpha = streak < thin * 0.8 - 0.06 ? 0 : 1;
  // the torn edge crumbles: holes and loose bits within a little of it
  const nearTorn = sstep(0.16, 0.0, torn);
  if (skip < nearTorn * 0.55) alpha = 0;
  if (!alpha) return [0, 0, 0.3];
  // the paint stands low: a loaded start, furrows along the drag, a thin lip on the blade's edge, a crumbly rim
  // where it lifted, and nothing much at the torn side so there is no dark rim round the mark
  const load = 0.12 * (1 - sstep(0.0, 0.5, v)) * (1 - thin);
  const furrow = 0.06 * (streak - 0.5) + 0.07 * (n1(uu * 47 + n1(v * 3, seed + 25) * 0.8, seed + 26) - 0.5);
  const lip = sstep(0.07, 0.025, clean) * sstep(0.0, 0.012, clean) * (kind === 6 ? 1 : 0.9);
  const lip2 = kind === 6 ? sstep(0.07, 0.025, torn) * sstep(0.0, 0.012, torn) : 0;
  const rim = sstep(0.08, 0.02, end) * (skip > 0.45 ? 0.6 : 0.15) * (1 - thin * 0.6);
  const fall = sstep(0.0, 0.1, Math.min(torn, start, end)); // the flat paint thins to nothing at its rim
  const height = Math.min(1, (0.16 + load + furrow) * fall * (1 - 0.5 * thin) + 0.5 * Math.max(lip, lip2, rim));
  // two or three mixes dragged together: the second colour in broad smears and fine lines along the drag, picked
  // up more toward the end
  const smear = n2(uu * 2.6 + 3 + n1(v * 1.3, seed + 30) * 0.8, v * 0.8, seed + 31);
  const lines = n1(uu * 21 + n1(v * 2.2, seed + 32) * 0.7, seed + 33);
  const mixc = Math.min(1, Math.max(0, smear * 0.7 + lines * 0.45 + 0.15 * v - 0.12));
  return [height, alpha, mixc];
}

export function createBrushSheet() {
  const W = CW * BRUSH_COLS, H = CH * BRUSH_ROWS;
  const data = new Uint8Array(W * H * 4);
  const kinds = [0, 0, 0, 2, 1, 1, 0, 2];
  for (let cell = 0; cell < BRUSH_COLS * BRUSH_ROWS; cell++) {
    const cx = cell % BRUSH_COLS, cy = Math.floor(cell / BRUSH_COLS);
    for (let y = 0; y < CH; y++) {
      for (let x = 0; x < CW; x++) {
        // a margin of nothing round each mark, so the small copies of the sheet don't bleed into each other
        const u = ((x + 0.5) / CW) * 2 - 1, v = (y + 0.5) / CH;
        const m = 0.9;
        const [h, a, s] = Math.abs(u) > m || v < 0.04 || v > 0.96 ? [0, 0, 0.5] : cell < KNIFE ? mark(u / m, (v - 0.04) / 0.92, cell * 7 + 1, kinds[cell]) : knife(u / m, (v - 0.04) / 0.92, cell * 7 + 1, cell - KNIFE);
        const i = ((cx * CW + x) + (cy * CH + y) * W) * 4;
        data[i] = Math.round(h * 255);
        data[i + 1] = Math.round(a * 255);
        data[i + 2] = Math.round(s * 255);
        data[i + 3] = 255;
      }
    }
  }
  const t = new THREE.DataTexture(data, W, H);
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}
