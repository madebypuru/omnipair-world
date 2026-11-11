// The coast's ground: a long headland of meadow running north into the sea, walked along its clifftop. To the west
// the cliff falls sheer to a shelf of broken rock and the open sea, where the sun is going down; to the east the
// meadow rolls down to a beach. Off the west cliff stand the sea stacks and the arch (arch.js). Water lies at
// height 0 all round. The same heights are used by the picture, the wanderer's feet and everything painted on it.
import * as THREE from 'three';
import { COMMON, LAND_RES } from '../oilpaint/common.js';
import { noise } from '../world/noise.js';
import { COAST } from './paint.js';

export const EXTENT = 512;
// low over the sea in the west-northwest, a little ahead of the way north: the light rakes along the cliffs. About
// 11 degrees up: any lower and the crest shades the whole of the meadow falling away east of it.
export const SUN = new THREE.Vector3(-0.82, 0.2, -0.56).normalize();

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const smin = (a, b, k) => { const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k)); return b + (a - b) * h - k * h * (1 - h); };

/** The clifftop's edge at each z: he walks it north, toward -z, with the sea on his left. */
export const edgeX = (z) => 22 * Math.sin(z / 120) + 9 * Math.sin(z / 41 + 1.3);
/** The way along the top, a few strides in from the edge. */
export const wayX = (z) => edgeX(z) + 9 + 2.5 * Math.sin(z / 23);
const topH = (z) => 34 + 9 * Math.sin(z / 170 + 0.6) + 4 * noise(z / 60, 3.3);
export const START = { x: wayX(300), z: 300 };
/** The end of the headland, where the great beacon stands. */
export const POINT = { x: wayX(-150), z: -150 };
const NORTH = -205; // the headland ends in the sea here

/** The sea arch and the stacks off the west cliff. The arch itself is a made thing (arch.js); its feet are here.
 *  It stands on the sun's bearing from the way at z = -40, so from the path the sunset shows through its opening. */
const ARCH_SEEN = { x: wayX(-40), z: -40 }, ARCH_OUT = 82, sunH = Math.hypot(SUN.x, SUN.z);
export const ARCH = { x: ARCH_SEEN.x + (SUN.x / sunH) * ARCH_OUT, z: ARCH_SEEN.z + (SUN.z / sunH) * ARCH_OUT, span: 26, high: 34, turn: -0.97 };
const STACKS = [
  { x: edgeX(40) - 44, z: 40, r: 7, h: 26 },
  { x: edgeX(-10) - 34, z: -10, r: 5, h: 15 },
  { x: edgeX(-112) - 50, z: -112, r: 9, h: 31 },
  { x: edgeX(-125) - 80, z: -128, r: 4, h: 11 },
];

/** Height at (x, z), and in out[1] how much of it is cliff or stack (0..1). */
function rawHeight(x, z, out) {
  const d = x - edgeX(z);
  let top = topH(z);
  // the meadow: level near the edge, rolling down to the east, with swells and hollows
  let h = top - 0.13 * Math.max(0, d - 14) - 0.0009 * Math.max(0, d - 14) ** 2;
  h += 3.5 * noise(x / 70 + 1.7, z / 70) * sstep(16, 60, d) + 0.6 * noise(x / 13, z / 13 + 4) * sstep(4, 20, d);
  // the cliff: sheer to the west of the edge, broken into buttresses and gullies
  const bite = 5 * noise(z / 19 + 2, 0.7) + 3 * noise(z / 7, 4.1);
  const over = -(d + bite);
  let cliff = 0;
  if (over > 0) {
    const sheer = 2.6 + 1.4 * noise(z / 33, 9.1);
    h = top - over * sheer;
    cliff = 1;
  }
  cliff = Math.max(cliff, sstep(-2, 0, over));
  // the shelf at the cliff's foot: slabs of broken rock awash, then the sea floor
  const foot = over - top / 2.6;
  const shelf = 1.2 + 1.6 * noise(x / 9 + 3, z / 9) + 1.4 * Math.max(0, noise(x / 23, z / 23 - 5)) - 0.09 * Math.max(0, foot);
  if (foot > 0) h = Math.max(h, shelf);
  h = Math.max(h, -12 - 0.05 * Math.max(0, foot));
  // the end of the headland: it falls to the sea all round
  const north = NORTH - z;
  if (north > -40) h = smin(h, top - Math.max(0, north + 40) * 1.9 + 4 * noise(x / 15, 1.1), 6);
  // the east shore: a beach where the meadow meets the sea
  const shore = d - 135 - 30 * noise(z / 90, 6.2);
  if (shore > 0) h = smin(h, 1.2 - shore * 0.08, 4);
  // stacks: steep stumps of the same rock standing in the sea
  let stack = 0;
  for (const s of STACKS) {
    const r = Math.hypot(x - s.x, z - s.z) * (1 + 0.18 * noise(x / 6 + s.z, z / 6));
    const sh = s.h * sstep(s.r * 1.25, s.r * 0.75, r) + 2.2 * sstep(s.r * 2.6, s.r, r);
    // it rises out of the sea floor round it: outside its foot the floor is left alone
    const w = sstep(s.r * 3.2, s.r * 1.3, r);
    if (w > 0 && sh > h) { h += (sh - h) * w; stack = Math.max(stack, sstep(s.r * 2.2, s.r, r)); }
  }
  // the arch's two feet, and the rocks round them
  const ac = Math.cos(ARCH.turn), as = Math.sin(ARCH.turn);
  for (const side of [-1, 1]) {
    const fx = ARCH.x + side * ARCH.span * 0.5 * ac, fz = ARCH.z + side * ARCH.span * 0.5 * as;
    const r = Math.hypot(x - fx, z - fz);
    const sh = 6 * sstep(11, 4, r) + 2 * sstep(18, 7, r) * (0.6 + 0.4 * noise(x / 5, z / 5));
    const w = sstep(22, 9, r);
    if (w > 0 && sh > h) { h += (sh - h) * w; stack = Math.max(stack, sstep(9, 5, r)); }
  }
  // a broad flat place on the point for the great beacon
  const pt = Math.hypot(x - POINT.x, z - POINT.z);
  if (pt < 18) h += (topH(POINT.z) + 0.5 - h) * sstep(18, 8, pt);
  // and the map's own edge sinks into the sea
  const edge = EXTENT - Math.pow(x ** 4 + z ** 4, 0.25);
  h = smin(h, 0.5 * (edge - 30), 10);
  out[0] = h; out[1] = Math.max(cliff, stack);
  return h;
}

