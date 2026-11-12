// The game layer at 1440x900 with the HUD, headless: the start of the ride, tokens ahead, a product ring, the Pool.
// Writes shots/fix-layer-1.jpg .. fix-layer-4.jpg and prints console errors and the play update's own cost.
//   npx vite build --outDir dist-layer && CHROME=... node tools/layer-shots.mjs [--dist dist-layer] [--name fix-layer]
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
const root = resolve(here, flag('dist', 'dist-layer'));
const name = flag('name', 'fix-layer');
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto(base);
await page.waitForFunction(() => window.lab?.ready && window.lab.title, null, { timeout: 120000 });
await page.focus('canvas').catch(() => {});
await wait(1500);
await page.evaluate(() => window.lab.title.enter());
await wait(2600);
const shot = async (n) => { await page.screenshot({ path: join(here, 'shots', `${name}-${n}.jpg`), type: 'jpeg', quality: 88 }); console.log(`shot ${name}-${n}`); };
const ride = async (ms, keys = ['KeyW']) => { for (const k of keys) await page.keyboard.down(k); await wait(ms); for (const k of keys) await page.keyboard.up(k); };

await page.evaluate(() => window.lab.game.cpu(true));
await ride(1600);
await shot(1);
if (args.includes('--rider')) {
  // him on the board from the side and from behind, closer than the ride's eye, for the stance
  for (const [k, side] of [['side', 1], ['back', 0]]) {
    await page.keyboard.down('KeyW');
    await page.evaluate((side) => {
      const L = window.lab, r = L.ride.state(), [x, y, z] = r.position, h = r.heading;
      const fx = Math.sin(h), fz = Math.cos(h);
      const ex = side ? x + fz * 3.2 - fx * 0.6 : x - fx * 3.6, ez = side ? z - fx * 3.2 - fz * 0.6 : z - fz * 3.6;
      L.view([ex, y + 1.3, ez], [x, y + 0.8, z]);
    }, side);
    await wait(250);
    await page.screenshot({ path: join(process.env.OUT ?? here, `${name}-rider-${k}.jpg`), type: 'jpeg', quality: 88 });
    await page.evaluate(() => window.lab.view());
    await page.keyboard.up('KeyW');
  }
}
// tokens ahead: a stretch of trail on the way, seen from a little before it
const trail = await page.evaluate(() => {
  const L = window.lab, list = L.game.tokens().filter((t) => t.line.startsWith('way'));
  const t = list[Math.floor(list.length / 2)];
  L.game.pickups(false);
  L.teleport(L.wayX(t.z + 26), t.z + 26, t.x, t.z);
  return t;
});
await wait(1800);
await shot(2);
await page.evaluate(() => window.lab.game.pickups(true));
// a product ring: Lending's, a little south of it on the way
await page.evaluate(() => { const L = window.lab, g = L.ctx.omni.gates[1]; L.teleport(L.wayX(g.z + 16), g.z + 16, g.x, g.z); });
await ride(1100);
await wait(300);
await shot(3);
// the Pool, riding in with a pair
await page.evaluate(() => { const L = window.lab, p = L.ctx.omni.pool; L.game.give(3, 3); L.teleport(L.wayX(p.z + 30), p.z + 30, p.x, p.z); });
await ride(2600);
await wait(500);
await shot(4);
// below the west cliff: after a few seconds the notice offers R, and R puts him back on the way
await page.evaluate(() => { const L = window.lab, z = 120; L.teleport(L.edgeX(z) - 30, z, L.edgeX(z) - 30, z - 10); });
await wait(5500);
const offer = await page.evaluate(() => ({ held: document.querySelector('#play-flash')?.classList.contains('held'), text: document.querySelector('#play-flash .t')?.textContent, stranded: window.lab.game.stranded() }));
await page.keyboard.press('KeyR');
await wait(400);
const back = await page.evaluate(() => { const r = window.lab.ride.state(), L = window.lab; return { x: r.position[0], z: r.position[2], way: L.wayX(r.position[2]), mode: r.mode }; });
console.log('stranded offer', JSON.stringify(offer), 'after R', JSON.stringify(back));
const cpu = await page.evaluate(() => window.lab.game.cpu());
console.log('trail token', JSON.stringify(trail), 'play cpu', JSON.stringify(cpu));
console.log(errors.length ? `errors:\n  ${[...new Set(errors)].join('\n  ')}` : 'no console errors');
await browser.close();
server.close();
