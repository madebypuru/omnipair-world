// The dither alone, on the plain brand paintings, beside the dithered ones the brand was made with.
//   CHROME=/path/to/chrome node tools/dither-check.mjs [--size 2] [--levels 7] [--native]
// Plain 2.webp / 4.webp are scaled to 1500 (the size of 1.webp / 3.webp), or with --native dithered at their own
// 2000 and then scaled to 1500 (which is how the references were made: their dot period is 4 x 2000/1500), run through the exact DITHER string from
// src/oilpaint/dither.js, and saved to shots/dither-2.png and shots/dither-4.png. It also prints, against the
// dithered reference, the error after an 8px box blur (overall tone) and the mean and spread of each, for
// brightness as a multiplier and as an offset.
import { mkdirSync, writeFileSync, createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = resolve(fileURLToPath(import.meta.url), '..', '..');
const root = resolve(here, '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png' };
const page = /* html */ `<!doctype html><canvas id=c width=2000 height=2000></canvas><script type=module>
import { DITHER } from '/world/src/oilpaint/dither.js';
const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
const N = ${args.includes('--native') ? 2000 : 1500};
const pixels = (img, n = 1500) => { const c = new OffscreenCanvas(n, n).getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(img, 0, 0, n, n); return c.getImageData(0, 0, n, n).data; };
const gl = document.getElementById('c').getContext('webgl2', { preserveDrawingBuffer: true });
const build = (pre) => {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, '#version 300 es\\nin vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }'));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, '#version 300 es\\nprecision highp float;\\nuniform sampler2D tImg;\\n' + DITHER +
    '\\nout vec4 o; void main(){ vec3 col = texelFetch(tImg, ivec2(gl_FragCoord.x, float(' + N + ') - 1.0 - gl_FragCoord.y), 0).rgb; ' + pre + ' o = vec4(dither(col, gl_FragCoord.xy), 1.0); }'));
  gl.linkProgram(p);
  return p;
};
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
const run = (plain, pre, set) => {
  const p = build(pre);
  gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p); gl.useProgram(p);
  const u = (n, v) => gl.uniform1f(gl.getUniformLocation(p, n), v);
  const all = { uDither: 1, uDitherMatrix: ${Number(flag('matrix', 8))}, uDitherSize: ${Number(flag('size', 2))}, uDitherLevels: ${Number(flag('levels', 7))}, uDitherBrightness: 1.1, uDitherContrast: 1.18, uDitherMono: 0, ...set };
  for (const k in all) u(k, all[k]);
  gl.uniform3f(gl.getUniformLocation(p, 'uDitherMonoColor'), 8 / 255, 8 / 255, 8 / 255);
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.viewport(0, 0, N, N);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(plain.buffer));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  const out = new Uint8Array(N * N * 4);
  gl.readPixels(0, 0, N, N, gl.RGBA, gl.UNSIGNED_BYTE, out);
  const flip = new Uint8ClampedArray(out.length);
  for (let y = 0; y < N; y++) flip.set(out.subarray((N - 1 - y) * N * 4, (N - y) * N * 4), y * N * 4);
  if (N === 1500) return flip;
  const big = new OffscreenCanvas(N, N); big.getContext('2d').putImageData(new ImageData(flip, N, N), 0, 0);
  return pixels(big);
};
const blur = (d, b = 8) => { const n = 1500 / b | 0, r = new Float32Array(n * n * 3);
  for (let y = 0; y < n * b; y++) for (let x = 0; x < n * b; x++) for (let c = 0; c < 3; c++) r[((y / b | 0) * n + (x / b | 0)) * 3 + c] += d[(y * 1500 + x) * 4 + c] / (b * b * 255);
  return r; };
const stats = (r) => { let m = 0, s = 0; for (const v of r) m += v; m /= r.length; for (const v of r) s += (v - m) ** 2; return [m, Math.sqrt(s / r.length)]; };
const rmse = (a, b) => { let e = 0; for (let i = 0; i < a.length; i++) e += (a[i] - b[i]) ** 2; return Math.sqrt(e / a.length); };
const f = (x) => x.toFixed(4);
const report = {};
for (const [plainName, refName] of [['2', '1'], ['4', '3']]) {
  const plain = pixels(await load('/brand/reference/' + plainName + '.webp'), N);
  const ref = blur(pixels(await load('/brand/reference/' + refName + '.webp')));
  const lines = ['reference ' + refName + '.webp mean/sd ' + stats(ref).map(f).join(' ')];
  const variants = {
    'none (b1 c1)': ['', { uDitherBrightness: 1, uDitherContrast: 1 }],
    'multiply b1.1 c1.18': ['', {}],
    'offset +0.1 c1.18': ['col += 0.1;', { uDitherBrightness: 1 }],
    'contrast then multiply': ['col = (col - 0.5) * 1.18 + 0.5; col *= 1.1;', { uDitherBrightness: 1, uDitherContrast: 1 }],
  };
  for (const [name, [pre, set]] of Object.entries(variants)) {
    const b = blur(run(plain, pre, set));
    lines.push(name.padEnd(24) + ' rmse ' + f(rmse(b, ref)) + '  mean/sd ' + stats(b).map(f).join(' '));
  }
  const final = run(plain, '', {});
  const c = new OffscreenCanvas(1500, 1500); c.getContext('2d').putImageData(new ImageData(final, 1500, 1500), 0, 0);
  const blob = await c.convertToBlob({ type: 'image/png' });
  const url = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
  report[plainName] = { lines, png: url.split(',')[1] };
}
window.done = report;
</script>`;
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/') return void res.writeHead(200, { 'Content-Type': 'text/html' }).end(page);
  const file = normalize(join(root, path));
  if (!file.startsWith(root) || !existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true, args: ['--ignore-gpu-blocklist'] });
const tab = await browser.newPage();
tab.on('pageerror', (e) => console.error(e));
await tab.goto(`http://127.0.0.1:${server.address().port}/`);
const report = await tab.waitForFunction(() => window.done, null, { timeout: 120000 }).then((h) => h.jsonValue());
mkdirSync(resolve(here, 'shots'), { recursive: true });
for (const [name, { lines, png }] of Object.entries(report)) {
  writeFileSync(resolve(here, `shots/dither-${name}${args.includes('--native') ? '-native' : ''}.png`), Buffer.from(png, 'base64'));
  console.log(`dither-${name}.png\n  ` + lines.join('\n  '));
}
await browser.close();
server.close();
