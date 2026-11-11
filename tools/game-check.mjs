// The game loop, played headless from a build: picks up a trail of tokens, rides through each product ring, banks at
// the Pool, finishes the run and reloads to see the best kept. Writes shots/game/*.png and fails (exit 1) on a broken
// rule or a page error. Also times a frame with the tokens and without them.
//   npx vite build --outDir dist-game && CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node tools/game-check.mjs [--dist dist-game]
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
const root = resolve(here, flag('dist', 'dist-game'));
const out = resolve(here, 'shots', 'game');
mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4' };
const server = createServer((req, res) => {
  let file = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(root) || !existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/?nopad&title=0`;
const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true, args: ['--mute-audio', '--ignore-gpu-blocklist', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'd3d11'}`, '--enable-gpu'] });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

let failures = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures++; return ok; };
const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });
const sleep = (ms) => page.waitForTimeout(ms);
const game = () => page.evaluate(() => window.lab.game.state());

await page.goto(url);
await page.waitForFunction(() => window.lab?.ready && window.lab.game, null, { timeout: 120000 });
await sleep(800);
// a clean slate in this browser profile
await page.evaluate(() => { localStorage.clear(); });
await page.reload();
await page.waitForFunction(() => window.lab?.ready && window.lab.game, null, { timeout: 120000 });
await sleep(1500);
const start = await game();
check(start.tokens > 260 && start.tokens < 340, `${start.tokens} tokens laid: ${JSON.stringify(await page.evaluate(() => window.lab.game.tokens().reduce((n, t) => { const k = t.line.split('-')[0]; n[k] = (n[k] ?? 0) + 1; return n; }, {})))}`);
await shot('01-start');

// a trail beside the way: from short of it, looking along it; then ridden through, token by token
const trail = await page.evaluate(() => {
  const all = window.lab.game.tokens();
  const first = all.filter((t) => t.line.startsWith('way'))[4];
  return all.filter((t) => t.line === first.line);
});
const kinds = { a: trail.filter((t) => t.kind === 'a').length, b: trail.filter((t) => t.kind === 'b').length };
await page.evaluate(([t]) => { window.lab.teleport(t.x + 1, t.z + 14, t.x, t.z); }, trail);
await sleep(700);
await shot('02-trail-near');
const far = await page.evaluate(() => {
  const all = window.lab.game.tokens();
  const t = all.filter((k) => k.line.startsWith('way'))[10];
  window.lab.teleport(t.x + 2, t.z + 80, t.x, t.z);
  return t;
});
await sleep(700);
await shot('03-trail-80m');
// the ride publishes where he is once a frame, so each step is a teleport and a frame
for (const t of trail) await page.evaluate((k) => { window.lab.teleport(k.x, k.z, k.x, k.z - 5); window.lab.step(1 / 60); }, t);
const picked = await game();
check(picked.a >= kinds.a && picked.b >= kinds.b && picked.a + picked.b >= trail.length, `trail of ${trail.length} (${kinds.a} A, ${kinds.b} B) picked up: carrying ${picked.a} A, ${picked.b} B`);
await sleep(400);
await shot('04-carrying');

// each product ring, ridden through in short steps from south of it to north of it
async function through(key) {
  return page.evaluate((key) => {
    const L = window.lab, g = L.ctx.omni.gates.find((q) => q.key === key);
    for (let s = -8.5; s <= 9.5; s += 3) { L.teleport(g.x - g.nx * s, g.z - g.nz * s, g.x + g.nx * 20, g.z + g.nz * 20); L.step(1 / 60); }
    return L.game.state();
  }, key);
}
await page.evaluate(() => { const L = window.lab, g = L.ctx.omni.gates.find((q) => q.key === 'lending'); L.teleport(g.x - g.nx * 16 + 2, g.z - g.nz * 16, g.x, g.z); });
await sleep(700);
await shot('04b-gate-ready');
await page.evaluate(() => { const s = window.lab.game.state(); window.lab.game.pickups(false); window.lab.game.give(12 - s.a, 2 - s.b); });
let s = await through('trade');
check(s.a === 7 && s.b === 6 && s.used.includes('trade'), `trade ring: 12 A, 2 B became ${s.a} A, ${s.b} B`);
await sleep(300);
await shot('05-trade');
await page.evaluate(() => window.lab.game.give(3, 0));
s = await through('lending');
check(s.a === 10 && s.b === 10 && s.debt?.amount === 5, `lending ring: 10 A, 6 B evened to ${s.a} A, ${s.b} B, owing ${s.debt?.amount}`);
await sleep(300);
await shot('06-lending');
s = await through('leverage');
check(s.leverage.on && s.multiplier === 2, `leverage ring: on, x${s.multiplier}`);
s = await through('leverage');
check(s.leverage.on && s.cool.leverage > 0, 'leverage ring cools: a second pass does nothing new');
await sleep(300);
await shot('07-leverage');

