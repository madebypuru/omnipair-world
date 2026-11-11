// A short run of stills of the sea, to see how it moves: the clock stepped by hand between frames.
//   node tools/sea-frames.mjs [--dist dist-sea] [--prefix after] [--frames 6] [--seconds 4] [--query "dither=0"] [--size 1280x720]
// Saves shots/sea/<prefix>-<view>-<n>.jpg for each view below.
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { guard } from './no-pointer-lock.mjs';

guard(chromium);
const here = resolve(fileURLToPath(import.meta.url), '..', '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const out = resolve(here, 'shots/sea');
const prefix = flag('prefix', 'after');
const frames = Number(flag('frames', 6));
const seconds = Number(flag('seconds', 4));
const only = flag('views', '');
const [width, height] = flag('size', '1280x720').split('x').map(Number);
mkdirSync(out, { recursive: true });

// name: [x, z, look-at x, look-at z, pitch, distance, fixed eye?, its target?]
const VIEWS = {
  above: [10, 0, 10, -60, 1.2, 60],
  over: [10, 0, 10, -60, 1.2, 60, [-6, 58, 30], [-34, 0, -14]],
  cliff: [9, -20, -60, -40, 0.32, 7],
  stacks: [17, 70, -40, -20, 0.5, 30],
};

const root = resolve(here, flag('dist', 'dist-sea'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
const server = createServer((req, res) => {
  let file = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(root) || !existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true, args: ['--mute-audio', '--ignore-gpu-blocklist', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'd3d11'}`, '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text().slice(0, 1500)}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
await page.goto(`http://127.0.0.1:${server.address().port}/?capture&nopad&${flag('query', '')}`);
await page.waitForFunction(() => window.lab?.ready, null, { timeout: 120000 });

for (const [name, v] of Object.entries(VIEWS)) {
  if (only && !only.split(',').includes(name)) continue;
  await page.evaluate(([x, z, fx, fz, pitch, dist, eye, target]) => {
    const L = window.lab;
    L.view(eye ?? null, target);
    L.teleport(x, z, fx, fz);
    L.setInput(() => ({ move: { x: 0, y: 0 }, walk: false, sprint: false, strafe: false, jump: false, look: { x: 0, y: 0 }, zoom: 0, device: 'keyboard' }));
    L.follow.pitch = pitch;
    L.follow.want = L.follow.distance = dist;
    L.step(1 / 60, 90);
  }, v);
  const per = Math.max(1, Math.round((seconds / Math.max(1, frames - 1)) * 60));
  for (let f = 0; f < frames; f++) {
    if (f) await page.evaluate((n) => window.lab.step(1 / 60, n), per);
    await page.screenshot({ path: join(out, `${prefix}-${name}-${f}.jpg`), type: 'jpeg', quality: 88 });
  }
  console.log(`${name}: ${frames} frames, ${per} ticks apart`);
}
if (problems.length) console.log('problems:\n' + [...new Set(problems)].slice(0, 12).join('\n'));
await browser.close();
server.close();
