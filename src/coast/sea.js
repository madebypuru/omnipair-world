// The sea, and the far headlands across it. Water is strokes lying flat on it, each the colour of the piece of sky
// it gives back: cobalt out deep, turquoise over the shallows, a road of gold toward the sun, and white foam where
// the swell breaks on the shelf and round the stacks. A swell comes in from the west and every stroke rides it.
//
// Near the land the strokes are scattered evenly and sorted by a height of their own, like the ground; far out they
// are laid in a fixed order, far to near, with a ring of distant headlands between the outer and the inner water.
import * as THREE from 'three';
import { COMMON } from '../oilpaint/common.js';
import { dabMaterial, dabGeometry, dabMesh } from '../oilpaint/dabs.js';
import { KNIFE } from '../oilpaint/brush.js';
import { noise, rng } from '../world/noise.js';
import { COAST } from './paint.js';
import { heightAt, shoreAt, coastAt, EXTENT, SHORE_MAX } from './land.js';
import { LAMPS } from './paint.js';

const WATER = /* glsl */ `
uniform sampler2D tShore;
// depth of the sea floor under P (0 at the waterline)
float seaDepth(vec2 xz) { return max(abs(xz.x), abs(xz.y)) < uExtent ? -heightAt(xz) : 40.0; }
// metres to the nearest dry land (land.js), and the way out to sea from it
float shoreDist(vec2 xz) { return max(abs(xz.x), abs(xz.y)) < uExtent ? texture(tShore, landUv(xz)).r : ${SHORE_MAX}.0; }
vec2 seaward(vec2 xz) {
  float e = 1.5;
  vec2 g = vec2(shoreDist(xz + vec2(e, 0.0)) - shoreDist(xz - vec2(e, 0.0)), shoreDist(xz + vec2(0.0, e)) - shoreDist(xz - vec2(0.0, e)));
  return dot(g, g) > 1e-6 ? normalize(g) : vec2(-0.97, -0.24);
}
// how much of the shallows' turquoise a spot takes: by the floor under it and how near the land is, both smooth
float shallowAt(vec2 xz, float depth) { return max(smoothstep(9.0, 1.5, depth) * 0.85, smoothstep(20.0, 2.0, shoreDist(xz))); }
// The swell: it comes in from the west, so its crests run north and south.
float swellAt(vec2 xz, float r) { return (dot(xz, vec2(0.97, 0.24)) / 38.0 - uTime * 0.32 + r * 0.3) * TAU; }
// The sea gives back the sky it faces only a little; it is mostly its own cobalt and ultramarine out deep, teal
// and turquoise over the shallows, with a narrow road of gold toward the sun.
vec3 waterPaint(vec3 P, vec3 wobble, float shallow, float pick) {
  vec3 v = normalize(P - cameraPosition);
  vec3 up = normalize(vec3(v.x, -v.y, v.z) + wobble);
  up.y = abs(up.y);
  vec3 sky = coastSky(up);
  // the road of light toward the sun: narrow across, drawn out along
  vec2 h = normalize(v.xz), s = normalize(uSunDir.xz);
  float road = pow(clamp(dot(normalize(h + wobble.xz * 0.15), s), 0.0, 1.0), 900.0) * smoothstep(-0.3, -0.01, v.y);
  vec3 deep = pick < 0.45 ? vec3(0.08, 0.27, 0.6) : pick < 0.8 ? vec3(0.06, 0.19, 0.5) : vec3(0.18, 0.42, 0.72);
  vec3 near = pick < 0.5 ? vec3(0.14, 0.58, 0.66) : pick < 0.8 ? vec3(0.1, 0.44, 0.56) : vec3(0.26, 0.64, 0.7);
  vec3 body = mix(deep, near, shallow);
  float graze = pow(1.0 - clamp(-v.y, 0.0, 1.0), 6.0);
  vec3 c = mix(body, sky, 0.04 + 0.2 * graze);
  return mix(c, vec3(1.0, 0.78, 0.46), road * 0.9);
}
// Calm water a hand deep: inside the lagoon and the tide pools.
float calmAt(vec2 xz) { return max(abs(xz.x), abs(xz.y)) < uExtent ? coastAt(xz).b : 0.0; }
// The lagoon: a mirror. Looking down into it near the eye the sand shows through, pale gold where it is a hand deep
// and turquoise where it is deeper; farther off it gives back the sky and the cloud banks. ripple tips the mirror.
vec3 lagoonPaint(vec3 P, vec2 ripple, float pick, bool columns) {
  vec3 v = normalize(P - cameraPosition);
  vec3 r = normalize(vec3(v.x + ripple.x, max(-v.y, 0.002), v.z + ripple.y));
  vec3 sky = duskSky(r);
  float depth = clamp(seaDepth(P.xz), 0.0, 0.8);
  float sun = woodSunAt(P + vec3(0.0, 0.2, 0.0));
  vec3 sand = mix(pick < 0.5 ? vec3(0.96, 0.82, 0.6) : vec3(0.98, 0.72, 0.52), vec3(0.6, 0.62, 0.78), 0.45 * (1.0 - sun));
  vec3 turq = mix(mix(vec3(0.3, 0.8, 0.8), vec3(0.18, 0.62, 0.74), pick), vec3(0.22, 0.52, 0.72), 0.35 * (1.0 - sun));
  vec3 under = mix(sand, turq, 0.35 + 0.65 * smoothstep(0.0, 0.35, depth));
  float fres = 0.3 + 0.7 * pow(1.0 - clamp(-v.y, 0.0, 1.0), 3.0);
  vec3 c = mix(under, sky * 0.97, fres);
  float D0 = distance(P.xz, cameraPosition.xz);
  // each lamp, given back as a short broken column on the water under it, between it and the eye (only the strokes
  // laid on the water draw these: the wash under them would work them out for every pixel)
  for (int i = 0; i < ${LAMPS}; i++) {
    if (!columns || D0 > 260.0) break;
    vec4 L = uLamps[i];
    if (L.w <= 0.0) continue;
    vec2 cl = L.xz - cameraPosition.xz;
    float D = length(cl);
    if (D < 1.0 || D > 400.0) continue;
    vec2 u = cl / D, cp = P.xz - cameraPosition.xz;
    float along = dot(cp, u) / D;
    float side = abs(cp.x * u.y - cp.y * u.x) / max(length(cp), 1.0);
    float spec = cameraPosition.y / (cameraPosition.y + L.y);
    // short: it reaches from the mirrored flame a little way toward the eye, and breaks up in the ripple
    float reach = 0.04 + 0.3 * spec * (1.0 - spec);
    float col = exp(-pow(side / (0.003 + 0.25 / D), 2.0)) * smoothstep(spec - reach, spec - reach * 0.4, along) * smoothstep(spec + reach * 0.5, spec, along);
    col *= step(0.3, fract(sin(dot(floor(P.xz * 1.7), vec2(12.9898, 78.233))) * 43758.5453));
    c = mix(c, vec3(1.0, 0.72, 0.36) * (0.95 + 0.3 * L.w), clamp(col * L.w * 1.6, 0.0, 0.92));
  }
  // and the lamps' pools lie warm on the water near them
  return mix(c, c * vec3(1.15, 0.9, 0.62) + vec3(0.14, 0.07, 0.0), clamp(lampGlow(P) * 1.1, 0.0, 1.0) * 0.6);
}
`;

