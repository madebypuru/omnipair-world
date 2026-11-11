// Browsing a product's board, as on Bruno Simon's project boards: E by a stone turns the eye square onto its board,
// he stands still, and the board's slides are laid over the painting as crisp DOM. Left / Right (A / D) page the
// slides, Up / Down (W / S) travel to the previous / next product's board and keep browsing, E leaves.
// Reading a product's last slide marks it found (omni.visit).
//
// One state, { at, slide, travel }, changed only by `go` and `jump`; keys, clicks, window.lab and the patch-test
// autopilot all go through them. The pictures are drawings in ART, keyed by the `art` names in brand.js.
import * as THREE from 'three';
import { PRODUCTS, CREAM, INK, symbolMarkup, iconMarkup } from './brand.js';
import { slot } from './hud.js';
import './boards.css';

const N = PRODUCTS.length;
const PIC_W = 3.0; // the board's picture in metres (omni.js paints it)
const FADE = 0.28; // seconds out, and again in, when travelling between boards

const PREV = new Set(['ArrowLeft', 'KeyA']), NEXT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']), DOWN = new Set(['ArrowDown', 'KeyS']);

/** The browse controller. omni: the stones and boards; travel(i): put him at board i's stand; dom: draw the viewer. */
export function createBrowse({ omni, travel, dom = true }) {
  const state = { at: -1, slide: 0, travel: null, w: 0, last: 0 };
  const view = dom ? createViewer({ go: (n) => go(n), jump: (d) => jump(d) }) : null;

  function go(n) {
    if (state.at < 0 || state.travel) return;
    const count = PRODUCTS[state.at].slides.length;
    state.slide = THREE.MathUtils.clamp(n, 0, count - 1);
    if (state.slide === count - 1) omni.visit(state.at);
    view?.show(state.at, state.slide, omni.found);
  }
  function open(i) {
    if (i < 0 || i >= N) return;
    state.at = state.last = i; state.slide = 0; state.travel = null;
    travel(i);
    omni.emit('browse', PRODUCTS[i].key);
    view?.show(i, 0, omni.found);
  }
  function close() {
    state.at = -1; state.travel = null;
    view?.hide();
  }
  /** To the board d products along (wrapping round), with a fade; he goes with it. */
  function jump(d) {
    if (state.at < 0 || state.travel) return;
    state.travel = { to: (state.at + d + N) % N, t: 0, moved: false };
  }
  function key(code) {
    if (state.at < 0) return false;
    if (PREV.has(code)) go(state.slide - 1);
    else if (NEXT.has(code)) go(state.slide + 1);
    else if (UP.has(code)) jump(-1);
    else if (DOWN.has(code)) jump(1);
    else return false;
    return true;
  }
  addEventListener('keydown', (e) => { if (!e.repeat && key(e.code)) e.preventDefault(); });

  const eye = new THREE.Vector3(), target = new THREE.Vector3(), look = new THREE.Vector3(), fwd = new THREE.Vector3();
  return {
    state,
    get at() { return state.at; },
    open, close, go, jump, key,
    /** Moves the clock on and turns the camera (already placed by the follow) toward the board, by how far in we are. */
    update(dt, camera) {
      const t = state.travel;
      if (t) {
        t.t += dt;
        if (!t.moved && t.t >= FADE) {
          t.moved = true;
          state.at = state.last = t.to; state.slide = 0;
          travel(t.to);
          omni.emit('browse', PRODUCTS[t.to].key);
          view?.show(t.to, 0, omni.found);
        }
        if (t.t >= 2 * FADE) state.travel = null;
      }
      view?.fade(t ? 1 - Math.abs(t.t / FADE - 1) : 0);
      const want = state.at >= 0 ? 1 : 0;
      state.w += (want - state.w) * (1 - Math.exp(-dt * 4.5));
      if (Math.abs(state.w - want) < 1e-3) state.w = want;
      if (state.w <= 0) return;
      const b = omni.boards[state.last];
      const frac = view ? view.fraction() : { w: 0.6, y: 0.1 };
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      const D = PIC_W / (2 * frac.w * tanV * camera.aspect);
      const nx = Math.sin(b.yaw), nz = Math.cos(b.yaw);
      eye.set(b.cx + nx * D, b.cy, b.cz + nz * D);
      // look a little below the picture, so it sits where the viewer's card is
      target.set(b.cx, b.cy - D * frac.y * tanV, b.cz);
      const w = state.w * state.w * (3 - 2 * state.w);
      camera.getWorldDirection(fwd);
      look.copy(camera.position).addScaledVector(fwd, D).lerp(target, w);
      camera.position.lerp(eye, w);
      camera.lookAt(look);
    },
  };
}

