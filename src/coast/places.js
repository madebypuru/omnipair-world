// The made things and the people of the coast, and the lamps that light them at dusk. Everything solid is painted
// with the kit (src/night/kit.js): its faces are the underpainting, and strokes lie on them along their grain.
//   the Pavilion   open, on stilts in the lagoon, lamps at its corners and a warm glow under its roof
//   the jetty      from the beach out to it, with boats afloat beside it and drawn up on the sand, a net rack, crates
//   the lamps      a post every 35 m along the way from START to POINT, and along the beach
//   the people     standing about in twos and threes, each in a coat of their own colour, swaying a little
// buildPlaces(shared) makes the pictures before the still world's shade is drawn (its `caster` belongs in it);
// createPlaces(ctx, built) puts them in the scene, gives the physics their colliders and the clock to the people.
import * as THREE from 'three';
import { createKit } from '../night/kit.js';
import { dabMaterial, dabGeometry, dabMesh } from '../oilpaint/dabs.js';
import { KNIFE } from '../oilpaint/brush.js';
import { COAST, LAMPS } from './paint.js';
import { heightAt, edgeX, wayX, beachX, setLamps, START, POINT, ARCH } from './land.js';
import { PRODUCTS } from './brand.js';

/** Where the pavilion stands in the lagoon, and its deck's height over the water. */
export const PAVILION = { x: 252, z: 26, deck: 1.1, half: 4.2 };
const JETTY = { x0: 171, x1: PAVILION.x - PAVILION.half, z: 25, deck: 1.0, half: 1.2 };

/** Named places, for the HUD's list and the map. */
export const HIGHLIGHTS = [
  { id: 'pavilion', name: 'The Pavilion', x: PAVILION.x, z: PAVILION.z },
  { id: 'jetty', name: 'The jetty', x: (JETTY.x0 + JETTY.x1) / 2, z: JETTY.z },
  { id: 'arch-view', name: 'Arch viewpoint', x: wayX(-40) - 6, z: -40, fx: ARCH.x, fz: ARCH.z },
  { id: 'point', name: 'The Point', x: POINT.x, z: POINT.z },
  ...PRODUCTS.map((p) => ({ id: p.key, name: p.name, x: wayX(p.z) + 3.6, z: p.z })),
];

