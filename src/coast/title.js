// The title: the live world shown as a painting hung on Omnipair's wall, and the step into it.
//
// The page loads this first (index.html), so the wall, the frame and the plate stand while the world is mixed; the
// plate's #loading row is main.js's loading bar, and when main.js removes it the painting fades up and "Step into the
// painting" appears. createTitle(ctx) is the game's side: the establishing shot, the step in, Back to title, and the
// sound (audio.js), which the step in's click starts.
//
// The painting is #view itself, sized to the frame's opening (--k of the window both ways, so it keeps the window's
// shape). Stepping in scales #view and the wall together until the opening fills the window, while the eye comes down
// from the establishing shot to behind the rider; then #view becomes the whole window again at the same picture.
//   ?capture, ?clean, ?patch-test=1, ?title=0   no title: straight into the world, as before
import './title.css';
import { CONTROLS } from './options.js';
import { createAudio } from './audio.js';

const html = document.documentElement;
const skip = !html.classList.contains('title');
const $ = (s) => document.querySelector(s);

// --- the wall: near-black, a soft light on the frame from above, and the brand's low glow along the floor, put
// through the same ordered dither as the painting (Bayer 8x8, 7 levels, 2 px cells) ---
const BAYER = (() => {
  const m = [[0]];
  let b = m;
  for (let n = 1; n < 8; n *= 2) b = [...b.map((r) => [...r.map((v) => 4 * v), ...r.map((v) => 4 * v + 2)]), ...b.map((r) => [...r.map((v) => 4 * v + 3), ...r.map((v) => 4 * v + 1)])];
  return b.map((r) => r.map((v) => (v + 0.5) / 64));
})();
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const GLOW = [
  { u: 0.06, c: hex('#37a9fb'), w: 0.12, h: 0.2 },
  { u: 0.22, c: hex('#ef8332'), w: 0.08, h: 0.11 },
  { u: 0.4, c: hex('#083db5'), w: 0.12, h: 0.13 },
  { u: 0.64, c: hex('#30e7d7'), w: 0.13, h: 0.16 },
  { u: 0.84, c: hex('#37a9fb'), w: 0.09, h: 0.14 },
  { u: 0.97, c: hex('#ef8332'), w: 0.05, h: 0.08 },
];
const wave = (u) => 0.75 + 0.15 * Math.sin(u * 37 + 1.3) + 0.1 * Math.sin(u * 91 + 0.4) + 0.06 * Math.sin(u * 173);
function paintWall() {
  const canvas = $('#title .wall');
  if (!canvas) return;
  const W = Math.ceil(innerWidth / 2), H = Math.ceil(innerHeight / 2);
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const img = g.createImageData(W, H), d = img.data;
  const L = 6; // seven levels
  const base = [0.05, 0.043, 0.04];
  const cols = GLOW.map((b) => Float32Array.from({ length: W }, (_, x) => { const u = x / W; return Math.exp(-(((u - b.u) / b.w) ** 2)) * wave(u + b.u); }));
  for (let y = 0; y < H; y++) {
    const v = y / H, up = 1 - v;
    const light = 0.05 * Math.exp(-(((v - 0.02) / 0.55) ** 2));
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const spot = light * Math.exp(-(((u - 0.5) / 0.42) ** 2));
      let r = base[0] + spot, gg = base[1] + spot * 0.92, bb = base[2] + spot * 0.8;
      for (let k = 0; k < GLOW.length; k++) {
        const b = GLOW[k], a = cols[k][x] * Math.exp(-((up / (b.h * (0.5 + 0.6 * cols[k][x]))) ** 1.3)) * 0.8;
        r += b.c[0] * a; gg += b.c[1] * a; bb += b.c[2] * a;
      }
      const t = BAYER[y & 7][x & 7], i = 4 * (x + y * W);
      d[i] = 255 * Math.min(1, Math.floor(r * L + t) / L);
      d[i + 1] = 255 * Math.min(1, Math.floor(gg * L + t) / L);
      d[i + 2] = 255 * Math.min(1, Math.floor(bb * L + t) / L);
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}
let wallTimer = 0;
paintWall();
addEventListener('resize', () => { clearTimeout(wallTimer); wallTimer = setTimeout(paintWall, 120); });

// --- ready: main.js removes #loading after the first frames are drawn ---
let ready = false;
const onReady = () => {
  if (ready || $('#loading')) return;
  ready = true;
  if (skip) { html.classList.remove('notitle'); $('#title')?.remove(); return; }
  html.classList.add('ready');
};
new MutationObserver(onReady).observe($('#title .under') ?? document.body, { childList: true });

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const ENTER = 1.6, LEAVE = 1.1;

/** The game's side of the title. ctx: BRIEF.md's Contracts. Returns { update(dt), audio }. */
export function createTitle(ctx) {
  const { THREE } = ctx.lab;
  const audio = createAudio(ctx);
  ctx.audio = audio;
  const view = $('#view'), room = $('#title .room'), under = $('#title .under'), howto = $('#title .howto');
  // p: how far into the world, 0 on the wall, 1 riding. state: where p is going.
  let p = skip ? 1 : 0, state = skip ? 'world' : 'title', clock = 0, told = false;

  // the establishing shot: from over the sea a little behind the rider, along the cliffs toward the arch and the low
  // sun, drifting slowly; stepping in is then a short dolly down to the ride's own eye
  const ARCH = ctx.lab.ARCH, sunDir = ctx.shared.uSunDir.value;
  const est = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), look: new THREE.Vector3() };
  const dummy = new THREE.PerspectiveCamera();
  function establish(t) {
    const f = ctx.ride?.mounted && ctx.ride.position ? ctx.ride.position : ctx.player.feet;
    const ah = Math.hypot(ARCH.x - f.x, ARCH.z - f.z) || 1, sh = Math.hypot(sunDir.x, sunDir.z) || 1;
    // a tall window sees less across: there the look turns toward the land, so the cliffs and the arch stay in
    const tall = Math.min(1, Math.max(0, (1.2 - ctx.camera.aspect) / 0.7)), w = 0.4 - 0.2 * tall;
    let dx = (1 - w) * (ARCH.x - f.x) / ah + w * sunDir.x / sh, dz = (1 - w) * (ARCH.z - f.z) / ah + w * sunDir.z / sh;
    const n = Math.hypot(dx, dz) || 1; dx /= n; dz /= n;
    const back = 30 + 4 * Math.sin(t * 0.05), side = -15 + 6 * Math.sin(t * 0.037 + 0.7);
    const x = f.x - dx * back - dz * side, z = f.z - dz * back + dx * side;
    const y = Math.max(ctx.heightAt(x, z) + 8, f.y + 14 + 2.5 * Math.sin(t * 0.043 + 2));
    est.pos.set(x, y, z);
    const turn = 90 * tall + 20 * Math.sin(t * 0.029);
    est.look.set(f.x + dx * 300 - dz * turn, f.y + 12 - 12 * tall, f.z + dz * 300 + dx * turn);
    dummy.position.copy(est.pos);
    dummy.lookAt(est.look);
    est.quat.copy(dummy.quaternion);
  }

  // where the frame's opening is, and the transform that takes it to the whole window at e
  function place(e) {
    if (!html.classList.contains('title')) { view.style.transform = ''; room.style.transform = ''; return; }
    const x0 = view.offsetLeft, y0 = view.offsetTop, w = view.clientWidth || 1, h = view.clientHeight || 1;
    const sx = 1 + (innerWidth / w - 1) * e, sy = 1 + (innerHeight / h - 1) * e;
    view.style.transform = e > 0 ? `translate(${-x0 * e}px, ${-y0 * e}px) scale(${sx}, ${sy})` : '';
    room.style.transform = e > 0 ? `translate(${x0 * (1 - e) - x0 * sx}px, ${y0 * (1 - e) - y0 * sy}px) scale(${sx}, ${sy})` : '';
    room.style.opacity = String(1 - smooth(0, 0.75, e));
    under.style.opacity = String(1 - smooth(0, 0.3, e));
  }

  const holdInput = (on) => { if (ctx.input) { ctx.input.paused = on || !!ctx.options?.isOpen; ctx.input.lockable = !on; } };
  /** Step in: from the click or Enter, which also starts the sound and asks for the mouse. */
  function enter() {
    if (!ready || state !== 'title' || !howto.hidden) return false;
    audio.start();
    ctx.renderer.domElement.requestPointerLock?.()?.catch?.(() => {});
    document.activeElement?.blur?.();
    state = 'entering';
    return true;
  }
  /** Back to the wall, from the options. */
  function leave() {
    if (state === 'title' || state === 'leaving') return;
    if (document.pointerLockElement) document.exitPointerLock?.();
    // #view goes back into the frame's opening this instant, scaled so it still fills the window, and draws at its
    // new size before the next paint (main.js's fit() listens for resize)
    html.classList.remove('stepped');
    html.classList.add('title', 'ready');
    if (state === 'world') p = 1;
    place(ease(p));
    dispatchEvent(new Event('resize'));
    state = 'leaving';
  }
  function finish() {
    state = 'world';
    // #view is the window again, and main.js's fit() (it listens for resize) gives the renderer that size now, in this
    // frame before it is drawn, so no frame shows a cleared canvas
    html.classList.remove('title');
    html.classList.add('stepped');
    place(1);
    dispatchEvent(new Event('resize'));
    holdInput(false);
    ctx.emit('title:enter', {});
  }

  $('#title .step')?.addEventListener('click', enter);
  $('#title .step')?.addEventListener('mousedown', (e) => e.preventDefault());
  // how to play: the game in five lines and every key, from the options' own sheet
  howto.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-labelledby="howto-title">
    <h2 id="howto-title">How to play</h2>
    <ol>
      <li>Ride the coast on a skim board: fast on water and wet sand, slower on turf.</li>
      <li>Gather tokens of two kinds, A (cream) and B (dark, ringed).</li>
      <li>Only pairs count. Ride into the Pool on the point to bank every pair.</li>
      <li>Ride through a product's ring for its power: Trade, Lending, Leverage.</li>
      <li>Leaps, flips and spins build a combo that multiplies your next deposit.</li>
    </ol>
    <table><tbody>${CONTROLS.map(([a, k]) => `<tr><td>${a}</td><td>${k}</td></tr>`).join('')}</tbody></table>
    <button class="close" type="button">Back to the painting</button></div>`;
  const how = (on) => { howto.hidden = !on; if (on) howto.querySelector('.close').focus(); else $('#title .step')?.focus({ preventScroll: true }); };
  $('#title .how')?.addEventListener('click', () => how(true));
  howto.querySelector('.close').addEventListener('click', () => how(false));
  howto.addEventListener('mousedown', (e) => { if (e.target === howto) how(false); });
  addEventListener('keydown', (e) => {
    if (state !== 'title' || e.repeat) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (!howto.hidden) { e.preventDefault(); how(false); } else if (!ctx.options?.isOpen && enter()) e.preventDefault();
    }
  });
  ctx.options?.addAction?.('Travel', 'The painting on the wall', 'Back to title', () => { ctx.options.close(); leave(); });

  // with no title the sound waits for any first gesture
  if (skip) {
    const first = () => { audio.start(); removeEventListener('pointerdown', first, true); removeEventListener('keydown', first, true); };
    addEventListener('pointerdown', first, true);
    addEventListener('keydown', first, true);
  }

  const blendPos = new THREE.Vector3();
  ctx.lab.title = {
    /** Steps in, as the button does (the sound starts only if the browser allows it without a gesture). */
    enter: () => { onReady(); return enter(); },
    back: leave,
    state: () => ({ state, p: +p.toFixed(3), ready, skip, howto: !howto.hidden }),
  };
  ctx.lab.audio = { state: audio.state, play: (name, data) => { audio.start(); return audio.play(name, data); }, render: audio.render };

  return {
    audio,
    /** After the follow camera, before drawing: moves p on and lays the eye and the frame from it. */
    update(dt) {
      clock += dt;
      if (skip) {
        if (!told) { told = true; ctx.emit('title:enter', {}); }
        audio.update(dt);
        return;
      }
      if (state === 'entering') { p = Math.min(1, p + dt / ENTER); if (p >= 1) finish(); }
      else if (state === 'leaving') { p = Math.max(0, p - dt / LEAVE); if (p <= 0) state = 'title'; }
      if (state !== 'world') holdInput(true);
      const e = ease(p);
      if (state !== 'world' && !ctx.follow?.free) {
        establish(clock);
        const cam = ctx.camera;
        // from the establishing shot down to wherever the ride's eye is
        blendPos.lerpVectors(est.pos, cam.position, e);
        cam.position.copy(blendPos);
        cam.quaternion.slerpQuaternions(est.quat, cam.quaternion, e);
        place(e);
      }
      audio.update(dt);
    },
  };
}