// ---- the viewer: the slide over the board, its dots and words, the neighbours' signposts and a key card ----

function createViewer({ go, jump }) {
  const root = document.createElement('div');
  root.id = 'omni-board';
  root.innerHTML = `
    <div class="frame"><div class="stack">
      <div class="stage"><div class="art"></div><div class="dots"></div>
        <div class="arrow prev" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></div>
        <div class="arrow next" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></div></div>
      <div class="words"><div class="title"></div><p class="text"></p></div>
      <div class="nav">
        <div class="sign up"><span class="k">↑</span><span class="to"></span></div>
        <div class="keys">
          <div><b>← →</b><span>A D</span><i>Prev · Next slide</i></div>
          <div><b>↑ ↓</b><span>W S</span><i>Other boards</i></div>
          <div><b>E</b><span></span><i>Leave</i></div>
        </div>
        <div class="sign down"><span class="to"></span><span class="k">↓</span></div>
      </div>
    </div></div>`;
  document.body.appendChild(root);
  // the board's name takes the count's place in the top band (hud.js)
  const head = document.createElement('div');
  head.id = 'omni-board-head';
  head.innerHTML = '<span class="icon"></span><span class="name"></span><span class="count"></span>';
  slot('tl').appendChild(head);
  const fader = document.createElement('div');
  fader.id = 'omni-board-fade';
  document.body.appendChild(fader);
  const $ = (s) => root.querySelector(s);
  const stage = $('.stage'), art = $('.art'), dots = $('.dots');
  // clicks page too, without ever taking the keyboard's focus
  const tap = (el, fn) => el.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
  let shown = { at: -1, slide: 0 };
  tap($('.prev'), () => go(shown.slide - 1));
  tap($('.next'), () => go(shown.slide + 1));
  tap($('.sign.up'), () => jump(-1));
  tap($('.sign.down'), () => jump(1));

  // CSS places the card (boards.css); the camera reads where it landed so the board's frame sits round it
  function fraction() {
    const r = stage.getBoundingClientRect(), W = innerWidth, H = innerHeight;
    return { w: r.width / W, y: 1 - 2 * (r.top + r.height / 2) / H };
  }

  return {
    fraction,
    fade(v) { fader.style.opacity = v.toFixed(3); },
    hide() { root.classList.remove('on'); shown = { at: -1, slide: 0 }; },
    show(at, slide, found) {
      const p = PRODUCTS[at], s = p.slides[slide];
      const fresh = shown.at !== at;
      shown = { at, slide };
      root.style.setProperty('--accent', p.ramp[2]);
      root.style.setProperty('--light', p.ramp[3]);
      if (fresh) {
        head.querySelector('.icon').innerHTML = iconMarkup(p, 'omni-board-icon');
        head.querySelector('.name').textContent = p.name;
        head.style.setProperty('--accent', p.ramp[2]);
        $('.sign.up .to').textContent = PRODUCTS[(at - 1 + N) % N].name;
        $('.sign.down .to').textContent = PRODUCTS[(at + 1) % N].name;
        dots.innerHTML = p.slides.map(() => '<i></i>').join('');
      }
      head.querySelector('.count').textContent = `${slide + 1} / ${p.slides.length}${found[at] ? ' · read' : ''}`;
      art.innerHTML = draw(p, s.art);
      [...dots.children].forEach((d, i) => d.classList.toggle('here', i === slide));
      $('.words .title').textContent = s.title;
      $('.words .text').textContent = s.text;
      $('.prev').classList.toggle('off', slide === 0);
      $('.next').classList.toggle('off', slide === p.slides.length - 1);
      root.classList.add('on');
    },
  };
}

// ---- the drawings: 960 by 540, near-black ground, cream marks, the product's gradient for the pool ----

let acc = CREAM; // the product's own colour, for the drawing being made
const C = CREAM, DIM = 'rgba(251,249,247,0.55)', FAINT = 'rgba(251,249,247,0.16)';
const SYM = symbolMarkup('').match(/<path d="([^"]+)"/)[1];

