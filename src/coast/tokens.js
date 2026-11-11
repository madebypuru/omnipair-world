// The tokens in the world: about three hundred small discs of paint that bob and turn in the air, A cream and B
// near-black with a cream ring, each with a soft light round it so it reads from far off at dusk. They are laid by a
// seeded generator along lines worth riding: trails beside the way, arcs off the cliff edge, rings round the stacks'
// shallows, lines across the low east shore, and high ones that need a leap. Any one stretch is mostly one kind, so a
// rider has to roam, or trade, to make pairs.
//
// One dab mesh paints them all (and the strokes that burst from one picked up, and the stream of them poured into
// the Pool); one more adds their light. Where each is and when it was last picked up live in two small textures.
import * as THREE from 'three';
import { dabMaterial, dabGeometry, dabMesh } from '../oilpaint/dabs.js';
import { KNIFE } from '../oilpaint/brush.js';
import { heightAt, edgeX, wayX, START, POINT } from './land.js';
import { CREAM, INK, rgb } from './brand.js';
import { RULES, pickRadius } from './game.js';

const PER = 8; // strokes per token: two for its rim, three for each face
const BURSTS = 6, BURST_N = 12, STREAM_N = 32;
const vec = (c) => `vec3(${c.map((x) => x.toFixed(4)).join(', ')})`;

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// the stacks off the west cliff (as land.js stands them), for the rings round their shallows
const STACKS = [[edgeX(40) - 44, 40, 7], [edgeX(-10) - 34, -10, 5], [edgeX(-112) - 50, -112, 9]];

/** Where the tokens are: [{ x, y, z, kind: 'a' | 'b', line: 'way-3' }], from a seed. Heights follow the land as it is now. */
export function layTokens(seed = 4041) {
  const rand = seeded(seed);
  const out = [];
  const floor = (x, z) => Math.max(heightAt(x, z), 0);
  // which kind a stretch of coast leans to: alternating bands along the headland, crossed by a slower east-west swing
  const lean = (x, z) => 0.5 + 0.42 * Math.tanh(2.2 * (Math.sin(z / 85 + 0.9) + 0.45 * Math.sin(x / 70)));
  let lines = 0;
  const line = (pts, name) => {
    const id = `${name}-${lines++}`;
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, mz = pts.reduce((s, p) => s + p[2], 0) / pts.length;
    const kind = rand() < lean(mx, mz) ? 'a' : 'b';
    for (const [x, y, z] of pts) out.push({ x, y, z, kind: rand() < 0.12 ? (kind === 'a' ? 'b' : 'a') : kind, line: id });
  };
  // trails beside the way, weaving across it
  for (let z0 = START.z - 18; z0 > POINT.z + 30; z0 -= 34 + 14 * rand()) {
    const pts = [], side = rand() < 0.5 ? -1 : 1, n = 7 + Math.floor(5 * rand());
    for (let k = 0; k < n; k++) {
      const z = z0 - k * 3.2, x = wayX(z) + side * 3 * Math.sin(k / 2.2 + z0);
      pts.push([x, floor(x, z) + 1.1, z]);
    }
    line(pts, 'way');
  }
  // arcs off the cliff edge, out over the shelf and down
  for (const z of [262, 196, 128, 12, -64, -128]) {
    const pts = [], x0 = edgeX(z) + 3, y0 = floor(x0, z) + 1.5;
    for (let k = 0; k < 9; k++) {
      const t = k / 8, x = x0 - 30 * t, y1 = floor(x, z) + 1.4;
      pts.push([x, Math.max(y1, y0 + (y1 - y0) * t * t + 4.5 * Math.sin(Math.PI * t) * (1 - 0.5 * t)), z]);
    }
    line(pts, 'cliff');
  }
  // rings round the stacks, low over the water
  for (const [sx, sz, r] of STACKS) {
    const pts = [], n = 12, R = r * 2.3;
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; const x = sx + R * Math.cos(a), z = sz + R * Math.sin(a); pts.push([x, floor(x, z) + 1.0, z]); }
    line(pts.slice(0, 6), 'stack');
    line(pts.slice(6), 'stack');
  }
  // lines across the low east shore and its shallows: from the last of the turf out over the sand and the water
  for (let z = 270; z > -120; z -= 52 + 12 * rand()) {
    let x = wayX(z) + 60;
    while (x < wayX(z) + 320 && heightAt(x, z) > 2.5) x += 4;
    if (heightAt(x, z) > 2.5) continue;
    const pts = [];
    for (let k = 0; k < 9; k++, x += 4) {
      const zz = z + 6 * Math.sin(k / 3 + z);
      if (heightAt(x, zz) < -3) break;
      pts.push([x, floor(x, zz) + 1.0, zz]);
    }
    if (pts.length >= 4) line(pts, 'shore');
  }
  // arcs over the meadow's swells east of the way
  for (const z of [240, 150, 60, -30, -100]) {
    const pts = [], x0 = wayX(z) + 20 + 25 * rand();
    for (let k = 0; k < 7; k++) { const x = x0 + k * 3.5, t = k / 6; pts.push([x, floor(x, z) + 1.1 + 3.2 * Math.sin(Math.PI * t), z - k * 1.5]); }
    line(pts, 'meadow');
  }
  // high ones over the way: a leap or a glide
  for (let z = START.z - 40; z > POINT.z + 40; z -= 52) {
    const pts = [];
    for (let k = 0; k < 3; k++) { const zz = z - k * 2.6, x = wayX(zz) + 1.5; pts.push([x, floor(x, zz) + 5.2, zz]); }
    line(pts, 'high');
  }
  return out;
}