// The surf. Each wave is a crest line that runs in over `reach` metres of water in `period` seconds, parallel to the
// shore (land.js shoreDist), breaking as it comes. Where it has passed it leaves foam that thins and fades; when it
// reaches the rock the band of white there swells and then drains back. Waves come in sets: each a different height.
const SURF = { reach: 18, period: 6.5, fade: 2.4 };
const SURF_BODY = /* glsl */ `
  void makeDab(inout Dab d) {
    vec4 r = hash4(aW.w);
    vec4 k = hash4(aW.w * 3.7 + 1.3);
    vec3 P = aW.xyz;
    float s = shoreDist(P.xz);
    vec2 out_ = seaward(P.xz);
    // the crests come in a little ragged: a slow difference in when each part of the shore is reached
    float lag = texture(tNoise, P.xz / 70.0).r * 1.2 + texture(tNoise, P.xz / 17.0).g * 0.25;
    float q = uTime / ${SURF.period.toFixed(1)} - lag + s / ${SURF.reach.toFixed(1)};
    float id = floor(q);
    float age = fract(q) * ${SURF.period.toFixed(1)};
    vec4 w = hash4(id * 1.618 + 0.3);
    float height = 0.5 + 0.5 * w.x;
    // a wave breaks only once the water is shallow enough for it, and breaks in pieces, a different piece each wave
    float breaks = smoothstep(${SURF.reach.toFixed(1)}, ${(SURF.reach * 0.45).toFixed(1)}, s) * smoothstep(0.3, 0.55, texture(tNoise, P.xz / 9.0 + w.yz).b + 0.25 * height);
    // white comes on as the crest passes and fades after it
    float crest = smoothstep(0.0, 0.45, age) * exp(-age / ${SURF.fade.toFixed(1)});
    float f = height * breaks * crest;
    // the wash at the rock: it swells when the wave arrives and drains back after
    float q0 = uTime / ${SURF.period.toFixed(1)} - lag;
    float age0 = fract(q0) * ${SURF.period.toFixed(1)};
    float surge = hash4(floor(q0) * 1.618 + 0.3).x * 0.5 + 0.5;
    float band = 2.6 + 4.0 * surge * smoothstep(0.0, 0.8, age0) * exp(-age0 / 2.2);
    float rock = smoothstep(band, band * 0.45, s) * (0.75 + 0.25 * surge);
    float F = max(f, rock);
    // each touch has its own threshold, so the foam grows and shrinks by more of them, never by one blinking
    float on = smoothstep(r.x * 0.75, r.x * 0.75 + 0.3, F);
    if (on < 0.004) { d.alive = 0.0; return; }
    // laid along the shore, a little off each time; carried in a step by the wash as the crest passes
    vec3 along = vec3(-out_.y, 0.0, out_.x);
    float turn = (r.z - 0.5) * 0.8;
    d.dir = along * cos(turn) + vec3(out_.x, 0.0, out_.y) * sin(turn);
    d.pos = vec3(P.x, 0.0, P.z) - vec3(out_.x, 0.0, out_.y) * (0.9 * smoothstep(0.0, 1.6, age) * smoothstep(${SURF.period.toFixed(1)}, ${(SURF.period * 0.6).toFixed(1)}, age) * breaks * height);
    // white at the rock, going to pale turquoise lace seaward and as it fades
    float white = clamp(F * 1.3 - 0.35 + (r.w - 0.5) * 0.3, 0.0, 1.0) * smoothstep(${SURF.reach.toFixed(1)}, 3.0, s + 4.0 * (1.0 - F));
    vec3 lace = mix(vec3(0.42, 0.78, 0.8), vec3(0.62, 0.88, 0.88), r.y);
    vec3 c = mix(lace, mix(vec3(0.97, 0.97, 0.93), vec3(0.86, 0.94, 0.95), k.x), white);
    vec3 sky = coastSky(normalize(vec3(0.0, 1.0, 0.0) + vec3(uSunDir.x, 0.0, uSunDir.z) * 0.6));
    c = mix(c, c * (0.85 + 0.25 * sky), 0.25);
    d.alive = on;
    float big = smoothstep(6.0, 0.0, s);
    d.size = vec2(0.9 + 0.6 * k.y, 1.4 + 1.8 * k.z) * mix(1.25, 1.0, big) * (0.7 + 0.3 * F);
    d.cell = k.w < 0.3 ? ${KNIFE}.0 : k.w < 0.6 ? ${KNIFE + 3}.0 : k.w < 0.8 ? ${KNIFE + 1}.0 : ${KNIFE + 2}.0;
    d.c1 = mix(jitter(c, r.yzw, 0.08), hazed(c, P), 0.4);
    d.c2 = mix(mix(c, vec3(1.0), 0.4), hazed(c, P), 0.4);
    d.seed = aW.w;
    d.lie = 1.0;
    d.nrm = vec3(0.0, 1.0, 0.0);
    d.height = 0.35 + 0.3 * F + 0.1 * r.z;
  }`;

