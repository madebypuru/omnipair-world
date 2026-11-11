// The map and the goals, headless. Serve a build first (node tools/serve.mjs dist-map 5412), then:
//   CHROME=... node tools/map-shots.mjs [base url]
// Writes shots/ui-map.png, ui-toast.png, ui-goals.png and prints where each journey left him and what was earned.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { guard } from './no-pointer-lock.mjs';

guard(chromium);
const here = resolve(fileURLToPath(import.meta.url), '..', '..');
const out = resolve(here, 'shots');
mkdirSync(out, { recursive: true });
const base = process.argv[2] ?? 'http://127.0.0.1:5412/';
const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true, args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text().slice(0, 400)); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
await page.goto(`${base}?nopad`);
await page.evaluate(() => { try { localStorage.clear(); } catch {} });
await page.reload();
await page.waitForFunction(() => window.lab?.ready, null, { timeout: 120000 });
await page.waitForTimeout(1500);
const sleep = (ms) => page.waitForTimeout(ms);
const assert = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) process.exitCode = 1; };

// travel by the map to each place, as a click on its marker does
const places = await page.evaluate(() => { window.lab.map.open(); return window.lab.map.places(); });
for (const p of places) {
  await page.evaluate(() => window.lab.map.open());
  await sleep(300);
  await page.evaluate((id) => window.lab.map.travel(id), p.id);
  await sleep(700);
  const at = await page.evaluate(() => ({ x: window.lab.player.feet.x, z: window.lab.player.feet.z, y: window.lab.player.feet.y }));
  const off = Math.hypot(at.x - p.go.x, at.z - p.go.z), to = Math.hypot(at.x - p.x, at.z - p.z);
  assert(off < 1.5 && at.y > 1, `${p.id}: ${off.toFixed(2)} m from where he was put, ${to.toFixed(1)} m from it, y ${at.y.toFixed(1)}, marker at ${p.at.map((v) => v.toFixed(3))}`);
}

// from the clifftop over the arch he walks on, over the edge and into the sea, and washes up at the start
await page.evaluate(() => window.lab.map.travel('arch'));
await sleep(900);
await page.evaluate(() => window.lab.setInput(() => ({ move: { x: 0, y: 1 }, walk: false, sprint: false, strafe: false, jump: false, look: { x: 0, y: 0 }, zoom: 0, device: 'keyboard' })));
await page.waitForFunction(() => window.lab.achievements.state().earned.includes('sea'), null, { timeout: 30000 }).catch(() => {});
await page.evaluate(() => window.lab.setInput(null));
const sea = await page.evaluate(() => window.lab.achievements.state().earned);
assert(sea.includes('arch') && sea.includes('sea'), 'walked to the edge over the arch, fell in the sea, washed up');

// the map open, with the wanderer by Lending, a marker named by the arrows
await page.evaluate(() => window.lab.map.travel('lending'));
await sleep(900);
await page.keyboard.press('KeyM');
await sleep(400);
await page.keyboard.press('ArrowUp');
await page.keyboard.press('ArrowUp');
await sleep(400);
await page.screenshot({ path: resolve(out, 'ui-map.png') });
await page.keyboard.press('Enter');
await sleep(1200);
assert(!(await page.evaluate(() => window.lab.map.isOpen)), 'Enter travelled and shut the map');

// goals through the game's own paths: keys, the stones, the view
await page.evaluate(() => window.lab.omni.visit(0));
await sleep(300);
await page.keyboard.press('KeyE');
await sleep(300);
await page.keyboard.press('KeyV');
await sleep(1200);
await page.keyboard.press('KeyV');
for (let i = 0; i < 10; i++) { await page.keyboard.press('Space'); await sleep(900); }
await page.evaluate(() => { const L = window.lab; L.follow.pitch = 1.45; L.follow.want = 80; });
await sleep(400);
await page.evaluate(() => { const L = window.lab; L.follow.pitch = 0.1; L.follow.want = 6.4; });
await page.evaluate(() => window.lab.omni.visit(1));
for (let i = 0; i < 10; i++) { await page.keyboard.press('ArrowRight'); await sleep(120); }
await page.keyboard.press('KeyE');
await sleep(300);
await page.screenshot({ path: resolve(out, 'ui-toast.png'), clip: { x: 400, y: 0, width: 800, height: 300 } });
const state = await page.evaluate(() => window.lab.achievements.state());
console.log('earned', state.earned.join(', '));
assert(state.earned.length >= 5, `${state.earned.length} goals earned`);
await sleep(500);
await page.keyboard.press('KeyJ');
await sleep(600);
await page.screenshot({ path: resolve(out, 'ui-goals.png') });
await page.keyboard.press('KeyJ');

// pointer lock is let go when the map opens
const lockFreed = await page.evaluate(async () => {
  document.querySelector('#view canvas').requestPointerLock();
  await new Promise((r) => setTimeout(r, 50));
  const before = !!document.pointerLockElement;
  window.lab.map.open();
  await new Promise((r) => setTimeout(r, 50));
  const after = !!document.pointerLockElement;
  window.lab.map.close();
  return before && !after;
});
assert(lockFreed, 'opening the map lets go of the pointer');
assert(await page.evaluate(() => document.activeElement === document.body), 'nothing holds the keyboard focus');
assert(!problems.length, `no page errors${problems.length ? `: ${problems.join(' | ')}` : ''}`);
await browser.close();
