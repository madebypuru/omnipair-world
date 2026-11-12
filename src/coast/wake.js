// What the board throws: touches of paint kept on the CPU, a few hundred at a time, each with its own short life.
//   wake    white and turquoise strokes lying on the water behind the board, widening and fading
//   spray   white flecks thrown up and out from the rail in a carve
//   dust    ochre and turf flecks off the ground
//   ring    a ring of strokes lying round where he lands, running outward
import * as THREE from 'three';
import { dabMaterial, dabGeometry, dabMesh } from '../oilpaint/dabs.js';

export const KIND = { wake: 0, spray: 1, dust: 2, ring: 3 };
const LIFE = [1.7, 0.7, 0.8, 0.9];

export function createWake(shared, count = 640) {
  const pos = new Float32Array(count * 3), dir = new Float32Array(count * 3), data = new Float32Array(count * 4);
  const vel = new Float32Array(count * 3), age = new Float32Array(count).fill(1e9), kind = new Uint8Array(count);
  const geometry = dabGeometry(count, { aPos: [pos, 3], aDir: [dir, 3], aData: [data, 4] }, true);
  const mesh = dabMesh(geometry, dabMaterial(shared, {
    // aData: seed, life left 0..1, kind, size
    head: /* glsl */ `in vec3 aPos; in vec3 aDir; in vec4 aData;`,
    body: /* glsl */ `
      void makeDab(inout Dab d) {
        float life = aData.y;
        if (life <= 0.0) { d.alive = 0.0; return; }
        vec4 r = hash4(aData.x);
        int k = int(aData.z + 0.5);
        float s = aData.w;
        vec3 c;
        d.pos = aPos;
        d.dir = aDir;
        d.seed = aData.x;
        if (k == 0 || k == 3) {
          // lying on the water: the newest white, then turquoise, then gone
          vec3 foam = vec3(0.97, 0.95, 0.9), teal = r.x < 0.5 ? vec3(0.34, 0.78, 0.8) : vec3(0.52, 0.86, 0.84);
          c = mix(teal, foam, smoothstep(0.45, 0.9, life) * (0.6 + 0.4 * r.y));
          d.lie = 1.0;
          d.nrm = vec3(0.0, 1.0, 0.0);
          d.height = 0.06 + 0.02 * r.z;
          d.size = vec2(0.16, 0.5) * s * (1.6 - 0.6 * life);
          d.alive = smoothstep(0.0, 0.35, life);
          d.cell = 8.0 + floor(r.w * 2.99);
        } else if (k == 1) {
          c = mix(vec3(0.62, 0.86, 0.88), vec3(0.98, 0.97, 0.93), r.x);
          d.size = vec2(0.07, 0.16) * s;
          d.alive = smoothstep(0.0, 0.3, life);
        } else {
          c = r.x < 0.5 ? vec3(0.78, 0.62, 0.38) : r.x < 0.8 ? vec3(0.55, 0.62, 0.3) : vec3(0.92, 0.8, 0.56);
          c *= 0.6 + 0.4 * sunAt(aPos);
          d.size = vec2(0.08, 0.13) * s;
          d.alive = smoothstep(0.0, 0.4, life);
        }
        d.c1 = hazed(c, aPos);
        d.c2 = d.c1 * 1.08;
      }`,
    minPx: [2, 3], maxPx: [60, 160], cells: [0, 8],
  }), 5);
  let next = 0;
  const emitted = { n: 0 };

  /** One touch: where, how it moves (m/s), the way it runs, its kind and size. */
  function emit(k, x, y, z, vx, vy, vz, dx, dz, size = 1, dy = 0) {
    const i = next; next = (next + 1) % count;
    pos.set([x, y, z], i * 3);
    vel.set([vx, vy, vz], i * 3);
    const l = Math.hypot(dx, dy, dz) || 1;
    dir.set([dx / l, dy / l, dz / l], i * 3);
    data.set([Math.random() * 1000, 1, k, size * (0.75 + 0.5 * Math.random())], i * 4);
    age[i] = 0;
    kind[i] = k;
    emitted.n++;
  }

  return {
    mesh,
    emit,
    emitted,
    /** surface(x, z): where a falling touch comes to rest. */
    update(dt, surface) {
      for (let i = 0; i < count; i++) {
        if (age[i] > 50) continue;
        const k = kind[i], life = LIFE[k];
        age[i] += dt;
        const left = 1 - age[i] / life;
        if (left <= 0) { data[i * 4 + 1] = 0; age[i] = 1e9; continue; }
        data[i * 4 + 1] = left;
        const j = i * 3;
        if (k === KIND.wake || k === KIND.ring) {
          const drag = Math.exp(-2.5 * dt);
          vel[j] *= drag; vel[j + 2] *= drag;
        } else {
          vel[j + 1] -= 9 * dt;
          const drag = Math.exp(-1.5 * dt);
          vel[j] *= drag; vel[j + 2] *= drag;
        }
        pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
        if ((k === KIND.spray || k === KIND.dust) && pos[j + 1] < surface(pos[j], pos[j + 2])) { pos[j + 1] = surface(pos[j], pos[j + 2]); vel[j] = vel[j + 1] = vel[j + 2] = 0; age[i] = Math.max(age[i], life * 0.7); }
      }
      geometry.attributes.aPos.needsUpdate = true;
      geometry.attributes.aDir.needsUpdate = true;
      geometry.attributes.aData.needsUpdate = true;
    },
  };
}
