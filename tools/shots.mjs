// Stills of the built page, headless and muted, with the clock stepped by hand.
//   node tools/shots.mjs [names...] [--out shots] [--query "shafts=0"] [--size 1920x1080]
// With no names, every view below. Each view places the wanderer, lets the world settle, and saves a JPEG.
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
const names = args.filter((a, i) => !a.startsWith('--') && !(args[i - 1] ?? '').startsWith('--'));
const out = resolve(here, flag('out', 'shots'));
const [width, height] = flag('size', '1920x1080').split('x').map(Number);
mkdirSync(out, { recursive: true });

// name: [x, z, look-at x, look-at z, { run: seconds of running first, pitch, dist, yaw: turn of the eye, view: [eye, target] }]
export const VIEWS = {
  // from the start, walking north along the clifftop with the sea and the sun on the left
  'coast-start': [29.8, 300, 29.8, 270, { run: 1.2 }],
  // on the edge, looking west over it to the sea and the sun
  'coast-west': [14, 110, -66, 54, { run: 0, pitch: 0.22, dist: 7 }],
  // the stacks and the arch's feet below the clifftop
  'coast-stacks': [17, 70, -40, -20, { run: 0, pitch: 0.18, dist: 7 }],
  // the point at the north end
  'coast-point': [-8, -85, -19, -150, { run: 0.8 }],
  // the same from above, to read the whole headland
  'coast-high': [29.8, 300, 29.8, 270, { run: 0, view: [[140, 160, 360], [0, 20, 60]] }],
  // dusk: the lagoon from the beach at eye height, its reflection; the pavilion from 40 m and 10 m; a lamp-lit
  // stretch of the way; the clifftop looking west at the sun; the whole world from above; the arch
  'dusk-lagoon': [176, 0, 200, 0, { run: 0, view: [[178, 2.2, 6], [330, 6, -20]] }],
  'dusk-lagoon-north': [176, 0, 200, 0, { run: 0, view: [[182, 2.0, 120], [300, 7, -60]] }],
  'dusk-pavilion-40': [176, 30, 200, 30, { run: 0, view: [[214, 3.2, 52], [252, 3.5, 30]] }],
  'dusk-pavilion-10': [176, 30, 200, 30, { run: 0, view: [[236, 2.4, 34], [252, 3.0, 28]] }],
  'dusk-way': [36, 160, 30, 120, { run: 0, pitch: 0.05, dist: 6 }],
  'dusk-sun': [14, 110, -66, 54, { run: 0, pitch: 0.05, dist: 7 }],
  'dusk-above': [29.8, 300, 29.8, 270, { run: 0, view: [[-60, 330, 420], [220, 0, -40]] }],
  'dusk-clifftop-east': [40, 20, 200, 20, { run: 0, view: [[38, 44, 30], [260, 4, 20]] }],
  'dusk-arch': [-10, -40, -95, -95, { run: 0, pitch: 0.12, dist: 7 }],
};

