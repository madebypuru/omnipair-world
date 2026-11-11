// The coast's palette, from the reference paintings: a palette-knife sunset. Ultramarine high in the sky going to
// cerulean, peach and apricot clouds, gold at the sun; cobalt sea with turquoise shallows and white foam; cliffs
// that are burnt orange and ochre where the sun strikes them and slate violet in their shade; a clifftop of sage
// and olive with coral flowers. Omnipair's product colours are kept for Omnipair's own things. Needs COMMON before it.
export const COAST = /* glsl */ `
// How lit a spot is for paint3: what faces the low sun is lit, what the cliffs shade is in shade.
float sunOn(vec3 P, vec3 Nn) {
  // the sun is so low that level turf only grazes it: anything not turned away from it still reads as lit
  return woodSunAt(P + Nn * 0.6 + vec3(0.0, 0.3, 0.0)) * clamp(dot(Nn, uSunDir) * 2.0 + 0.45, 0.0, 1.0);
}
// Turf on the clifftop: warm sage in the sun, olive in half-tone, deep olive and blue green in shade; kind moves it toward
// dry grass, gold in the light.
vec3 turfPaint(float x, float r, float kind) {
  float dry = smoothstep(0.55, 0.8, kind);
  float pick = fract(r * 9.1);
  vec3 L = pick < 0.4 ? vec3(0.6, 0.64, 0.4) : pick < 0.75 ? vec3(0.5, 0.56, 0.3) : vec3(0.72, 0.68, 0.4);
  L = mix(L, vec3(0.8, 0.66, 0.34), dry);
  vec3 M = mix(pick < 0.5 ? vec3(0.34, 0.42, 0.28) : vec3(0.42, 0.44, 0.26), vec3(0.54, 0.5, 0.28), dry);
  // shade is deep olive and blue green, never navy: the sky's blue only creeps into the coolest of it
  float sp = fract(r * 5.7);
  vec3 S = sp < 0.45 ? vec3(0.22, 0.28, 0.17) : sp < 0.85 ? vec3(0.14, 0.27, 0.25) : vec3(0.18, 0.24, 0.29);
  return paint3(L, M, S, x, r);
}
// How lit rock is. Rock wraps the low sun further round than turf, and a face turned away from it is kept in a warm
// half-tone rather than the shade, as the reference arch is painted against the light: only faces that look down,
// or that the sun reaches neither way, go to slate.
float rockOn(vec3 P, vec3 Nn) {
  float face = dot(Nn, uSunDir);
  float s = woodSunAt(P + Nn * 0.6 + vec3(0.0, 0.3, 0.0));
  float x = s * clamp(face * 1.8 + 0.55, 0.0, 1.0);
  float side = 0.5 * smoothstep(-0.4, 0.1, face) * mix(0.62, 1.0, s);
  float back = (0.34 + 0.08 * Nn.y) * (1.0 - 0.8 * max(-Nn.y, 0.0));
  return max(x, max(side, back));
}
// Rock: burnt orange and ochre in the sun, a warm taupe or grey lilac half-tone, slate violet and blue grey in
// shade with a dark sienna now and then; kind moves it between a warm stone and a paler, chalkier one. Faces that
// look up at the sky take a little of its blue.
vec3 rockPaint(float x, float r, float kind, vec3 Nn) {
  float pale = smoothstep(0.45, 0.72, kind);
  float pick = fract(r * 13.7);
  vec3 L = pick < 0.4 ? vec3(0.86, 0.46, 0.24) : pick < 0.72 ? vec3(0.9, 0.64, 0.32) : pick < 0.9 ? vec3(0.92, 0.58, 0.5) : vec3(0.96, 0.8, 0.62);
  L = mix(L, vec3(0.95, 0.78, 0.6), pale * 0.5);
  float mp = fract(r * 7.9);
  vec3 M = mp < 0.4 ? vec3(0.68, 0.5, 0.4) : mp < 0.7 ? vec3(0.72, 0.44, 0.3) : vec3(0.56, 0.46, 0.56);
  M = mix(M, vec3(0.66, 0.58, 0.6), pale * 0.5);
  float sp = fract(r * 5.3);
  vec3 S = sp < 0.45 ? vec3(0.28, 0.24, 0.42) : sp < 0.85 ? vec3(0.26, 0.31, 0.44) : vec3(0.38, 0.23, 0.2);
  vec3 c = paint3(L, M, S, x, r);
  return c + vec3(0.02, 0.06, 0.14) * max(Nn.y, 0.0) * (1.0 - x);
}
// Wet rock and sand at the waterline: darker, and giving back the sky.
vec3 wetPaint(float x, float r) {
  return paint3(vec3(0.62, 0.55, 0.55), vec3(0.3, 0.32, 0.45), vec3(0.12, 0.14, 0.28), x, r);
}
// Flowers in the turf: coral, salmon, a hot red now and then, and a pale apricot.
vec3 flowerPaint(float x, float r) {
  vec3 L = r < 0.4 ? vec3(0.98, 0.5, 0.38) : r < 0.75 ? vec3(0.98, 0.66, 0.58) : r < 0.9 ? vec3(0.92, 0.28, 0.16) : vec3(1.0, 0.84, 0.6);
  return paint3(L, L * vec3(0.78, 0.62, 0.68), L * vec3(0.45, 0.32, 0.5), x, fract(r * 7.0));
}

// Where the sun is painted in the sky: on the light's own bearing but lower, about 4 degrees up, so its gold sits
// on the horizon as in the references while the light (land.js SUN) stays high enough to keep the meadow lit.
vec3 skySun() { return normalize(vec3(uSunDir.x, 0.07 * length(uSunDir.xz), uSunDir.z)); }
// The sky: ultramarine overhead and away from the sun, cobalt and cerulean lower, lilac low on the side away from
// the sun. Warmth is kept to a low band near the sun and a small gold patch at the horizon under it: most of the
// sky stays blue, and the peach is carried by the cloud slabs (sky.js), not by the wash.
vec3 coastSky(vec3 v) {
  vec3 sunDir = skySun();
  float up = clamp(v.y, -0.2, 1.0);
  float toSun = max(dot(normalize(vec3(v.x, 0.0, v.z) + 1e-5), normalize(vec3(sunDir.x, 0.0, sunDir.z))), 0.0);
  float sunward = max(dot(v, sunDir), 0.0);
  vec3 high = vec3(0.13, 0.25, 0.58);
  vec3 mid = vec3(0.24, 0.44, 0.76);
  vec3 low = mix(vec3(0.58, 0.56, 0.82), vec3(0.95, 0.62, 0.52), smoothstep(0.88, 0.99, toSun));
  vec3 c = mix(low, mid, smoothstep(0.0, 0.05, up));
  c = mix(c, high, smoothstep(0.08, 0.36, up));
  // a narrow peach band along the horizon toward the sun
  c = mix(c, vec3(0.98, 0.64, 0.48), pow(toSun, 14.0) * exp(-pow((up - 0.015) / 0.04, 2.0)) * 0.85);
  // a small halo, wider than it is tall, through lilac into peach
  vec3 sq = vec3(1.0, 2.4, 1.0);
  float halo = smoothstep(0.98, 0.999, dot(normalize(v * sq), normalize(sunDir * sq)));
  c = mix(c, vec3(0.7, 0.6, 0.84), smoothstep(0.0, 0.4, halo) * 0.7);
  c = mix(c, vec3(0.98, 0.66, 0.5), smoothstep(0.4, 0.95, halo));
  // gold only right round the sun
  c = mix(c, vec3(1.0, 0.8, 0.46), smoothstep(0.9975, 0.9996, sunward));
  c += vec3(0.2, 0.16, 0.06) * pow(sunward, 1500.0);
  return c;
}
`;