/** The lamps: [x, y, z, strength], the flame's place. */
function lampSpots() {
  const list = [];
  for (let z = START.z - 10; z > POINT.z + 8; z -= 35) list.push({ kind: 'post', x: wayX(z) - 2.4, z, s: 0.7 });
  for (let z = -150; z <= 280; z += 62) list.push({ kind: 'post', x: beachX(z) - 16, z, s: 0.75 });
  const P = PAVILION, c = P.half - 0.45;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) list.push({ kind: 'hung', x: P.x + sx * c, z: P.z + sz * c, y: P.deck + 2.55, s: 0.42 });
  for (const x of [JETTY.x0 + 3, (JETTY.x0 + JETTY.x1) / 2]) list.push({ kind: 'post', x, z: JETTY.z - JETTY.half + 0.15, y0: JETTY.deck, s: 0.6 });
  for (const l of list) {
    if (l.y == null) l.y = (l.y0 ?? Math.max(0, heightAt(l.x, l.z))) + 3.1;
  }
  return list.slice(0, LAMPS);
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildPlaces(shared) {
  const lamps = lampSpots();
  setLamps(lamps.map((l) => [l.x, l.y, l.z, l.s]));
  const solid = [];
  const block = (x, y, z, hx, hy, hz, yaw = 0) => solid.push({ x, y, z, hx, hy, hz, yaw });

  const kit = createKit(shared, {
    seed: 6061, haze: true, order: 3, head: COAST, cells: [KNIFE, 6],
    palettes: {
      stone: { l: [0.98, 0.88, 0.74], m: [0.78, 0.68, 0.68], s: [0.46, 0.46, 0.64], own: [1.0, 0.9, 0.74] },
      deck: { l: [0.86, 0.6, 0.4], m: [0.58, 0.42, 0.38], s: [0.3, 0.26, 0.36], own: [0.9, 0.6, 0.36] },
      post: { l: [0.5, 0.36, 0.3], m: [0.32, 0.25, 0.27], s: [0.16, 0.15, 0.24], own: [0.6, 0.4, 0.26] },
      roof: { l: [0.74, 0.42, 0.34], m: [0.5, 0.32, 0.36], s: [0.26, 0.2, 0.32], own: [0.8, 0.46, 0.32] },
      soffit: { l: [0.82, 0.56, 0.44], m: [0.62, 0.44, 0.42], s: [0.42, 0.32, 0.38], own: [1.0, 0.7, 0.42] },
      iron: { l: [0.26, 0.24, 0.3], m: [0.16, 0.15, 0.2], s: [0.08, 0.08, 0.13], own: [0.4, 0.3, 0.24] },
      glass: { l: [1.0, 0.84, 0.5], glow: 2 },
      hullBlue: { l: [0.36, 0.56, 0.86], m: [0.24, 0.36, 0.64], s: [0.13, 0.18, 0.38], own: [0.5, 0.6, 0.8] },
      hullRed: { l: [0.92, 0.42, 0.3], m: [0.66, 0.3, 0.3], s: [0.34, 0.18, 0.28], own: [0.95, 0.46, 0.3] },
      hullCream: { l: [0.97, 0.9, 0.78], m: [0.74, 0.68, 0.7], s: [0.42, 0.42, 0.6], own: [1.0, 0.9, 0.74] },
      hullTeal: { l: [0.3, 0.7, 0.68], m: [0.2, 0.46, 0.52], s: [0.1, 0.22, 0.32], own: [0.4, 0.7, 0.6] },
      inner: { l: [0.7, 0.52, 0.38], m: [0.46, 0.34, 0.32], s: [0.22, 0.18, 0.26], own: [0.8, 0.56, 0.36] },
      net: { l: [0.56, 0.46, 0.5], m: [0.38, 0.32, 0.4], s: [0.2, 0.18, 0.28], own: [0.66, 0.5, 0.4] },
      crate: { l: [0.88, 0.68, 0.46], m: [0.6, 0.46, 0.42], s: [0.3, 0.26, 0.36], own: [0.92, 0.66, 0.4] },
    },
    light: /* glsl */ `
      vec3 kitPaint(vec3 P, vec3 Nn, int k, float tone, float r) {
        if (PAL_G[k] > 0.5) return PAL_L[k] * tone * 1.15;
        float x = rockOn(P, Nn);
        vec3 c = paint3(PAL_L[k], PAL_M[k], PAL_S[k], x, r) * tone;
        c += vec3(0.02, 0.04, 0.12) * max(Nn.y, 0.0) * (1.0 - x);
        return lampOn(c, PAL_O[k] * tone, P);
      }`,
  });

  // --- the Pavilion ---
  {
    const { x: px, z: pz, deck: dy, half: h } = PAVILION;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) kit.round(px + i * (h - 0.4), (dy - 0.12 - 0.6) / 2, pz + j * (h - 0.4), 0.16, dy - 0.12 + 0.6, 'post', { stroke: [0.1, 0.4] });
    kit.box(px, dy, pz, 2 * h, 0.26, 2 * h, 'deck', { grain: 'x', stroke: [0.22, 1.2] });
    // a low step of cream stone round the deck's edge, as the brand's pavilion stands on a plinth
    for (const [sx, sz, lx, lz] of [[0, -1, 2 * h, 0.3], [0, 1, 2 * h, 0.3], [-1, 0, 0.3, 2 * h - 0.6], [1, 0, 0.3, 2 * h - 0.6]]) {
      kit.box(px + sx * (h - 0.15), dy + 0.25, pz + sz * (h - 0.15), lx, 0.26, lz, 'stone', { grain: lx > lz ? 'x' : 'z', stroke: [0.14, 0.5] });
    }
    const col = 2.9;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
      if (sx === -1 && sz === 0) continue; // the way in from the jetty
      kit.box(px + sx * (h - 0.3), dy + 0.13 + col / 2, pz + sz * (h - 0.3), 0.38, col, 0.38, 'stone', { grain: 'y', stroke: [0.12, 0.5] });
      block(px + sx * (h - 0.3), dy + col / 2, pz + sz * (h - 0.3), 0.2, col / 2, 0.2);
    }
    const top = dy + 0.13 + col;
    for (const [sx, sz, lx, lz] of [[0, -1, 2 * h, 0.5], [0, 1, 2 * h, 0.5], [-1, 0, 0.5, 2 * h], [1, 0, 0.5, 2 * h]]) {
      kit.box(px + sx * (h - 0.3), top + 0.22, pz + sz * (h - 0.3), lx, 0.44, lz, 'stone', { grain: lx > lz ? 'x' : 'z', stroke: [0.14, 0.6] });
    }
    // the roof: four slopes to a point, with eaves out past the beam; under it, the glow
    const eave = h + 0.9, ey = top + 0.4, apex = V(px, ey + 2.3, pz);
    const corner = (sx, sz) => V(px + sx * eave, ey, pz + sz * eave);
    const sides = [[corner(-1, -1), corner(1, -1)], [corner(1, -1), corner(1, 1)], [corner(1, 1), corner(-1, 1)], [corner(-1, 1), corner(-1, -1)]];
    for (const [a, b] of sides) {
      kit.tri(b.toArray(), a.toArray(), apex.toArray(), 'roof', { stroke: [0.3, 1.1], grain: [apex.x - (a.x + b.x) / 2, apex.y - ey, apex.z - (a.z + b.z) / 2] });
      // its underside, seen from the deck and the water, warm with the lamps
      kit.tri(a.toArray(), b.toArray(), [apex.x, apex.y - 0.25, apex.z], 'soffit', { stroke: [0.3, 0.9], grain: [b.x - a.x, 0, b.z - a.z] });
      kit.quad([b.x, ey - 0.02, b.z], [a.x - b.x, 0, a.z - b.z], [0, 0.2, 0], 'roof', { stroke: [0.1, 0.6], grain: 'u' });
    }
    block(px, dy - 0.05, pz, h, 0.18, h);
    for (const l of lamps.filter((m) => m.kind === 'hung')) {
      kit.box(l.x, l.y, l.z, 0.24, 0.32, 0.24, 'glass', { stroke: [0.08, 0.12] });
      kit.box(l.x, l.y + 0.2, l.z, 0.3, 0.06, 0.3, 'iron', { stroke: [0.06, 0.1] });
      kit.round(l.x, (l.y + 0.23 + top) / 2, l.z, 0.015, top - l.y - 0.23, 'iron', { stroke: [0.02, 0.2], sides: 4 });
    }
  }

  // --- the jetty ---
  {
    const { x0, x1, z, deck, half } = JETTY, len = x1 - x0;
    kit.box((x0 + x1) / 2, deck - 0.1, z, len, 0.2, 2 * half, 'deck', { grain: 'x', stroke: [0.2, 1.4] });
    for (let x = x0 + 1; x < x1; x += 3.2) {
      for (const s of [-1, 1]) {
        const g = Math.min(0, heightAt(x, z + s * (half - 0.1))) - 0.5;
        kit.round(x, (deck - 0.2 + g) / 2, z + s * (half - 0.1), 0.12, deck - 0.2 - g, 'post', { stroke: [0.08, 0.3] });
      }
    }
    block((x0 + x1) / 2, deck - 0.1, z, len / 2, 0.12, half);
    // crates at its foot, and the net rack on the sand beside it
    const cx = x0 - 3, cz = z + 3.2;
    for (const [dx, dz, dy2, r] of [[0, 0, 0, 0.1], [0.85, 0.1, 0, -0.2], [0.4, 0.05, 0.72, 0.3], [-0.2, 1.0, 0, 0.6]]) {
      const gy = heightAt(cx + dx, cz + dz);
      kit.box(cx + dx, gy + dy2 + 0.35, cz + dz, 0.72, 0.7, 0.72, 'crate', { grain: 'x', rotY: r, stroke: [0.12, 0.4] });
      block(cx + dx, gy + dy2 + 0.35, cz + dz, 0.36, 0.35, 0.36, r);
    }
    const rx = x0 - 6, rz = z + 46;
    const ry = heightAt(rx, rz);
    for (const s of [-1, 1]) { kit.round(rx, ry + 1.05, rz + s * 2.2, 0.08, 2.1, 'post', { stroke: [0.06, 0.4] }); block(rx, ry + 1.05, rz + s * 2.2, 0.1, 1.05, 0.1); }
    kit.box(rx, ry + 2.05, rz, 0.12, 0.12, 4.8, 'post', { grain: 'z', stroke: [0.06, 0.4] });
    for (const s of [1, -1]) kit.quad([rx + 0.02 * s, ry + 0.5, rz - 2.0 * s], [0, 0, 4.0 * s], [0, 1.5, 0], 'net', { stroke: [0.12, 0.5], density: 1.4 });
  }

  // --- the boats: two afloat by the jetty, two drawn up on the sand ---
  {
    const hull = (L, B, D) => {
      const g = new THREE.BufferGeometry(), inner = new THREE.BufferGeometry();
      const out = [], inn = [];
      const N = 8;
      const sec = (t) => {
        const s = t * 2 - 1, w = (B / 2) * (s > 0 ? Math.sqrt(Math.max(0, 1 - s ** 2)) : 1 - 0.3 * s * s);
        const lift = 0.12 * s * s;
        const x = s * L / 2;
        return [V(x, D + lift, w), V(x, 0.28 * D + lift * 0.6, w * 0.8), V(x, lift * 0.4, 0), V(x, 0.28 * D + lift * 0.6, -w * 0.8), V(x, D + lift, -w)];
      };
      for (let i = 0; i < N; i++) {
        const a = sec(i / N), b = sec((i + 1) / N);
        for (let k = 0; k < 4; k++) {
          out.push(...a[k].toArray(), ...b[k + 1].toArray(), ...b[k].toArray(), ...a[k].toArray(), ...a[k + 1].toArray(), ...b[k + 1].toArray());
          inn.push(...a[k].toArray(), ...b[k].toArray(), ...b[k + 1].toArray(), ...a[k].toArray(), ...b[k + 1].toArray(), ...a[k + 1].toArray());
        }
      }
      // the transom
      const t = sec(0);
      for (let k = 1; k < 4; k++) out.push(...t[0].toArray(), ...t[k].toArray(), ...t[k + 1].toArray());
      g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
      inner.setAttribute('position', new THREE.Float32BufferAttribute(inn, 3));
      return [g, inner];
    };
    const boats = [
      { x: 222, z: 33, y: -0.18, yaw: 0.5, roll: 0.03, pal: 'hullBlue', L: 5.2 },
      { x: 236, z: 16, y: -0.18, yaw: -0.3, roll: -0.04, pal: 'hullRed', L: 4.4 },
      { x: 178, z: -4, y: null, yaw: 1.2, roll: 0.22, pal: 'hullCream', L: 4.8 },
      { x: 174, z: 62, y: null, yaw: 1.9, roll: -0.18, pal: 'hullTeal', L: 4.2 },
    ];
    for (const b of boats) {
      const y = b.y ?? heightAt(b.x, b.z) - 0.05;
      const m = new THREE.Matrix4().compose(V(b.x, y, b.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(b.roll, b.yaw, 0, 'YXZ')), V(1, 1, 1));
      const [outer, inner] = hull(b.L, b.L * 0.34, 0.72);
      kit.add(outer, m, b.pal, { grain: V(1, 0, 0).transformDirection(m), stroke: [0.14, 0.7] });
      kit.add(inner, m, 'inner', { grain: V(1, 0, 0).transformDirection(m), stroke: [0.12, 0.5] });
      // a thwart across the middle
      const th = V(0, 0.5, 0).applyMatrix4(m);
      kit.box(th.x, th.y, th.z, 0.26, 0.06, b.L * 0.3, 'inner', { rotY: b.yaw, stroke: [0.08, 0.3] });
      block(b.x, y + 0.4, b.z, b.L / 2, 0.45, b.L * 0.17, b.yaw);
    }
  }

  // --- the lamp posts ---
  for (const l of lamps.filter((m) => m.kind === 'post')) {
    const g = l.y - 3.1;
    kit.box(l.x, g + 0.12, l.z, 0.34, 0.24, 0.34, 'iron', { stroke: [0.08, 0.16] });
    kit.round(l.x, g + 1.45, l.z, 0.06, 2.5, 'iron', { stroke: [0.04, 0.4], sides: 6, top: 0.05 });
    kit.box(l.x, l.y, l.z, 0.26, 0.34, 0.26, 'glass', { stroke: [0.08, 0.14] });
    kit.box(l.x, l.y + 0.22, l.z, 0.36, 0.08, 0.36, 'iron', { stroke: [0.06, 0.12] });
    kit.box(l.x, l.y - 0.2, l.z, 0.3, 0.05, 0.3, 'iron', { stroke: [0.06, 0.12] });
    block(l.x, g + 1.6, l.z, 0.12, 1.6, 0.12);
  }

  const built = kit.build();
  const caster = new THREE.Mesh(built.under.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  caster.frustumCulled = false;

  // --- the lamps' light: strokes that add up instead of covering, round each flame and under the pavilion's roof ---
  const glows = [];
  lamps.forEach((l, i) => { for (let k = 0; k < 14; k++) glows.push(l.x, l.y, l.z, i * 100 + k); });
  for (let k = 0; k < 18; k++) glows.push(PAVILION.x + (k % 3 - 1) * 2.2, PAVILION.deck + 2.4, PAVILION.z + (Math.floor(k / 3) % 3 - 1) * 2.2, 9000 + k);
  const glow = dabMesh(dabGeometry(glows.length / 4, { aG: [new Float32Array(glows), 4] }), dabMaterial(shared, {
    head: /* glsl */ `in vec4 aG;`,
    body: /* glsl */ `
      void makeDab(inout Dab d) {
        float id = mod(aG.w, 100.0);
        vec4 r = hash4(aG.w * 7.3 + 2.0);
        bool room = aG.w >= 9000.0;
        bool flame = !room && id < 1.5;
        float flicker = 0.9 + 0.1 * sin(uTime * (5.0 + 7.0 * r.z) + r.w * 30.0);
        vec3 out_ = normalize(vec3(cos(r.x * TAU), (r.y - 0.45) * 1.4, sin(r.x * TAU)));
        d.pos = aG.xyz + (flame ? vec3(0.0) : out_ * (room ? 0.8 + 1.4 * r.z : 0.15 + 0.5 * r.z));
        d.dir = flame ? vec3(0.0, 1.0, 0.0) : out_;
        d.size = flame ? vec2(0.2, 0.28) : (room ? vec2(1.2, 2.0) : vec2(0.3, 0.6)) * (0.6 + 0.9 * r.w);
        vec3 warm = vec3(1.0, 0.66, 0.3);
        d.c1 = (flame ? vec3(1.0, 0.92, 0.66) * 0.7 : warm * (room ? 0.06 : 0.12) / (1.0 + 2.5 * r.z)) * flicker;
        d.c2 = d.c1 * 1.3;
        d.seed = aG.w;
        d.lift = 0.0;
      }`,
    uniforms: { uImpasto: { value: 0.2 } },
    minPx: [3, 5], maxPx: [260, 520], cells: [0, 6],
  }), 21);
  glow.material.transparent = true;
  glow.material.blending = THREE.AdditiveBlending;
  glow.material.alphaToCoverage = false;
  glow.material.depthWrite = false;

  // --- the people ---
  const people = [
    // at the pavilion, on the jetty, by the stones, on the cliff's edge watching the sun, by a boat on the sand
    [PAVILION.x - 1.2, PAVILION.z - 1.4, PAVILION.deck + 0.13, 0], [PAVILION.x + 0.4, PAVILION.z - 1.0, PAVILION.deck + 0.13, 1], [PAVILION.x + 1.6, PAVILION.z + 1.8, PAVILION.deck + 0.13, 2],
    [214, JETTY.z + 0.4, JETTY.deck, 3], [215.2, JETTY.z - 0.3, JETTY.deck, 4],
    [wayX(86) + 6.5, 87, null, 5], [wayX(86) + 7.3, 85.6, null, 6],
    [edgeX(132) + 2.6, 132, null, 7], [edgeX(134.2) + 2.4, 134.2, null, 0], [edgeX(136) + 2.8, 136.4, null, 2],
    [181, -1, null, 1],
  ].map(([x, z, y, coat], i) => ({ x, z, y: y ?? heightAt(x, z), coat, seed: i * 13.7 + 2.1 }));
  const COATS = [[0.86, 0.36, 0.26], [0.92, 0.7, 0.3], [0.2, 0.52, 0.56], [0.5, 0.3, 0.52], [0.94, 0.88, 0.76], [0.3, 0.42, 0.72], [0.66, 0.42, 0.3], [0.78, 0.5, 0.62]];
  // each part: x across the eye, y up from the feet, half sizes, which colour (0 coat, 1 trousers, 2 skin, 3 hat,
  // 4 shadow on the ground), and how far toward the eye it is laid
  const PARTS = [
    [0, 0, 0.42, 0.2, 4, 0],
    [-0.1, 0.44, 0.11, 0.46, 1, 0], [0.1, 0.44, 0.11, 0.46, 1, 0.01],
    [0, 1.04, 0.3, 0.44, 0, 0.03], [0.07, 1.14, 0.17, 0.32, 0, 0.04],
    [-0.31, 1.02, 0.09, 0.34, 0, 0.05], [0.31, 1.02, 0.09, 0.34, 0, 0.05],
    [0, 1.56, 0.11, 0.13, 2, 0.04],
    [0, 1.69, 0.24, 0.045, 3, 0.06], [0, 1.76, 0.13, 0.08, 3, 0.05],
  ];
  const fig = [], part = [];
  people.forEach((p, i) => {
    for (const q of PARTS) {
      if (q[4] === 3 && i % 4 === 3) continue; // a few go bareheaded
      fig.push(p.x, p.y, p.z, p.seed);
      part.push(q[0], q[1], q[2], q[3], q[4] + 10 * p.coat, q[5]);
    }
    block(p.x, p.y + 0.9, p.z, 0.28, 0.9, 0.28);
  });
  const figures = dabMesh(dabGeometry(fig.length / 4, { aF: [new Float32Array(fig), 4], aP: [new Float32Array(part.filter((_, k) => k % 6 < 4)), 4], aQ: [new Float32Array(part.filter((_, k) => k % 6 >= 4)), 2] }), dabMaterial(shared, {
    head: COAST + /* glsl */ `
      in vec4 aF; in vec4 aP; in vec2 aQ;
      const vec3 COAT[8] = vec3[8](${COATS.map((c) => `vec3(${c.join(', ')})`).join(', ')});`,
    body: /* glsl */ `
      void makeDab(inout Dab d) {
        vec3 foot = aF.xyz;
        vec4 r = hash4(aF.w);
        float what = mod(aQ.x, 10.0);
        int coat = int(floor(aQ.x / 10.0));
        vec3 toEye = cameraPosition - foot;
        float dist = length(toEye);
        d.alive = 1.0 - smoothstep(260.0, 320.0, dist);
        vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), toEye) + vec3(1e-4, 0.0, 0.0));
        vec3 eye = normalize(vec3(toEye.x, 0.0, toEye.z) + 1e-4);
        // standing at ease: a slow sway from the feet, each in their own time
        float sway = 0.022 * sin(uTime * (0.7 + 0.3 * r.x) + r.y * 20.0) + 0.012 * sin(uTime * 1.9 + r.z * 9.0);
        float y = aP.y;
        float x = aP.x + y * sway;
        // light: the low sun from its side, and the lamps
        float sun = woodSunAt(foot + vec3(0.0, 1.2, 0.0));
        float facing = dot(side * sign(aP.x + 1e-3), normalize(vec3(uSunDir.x, 0.0, uSunDir.z)));
        float lit = clamp(sun * (0.55 + 0.45 * facing) + lampGlow(foot + vec3(0.0, 1.0, 0.0)) * 0.7, 0.0, 1.0);
        vec3 c;
        if (what > 3.5) {
          // the shade at the feet, lying on the ground
          d.lie = 1.0; d.nrm = vec3(0.0, 1.0, 0.0); d.height = 0.02;
          d.pos = foot + vec3(0.0, 0.02, 0.0) - vec3(uSunDir.x, 0.0, uSunDir.z) * 0.5 * sun;
          d.dir = normalize(vec3(-uSunDir.x, 0.0, -uSunDir.z));
          d.size = vec2(aP.z * 2.0, 0.9 + 2.2 * sun);
          c = vec3(0.24, 0.24, 0.42);
          d.c1 = hazed(c, foot); d.c2 = d.c1;
          d.cell = ${KNIFE + 3}.0;
          d.seed = aF.w + 0.5;
          return;
        }
        vec3 own = what < 0.5 ? COAT[coat] : what < 1.5 ? vec3(0.28, 0.24, 0.3) : what < 2.5 ? vec3(0.92, 0.66, 0.52) : vec3(0.84, 0.7, 0.42);
        if (what > 2.5 && coat % 2 == 1) own = vec3(0.3, 0.22, 0.24);
        c = paint3(own, own * vec3(0.7, 0.66, 0.8), own * vec3(0.38, 0.4, 0.62), lit, r.w);
        c = lampOn(c, own, foot + vec3(0.0, y, 0.0));
        d.pos = foot + side * x + vec3(0.0, y, 0.0) + eye * aQ.y;
        d.dir = vec3(sway, 1.0, 0.0);
        d.size = vec2(aP.z, aP.w) * 2.0;
        d.c1 = hazed(jitter(c, r.yzw, 0.1), d.pos);
        d.c2 = hazed(c * 1.12, d.pos);
        d.cell = what > 1.5 && what < 2.5 ? ${KNIFE + 4}.0 : ${KNIFE + 3}.0;
        d.seed = aF.w + aP.y * 3.1 + aP.x;
        d.lift = 0.0;
        d.glaze = 0.0;
      }`,
    uniforms: { uImpasto: { value: 0.4 } },
    minPx: [1.5, 2.5], maxPx: [900, 1600], cells: [KNIFE, 6],
  }), 4);

  const group = new THREE.Group();
  group.add(built.group, glow, figures);
  return { group, caster, solid, lamps, people, counts: { places: built.count, people: people.length, lamps: lamps.length } };
}

/** The module (BRIEF.md, Contracts): adds the places to the scene and their colliders to the physics. */
export function createPlaces(ctx, built = buildPlaces(ctx.shared)) {
  const { scene, physics, RAPIER } = ctx;
  if (!built.group.parent) scene.add(built.group);
  for (const s of built.solid) {
    physics.createCollider(RAPIER.ColliderDesc.cuboid(s.hx, s.hy, s.hz).setTranslation(s.x, s.y, s.z).setRotation({ x: 0, y: Math.sin(s.yaw / 2), z: 0, w: Math.cos(s.yaw / 2) }));
  }
  return { solid: built.solid, highlights: HIGHLIGHTS, lamps: built.lamps, people: built.people, update() {} };
}
