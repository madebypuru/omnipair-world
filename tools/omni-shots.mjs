// Omnipair's things, headless (build first: npm run build). Writes shots/omni-*.jpg and .png and prints what it saw.
//   node tools/omni-shots.mjs [stills] [ui] [test] [collide] [dither] [--query "impasto=0"]
// stills: the arch, each stone near and from 20 m, the great mark dark and lit (capture mode, clock stepped by hand)
// ui: the page as a player gets it: loading, the prompt, each stone's panel and the great mark's
// dither: one view with Bayer 8x8 and with 16x16, at the brand page's settings (levels 7, brightness 1, contrast 1)
// test: ?patch-test=1, and the pass / fail lines it logs
// collide: walks him into a stone and says how close he got
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
const extra = flag('query', '');

const root = resolve(here, 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
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
  await page.goto(`${base}?nopad&${query}&${extra}`);
  await page.waitForFunction(() => window.lab?.ready, null, { timeout: 120000 });
  return { page, problems };
}
const still = (input = {}) => ({ move: { x: 0, y: 0 }, walk: false, sprint: false, strafe: false, jump: false, look: { x: 0, y: 0 }, zoom: 0, device: 'keyboard', ...input });

if (want('stills')) {
  const { page, problems } = await open('capture');
  const shots = await page.evaluate((stillSrc) => {
    const L = window.lab, still = eval(stillSrc);
    const g = (x, z) => L.heightAt(x, z);
    const A = L.ARCH;
    const views = {};
    // the arch from the clifftop at z = -60, and from the place on the clifftop that looks at it down the sun
    const cx = L.edgeX(-60) + 4;
    views['omni-arch-z60'] = [[cx, -56, A.x, A.z], [cx, g(cx, -60) + 3, -60], [A.x, 15, A.z]];
    const sx = L.shared.uSunDir.value.x, sz = L.shared.uSunDir.value.z, sl = Math.hypot(sx, sz);
    let k = 60, ex, ez;
    for (; k < 160; k += 2) { ex = A.x - (sx / sl) * k; ez = A.z - (sz / sl) * k; if (ex > L.edgeX(ez) + 2) break; }
    views['omni-arch-sun'] = [[ex + 3, ez + 3, A.x, A.z], [ex, g(ex, ez) + 2.5, ez], [A.x, 12, A.z]];
    // each stone close to, and from twenty metres
    for (const s of L.omni.stones) {
      const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
      views[`omni-stone-${s.key}-near`] = [[s.x + fx * 5, s.z + fz * 5, s.x, s.z], [s.x + fx * 4.6, s.y + 1.9, s.z + fz * 4.6], [s.x, s.y + 1.5, s.z]];
      views[`omni-stone-${s.key}-20m`] = [[s.x + fx * 22, s.z + fz * 22, s.x, s.z], [s.x + fx * 20, g(s.x + fx * 20, s.z + fz * 20) + 1.8, s.z + fz * 20], [s.x, s.y + 1.5, s.z]];
    }
    return { out: Object.keys(views), views };
  }, still.toString());
  for (const name of shots.out) {
    await page.evaluate(([v]) => { const L = window.lab; L.view(null); L.teleport(...v[0]); L.step(1 / 60, 30); L.view(v[1], v[2]); L.step(1 / 60, 2); }, [shots.views[name]]);
    await page.screenshot({ path: join(out, `${name}.jpg`), type: 'jpeg', quality: 88 });
    console.log('shot', name, JSON.stringify(shots.views[name][1].map((v) => +v.toFixed(1))));
  }
  for (const lit of [false, true]) {
    const st = await page.evaluate((lit) => {
      const L = window.lab, G = L.omni.great, gx = Math.sin(G.yaw), gz = Math.cos(G.yaw);
      if (lit) for (let i = 0; i < L.omni.stones.length; i++) L.omni.visit(i);
      L.view(null);
      L.teleport(G.x + gx * 14, G.z + gz * 14, G.x, G.z);
      L.step(1 / 60, lit ? 400 : 30);
      const ex = G.x + gx * 30 + gz * 6, ez = G.z + gz * 30 - gx * 6;
      L.view([ex, L.heightAt(ex, ez) + 3.5, ez], [G.x, G.y + 9, G.z]);
      L.step(1 / 60, 2);
      return L.omni.state();
    }, lit);
    const name = lit ? 'omni-great-lit' : 'omni-great-dark';
    await page.screenshot({ path: join(out, `${name}.jpg`), type: 'jpeg', quality: 88 });
    console.log('shot', name, JSON.stringify(st));
  }
  console.log('counts', JSON.stringify(await page.evaluate(() => window.lab.counts)));
  if (problems.length) console.log('problems (stills):\n' + [...new Set(problems)].slice(0, 10).join('\n'));
  await page.close();
}

