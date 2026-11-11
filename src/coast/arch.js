// The sea arch off the west cliff, as the brand's own picture of it (the last tile of the Figma Shaders page): one
// broad slab of warm orange and ochre rock standing in the sea, pierced by an opening in the exact shape of
// Omnipair's symbol. It is turned to face the clifftop path near z = -40, so from the way the low sun and the sky
// stand behind it and their glow shows through the symbol. Painted patch by patch with the knife: burnt orange,
// orange and ochre where the sun strikes, going to rose and slate violet in shade.
//
// Its own measure: x across the slab, y up from the sea, z out of its face toward the path.
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { createKit } from '../night/kit.js';
import { KNIFE } from '../oilpaint/brush.js';
import { noise } from '../world/noise.js';
import { COAST } from './paint.js';
import { ARCH, wayX } from './land.js';
import { SYMBOL } from './brand.js';

const OPEN = 22; // the opening's width in metres
const OPEN_Y = 36; // its middle, about the eye's height on the clifftop
const WIDE = 50, HIGH = 56, BASE = -6; // the slab: across at the sea, how high its top stands, and its foot under water
const DEEP = 5; // through the slab: thin enough that the symbol stays open seen a little from the side
const EDGE = 3.2, EDGE_NEAR = 0.9; // no triangle edge longer than these: far from the opening, and within NEAR of it,
const NEAR = 2.5; // so no stroke is big enough to reach across its edge
const FACING = { x: wayX(-40), z: -40 }; // where on the path it faces

/** The slab's outline, round the clock from the bottom left: wider at the sea, ragged at the sides and top. */
function outline() {
  const pts = [];
  const side = (y, s) => (WIDE / 2) * (1 - 0.22 * Math.pow((y - BASE) / (HIGH - BASE), 1.4)) + 2.6 * (noise(y / 9 + (s > 0 ? 3 : 9), 1.7) - 0.5) + 0.8 * (noise(y / 3, s * 4.4) - 0.5);
  const top = (x) => HIGH + 4 * (noise(x / 9, 6.1) - 0.5) + 2 * (noise(x / 3, 2.2) - 0.5) - 3 * Math.pow(Math.abs(x) / (WIDE / 2), 3);
  for (let y = BASE; y < HIGH - 6; y += 2.2) pts.push(new THREE.Vector2(side(y, 1), y));
  const tr = side(HIGH - 6, 1), tl = -side(HIGH - 6, -1);
  for (let x = tr; x > tl; x -= 2.4) pts.push(new THREE.Vector2(x, Math.min(top(x), HIGH - 6 + (tr - x) * 2.2, HIGH - 6 + (x - tl) * 2.2)));
  for (let y = HIGH - 6; y > BASE; y -= 2.2) pts.push(new THREE.Vector2(-side(y, -1), y));
  pts.push(new THREE.Vector2(-side(BASE, -1), BASE));
  return pts;
}

/** The symbol as hole outlines in the slab's measure: OPEN wide, its middle at OPEN_Y, y up. */
function symbolHoles() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SYMBOL.w} ${SYMBOL.h}"><path d="${SYMBOL.path}"/></svg>`;
  const s = OPEN / SYMBOL.w;
  return new SVGLoader().parse(svg).paths.flatMap((p) => p.toShapes(true)).map((shape) =>
    new THREE.Path(distinct(shape.getPoints(10).map((v) => new THREE.Vector2((v.x - SYMBOL.w / 2) * s, OPEN_Y - (v.y - SYMBOL.h / 2) * s)))));
}
/** A closed outline without repeated points (each curve's end is the next one's start): earcut fills a hole wrongly
 *  when it meets one. */
const distinct = (pts) => pts.filter((p, i) => p.distanceTo(pts[(i + 1) % pts.length]) > 1e-3);

/** Triangles (flat array, 9 numbers each) split along their longest edge until no edge is longer than `max(x, y)`. */
function subdivide(tris, maxAt) {
  const out = [];
  const stack = [];
  for (let i = 0; i < tris.length; i += 9) stack.push(tris.slice(i, i + 9));
  while (stack.length) {
    const t = stack.pop();
    const d = (a, b) => Math.hypot(t[a] - t[b], t[a + 1] - t[b + 1], t[a + 2] - t[b + 2]);
    const e = [d(0, 3), d(3, 6), d(6, 0)];
    const k = e.indexOf(Math.max(...e));
    if (e[k] <= maxAt((t[0] + t[3] + t[6]) / 3, (t[1] + t[4] + t[7]) / 3)) { out.push(...t); continue; }
    const [a, b, c] = [[0, 3, 6], [3, 6, 0], [6, 0, 3]][k];
    const m = [0, 1, 2].map((j) => (t[a + j] + t[b + j]) / 2);
    const P = (o) => [t[o], t[o + 1], t[o + 2]];
    stack.push([...P(a), ...m, ...P(c)], [...m, ...P(b), ...P(c)]);
  }
  return out;
}

