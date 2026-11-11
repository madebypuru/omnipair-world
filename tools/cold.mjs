// A first visit: a new browser profile each time, so the network and shader caches are empty, with the page's CPU
// and the network slowed to a normal laptop's (4x CPU, 30 Mbit/s, 40 ms). Prints how long `ready` took, the longest
// the page went without a frame while loading and when, the demo's own lap times, and any slow frame in the first
// seconds after ready, standing and then walking. After patch/geometry-painter's tools/cold.mjs.
//
//   node tools/cold.mjs <url> [runs, default 1] [--cpu=4]
//
// Muted, headless Chromium. Other work on the GPU slows compiling a lot, so say what else was running.
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const flag = (name, fallback) => { const hit = args.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const [url, runs = '1'] = args.filter((a) => !a.startsWith('--'));
const cpu = Number(flag('cpu', '4'));

for (let run = 1; run <= Number(runs); run++) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME, // a Chromium of your own; without it, Playwright's
    headless: true,
    args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
  await page.addInitScript(() => {
    // the test window can't lock the pointer either
    Element.prototype.requestPointerLock = function () { return Promise.resolve(); };
    const frames = { last: 0, slow: [] };
    window.__frames = frames;
    const tick = (now) => {
      if (frames.last && now - frames.last > 50) frames.slow.push(`${Math.round(now - frames.last)}@${(now / 1000).toFixed(2)}`);
      frames.last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 30e6 / 8, uploadThroughput: 10e6 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  const started = Date.now();
  await page.goto(url);
  await page.waitForFunction(() => window.lab?.ready, null, { timeout: 180000, polling: 50 });
  const ready = (Date.now() - started) / 1000;
  const slowSince = async () => page.evaluate(() => window.__frames.slow.splice(0));
  const loading = await slowSince();
  await page.waitForTimeout(2500);
  const standing = await slowSince();
  await page.mouse.click(640, 360);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyW');
  const walking = await slowSince();
  const laps = await page.evaluate(() => window.lab.timings);
  console.log(JSON.stringify({ run, ready: Number(ready.toFixed(1)), loading: loading.filter((s) => parseInt(s, 10) > 300), standing, walking, laps, errors: errors.slice(0, 5) }));
  await browser.close();
}
