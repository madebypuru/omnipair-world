// Colour ordered dither, the last thing laid on the picture (brand/dither.md): Bayer 8x8, size 2, 7 levels per
// channel, brightness 1.1, contrast 1.18. Bayer 16x16 (uDitherMatrix 16, the brand's Shaders page) is the other
// choice. Plain GLSL with no textures and no integer ops, so it drops into any fragment shader, p5.js included:
// paste DITHER above main() and call `col = dither(col, gl_FragCoord.xy);`.
// Colours are display values in 0..1; size is in buffer pixels (gl_FragCoord), so at a pixel ratio of 1 a size of
// 2 is a 2x2 block of screen pixels.
export const DITHER = /* glsl */ `
  uniform float uDither;           // 0 off, 1 on
  uniform float uDitherMatrix;     // 8: Bayer 8x8, 16: Bayer 16x16
  uniform float uDitherSize;       // buffer pixels per threshold cell
  uniform float uDitherLevels;     // tones per channel
  uniform float uDitherBrightness; // multiplier
  uniform float uDitherContrast;   // about mid grey
  uniform float uDitherMono;       // 1: one ink, uDitherMonoColor, on white
  uniform vec3 uDitherMonoColor;

  float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
  float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
  float bayer16(vec2 a) { return bayer8(0.5 * a) * 0.25 + bayer2(a); }

  vec3 dither(vec3 col, vec2 fragCoord) {
    if (uDither <= 0.0) return col;
    col = clamp((col * uDitherBrightness - 0.5) * uDitherContrast + 0.5, 0.0, 1.0);
    vec2 cell = floor(fragCoord / max(uDitherSize, 1.0));
    float t = uDitherMatrix > 8.0 ? bayer16(cell) + 0.5 / 256.0 : bayer8(cell) + 0.5 / 64.0;
    float steps = max(uDitherLevels - 1.0, 1.0);
    if (uDitherMono > 0.0) {
      float ink = floor(dot(col, vec3(0.2126, 0.7152, 0.0722)) * steps + t) / steps;
      return mix(uDitherMonoColor, vec3(1.0), ink);
    }
    return floor(col * steps + t) / steps;
  }`;

// ?dither=0 turns it off; ?dmatrix=16, ?dsize=, ?dlevels=, ?dbright= and ?dcontrast= override the matrix, size,
// levels, brightness and contrast
export function ditherUniforms(search = globalThis.location?.search ?? '') {
  const q = new URLSearchParams(search);
  const num = (key, fallback) => (q.has(key) && Number.isFinite(Number(q.get(key))) ? Number(q.get(key)) : fallback);
  return {
    uDither: { value: num('dither', 1) },
    uDitherMatrix: { value: num('dmatrix', 8) > 8 ? 16 : 8 },
    uDitherSize: { value: num('dsize', 2) },
    uDitherLevels: { value: num('dlevels', 7) },
    uDitherBrightness: { value: num('dbright', 1.1) },
    uDitherContrast: { value: num('dcontrast', 1.18) },
    uDitherMono: { value: 0 },
    uDitherMonoColor: { value: [0x08 / 255, 0x08 / 255, 0x08 / 255] },
  };
}
