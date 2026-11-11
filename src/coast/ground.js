// The headland as it is painted. Near the eye the turf and the rock are laid in strokes lying flat on them, the
// same steady ground as the wood's: every stroke belongs to one small square for good. Farther off, strokes
// scattered once over the cliffs and stacks run down the rock like cuts of the knife, and over the meadow. And
// the clifftop is full of flowers: coral, salmon and red heads standing up out of the turf.
import * as THREE from 'three';
import { groundRings } from '../oilpaint/ground.js';
import { dabMaterial, dabGeometry, dabMesh } from '../oilpaint/dabs.js';
import { KNIFE } from '../oilpaint/brush.js';
import { noise, rng } from '../world/noise.js';
import { COAST } from './paint.js';
import { EXTENT, heightAt, landAt, normalAt, edgeX, wayX } from './land.js';

const near = /* glsl */ `
// knife marks: 8 rect, 9 wedge, 10 skewed, 11 rounded, 12 blob, 13 chipped, 14 ridged, 15 leaf
void makeDab(inout Dab d) {
  vec2 cell; float sub;
  if (!ringCell(0.0, true, cell, sub)) { d.alive = 0.0; return; }
  vec4 r = hash4(cell, sub * 3.0 + 1.0);
  vec4 q = hash4(cell + 31.7, sub + 11.0);
  vec2 xz = (cell + r.xy) * uCell0;
  float lod;
  float dist = distance(xz, cameraPosition.xz);
  d.alive = ringGrow(dist, lod);
  if (d.alive <= 0.0) return;
  float h = heightAt(xz);
  if (h < 0.15 || max(abs(xz.x), abs(xz.y)) > uExtent) { d.alive = 0.0; return; }
  vec3 P = vec3(xz.x, h, xz.y);
  vec3 Nn = normalAt(xz);
  vec4 m = texture(tLand, landUv(xz));
  vec4 k = hash4(cell + 77.3, sub + 5.0);
  // the light is read a little off where the stroke lies, so the edge of a shadow breaks into strokes of both
  float x = sunOn(P + vec3(k.x - 0.5, 0.0, k.y - 0.5) * 1.6 * uCell0 * lod, Nn);
  vec3 contour = normalize(cross(Nn, vec3(0.0, 1.0, 0.0)) + vec3(1e-4, 0.0, 0.0));
  vec3 c1, c2;
  if (m.r + (q.x - 0.5) * 0.35 > 0.5) {
    d.alive *= 1.0 - smoothstep(70.0, 130.0, dist);
    d.alive *= smoothstep(0.1, 0.3, abs(dot(Nn, normalize(cameraPosition - P))));
    float kind = texture(tNoise, xz / 41.0).g;
    float xr = rockOn(P, Nn);
    c1 = rockPaint(xr, q.y, kind, Nn);
    c2 = rockPaint(xr + 0.12, q.w, kind + 0.2, Nn) * 1.15;
    c1 = mix(c1, wetPaint(x, q.y), m.a * 0.8);
    // down the face, or along its beds now and then
    d.dir = normalize(mix(cross(Nn, contour), contour, step(0.65, r.z)) + (q.xyz - 0.5) * 0.35);
    d.size = uCell0 * vec2(1.3 + 2.2 * k.z * k.z, 1.0) * lod;
    d.size.y = d.size.x * (k.w < 0.3 ? 2.2 + 1.2 * r.w : 0.9 + 0.9 * r.w);
    d.turnabout = -1.0;
  } else {
    float kind = texture(tNoise, xz / 29.0).r + (q.z - 0.5) * 0.25;
    c1 = turfPaint(x, q.y, kind);
    c2 = turfPaint(x + 0.16, q.w, kind + 0.1);
    // the worn way along the top: bare earth, warm in the sun
    float way = smoothstep(1.6, 0.6, abs(xz.x - wayX(xz.y)));
    if (way + (q.y - 0.5) * 0.5 > 0.5) { c1 = paint3(vec3(0.86, 0.66, 0.48), vec3(0.55, 0.42, 0.4), vec3(0.24, 0.2, 0.3), x, q.y); c2 = c1 * 1.1; }
    // flowers lying in the turf, in drifts
    float drift = texture(tNoise, xz / 17.0 + 0.4).a;
    bool bloom = q.w > 1.1 - 0.3 * smoothstep(0.5, 0.75, drift) && way < 0.5;
    if (bloom) { c1 = flowerPaint(x, q.z); c2 = c1 * 1.12; d.cell = ${KNIFE + 3}.0; }
    // the wind combs the grass toward the land
    float wa = (texture(tNoise, xz / 31.0).a - 0.5) * 1.6 + (q.y - 0.5) * 1.3;
    vec3 along = vec3(uWind.x * cos(wa) - uWind.y * sin(wa), 0.0, uWind.x * sin(wa) + uWind.y * cos(wa));
    d.dir = normalize(mix(along, contour, smoothstep(0.97, 0.8, Nn.y)));
    d.size = uCell0 * vec2(0.9 + 1.2 * k.z * k.z, 1.0) * lod;
    d.size.y = d.size.x * (bloom ? 1.0 : k.w < 0.3 ? 2.4 + 1.4 * r.w : 1.0 + 1.0 * r.w);
  }
  if (d.cell < 0.0) { float mm = floor(fract(k.w * 7.3) * 4.0); d.cell = mm < 3.0 ? ${KNIFE}.0 + mm : ${KNIFE + 5}.0; }
  d.pos = P;
  d.c1 = hazed(jitter(c1, r.wzy, 0.32), P);
  d.c2 = hazed(jitter(c2, q.wzy, 0.32), P);
  d.seed = dot(cell, vec2(1.0, 57.0)) + sub * 0.37;
  d.turnabout = d.turnabout < 0.0 ? 0.0 : 1.0;
  d.lie = 1.0;
  d.nrm = Nn;
  d.height = (0.03 + 0.07 * q.z) * pow(lod, 0.35);
  d.glaze = 1.0;
}
`;