const N = LAND_RES;
const heights = new Float32Array(N * N);
const land = new Uint8Array(N * N * 4); // r rock, g cliff or stack, b how level, a shore (wet)
const at = (i) => -EXTENT + (i / (N - 1)) * 2 * EXTENT;
export async function prepareLand(pause) {
  const out = [0, 0];
  for (let j = 0; j < N; j++) {
    if (pause && j % 24 === 0) await pause(0.8 * j / N);
    const z = at(j);
    for (let i = 0; i < N; i++) {
      heights[i + j * N] = rawHeight(at(i), z, out);
      land[(i + j * N) * 4 + 1] = Math.round(255 * out[1]);
    }
  }
  for (let j = 0; j < N; j++) {
    if (pause && j % 64 === 0) await pause(0.8 + 0.2 * j / N);
    for (let i = 0; i < N; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(N - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(N - 1, j + 1);
      const hx = (heights[i1 + j * N] - heights[i0 + j * N]) / (i1 - i0), hz = (heights[i + j1 * N] - heights[i + j0 * N]) / (j1 - j0);
      const ny = 1 / Math.sqrt(1 + hx * hx + hz * hz);
      const k = (i + j * N) * 4, x = at(i), z = at(j), h = heights[i + j * N];
      // rock where it is too steep for turf, on the stacks, and on the wave-washed shelf
      const steep = sstep(0.74, 0.62, ny + 0.06 * noise(x / 9, z / 9));
      const low = sstep(4.5, 2.5, h) * (land[k + 1] > 40 || h > 0.6 ? 1 : 0);
      land[k] = Math.round(255 * Math.max(steep, land[k + 1] / 255 > 0.5 ? 1 : 0, low));
      land[k + 2] = Math.round(255 * ny);
      land[k + 3] = Math.round(255 * sstep(3, 0.2, h) * sstep(-2.5, 0, h));
    }
  }
  prepareShore();
}
// How far each spot of sea is from the nearest dry land, in metres (0 on land, at most SHORE_MAX): the surf is laid
// along it and its slope says which way the shore is. Chamfer distance over the height map, then softened so the way
// to shore turns smoothly.
export const SHORE_MAX = 60;
const shore = new Float32Array(N * N);
function prepareShore() {
  const D = Math.SQRT2;
  for (let k = 0; k < N * N; k++) shore[k] = heights[k] > 0 ? 0 : SHORE_MAX;
  const relax = (k, n, cost) => { if (shore[n] + cost < shore[k]) shore[k] = shore[n] + cost; };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = i + j * N;
    if (i > 0) relax(k, k - 1, 1);
    if (j > 0) { relax(k, k - N, 1); if (i > 0) relax(k, k - N - 1, D); if (i < N - 1) relax(k, k - N + 1, D); }
  }
  for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) {
    const k = i + j * N;
    if (i < N - 1) relax(k, k + 1, 1);
    if (j < N - 1) { relax(k, k + N, 1); if (i < N - 1) relax(k, k + N + 1, D); if (i > 0) relax(k, k + N - 1, D); }
  }
  const tmp = new Float32Array(N * N), R = 2;
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let s = 0, n = 0;
      for (let d = -R; d <= R; d++) { const ii = i + d; if (ii >= 0 && ii < N) { s += shore[ii + j * N]; n++; } }
      tmp[i + j * N] = s / n;
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let s = 0, n = 0;
      for (let d = -R; d <= R; d++) { const jj = j + d; if (jj >= 0 && jj < N) { s += tmp[i + jj * N]; n++; } }
      shore[i + j * N] = heights[i + j * N] > 0 ? 0 : s / n;
    }
  }
}
/** Metres from (x, z) to the nearest dry land. */
export function shoreAt(x, z) {
  if (Math.max(Math.abs(x), Math.abs(z)) >= EXTENT) return SHORE_MAX;
  const fx = ((x + EXTENT) / (2 * EXTENT)) * (N - 1), fz = ((z + EXTENT) / (2 * EXTENT)) * (N - 1);
  const i = Math.min(N - 2, Math.floor(fx)), j = Math.min(N - 2, Math.floor(fz)), tx = fx - i, tz = fz - j;
  const a = shore[i + j * N], b = shore[i + 1 + j * N], c = shore[i + (j + 1) * N], d = shore[i + 1 + (j + 1) * N];
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
}
export function heightAt(x, z) {
  const fx = Math.min(N - 1.001, Math.max(0, ((x + EXTENT) / (2 * EXTENT)) * (N - 1)));
  const fz = Math.min(N - 1.001, Math.max(0, ((z + EXTENT) / (2 * EXTENT)) * (N - 1)));
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
  const a = heights[i + j * N], b = heights[i + 1 + j * N], c = heights[i + (j + 1) * N], d = heights[i + 1 + (j + 1) * N];
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
}
/** [rock, cliff] at (x, z), each 0..1. */
export function landAt(x, z) {
  const i = Math.min(N - 1, Math.max(0, Math.round(((x + EXTENT) / (2 * EXTENT)) * (N - 1))));
  const j = Math.min(N - 1, Math.max(0, Math.round(((z + EXTENT) / (2 * EXTENT)) * (N - 1))));
  const k = (i + j * N) * 4;
  return [land[k] / 255, land[k + 1] / 255];
}
export function normalAt(x, z, out = new THREE.Vector3()) {
  const e = 1.2;
  return out.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize();
}

