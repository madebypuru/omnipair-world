// The whole game played as a player would: the built page in its own frame loop, real key presses only. Title, Ride,
// gather A and B, ride through each product ring (Leverage, Lending, Trade), leaps with spins, bank at the Pool,
// the old glass (E, M, J, O, Esc), pause on blur, the finish card, start over, then free riding until the session
// has run three minutes. A small autopilot in node reads where he is and presses A/D to steer; nothing is
// teleported or given.
//   npm run build && CHROME=... node tools/play-through.mjs [--size 1440x900] [--no-shots] [--minutes 3]
// Saves shots/play-01.jpg .. play-08.jpg (at 1440x900 with the HUD), then prints each check, the frame times of the
// ride (rAF intervals with vsync and the frame cap off, so each interval is one frame's real cost, CPU and GPU), the
// longest gap between frames, and the console's errors. Run it alone: another Chrome drawing makes the numbers lie.
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { guard } from './no-pointer-lock.mjs';

guard(chromium);
const here = resolve(fileURLToPath(import.meta.url), '..', '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const [width, height] = flag('size', '1440x900').split('x').map(Number);
const shots = !args.includes('--no-shots');
const minutes = Number(flag('minutes', 3));
const root = resolve(here, flag('dist', 'dist'));
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
const browser = await chromium.launch({
  executablePath: process.env.CHROME, headless: true,
  args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const errors = [], offsite = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('request', (r) => { const u = r.url(); if (!u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:')) offsite.push(u); });

let failed = 0;
const check = (ok, what, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? `  ${detail}` : ''}`); return ok; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const TAU = Math.PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
let shotN = 0;
async function still(what) {
  shotN++;
  if (!shots) return;
  const path = join(here, 'shots', `play-${String(shotN).padStart(2, '0')}.jpg`);
  await page.screenshot({ path, type: 'jpeg', quality: 88 });
  console.log(`     still ${shotN}: ${what}`);
}

await page.goto(base);
await page.waitForFunction(() => window.lab?.ready && window.lab.title, null, { timeout: 120000 });
await page.focus('canvas').catch(() => {});

// what happens, as the page sees it: every frame's interval with the phase it fell in, and the game's events
await page.evaluate(() => {
  const L = window.lab;
  const pt = window.__pt = { phase: 'title', frames: [], events: [], gaps: [] };
  let last = performance.now();
  const loop = () => {
    const now = performance.now(), d = now - last;
    last = now;
    pt.frames.push([d, pt.phase]);
    if (d > 250) pt.gaps.push([+d.toFixed(0), pt.phase, +L.ctx.time().toFixed(2), L.ride.state().mode, pt.events.at(-1)?.n ?? '', pt.events.at(-1)?.t ?? 0]);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  for (const n of ['title:enter', 'token:collect', 'product:use', 'product:refuse', 'pool:deposit', 'run:finish', 'ride:mount', 'ride:dismount', 'ride:leap', 'ride:land', 'ride:crash', 'ride:swim']) {
    L.ctx.on(n, (d) => pt.events.push({ n, t: +L.ctx.time().toFixed(2), d: d && JSON.parse(JSON.stringify(d)) }));
  }
  addEventListener('keydown', (e) => { if (e.code === 'Escape') pt.escPrevented = e.defaultPrevented; });
});
const phase = (p) => page.evaluate((p) => { window.__pt.phase = p; }, p);
const events = (n, since = 0) => page.evaluate(([n, since]) => window.__pt.events.filter((e) => (!n || e.n === n) && e.t >= since), [n, since]);
const state = () => page.evaluate(() => {
  const L = window.lab, r = L.ride.state(), g = L.game.state();
  return {
    t: L.ctx.time(), mode: r.mode, x: r.position[0], y: r.position[1], z: r.position[2], h: r.heading, speed: r.speed, surface: r.surface,
    a: g.a, b: g.b, pairs: g.pairs, score: g.score, debt: g.debt, lever: g.leverage, used: g.used, combo: g.combo, inPool: g.inPool,
    card: !!g.card, ui: document.body.dataset.ui, title: L.title.state().state,
  };
});

// --- the keys -------------------------------------------------------------------------------------------------------
const held = new Set();
async function set(k, on) {
  if (on && !held.has(k)) { held.add(k); await page.keyboard.down(k); }
  if (!on && held.has(k)) { held.delete(k); await page.keyboard.up(k); }
}
async function tap(k, ms = 70) { await page.keyboard.down(k); await wait(ms); await page.keyboard.up(k); }
async function letGo() { for (const k of [...held]) await set(k, false); }

/** Rides toward (tx, tz) with W held, pressing A or D while the nose is off; true once within `arrive` metres. */
const strands = [];
/** Lost below the cliffs, or stuck: back to where he woke the way a player does, with O and Respawn. */
async function respawn(why) {
  const st = await state();
  strands.push({ why, t: +st.t.toFixed(1), at: [st.x, st.y, st.z].map((v) => +v.toFixed(0)), mode: st.mode, ui: st.ui, speed: +st.speed.toFixed(1), surface: st.surface });
  console.log(`     stranded (${why}) at ${st.x.toFixed(0)}, ${st.y.toFixed(0)}, ${st.z.toFixed(0)}, ${st.mode} ${st.surface} ${st.speed.toFixed(1)} m/s, ui ${st.ui}: O, Respawn`);
  await letGo();
  await tap('KeyO');
  await wait(300);
  if (await page.evaluate(() => document.body.dataset.ui) !== 'options') await tap('KeyO');
  await page.getByRole('button', { name: 'Respawn' }).click({ timeout: 5000 });
  await wait(700);
  const after = await page.evaluate(() => document.body.dataset.ui);
  if (after !== 'walk') { console.log(`     after Respawn the glass is still ${after}`); await tap('KeyO'); await wait(300); }
}
async function rideTo(tx, tz, { arrive = 5, timeout = 40000, boost = true, stop } = {}) {
  const t0 = Date.now();
  let s, best = Infinity, bestAt = Date.now();
  while (Date.now() - t0 < timeout) {
    s = await state();
    if (stop?.(s)) return 'stop';
    const d = Math.hypot(tx - s.x, tz - s.z);
    if (d < arrive) return true;
    // a point he has gone by, close beside or behind him, is reached: circling back to it on a board is not riding on
    if (d < 14 && Math.cos(Math.atan2(tx - s.x, tz - s.z) - s.h) < 0.2) return true;
    if (d < best - 1) { best = d; bestAt = Date.now(); }
    if (d < 15 && Date.now() - bestAt > 2500) return true;
    if (Date.now() - bestAt > 9000) { await respawn(`no nearer to ${tx.toFixed(0)}, ${tz.toFixed(0)} in 9 s`); return 'lost'; }
    if (s.mode === 'air' || s.mode === 'crash' || s.mode === 'sink') { await set('KeyA', false); await set('KeyD', false); await wait(30); continue; }
    if (s.mode === 'walk') { await letGo(); await tap('KeyF'); await wait(400); continue; }
    await set('KeyW', true);
    const err = wrap(Math.atan2(tx - s.x, tz - s.z) - s.h);
    const dead = d < 15 ? 0.03 : 0.06;
    await set('KeyA', err > dead);
    await set('KeyD', err < -dead);
    await set('ShiftLeft', boost && Math.abs(err) < 0.15 && d > 40);
    await wait(25);
  }
  await set('ShiftLeft', false);
  return false;
}
/** Through a list of points in turn. */
async function rideAlong(points, opts, depth = 0) {
  for (const [x, z] of points) {
    // every route here runs north: a point a leap carried him past is left behind, not turned back for
    if ((await state()).z < z - 2) continue;
    let r = await rideTo(x, z, opts);
    if (r === 'stop') return r;
    if (r === 'lost' && depth < 2) {
      // back where he woke: up the way again to here, not straight across the clifftop's bends
      const st = await state();
      await rideAlong(way.filter(([, wz]) => wz < st.z - 4 && wz > z), opts, depth + 1);
      r = await rideTo(x, z, opts);
    }
  }
  return true;
}
/** A leap with a glide and a whole spin in it: Space held, then D until he has come round once (read off the ride). */
async function trick() {
  await set('KeyA', false); await set('KeyD', false); await set('ShiftLeft', false);
  const s0 = await state();
  await set('Space', true);
  const t0 = Date.now();
  const ride = () => page.evaluate(() => window.lab.ride.state());
  while ((await ride()).mode !== 'air' && Date.now() - t0 < 1500) await wait(10);
  while ((await ride()).air < 0.15 && Date.now() - t0 < 2500) await wait(10);
  await set('KeyD', true);
  let r;
  while ((r = await ride()).mode === 'air' && Math.abs(r.spin) < TAU - 0.35 && Date.now() - t0 < 4000) await wait(8);
  await set('KeyD', false);
  while ((await ride()).mode === 'air' && Date.now() - t0 < 8000) await wait(20);
  await set('Space', false);
  const landed = (await events('ride:land', s0.t)).at(-1);
  const s1 = await state();
  console.log(`     trick from ${s0.x.toFixed(1)}, ${s0.z.toFixed(1)} heading ${s0.h.toFixed(2)} to ${s1.x.toFixed(1)}, ${s1.y.toFixed(1)}, ${s1.z.toFixed(1)} heading ${s1.h.toFixed(2)}: ${JSON.stringify(landed?.d ?? null)}`);
  return landed?.d ?? null;
}
const where = async (what) => { const st = await state(); console.log(`     ${what}: t ${(st.t).toFixed(1)} at ${st.x.toFixed(0)}, ${st.y.toFixed(0)}, ${st.z.toFixed(0)} ${st.mode} ${st.surface} A ${st.a} B ${st.b}`); };

// --- 1. the title --------------------------------------------------------------------------------------------------
await wait(1200);
let s = await state();
check(s.title === 'title', 'the title shows first', s.title);
const mapEarly = await page.evaluate(() => document.querySelector('.map-picture')?.width > 0);
check(mapEarly, 'the round map is painted while the title shows, not during the ride');
await still('title');

// --- 2. Ride: he arrives on the board, one key from moving -------------------------------------------------------
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.lab.title.state().state === 'world', null, { timeout: 10000 });
await phase('ride');
s = await state();
const rideAt = s.t;
const teach = () => page.evaluate(() => ({ teach: document.querySelector('#play-objective .teach')?.textContent ?? '', target: document.querySelector('#play-objective .name')?.textContent ?? '', far: document.querySelector('#play-objective .far')?.textContent ?? '' }));
const first = await teach();
check(s.mode === 'ride' && s.speed < 0.5, 'he arrives standing on the board', `mode ${s.mode}`);
check(/W/.test(first.teach), 'the first prompt says how to move', JSON.stringify(first));
await wait(300);
await still('arrived on the board, first prompt');

// --- 3. the first twenty seconds, then Leverage's ring and two tricks under it -----------------------------------
const way = await page.evaluate(() => { const out = []; for (let z = 296; z >= -140; z -= 12) out.push([window.lab.wayX(z), z]); return out; });
const gates = await page.evaluate(() => window.lab.ctx.omni.gates.map((g) => ({ key: g.key, x: g.x, z: g.z, nx: g.nx, nz: g.nz })));
const pool = await page.evaluate(() => ({ x: window.lab.ctx.omni.pool.x, z: window.lab.ctx.omni.pool.z, r: window.lab.ctx.omni.pool.r }));
const gate = Object.fromEntries(gates.map((g) => [g.key, g]));
const wayBetween = (z0, z1) => way.filter(([, z]) => z < z0 && z > z1);
const through = async (key) => {
  const g = gate[key];
  const before = (await state()).t;
  await rideAlong([[g.x - g.nx * 22, g.z - g.nz * 22], [g.x - g.nx * 9, g.z - g.nz * 9]], { arrive: 3 });
  await rideTo(g.x + g.nx * 12, g.z + g.nz * 12, { arrive: 4, boost: false, timeout: 8000 });
  const used = (await events('product:use', before)).find((e) => e.d.key === key);
  const refused = (await events('product:refuse', before)).find((e) => e.d.key === key);
  return { used, refused };
};
await rideAlong(wayBetween(300, gate.leverage.z + 22));
await where('before Leverage');
await still('first pairs, the objective turns to the Pool');
const toPool = await teach();
check(/Pool/.test(toPool.target), 'with a pair the objective points to the Pool', JSON.stringify(toPool));
const lev = await through('leverage');
await wait(250);
check(!!lev.used, 'Leverage: riding through its ring turns it on', lev.used?.d.text ?? lev.refused?.d.text ?? 'no ring event');
await still('through the Leverage ring');
const tricks = [];
for (const [x, z] of wayBetween(gate.leverage.z - 15, 100)) {
  // leap only running straight up the way: a glide off its west side goes over the cliff
  if ((await state()).z < z - 2) continue;
  await rideTo(x + 3, z);
  const st = await state();
  if (tricks.length < 2 && st.speed > 6 && st.mode === 'ride' && Math.sin(st.h) > -0.03 && Math.abs(wrap(st.h - Math.PI)) < 0.12) {
    if (!tricks.length) {
      const p = trick();
      await page.waitForFunction(() => window.lab.ride.state().air > 0.45, null, { timeout: 4000 }).catch(() => {});
      await still('a leap, gliding, spinning');
      tricks.push(await p);
    } else tricks.push(await trick());
  }
}
await where('after the tricks');
s = await state();
const got = (await events('token:collect', rideAt)).filter((e) => e.t - rideAt <= 20);
const nA = got.filter((e) => e.d.kind === 'a').length, nB = got.filter((e) => e.d.kind === 'b').length;
const firstPair = got.find((e, i) => got.slice(0, i + 1).some((q) => q.d.kind === 'a') && got.slice(0, i + 1).some((q) => q.d.kind === 'b'));
check(nA >= 2 && nB >= 2 && firstPair, 'the first 20 s of riding give both kinds and a pair', `A ${nA}, B ${nB}, first pair at ${firstPair ? (firstPair.t - rideAt).toFixed(1) : '-'} s`);
const clean = tricks.filter((t) => t?.clean && t.spins >= 1).length;
check(clean >= 2, 'leaps with a whole spin land clean and count', JSON.stringify(tricks));
check(s.lever.on && s.lever.level === 3, 'two clean tricks chain Leverage to x3', JSON.stringify(s.lever));

// --- 6. Lending, then Trade --------------------------------------------------------------------------------------
/** Rides for the nearest token of a kind up on the headland, until `enough` holds. */
async function gather(kind, enough, timeout = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const st = await state();
    if (enough(st)) return true;
    if (st.y < 20) return false;
    const tk = await page.evaluate(([kind, x, z]) => window.lab.game.tokens().filter((t) => t.here && t.kind === kind && t.y > 25 && Math.hypot(t.x - x, t.z - z) < 120)
      .sort((p, q) => Math.hypot(p.x - x, p.z - z) - Math.hypot(q.x - x, q.z - z))[0] ?? null, [kind, st.x, st.z]);
    if (!tk) return false;
    await rideTo(tk.x, tk.z, { arrive: 1.5, timeout: 12000, boost: false, stop: (q) => q.a !== st.a || q.b !== st.b });
  }
  return false;
}
const surplus = (st) => Math.abs(st.a - st.b);
await rideAlong(wayBetween(100, gate.lending.z + 22));
s = await state();
if (!surplus(s)) await gather(s.a >= s.b ? 'a' : 'b', (st) => surplus(st) > 0);
const lend = await through('lending');
await where('after Lending');
check(!!lend.used, 'Lending: its ring lends the kind he lacks', lend.used?.d.text ?? lend.refused?.d.text ?? 'no ring event');
await rideAlong(wayBetween(gate.lending.z - 12, gate.trade.z + 40));
s = await state();
if (surplus(s) < 4) await gather(s.a >= s.b ? 'a' : 'b', (st) => surplus(st) >= 4, 60000);
const trd = await through('trade');
await wait(250);
await where('after Trade');
check(!!trd.used, 'Trade: its ring swaps half the surplus', trd.used?.d.text ?? trd.refused?.d.text ?? 'no ring event');
await still('through the Trade ring');

// --- 7. the Pool ---------------------------------------------------------------------------------------------------
s = await state();
if (!s.pairs) await gather(s.a > s.b ? 'b' : 'a', (st) => st.pairs > 0);
await rideAlong(wayBetween(gate.trade.z - 12, pool.z + 20));
const before = await state();
await rideTo(pool.x, pool.z, { arrive: 7, boost: false, stop: (st) => st.inPool });
await set('KeyW', false); await set('KeyA', false); await set('KeyD', false); await set('KeyS', true);
await wait(500);
const dep = (await events('pool:deposit', before.t)).at(-1);
await where('in the Pool');
check(!!dep && dep.d.pairs > 0, 'riding into the Pool banks the pairs', JSON.stringify(dep?.d ?? before));
await still('banked at the Pool');
await wait(1200);
await set('KeyS', false);
s = await state();
check(s.inPool && s.speed < 1, 'he stops in the Pool', `inPool ${s.inPool}, speed ${s.speed.toFixed(2)}`);

// --- 8. the old glass still works, and Esc and blur are as Patch wants them --------------------------------------
const ui = () => page.evaluate(() => document.body.dataset.ui);
const press = async (k) => { await tap(k); await wait(250); return ui(); };
check(await press('KeyE') === 'panel' && await press('KeyE') === 'walk', 'E opens and shuts the great mark\'s panel');
check(await press('KeyM') === 'map' && await press('KeyM') === 'walk', 'M opens and shuts the map');
check(await press('KeyJ') === 'goals' && await press('KeyJ') === 'walk', 'J opens and shuts the goals');
check(await press('KeyO') === 'options' && await press('KeyO') === 'walk', 'O opens and shuts the options');
const escOn = await press('Escape'), escOff = await press('Escape');
const escPrevented = await page.evaluate(() => window.__pt.escPrevented);
check(escOn === 'options' && escOff === 'walk' && escPrevented === false, 'Esc on the open web toggles the options and is never swallowed', `${escOn} ${escOff} prevented ${escPrevented}`);
const paused = await page.evaluate(async () => {
  const L = window.lab, t0 = L.ctx.time();
  dispatchEvent(new Event('blur'));
  await new Promise((r) => setTimeout(r, 600));
  const out = { advanced: +(L.ctx.time() - t0).toFixed(3), sound: L.audio.state().context };
  dispatchEvent(new Event('focus'));
  await new Promise((r) => setTimeout(r, 400));
  for (let i = 0; i < 20 && L.audio.state().context !== 'running'; i++) await new Promise((r) => setTimeout(r, 100));
  out.after = +(L.ctx.time() - t0).toFixed(3);
  out.soundAfter = L.audio.state().context;
  return out;
});
check(paused.advanced < 0.05 && paused.after > 0.1, 'blur pauses the clock and focus starts it again', JSON.stringify(paused));
check(paused.sound === 'suspended' && paused.soundAfter === 'running', 'blur suspends the sound', JSON.stringify([paused.sound, paused.soundAfter]));

// --- 9. the finish card, and starting over (with the mouse held, as a rider has it: letting go of it is not Esc) ---
await page.evaluate(() => window.lab.renderer.domElement.requestPointerLock());
await wait(100);
// --- ------------------------------------------------------------------------
await tap('Enter');
await wait(600);
s = await state();
const card = await page.evaluate(() => ({ on: document.getElementById('play-card')?.classList.contains('on'), total: document.querySelector('#play-card .total')?.textContent, used: document.querySelector('#play-card .usedn')?.textContent }));
check(s.card && card.on && Number(card.total.replace(/,/g, '')) > 0 && card.used === '3 / 3', 'Enter in the Pool shows the score card', JSON.stringify(card));
await still('the score card');
await tap('KeyR');
await wait(800);
s = await state();
check(!s.card && s.ui === 'walk' && s.score === 0 && s.a + s.b === 0 && s.mode === 'ride' && Math.abs(s.z - 300) < 3, 'R starts over: on the board at the start, nothing carried', `mode ${s.mode} ui ${s.ui} z ${s.z.toFixed(1)} score ${s.score}`);

// --- 10. riding on until the session has run its minutes ---------------------------------------------------------
await phase('soak');
const soakEnd = rideAt + minutes * 60;
await page.evaluate(() => {
  // ten seconds with the GPU waited on each frame: from the tick's start to the picture finished
  const L = window.lab, gl = L.renderer.getContext(), pt = window.__pt, drive = L.rideApi.drive, render = L.frame.render;
  pt.full = [];
  let start = 0;
  L.rideApi.drive = (...a) => { start = performance.now(); return drive(...a); };
  L.frame.render = (...a) => { const r = render(...a); gl.finish(); if (start) pt.full.push(performance.now() - start); start = 0; return r; };
  setTimeout(() => { L.rideApi.drive = drive; L.frame.render = render; }, 10000);
});
let laps = 0;
while ((await state()).t < soakEnd) {
  // up the way to the Pool with a leap now and then, bank, finish, start over: a run as a player plays one
  for (const [x, z] of way.slice(1)) {
    if ((await state()).t >= soakEnd) break;
    if ((await state()).z < z - 2) continue;
    await rideTo(x, z, { timeout: 20000 });
    const st = await state();
    if (z % 60 === 0 && st.speed > 6 && st.mode === 'ride' && Math.abs(wrap(st.h - Math.PI)) < 0.12) await trick();
  }
  if ((await state()).t >= soakEnd) break;
  await rideTo(pool.x, pool.z, { arrive: 7, boost: false, stop: (st) => st.inPool });
  await letGo();
  await set('KeyS', true); await wait(1200); await set('KeyS', false);
  await tap('Enter'); await wait(500); await tap('KeyR'); await wait(800);
  laps++;
}
console.log(`     soak: ${laps} more runs to the Pool`);
await letGo();

// --- what the session cost ---------------------------------------------------------------------------------------
const pt = await page.evaluate(() => ({ full: window.__pt.full ?? [], frames: window.__pt.frames, gaps: window.__pt.gaps, cpu: window.lab.game.cpu(), time: window.lab.ctx.time() }));
const stats = (list) => {
  const v = list.map(([d]) => d).sort((a, b) => a - b);
  if (!v.length) return { frames: 0, median: NaN, p95: NaN, p99: NaN, worst: NaN };
  return { frames: v.length, median: +v[v.length >> 1].toFixed(2), p95: +v[Math.floor(v.length * 0.95)].toFixed(2), p99: +v[Math.floor(v.length * 0.99)].toFixed(2), worst: +v[v.length - 1].toFixed(1) };
};
const riding = pt.frames.filter(([, p]) => p === 'ride' || p === 'soak');
const ft = stats(riding);
console.log(`     frame time while riding at ${width}x${height}: ${JSON.stringify(ft)} ms; game loop CPU ${JSON.stringify(pt.cpu)}`);
const fu = stats(pt.full.map((d) => [d]));
console.log(`     frame time with the GPU waited on (tick start to gl.finish), 10 s of riding: ${JSON.stringify(fu)} ms`);
check(ft.median < 10, 'median frame under 10 ms', `${ft.median} ms (p95 ${ft.p95}); with gl.finish each frame ${fu.median} ms, an upper bound that includes ANGLE's own wait`);
const stalls = pt.gaps.filter(([d]) => d > 1000);
check(!stalls.length, `the page kept drawing for the whole ${minutes} min`, `gaps over 250 ms: ${JSON.stringify(pt.gaps)}`);
check(!strands.length, 'the autopilot never had to respawn', JSON.stringify(strands));
check(!errors.length, 'no console errors or page errors', errors.slice(0, 5).join(' | '));
check(!offsite.length, 'no requests off this machine', offsite.slice(0, 3).join(' '));

// --- Patch's own test: exactly the four pass lines patch.json names ---------------------------------------------------
const recipe = JSON.parse(readFileSync(join(here, 'patch.json'), 'utf8')).recipe.test.checks;
const tp = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const lines = [];
tp.on('console', (m) => { if (/^(pass|fail) /.test(m.text())) lines.push(m.text()); });
await tp.goto(`${base}?patch-test=1`);
const t0 = Date.now();
while (lines.length < recipe.length && Date.now() - t0 < 120000) await wait(250);
await wait(1500);
check(lines.length === recipe.length && lines.every((l, i) => l === `pass ${recipe[i]}`), '?patch-test=1 prints exactly the four pass lines', lines.join(' / '));

console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
