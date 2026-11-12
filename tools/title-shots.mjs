// The title and the sound, headless, from a build (dist/ or the folder named first). Writes shots/title/: the title at
// three sizes, how to play, a six-frame filmstrip of the step in, the world after it, Back to title, and mix.wav (ten
// seconds of the whole mix rendered offline). Fails (exit 1) on a page error, a piece of the title out of the window,
// sound that does not run after stepping in or does not pause with the options, an effect that will not play, or a
// mix that is silent or clips.
//   npx vite build --outDir dist-title && CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node tools/title-shots.mjs dist-title
import { mkdirSync, createReadStream, existsSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { guard } from './no-pointer-lock.mjs';

guard(chromium);
const here = resolve(fileURLToPath(import.meta.url), '..', '..');
const root = resolve(here, process.argv[2] ?? 'dist');
const out = resolve(here, 'shots', 'title');
mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
const server = createServer((req, res) => {
  let file = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(root) || !existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu'] });

let failures = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures++; return ok; };

/** Every piece of the title inside the window, and the words clear of the controls. */
function layout() {
  const r = (s) => document.querySelector(s)?.getBoundingClientRect();
  const W = innerWidth, H = innerHeight, bad = [];
  for (const s of ['#title .lockup', '#title .head', '#title .step', '#title .how', '#title .keys-brief']) {
    const b = r(s);
    if (!b || b.width < 1) bad.push(`${s} missing`);
    else if (b.left < -0.5 || b.top < -0.5 || b.right > W + 0.5 || b.bottom > H + 0.5) bad.push(`${s} leaves the window: ${[b.left, b.top, b.right, b.bottom].map(Math.round)}`);
  }
  const u = r('#title .actions'), k = r('#title .keys-brief'), h = r('#title .head'), top = r('#title .lockup');
  if (u && k && !(k.top >= u.bottom || k.left >= u.right)) bad.push(`the controls overlap the actions ${[k.left, k.top, u.right, u.bottom].map(Math.round)}`);
  if (h && top && h.top < top.bottom) bad.push('the headline runs into the lockup');
  const v = r('#view');
  return { bad, view: v && [v.width, v.height].map(Math.round), head: h && [h.width, h.height].map(Math.round) };
}

for (const size of ['1440x900', '800x1350', '360x640']) {
  const [width, height] = size.split('x').map(Number);
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${base}?nopad`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, `${size}-loading.png`) });
  await page.waitForFunction(() => window.lab?.ready && window.lab.title?.state().ready, null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(out, `${size}-title.png`) });
  const l = await page.evaluate(layout);
  check(!l.bad.length, `${size} title layout ${l.bad.join('; ')} (view ${l.view}, headline ${l.head})`);
  check(await page.evaluate(() => getComputedStyle(document.querySelector('#omni-top')).visibility === 'hidden'), `${size} no HUD on the title`);

  if (size === '360x640') {
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.lab.title.state().state === 'world', null, { timeout: 20000 });
    check(true, 'Space rides in');
  }
  if (size === '1440x900') {
    await page.evaluate(() => localStorage.setItem('omnipair-world.play.v1', JSON.stringify({ best: { score: 1240, delivered: 9, combo: 3 } })));
    await page.reload();
    await page.waitForFunction(() => window.lab?.ready && window.lab.title?.state().ready, null, { timeout: 120000 });
    await page.waitForTimeout(2500);
    check(await page.evaluate(() => document.querySelector('#title .best').textContent.includes('1,240')), 'the personal best shows');
    await page.screenshot({ path: join(out, `${size}-best.png`) });
    await page.click('#title .how');
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(out, `${size}-howto.png`) });
    await page.click('#title .howto .close');
    check(await page.evaluate(() => !window.lab.title.state().howto), 'how to play closes');

    const fired = page.evaluate(() => new Promise((r) => window.lab.ctx.on('title:enter', () => r(true))));
    // the ride in: six frames by how far it has gone
    await page.click('#title .step');
    const marks = [0.02, 0.2, 0.4, 0.6, 0.8, 1];
    for (let i = 0; i < marks.length; i++) {
      await page.waitForFunction((m) => window.lab.title.state().p >= m, marks[i], { timeout: 20000 });
      const p = await page.evaluate(() => window.lab.title.state().p);
      await page.screenshot({ path: join(out, `step-${i}.png`) });
      console.log(`     frame ${i} at p ${p}`);
    }
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(out, `${size}-world.png`) });
    const st = await page.evaluate(() => ({ title: window.lab.title.state(), audio: window.lab.audio.state(), lock: !!document.pointerLockElement, cls: document.documentElement.className, view: [document.querySelector('#view').clientWidth, document.querySelector('canvas').width] }));
    check(st.title.state === 'world' && !st.cls.includes('title'), `in the world after stepping in (${JSON.stringify(st.title)}, html.${st.cls})`);
    check(st.view[0] === width, `the painting is the whole window again (${st.view})`);
    check(st.lock, 'the mouse was asked for on the step in');
    check(await fired, 'title:enter fired');
    check(st.audio.context === 'running', `sound runs after stepping in (${st.audio.context})`);

    // every effect plays and makes its nodes
    for (const name of ['token', 'pair', 'product', 'deposit', 'finish', 'leap', 'land', 'crash', 'splash', 'click', 'gull', 'refuse', 'boost', 'bump', 'mount', 'whistle']) {
      const r = await page.evaluate((n) => { const before = window.lab.audio.state().made; const ok = window.lab.audio.play(n, { kind: 'b', key: 'lending', pairs: 5, clean: false }); return { ok, made: window.lab.audio.state().made - before, error: window.lab.audio.state().error }; }, name);
      check(r.ok && r.made > 0 && !r.error, `effect ${name}: ${r.made} nodes${r.error ? `, ${r.error}` : ''}`);
    }
    // the events the other modules emit reach it
    const heard = await page.evaluate(() => { const c = window.lab.ctx, b = window.lab.audio.state().made; c.emit('token:collect', { kind: 'a' }); c.emit('ride:land', { clean: true }); c.emit('pool:deposit', { pairs: 3 }); return window.lab.audio.state().made - b; });
    check(heard > 0, `events make sound (${heard} nodes)`);

    // pause with the options and come back without a click
    await page.evaluate(() => window.lab.options.open());
    await page.waitForTimeout(400);
    const paused = await page.evaluate(() => window.lab.audio.state().context);
    await page.evaluate(() => window.lab.options.close());
    await page.waitForTimeout(400);
    const back = await page.evaluate(() => window.lab.audio.state().context);
    check(paused === 'suspended' && back === 'running', `sound pauses with the options (${paused}) and resumes (${back})`);
    // L mutes
    await page.keyboard.press('KeyL');
    await page.waitForTimeout(300);
    const muted = await page.evaluate(() => window.lab.audio.state());
    await page.keyboard.press('KeyL');
    check(muted.muted && muted.context === 'suspended', `L mutes (${muted.context})`);

    // ten seconds of the mix, offline
    const mix = await page.evaluate(async () => {
      const { channels, rate, made } = await window.lab.audio.render(10);
      let peak = 0, sum = 0, n = 0;
      const win = [];
      for (const ch of channels) for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]); if (a > peak) peak = a; sum += ch[i] * ch[i]; n++; }
      for (let s = 0; s < 10; s++) { let w = 0; const ch = channels[0]; for (let i = s * rate; i < (s + 1) * rate; i++) w += ch[i] * ch[i]; win.push(+(10 * Math.log10(w / rate + 1e-12)).toFixed(1)); }
      const L = channels[0], R = channels[1], bytes = new DataView(new ArrayBuffer(44 + L.length * 4));
      const str = (o, s) => [...s].forEach((c, i) => bytes.setUint8(o + i, c.charCodeAt(0)));
      str(0, 'RIFF'); bytes.setUint32(4, 36 + L.length * 4, true); str(8, 'WAVEfmt '); bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, 2, true);
      bytes.setUint32(24, rate, true); bytes.setUint32(28, rate * 4, true); bytes.setUint16(32, 4, true); bytes.setUint16(34, 16, true); str(36, 'data'); bytes.setUint32(40, L.length * 4, true);
      for (let i = 0; i < L.length; i++) { bytes.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); bytes.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
      let bin = ''; const u8 = new Uint8Array(bytes.buffer); for (let i = 0; i < u8.length; i += 32768) bin += String.fromCharCode(...u8.subarray(i, i + 32768));
      return { peak, rms: Math.sqrt(sum / n), win, made, wav: btoa(bin) };
    });
    writeFileSync(join(out, 'mix.wav'), Buffer.from(mix.wav, 'base64'));
    const rmsDb = 20 * Math.log10(mix.rms);
    check(mix.peak < 0.98 && mix.peak > 0.05, `mix peak ${mix.peak.toFixed(3)}`);
    check(rmsDb > -40 && rmsDb < -12, `mix RMS ${rmsDb.toFixed(1)} dBFS; per second ${mix.win.join(' ')}; ${mix.made} nodes`);

    // the worst pile-up at full volume: a fast streak, a big deposit, a leverage, a crash and a boost at once
    const pile = await page.evaluate(async () => {
      const fx = [];
      for (let i = 0; i < 12; i++) fx.push([0.5 + i * 0.08, 'token', { kind: i % 2 ? 'a' : 'b' }]);
      fx.push([1, 'deposit', { pairs: 16 }], [1, 'product', { key: 'leverage' }], [1.05, 'crash'], [1.1, 'boost'], [1.2, 'splash'], [1.3, 'finish'], [1.3, 'bump', { speed: 12 }]);
            const { channels } = await window.lab.audio.render(4, { speed: 1, sea: 1, lagoon: 1, wind: 1, water: 1, spray: 1, glide: 1, roll: 1, grit: 1 }, fx, { music: 1, effects: 1 });
      let peak = 0; for (const ch of channels) for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
      return { peak, music: 1, effects: 1 };
    });
    check(pile.peak < 0.98, `pile-up peak ${pile.peak.toFixed(3)} (music ${pile.music}, effects ${pile.effects})`);
    // per-frame cost of the title and the sound while riding
    await page.waitForTimeout(3000);
    const ms = await page.evaluate(() => window.lab.title.state().ms);
    check(ms < 0.5, `title and sound per frame ${ms} ms`);

    // Back to title from the options
    await page.evaluate(() => window.lab.options.open());
    await page.waitForTimeout(300);
    await page.click('#omni-options .opt-action:text("Back to title")');
    await page.waitForFunction(() => window.lab.title.state().state === 'title', null, { timeout: 20000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(out, `${size}-back.png`) });
    check((await page.evaluate(layout)).bad.length === 0, 'Back to title lays the wall out again');
  }
  check(!errors.length, `${size} page errors ${[...new Set(errors)].join(' | ')}`);
  await context.close();
}
await browser.close();
server.close();
console.log(failures ? `${failures} failure(s)` : 'all clear');
process.exitCode = failures ? 1 : 0;
