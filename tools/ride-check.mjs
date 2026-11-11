// The ride, played headless with real key events: top speeds on turf, sand and water, boost, a figure of eight, leaps
// on the flat and off a dune, a flip landed clean, a bad landing, sinking in deep sea, stepping off and on. Writes
// filmstrips (8 frames each) of a carve on water and of a leap to shots/ride/, then runs ?patch-test=1 for its lines.
//   npx vite build --outDir dist-ride && CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node tools/ride-check.mjs [--dist dist-ride]
import { mkdirSync, createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { guard } from './no-pointer-lock.mjs';

guard(chromium);
const here = resolve(fileURLToPath(import.meta.url), '..', '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const root = resolve(here, flag('dist', 'dist-ride'));
const out = resolve(here, 'shots', 'ride');
mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  let file = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(root) || !existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true, args: ['--mute-audio', '--ignore-gpu-blocklist', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'd3d11'}`, '--enable-gpu'] });
const errors = [];
let failed = 0;
const check = (ok, what, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? `  ${detail}` : ''}`); };

const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${base}?capture&nopad`);
await page.waitForFunction(() => window.lab?.ready, null, { timeout: 120000 });
await page.evaluate(() => { window.events = []; for (const n of ['ride:mount', 'ride:dismount', 'ride:leap', 'ride:land', 'ride:crash', 'ride:swim', 'ride:whistle']) window.lab.ctx.on(n, (d) => window.events.push([n, d])); });

const step = (n) => page.evaluate((n) => { window.lab.step(1 / 60, n); return window.lab.ride.state(); }, n);
const state = () => page.evaluate(() => window.lab.ride.state());
const at = (x, z, heading, speed = 0) => page.evaluate(([x, z, h, s]) => { window.lab.ride.at(x, z, h, s); window.lab.follow.yaw = h; window.lab.follow.pivot.set(0, 0, 0); window.lab.ride.resetTop(); window.events.length = 0; return window.lab.ride.state(); }, [x, z, heading, speed]);
const events = () => page.evaluate(() => window.events.map(([n, d]) => [n, d && typeof d === 'object' && !d.isVector3 ? Object.fromEntries(Object.entries(d).filter(([, v]) => typeof v !== 'object')) : null]));
const hold = async (keys, frames, each) => {
  for (const k of keys) await page.keyboard.down(k);
  let s;
  for (let i = 0; i < frames; i += 10) { s = await step(Math.min(10, frames - i)); each?.(s); }
  for (const k of keys) await page.keyboard.up(k);
  return s;
};
const tap = async (key) => { await page.keyboard.down(key); await step(1); await page.keyboard.up(key); };
const untilLanded = async (max = 300) => { let s, flew = false; for (let i = 0; i < max; i++) { s = await step(1); flew ||= s.mode === 'air'; if (flew && s.mode !== 'air') break; } return s; };
const NORTH = Math.PI, EAST = Math.PI / 2;

// --- speeds ---
await at(150, 40, NORTH);
let s = await hold(['KeyW'], 360);
const turf = s.top;
check(turf > 7.5 && turf < 10.5, 'turf top speed', `${turf} m/s on ${s.surface}`);
await at(186, 20, NORTH);
s = await hold(['KeyW'], 360);
check(s.top > 11 && s.top < 14.5, 'sand top speed', `${s.top} m/s on ${s.surface}`);
await at(300, 60, NORTH);
s = await hold(['KeyW'], 360);
const water = s.top;
check(water > 13 && water < 15, 'water top speed', `${water} m/s on ${s.surface}, depth ${s.depth}`);
s = await hold(['KeyW', 'ShiftLeft'], 180);
check(s.top > 19 && s.top < 23, 'boost top speed', `${s.top} m/s, boost meter ${s.boost}`);
s = await hold(['KeyW', 'ShiftLeft'], 60);
check(!s.boosting, 'boost runs out and cools down', `boost meter ${s.boost}`);

// --- figure of eight on water at cruise ---
await at(300, 60, NORTH, 14);
const radii = [];
const loop = async (key) => {
  let turned = 0, last = (await state()).heading;
  await page.keyboard.down('KeyW'); await page.keyboard.down(key);
  for (let i = 0; i < 600 && turned < 2 * Math.PI; i++) {
    const st = await step(1);
    let d = st.heading - last; d = Math.atan2(Math.sin(d), Math.cos(d)); turned += Math.abs(d); last = st.heading;
    if (Math.abs(st.turn) > 0.2) radii.push(st.speed / Math.abs(st.turn));
  }
  await page.keyboard.up(key); await page.keyboard.up('KeyW');
  return turned;
};
const right = await loop('KeyD'), left = await loop('KeyA');
s = await state();
const r = radii.slice(30);
const radius = r.reduce((a, b) => a + b, 0) / r.length;
check(right >= 2 * Math.PI && left >= 2 * Math.PI && s.speed > 9, 'figure of eight on water', `turn radius ${radius.toFixed(1)} m at ${s.speed} m/s after both loops`);

// --- leaps ---
await at(300, 60, NORTH, 14);
await step(5);
await tap('Space');
s = await untilLanded();
let last = s.last;
check(last && last.airtime > 0.6 && last.clean, 'leap on the flat at 14 m/s', JSON.stringify(last));
await at(300, 60, NORTH, 22);
await step(5);
await tap('Space');
s = await untilLanded();
check(s.last.airtime > 0.8, 'leap at 22 m/s', JSON.stringify(s.last));
// over the dune at (176, -40) heading east, leaping at its crest
await at(140, -40, EAST, 14);
let peak = 0;
for (let i = 0; i < 240; i++) { s = await step(1); if (s.position[0] > 175.5) break; }
await tap('Space');
const y0 = s.position[1];
for (let i = 0, flew = false; i < 400; i++) { s = await step(1); peak = Math.max(peak, s.position[1] - y0); flew ||= s.mode === 'air'; if (flew && s.mode !== 'air') break; }
check(s.last.airtime > 0.8, 'leap off the dune', `${JSON.stringify(s.last)} rose ${peak.toFixed(2)} m`);
// down the meadow, leaping on the slope
await at(60, -60, EAST, 8);
s = await hold(['KeyW'], 50);
const slopeSpeed = s.speed;
await tap('Space');
s = await untilLanded(400);
check(s.last.airtime > 0.8, 'leap down the meadow', `${JSON.stringify(s.last)} at ${slopeSpeed} m/s on ${s.surface}`);
// glide: hold Space through the leap
await at(300, 60, NORTH, 14);
await page.keyboard.down('Space');
s = await step(1);
for (let i = 0, flew = false; i < 400; i++) { s = await step(1); flew ||= s.mode === 'air'; if (flew && s.mode !== 'air') break; }
await page.keyboard.up('Space');
check(s.last.airtime > last.airtime + 0.4 && s.glide < 1, 'glide holds him up', `${JSON.stringify(s.last)}, glide meter ${s.glide}`);

// --- a flip landed clean, then a bad landing ---
await at(300, 60, NORTH, 22);
await step(5);
await tap('Space');
await step(10);
await hold(['KeyW'], 42);
s = await untilLanded();
check(s.last.flips === 1 && s.last.clean, 'front flip landed clean', JSON.stringify(s.last));
await at(300, 60, NORTH, 14);
await step(5);
await tap('Space');
await step(28);
await hold(['KeyA'], 10);
s = await untilLanded();
check(s.last && !s.last.clean && !s.last.crash, 'half-turned landing wobbles', JSON.stringify(s.last));
await at(300, 60, NORTH, 14);
await step(5);
await tap('Space');
await step(30);
await page.keyboard.down('KeyW');
s = await untilLanded();
await page.keyboard.up('KeyW');
let ev = await events();
check(s.mode === 'crash' && ev.some(([n]) => n === 'ride:crash'), 'landing upside down crashes', JSON.stringify(s.last));
s = await step(90);
check(s.mode === 'ride' && Math.hypot(s.position[0] - 300, s.position[2] - 60) < 40, 'after the crash he is up again on the spot', `${s.mode} at ${s.position}`);

// --- deep sea ---
const deep = await page.evaluate(() => { const L = window.lab; for (let x = 260; x < 470; x += 5) if (-L.heightAt(x, 330) > 4) return x; return null; });
await at(deep, 330, EAST, 14);
s = await hold(['KeyW'], 120);
check(s.mode === 'ride' && s.surface === 'water', 'skims deep water at speed', `${s.speed} m/s, depth ${s.depth}`);
await at(deep, 330, EAST, 2);
for (let i = 0; i < 20; i++) { s = await step(5); if (s.mode !== 'ride' && s.mode !== 'sink') break; }
s = await step(5);
ev = await events();
const ashore = await page.evaluate(([x, z]) => { const L = window.lab, st = L.ride.state(), p = st.position; return { h: L.heightAt(p[0], p[2]), d: Math.hypot(p[0] - x, p[2] - z), fromStart: Math.hypot(p[0] - L.START.x, p[2] - L.START.z) }; }, [deep, 330]);
check(ev.some(([n]) => n === 'ride:swim') && s.mounted && ashore.h > 0.3 && ashore.fromStart > 30, 'sinks when slow, comes back on the nearest shore', `${JSON.stringify(ashore)} mode ${s.mode}`);

// --- step off, walk, whistle the board back ---
await at(150, 40, NORTH, 0);
await step(10);
await tap('KeyF');
s = await step(10);
const off = s.mode === 'walk';
await hold(['KeyW'], 120);
const walked = await page.evaluate(() => { const L = window.lab; const f = L.player.feet, p = L.ride.state().position; return Math.hypot(f.x - p[0], f.z - p[2]); });
await tap('KeyF');
s = await step(60);
ev = await events();
check(off && walked > 3 && s.mounted && ev.some(([n]) => n === 'ride:whistle'), 'steps off, walks, whistles the board back', `walked ${walked.toFixed(1)} m from it, ${ev.map(([n]) => n).join(' ')}`);

// --- filmstrips ---
const strip = async (name, setup, frameKeys) => {
  await setup();
  for (let i = 0; i < 8; i++) {
    for (const k of frameKeys(i).down) await page.keyboard.down(k);
    await step(frameKeys(i).frames);
    for (const k of frameKeys(i).up ?? []) await page.keyboard.up(k);
    await page.screenshot({ path: join(out, `${name}-${i}.jpg`), type: 'jpeg', quality: 85 });
  }
  for (const k of ['KeyW', 'KeyA', 'KeyD', 'Space']) await page.keyboard.up(k);
};
await strip('carve', async () => { await at(300, 40, NORTH, 14); await hold(['KeyW'], 90); }, (i) => ({ down: ['KeyW', i < 4 ? 'KeyD' : 'KeyA'], up: i === 3 ? ['KeyD'] : [], frames: 14 }));
await strip('leap', async () => { await at(300, 40, NORTH, 18); await hold(['KeyW'], 60); }, (i) => (i === 0 ? { down: ['Space'], up: ['Space'], frames: 8 } : i === 1 ? { down: ['KeyW'], up: [], frames: 8 } : i === 4 ? { down: [], up: ['KeyW'], frames: 8 } : { down: [], up: [], frames: 8 }));

check(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
await page.close();

// --- Patch's test ---
const pt = await browser.newPage({ viewport: { width: 960, height: 540 } });
const lines = [];
pt.on('console', (m) => { const t = m.text(); if (/^(pass|fail) /.test(t)) lines.push(t); });
pt.on('pageerror', (e) => lines.push(`pageerror ${e.message}`));
await pt.goto(`${base}?patch-test=1&nopad`);
const t0 = Date.now();
while (Date.now() - t0 < 150000 && lines.filter((l) => /^(pass|fail)/.test(l)).length < 4 && !lines.some((l) => l.startsWith('pageerror'))) await new Promise((r) => setTimeout(r, 500));
for (const l of lines) console.log(`  patch-test: ${l}`);
check(lines.filter((l) => l.startsWith('pass ')).length === 4, 'patch-test prints four pass lines');

await browser.close();
server.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