const far = /* glsl */ `
void makeDab(inout Dab d) {
  vec4 r = hash4(aData.x);
  vec4 q = hash4(aData.x * 1.7 + 41.0);
  vec3 P = aPos, Nn = normalize(aNrm);
  float dist = distance(P, cameraPosition);
  float x = sunOn(P, Nn);
  vec3 contour = normalize(cross(Nn, vec3(0.0, 1.0, 0.0)) + vec3(1e-4, 0.0, 0.0));
  vec3 down = -cross(contour, Nn); // down the slope
  vec3 c;
  if (aData.y > 0.5) {
    d.alive = smoothstep(10.0, 34.0, dist);
    if (d.alive <= 0.0) return;
    float kind = texture(tNoise, P.xz / 41.0).g + (q.x - 0.5) * 0.2;
    c = rockPaint(rockOn(P, Nn), q.y, kind, Nn);
    // most cuts run down the cliff; some lie along its beds
    bool bed = r.z > 0.75;
    d.dir = normalize((bed ? contour : down) + (q.xyz - 0.5) * 0.4);
    // big faceted slabs: the knife laid flat on the face
    d.size = vec2(2.6, 2.6 * (q.w < 0.2 ? 1.7 + 0.6 * r.z : 0.8 + 0.6 * q.w)) * (0.55 + 1.0 * r.y * r.y) * aData.w;
    // a cut lies on the rock face like a slab of paint laid with the knife: seen from the clifftop, a stroke
    // that faced the eye would stand up over the edge against the sea
    d.lie = 1.0;
    d.nrm = Nn;
    d.height = 0.2 + 0.2 * q.z;
    d.turnabout = -1.0; // the blade lands at the top of the face and drags down it
    // a face seen edge on would be stood up into a sliver: leave it to the faces that are seen
    d.alive *= smoothstep(0.1, 0.3, abs(dot(Nn, normalize(cameraPosition - P))));
  } else {
    d.alive = smoothstep(110.0, 220.0, dist);
    if (d.alive <= 0.0) return;
    float kind = texture(tNoise, P.xz / 29.0).r + (q.z - 0.5) * 0.25;
    c = q.w > 0.86 ? flowerPaint(x, q.x) : turfPaint(x, q.y, kind);
    d.dir = normalize(contour + (q.yzw - 0.5) * 0.4);
    d.size = vec2(3.2, 6.0) * (0.7 + 0.8 * r.y) * aData.w;
  }
  d.size *= mix(0.45, 1.0, smoothstep(0.05, 0.5, abs(dot(Nn, normalize(cameraPosition - P)))));
  c = jitter(c, r.wzy, 0.3);
  d.pos = P + Nn * 0.12;
  d.c1 = hazed(c, P);
  d.c2 = hazed(c * 1.18 + vec3(0.02, 0.01, 0.0), P);
  d.seed = aData.x;
  d.turnabout = d.turnabout < 0.0 ? 0.0 : 1.0;
  d.lift = 0.15;
}
`;

