// Omnipair's things on the headland. Three stones beside the way, one for each product (Leverage, Lending, Trade),
// each painted as that product's app icon: a rounded tile in the product's gradient with its white glyph, standing on
// a near-black footing that carries Omnipair's symbol in cream, with a soft light round it in the product's colour.
// At the point stands the great mark, six metres of Omnipair's symbol, round which lies the Pool: a ring on the ground
// that a rider crosses to bank his pairs (play.js). The mark is near-black until the first deposit; then it turns cream
// and a column of the three product colours goes up from it, and each deposit makes it flare.
//
// On the way just past each stone stands its ring gate, upright, in the product's colour: riding through it is the
// product's power-up. A gate that is cooling is dimmed.
//
// Beside each stone stands its board, as on Bruno Simon's project boards: a near-black frame with a cream edge round a
// picture painted as the product's first slide (its gradient and glyph). E there browses the slides (boards.js).
//
// What has been found is kept here (and in localStorage, so a return visit remembers); a stone is found when its last
// slide is read. The brand itself (shapes, colours, words) is brand.js.
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { createKit } from '../night/kit.js';
import { dabMaterial, dabGeometry, dabMesh } from '../oilpaint/dabs.js';
import { KNIFE } from '../oilpaint/brush.js';
import { COAST } from './paint.js';
import { heightAt, wayX, POINT } from './land.js';
import { SYMBOL, PRODUCTS, GREAT, CREAM, INK, rgb } from './brand.js';

export { PRODUCTS, GREAT };

const NEAR = 4.5; // how close he must be to a stone's spot (between it and its board) for E to work
const KEY = 'omnipair-world.found.v2';
const LIT_KEY = 'omnipair-world.lit.v1';
const GATE_R = 2.6, GATE_PAST = 11, POOL_R = 12.5; // a gate's radius and how far north of its stone; the Pool's radius
const NEAR_GREAT = POOL_R; // anywhere in the Pool round it: where he stops after banking is where E opens its panel
const GATE_N = 44, POOL_N = 150; // strokes in each gate and in the Pool
const GREAT_W = 6.2; // the great mark across, metres: tall enough to find from the way, small enough to see past in the Pool
const N = PRODUCTS.length, G = N; // the stones are 0..N-1; the great mark is N
const vec = (c) => `vec3(${c.map((x) => x.toFixed(4)).join(', ')})`;
const RAMPS = PRODUCTS.flatMap((p) => p.ramp.map(rgb));

// the symbol's five arms in its own units (y down): from the hub out to the middle of each rounded end, and half
// their width. Strokes are laid along them, so each arm reads as a few runs of the knife.
const HUB = [68.3, 60];
const ARMS = [[[34, 13], 12], [[102.5, 13], 12], [[13, 79], 12], [[123.5, 79], 12], [[68.3, 121], 12.5]];

