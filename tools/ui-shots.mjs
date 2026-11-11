// The on-screen glass at five window sizes, headless, from a build in dist/. Writes shots/ui/<size>-<state>.png and
// fails (exit 1) when two visible pieces of UI overlap without one holding the other, when a piece or its text leaves
// the window or its own box, when a caption is set under 13px, when a click takes the keyboard's focus, or on a page error.
//   npm run build && CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node tools/ui-shots.mjs [360x640 ...]
import { mkdirSync, createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { guard } from './no-pointer-lock.mjs';

guard(chromium);
const here = resolve(fileURLToPath(import.meta.url), '..', '..');
const SIZES = ['360x640', '800x1350', '1024x768', '1440x900', '1920x1080'];
const sizes = process.argv.slice(2).filter((a) => /^\d+x\d+$/.test(a));
const out = resolve(here, 'shots', 'ui');
mkdirSync(out, { recursive: true });

const root = resolve(here, 'dist');
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

let failures = 0;
const check = (ok, what) => { if (!ok) { failures++; console.log(`FAIL ${what}`); } return ok; };

// Every piece of glass that owns a region of the screen. Each is checked against every other one.
const PIECES = ['#omni-count', '#omni-board-head', '.omni-corner', '.goal-toast', '#omni-prompt', '#omni-lockup', '#hint', '#omni-panel',
  '#omni-board .stage', '#omni-board .words', '#omni-board .sign', '#omni-board .keys', '#omni-map .map-card', '#omni-goals', '#omni-options .opt-card'];

/** What is on screen now, and what is wrong with it. Runs in the page. */
function inspect(pieces) {
  const W = innerWidth, H = innerHeight;
  const seen = (e) => e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && e.getBoundingClientRect().width > 0;
  const name = (e) => e.id ? `#${e.id}` : `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}`;
  const shown = [];
  for (const sel of pieces) for (const e of document.querySelectorAll(sel)) if (seen(e)) shown.push(e);
  const box = (e) => e.getBoundingClientRect();
  const problems = [];
  for (const e of shown) {
    const r = box(e);
    if (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5) problems.push(`${name(e)} leaves the window: ${[r.left, r.top, r.right, r.bottom].map(Math.round)}`);
  }
  for (let i = 0; i < shown.length; i++) {
    for (let j = i + 1; j < shown.length; j++) {
      const a = shown[i], b = shown[j];
      if (a.contains(b) || b.contains(a)) continue;
      const p = box(a), q = box(b);
      const w = Math.min(p.right, q.right) - Math.max(p.left, q.left), h = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
      if (w > 0.5 && h > 0.5) problems.push(`${name(a)} overlaps ${name(b)} by ${Math.round(w)} x ${Math.round(h)}`);
    }
  }
  // text: every line inside its piece and inside the window
  for (const e of shown) {
    const r = box(e);
    const walk = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      if (!t.textContent.trim() || !seen(t.parentElement)) continue;
      // a line scrolled out of a list's view is not clipped: the list scrolls
      let scrolls = false;
      for (let a = t.parentElement; a && a !== e.parentElement; a = a.parentElement) if (/auto|scroll/.test(getComputedStyle(a).overflowY)) scrolls = true;
      if (scrolls) continue;
      const range = document.createRange();
      range.selectNodeContents(t);
      for (const l of range.getClientRects()) {
        if (l.width < 1) continue;
        if (l.left < r.left - 1 || l.right > r.right + 1 || l.top < r.top - 1 || l.bottom > r.bottom + 1 || l.right > W || l.bottom > H)
          problems.push(`text clipped in ${name(e)}: "${t.textContent.trim().slice(0, 40)}"`);
      }
    }
  }
  for (const e of document.querySelectorAll('#omni-board .words .title, #omni-board .words .text'))
    if (seen(e) && parseFloat(getComputedStyle(e).fontSize) < 13) problems.push(`${name(e)} set at ${getComputedStyle(e).fontSize}`);
  return { problems: [...new Set(problems)], shown: shown.map(name), ui: document.body.dataset.ui };
}

async function shoot(page, size, state) {
  await page.screenshot({ path: join(out, `${size}-${state}.png`) });
  const r = await page.evaluate(inspect, PIECES);
  const ok = check(!r.problems.length, `${size} ${state}:\n  ${r.problems.join('\n  ')}`);
  console.log(`${ok ? 'ok  ' : '    '} ${size} ${state} [${r.ui}] ${r.shown.join(' ')}`);
  return r;
}

