// The coast's palette at dusk, from the brand paintings (../brand/figma/page-type.png, the Shaders pages): the sun
// on the sea's rim in the west, ultramarine deepening overhead, tall cumulus banks over the lagoon in cream, peach and
// rose with lilac blue in their shade, and a lagoon a hand deep that gives all of it back. Whatever faces the low sun
// takes its long warm light; the rest is a cool blue violet; and lamps (places.js) turn what is near them toward its
// own colour in their warm light. Omnipair's product colours are kept for Omnipair's own things. Needs COMMON first.
import { rng } from '../world/noise.js';

/** How many lamps the painter knows (places.js fills them): uLamps[i] = position, strength. */
export const LAMPS = 32;

// The cloud banks as a union of billows in the sky's own measure (azimuth from north toward east, elevation, both
// in radians): towers of them standing over the lagoon to the east, a broken bank low along the horizon joining
// them, and a few small heaps higher up. Each billow is shaded as the front of a ball, so the banks read as solid
// forms lit from the sun's side, and the same billows are what the lagoon gives back.
function makeBillows() {
  const rand = rng(90210);
  const towers = [];
  const all = [];
  // a massif: billows filling the area under a heaped outline over a flat foot, big low in the middle and small along
  // the top, overlapping closely so the outline is lumpy rather than a row of balls
  const massif = (az, base, high, wide, scale = 1) => {
    const start = all.length;
    const bumps = Array.from({ length: 5 }, () => [(rand() - 0.5) * 1.6, 0.25 + 0.75 * rand(), 0.12 + 0.25 * rand()]);
    const outline = (u) => {
      let h = 0;
      for (const [c, a, w] of bumps) h = Math.max(h, a * Math.exp(-(((u - c) / w) ** 2)));
      return high * Math.max(0, Math.min(1, h * 1.1)) * Math.pow(Math.max(0, 1 - u * u), 0.35);
    };
    const rTop = 0.018 * scale, rLow = 0.05 * scale;
    for (let y = 0; y < high; ) {
      const f = y / high, r = rLow + (rTop - rLow) * Math.pow(f, 0.7);
      for (let u = -1; u <= 1; u += (r * 1.05) / (wide / 2)) {
        const top = outline(u);
        if (y > top - r * 0.5) continue;
        all.push([az + u * wide / 2 + (rand() - 0.5) * r * 0.6, base + y + (rand() - 0.5) * r * 0.4, r * (0.85 + 0.35 * rand()), rand()]);
      }
      y += r * 0.8;
    }
    // the cauliflower edge: small billows along the outline
    for (let u = -1; u <= 1; u += 0.025 + 0.02 * rand()) {
      const top = outline(u);
      if (top < 0.01) continue;
      const r = (0.012 + 0.016 * rand()) * scale * (0.6 + 0.6 * Math.min(1, top / 0.1));
      all.push([az + u * wide / 2, base + top - r * 0.5, r, rand()]);
    }
    const mine = all.slice(start);
    if (!mine.length) return;
    const lo = Math.min(...mine.map((b) => b[0] - b[2])), hi = Math.max(...mine.map((b) => b[0] + b[2]));
    towers.push([lo, hi, Math.max(...mine.map((b) => b[1] + b[2])), start, all.length - start, base, az, wide, high]);
  };
  // the great banks over the lagoon, east and south east of the headland, the tallest a little south of east
  for (const [az, high, wide] of [[0.62, 0.1, 0.42], [1.25, 0.2, 0.62], [1.95, 0.27, 0.7], [2.55, 0.14, 0.5]]) massif(az + (rand() - 0.5) * 0.05, 0.026 + 0.01 * rand(), high * (0.9 + 0.2 * rand()), wide);
  // small heaps higher in the blue
  for (const [az, el] of [[1.05, 0.36], [1.7, 0.47], [2.35, 0.36], [0.55, 0.28], [2.9, 0.3]]) massif(az, el, 0.035 + 0.03 * rand(), 0.12 + 0.06 * rand(), 0.45);
  return { towers, all };
}
export const BILLOWS = makeBillows();
/** The part of the sky the banks stand in, radians: what sky.js paints into its picture of them. */
export const SKY_BOX = {
  az0: Math.min(...BILLOWS.towers.map((t) => t[0])) - 0.06,
  az1: Math.max(...BILLOWS.towers.map((t) => t[1])) + 0.06,
  el1: Math.max(...BILLOWS.towers.map((t) => t[2])) + 0.04,
};
const f3 = (x) => x.toFixed(4);
const BILLOW_GLSL = /* glsl */ `
const int NB = ${BILLOWS.all.length};
const int NT = ${BILLOWS.towers.length};
const vec4 BILLOW[NB] = vec4[NB](${BILLOWS.all.map((b) => `vec4(${b.map(f3).join(', ')})`).join(', ')});
// a tower's reach: azimuth from, to, highest elevation, first billow; and how many, and its foot
const vec4 TOWER[NT] = vec4[NT](${BILLOWS.towers.map((t) => `vec4(${f3(t[0])}, ${f3(t[1])}, ${f3(t[2])}, ${t[3]}.0)`).join(', ')});
const vec2 TOWER2[NT] = vec2[NT](${BILLOWS.towers.map((t) => `vec2(${t[4]}.0, ${f3(t[5])})`).join(', ')});
// a massif's own middle and half its size: the large swell its billows sit on
const vec4 MASS[NT] = vec4[NT](${BILLOWS.towers.map((t) => `vec4(${f3(t[6])}, ${f3(t[5] + t[8] * 0.35)}, ${f3(t[7] * 0.5)}, ${f3(t[8] * 0.75)})`).join(', ')});
`;