function draw(p, name) {
  const g = `g-${p.key}`;
  acc = p.ramp[2];
  const defs = `<defs>
    <linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.ramp[0]}"/><stop offset="0.35" stop-color="${p.ramp[1]}"/>
      <stop offset="0.78" stop-color="${p.ramp[2]}"/><stop offset="1" stop-color="${p.ramp[3]}"/></linearGradient>
    <radialGradient id="${g}-glow" cx="0.5" cy="1" r="0.75"><stop offset="0" stop-color="${p.ramp[2]}" stop-opacity="0.32"/>
      <stop offset="1" stop-color="${p.ramp[2]}" stop-opacity="0"/></radialGradient>
    <marker id="${g}-head" viewBox="0 0 12 12" refX="7" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
      <path d="M2 1.5L9 6 2 10.5" fill="none" stroke="${C}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></marker>
    <marker id="${g}-headc" viewBox="0 0 12 12" refX="7" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
      <path d="M2 1.5L9 6 2 10.5" fill="none" stroke="${p.ramp[2]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></marker>
  </defs>`;
  const k = { p, g };
  const body = (ART[name] ?? ART.close)(k);
  return `<svg viewBox="0 0 960 540" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, 'Helvetica Neue', Arial, sans-serif">${defs}
    <rect width="960" height="540" fill="#100E0D"/><rect width="960" height="540" fill="url(#${g}-glow)"/>${body}</svg>`;
}