// two clean tricks under leverage take it to x3, and the combo builds on top
await page.evaluate(() => { window.lab.game.land({ airtime: 1.2, flips: 1, spins: 0, clean: true }); window.lab.game.land({ airtime: 1.6, flips: 0, spins: 2, clean: true }); });
s = await game();
check(s.leverage.level === 3 && s.combo === 5, `tricks: leverage x${s.leverage.level}, combo ${s.combo}, multiplier ${s.multiplier}`);

await page.evaluate(() => { const L = window.lab, p = L.ctx.omni.pool; L.teleport(p.x + 6, p.z + p.r + 26, p.x, p.z); });
await sleep(700);
await shot('07b-pool-approach');
check(await page.evaluate(() => { const c = document.querySelector('#play-minimap canvas'), g = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let lit = 0; for (let i = 0; i < g.length; i += 4) if (g[i] + g[i + 1] + g[i + 2] > 200) lit++; return lit > 40; }), 'the round map is drawn');
// into the Pool from the south, in steps: the deposit
const before = s;
s = await page.evaluate(() => {
  const L = window.lab, p = L.ctx.omni.pool;
  for (let d = p.r + 10; d >= p.r - 4; d -= 3) { L.teleport(p.x + 4, p.z + d, p.x, p.z); L.step(1 / 60); }
  return L.game.state();
});
const expect = Math.round(before.pairs * 10 * before.multiplier - Math.min(before.debt?.amount ?? 0, before.pairs * before.multiplier) * 10);
check(s.score === expect && s.delivered === before.pairs && s.inPool, `deposit: ${before.pairs} pairs x${before.multiplier} less ${before.debt?.amount ?? 0} owed = ${s.score} (expected ${expect})`);
await sleep(250);
check(await page.evaluate(() => document.querySelector('#play-count')?.classList.contains('on')), 'the count-up is showing');
await shot('08-deposit');
await sleep(1500);
const lit = await page.evaluate(() => window.lab.omni.state().lit);
check(lit > 0.6, `the great mark lights (${lit})`);
const goals = await page.evaluate(() => window.lab.achievements.state().earned);
check(['first-pair', 'pairs-10', 'leveraged', 'products'].every((g) => goals.includes(g)), `goals earned: ${goals.join(', ')}`);
await shot('09-pool-lit');

// Enter in the Pool: the score card
await page.keyboard.press('Enter');
await sleep(500);
const card = await game();
check(!!card.card && card.card.newBest && card.card.score === s.score, `score card: ${JSON.stringify(card.card)}`);
check(await page.evaluate(() => document.activeElement === document.body), 'the card took no focus');
await shot('10-card');
await page.keyboard.press('Enter');
await sleep(400);
check(!(await game()).card, 'Enter rides on');

// the best is kept across a reload
await page.reload();
await page.waitForFunction(() => window.lab?.ready && window.lab.game, null, { timeout: 120000 });
await sleep(800);
const again = await game();
check(again.saved?.best?.score === s.score && again.score === 0, `after reload: best ${again.saved?.best?.score}, this run ${again.score}`);
check(again.teach.includes('collect') && again.teach.includes('pool'), `lessons remembered: ${again.teach.join(', ')}`);
await shot('11-reloaded');

// a frame with the game's things and without them: the frame's whole cost, GPU waited for, at 1600 x 900
const cost = await page.evaluate(async () => {
  const L = window.lab, gl = L.renderer.getContext(), px = new Uint8Array(4);
  const t = L.game.tokens().find((k) => k.line.startsWith('way'));
  L.teleport(t.x + 1, t.z + 20, t.x, t.z);
  const time = (n) => { L.step(1 / 60, 3); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const t0 = performance.now(); for (let i = 0; i < n; i++) { L.step(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } return (performance.now() - t0) / n; };
  const groups = [L.ctx.scene.children.find((c) => c.children?.some((m) => m.material?.uniforms?.tWhere))];
  const on = [], off = [];
  for (let k = 0; k < 4; k++) {
    on.push(time(40));
    groups.forEach((g) => { if (g) g.visible = false; });
    off.push(time(40));
    groups.forEach((g) => { if (g) g.visible = true; });
  }
  const med = (a) => a.sort((x, y) => x - y)[a.length >> 1];
  return { with: +med(on).toFixed(2), without: +med(off).toFixed(2) };
});
console.log(`frame: ${cost.with} ms with the tokens, ${cost.without} ms without (1600 x 900, stepped, GPU waited)`);

check(!errors.length, `page errors${errors.length ? `:\n  ${[...new Set(errors)].join('\n  ')}` : ': none'}`);
await browser.close();
server.close();
console.log(failures ? `${failures} failure(s)` : 'all clear');
process.exitCode = failures ? 1 : 0;