export const COAST = /* glsl */ `
uniform sampler2D tCoast; // r sand, g lamplight, b calm water, a lane (land.js)
uniform vec4 uLamps[${LAMPS}];
vec4 coastAt(vec2 xz) { return texture(tCoast, landUv(xz)); }
// The lamps' light on the ground and on what stands there, baked by places.js into tCoast's green.
float lampGlow(vec3 P) { return max(abs(P.x), abs(P.z)) < uExtent ? texture(tCoast, landUv(P.xz)).g * smoothstep(9.0, 2.0, P.y - heightAt(P.xz)) : 0.0; }
// Paint in a lamp's light is a warm colour of its own, not the colour with orange added (that only greys it): the
// nearer the lamp, the more wholly a thing is its own colour in that light.
vec3 lampOn(vec3 c, vec3 own, vec3 P) {
  float k = clamp(lampGlow(P), 0.0, 1.0);
  float whole = k * k;
  vec3 warm = own * vec3(1.06, 0.8, 0.5) + vec3(0.06, 0.03, 0.0);
  return mix(c, warm, whole) + warm * 0.35 * k * (1.0 - whole);
}

// How lit a spot is for paint3: what faces the low sun is lit, what the cliffs shade is in shade. A lamp's pool
// lifts it toward the lit mix too.
float sunOn(vec3 P, vec3 Nn) {
  // the sun is on the horizon: level turf only grazes it and stays in half-tone; the warm light is on what turns
  // toward it, and what turns away is in shade
  float s = woodSunAt(P + Nn * 0.6 + vec3(0.0, 0.3, 0.0)) * clamp(dot(Nn, uSunDir) * 3.2 + 0.05, 0.0, 1.0);
  return max(s, lampGlow(P) * 0.8);
}
// Turf on the clifftop: gold and warm sage where the low sun lies along it, olive in half-tone, and in shade the dusk's
// blue violet over a deep green; kind moves it toward dry grass, gold in the light.
vec3 turfPaint(float x, float r, float kind) {
  float dry = smoothstep(0.55, 0.8, kind);
  float pick = fract(r * 9.1);
  // lit: the low sun's rim on the grass, ochre and apricot; half-tone: olive; shade: olive going lilac
  vec3 L = pick < 0.4 ? vec3(0.86, 0.64, 0.4) : pick < 0.75 ? vec3(0.74, 0.6, 0.36) : vec3(0.94, 0.7, 0.48);
  L = mix(L, vec3(0.94, 0.68, 0.42), dry);
  vec3 M = mix(pick < 0.4 ? vec3(0.38, 0.42, 0.27) : pick < 0.8 ? vec3(0.45, 0.45, 0.29) : vec3(0.47, 0.42, 0.4), vec3(0.56, 0.48, 0.34), dry);
  float sp = fract(r * 5.7);
  vec3 S = sp < 0.45 ? vec3(0.22, 0.27, 0.22) : sp < 0.8 ? vec3(0.27, 0.29, 0.3) : vec3(0.32, 0.29, 0.42);
  return paint3(L, M, S, x, r);
}
// How lit rock is. Rock wraps the low sun further round than turf, and a face turned away from it is kept in a warm
// half-tone rather than the shade, as the reference arch is painted against the light: only faces that look down,
// or that the sun reaches neither way, go to slate.
float rockOn(vec3 P, vec3 Nn) {
  float face = dot(Nn, uSunDir);
  float s = woodSunAt(P + Nn * 0.6 + vec3(0.0, 0.3, 0.0));
  float x = s * clamp(face * 1.8 + 0.55, 0.0, 1.0);
  float side = 0.46 * smoothstep(-0.4, 0.1, face) * mix(0.58, 1.0, s);
  float back = (0.3 + 0.08 * Nn.y) * (1.0 - 0.8 * max(-Nn.y, 0.0));
  return max(max(x, max(side, back)), lampGlow(P) * 0.8);
}
// Rock: burnt orange and ochre in the sun, a warm taupe or grey lilac half-tone, slate violet and blue grey in
// shade with a dark sienna now and then; kind moves it between a warm stone and a paler, chalkier one. Faces that
// look up at the sky take a little of its blue.
vec3 rockPaint(float x, float r, float kind, vec3 Nn) {
  float pale = smoothstep(0.45, 0.72, kind);
  float pick = fract(r * 13.7);
  vec3 L = pick < 0.4 ? vec3(0.9, 0.46, 0.22) : pick < 0.72 ? vec3(0.94, 0.62, 0.3) : pick < 0.9 ? vec3(0.94, 0.56, 0.48) : vec3(0.97, 0.78, 0.58);
  L = mix(L, vec3(0.96, 0.76, 0.58), pale * 0.5);
  float mp = fract(r * 7.9);
  vec3 M = mp < 0.4 ? vec3(0.64, 0.46, 0.42) : mp < 0.7 ? vec3(0.7, 0.42, 0.32) : vec3(0.52, 0.44, 0.58);
  M = mix(M, vec3(0.62, 0.56, 0.62), pale * 0.5);
  float sp = fract(r * 5.3);
  vec3 S = sp < 0.45 ? vec3(0.27, 0.24, 0.44) : sp < 0.85 ? vec3(0.24, 0.29, 0.46) : vec3(0.36, 0.23, 0.24);
  vec3 c = paint3(L, M, S, x, r);
  return c + vec3(0.02, 0.05, 0.14) * max(Nn.y, 0.0) * (1.0 - x);
}
// Wet rock and sand at the waterline: darker, and giving back the sky.
vec3 wetPaint(float x, float r) {
  return paint3(vec3(0.7, 0.6, 0.62), vec3(0.36, 0.38, 0.56), vec3(0.16, 0.18, 0.36), x, r);
}
// Sand: pale cream and peach where the low sun finds it, rose and buff in half-tone, lilac blue in shade, as the
// brand's sand bars are laid; wet sand near the water is darker and cooler and takes the sky.
vec3 sandPaint(float x, float r, float wet) {
  float pick = fract(r * 11.3);
  vec3 L = pick < 0.45 ? vec3(0.98, 0.84, 0.64) : pick < 0.8 ? vec3(0.97, 0.74, 0.54) : vec3(0.99, 0.66, 0.46);
  vec3 M = pick < 0.5 ? vec3(0.84, 0.66, 0.6) : vec3(0.78, 0.62, 0.64);
  // the beach lies in the headland's shade at dusk: keep that shade a warm rose lilac, not grey, so it reads as sand
  float sp = fract(r * 6.1);
  vec3 S = sp < 0.5 ? vec3(0.62, 0.52, 0.68) : sp < 0.85 ? vec3(0.54, 0.5, 0.7) : vec3(0.68, 0.52, 0.6);
  vec3 c = paint3(L, M, S, x, r);
  return mix(c, c * vec3(0.66, 0.72, 0.9), wet);
}
// The low bluffs of layered sandstone over the beach: cream and peach where the sun finds them, rose buff, lilac in
// shade, close in tone so the bluff reads as one body of rock.
vec3 bluffPaint(float x, float r) {
  float pick = fract(r * 9.7);
  vec3 L = pick < 0.6 ? vec3(0.97, 0.8, 0.6) : vec3(0.95, 0.68, 0.48);
  vec3 M = pick < 0.5 ? vec3(0.7, 0.56, 0.56) : vec3(0.64, 0.52, 0.58);
  vec3 S = pick < 0.5 ? vec3(0.38, 0.35, 0.52) : vec3(0.44, 0.36, 0.48);
  return paint3(L, M, S, x, r);
}
// The lanes down the meadow: trodden sand and earth.
vec3 lanePaint(float x, float r) {
  return paint3(vec3(0.92, 0.72, 0.5), vec3(0.62, 0.5, 0.48), vec3(0.32, 0.3, 0.44), x, r);
}
// Flowers in the turf: coral, salmon, a hot red now and then, and a pale apricot.
vec3 flowerPaint(float x, float r) {
  vec3 L = r < 0.4 ? vec3(0.98, 0.5, 0.38) : r < 0.75 ? vec3(0.98, 0.66, 0.58) : r < 0.9 ? vec3(0.92, 0.28, 0.16) : vec3(1.0, 0.84, 0.6);
  return paint3(L, L * vec3(0.72, 0.6, 0.72), L * vec3(0.42, 0.34, 0.56), x, fract(r * 7.0));
}

// Where the sun is painted in the sky: on the light's own bearing but sitting on the sea's rim.
vec3 skySun() { return normalize(vec3(uSunDir.x, 0.022 * length(uSunDir.xz), uSunDir.z)); }
// The sky with nothing in it: deep ultramarine overhead, cobalt lower, and at the horizon away from the sun the
// dusk's rose band over the blue grey of the earth's shadow; toward the sun apricot and gold, spreading wide.
// How far the sunset has spread at v, 0 to 1: half the sky on the sun's side, in broken diagonal banks with the blue
// showing between them, as ../brand/reference/4.webp lays it.
float sunsetAt(vec3 v) {
  vec3 sunDir = skySun();
  float ang = acos(clamp(dot(v, sunDir), -1.0, 1.0));
  float up = max(v.y, 0.0);
  float w = smoothstep(1.35, 0.2, ang + 0.85 * up);
  float az = atan(v.x, -v.z);
  float bank = texture(tNoise, vec2(az * 0.55 + up * 0.7, up * 1.6 - az * 0.12)).r;
  bank = smoothstep(0.4, 0.62, bank + 0.25 * w * w);
  return clamp(w * mix(0.12, 1.0, bank) + smoothstep(0.4, 0.08, ang) * 0.45, 0.0, 1.0);
}
// The sky with nothing in it: ultramarine overhead and cobalt lower away from the sun, a rose band over the blue grey
// of the earth's shadow at the horizon there; toward the sun the blue turns lilac, then peach, apricot and gold.
vec3 coastSky(vec3 v) {
  vec3 sunDir = skySun();
  float up = clamp(v.y, -0.2, 1.0);
  float toSun = max(dot(normalize(vec3(v.x, 0.0, v.z) + 1e-5), normalize(vec3(sunDir.x, 0.0, sunDir.z))), 0.0);
  float away = 1.0 - toSun;
  float sunward = max(dot(v, sunDir), 0.0);
  vec3 high = vec3(0.11, 0.21, 0.52);
  vec3 mid = vec3(0.24, 0.42, 0.75);
  vec3 low = vec3(0.47, 0.6, 0.84);
  vec3 c = mix(low, mid, smoothstep(0.0, 0.12, up));
  c = mix(c, high, smoothstep(0.15, 0.7, up));
  // the rose band, and under it the earth's shadow, on the side away from the sun
  float band = exp(-pow((up - 0.06) / 0.05, 2.0)) * smoothstep(0.35, 0.9, away);
  c = mix(c, vec3(0.88, 0.64, 0.68), band * 0.4);
  c = mix(c, vec3(0.46, 0.52, 0.78), smoothstep(0.025, 0.0, up) * smoothstep(0.4, 0.9, away) * 0.5);
  // the sunset: lilac at its edge, peach, apricot, gold by the sun
  // toward the sun the blue between the banks is lighter and cleaner
  c = mix(c, vec3(0.48, 0.64, 0.88), smoothstep(1.7, 0.6, acos(clamp(sunward, 0.0, 1.0))) * 0.65);
  float w = sunsetAt(v);
  vec3 warm = mix(vec3(0.5, 0.62, 0.86), vec3(0.72, 0.64, 0.8), smoothstep(0.15, 0.32, w));
  warm = mix(warm, vec3(0.94, 0.64, 0.56), smoothstep(0.3, 0.55, w));
  warm = mix(warm, vec3(0.97, 0.66, 0.46), smoothstep(0.6, 0.85, w));
  warm = mix(warm, vec3(1.0, 0.74, 0.46), smoothstep(0.92, 1.0, w));
  c = mix(c, warm, smoothstep(0.04, 0.25, w));
  c = mix(c, vec3(1.0, 0.82, 0.52), pow(toSun, 30.0) * exp(-pow(max(up, 0.0) / 0.04, 1.4)) * 0.7);
  c = mix(c, vec3(1.0, 0.88, 0.6), smoothstep(0.9975, 0.9995, sunward));
  c += vec3(0.22, 0.16, 0.05) * pow(sunward, 1200.0);
  return c;
}
${BILLOW_GLSL}
// The cloud at direction v: rgb its paint, a how much of it covers there (hard edged), and in sd how far (radians)
// the nearest edge of a billow is: negative inside. The banks drift slowly south.
vec4 cloudAt(vec3 v, out float sd) {
  sd = 1.0;
  if (v.y < 0.0) return vec4(0.0);
  float az = atan(v.x, -v.z) - uTime * 0.0004;
  float el = asin(clamp(v.y, -1.0, 1.0));
  float best = -1.0;
  vec3 n = vec3(0.0, 0.0, 1.0);
  float frac = 0.0, seed = 0.0, foot = 0.0, bulk = 0.0;
  vec3 big = vec3(0.0, 0.0, 1.0);
  float lump = texture(tNoise, vec2(az, el) * 9.0).r - 0.5;
  for (int t = 0; t < NT; t++) {
    vec4 T = TOWER[t];
    if (az < T.x - 0.01 || az > T.y + 0.01 || el > T.z + 0.01) continue;
    int s0 = int(T.w), cnt = int(TOWER2[t].x);
    for (int i = 0; i < cnt; i++) {
      vec4 B = BILLOW[s0 + i];
      // the low billows are squashed: a flat foot
      vec2 d = vec2((az - B.x) * cos(el), (el - B.y) * (el < B.y ? 1.5 : 1.0));
      float dist = length(d) + lump * 0.3 * B.z;
      sd = min(sd, dist - B.z);
      if (dist >= B.z) continue;
      // the front of a ball, a little nearer for the lower ones, so a billow lower down stands in front
      float hgt = sqrt(B.z * B.z - dist * dist) + (0.4 - B.y) * 0.02 + B.w * 0.004;
      if (hgt > best) {
        best = hgt; n = normalize(vec3(d, sqrt(B.z * B.z - dist * dist))); frac = clamp((el - TOWER2[t].y) / max(T.z - TOWER2[t].y, 0.02), 0.0, 1.0); seed = B.w; foot = TOWER2[t].y; bulk = T.z - foot;
        vec4 M = MASS[t];
        vec2 q = vec2((az - M.x) / M.z, (el - M.y) / M.w);
        big = normalize(vec3(q * 0.9, sqrt(max(0.05, 1.0 - dot(q, q) * 0.6))));
      }
    }
  }
  if (best < 0.0) return vec4(0.0);
  // lit from the sun's side and from in front: the sun is low behind the eye for the banks over the lagoon
  vec3 sunDir = skySun();
  float sunAz = atan(sunDir.x, -sunDir.z);
  float rel = az - sunAz;
  rel = mod(rel + 3.14159, 6.28318) - 3.14159;
  float behind = smoothstep(1.4, 0.4, abs(rel));
  vec3 L = normalize(vec3(-sign(rel) * 0.55, 0.32, mix(0.78, -0.5, behind)));
  n = normalize(mix(big, n, 0.4));
  float lam = dot(n, L);
  float lit = smoothstep(-0.05, 0.7, lam + 0.25 * frac - 0.15);
  // lit by a sun on the horizon: peach and apricot, gold only on the tops, never white
  float top = smoothstep(0.25, 0.95, frac * 0.7 + lam * 0.5);
  vec3 bright = mix(mix(vec3(0.92, 0.56, 0.52), vec3(0.96, 0.64, 0.5), seed), vec3(0.98, 0.7, 0.56), top);
  vec3 shade = mix(vec3(0.5, 0.48, 0.74), vec3(0.74, 0.54, 0.66), 0.2 + 0.5 * frac + 0.2 * seed);
  vec3 c = mix(shade, bright, lit);
  // the foot of a bank sits in its own shade, warm grey violet
  c = mix(c, vec3(0.62, 0.54, 0.68), smoothstep(0.035, 0.0, el - foot) * 0.5 * smoothstep(0.06, 0.15, bulk));
  // toward the sun: dark rose bodies with a burning edge
  vec3 back = mix(vec3(0.62, 0.42, 0.52), vec3(1.0, 0.78, 0.48), pow(1.0 - n.z, 2.0));
  c = mix(c, back, behind);
  // low and far, the air between
  c = mix(c, mix(coastSky(v), vec3(0.96, 0.74, 0.66), 0.4), smoothstep(0.08, 0.0, el) * 0.3);
  return vec4(c, 1.0);
}
vec4 cloudAt(vec3 v) { float sd; return cloudAt(v, sd); }
// The same banks read from the picture sky.js paints of them once (cloudAt is far too dear for every pixel):
// azimuth az0..az1 across, elevation 0..el1 up, as they stand at uTime 0.
uniform sampler2D tSky;
vec4 cloudPicture(vec3 v) {
  if (v.y < 0.0) return vec4(0.0);
  float u = (mod(atan(v.x, -v.z) - uTime * 0.0004 - ${SKY_BOX.az0.toFixed(4)} + 6.28318, 6.28318)) / ${(SKY_BOX.az1 - SKY_BOX.az0).toFixed(4)};
  float e = asin(clamp(v.y, 0.0, 1.0)) / ${SKY_BOX.el1.toFixed(4)};
  if (u > 1.0 || e > 1.0) return vec4(0.0);
  return texture(tSky, vec2(u, e));
}
// The sky with its clouds, as the dome and the knife's slabs paint it and the lagoon gives it back.
vec3 duskSky(vec3 v) {
  vec4 cl = cloudPicture(v); // its colour is already weighted by how much it covers, so its edges stay clean
  return coastSky(v) * (1.0 - cl.a) + cl.rgb;
}
`;