export function createArch(shared) {
  const yaw = Math.atan2(FACING.x - ARCH.x, FACING.z - ARCH.z);
  const frame = new THREE.Matrix4().makeRotationY(yaw).setPosition(ARCH.x, 0, ARCH.z);
  const kit = createKit(shared, {
    seed: 4021, haze: true, order: 3, head: COAST, cells: [KNIFE, 6],
    palettes: {
      orange: { l: [0.98, 0.52, 0.16], m: [0.86, 0.44, 0.22], s: [0.56, 0.28, 0.32] },
      burnt: { l: [0.9, 0.42, 0.14], m: [0.74, 0.34, 0.2], s: [0.46, 0.24, 0.34] },
      ochre: { l: [0.97, 0.68, 0.3], m: [0.84, 0.54, 0.32], s: [0.52, 0.34, 0.42] },
      pale: { l: [0.99, 0.8, 0.56], m: [0.76, 0.62, 0.58], s: [0.42, 0.38, 0.54] },
      slate: { l: [0.82, 0.56, 0.42], m: [0.52, 0.44, 0.58], s: [0.26, 0.24, 0.42] },
    },
    light: /* glsl */ `
      vec3 kitPaint(vec3 P, vec3 Nn, int k, float tone, float r) {
        float x = rockOn(P, Nn);
        vec3 c = paint3(PAL_L[k], PAL_M[k], PAL_S[k], x, r) * tone;
        return c + vec3(0.02, 0.05, 0.13) * max(Nn.y, 0.0) * (1.0 - x);
      }`,
  });
  const rand = kit.rand;
  const pals = ['orange', 'orange', 'orange', 'orange', 'burnt', 'burnt', 'ochre', 'ochre'];

  // the slab with the symbol cut through it, centred on z = 0
  const shape = new THREE.Shape(distinct(outline()));
  const holes = symbolHoles();
  shape.holes.push(...holes);
  const rim = holes.flatMap((h) => h.getPoints());
  const nearRim = (x, y) => rim.some((p) => Math.abs(p.x - x) < NEAR && Math.abs(p.y - y) < NEAR);
  const slab = new THREE.ExtrudeGeometry(shape, { depth: DEEP, bevelEnabled: false, curveSegments: 10 });
  slab.translate(0, 0, -DEEP / 2);
  const tris = subdivide(Array.from(slab.attributes.position.array), (x, y) => (nearRim(x, y) ? EDGE_NEAR : EDGE));
  // weathering: the faces swell and sink a little, only in depth, so the opening keeps its exact outline
  const swell = (x, y) => 0.9 * (noise(x / 8 + 2.3, y / 8) - 0.5) + 0.45 * (noise(x / 2.7, y / 2.7 + 5.1) - 0.5);
  for (let i = 0; i < tris.length; i += 3) tris[i + 2] += swell(tris[i], tris[i + 1]) * (tris[i + 2] / (DEEP / 2));

  // patches: triangles grouped by where they lie on the slab and which way they face, a colour to each, so the
  // knife lays blocks rather than bands
  const patches = new Map();
  for (let i = 0; i < tris.length; i += 9) {
    const cx = (tris[i] + tris[i + 3] + tris[i + 6]) / 3, cy = (tris[i + 1] + tris[i + 4] + tris[i + 7]) / 3, cz = (tris[i + 2] + tris[i + 5] + tris[i + 8]) / 3;
    const face = Math.abs(cz) > DEEP / 2 - 1.2 ? Math.sign(cz) : 0;
    const key = face === 0 && nearRim(cx, cy) ? 'rim' : `${Math.floor(cx / 9 + noise(cy / 9, 1) * 0.8)},${Math.floor(cy / 7)},${face}`;
    if (!patches.has(key)) patches.set(key, []);
    patches.get(key).push(...tris.slice(i, i + 9));
  }
  const UP = new THREE.Vector3(0, 1, 0), ACROSS = new THREE.Vector3(1, 0.25, 0).normalize();
  for (const [key, positions] of patches) {
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    // the opening's own walls are seen edge on from the way: left unstroked, so nothing is drawn across the symbol
    if (key === 'rim') { kit.add(g, frame, 'burnt', { density: 0 }); continue; }
    const grain = (rand() < 0.65 ? UP : ACROSS).clone().transformDirection(frame);
    kit.add(g, frame, pals[Math.floor(rand() * pals.length)], { grain, stroke: [1.6, 3.4], density: 1.3, tone: 0.9 + 0.18 * rand() });
  }

  // boulders round its foot, broken from the same rock
  const lay = (positions, grain) => {
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    kit.add(g, frame, ['orange', 'burnt', 'ochre', 'pale', 'slate'][Math.floor(rand() * 5)], { free: true, grain: grain.clone().transformDirection(frame), stroke: [2.0, 3.6], density: 1.4, tone: 0.86 + 0.28 * rand() });
  };
  const boulders = [
    [new THREE.Vector3(-WIDE / 2 - 3, 0.5, 5), [6, 4, 5], 8.7],
    [new THREE.Vector3(WIDE / 2 + 2, 0.5, -4), [5, 3.5, 6], 2.2],
    [new THREE.Vector3(-WIDE / 4, 0, 7), [4, 3, 4], 6.6],
    [new THREE.Vector3(WIDE / 3, 0, -8), [3.5, 2.5, 3], 4.4],
  ];
  for (const [c, r, seed] of boulders) {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const v = new THREE.Vector3(), p = g.attributes.position;
    const moved = new Map();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
      if (!moved.has(key)) {
        const f = 1 + 0.4 * (noise(v.x * 1.4 + seed, v.y * 1.4 + v.z * 0.9) - 0.5);
        moved.set(key, [c.x + v.x * r[0] * f, c.y + v.y * r[1] * f, c.z + v.z * r[2] * f]);
      }
      p.setXYZ(i, ...moved.get(key));
    }
    for (let i = 0; i < p.count; i += 15) lay(Array.from(p.array.slice(i * 3, Math.min(p.count, i + 15) * 3)), new THREE.Vector3(rand() - 0.5, 1.4, rand() - 0.5).normalize());
  }

  const built = kit.build();
  // what the sun sees of it: the underpainting is the rock's whole surface, in world measure
  const caster = new THREE.Mesh(built.under.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  caster.frustumCulled = false;
  return { group: built.group, caster, yaw, opening: { y: OPEN_Y, wide: OPEN }, counts: { arch: built.count } };
}
