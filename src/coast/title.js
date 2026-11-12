// The title: the live painted coast under a slow drifting eye, Omnipair's lockup and tagline over it, and one Ride.
//
// The page loads this first (index.html), so the lockup and words stand on a near-black veil while the world is mixed;
// #loading is main.js's loading bar, and when main.js removes it the veil lifts and Ride appears. createTitle(ctx) is
// the game's side: the establishing shot, Ride (click, Enter or Space), Back to title, the personal best, and the
// sound (audio.js), which Ride's gesture starts. Riding in, the words fade and the eye comes down to behind the rider.
//   ?capture, ?clean, ?patch-test=1, ?title=0   no title: straight into the world, as before
import './title.css';
import { CONTROLS } from './options.js';
import { createAudio } from './audio.js';

const html = document.documentElement;
const skip = !html.classList.contains('title');
const $ = (s) => document.querySelector(s);

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
  const title = $('#title'), best = $('#title .best'), howto = $('#title .howto');
  // p: how far into the ride, 0 on the title, 1 riding. state: where p is going.
  let p = skip ? 1 : 0, state = skip ? 'world' : 'title', clock = 0, told = false, cost = 0;

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

  // the words fade as the eye comes down; the best is read each time the title shows
  function place(e) { title.style.opacity = e > 0 ? String(1 - smooth(0, 0.35, e)) : ''; }
  function showBest() {
    let score = 0;
    if (!ctx.capture && !ctx.patchTest) try { score = JSON.parse(localStorage.getItem('omnipair-world.play.v1'))?.best?.score ?? 0; } catch { /* storage off */ }
    best.hidden = !(score > 0);
    best.innerHTML = score > 0 ? `Personal best <b>${Math.round(score).toLocaleString('en')}</b>` : '';
  }
  showBest();

  const holdInput = (on) => { if (ctx.input) { ctx.input.paused = on || !!ctx.options?.isOpen; ctx.input.lockable = !on; } };
  /** Ride: from the click, Enter or Space, which also starts the sound and asks for the mouse. */
  function enter() {
    if (!ready || state !== 'title' || !howto.hidden) return false;
    audio.start();
    ctx.renderer.domElement.requestPointerLock?.()?.catch?.(() => {});
    document.activeElement?.blur?.();
    state = 'entering';
    return true;
  }
  /** Back to the title, from the options. */
  function leave() {
    if (state === 'title' || state === 'leaving') return;
    if (document.pointerLockElement) document.exitPointerLock?.();
    html.classList.remove('stepped');
    html.classList.add('title', 'ready');
    if (state === 'world') p = 1;
    showBest();
    place(ease(p));
    state = 'leaving';
  }
  function finish() {
    state = 'world';
    html.classList.remove('title');
    html.classList.add('stepped');
    place(0);
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
    <button class="close" type="button">Got it</button></div>`;
  const how = (on) => { howto.hidden = !on; if (on) howto.querySelector('.close').focus(); else $('#title .step')?.focus({ preventScroll: true }); };
  $('#title .how')?.addEventListener('click', () => how(true));
  howto.querySelector('.close').addEventListener('click', () => how(false));
  howto.addEventListener('mousedown', (e) => { if (e.target === howto) how(false); });
  addEventListener('keydown', (e) => {
    if (state !== 'title' || e.repeat) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
      if (!howto.hidden) { if (e.code !== 'Space') { e.preventDefault(); how(false); } } else if (!ctx.options?.isOpen && enter()) e.preventDefault();
    }
  });
  ctx.options?.addAction?.('Travel', 'The title screen', 'Back to title', () => { ctx.options.close(); leave(); });

  // with no title the sound waits for any first gesture
  if (skip) {
    const first = () => { audio.start(); removeEventListener('pointerdown', first, true); removeEventListener('keydown', first, true); };
    addEventListener('pointerdown', first, true);
    addEventListener('keydown', first, true);
  }

  const blendPos = new THREE.Vector3();
  ctx.lab.title = {
    /** Rides in, as the button does (the sound starts only if the browser allows it without a gesture). */
    enter: () => { onReady(); return enter(); },
    back: leave,
    state: () => ({ state, p: +p.toFixed(3), ready, skip, howto: !howto.hidden, ms: +cost.toFixed(3) }),
  };
  ctx.lab.audio = { state: audio.state, play: (name, data) => { audio.start(); return audio.play(name, data); }, render: audio.render };

  return {
    audio,
    /** After the follow camera, before drawing: moves p on and lays the eye from it. */
    update(dt) {
      const t0 = performance.now();
      clock += dt;
      if (skip) {
        if (!told) { told = true; ctx.emit('title:enter', {}); }
        audio.update(dt);
        cost += 0.02 * (performance.now() - t0 - cost);
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
      cost += 0.02 * (performance.now() - t0 - cost);
    },
  };
}