const text = (x, y, s, { size = 22, fill = DIM, anchor = 'middle', weight = 500 } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${s}</text>`;
const symbol = (cx, cy, w, fill = C) => {
  const s = w / 136.589;
  return `<path d="${SYM}" fill="${fill}" transform="translate(${cx - w / 2} ${cy - (134.168 * s) / 2}) scale(${s})"/>`;
};
/** The pool: a wide tile in the product's gradient with the symbol on it. */
const pool = ({ g }, cx, cy, w, h, label = 'the pool') =>
  `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${Math.min(w, h) * 0.26}" fill="url(#${g})"/>
   ${symbol(cx, cy, Math.min(w, h) * 0.42)}${label ? text(cx, cy + h / 2 + 34, label) : ''}`;
/** A token: A is cream with ink letters, B is ink ringed in cream. */
const token = (cx, cy, r, letter, label) => {
  const a = letter === 'A';
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${a ? C : INK}" stroke="${C}" stroke-width="${a ? 0 : 3}"/>
    ${text(cx, cy + r * 0.36, letter, { size: r, fill: a ? INK : C, weight: 700 })}${label ? text(cx, cy + r + 34, label) : ''}`;
};
const arrow = ({ g }, d, { colour = false, dash = false, width = 4 } = {}) =>
  `<path d="${d}" fill="none" stroke="${colour ? acc : C}" stroke-width="${width}" stroke-linecap="round"
    ${dash ? 'stroke-dasharray="2 12"' : ''} marker-end="url(#${g}-head${colour ? 'c' : ''})"/>`;
const person = (cx, cy, label) =>
  `<circle cx="${cx}" cy="${cy - 26}" r="18" fill="none" stroke="${C}" stroke-width="3.5"/>
   <path d="M${cx - 30} ${cy + 26}a30 30 0 0 1 60 0" fill="none" stroke="${C}" stroke-width="3.5" stroke-linecap="round"/>
   ${text(cx, cy + 66, label)}`;
const step = (x, y, n) => `<circle cx="${x}" cy="${y}" r="15" fill="${acc}"/>${text(x, y + 6, n, { size: 16, fill: INK, weight: 700 })}`;

const ART = {
  // Trade
  swap: (k) => token(170, 250, 52, 'A', 'you give') + arrow(k, 'M240 250H340') + pool(k, 480, 250, 220, 150)
    + arrow(k, 'M620 250H720') + token(790, 250, 52, 'B', 'you get'),
  'two-into-one': (k) => token(250, 130, 44, 'A', '') + token(710, 130, 44, 'B', '')
    + arrow(k, 'M290 170C340 220 370 250 400 285') + arrow(k, 'M560 285C590 250 620 220 668 172', { colour: true })
    + pool(k, 480, 370, 320, 150, 'one pool holds both tokens of the pair')
    + text(300, 250, 'A in', { anchor: 'end', fill: C }) + text(660, 250, 'B out', { anchor: 'start', fill: C }),
  merge: (k) => {
    let s = '';
    const drops = [[150, 120], [110, 230], [180, 330], [130, 430], [250, 190], [270, 390], [220, 270]];
    for (const [x, y] of drops) s += `<circle cx="${x}" cy="${y}" r="16" fill="${acc}" opacity="0.85"/>` + arrow(k, `M${x + 24} ${y}Q${(x + 470) / 2} ${(y + 250) / 2 + (250 - y) * 0.2} 452 ${250 + (y - 250) * 0.25}`, { width: 2.5 });
    return s + text(190, 500, 'all of its liquidity') + pool(k, 600, 250, 280, 190, 'the pair’s one pool')
      + token(830, 175, 30, 'A', '') + token(830, 325, 30, 'B', '')
      + arrow(k, 'M790 185C760 195 755 215 748 228', { colour: true }) + arrow(k, 'M748 272C755 290 765 305 792 314', { colour: true })
      + text(830, 400, 'every trade', { fill: C }) + text(830, 428, 'meets all of it', { size: 18 });
  },
  // Lending
  'lend-borrow': (k) => person(150, 240, 'lender') + arrow(k, 'M220 240H330') + text(275, 222, 'lend', { size: 18 })
    + pool(k, 480, 240, 220, 150) + arrow(k, 'M630 240H740') + text(685, 222, 'borrow', { size: 18 }) + person(810, 240, 'borrower'),
  'loan-loop': (k) => pool(k, 300, 270, 240, 170, 'the pool') + person(760, 270, 'borrower')
    + arrow(k, 'M690 190C600 130 480 130 420 170') + step(560, 128, '1') + token(560, 190, 22, 'B', '') + text(640, 108, 'collateral in', { anchor: 'start', size: 20 })
    + arrow(k, 'M440 270H680') + step(560, 245, '2') + token(560, 290, 22, 'A', '') + text(600, 300, 'loan out', { anchor: 'start', size: 20 })
    + arrow(k, 'M690 350C600 420 480 420 420 370', { colour: true }) + step(560, 418, '3') + text(640, 450, 'interest back', { anchor: 'start', size: 20 })
    + arrow(k, 'M180 270H90', { colour: true }) + text(80, 230, 'to lenders', { anchor: 'start', size: 20 }),
  shared: (k) => pool(k, 480, 240, 260, 170, 'the same liquidity')
    + arrow(k, 'M140 160H310') + arrow(k, 'M310 210H140') + text(225, 130, 'trades', { size: 20 })
    + arrow(k, 'M650 200H800', { colour: true }) + person(860, 240, '') + text(725, 180, 'loans', { size: 20 })
    + arrow(k, 'M800 290H650', { colour: true, dash: true }) + text(725, 325, 'interest', { size: 20 }),
  // Leverage
  'long-short': (k) => `<path d="M120 440H860M120 440V90" stroke="${FAINT}" stroke-width="2"/>`
    + `<circle cx="300" cy="300" r="12" fill="${C}"/>` + `<path d="M140 330L220 310 300 300" fill="none" stroke="${DIM}" stroke-width="4" stroke-linecap="round"/>`
    + arrow(k, 'M300 300L420 250 520 200 640 130', { colour: true, width: 5 }) + text(660, 120, 'long: gains if it rises', { anchor: 'start', size: 22, fill: C })
    + arrow(k, 'M300 300L420 340 520 370 640 410', { dash: true, width: 5 }) + text(660, 420, 'short: gains if it falls', { anchor: 'start', size: 22, fill: C })
    + text(300, 345, 'now', { size: 18 }) + text(140, 480, 'price over time', { anchor: 'start', size: 18 }),
  multiply: (k) => `<rect x="120" y="300" width="130" height="110" rx="14" fill="${C}"/>` + text(185, 450, 'your stake')
    + text(310, 368, '+', { size: 48, fill: C })
    + `<rect x="370" y="190" width="130" height="220" rx="14" fill="url(#${k.g})"/>` + symbol(435, 300, 48) + text(435, 450, 'lent by the pool')
    + text(560, 368, '=', { size: 48, fill: C })
    + `<rect x="630" y="190" width="150" height="220" rx="14" fill="url(#${k.g})"/><rect x="630" y="300" width="150" height="110" rx="14" fill="${C}"/>`
    + text(705, 450, 'your position') + text(830, 240, '×', { size: 64, fill: C, weight: 600 }),
  rise: (k) => pool(k, 480, 430, 620, 90, '')
    + arrow(k, 'M300 400C330 320 360 330 400 280S470 230 520 200 620 120 680 90', { colour: true, width: 6 })
    + `<circle cx="300" cy="400" r="9" fill="${C}"/>`
    + `<rect x="700" y="62" width="74" height="52" rx="14" fill="${C}"/>` + text(737, 101, '×', { size: 40, fill: INK, weight: 700 })
    + text(560, 160, 'your position', { anchor: 'end', fill: C }) + text(480, 512, 'it draws on the same pool everyone uses'),
  close: ({ p }) => `<g transform="translate(330 120) scale(${180 / 239.36})">${p.icon.replace(/<svg[^>]*>/, '').replace('</svg>', '')}</g>`
    + symbol(600, 210, 96) + text(480, 390, `Omnipair ${p.name}`, { size: 34, fill: C, weight: 600 })
    + text(480, 432, 'The pair of everything.', { size: 22 }),
};
