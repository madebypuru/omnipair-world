// The map (M, or the button top right): the headland seen from straight above, painted by the same painter and
// dither as the walk, with a marker for each place worth going to and one for the wanderer himself. Hover or the
// arrow keys name a marker; a click or Enter takes him there: the screen goes dark, he is put down a few metres short
// of it facing it, and the light comes back. Nothing here takes the keyboard's focus: Space stays his jump, and M,
// the arrows and Enter are read off the window. Esc is Patch's, so the map closes with M or its close button.
import * as THREE from 'three';
import './map.css';
import { symbolMarkup } from './brand.js';
import { slot } from './hud.js';

// the part of the world the picture shows: x east, z south, in metres. North (-z) is up and the sea is on the left.
const AREA = { x0: -150, x1: 210, z0: -250, z1: 350 };
const HIGH = 1600; // how high the eye hangs: far enough that the picture is all but flat
const FADE = 320; // ms the screen takes to go dark, and a little longer to come back

const ARCH_GLYPH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V11a9 9 0 0 1 18 0v10h-5v-9a4 4 0 0 0-8 0v9z" fill="currentColor"/></svg>';
const START_GLYPH = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/></svg>';

const el = (tag, cls, html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.innerHTML = html;
  return e;
};
// a control the mouse can press without it ever holding the keyboard's focus
const control = (e) => { e.tabIndex = -1; e.addEventListener('mousedown', (ev) => ev.preventDefault()); return e; };

/**
 * places: [{ id, name, x, z, kind: 'product' | 'great' | 'arch' | 'start', accent, icon (markup), go: { x, z, fx, fz } }]
 * paint(camera): draws the world through that camera to the page's canvas, as a frame of the walk does.
 * canvas: the page's canvas, read straight after paint.
 * heightAt(x, z): the ground, so a marker sits where its thing stands.
 * place(go): puts him at go.x, go.z facing go.fx, go.fz.
 * onOpen(open), onTravel(id): told when the map opens or shuts and when he has been taken somewhere.
 */