// Flowers and their leaves standing in the turf, pinned by the foot. A flower is a loose head of three to five petal
// slabs round one spot, each a slightly different coral, with a darker touch at its heart, as the poppies in
// ../brand/reference/4.webp are laid. aF is where the plant stands and its own seed; aK says which part this is
// (0 leaf, 1 petal, 2 heart), the head's seed, the petal's place round the head and how many petals it has.
const bloom = /* glsl */ `
void makeDab(inout Dab d) {
  vec4 r = hash4(aF.w);
  vec4 h = hash4(aK.y);
  vec3 P = aF.xyz;
  float dist = distance(P, cameraPosition);
  d.alive = 1.0 - smoothstep(60.0, 90.0, dist);
  if (d.alive <= 0.0) return;
  vec3 Nn = vec3(0.0, 1.0, 0.0);
  float x = sunOn(P, Nn) * 0.8 + 0.2 * h.x;
  // the wind sways them a little toward the land
  float g = gustAt(P.xz);
  vec3 lean = vec3(uWind.x, 0.0, uWind.y) * (0.1 + 0.25 * g) * (0.6 + 0.4 * sin(uTime * 2.2 + h.z * 30.0));
  if (aK.x > 0.5) {
    float size = 0.34 + 0.26 * h.y;
    vec3 toEye = normalize(cameraPosition - P);
    vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), toEye) + vec3(1e-4, 0.0, 0.0));
    vec3 upv = normalize(cross(toEye, side));
    vec3 head = P + vec3(0.0, 0.22 + 0.26 * h.w, 0.0) + lean * 0.5;
    vec3 c = flowerPaint(x, h.z);
    if (aK.x < 1.5) {
      float a = aK.z / aK.w * TAU + h.x * TAU + (r.x - 0.5) * 1.1;
      float rad = size * (0.2 + 0.16 * r.y);
      d.pos = head + (side * cos(a) + upv * sin(a) * 0.8) * rad + toEye * 0.012 * aK.z;
      d.dir = upv;
      d.spin = a - 1.5708 + (r.z - 0.5) * 0.7;
      d.size = size * vec2(0.48 + 0.22 * r.z, 0.62 + 0.3 * r.w);
      // each petal its own coral: a little pinker, a little more orange, lighter or darker
      c = mix(c, r.w < 0.5 ? vec3(0.98, 0.56, 0.52) : vec3(0.98, 0.46, 0.28), 0.25 * r.y);
      c = jitter(c * (0.9 + 0.2 * r.x), r.yzw, 0.18);
      d.cell = r.y < 0.4 ? ${KNIFE + 3}.0 : r.y < 0.75 ? ${KNIFE + 7}.0 : ${KNIFE + 1}.0;
    } else {
      d.pos = head + toEye * 0.08;
      d.dir = upv;
      d.spin = h.w * TAU;
      d.size = vec2(size * (0.2 + 0.08 * r.x));
      c = mix(vec3(0.34, 0.1, 0.12), vec3(0.58, 0.28, 0.1), h.w) * mix(0.75, 1.0, x);
      d.cell = ${KNIFE + 4}.0;
    }
    d.c1 = hazed(c, P);
    d.c2 = hazed(mix(c, vec3(1.0, 0.84, 0.66), 0.14), P);
  } else {
    vec3 c = paint3(vec3(0.42, 0.5, 0.3), vec3(0.22, 0.32, 0.22), vec3(0.12, 0.17, 0.2), x, r.z);
    d.dir = normalize(vec3(0.0, 1.0, 0.0) + lean + vec3(r.z - 0.5, 0.0, r.w - 0.5) * 0.8);
    d.base = 1.0;
    d.pos = P - vec3(0.0, 0.05, 0.0);
    d.size = vec2(0.2 + 0.14 * r.x, 1.0);
    d.size.y = d.size.x * (1.5 + 0.6 * r.w);
    d.c1 = hazed(jitter(c, r.wzy, 0.25), P);
    d.c2 = hazed(c * 1.25 + vec3(0.02, 0.03, 0.0), P);
    d.spin = (r.x - 0.5) * 1.6;
    d.cell = r.w > 0.5 ? ${KNIFE + 7}.0 : ${KNIFE}.0;
  }
  d.seed = aF.w;
  d.lift = 0.2;
}
`;