for (const size of sizes.length ? sizes : SIZES) {
  const [width, height] = size.split('x').map(Number);
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${base}?nopad`);
  await page.waitForFunction(() => window.lab?.ready, null, { timeout: 120000 });
  const sleep = (ms) => page.waitForTimeout(ms);
  const ui = () => page.evaluate(() => document.body.dataset.ui);
  await sleep(800);
  await shoot(page, size, 'idle');

  // by the first stone, its prompt up: he stands where E would open it, the board shut
  await page.evaluate(() => { window.lab.omni.visit(0); window.lab.omni.press(); });
  await sleep(1200);
  const prompt = await shoot(page, size, 'prompt');
  check(prompt.shown.includes('#omni-prompt'), `${size} prompt: the prompt is not showing`);

  await page.evaluate(() => window.lab.omni.visit(0));
  await sleep(1400);
  await shoot(page, size, 'board');
  check(await ui() === 'board', `${size} board: data-ui is ${await ui()}`);
  await page.evaluate(() => window.lab.omni.browse(1));
  await sleep(1400);
  await page.evaluate(() => window.lab.omni.slide(1));
  await sleep(500);
  await shoot(page, size, 'board-diagram');

  // the map earns "Lay of the land" as it opens: its toast waits for the map to shut
  await page.evaluate(() => { window.lab.omni.press(); window.lab.map.open(); });
  await sleep(900);
  const map = await shoot(page, size, 'map-toast');
  check(await page.evaluate(() => document.querySelectorAll('.goal-toast').length) > 0, `${size} map: no toast was queued`);
  check(!map.shown.includes('div.goal-toast'), `${size} map: a toast shows over the map`);
  // a click on a corner button opens and shuts the map without taking the keyboard's focus
  await page.click('.map-open');
  await sleep(700);
  check(await page.evaluate(() => document.activeElement === document.body), `${size}: the map button took the focus`);
  const after = await shoot(page, size, 'toast');
  check(after.shown.includes('div.goal-toast'), `${size}: the held toast did not show once the map shut`);

  // the goals list up, and a goal earned under it: "In his shoes" (V)
  await page.evaluate(() => { window.lab.achievements.open(); window.lab.first(true); });
  await sleep(1500);
  const goals = await shoot(page, size, 'goals-toast');
  check(await page.evaluate(() => window.lab.achievements.state().earned.includes('first')), `${size} goals: "first" was not earned`);
  check(!goals.shown.includes('div.goal-toast'), `${size} goals: a toast shows over the list`);
  await page.evaluate(() => { window.lab.achievements.close(); window.lab.first(false); });

  // all three read, so the count says where to go next and the great mark lights; then its panel
  await page.evaluate(() => { const L = window.lab; L.omni.stones.forEach((s, i) => { L.omni.browse(i); L.omni.slide(s.slides.length - 1); }); L.omni.press(); });
  await page.waitForFunction(() => window.lab.omni.state().lit > 0.9, null, { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => window.lab.omni.visit(3));
  await sleep(900);
  const panel = await shoot(page, size, 'panel');
  check(panel.shown.includes('#omni-panel'), `${size} panel: the great mark's panel is not showing`);

  // the options: the gear opens them without taking the focus, Esc (no pointer lock here) shuts them and gives the
  // keys back to the walk, O opens them again
  await page.click('.options-open');
  await sleep(700);
  check(await page.evaluate(() => document.activeElement === document.body), `${size}: the options button took the focus`);
  const opts = await shoot(page, size, 'options');
  check(opts.ui === 'options' && opts.shown.includes('div.opt-card'), `${size} options: not showing (data-ui ${opts.ui})`);
  check(!opts.shown.includes('#omni-panel'), `${size} options: the great mark's panel shows under them`);
  await page.focus('#omni-options .opt-seg button[aria-checked="true"]');
  await page.keyboard.press('Escape');
  await sleep(500);
  check(await ui() !== 'options', `${size}: Esc did not shut the options`);
  check(await page.evaluate(() => document.activeElement === document.body), `${size}: the focus stayed in the shut options`);
  await page.keyboard.press('KeyO');
  await sleep(500);
  check(await ui() === 'options', `${size}: O did not open the options`);
  await page.keyboard.press('KeyO');
  await sleep(300);

  check(!errors.length, `${size}: page errors\n  ${[...new Set(errors)].join('\n  ')}`);
  await context.close();
}

await browser.close();
server.close();
console.log(failures ? `${failures} failure(s)` : 'all clear');
process.exitCode = failures ? 1 : 0;
