// The dusk sky, laid with the knife. The dome is the underpainting: the wash and, solid in it, the cumulus banks
// over the lagoon (paint.js cloudAt), so every cloud is a whole form before a stroke is laid. Then broad slabs of the
// sky's own colours over the blue, kept off the clouds and made smaller toward their edges so no slab crosses one;
// then strokes inside each billow that run round its swell; the sun on the sea's rim; and the first stars high in
// the east.
import * as THREE from 'three';
import { COMMON } from '../oilpaint/common.js';
import { dabMaterial, dabGeometry, dabMesh } from '../oilpaint/dabs.js';
import { KNIFE } from '../oilpaint/brush.js';
import { rng } from '../world/noise.js';
import { COAST, BILLOWS, SKY_BOX } from './paint.js';

const FAR = 800;

export function createSky(shared) {
  const group = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 20), new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: shared,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `
      ${COMMON}
      out vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0); }`,
    fragmentShader: /* glsl */ `
      ${COMMON}
      ${COAST}
      in vec3 vDir;
      layout(location = 0) out vec4 outC;
      void main() { outC = vec4(duskSky(normalize(vDir)) * 0.95, 1.0); }`,
  }));
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  group.add(dome);

  // The cloud banks are painted once into a picture (paint.js cloudPicture): the dome, the sea and the lagoon read it
  // instead of working every billow out for each pixel. It is done the first time the dome is drawn, with the
  // renderer that draws it.
  const picture = new THREE.WebGLRenderTarget(4096, 1024, { depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  if (shared.tSky) shared.tSky.value = picture.texture;
  const bake = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: shared,
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      ${COMMON}
      ${COAST}
      in vec2 vUv;
      layout(location = 0) out vec4 outC;
      void main() {
        // cloudAt takes the drift off the azimuth, so it is put on first: the picture is the banks at uTime 0
        float az = ${SKY_BOX.az0.toFixed(4)} + vUv.x * ${(SKY_BOX.az1 - SKY_BOX.az0).toFixed(4)} + uTime * 0.0004;
        float el = vUv.y * ${SKY_BOX.el1.toFixed(4)};
        vec4 cl = cloudAt(vec3(sin(az) * cos(el), sin(el), -cos(az) * cos(el)));
        outC = vec4(cl.rgb * cl.a, cl.a);
      }`,
  }));
  bake.frustumCulled = false;
  const bakeScene = new THREE.Scene().add(bake), bakeEye = new THREE.Camera();
  let painted = false;
  dome.onBeforeRender = (renderer) => {
    if (painted) return;
    painted = true;
    const was = renderer.getRenderTarget();
    renderer.setRenderTarget(picture);
    renderer.render(bakeScene, bakeEye);
    renderer.setRenderTarget(was);
  };

  const rand = rng(2024);
  // laid from the horizon up: a slab low in the sky reaches up a long way, so the higher ones go over it and the
  // warm low sky stays low
  const dirsOver = (count, lo, hi, bias = 1.3) => {
    const list = [];
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2, y = lo + Math.pow(rand(), bias) * (hi - lo), r = Math.sqrt(Math.max(0, 1 - y * y));
      list.push([Math.cos(a) * r, y, Math.sin(a) * r, rand() * 1000]);
    }
    list.sort((p, q) => p[1] - q[1]);
    return new Float32Array(list.flat());
  };

  // --- the knife's slabs over the blue ---
  {
    const count = 1900;
    group.add(dabMesh(dabGeometry(count, { aDir: [dirsOver(count, -0.02, 1.0), 4] }), dabMaterial(shared, {
      head: COAST + /* glsl */ `in vec4 aDir;`,
      body: /* glsl */ `
        void makeDab(inout Dab d) {
          vec4 r = hash4(aDir.w);
          vec3 v = normalize(aDir.xyz);
          float sd;
          cloudAt(v, sd);
          // the clouds have their own strokes: a slab is never laid over one, and shrinks as it nears one
          if (sd < 0.004) { d.alive = 0.0; return; }
          d.pos = cameraPosition + v * ${FAR}.0;
          vec3 level = normalize(cross(vec3(0.0, 1.0, 0.0), v));
          float side = sign(dot(level, skySun()));
          vec4 k = hash4(aDir.w * 3.7 + 1.3);
          // near the horizon they lie level, as a sunset is laid; higher up they fall in long diagonals
          float fall = (0.15 + 0.55 * smoothstep(0.0, 0.8, v.y) + 0.7 * (r.x - 0.5)) * smoothstep(0.03, 0.3, v.y);
          d.dir = normalize(level - vec3(0.0, side * fall, 0.0));
          // in the sunset's half they fan out from the sun, as the reference's slabs do
          float warm = sunsetAt(v);
          vec3 fromSun = normalize(v - skySun() * dot(v, skySun()) * 1.0 + 1e-4);
          vec3 fan = normalize(fromSun - v * dot(fromSun, v));
          d.dir = normalize(mix(d.dir, sign(dot(fan, d.dir) + 1e-4) * fan, smoothstep(0.15, 0.6, warm) * 0.3 * smoothstep(0.03, 0.2, v.y)));
          d.spin = (k.x - 0.5) * 0.5;
          d.size = vec2(26.0 + 100.0 * pow(r.y, 1.4), 1.0);
          d.size.y = d.size.x * (k.y < 0.25 ? 2.2 + 1.0 * k.z : 0.9 + 1.2 * r.z);
          float room = sd * ${FAR}.0 * 1.6;
          d.size *= min(1.0, room / max(d.size.y, 1.0));
          { float m = floor(k.w * 4.0); d.cell = m < 3.0 ? ${KNIFE}.0 + m : ${KNIFE + 5}.0; }
          if (d.size.y > 2.2 * d.size.x) d.cell = k.w < 0.5 ? ${KNIFE + 1}.0 : ${KNIFE + 5}.0;
          d.size *= mix(0.45, 1.0, smoothstep(0.9985, 0.993, dot(v, skySun())));
          d.size.x *= mix(0.45, 1.0, smoothstep(0.02, 0.2, v.y));
          vec3 c = coastSky(normalize(v + (r.wxy - 0.5) * vec3(0.08, 0.03, 0.08)));
          d.c1 = jitter(c, r.yzw, 0.16);
          d.c2 = jitter(c * 1.05 + vec3(0.02, 0.015, 0.02), r.wxy, 0.16);
          d.seed = aDir.w;
          d.lift = 0.0;
        }`,
      uniforms: { uImpasto: { value: 0.14 } },
      minPx: [10, 18], maxPx: [700, 1400], cells: [KNIFE, 6], depthTest: false, depthWrite: false,
    }), -9));
  }

  // --- the clouds: strokes inside every billow, back ones first, running round its swell ---
  {
    const list = [];
    BILLOWS.all.forEach(([az, el, r, seed], b) => {
      const n = Math.round(6 + 30 * (r / 0.03) ** 2);
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2, q = Math.sqrt(rand()) * r * 0.96;
        list.push([az + Math.cos(a) * q / Math.cos(el), el + Math.sin(a) * q, a, rand() * 1000, el, b]);
      }
    });
    // farther back (higher) billows first, so the lower ones, which stand in front, are laid over them
    list.sort((p, q) => q[4] - p[4] || q[5] - p[5]);
    const data = new Float32Array(list.flatMap((s) => s.slice(0, 4)));
    group.add(dabMesh(dabGeometry(list.length, { aC: [data, 4] }), dabMaterial(shared, {
      head: COAST + /* glsl */ `in vec4 aC;`,
      body: /* glsl */ `
        void makeDab(inout Dab d) {
          vec4 r = hash4(aC.w);
          vec4 k = hash4(aC.w * 3.7 + 1.3);
          float az = aC.x + uTime * 0.0004, el = aC.y;
          vec3 v = vec3(sin(az) * cos(el), sin(el), -cos(az) * cos(el));
          float sd;
          vec4 cl = cloudAt(v, sd);
          if (cl.a < 0.5) { d.alive = 0.0; return; }
          d.pos = cameraPosition + v * ${FAR}.0;
          // round the swell, now and then across it
          vec3 east = normalize(vec3(cos(az), 0.0, sin(az)));
          vec3 up = normalize(cross(east, v));
          float a = aC.z + 1.5708 + (r.x - 0.5) * 0.9 + (k.x < 0.2 ? 1.2 : 0.0);
          d.dir = normalize(east * cos(a) + up * sin(a));
          d.size = vec2(5.0 + 11.0 * r.y, 1.0);
          d.size.y = d.size.x * (1.2 + 1.4 * r.z);
          // never past the cloud's edge
          float room = max(-sd * ${FAR}.0 * 2.2, 3.0);
          d.size *= min(1.0, room / d.size.y);
          { float m = floor(k.w * 5.0); d.cell = m < 3.0 ? ${KNIFE}.0 + m : m < 4.0 ? ${KNIFE + 3}.0 : ${KNIFE + 6}.0; }
          d.c1 = jitter(cl.rgb, r.yzw, 0.12);
          d.c2 = mix(cl.rgb * 1.06 + vec3(0.03, 0.02, 0.0), vec3(1.0, 0.95, 0.86), 0.12 * k.z);
          d.seed = aC.w;
          d.lift = 0.0;
        }`,
      uniforms: { uImpasto: { value: 0.55 } },
      minPx: [5, 8], maxPx: [500, 900], cells: [KNIFE, 6], depthTest: false, depthWrite: false,
    }), -8.5));
  }

  // --- the sun, on the sea's rim ---
  {
    const count = 60;
    const data = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) data.set([(rand() - 0.5), (rand() - 0.5), rand(), rand() * 1000], i * 4);
    group.add(dabMesh(dabGeometry(count, { aS: [data, 4] }), dabMaterial(shared, {
      head: COAST + /* glsl */ `in vec4 aS;`,
      body: /* glsl */ `
        void makeDab(inout Dab d) {
          vec4 r = hash4(aS.w);
          vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), skySun()));
          vec3 up = cross(skySun(), side);
          vec3 v = normalize(skySun() + (side * aS.x + up * aS.y * 0.7) * 0.03 * aS.z);
          d.pos = cameraPosition + v * ${FAR}.0;
          d.dir = side;
          d.size = vec2(5.0 + 5.0 * r.y, 12.0 + 9.0 * r.z) * (1.0 - 0.5 * aS.z);
          vec3 c = mix(vec3(1.0, 0.95, 0.74), vec3(1.0, 0.72, 0.4), aS.z);
          d.c1 = c; d.c2 = mix(c, vec3(1.0), 0.3);
          d.seed = aS.w;
          d.lift = 0.0;
        }`,
      uniforms: { uImpasto: { value: 0.3 } },
      minPx: [4, 6], maxPx: [200, 300], cells: [KNIFE + 4, 1], depthTest: false, depthWrite: false,
    }), -8.2));
  }

  // --- the first stars: single touches high in the east, where the blue is deepest ---
  {
    const count = 70;
    const data = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const az = 0.1 + rand() * 2.9, el = 0.32 + Math.pow(rand(), 0.7) * 1.0;
      data.set([az, el, rand(), rand() * 1000], i * 4);
    }
    group.add(dabMesh(dabGeometry(count, { aS: [data, 4] }), dabMaterial(shared, {
      head: COAST + /* glsl */ `in vec4 aS;`,
      body: /* glsl */ `
        void makeDab(inout Dab d) {
          vec3 v = vec3(sin(aS.x) * cos(aS.y), sin(aS.y), -cos(aS.x) * cos(aS.y));
          if (cloudAt(v).a > 0.5) { d.alive = 0.0; return; }
          d.pos = cameraPosition + v * ${FAR}.0;
          d.dir = vec3(0.0, 1.0, 0.0);
          d.size = vec2(1.2 + 1.4 * aS.z * aS.z);
          float tw = 0.85 + 0.15 * sin(uTime * (1.3 + aS.z * 2.0) + aS.w);
          vec3 c = mix(vec3(0.82, 0.86, 1.0), vec3(1.0, 0.92, 0.78), fract(aS.w * 3.1)) * tw;
          d.c1 = c; d.c2 = c;
          d.seed = aS.w;
          d.lift = 0.0;
          d.cell = ${KNIFE + 4}.0;
        }`,
      uniforms: { uImpasto: { value: 0.0 } },
      minPx: [2.2, 2.2], maxPx: [5, 5], cells: [KNIFE + 4, 1], depthTest: false, depthWrite: false,
    }), -8.4));
  }
  return { group };
}