export function createLand(shared) {
  const tHeight = new THREE.DataTexture(heights, N, N, THREE.RedFormat, THREE.FloatType);
  tHeight.minFilter = tHeight.magFilter = THREE.LinearFilter;
  tHeight.needsUpdate = true;
  const tLand = new THREE.DataTexture(land, N, N);
  tLand.minFilter = tLand.magFilter = THREE.LinearFilter;
  tLand.needsUpdate = true;
  shared.tHeight.value = tHeight;
  shared.tLand.value = tLand;
  shared.uExtent.value = EXTENT;
  const tShore = new THREE.DataTexture(shore, N, N, THREE.RedFormat, THREE.FloatType);
  tShore.minFilter = tShore.magFilter = THREE.LinearFilter;
  tShore.needsUpdate = true;
  shared.tShore = { value: tShore };

  const seg = 512;
  const geometry = new THREE.PlaneGeometry(2 * EXTENT, 2 * EXTENT, seg, seg);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)) - 0.06);
  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: shared,
    vertexShader: /* glsl */ `
      ${COMMON}
      out vec3 vWorld;
      void main() { vWorld = position; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      ${COMMON}
      ${COAST}
      in vec3 vWorld;
      layout(location = 0) out vec4 outC;
      void main() {
        // under the sea the water is painted instead
        if (vWorld.y < 0.05) discard;
        vec4 m = texture(tLand, landUv(vWorld.xz));
        vec3 Nn = normalAt(vWorld.xz);
        float near = 1.0 - smoothstep(25.0, 110.0, distance(vWorld, cameraPosition));
        vec4 n = texture(tNoise, vWorld.xz / 3.1);
        vec2 sq = mix(vWorld.xz, floor(vWorld.xz / 0.7 + (n.rg - 0.5) * 1.8) * 0.7, near);
        vec3 P = vec3(sq.x, vWorld.y, sq.y);
        float x = sunOn(P, Nn);
        float wide = texture(tNoise, vWorld.xz / 37.0).b;
        vec3 turf = turfPaint(x, n.b, wide) * 0.88;
        vec3 rock = rockPaint(rockOn(P, Nn), n.b, wide, Nn) * 0.86;
        vec3 c = mix(turf, rock, step(0.5, m.r + (n.a - 0.5) * 0.3));
        c = mix(c, wetPaint(x, n.g), m.a * 0.8);
        outC = vec4(hazed(c, vWorld), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const caster = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  caster.frustumCulled = false;
  const shade = new THREE.Scene();
  shade.add(caster);

  function heightField(cells = 512, half = EXTENT) {
    const out = new Float32Array((cells + 1) * (cells + 1));
    for (let col = 0; col <= cells; col++) {
      for (let row = 0; row <= cells; row++) {
        out[row + col * (cells + 1)] = heightAt(-half + (col / cells) * 2 * half, -half + (row / cells) * 2 * half);
      }
    }
    return { heights: out, cells, half };
  }
  return { mesh, shade, heightField };
}
