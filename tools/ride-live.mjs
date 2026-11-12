// The ride as it really runs: its own frame loop (not ?capture), real key events, a minute of riding over turf,
// sand and water with boosts, carves, leaps, glides, flips, spins, a crash, a step off and back on, and a sink in
// deep sea. Prints the ride's own CPU per frame, how smoothly he sits in the picture, whether he or the eye ever
// went under the ground, which events fired, any page errors, any request off this machine, and that blur pauses
// and Esc is left alone.
//   npx vite build --outDir dist-ride && CHROME=... node tools/ride-live.mjs [--dist dist-ride] [--seconds 60]
import { createReadStream, existsSync, statSync } from 'node:fs';
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
const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true, args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [], offsite = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) offsite.push(r.url()); });
let failed = 0;
const check = (ok, what, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? `  ${detail}` : ''}`); };

if (process.env.TRACE) {
  await page.addInitScript(() => {
    window.__grows = [];
    const g = WebAssembly.Memory.prototype.grow;
    WebAssembly.Memory.prototype.grow = function (n) { const t = performance.now(); const r = g.call(this, n); window.__grows.push([+(window.lab?.ctx?.time?.() ?? -1).toFixed(2), this.buffer.byteLength >> 20, +(performance.now() - t).toFixed(1)]); return r; };
  });
}
await page.goto(`${base}?nopad&clean`);
await page.waitForFunction(() => window.lab?.ready, null, { timeout: 120000 });
await page.focus('canvas').catch(() => {});

// timing the ride's own work, and a sample of where things are each frame
await page.evaluate(() => {
  const L = window.lab, R = L.rideApi, T = L.THREE;
  const cost = { ms: 0, frames: 0, per: [], slow: [] };
  let frameMs = 0;
  for (const name of ['drive', 'place', 'pose', 'cameraBefore', 'cameraAfter']) {
    const f = R[name];
    R[name] = (...a) => { const t = performance.now(); const r = f(...a); const ms = performance.now() - t; frameMs += ms; if (ms > 20) cost.slow.push([name, +ms.toFixed(1), L.ride.state().mode, +L.ctx.time().toFixed(2)]); if (name === 'cameraAfter') { cost.per.push(frameMs); frameMs = 0; } return r; };
  }
  { const P = L.ctx.physics, f = P.step.bind(P); P.step = (...a) => { const t = performance.now(); const r = f(...a); const ms = performance.now() - t; if (ms > 20) cost.slow.push(['physics.step', +ms.toFixed(1), L.ride.state().position, +L.ctx.time().toFixed(2), L.player.body.translation()]); return r; }; }
  const samples = [], events = [];
  for (const n of ['ride:mount', 'ride:dismount', 'ride:leap', 'ride:land', 'ride:crash', 'ride:swim']) L.ctx.on(n, (d) => events.push([n + '@' + L.ctx.time().toFixed(2), d && Object.fromEntries(Object.entries(d).filter(([, v]) => typeof v !== 'object'))]));
  const v = new T.Vector3();
  let lastT = -1;
  const sample = () => {
    const t = L.ctx.time();
    if (t !== lastT) {
      lastT = t;
      const st = L.ride.state(), c = L.camera.position;
      v.copy(L.player.feet).setY(L.player.feet.y + 1).project(L.camera);
      samples.push({ t, mode: st.mode, x: st.position[0], y: st.position[1], z: st.position[2], ground: L.heightAt(st.position[0], st.position[2]), speed: st.speed, sx: v.x * 640, sy: v.y * 360, cy: c.y, cground: L.heightAt(c.x, c.z), dist: c.distanceTo(L.player.feet) });
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
  window.__ride = { cost, samples, events };
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const key = page.keyboard;
const hold = async (keys, ms) => { for (const k of keys) await key.down(k); await wait(ms); for (const k of keys) await key.up(k); };
const tap = (k) => hold([k], 60);
const at = (x, z, h, s = 0) => page.evaluate(([x, z, h, s]) => { window.lab.ride.at(x, z, h, s); window.lab.follow.yaw = h; window.lab.follow.pivot.set(0, 0, 0); }, [x, z, h, s]);
const progress = async (what) => { if (process.env.TRACE) console.log(`  ${what}: wall ${((Date.now() - t0) / 1000).toFixed(1)} s, game ${(await page.evaluate(() => window.lab.ctx.time())).toFixed(1)} s, ${JSON.stringify(await page.evaluate(() => window.lab.ride.state().mode))}`); };
const mode = (m, ms = 4000) => page.waitForFunction((m) => window.lab.ride.state().mode === m, m, { timeout: ms, polling: 16 }).catch(() => console.log(`  (waited for ${m}: not reached)`));
// a leap, and once he is up, keys for a trick
const trick = async (keys, ms) => { await mode('ride'); await tap('Space'); await mode('air'); await wait(80); if (keys.length) await hold(keys, ms); };
const NORTH = Math.PI;
const seconds = Number(flag('seconds', 60));
const t0 = Date.now();
const script = async () => {
  // off the start on turf: push, carve both ways
  await key.down('KeyW');
  await hold(['KeyA'], 1200); await hold(['KeyD'], 1600); await wait(1500);
  await key.up('KeyW');
  await progress('out on the lagoon');
  // out on the lagoon: push to cruise, boost, carve hard
  await at(300, 60, NORTH, 6);
  await key.down('KeyW');
  await wait(2500);
  await hold(['ShiftLeft'], 300);
  await wait(1200);
  await hold(['KeyD'], 1500); await hold(['KeyA'], 1500);
  await key.up('KeyW');
  await progress('a leap held');
  // a leap held into a glide, a leap with a front flip, a leap with a spin
  await mode('ride'); await key.down('Space'); await mode('air'); await mode('ride'); await key.up('Space');
  await trick(['KeyW'], 700); await mode('ride');
  await key.down('KeyW'); await wait(1000); await key.up('KeyW');
  await trick(['KeyD'], 650); await mode('ride');
  await progress('upside down');
  // upside down into the water: a crash, then up again
  await key.down('KeyW'); await wait(800); await key.up('KeyW');
  await trick([], 0); await wait(350); await key.down('KeyW'); await mode('crash'); await key.up('KeyW'); await mode('ride');
  await progress('up the beach');
  // up the beach and the meadow toward the cliffs, fast
  await at(186, 20, NORTH, 10);
  await key.down('KeyW');
  await hold(['KeyA'], 2000); await hold(['KeyD'], 2500);
  await key.up('KeyW');
  await progress('step off');
  // step off, walk, call the board, ride on
  await tap('KeyF'); await wait(600);
  await hold(['KeyW'], 2000);
  await tap('KeyF'); await wait(2000);
  await key.down('KeyW'); await wait(2000); await key.up('KeyW');
  await progress('deep sea');
  // deep sea, slow: he sinks and comes back ashore
  const deep = await page.evaluate(() => { const L = window.lab; for (let x = 260; x < 470; x += 5) if (-L.heightAt(x, 330) > 4) return x; return 400; });
  if (process.env.SKIPDEEP) await wait(3000); else { await at(deep, 330, Math.PI / 2, 2); await wait(3000); }
  await progress('whatever is left');
  // whatever is left: ride on
  await key.down('KeyW');
  while (Date.now() - t0 < seconds * 1000) { await hold(['KeyD'], 1500); await hold(['KeyA'], 1500); await tap('Space'); await wait(1200); }
  await key.up('KeyW');
};
await script();

const r = await page.evaluate(() => window.__ride);
if (process.env.TRACE) console.log('  wasm grows [game s, MB, ms]: ' + JSON.stringify(await page.evaluate(() => window.__grows)));
const per = r.cost.per.slice(30).sort((a, b) => a - b);
const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
const S = r.samples;
console.log(`frames ${S.length} over ${(S.at(-1).t - S[0].t).toFixed(1)} s game time, ${((Date.now() - t0) / 1000).toFixed(1)} s wall`);
if (r.cost.slow.length) console.log(`  slow calls: ${JSON.stringify(r.cost.slow)}`);
console.log(`ride CPU per frame: median ${pct(per, 0.5).toFixed(3)} ms, p95 ${pct(per, 0.95).toFixed(3)} ms, max ${per.at(-1).toFixed(2)} ms (includes physics.step and the wake)`);

// under the ground: the board's underside below the land (not while sinking)
let under = 0, worst = 0;
for (const s of S) if (s.mode !== 'sink' && s.mode !== 'walk') { const d = s.ground - s.y; if (d > 0.1) { under++; worst = Math.max(worst, d); } }
check(under === 0, 'never under the ground', `${under} frames, worst ${worst.toFixed(2)} m`);
let camUnder = 0;
for (const s of S) if (s.cy < Math.max(s.cground, 0) + 0.2) camUnder++;
check(camUnder === 0, 'the eye never under the ground or the water', `${camUnder} frames`);
// smoothness: frame-to-frame change in how fast he moves across the picture, at speed and on the ground, not on teleports
const jerk = [];
for (let i = 2; i < S.length; i++) {
  const a = S[i - 2], b = S[i - 1], c = S[i];
  if (a.mode !== 'ride' || b.mode !== 'ride' || c.mode !== 'ride' || c.speed < 6) continue;
  if (Math.hypot(c.x - a.x, c.z - a.z) > 3 || c.dist > 30) continue;
  jerk.push(Math.hypot(c.sx - 2 * b.sx + a.sx, c.sy - 2 * b.sy + a.sy));
}
jerk.sort((a, b) => a - b);
const dists = S.filter((s) => s.mode === 'ride').map((s) => s.dist);
check(pct(jerk, 0.95) < 6, 'he sits steady in the picture at speed', `screen jerk px/frame²: median ${pct(jerk, 0.5).toFixed(2)}, p95 ${pct(jerk, 0.95).toFixed(2)}, max ${jerk.at(-1)?.toFixed(1)}; eye distance ${Math.min(...dists).toFixed(1)}..${Math.max(...dists).toFixed(1)} m`);
const names = r.events.map(([n]) => n.split('@')[0]);
if (process.env.TRACE) console.log('  events at: ' + r.events.map(([n]) => n).join(' '));
const count = (n) => names.filter((x) => x === n).length;
console.log(`events: ${['ride:mount', 'ride:dismount', 'ride:leap', 'ride:land', 'ride:crash', 'ride:swim'].map((n) => `${n} ${count(n)}`).join(', ')}`);
for (const [n, d] of r.events) if (n.startsWith('ride:land')) console.log(`  land ${JSON.stringify(d)}`);
check(['ride:mount', 'ride:dismount', 'ride:leap', 'ride:land', 'ride:crash', 'ride:swim'].every((n) => count(n) > 0), 'every ride event fired');
const lands = r.events.filter(([n]) => n.startsWith('ride:land')).map(([, d]) => d);
check(lands.every((d) => 'airtime' in d && 'flips' in d && 'spins' in d && 'clean' in d) && lands.some((d) => d.flips >= 1) && lands.some((d) => d.spins >= 0.5), 'ride:land carries airtime, flips, spins, clean, with a flip and a spin among them');
const pub = await page.evaluate(() => { const p = window.lab.ctx.ride; return { mounted: p.mounted, speed: typeof p.speed, airborne: typeof p.airborne, position: p.position?.isVector3, heading: typeof p.heading }; });
check(pub.mounted === true && pub.speed === 'number' && pub.airborne === 'boolean' && pub.position && pub.heading === 'number', 'ctx.ride has mounted, speed, airborne, position, heading', JSON.stringify(pub));

// Patch: blur pauses, Esc goes by
const paused = await page.evaluate(async () => {
  dispatchEvent(new Event('blur'));
  const a = window.lab.ctx.time();
  await new Promise((r) => setTimeout(r, 500));
  const b = window.lab.ctx.time();
  dispatchEvent(new Event('focus'));
  await new Promise((r) => setTimeout(r, 300));
  return { still: a === b, resumed: window.lab.ctx.time() > b };
});
check(paused.still && paused.resumed, 'blur pauses and focus resumes', JSON.stringify(paused));
const esc = await page.evaluate(() => { const e = new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', cancelable: true, bubbles: true }); dispatchEvent(e); return e.defaultPrevented; });
check(!esc, 'Esc is not swallowed');
check(offsite.length === 0, 'no requests off this machine', offsite.slice(0, 3).join(' '));
check(errors.length === 0, 'no page errors over the ride', errors.slice(0, 3).join(' | '));
await browser.close();
server.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