export function createGround(shared) {
  // the clifftop's edge and the way along it, the same lines as edgeX and wayX in land.js
  const head = COAST + /* glsl */ `
    float edgeX(float z) { return 22.0 * sin(z / 120.0) + 9.0 * sin(z / 41.0 + 1.3); }
    float wayX(float z) { return edgeX(z) + 9.0 + 2.5 * sin(z / 23.0); }`;
  const rings = groundRings(shared, { head, body: near, per: 2, n: 192, cell0: 0.4, levels: 4, minPx: [6, 10], maxPx: [4000, 4000], cells: [KNIFE, 6] });

  const rand = rng(7171);
  const list = [];
  const n = new THREE.Vector3();
  let rock = 0, turf = 0;
  for (let i = 0; i < 2600000 && rock < 240000; i++) {
    const x = (rand() * 2 - 1) * EXTENT, z = (rand() * 2 - 1) * EXTENT;
    const h = heightAt(x, z);
    if (h < 0.3) continue;
    const [isRock, cliff] = landAt(x, z);
    const stone = isRock > 0.5;
    if (rand() > (stone ? 0.6 : 0.09)) continue;
    normalAt(x, z, n);
    list.push([x, h, z, n.x, n.y, n.z, rand() * 1000, stone ? 1 : 0, cliff, stone ? 1.1 + 0.4 * cliff : 1]);
    if (stone) rock++; else turf++;
  }
  // laid in a fixed order, west to east: looking from the clifftop out to sea, the near cliff covers the stacks
  list.sort((a, b) => a[0] - b[0]);
  const count = list.length;
  const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3), data = new Float32Array(count * 4);
  list.forEach((s, i) => { pos.set(s.slice(0, 3), i * 3); nrm.set(s.slice(3, 6), i * 3); data.set(s.slice(6), i * 4); });
  const scattered = dabMesh(dabGeometry(count, { aPos: [pos, 3], aNrm: [nrm, 3], aData: [data, 4] }), dabMaterial(shared, {
    head: COAST + /* glsl */ `in vec3 aPos; in vec3 aNrm; in vec4 aData;`,
    body: far,
    minPx: [8, 14], maxPx: [180, 380], cells: [KNIFE, 6], depthWrite: false,
  }), 3);

  // flowers along the clifftop, fewer and larger, in drifts near the way: each clump one or two heads over leaves
  const plants = [], parts = [];
  const part = (x, y, z, role, head, i, n) => { plants.push(x, y, z, rand() * 1000); parts.push(role, head, i, n); };
  for (let i = 0, clumps = 0; clumps < 9000 && i < 900000; i++) {
    const z = -200 + rand() * 520, off = 1.5 + Math.pow(rand(), 3) * 80;
    const x = edgeX(z) + off;
    if (Math.abs(x - wayX(z)) < 1.4) continue;
    const h = heightAt(x, z);
    if (h < 2 || landAt(x, z)[0] > 0.3) continue;
    const drift = 0.5 + 0.5 * noise(x / 11 + 2, z / 11 - 7);
    if (rand() > 0.01 + 0.99 * Math.max(0, drift * 1.8 - 0.9) ** 2) continue;
    clumps++;
    for (let f = 0, heads = 1 + Math.floor(rand() * 2); f < heads; f++) {
      const cx = x + (rand() - 0.5) * 1.2, cz = z + (rand() - 0.5) * 1.2, cy = heightAt(cx, cz), head = rand() * 1000;
      const n = 3 + Math.floor(rand() * 3);
      for (let k = 0; k < n; k++) part(cx, cy, cz, 1, head, k, n);
      part(cx, cy, cz, 2, head, n, n);
    }
    for (let k = 0, leaves = 2 + Math.floor(rand() * 2); k < leaves; k++) {
      const lx = x + (rand() - 0.5) * 1.4, lz = z + (rand() - 0.5) * 1.4;
      part(lx, heightAt(lx, lz), lz, 0, 0, 0, 1);
    }
  }
  const flowers = dabMesh(dabGeometry(plants.length / 4, { aF: [new Float32Array(plants), 4], aK: [new Float32Array(parts), 4] }), dabMaterial(shared, {
    head: COAST + /* glsl */ `in vec4 aF; in vec4 aK;`, body: bloom, minPx: [3, 3], maxPx: [200, 300], cells: [KNIFE + 3, 1],
  }), 4);

  const group = new THREE.Group();
  group.add(rings.group, scattered, flowers);
  return { group, follow: rings.follow, counts: { rock, turf, flowers: plants.length / 4 } };
}