if (want('collide')) {
  const { page, problems } = await open('capture');
  const r = await page.evaluate((stillSrc) => {
    const L = window.lab, still = eval(stillSrc), s = L.omni.stones[0];
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    L.teleport(s.x + fx * 3.5, s.z + fz * 3.5, s.x, s.z);
    L.setInput(() => still({ move: { x: 0, y: 1 } }));
    let closest = Infinity, through = false;
    for (let i = 0; i < 240; i++) {
      L.step(1 / 60, 1);
      const p = L.player.feet, along = (p.x - s.x) * fx + (p.z - s.z) * fz;
      closest = Math.min(closest, along);
      if (along < -0.2) through = true;
    }
    L.setInput(() => still());
    return { closest: +closest.toFixed(2), through, faceAt: 0.36 };
  }, still.toString());
  console.log('collide', JSON.stringify(r), r.through ? 'FAIL: walked through the stone' : 'ok: stopped by the stone');
  if (problems.length) console.log('problems (collide):\n' + [...new Set(problems)].slice(0, 10).join('\n'));
  await page.close();
}

if (want('ui')) {
  // the loading screen, held: the page is stopped before its script runs
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    await page.route(/\.js$/, (route) => route.abort());
    await page.goto(base);
    await page.evaluate(() => document.getElementById('loading').style.setProperty('--done', '0.6'));
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(out, 'omni-ui-loading.png') });
    await page.close();
  }
  const { page, problems } = await open('');
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload();
  await page.waitForFunction(() => window.lab?.ready, null, { timeout: 120000 });
  const stones = await page.evaluate(() => window.lab.omni.stones.map((s) => s.key));
  for (const [i, key] of stones.entries()) {
    await page.evaluate((i) => {
      const L = window.lab, s = L.omni.stones[i];
      const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
      L.teleport(s.x + fx * 2.8 - fz * 1.2, s.z + fz * 2.8 + fx * 1.2, s.x, s.z);
      L.follow.yaw = L.player.yaw + 0.5;
    }, i);
    await page.waitForTimeout(1500);
    if (i === 0) {
      console.log('ui prompt', JSON.stringify(await page.evaluate(() => window.lab.omni.state())));
      await page.screenshot({ path: join(out, 'omni-ui-prompt.png') });
    }
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(800);
    console.log(`ui panel ${key}`, JSON.stringify(await page.evaluate(() => ({ ...window.lab.omni.state(), focus: document.activeElement?.tagName }))));
    await page.screenshot({ path: join(out, `omni-ui-panel-${key}.png`) });
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => {
    const L = window.lab, G = L.omni.great;
    L.teleport(G.x + 7 * Math.sin(G.yaw), G.z + 7 * Math.cos(G.yaw), G.x, G.z);
    L.follow.yaw = L.player.yaw + 0.4;
  });
  await page.waitForTimeout(2500);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(800);
  console.log('ui panel great', JSON.stringify(await page.evaluate(() => ({ ...window.lab.omni.state(), saved: localStorage.getItem('omnipair-world.found.v2') }))));
  await page.screenshot({ path: join(out, 'omni-ui-panel-great.png') });
  if (problems.length) console.log('problems (ui):\n' + [...new Set(problems)].slice(0, 10).join('\n'));
  await page.close();
}

if (want('dither')) {
  for (const m of [8, 16]) {
    const { page, problems } = await open(`capture&dmatrix=${m}&dlevels=7&dbright=1&dcontrast=1`);
    await page.evaluate(() => {
      const L = window.lab, s = L.omni.stones[0], fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
      L.teleport(s.x + fx * 8, s.z + fz * 8, s.x, s.z);
      L.step(1 / 60, 30);
      L.view([s.x + fx * 7.5 + fz * 2, s.y + 2.4, s.z + fz * 7.5 - fx * 2], [s.x - fx * 30, s.y + 1.2, s.z - fz * 30]);
      L.step(1 / 60, 2);
    });
    await page.screenshot({ path: join(out, `dither-${m}.jpg`), type: 'jpeg', quality: 92 });
    console.log('shot', `dither-${m}`);
    if (problems.length) console.log(`problems (dither ${m}):\n` + [...new Set(problems)].slice(0, 10).join('\n'));
    await page.close();
  }
}

if (want('test')) {
  const lines = [];
  const t0 = Date.now();
  const { page, problems } = await open('patch-test=1', (t) => { if (/^(pass|fail) /.test(t)) lines.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${t}`); });
  await page.waitForTimeout(100);
  const deadline = Date.now() + 60000;
  while (lines.filter((l) => / (pass|fail) /.test(l)).length < 4 && Date.now() < deadline) await page.waitForTimeout(250);
  console.log('patch-test lines:\n' + lines.join('\n'));
  if (problems.length) console.log('problems (test):\n' + [...new Set(problems)].slice(0, 10).join('\n'));
  await page.close();
}

await browser.close();
server.close();
