// The sunset sky, laid with the knife: a wash, then broad flat slabs of its own colours over the whole of it,
// running in long diagonals the way the reference paintings lay them, then the clouds, peach and gold on the side
// toward the sun and lilac blue away from it, and the sun itself low over the sea.
import * as THREE from 'three';
import { COMMON } from '../oilpaint/common.js';
import { dabMaterial, dabGeometry, dabMesh } from '../oilpaint/dabs.js';
import { KNIFE } from '../oilpaint/brush.js';
import { rng } from '../world/noise.js';
import { COAST } from './paint.js';
import { SUN } from './land.js';

export function createSky(shared) {
  const group = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), new THREE.ShaderMaterial({
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
      void main() { outC = vec4(coastSky(normalize(vDir)) * 0.95, 1.0); }`,
  }));
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  group.add(dome);

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

  // --- the knife's slabs over the whole sky ---
  {
    const count = 2000;
    group.add(dabMesh(dabGeometry(count, { aDir: [dirsOver(count, -0.02, 1.0), 4] }), dabMaterial(shared, {
      head: COAST + /* glsl */ `in vec4 aDir;`,
      body: /* glsl */ `
        void makeDab(inout Dab d) {
          vec4 r = hash4(aDir.w);
          vec3 v = normalize(aDir.xyz);
          d.pos = cameraPosition + v * 800.0;
          // long diagonals: they fall toward the sun, as the reference skies are laid
          vec3 level = normalize(cross(vec3(0.0, 1.0, 0.0), v));
          float side = sign(dot(level, skySun()));
          // the sweep bends with height, so the slabs fan out in arcs over the dome instead of lying in rows
          vec4 k = hash4(aDir.w * 3.7 + 1.3);
          float fall = 0.15 + 0.55 * smoothstep(0.0, 0.8, v.y) + 0.7 * (r.x - 0.5);
          d.dir = normalize(level - vec3(0.0, side * fall, 0.0));
          d.spin = (k.x - 0.5) * 0.5;
          // a few broad slabs, many middling, and long thin drags among them
          d.size = vec2(30.0 + 150.0 * pow(r.y, 1.6), 1.0);
          d.size.y = d.size.x * (k.y < 0.25 ? 2.4 + 1.2 * k.z : 0.9 + 1.4 * r.z);
          // slabs, wedges, drags aside and long drags; no blobs or petals in the sky
          { float m = floor(k.w * 4.0); d.cell = m < 3.0 ? ${KNIFE}.0 + m : ${KNIFE + 5}.0; }
          // a long drag tapers or breaks up: a long strip with even sides would read as tape
          if (d.size.y > 2.2 * d.size.x) d.cell = k.w < 0.5 ? ${KNIFE + 1}.0 : ${KNIFE + 5}.0;
          // near the sun the slabs are small, so its gold stays a small patch instead of spreading over a big one
          d.size *= mix(0.5, 1.0, smoothstep(0.9985, 0.993, dot(v, skySun())));
          // each slab takes the sky a little off from where it lies: the knife drags colour from its neighbours
          vec3 c = coastSky(normalize(v + (r.wxy - 0.5) * vec3(0.12, 0.05, 0.12)));
          d.c1 = jitter(c, r.yzw, 0.22);
          d.c2 = jitter(c * 1.08 + vec3(0.02, 0.02, 0.03), r.wxy, 0.25);
          d.seed = aDir.w;
          d.lift = 0.0;
        }`,
      uniforms: { uImpasto: { value: 0.5 } },
      minPx: [16, 28], maxPx: [900, 1800], cells: [KNIFE, 6], depthTest: false, depthWrite: false,
    }), -9));
  }

  // --- the clouds ---
  // Scattered over the sky, a little thicker toward the sun; each is kept only where a slow drift of cloud is, and
  // the drifts are kept apart, so the clouds stand as separate groups with the blue between them.
  {
    const count = 3000;
    const dirs = new Float32Array(count * 4);
    let n = 0;
    while (n < count) {
      const a = rand() * Math.PI * 2, y = 0.02 + Math.pow(rand(), 1.6) * 0.75, r = Math.sqrt(1 - y * y);
      const v = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
      if (rand() > 0.6 + 0.4 * Math.max(0, v.dot(SUN))) continue;
      dirs.set([v.x, v.y, v.z, rand() * 1000], n++ * 4);
    }
    group.add(dabMesh(dabGeometry(count, { aDir: [dirs, 4] }), dabMaterial(shared, {
      head: COAST + /* glsl */ `in vec4 aDir;`,
      body: /* glsl */ `
        void makeDab(inout Dab d) {
          vec4 r = hash4(aDir.w);
          vec3 v = normalize(aDir.xyz);
          float az = atan(v.x, -v.z);
          // banks of cloud drift slowly along with the wind
          vec2 at = vec2(az * 0.8 + uTime * 0.0012, v.y * 3.2);
          float bank = texture(tNoise, at).r * 0.7 + texture(tNoise, at * 2.7 + 0.3).g * 0.3;
          float body = smoothstep(0.68, 0.76, bank + (r.x - 0.5) * 0.06);
          d.alive = body;
          if (body <= 0.0) return;
          d.pos = cameraPosition + v * 800.0;
          vec3 level = normalize(cross(vec3(0.0, 1.0, 0.0), v));
          float side = sign(dot(level, skySun()));
          vec4 k = hash4(aDir.w * 3.7 + 1.3);
          d.dir = normalize(level - vec3(0.0, side * (0.3 + 0.7 * (r.y - 0.5)), 0.0));
          d.spin = (k.x - 0.5) * 0.6;
          d.size = vec2(22.0 + 90.0 * pow(r.y, 1.5), 1.0) * mix(1.0, 0.7, v.y);
          d.size.y = d.size.x * (k.y < 0.3 ? 2.3 + 1.0 * k.z : 0.9 + 1.2 * r.z);
          // slabs, wedges, drags aside and long drags; no blobs or petals in the sky
          { float m = floor(k.w * 4.0); d.cell = m < 3.0 ? ${KNIFE}.0 + m : ${KNIFE + 5}.0; }
          // a long drag tapers or breaks up: a long strip with even sides would read as tape
          if (d.size.y > 2.2 * d.size.x) d.cell = k.w < 0.5 ? ${KNIFE + 1}.0 : ${KNIFE + 5}.0;
          // lit from below and from the side toward the sun: apricot and gold there, lilac blue on the far side
          float toSun = max(dot(normalize(vec3(v.x, 0.0, v.z)), normalize(vec3(skySun().x, 0.0, skySun().z))), 0.0);
          float lit = clamp(pow(toSun, 4.0) * 1.1 + (bank - 0.68) * 1.6 + (r.w - 0.5) * 0.3 - smoothstep(0.1, 0.4, v.y) * 0.5, 0.0, 1.0);
          vec3 cool = mix(vec3(0.4, 0.56, 0.86), vec3(0.62, 0.7, 0.9), r.z);
          // peach and apricot; gold only in the cloud right round the sun
          vec3 warm = mix(vec3(0.97, 0.6, 0.47), vec3(0.99, 0.7, 0.5), r.y);
          warm = mix(warm, vec3(1.0, 0.8, 0.5), smoothstep(0.99, 0.999, dot(v, skySun())) * 0.8);
          vec3 c = mix(cool, warm, smoothstep(0.25, 0.7, lit));
          // the undersides, away from the sun, go to a soft violet grey
          c = mix(c, vec3(0.58, 0.52, 0.78), (1.0 - lit) * smoothstep(0.62, 0.5, bank) * 0.6);
          d.c1 = jitter(c, r.yzw, 0.12);
          // wet into wet: the blade drags the sky beneath through the cloud's paint
          d.c2 = mix(jitter(c, r.wxy, 0.2), coastSky(normalize(v + (k.zxy - 0.5) * 0.05)), 0.4 + 0.25 * k.z);
          d.seed = aDir.w;
          d.lift = 0.0;
        }`,
      uniforms: { uImpasto: { value: 0.5 } },
      minPx: [12, 20], maxPx: [700, 1500], cells: [KNIFE, 6], depthTest: false, depthWrite: false,
    }), -8.5));
  }

  // --- the sun, low over the sea ---
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
          vec3 v = normalize(skySun() + (side * aS.x + up * aS.y) * 0.035 * aS.z);
          d.pos = cameraPosition + v * 800.0;
          d.dir = side;
          d.size = vec2(6.0 + 6.0 * r.y, 14.0 + 10.0 * r.z) * (1.0 - 0.5 * aS.z);
          vec3 c = mix(vec3(1.0, 0.97, 0.78), vec3(1.0, 0.8, 0.48), aS.z);
          d.c1 = c; d.c2 = mix(c, vec3(1.0), 0.3);
          d.seed = aS.w;
          d.lift = 0.0;
        }`,
      uniforms: { uImpasto: { value: 0.3 } },
      minPx: [4, 6], maxPx: [200, 300], cells: [KNIFE + 4, 1], depthTest: false, depthWrite: false,
    }), -8.2));
  }
  return { group };
}
