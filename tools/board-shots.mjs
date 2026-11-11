// The product boards and the arch, headless. Writes shots/board-* and shots/arch-mark-* and prints what it saw.
//   node tools/board-shots.mjs [world] [slides] [arch] [test] [--dist dist]
// world: each board as you walk up to it (capture). slides: every slide of every board while browsing, through the
// keys a player presses. arch: the arch from the clifftop at two places, from above, and with the dither on.
// test: ?patch-test=1 and its pass / fail lines.
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
const wanted = args.filter((a, i) => !a.startsWith('--') && !(args[i - 1] ?? '').startsWith('--'));
const want = (n) => !wanted.length || wanted.includes(n);
const out = resolve(here, 'shots');
mkdirSync(out, { recursive: true });

const root = resolve(here, flag('dist', 'dist'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
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

async function open(query, onLine) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text().slice(0, 800)}`); onLine?.(m.text()); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(`${base}?nopad&${query}`);
  await page.waitForFunction(() => window.lab?.ready, null, { timeout: 120000 });
  return { page, problems };
}
const report = (name, problems) => { if (problems.length) console.log(`problems (${name}):\n` + [...new Set(problems)].slice(0, 10).join('\n')); };

if (want('world')) {
  const { page, problems } = await open('capture');
  const keys = await page.evaluate(() => window.lab.omni.stones.map((s) => s.key));
  for (const [i, key] of keys.entries()) {
    // walking up the way toward the stone and its board, a dozen metres short
    await page.evaluate((i) => {
      const L = window.lab, s = L.omni.stones[i], fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), c = Math.cos(s.yaw), n = Math.sin(s.yaw);
      const mx = s.x + 1.9 * c, mz = s.z - 1.9 * n;
      L.view(null);
      L.teleport(mx + fx * 12, mz + fz * 12, mx, mz);
      L.step(1 / 60, 30);
      L.view([mx + fx * 11 - c * 2, L.heightAt(mx + fx * 11, mz + fz * 11) + 2.4, mz + fz * 11 + n * 2], [mx, s.y + 1.9, mz]);
      L.step(1 / 60, 2);
    }, i);
    await page.screenshot({ path: join(out, `board-${key}-world.jpg`), type: 'jpeg', quality: 88 });
    console.log('shot', `board-${key}-world`);
  }
  report('world', problems);
  await page.close();
}

if (want('slides')) {
  const { page, problems } = await open('');
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload();
  await page.waitForFunction(() => window.lab?.ready, null, { timeout: 120000 });
  const events = [];
  await page.exposeFunction('noteEvent', (e) => events.push(e));
  await page.evaluate(() => { window.lab.omni.on('browse', (k) => window.noteEvent(`browse ${k}`)); window.lab.omni.on('read', (k) => window.noteEvent(`read ${k}`)); });
  const keys = await page.evaluate(() => window.lab.omni.stones.map((s) => [s.key, s.slides.length]));
  console.log('E', JSON.stringify(await page.evaluate(() => window.lab.omni.visit(0))));
  for (const [i, [key, count]] of keys.entries()) {
    await page.waitForFunction((i) => window.lab.omni.state().browse === i, i, { timeout: 10000 });
    await page.waitForTimeout(1400);
    for (let n = 0; n < count; n++) {
      if (n) { await page.keyboard.press(n % 2 ? 'ArrowRight' : 'KeyD'); await page.waitForTimeout(350); }
      await page.screenshot({ path: join(out, `board-${key}-${n + 1}.png`) });
      console.log('shot', `board-${key}-${n + 1}`, JSON.stringify(await page.evaluate(() => ({ ...window.lab.omni.state(), focus: document.activeElement?.tagName }))));
    }
    if (i < keys.length - 1) await page.keyboard.press(i % 2 ? 'KeyS' : 'ArrowDown');
  }
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(out, 'board-after.png') });
  console.log('after E', JSON.stringify(await page.evaluate(() => window.lab.omni.state())), 'events', JSON.stringify(events));
  report('slides', problems);
  await page.close();
}

if (want('arch')) {
  for (const dither of [false, true]) {
    const { page, problems } = await open(`capture${dither ? '&dmatrix=8&dlevels=7&dbright=1.1&dcontrast=1.18' : ''}`);
    const views = await page.evaluate((dither) => {
      const L = window.lab, A = L.ARCH, g = (x, z) => L.heightAt(x, z);
      const on = (z) => [L.wayX(z) - 2, z];
      const v = {};
      const path = (z) => { const [x] = on(z); return [[x, z, A.x, A.z], [x, g(x, z) + 1.7, z], [A.x, L.arch.opening.y - 2, A.z]]; };
      if (dither) v['arch-mark-dither'] = path(-40);
      else {
        v['arch-mark-path40'] = path(-40);
        v['arch-mark-path20'] = path(-20);
        v['arch-mark-path60'] = path(-60);
        const ex = L.edgeX(-90) + 3;
        v['arch-mark-north'] = [[ex, -90, A.x, A.z], [ex, g(ex, -90) + 2, -90], [A.x, 30, A.z]];
        const sx = L.wayX(5) - 6;
        v['arch-mark-south'] = [[sx, 5, A.x, A.z], [sx, g(sx, 5) + 2, 5], [A.x, 26, A.z]];
        v['arch-mark-above'] = [[L.wayX(-40), -40, A.x, A.z], [A.x + 70, 150, A.z + 40], [A.x, 20, A.z]];
      }
      return v;
    }, dither);
    for (const [name, v] of Object.entries(views)) {
      // he stands a few metres behind the eye, out of the picture
      await page.evaluate((v) => {
        const L = window.lab, [x, z, fx, fz] = v[0], l = Math.hypot(fx - x, fz - z);
        L.view(null); L.teleport(x - ((fx - x) / l) * 5, z - ((fz - z) / l) * 5, fx, fz); L.step(1 / 60, 30); L.view(v[1], v[2]); L.step(1 / 60, 2);
      }, v);
      await page.screenshot({ path: join(out, `${name}.jpg`), type: 'jpeg', quality: 88 });
      console.log('shot', name);
    }
    report('arch', problems);
    await page.close();
  }
}

if (want('test')) {
  const lines = [];
  const t0 = Date.now();
  const { page, problems } = await open('patch-test=1', (t) => { if (/^(pass|fail) /.test(t)) lines.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${t}`); });
  const deadline = Date.now() + 90000;
  while (lines.length < 4 && Date.now() < deadline) await page.waitForTimeout(250);
  console.log('patch-test lines:\n' + lines.join('\n'));
  report('test', problems);
  await page.close();
}

await browser.close();
server.close();