// --view "x,z,fx,fz,run,dist,pitch,yaw" --name n: a view given on the command line
// --cam "ex,eh,ez,tx,th,tz": a fixed eye eh metres above its ground, looking at a point th metres above that same ground
// --trail "z0,z1": his tracks laid along the crest first (the night scene)
const cam = flag('cam') ? flag('cam').split(',').map(Number) : null;
const trail = flag('trail') ? flag('trail').split(',').map(Number) : null;
const firstPerson = args.includes('--first'); // --first: seen through his eyes (the night scene)
const settle = Number(flag('settle', 0)); // --settle n: this many more frames standing before the picture is taken
const wait = Number(flag('wait', 0)); // --wait s: the clock moved on this many seconds first (the night scene)
if (flag('view')) { const [x, z, fx, fz, run, dist, pitch, yaw] = flag('view').split(',').map(Number); VIEWS[flag('name', 'custom')] = [x, z, fx, fz, { run, dist, pitch, yaw }]; names.push(flag('name', 'custom')); }
const root = resolve(here, flag('dist', 'dist'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
const server = createServer((req, res) => {
  let file = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(root) || !existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/?capture&nopad&${flag('query', '')}`;

const exe = process.env.CHROME; // a Chromium of your own; without it, Playwright's
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--mute-audio', '--ignore-gpu-blocklist', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'd3d11'}`, '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text().slice(0, 1500)}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}\n${(e.stack ?? '').slice(0, 600)}`));
const t0 = Date.now();
await page.goto(url);
try {
  await page.waitForFunction(() => window.lab?.ready, null, { timeout: 120000 });
} catch {
  console.log('never ready\n' + problems.join('\n'));
  await browser.close(); server.close(); process.exit(1);
}
console.log(`ready in ${Date.now() - t0} ms`, JSON.stringify(await page.evaluate(() => ({ timings: window.lab.timings, counts: window.lab.counts }))));

if (args.includes('--time')) {
  const ms = await page.evaluate(() => { const L = window.lab, gl = L.renderer.getContext(); L.setInput(() => ({ move: { x: 0, y: 1 }, walk: false, sprint: false, strafe: false, jump: false, look: { x: 0.004, y: 0 }, zoom: 0, device: 'keyboard' })); const px = new Uint8Array(4); L.step(1 / 60, 30); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const t = performance.now(); for (let i = 0; i < 240; i++) { L.step(1 / 60, 1); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } return (performance.now() - t) / 240; });
  console.log('ms a frame, running:', ms.toFixed(2), '=', Math.round(1000 / ms), 'fps');
}
for (const name of names.length ? names : Object.keys(VIEWS)) {
  const v = VIEWS[name];
  if (!v) { console.log(`no view ${name}`); continue; }
  const info = await page.evaluate(([x, z, fx, fz, o, cam, trail, wait, settle, firstPerson]) => {
    const L = window.lab;
    L.view(null);
    L.first?.(firstPerson);
    if (wait) L.wait?.(wait);
    if (trail) L.trail(trail[0], trail[1]);
    if (cam) { const g = L.heightAt(cam[0], cam[2]); o = { ...o, view: [[cam[0], g + cam[1], cam[2]], [cam[3], g + cam[4], cam[5]]] }; }
    L.teleport(x, z, fx, fz);
    if (o.pitch != null) L.follow.pitch = o.pitch;
    L.follow.want = L.follow.distance = o.dist ?? 6.4;
    const run = o.run ?? 0;
    L.setInput(() => ({ move: { x: 0, y: run > 0 ? 1 : 0 }, walk: false, sprint: false, strafe: false, jump: false, look: { x: 0, y: 0 }, zoom: 0, device: 'keyboard' }));
    L.step(1 / 60, Math.round(Math.max(run, 0.5) * 60));
    if (o.yaw) { L.follow.yaw += o.yaw; L.step(1 / 60, 20); }
    if (settle) { L.setInput(() => ({ move: { x: 0, y: 0 }, walk: false, sprint: false, strafe: false, jump: false, look: { x: 0, y: 0 }, zoom: 0, device: 'keyboard' })); L.step(1 / 60, settle); }
    if (o.view) { L.view(o.view[0], o.view[1]); L.step(1 / 60, 2); }
    const p = L.player.feet;
    return { at: [p.x.toFixed(1), p.y.toFixed(2), p.z.toFixed(1)], mode: L.player.mode, speed: L.player.speed.toFixed(2) };
  }, [...v, cam, trail, wait, settle, firstPerson]);
  await page.screenshot({ path: join(out, `${name}.jpg`), type: 'jpeg', quality: 88 });
  console.log(`shot ${name}`, JSON.stringify(info));
}
if (problems.length) console.log('problems:\n' + [...new Set(problems)].slice(0, 12).join('\n'));
await browser.close();
server.close();