/** SVG paths (w by h, y down) as solid shapes in metres: `wide` across, centred, y up, front face toward +z at z = depth. */
function svgGeometry(paths, w, h, wide, depth) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${paths.map((d) => `<path d="${d}"/>`).join('')}</svg>`;
  const shapes = new SVGLoader().parse(svg).paths.flatMap((p) => p.toShapes(true));
  const g = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false, curveSegments: 8 });
  const s = wide / w;
  // y down to y up is a mirror; turning it half round about x as well (z to -z) keeps the faces outward
  g.translate(-w / 2, -h / 2, 0);
  g.scale(s, -s, -1);
  g.translate(0, 0, depth);
  return g;
}
const symbolGeometry = (wide, depth) => svgGeometry([SYMBOL.path], SYMBOL.w, SYMBOL.h, wide, depth);

/** A rounded square `size` across with corners like the app icon's, front face toward +z at z = depth. */
function tileGeometry(size, depth) {
  const r = size * (63.085 / 239.36), h = size / 2;
  const s = new THREE.Shape();
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h); s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r); s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(-h + r, h); s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, -h + r); s.quadraticCurveTo(-h, -h, -h + r, -h);
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 10 });
}

// the stone: a tile 1.9 m across on a footing; where its faces are, in the stone's own frame (x across, y up, +z out)
const TILE = 1.9, TILE_D = 0.36, FOOT = { w: 2.15, h: 1.05, d: 0.78 }, MARK_W = 0.46;
const TILE_Y = FOOT.h + 0.06 + TILE / 2; // the tile's middle
const FACE_Z = TILE_D / 2 + 0.06; // its front face, bevel included
// the board, in its own frame: a picture PIC wide (16:9) whose middle is PIC_Y up, in a frame BEZEL wide, on two posts;
// it stands BESIDE metres to the stone's land side, turned TURN toward the way
const PIC = 3.0, PIC_H = PIC * 9 / 16, PIC_Y = 2.3, BEZEL = 0.16, BOARD_D = 0.14, BESIDE = 3.9, TURN = -0.32;

export function createOmni(shared, { remember = true } = {}) {
  // where each stone stands: a few metres in from the way on the land side, facing back down the way he comes
  const stones = PRODUCTS.map((p, i) => {
    const z = p.z, x = wayX(z) + 3.6;
    const yaw = Math.atan2(wayX(z + 7) - x, 7);
    const y = Math.min(...[[-1.1, -0.4], [1.1, -0.4], [-1.1, 0.4], [1.1, 0.4]].map(([a, b]) => heightAt(x + a * Math.cos(yaw) + b * Math.sin(yaw), z - a * Math.sin(yaw) + b * Math.cos(yaw)))) - 0.2;
    return { ...p, i, x, y, z, yaw };
  });
  // each stone's board, and the spot between the two where E works
  const boards = stones.map((s) => {
    const c = Math.cos(s.yaw), n = Math.sin(s.yaw);
    const x = s.x + BESIDE * c - 0.4 * n, z = s.z - BESIDE * n - 0.4 * c, yaw = s.yaw + TURN;
    const y = Math.min(heightAt(x - 1.4 * Math.cos(yaw), z + 1.4 * Math.sin(yaw)), heightAt(x + 1.4 * Math.cos(yaw), z - 1.4 * Math.sin(yaw)), heightAt(x, z)) - 0.1;
    const top = Math.max(y, heightAt(x, z));
    return { i: s.i, x, y, z, yaw, cx: x + 0.08 * Math.sin(yaw), cy: top + PIC_Y, cz: z + 0.08 * Math.cos(yaw), spot: { x: (s.x + x) / 2 + 1.6 * Math.sin(s.yaw), z: (s.z + z) / 2 + 1.6 * Math.cos(s.yaw) } };
  });
  const gz = POINT.z, gx = POINT.x;
  const gYaw = Math.atan2(wayX(gz + 30) - gx, 30);
  const gy = heightAt(gx, gz);
  const great = { ...GREAT, i: G, x: gx, y: gy, z: gz, yaw: gYaw };
  const all = [...stones, great];

  shared.uOmni = { value: all.map(() => 0) }; // how lit each one is: the stones, then the great mark
  shared.uBeacon = { value: all.map(() => new THREE.Vector4()) };

  // palettes: the dark footings, then per product its tile and its glyph, then the cream symbol and the great mark
  const palettes = {
    stone: { l: [0.2, 0.18, 0.17], m: [0.09, 0.08, 0.075], s: [0.035, 0.03, 0.03] },
    plinth: { l: [0.26, 0.24, 0.23], m: [0.11, 0.1, 0.095], s: [0.04, 0.035, 0.035] },
  };
  PRODUCTS.forEach((p, i) => { palettes[`tile${i}`] = { l: rgb(p.ramp[2]), glow: 2 }; });
  PRODUCTS.forEach((p, i) => { palettes[`glyph${i}`] = { l: [1, 1, 1], glow: 2 }; });
  palettes.mark = { l: rgb(CREAM), glow: 2 };
  palettes.great = { l: rgb(CREAM), glow: 2 };
  PRODUCTS.forEach((p, i) => { palettes[`pic${i}`] = { l: rgb(p.ramp[2]), glow: 2 }; });
  palettes.edge = { l: rgb(CREAM), glow: 2 };
  const TILE0 = 2, GLYPH0 = 2 + N, MARK = 2 + 2 * N, PIC0 = MARK + 2, EDGE = PIC0 + N;

  const kit = createKit(shared, {
    seed: 7311, haze: true, order: 3,
    head: COAST + /* glsl */ `
      uniform float uOmni[${N + 1}];
      const vec3 RAMP[${4 * N}] = vec3[${4 * N}](${RAMPS.map(vec).join(', ')});
      const vec2 SPAN[${N}] = vec2[${N}](${stones.map((s) => `vec2(${(s.y + TILE_Y - TILE / 2).toFixed(3)}, ${(s.y + TILE_Y + TILE / 2).toFixed(3)})`).join(', ')});
      const vec2 PSPAN[${N}] = vec2[${N}](${boards.map((b) => `vec2(${(b.cy - PIC_H / 2).toFixed(3)}, ${(b.cy + PIC_H / 2).toFixed(3)})`).join(', ')});
      // the app icon's gradient: deep at the top, its own colour lower down, light at the foot
      vec3 ramp(int i, float t) {
        vec3 a = RAMP[i * 4], b = RAMP[i * 4 + 1], c = RAMP[i * 4 + 2], d = RAMP[i * 4 + 3];
        return t < 0.35 ? mix(a, b, t / 0.35) : t < 0.78 ? mix(b, c, (t - 0.35) / 0.43) : mix(c, mix(c, d, 0.7), (t - 0.78) / 0.22);
      }`,
    palettes,
    light: /* glsl */ `
      vec3 kitPaint(vec3 P, vec3 Nn, int k, float tone, float r) {
        float x = sunOn(P, Nn);
        vec3 dark = paint3(PAL_L[0], PAL_M[0], PAL_S[0], x, r) * tone;
        if (k < ${TILE0}) return paint3(PAL_L[k], PAL_M[k], PAL_S[k], x, r) * tone + vec3(0.01, 0.01, 0.02) * max(Nn.y, 0.0);
        if (k < ${MARK}) {
          int i = k < ${GLYPH0} ? k - ${TILE0} : k - ${GLYPH0};
          float lit = uOmni[i];
          float t = clamp((SPAN[i].y - P.y) / (SPAN[i].y - SPAN[i].x), 0.0, 1.0);
          // the glyph is white fading toward the tile's own light at its foot, as on the icon (laid flat, so it is
          // lifted past the underpainting's 0.82)
          if (k >= ${GLYPH0}) return mix(vec3(1.0), ramp(i, 1.0), 0.35 * t) * 1.2;
          return ramp(i, t) * tone * (0.8 + 0.12 * x) * (0.78 + 0.22 * lit) * (1.0 + 0.04 * sin(uTime * 2.2 + float(i) * 1.7));
        }
        vec3 cream = PAL_L[${MARK}] * min(tone, 1.04) * (0.95 + 0.15 * x);
        if (k == ${MARK} || k == ${EDGE}) return cream;
        // the great mark, lit, is cream paint that takes the sun: warm where it faces it, the sky's blue-grey where not
        vec3 lit = PAL_L[${MARK}] * min(tone, 1.04) * mix(vec3(0.62, 0.62, 0.7), vec3(1.0, 0.95, 0.88), x);
        if (k >= ${PIC0}) {
          // the board's picture: the product's first slide, its gradient field, lit a little by the sun
          int i = k - ${PIC0};
          float t = clamp((PSPAN[i].y - P.y) / (PSPAN[i].y - PSPAN[i].x), 0.0, 1.0);
          return ramp(i, t) * tone * (0.84 + 0.1 * x);
        }
        // the great mark is near-black stone until it is lit, then cream
        return mix(dark * 0.8, lit, smoothstep(0.0, 1.0, uOmni[${G}]));
      }`,
  });

  // strokes along the symbol's arms, on a face whose middle and turn are given by `m` (local x across, y up, +z out)
  const markStrokes = (m, wide, pal, z = 0) => {
    const s = wide / SYMBOL.w, rot = new THREE.Matrix3().setFromMatrix4(m);
    const nrm = new THREE.Vector3(0, 0, 1).applyMatrix3(rot).normalize();
    for (const [[tx, ty], hw] of ARMS) {
      const dx = tx - HUB[0], dy = ty - HUB[1], len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
      const run = new THREE.Vector3(ux, -uy, 0).applyMatrix3(rot).normalize();
      for (const row of [-0.55, 0, 0.55]) {
        for (let t = 6 + kit.rand() * 4; t < len + 1; t += 8 + kit.rand() * 2.5) {
          const at = Math.min(t, len);
          const x = HUB[0] + ux * at - uy * row * hw, y = HUB[1] + uy * at + ux * row * hw;
          const lit = row * (ux + uy) < 0 && kit.rand() < 0.55;
          const p = new THREE.Vector3((x - SYMBOL.w / 2) * s, -(y - SYMBOL.h / 2) * s, z).applyMatrix4(m);
          kit.stroke(p, nrm, run, hw * 0.95 * s, (12 + 5 * kit.rand()) * s, pal, lit ? 1.12 : 0.9 + 0.12 * kit.rand(), lit ? 0.004 : 0.002);
        }
      }
    }
  };
  const at = (m, x, y, z) => m.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z));

  const tile = tileGeometry(TILE, TILE_D);
  tile.translate(0, 0, -TILE_D / 2);
  const markOnFoot = symbolGeometry(MARK_W, 0.02);
  for (const s of stones) {
    const m = kit.place(s.x, s.y, s.z, s.yaw);
    kit.box(s.x, s.y + FOOT.h / 2, s.z, FOOT.w, FOOT.h, FOOT.d, 'stone', { rotY: s.yaw, grain: 'x', stroke: [0.12, 0.38] });
    kit.add(tile, at(m, 0, TILE_Y, 0), `tile${s.i}`, { grain: new THREE.Vector3(0, 1, 0), stroke: [0.16, 0.5], density: 1.2 });
    const glyph = svgGeometry(s.glyph.paths, s.glyph.w, s.glyph.h, TILE, 0.02);
    kit.add(glyph, at(m, 0, TILE_Y, FACE_Z + 0.004), `glyph${s.i}`, { density: 0 });
    const mm = at(m, 0, FOOT.h * 0.62, FOOT.d / 2 + 0.004);
    kit.add(markOnFoot, mm, 'mark', { density: 0 });
    markStrokes(mm, MARK_W, 'mark', 0.02);
    shared.uBeacon.value[s.i].set(s.x + 0.6 * Math.sin(s.yaw), s.y + TILE_Y, s.z + 0.6 * Math.cos(s.yaw), 1.3);
  }
  // the great mark: standing on its stem on a low plinth, facing back down the headland
  {
    const wide = GREAT_W, depth = 0.9, high = wide * SYMBOL.h / SYMBOL.w;
    const m = kit.place(gx, gy - 0.2, gz, gYaw);
    kit.box(gx, gy + 0.2, gz, 2.6, 0.8, 2.0, 'plinth', { rotY: gYaw, stroke: [0.3, 0.55] });
    const mm = at(m, 0, 0.6 + high / 2, -depth / 2);
    kit.add(symbolGeometry(wide, depth), mm, 'great', { density: 0 });
    markStrokes(mm, wide, 'great', depth);
    markStrokes(mm.clone().multiply(new THREE.Matrix4().makeRotationY(Math.PI)), wide, 'great', 0);
    shared.uBeacon.value[G].set(gx, gy + 1.2, gz, 3.2);
    great.top = gy + 0.6 + high;
  }
  // the boards: posts, a near-black frame, a cream edge round the picture, the picture with the glyph on it, and
  // four cream dots on the frame's foot for the slides
  for (const b of boards) {
    const m = kit.place(b.x, b.y, b.z, b.yaw), lift = b.cy - b.y;
    const fw = PIC + 2 * BEZEL, fh = PIC_H + 2 * BEZEL + 0.12;
    for (const side of [-1, 1]) kit.add(new THREE.BoxGeometry(0.14, lift - fh / 2 + 0.1, 0.14), at(m, side * (PIC / 2 - 0.25), (lift - fh / 2 + 0.1) / 2, -0.06), 'stone', { stroke: [0.05, 0.3], grain: new THREE.Vector3(0, 1, 0) });
    // the frame as four bars round the picture and a back behind it, so its strokes never cross the picture
    const bar = (w, h, x, y) => kit.add(new THREE.BoxGeometry(w, h, BOARD_D), at(m, x, y, 0), 'stone', { grain: new THREE.Vector3(w > h ? 1 : 0, w > h ? 0 : 1, 0), stroke: [0.06, 0.4] });
    bar(fw, BEZEL, 0, lift + PIC_H / 2 + BEZEL / 2);
    bar(fw, BEZEL + 0.12, 0, lift - PIC_H / 2 - (BEZEL + 0.12) / 2);
    for (const side of [-1, 1]) bar(BEZEL, PIC_H, side * (PIC / 2 + BEZEL / 2), lift);
    kit.add(new THREE.BoxGeometry(PIC, PIC_H, 0.04), at(m, 0, lift, -BOARD_D / 2 + 0.02), 'stone', { density: 0 });
    const lip = 0.035, ez = BOARD_D / 2 + 0.01;
    kit.add(new THREE.BoxGeometry(PIC + 2 * lip, lip, 0.02), at(m, 0, lift + PIC_H / 2 + lip / 2, ez), 'edge', { density: 0 });
    kit.add(new THREE.BoxGeometry(PIC + 2 * lip, lip, 0.02), at(m, 0, lift - PIC_H / 2 - lip / 2, ez), 'edge', { density: 0 });
    for (const side of [-1, 1]) kit.add(new THREE.BoxGeometry(lip, PIC_H, 0.02), at(m, side * (PIC / 2 + lip / 2), lift, ez), 'edge', { density: 0 });
    kit.add(new THREE.PlaneGeometry(PIC, PIC_H, 6, 4), at(m, 0, lift, ez), `pic${b.i}`, { grain: new THREE.Vector3(0, 1, 0), stroke: [0.12, 0.42], density: 1.1 });
    const glyph = svgGeometry(stones[b.i].glyph.paths, stones[b.i].glyph.w, stones[b.i].glyph.h, PIC_H * 1.15, 0.01);
    kit.add(glyph, at(m, 0, lift, ez + 0.012), `glyph${b.i}`, { density: 0 });
    for (let d = 0; d < 4; d++) kit.add(new THREE.CircleGeometry(d ? 0.035 : 0.05, 10), at(m, (d - 1.5) * 0.16, lift - PIC_H / 2 - BEZEL * 0.6, BOARD_D / 2 + 0.006), 'edge', { density: 0 });
  }
  const built = kit.build();
  const caster = new THREE.Mesh(built.under.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  caster.frustumCulled = false;

  // light that adds up: a soft halo round each stone in its product's colour, and the three together at the foot
  // of the great mark
  const HALO = 40, COLUMN = 240;
  const glow = dabMesh(dabGeometry((N + 1) * HALO), dabMaterial(shared, {
    head: /* glsl */ `uniform float uOmni[${N + 1}]; uniform vec4 uBeacon[${N + 1}];
      const vec3 GLOW[${N}] = vec3[${N}](${PRODUCTS.map((p) => vec(rgb(p.ramp[2]))).join(', ')});`,
    body: /* glsl */ `
      void makeDab(inout Dab d) {
        float id = float(gl_InstanceID);
        vec4 r = hash4(id * 5.17 + 3.0);
        int i = int(id / ${HALO}.0);
        vec4 b = uBeacon[i];
        float lvl = uOmni[i];
        vec3 c = i < ${N} ? GLOW[i] : GLOW[int(mod(id, ${N}.0))];
        float pulse = 0.7 + 0.3 * sin(uTime * 2.2 + float(i) * 1.7 + r.x * 1.2);
        vec3 o = normalize(vec3(r.x - 0.5, (r.y - 0.5) * (i < ${N} ? 1.4 : 0.5), r.z - 0.5) + 1e-4);
        float far_ = r.w * r.w;
        d.pos = b.xyz + o * b.w * (0.15 + 1.1 * far_);
        d.dir = o;
        d.size = vec2(0.5, 1.1) * b.w * (0.6 + 0.8 * r.z);
        d.c1 = c * 0.16 * pulse * lvl * (0.35 + far_) / (1.0 + 2.0 * far_);
        d.c2 = d.c1 * 1.3;
        d.seed = id;
        d.lift = 0.0;
      }`,
    uniforms: { uImpasto: { value: 0.25 } },
    minPx: [3, 5], maxPx: [500, 900], cells: [0, 6],
  }), 21);
  glow.material.transparent = true;
  glow.material.blending = THREE.AdditiveBlending;
  glow.material.alphaToCoverage = false;
  glow.material.depthWrite = false;
  // the column over the great mark, laid in paint rather than added as light (light added to a blue sky goes cyan):
  // long knife strokes in the three product colours, each going to its own light as it drifts up, with a little cream
  const column = dabMesh(dabGeometry(COLUMN), dabMaterial(shared, {
    head: /* glsl */ `uniform float uOmni[${N + 1}]; uniform vec4 uBeacon[${N + 1}]; uniform float uTop;
      const vec3 RAMP[${4 * N}] = vec3[${4 * N}](${RAMPS.map(vec).join(', ')});`,
    body: /* glsl */ `
      void makeDab(inout Dab d) {
        float id = float(gl_InstanceID);
        vec4 r = hash4(id * 7.31 + 11.0);
        float lvl = smoothstep(0.3, 1.0, uOmni[${G}]);
        float t = fract(r.x + uTime * (0.04 + 0.03 * r.y));
        float a = r.z * TAU, rad = 0.2 + 0.8 * sqrt(r.w);
        int k = int(mod(id, ${N}.0));
        d.alive = lvl * smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.45, 1.0, t));
        d.pos = vec3(uBeacon[${G}].x + cos(a) * rad * (1.0 - 0.4 * t), uTop + 1.5 + pow(t, 1.5) * 70.0, uBeacon[${G}].z + sin(a) * rad * (1.0 - 0.4 * t));
        d.dir = vec3((r.w - 0.5) * 0.08, 1.0, 0.0);
        float flare = max(uOmni[${G}] - 1.0, 0.0);
        d.size = vec2(0.3 + 0.35 * r.y, 3.0 + 6.0 * r.w) * (1.0 + 0.5 * flare);
        d.pos.xz += vec2(cos(a), sin(a)) * flare * 2.5 * (1.0 - t);
        vec3 base = RAMP[k * 4 + 2], light = RAMP[k * 4 + 3];
        vec3 c = mix(base, light, clamp(t * 1.3 + (r.y - 0.5) * 0.5, 0.0, 1.0));
        d.c1 = mix(c, ${vec(rgb(CREAM))}, 0.35 * step(0.85, r.w));
        d.c2 = mix(c, light, 0.5);
        d.seed = id;
        d.lift = 0.2;
      }`,
    uniforms: { uImpasto: { value: 0.5 }, uTop: { value: great.top } },
    minPx: [3, 6], maxPx: [500, 900], cells: [KNIFE, 4],
  }), 20);

  // the gates on the way just north of each stone, facing along it, and the Pool round the great mark
  const gates = stones.map((st) => {
    const z = st.z - GATE_PAST, x = wayX(z);
    const nx = wayX(z - 2) - wayX(z + 2), nz = -4, nl = Math.hypot(nx, nz);
    return { key: st.key, i: st.i, x, y: heightAt(x, z) + GATE_R + 0.25, z, nx: nx / nl, nz: nz / nl, r: GATE_R };
  });
  const pool = { x: gx, y: gy, z: gz, r: POOL_R };
  shared.uGate = { value: gates.map(() => 1) };
  shared.uFlare = { value: 0 };
  const rings = dabMesh(dabGeometry(N * GATE_N + POOL_N), dabMaterial(shared, {
    head: /* glsl */ `uniform float uGate[${N}]; uniform float uFlare; uniform float uOmni[${N + 1}];
      const vec3 RAMP[${4 * N}] = vec3[${4 * N}](${RAMPS.map(vec).join(', ')});
      const vec3 GC[${N}] = vec3[${N}](${gates.map((g) => vec([g.x, g.y, g.z])).join(', ')});
      const vec2 GN[${N}] = vec2[${N}](${gates.map((g) => `vec2(${g.nx.toFixed(4)}, ${g.nz.toFixed(4)})`).join(', ')});`,
    body: /* glsl */ `
      void makeDab(inout Dab d) {
        float id = float(gl_InstanceID);
        vec4 r = hash4(id * 3.71 + 9.0);
        d.seed = id;
        if (id < ${N * GATE_N}.0) {
          int i = int(id / ${GATE_N}.0);
          float k = mod(id, ${GATE_N}.0);
          float a = (k + 0.4 * r.x) / ${GATE_N}.0 * TAU;
          vec3 n = vec3(GN[i].x, 0.0, GN[i].y), u = normalize(cross(vec3(0.0, 1.0, 0.0), n));
          float rad = ${GATE_R.toFixed(2)} * (1.0 + (r.y - 0.5) * 0.08);
          d.pos = GC[i] + (u * cos(a) + vec3(0.0, sin(a), 0.0)) * rad + n * (r.z - 0.5) * 0.25;
          d.dir = -u * sin(a) + vec3(0.0, cos(a), 0.0);
          d.size = vec2(0.32 + 0.12 * r.w, 0.95 + 0.4 * r.x);
          float ready = uGate[i];
          // a bright run goes round the ring while it is ready
          float run = pow(0.5 + 0.5 * cos(a - uTime * 2.4 - float(i)), 10.0) * ready;
          vec3 c = mix(RAMP[i * 4 + 2], RAMP[i * 4 + 3], 0.25 * r.z + 0.6 * run);
          d.c1 = c * mix(0.42, 1.08, ready);
          d.c2 = mix(d.c1, RAMP[i * 4 + 3], 0.4);
          d.lift = 0.3;
          return;
        }
        float k = id - ${N * GATE_N}.0;
        float a = (k + 0.5 * r.x) / ${POOL_N}.0 * TAU;
        vec2 xz = vec2(${gx.toFixed(3)}, ${gz.toFixed(3)}) + vec2(cos(a), sin(a)) * ${POOL_R.toFixed(2)} * (1.0 + (r.y - 0.5) * 0.06);
        d.pos = vec3(xz.x, heightAt(xz), xz.y);
        // a band of paint laid on the turf round the mark, two strokes deep
        d.lie = 1.0;
        d.nrm = normalAt(xz);
        d.height = 0.06 + 0.02 * r.z;
        d.dir = vec3(-sin(a), 0.0, cos(a));
        d.size = vec2(0.45 + 0.2 * r.w, 1.2 + 0.5 * r.x);
        d.pos.xz += vec2(cos(a), sin(a)) * (mod(k, 2.0) - 0.5) * 0.6;
        // the three products' colours in turn round the ring, deep, a little cream in it; a light runs round
        int p = int(mod(floor(k / 2.0), 3.0));
        vec3 cream = ${vec(rgb(CREAM))};
        vec3 c = mix(RAMP[p * 4 + 1], RAMP[p * 4 + 2], 0.15 + 0.35 * r.z) * 0.9;
        c = mix(c, cream, step(0.9, r.w) * 0.5);
        float lit = max(uOmni[${G}], 0.35);
        float wave = pow(0.5 + 0.5 * cos(a * 3.0 - uTime * 1.6), 6.0);
        d.c1 = c * (0.62 + 0.25 * lit + 0.3 * wave) + uFlare * 0.2;
        d.c2 = mix(d.c1, cream, 0.3);
        d.glaze = 1.0;
      }`,
    uniforms: { uImpasto: { value: 0.45 } },
    minPx: [3, 6], maxPx: [400, 800], cells: [KNIFE, 4],
  }), 19);

  const group = new THREE.Group();
  group.add(built.group, glow, column, rings);

  // what has been found
  const found = stones.map(() => false);
  if (remember) {
    try { (JSON.parse(localStorage.getItem(KEY)) ?? []).forEach((v, i) => { if (i < N) found[i] = !!v; }); } catch { /* storage off: start fresh */ }
  }
  const save = () => { if (remember) try { localStorage.setItem(KEY, JSON.stringify(found)); } catch { /* storage off */ } };
  const allFound = () => found.every(Boolean);
  let kindled = false;
  if (remember) try { kindled = localStorage.getItem(LIT_KEY) === '1'; } catch { /* storage off */ }
  let greatLevel = kindled ? 1 : 0, flare = 0;

  // things to walk into: [x, y, z, half sizes, yaw]
  const solid = [
    ...stones.map((s) => ({ x: s.x, y: s.y + (FOOT.h + TILE + 0.12) / 2, z: s.z, hx: FOOT.w / 2, hy: (FOOT.h + TILE + 0.12) / 2, hz: FOOT.d / 2, yaw: s.yaw })),
    ...boards.map((b) => ({ x: b.x, y: b.cy - 0.2, z: b.z, hx: PIC / 2 + BEZEL, hy: (b.cy - b.y) / 2 + 0.6, hz: 0.1, yaw: b.yaw })),
    { x: gx, y: gy + 0.2, z: gz, hx: 1.3, hy: 0.6, hz: 1.0, yaw: gYaw },
    { x: gx, y: gy + 0.6 + GREAT_W * SYMBOL.h / SYMBOL.w / 2, z: gz, hx: GREAT_W / 2, hy: GREAT_W * SYMBOL.h / SYMBOL.w / 2, hz: 0.45, yaw: gYaw },
  ];

  // what other parts may listen for: on('browse', key) each time a board is opened or travelled to, on('read', key)
  // when a product's last slide is first read (it is found)
  const listeners = { browse: [], read: [] };
  const emit = (name, key) => { for (const fn of listeners[name]) fn(key); };

  return {
    group, caster, solid, stones, boards, great, gates, pool, found, counts: { omni: built.count },
    on(name, fn) { listeners[name].push(fn); return () => listeners[name].splice(listeners[name].indexOf(fn), 1); },
    emit,
    /** The one he is close enough to use (0..N-1 a stone, N the great mark once lit), or -1. */
    nearest(p) {
      let best = -1, bestD = Infinity;
      for (const b of all) {
        const s = b.i === G ? b : boards[b.i].spot;
        const d = Math.hypot(p.x - s.x, p.z - s.z);
        const reach = b.i === G ? (kindled ? NEAR_GREAT : 0) : NEAR;
        if (d < reach && d < bestD) { best = b.i; bestD = d; }
      }
      return best;
    },
    /** How far he is from beacon i, on the ground. */
    distance(i, p) { const b = all[i]; return Math.hypot(p.x - b.x, p.z - b.z); },
    /** How far he may walk from the great mark before its panel closes. */
    away: () => NEAR_GREAT + 1.5,
    /** Where to stand to use beacon i: for a stone, off the near side of its board, facing it; else before the mark. */
    stand(i) {
      if (i === G) return { x: gx + 7 * Math.sin(gYaw), z: gz + 7 * Math.cos(gYaw), fx: gx, fz: gz };
      const b = boards[i], c = Math.cos(b.yaw), n = Math.sin(b.yaw);
      return { x: b.x - 2.1 * c + 1.5 * n, z: b.z + 2.1 * n + 1.5 * c, fx: b.x, fz: b.z };
    },
    /** Stone i is found (its last slide read): its light is turned up for good. */
    visit(i) { if (i < N && !found[i]) { found[i] = true; save(); emit('read', PRODUCTS[i].key); } },
    allFound,
    lit: () => greatLevel,
    /** The first deposit lights the great mark, for good; each one makes it flare. */
    kindle() {
      flare = 1;
      if (kindled) return;
      kindled = true;
      if (remember) try { localStorage.setItem(LIT_KEY, '1'); } catch { /* storage off */ }
    },
    get kindled() { return kindled; },
    /** How ready gate i is again, 0 just used .. 1 ready. */
    gate(i, ready) { shared.uGate.value[i] = ready; },
    update(dt) {
      greatLevel += ((kindled ? 1 : 0) - greatLevel) * (1 - Math.exp(-dt / 1.2));
      flare *= Math.exp(-dt / 0.9);
      for (let i = 0; i < N; i++) shared.uOmni.value[i] = found[i] ? 1 : 0.42;
      shared.uOmni.value[G] = greatLevel + flare;
      shared.uFlare.value = flare;
    },
  };
}