export function createMap({ places, paint, canvas, heightAt, place, onOpen, onTravel }) {
  const root = el('div', '', `
    <div class="map-card">
      <div class="map-head"><span class="map-title">${symbolMarkup('omni-mark')}The headland</span><span class="map-keys"><b>M</b> close · arrows, <b>Enter</b> to travel</span></div>
      <div class="map-frame"><canvas class="map-picture"></canvas><div class="map-pins"></div></div>
    </div>`);
  root.id = 'omni-map';
  const close = control(el('button', 'map-close', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'));
  close.setAttribute('aria-label', 'Close the map');
  root.querySelector('.map-head').appendChild(close);
  const button = control(el('button', 'omni-corner map-open', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5zM9 4v13.5M15 6.5V20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg><span>M</span>'));
  button.setAttribute('aria-label', 'Map (M)');
  const fade = el('div', '');
  fade.id = 'omni-fade';
  document.body.append(root, fade);
  slot('tr').appendChild(button);

  const picture = root.querySelector('.map-picture');
  const pins = root.querySelector('.map-pins');
  const markers = places.map((p, i) => {
    const m = control(el('button', `map-pin map-${p.kind}`, `<span class="pin-face" style="--accent: ${p.accent}">${p.icon ?? (p.kind === 'arch' ? ARCH_GLYPH : START_GLYPH)}</span><span class="pin-name">${p.name}</span>`));
    m.setAttribute('aria-label', p.name);
    m.addEventListener('mouseenter', () => select(i));
    m.addEventListener('click', () => travel(p.id));
    pins.appendChild(m);
    return m;
  });
  const me = el('div', 'map-me', '<svg class="me-arrow" viewBox="0 0 20 24" aria-hidden="true"><path d="M10 2l8 19-8-5-8 5z" fill="currentColor" stroke="#0c0c0c" stroke-width="2" stroke-linejoin="round"/></svg>');
  pins.appendChild(me);

  const camera = new THREE.PerspectiveCamera(10, 1, HIGH - 200, HIGH + 100);
  camera.up.set(0, 0, -1);
  const cx = (AREA.x0 + AREA.x1) / 2, cz = (AREA.z0 + AREA.z1) / 2, W = AREA.x1 - AREA.x0, D = AREA.z1 - AREA.z0;
  const v = new THREE.Vector3();
  // the share of the canvas's width and height the area takes
  const crop = { w: 1, h: 1 };

  let painted = false;
  /** Paints the headland from above into the map's picture, with the page's canvas as the easel. */
  function render() {
    painted = true;
    const bw = canvas.width, bh = canvas.height;
    camera.aspect = bw / bh;
    // the area fills the picture's height, or its width on a narrow screen
    const half = Math.max(D / 2, W / 2 / camera.aspect);
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(half / (HIGH - 20)));
    camera.position.set(cx, HIGH, cz);
    camera.lookAt(cx, 0, cz);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    crop.h = D / 2 / half;
    crop.w = (W / 2 / half) / camera.aspect;
    const pw = Math.round(bw * crop.w), ph = Math.round(bh * crop.h);
    paint(camera);
    picture.width = pw; picture.height = ph;
    picture.getContext('2d').drawImage(canvas, (bw - pw) / 2, (bh - ph) / 2, pw, ph, 0, 0, pw, ph);
    places.forEach((p, i) => {
      p.at = spot(p.x, p.z);
      markers[i].style.left = `${(p.at[0] * 100).toFixed(2)}%`;
      markers[i].style.top = `${(p.at[1] * 100).toFixed(2)}%`;
    });
  }
  // where a point on the ground falls in the picture, 0..1 across and down
  function spot(x, z) {
    v.set(x, heightAt(x, z), z).project(camera);
    return [(v.x / crop.w) * 0.5 + 0.5, 0.5 - (v.y / crop.h) * 0.5];
  }

  let isOpen = false, chosen = -1, busy = false;
  function select(i) {
    chosen = i;
    markers.forEach((m, k) => m.classList.toggle('on', k === i));
  }
  function setOpen(on) {
    if (on === isOpen) return;
    isOpen = on;
    if (on) {
      if (document.pointerLockElement) document.exitPointerLock?.();
      render();
      select(-1);
    }
    root.classList.toggle('on', on);
    button.classList.toggle('on', on);
    onOpen?.(on);
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  /** Takes him to place `id`: dark, put down, light again. Resolves once he is there. */
  async function travel(id) {
    const p = places.find((q) => q.id === id);
    if (!p || busy) return false;
    busy = true;
    fade.classList.add('on');
    await wait(FADE);
    place(p.go);
    setOpen(false);
    onTravel?.(id);
    await wait(80);
    fade.classList.remove('on');
    busy = false;
    return true;
  }

  // the arrows step to the nearest marker that lies that way
  function step(dx, dy) {
    if (chosen < 0) { select(0); return; }
    const [a0, b0] = places[chosen].at;
    let best = -1, bestScore = Infinity;
    places.forEach((p, i) => {
      if (i === chosen) return;
      const da = p.at[0] - a0, db = p.at[1] - b0;
      const along = da * dx + db * dy;
      if (along <= 0.001) return;
      const score = along + 2 * Math.abs(da * dy - db * dx);
      if (score < bestScore) { bestScore = score; best = i; }
    });
    if (best >= 0) select(best);
  }
  const ARROWS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyM' && !e.repeat) { setOpen(!isOpen); return; }
    if (!isOpen) return;
    if (ARROWS[e.code]) { e.preventDefault(); step(...ARROWS[e.code]); }
    else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && chosen >= 0) { e.preventDefault(); travel(places[chosen].id); }
  });
  button.addEventListener('click', () => setOpen(!isOpen));
  close.addEventListener('click', () => setOpen(false));

  return {
    get isOpen() { return isOpen; },
    open: () => setOpen(true),
    close: () => setOpen(false),
    travel,
    /** Each frame: where he is and which way he faces, drawn only while the map is up. */
    update(x, z, yaw) {
      if (!isOpen) return;
      const [a, b] = spot(x, z);
      me.style.left = `${(a * 100).toFixed(2)}%`;
      me.style.top = `${(b * 100).toFixed(2)}%`;
      me.style.setProperty('--turn', `${Math.PI - yaw}rad`);
    },
    places,
    /** The painted picture from above and where a point of the ground falls in it (0..1), for the play HUD's round
     *  map. Painted the first time it is asked for. */
    picture() {
      if (!painted) render();
      return { image: picture, spot };
    },
  };
}