/**
 * The tokens as a thing in the world. shared: the painter's uniforms. update(dt, now, at, speed, onPick) picks up any
 * within reach of `at` (the middle of his body) and calls onPick(token) for each.
 */
export function createTokens(shared, { seed } = {}) {
  const list = layTokens(seed);
  const T = list.length;
  const where = new Float32Array(T * 4), picked = new Float32Array(T).fill(-1e6);
  list.forEach((t, i) => where.set([t.x, t.y, t.z, t.kind === 'a' ? 0 : 1], i * 4));
  const tWhere = new THREE.DataTexture(where, T, 1, THREE.RGBAFormat, THREE.FloatType);
  tWhere.needsUpdate = true;
  const tPicked = new THREE.DataTexture(picked, T, 1, THREE.RedFormat, THREE.FloatType);
  tPicked.needsUpdate = true;
  const uBurst = { value: Array.from({ length: BURSTS }, () => new THREE.Vector4(0, -1e4, 0, -1e6)) };
  const uBurstKind = { value: new Array(BURSTS).fill(0) };
  const uStream = { value: new THREE.Vector4(0, 0, 0, -1e6) };
  const uStreamTo = { value: new THREE.Vector3() };
  const uStreamN = { value: 0 };
  const uniforms = { tWhere: { value: tWhere }, tPicked: { value: tPicked }, uBurst, uBurstKind, uStream, uStreamTo, uStreamN };

  const head = /* glsl */ `
    uniform sampler2D tWhere; uniform sampler2D tPicked;
    const vec3 CREAM_ = ${vec(rgb(CREAM))}, INK_ = ${vec(rgb(INK))};
    // how whole token i is now: it shrinks away when picked and grows back RESPAWN seconds later
    float tokenAlive(int i) {
      float t = uTime - texelFetch(tPicked, ivec2(i, 0), 0).r;
      if (t >= ${RULES.RESPAWN.toFixed(1)}) return smoothstep(${RULES.RESPAWN.toFixed(1)}, ${(RULES.RESPAWN + 1).toFixed(1)}, t);
      return 1.0 - smoothstep(0.0, 0.18, t);
    }
    vec3 tokenAt(int i, out float kind) {
      vec4 w = texelFetch(tWhere, ivec2(i, 0), 0);
      kind = w.w;
      return w.xyz + vec3(0.0, 0.14 * sin(uTime * 2.1 + float(i) * 1.7), 0.0);
    }`;

  const paint = dabMesh(dabGeometry(T * PER + BURSTS * BURST_N + STREAM_N), dabMaterial(shared, {
    head: head + /* glsl */ `
      uniform vec4 uBurst[${BURSTS}]; uniform float uBurstKind[${BURSTS}];
      uniform vec4 uStream; uniform vec3 uStreamTo; uniform float uStreamN;`,
    body: /* glsl */ `
      void makeDab(inout Dab d) {
        float id = float(gl_InstanceID);
        vec4 r = hash4(id * 2.91 + 17.0);
        d.seed = id;
        if (id < ${T * PER}.0) {
          int i = int(id / ${PER}.0);
          float k = mod(id, ${PER}.0), kind;
          vec3 c = tokenAt(i, kind);
          d.alive = tokenAlive(i);
          // the disc stands up and turns about the vertical
          float turn = uTime * 1.5 + float(i) * 2.3;
          vec3 n = vec3(sin(turn), 0.0, cos(turn)), u = vec3(cos(turn), 0.0, -sin(turn)), up = vec3(0.0, 1.0, 0.0);
          d.lie = 1.0;
          d.nrm = n;
          d.pos = c;
          // read from far off: a disc grows a little with distance, as a painter would keep it a touch
          float grow = 1.0 + 1.2 * smoothstep(25.0, 110.0, distance(c, cameraPosition));
          if (k < 2.0) {
            // the rim: a wider disc behind, cream round B, warm gold round A
            float a = k * 1.571 + r.x * 0.5;
            d.dir = u * cos(a) + up * sin(a);
            d.size = vec2(0.84, 0.88) * grow;
            d.c1 = kind < 0.5 ? vec3(0.88, 0.74, 0.5) : CREAM_;
            d.c2 = kind < 0.5 ? vec3(0.95, 0.83, 0.62) : vec3(1.0, 0.93, 0.8);
          } else {
            // the face, on both sides of the rim: three strokes a side
            float a = (k - 2.0) * 1.047 + (r.x - 0.5) * 0.4;
            d.dir = u * cos(a) + up * sin(a);
            d.size = vec2(0.58, 0.62) * (0.92 + 0.12 * r.y) * grow;
            d.height = mod(k, 2.0) < 0.5 ? 0.025 : -0.025;
            d.c1 = kind < 0.5 ? CREAM_ * (0.95 + 0.05 * r.z) : INK_ + vec3(0.02, 0.018, 0.016) * r.z;
            d.c2 = kind < 0.5 ? vec3(1.0, 0.95, 0.86) : vec3(0.1, 0.09, 0.09);
          }
          d.cell = ${KNIFE + 4}.0;
          d.lift = 0.0;
          return;
        }
        float j = id - ${T * PER}.0;
        if (j < ${BURSTS * BURST_N}.0) {
          // strokes flung out from a token just picked up
          int b = int(j / ${BURST_N}.0);
          float t = (uTime - uBurst[b].w) / 0.55;
          d.alive = t < 0.0 || t > 1.0 ? 0.0 : 1.0 - t * t;
          vec3 o = normalize(vec3(r.x - 0.5, r.y * 0.9 - 0.2, r.z - 0.5) + 1e-4);
          d.pos = uBurst[b].xyz + o * (0.25 + 2.0 * (1.0 - (1.0 - t) * (1.0 - t)));
          d.dir = o;
          d.size = vec2(0.1, 0.36 + 0.2 * r.w);
          bool cream = uBurstKind[b] < 0.5 || r.w > 0.5;
          d.c1 = cream ? CREAM_ : INK_ + 0.03;
          d.c2 = cream ? vec3(1.0, 0.86, 0.62) : CREAM_ * 0.6;
          d.cell = ${KNIFE}.0 + floor(r.w * 3.0);
          d.lift = 0.2;
          return;
        }
        // the carry poured into the Pool: each pair a cream stroke and a dark one, one after another on an arc
        float s = j - ${BURSTS * BURST_N}.0;
        float t = (uTime - uStream.w - s * 0.035) / 0.9;
        d.alive = s >= uStreamN || t < 0.0 || t > 1.0 ? 0.0 : smoothstep(0.0, 0.1, t) * (1.0 - smoothstep(0.85, 1.0, t));
        float e = t * t * (3.0 - 2.0 * t);
        vec3 from = uStream.xyz + vec3((r.x - 0.5) * 0.8, 1.0 + (r.y - 0.5) * 0.6, (r.z - 0.5) * 0.8);
        d.pos = mix(from, uStreamTo, e) + vec3(0.0, 6.0 * sin(3.14159 * e), 0.0);
        d.dir = normalize(uStreamTo - from + vec3(0.0, 18.0 * cos(3.14159 * e), 0.0));
        d.size = vec2(0.24, 0.8);
        bool dark = mod(s, 2.0) > 0.5;
        d.c1 = dark ? INK_ + 0.02 : CREAM_;
        d.c2 = dark ? CREAM_ * 0.5 : vec3(1.0, 0.88, 0.66);
        d.lift = 0.3;
      }`,
    uniforms: { ...uniforms, uImpasto: { value: 0.35 } },
    minPx: [3, 5], maxPx: [300, 600], cells: [KNIFE, 3],
  }), 18);

  // their light: a wide soft halo and a small bright one round each, added to what is behind
  const LIGHT = 2;
  const glow = dabMesh(dabGeometry(T * LIGHT), dabMaterial(shared, {
    head,
    body: /* glsl */ `
      void makeDab(inout Dab d) {
        float id = float(gl_InstanceID);
        int i = int(id / ${LIGHT}.0);
        bool wide = mod(id, ${LIGHT}.0) < 0.5;
        vec4 r = hash4(id * 4.13 + 5.0);
        float kind;
        d.pos = tokenAt(i, kind);
        d.alive = tokenAlive(i);
        d.dir = normalize(vec3(r.x - 0.5, 1.0, r.z - 0.5));
        float far_ = smoothstep(15.0, 90.0, distance(d.pos, cameraPosition));
        d.size = (wide ? vec2(1.7, 2.1) : vec2(0.8, 0.95)) * (1.0 + 0.6 * far_);
        vec3 warm = vec3(1.0, 0.82, 0.58);
        d.c1 = warm * (wide ? 0.09 : 0.14) * (kind < 0.5 ? 1.0 : 0.7) * (0.85 + 0.15 * sin(uTime * 3.0 + float(i)));
        d.c2 = d.c1 * 1.2;
        d.seed = id;
        d.lift = 0.0;
      }`,
    uniforms: { ...uniforms, uImpasto: { value: 0.2 } },
    minPx: [4, 6], maxPx: [300, 600], cells: [0, 6],
  }), 22);
  glow.material.transparent = true;
  glow.material.blending = THREE.AdditiveBlending;
  glow.material.alphaToCoverage = false;
  glow.material.depthWrite = false;

  const group = new THREE.Group();
  group.add(paint, glow);
  let nextBurst = 0;
  const bob = (i, now) => 0.14 * Math.sin(now * 2.1 + i * 1.7);
  const here = (i, now) => !(now - picked[i] < RULES.RESPAWN);

  return {
    group, list, count: T,
    /** Picks up every token within reach of `at` (a point at his middle) at `speed` m/s; onPick(token, i) for each. */
    update(now, at, speed, onPick) {
      const reach = pickRadius(speed), r2 = reach * reach;
      let changed = false;
      for (let i = 0; i < T; i++) {
        const t = list[i];
        const dx = t.x - at.x, dz = t.z - at.z;
        if (dx * dx + dz * dz > r2 || !here(i, now)) continue;
        const dy = t.y + bob(i, now) - at.y;
        if (dx * dx + dy * dy + dz * dz > r2) continue;
        picked[i] = now;
        changed = true;
        const b = uBurst.value[nextBurst];
        b.set(t.x, t.y + bob(i, now), t.z, now);
        uBurstKind.value[nextBurst] = t.kind === 'a' ? 0 : 1;
        nextBurst = (nextBurst + 1) % BURSTS;
        onPick(t, i);
      }
      if (changed) tPicked.needsUpdate = true;
    },
    /** Pours `pairs` pairs from `from` into the point `to`, starting now. */
    pour(from, to, pairs, now) {
      uStream.value.set(from.x, from.y, from.z, now);
      uStreamTo.value.copy(to);
      uStreamN.value = Math.min(STREAM_N, pairs * 2);
    },
    /** Whether token i is there to be picked up. */
    here,
    /** The nearest token of a kind ('a', 'b' or null for either) that is there now. */
    nearest(x, z, kind, now) {
      let best = -1, bd = Infinity;
      for (let i = 0; i < T; i++) {
        if ((kind && list[i].kind !== kind) || !here(i, now)) continue;
        const d = (list[i].x - x) ** 2 + (list[i].z - z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      return best < 0 ? null : list[best];
    },
    /** Forgets every pick-up: all tokens back at once. */
    reset() { picked.fill(-1e6); tPicked.needsUpdate = true; },
  };
}