const RING = { r: 1900, top: 60, seed: 5.3, open: [-1.9, 0.5, 1.4], count: 30000 };
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function crest(az, broad = false) {
  const o = RING, c = Math.cos(az), s = Math.sin(az);
  let n = 0.45 + 0.55 * noise(c * 2.2 + o.seed, s * 2.2) + 0.28 * noise(c * 6.5, s * 6.5 + o.seed);
  if (!broad) n += 0.1 * noise(c * 17 + o.seed, s * 17);
  const turn = Math.abs(((az - o.open[0] + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  const gap = sstep(o.open[1], o.open[2], turn);
  return o.top * gap * Math.min(1.4, Math.max(0.05, n));
}

export function createSea(shared) {
  const group = new THREE.Group();
  const rand = rng(5151);
  const lay = (mesh, order) => {
    mesh.material.depthTest = false;
    mesh.material.depthWrite = false;
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };
  const wash = (depth) => new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: shared,
    vertexShader: /* glsl */ `
      out vec3 vWorld;
      void main() { vWorld = position; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      ${COMMON}
      ${COAST}
      ${WATER}
      in vec3 vWorld;
      layout(location = 0) out vec4 outC;
      void main() {
        vec3 c = waterPaint(vWorld, vec3(0.0), ${depth ? 'shallowAt(vWorld.xz, seaDepth(vWorld.xz))' : '0.0'}, 0.3) * 0.88;
        ${depth ? 'float calm = calmAt(vWorld.xz); if (calm > 0.01) c = mix(c, lagoonPaint(vWorld, vec2(0.0), 0.3, false) * 0.94, smoothstep(0.2, 0.7, calm));' : ''}
        outC = vec4(mix(c, hazed(c, vWorld), 0.4), 1.0);
      }`,
  });
  // one stroke of open water
  const stroke = (near) => /* glsl */ `
    void makeDab(inout Dab d) {
      vec4 r = hash4(aW.w);
      vec3 P = aW.xyz;
      float depth = seaDepth(P.xz);
      if (depth < 0.15${''} || calmAt(P.xz) > 0.5) { d.alive = 0.0; return; }
      vec2 q = normalize(P.xz - cameraPosition.xz);
      vec3 along = vec3(-q.y, 0.0, q.x);
      float swell = swellAt(P.xz, r.z);
      // tiles, about twice as long as they are wide, laid along the swell
      vec2 size = ${near ? 'vec2(3.4 + 2.6 * r.y + distance(P, cameraPosition) * (0.04 + 0.03 * r.y), 1.0)' : 'length(P.xz) * vec2(0.08 + 0.06 * r.y, 1.0)'};
      vec4 k = hash4(aW.w * 2.9 + 7.1);
      // broad flat tiles among long drags along the swell, of many sizes
      size *= 0.55 + 0.9 * k.x * k.x;
      size.y = size.x * (k.y < 0.35 ? 2.4 + 1.8 * k.z : 1.0 + 0.9 * r.w);
      float sd = shoreDist(P.xz);
      float shallow = clamp(shallowAt(P.xz, depth) + (r.y - 0.5) * 0.3, 0.0, 1.0);
      // near the land the tiles turn to lie along the shore and get smaller; out deep they lie across the swell
      float hug = smoothstep(30.0, 6.0, sd);
      size *= 1.0 - 0.45 * hug;
      size.y = mix(size.y, min(size.y, size.x * 1.5), hug);
      // riding the swell: a slow lift and fall, as colour and a little stretch, never a slide
      size.y *= 1.0 + 0.08 * cos(swell);
      vec3 wob = (vec3(r.x - 0.5, (r.y - 0.5) * 0.5, r.z - 0.5) + 0.25 * vec3(sin(swell + r.x * 9.0), 0.0, cos(swell + r.y * 9.0))) * 0.18;
      vec3 c = waterPaint(P, wob, shallow, fract(r.x * 7.3));
      c *= 0.95 + 0.07 * sin(swell);
      // the face of the swell turned to the sun flashes gold
      if (r.w > 0.86) {
        float flash = pow(0.5 + 0.5 * sin(swell * 2.0 + r.y * TAU), 3.0);
        c = mix(c, vec3(1.0, 0.85, 0.6), 0.6 * flash * smoothstep(0.93, 0.995, dot(normalize(P.xz - cameraPosition.xz), normalize(uSunDir.xz))) * smoothstep(-0.45, -0.15, normalize(P - cameraPosition).y));
      }
      // right at the rocks the water is churned pale: turquoise going milky
      c = mix(c, vec3(0.5, 0.82, 0.8), smoothstep(5.0, 1.0, sd) * (0.35 + 0.3 * r.z));
      c *= 0.9 + 0.2 * r.x;
      vec2 out_ = seaward(P.xz);
      vec3 shore = vec3(-out_.y, 0.0, out_.x);
      vec3 crestW = vec3(-0.24, 0.0, 0.97);
      float turn = (k.w - 0.5) * 0.35;
      vec3 deepDir = normalize(mix(crestW * sign(dot(crestW, along) + 1e-4), along, 0.85));
      deepDir = deepDir * cos(turn) + cross(vec3(0.0, 1.0, 0.0), deepDir) * sin(turn);
      d.dir = normalize(mix(deepDir, shore + vec3(r.w - 0.5, 0.0, r.x - 0.5) * 0.3, hug));
      d.pos = vec3(P.x, 0.0, P.z);
      d.size = size;
      d.c1 = mix(jitter(c, r.yzw, 0.16), hazed(c, P), 0.4);
      d.c2 = mix(c * 1.1, hazed(c, P), 0.4);
      d.seed = aW.w;
      d.lie = 1.0;
      d.nrm = vec3(0.0, 1.0, 0.0);
      d.height = ${near ? '0.02 + 0.2 * r.z' : '0.5'};
    }`;

  // --- far out: the outer water, the headlands, the inner water out to the near sea ---
  const bands = [[1800, 15500], [600, 1800]];
  const all = [];
  for (let i = 0; i < 34000; i++) {
    const a = rand() * Math.PI * 2, rad = 600 * Math.exp(rand() * Math.log(15000 / 600));
    all.push([Math.sin(a) * rad, 0, -Math.cos(a) * rad, rand() * 1000, rad]);
  }
  bands.forEach(([inner, outer], b) => {
    const order = b === 0 ? -7.2 : -6.4;
    lay(new THREE.Mesh(new THREE.RingGeometry(inner, outer, 128, 1).rotateX(-Math.PI / 2), wash(false)), order);
    const mine = all.filter((w) => w[4] >= inner && w[4] < outer).sort((p, q) => q[4] - p[4]);
    lay(dabMesh(dabGeometry(mine.length, { aW: [new Float32Array(mine.flatMap((w) => w.slice(0, 4))), 4] }), dabMaterial(shared, {
      head: COAST + WATER + /* glsl */ `in vec4 aW;`, body: stroke(false), minPx: [6, 12], maxPx: [700, 1600], cells: [KNIFE, 3],
    })), order + 0.1);
  });

  // the headlands across the water: lilac walls going purple, warm along the edges toward the sun
  {
    const SEG = 720, order = -6.8;
    const wall = new THREE.BufferGeometry();
    const p = new Float32Array((SEG + 1) * 2 * 3), index = [];
    for (let i = 0; i <= SEG; i++) {
      const az = (i / SEG) * Math.PI * 2, x = Math.sin(az) * RING.r, z = -Math.cos(az) * RING.r;
      p.set([x, -10, z, x, crest(az), z], i * 6);
      if (i < SEG) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    wall.setAttribute('position', new THREE.BufferAttribute(p, 3));
    wall.setIndex(index);
    lay(new THREE.Mesh(wall, new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, uniforms: shared, side: THREE.DoubleSide,
      vertexShader: /* glsl */ `out vec3 vWorld; void main() { vWorld = position; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        ${COMMON}
        in vec3 vWorld;
        layout(location = 0) out vec4 outC;
        void main() { vec3 c = mix(vec3(0.32, 0.28, 0.52), vec3(0.52, 0.44, 0.66), smoothstep(0.0, 140.0, vWorld.y)); outC = vec4(mix(c, hazed(c, vWorld), 0.45), 1.0); }`,
    })), order);
    const pos = new Float32Array(RING.count * 3), nrm = new Float32Array(RING.count * 3), data = new Float32Array(RING.count * 4);
    for (let i = 0; i < RING.count; i++) {
      const az = rand() * Math.PI * 2, top = crest(az), t = Math.pow(rand(), 0.8);
      const e = 0.012, fall = (crest(az + e, true) - crest(az - e, true)) / (2 * e * RING.r);
      const sx = Math.sin(az), cz = -Math.cos(az), tx = Math.cos(az), tz = Math.sin(az);
      const lean = fall * 1.7 + (rand() - 0.5) * 0.15;
      const rr = RING.r - 30 - 50 * rand();
      pos.set([sx * rr, t * top, cz * rr], i * 3);
      const len = Math.hypot(0.75, lean, 0.55);
      nrm.set([(-sx * 0.75 - tx * lean) / len, 0.55 / len, (-cz * 0.75 - tz * lean) / len], i * 3);
      data.set([rand() * 1000, t, top, RING.r], i * 4);
    }
    lay(dabMesh(dabGeometry(RING.count, { aPos: [pos, 3], aNrm: [nrm, 3], aData: [data, 4] }), dabMaterial(shared, {
      head: COAST + /* glsl */ `in vec3 aPos; in vec3 aNrm; in vec4 aData;`,
      body: /* glsl */ `
        void makeDab(inout Dab d) {
          vec4 r = hash4(aData.x);
          if (aData.z < 4.0) { d.alive = 0.0; return; }
          vec3 Nn = normalize(aNrm);
          float x = clamp(dot(Nn, uSunDir) * 1.8 + 0.2, 0.0, 1.0);
          vec3 c = paint3(vec3(0.74, 0.56, 0.72), vec3(0.52, 0.44, 0.68), vec3(0.34, 0.3, 0.56), x, r.y);
          // the crest toward the sun catches it: a warm lit edge
          float rim = smoothstep(0.8, 0.97, aData.y) * smoothstep(-0.2, 0.9, dot(normalize(aPos.xz), normalize(uSunDir.xz))) * (0.6 + 0.4 * r.x);
          c = mix(c, vec3(0.98, 0.64, 0.44), rim * 0.85);
          vec3 side = normalize(cross(Nn, vec3(0.0, 1.0, 0.0)));
          d.dir = normalize(cross(side, Nn) * 0.3 + side * 0.9 + vec3(0.0, (r.w - 0.5) * 0.3, 0.0));
          d.pos = aPos;
          d.size = aData.w * vec2(0.012 + 0.008 * r.z, 1.0);
          d.size.y = d.size.x * (1.5 + 0.8 * r.w);
          // seen through only a little of the air, so they stay lilac and violet rather than going to haze
          d.c1 = mix(jitter(c, r.yzw, 0.18), hazed(c, aPos), 0.45);
          d.c2 = mix(c * 1.08, hazed(c, aPos), 0.45);
          d.seed = aData.x;
          d.turnabout = 1.0;
          d.lift = 0.0;
        }`,
      uniforms: { uImpasto: { value: 0.3 } },
      minPx: [6, 10], maxPx: [200, 500], cells: [KNIFE, 4],
    })), order + 0.1);
  }

  // --- near: the sea round the headland, sorted like the ground ---
  {
    const near = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200, 1, 1).rotateX(-Math.PI / 2), wash(true));
    near.renderOrder = -6;
    near.frustumCulled = false;
    group.add(near);
    const list = [];
    for (let i = 0; list.length < 4 * 34000 && i < 600000; i++) {
      const x = (rand() * 2 - 1) * 600, z = (rand() * 2 - 1) * 600;
      const inside = Math.max(Math.abs(x), Math.abs(z)) < EXTENT;
      const h = inside ? heightAt(x, z) : -40;
      if (h > -0.15) continue;
      // thicker over the shallows, where the foam is: there the touches are small, so more of them
      if (h < -4 && rand() < 0.45) continue;
      list.push(x, 0, z, rand() * 1000);
      if (h > -2.6) list.push(x + (rand() - 0.5) * 6, 0, z + (rand() - 0.5) * 6, rand() * 1000);
    }
    const count = list.length / 4;
    group.add(dabMesh(dabGeometry(count, { aW: [new Float32Array(list), 4] }), dabMaterial(shared, {
      head: COAST + WATER + /* glsl */ `in vec4 aW;`, body: stroke(true), minPx: [6, 10], maxPx: [900, 1800], cells: [KNIFE, 3],
    }), -5));
  }

  // --- the lagoon: long strokes lying on the water and pointing at the eye, so the sky they give back is drawn down
  // the canvas in vertical smears, as the brand's lagoon is painted ---
  {
    const list = [];
    for (let z = -EXTENT; z < EXTENT; z += 1.1) {
      for (let x = 100; x < EXTENT; x += 1.1) {
        const px = x + rand() * 1.1, pz = z + rand() * 1.1;
        if (coastAt(px, pz)[2] < 0.3 || heightAt(px, pz) > -0.02) continue;
        list.push(px, 0, pz, rand() * 1000);
      }
    }
    group.add(dabMesh(dabGeometry(list.length / 4, { aW: [new Float32Array(list), 4] }), dabMaterial(shared, {
      head: COAST + WATER + /* glsl */ `in vec4 aW;`,
      body: /* glsl */ `
        void makeDab(inout Dab d) {
          vec4 r = hash4(aW.w);
          vec4 k = hash4(aW.w * 2.3 + 0.7);
          vec3 P = vec3(aW.x, 0.0, aW.z);
          if (calmAt(P.xz) < 0.3) { d.alive = 0.0; return; }
          vec3 toEye = cameraPosition - P;
          float dist = length(toEye);
          float graze = max(toEye.y / dist, 0.02);
          // the faintest ripple: a slow tilt of the mirror, more across than along
          vec2 w = (texture(tNoise, P.xz / 23.0 + uTime * vec2(0.004, 0.0025)).rg - 0.5);
          vec2 ripple = vec2(w.x * 0.012, w.y * 0.012) + (r.xy - 0.5) * vec2(0.004, 0.004);
          // smeared down the canvas: the reflection a little lower or higher along the stroke
          vec3 c = lagoonPaint(P, ripple, fract(r.z * 5.1), true);
          vec2 q = normalize(P.xz - cameraPosition.xz + 1e-4);
          d.dir = vec3(q.x, 0.0, q.y);
          // across: a little of the canvas; along: long enough to stand as a smear however low the eye
          float across = (0.35 + 0.5 * r.y) * (1.0 + dist * 0.012);
          float smear = 0.012 + 0.03 * k.y * k.y; // radians of the canvas
          d.size = vec2(across, clamp(smear * dist / graze, across * 1.5, 40.0));
          d.pos = P;
          d.c1 = mix(jitter(c, r.yzw, 0.06), hazed(c, P), 0.35);
          d.c2 = mix(c * 1.04 + vec3(0.01), hazed(c, P), 0.35);
          d.seed = aW.w;
          d.lie = 1.0;
          d.nrm = vec3(0.0, 1.0, 0.0);
          d.height = 0.01 + 0.04 * r.w;
          d.cell = k.z < 0.5 ? ${KNIFE}.0 : k.z < 0.8 ? ${KNIFE + 1}.0 : ${KNIFE + 5}.0;
        }`,
      uniforms: { uImpasto: { value: 0.35 } },
      minPx: [3, 6], maxPx: [600, 2400], cells: [KNIFE, 3],
    }), -5.5));
  }

  // --- the surf: a band of foam along every shore, thick at the rock and thinning seaward ---
  {
    const list = [];
    for (let j = -EXTENT; j < EXTENT; j++) {
      for (let i = -EXTENT; i < EXTENT; i++) {
        const s = shoreAt(i + 0.5, j + 0.5);
        if (s <= 0.05 || s > SURF.reach || coastAt(i + 0.5, j + 0.5)[2] > 0.2) continue;
        // packed at the rock, fewer out where only the breaking crests reach
        const want = s < 4 ? 1.6 : 1.2 * Math.exp(-(s - 4) / 6);
        for (let n = want + rand(); n >= 1; n--) list.push(i + rand(), 0, j + rand(), rand() * 1000);
      }
    }
    group.add(dabMesh(dabGeometry(list.length / 4, { aW: [new Float32Array(list), 4] }), dabMaterial(shared, {
      head: COAST + WATER + /* glsl */ `in vec4 aW;`, body: SURF_BODY, minPx: [4, 7], maxPx: [600, 600], cells: [KNIFE, 3],
    }), -4.9));
  }
  return { group };
}
