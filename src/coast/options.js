// Options (O, the gear top right, or Esc on the open web): how the picture is painted, how the eye moves, a way
// back to the start, the progress reset and a sheet of every key. While it is up the walk stands still and the mouse
// is free. Settings are one table, SETTINGS; their values live in localStorage under one key, and a URL parameter
// (?dither=0, ?dmatrix=16, ...) wins for that visit without being saved. main.js says what each setting does.
import './options.css';
import { symbolMarkup, lockupMarkup } from './brand.js';
import { slot } from './hud.js';
import { version } from '../../patch.json';

const KEY = 'omnipair-world.options.v1';
const num = (s) => (s === '' || !Number.isFinite(Number(s)) ? undefined : Number(s));
const bool = (s) => !['0', 'false', 'off', 'no'].includes(s);

// kind: 'choice' (one of choices), 'toggle' (on or off), 'range' (min..max by step; show(v) is its reading)
export const SETTINGS = [
  { key: 'quality', group: 'Picture', label: 'Quality', kind: 'choice', choices: [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']], value: 'high', url: 'quality', parse: (s) => s },
  { key: 'dither', group: 'Picture', label: 'Dither', kind: 'toggle', value: true, url: 'dither', parse: bool },
  { key: 'pattern', group: 'Picture', label: 'Dither pattern', kind: 'choice', choices: [[8, 'Bayer 8×8'], [16, 'Bayer 16×16']], value: 8, url: 'dmatrix', parse: (s) => (num(s) > 8 ? 16 : 8) },
  { key: 'ditherSize', group: 'Picture', label: 'Dither size', kind: 'choice', choices: [[1, '1'], [2, '2'], [3, '3']], value: 2, url: 'dsize', parse: num },
  { key: 'relief', group: 'Picture', label: 'Paint relief', kind: 'choice', choices: [[0, 'Flat'], [0.5, 'Normal'], [1, 'Thick']], value: 0.5, url: 'impasto', parse: num },
  { key: 'sensitivity', group: 'Camera', label: 'Mouse sensitivity', kind: 'range', min: 0.25, max: 3, step: 0.05, value: 1, show: (v) => `${v.toFixed(2)}×`, url: 'sens', parse: num },
  { key: 'invertY', group: 'Camera', label: 'Invert Y', kind: 'toggle', value: false, url: 'invert', parse: bool },
  { key: 'fov', group: 'Camera', label: 'Field of view', kind: 'range', min: 40, max: 70, step: 1, value: 46, show: (v) => `${v}°`, url: 'fov', parse: num },
];
const DEF = Object.fromEntries(SETTINGS.map((s) => [s.key, s]));

const CONTROLS = [
  ['Move', 'W A S D, arrows', 'Left stick'],
  ['Sprint', 'Shift', 'L3 or RB'],
  ['Walk slowly', 'Alt, Caps Lock', 'Tilt the stick less'],
  ['Jump', 'Space', 'A'],
  ['Look', 'Click, then mouse', 'Right stick'],
  ['Strafe', 'F, right mouse', 'LT'],
  ['Zoom', 'Wheel', 'D-pad up and down'],
  ['Read a stone', 'E', ''],
  ['Map', 'M', ''],
  ['Goals', 'J', ''],
  ['Options', 'O, Esc', ''],
  ['Through his eyes', 'V', ''],
  ['Hide the hint', 'H', ''],
];

/**
 * The settings' values: stored ones over the defaults, and this visit's URL over those. auto(key) gives a default
 * that depends on where the game runs (Patch's quality). remember: read and write localStorage.
 */
export function loadSettings({ remember = true, search = location.search, auto = () => undefined } = {}) {
  let stored = {};
  if (remember) {
    try { stored = JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { stored = {}; }
  }
  const q = new URLSearchParams(search);
  const values = {};
  for (const s of SETTINGS) {
    const fromUrl = q.has(s.url) ? s.parse(q.get(s.url)) : undefined;
    values[s.key] = fromUrl ?? (s.key in stored ? stored[s.key] : undefined) ?? auto(s.key) ?? s.value;
  }
  return {
    values,
    /** Sets a value; saved too unless save is false (a change Patch made, say). */
    set(key, value, save = true) {
      if (!(key in DEF)) return false;
      values[key] = value;
      if (save && remember) {
        stored[key] = value;
        try { localStorage.setItem(KEY, JSON.stringify(stored)); } catch { /* storage off */ }
      }
      return true;
    },
  };
}

const el = (tag, cls, html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.innerHTML = html;
  return e;
};
const GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 3h3.4l.5 2.4 1.7.9 2.3-.9 1.7 2.9-1.8 1.6v2.2l1.8 1.6-1.7 2.9-2.3-.9-1.7.9-.5 2.4h-3.4l-.5-2.4-1.7-.9-2.3.9-1.7-2.9 1.8-1.6v-2.2L4.1 8.3l1.7-2.9 2.3.9 1.7-.9z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

/**
 * The page side. settings: loadSettings()'s result. apply(key, value): make a setting so. actions: { resume, respawn,
 * map, goals, reset } run by the menu's buttons. onOpen(open): told when it opens or shuts. twoStep(button, fn):
 * the goals list's ask-twice reset, to reuse.
 */
export function createOptionsUi({ settings, apply, actions, onOpen, twoStep }) {
  const button = el('button', 'omni-corner options-open', `${GEAR}<span>O</span>`);
  button.tabIndex = -1;
  button.addEventListener('mousedown', (e) => e.preventDefault());
  button.setAttribute('aria-label', 'Options (O)');
  slot('tr').appendChild(button);

  const root = el('div', '', `
    <div class="opt-card" role="dialog" aria-modal="true" aria-labelledby="opt-title">
      <div class="opt-head"><span class="opt-title" id="opt-title">${symbolMarkup('omni-mark')}Options</span>
        <button class="opt-resume" type="button">Resume</button></div>
      <div class="opt-body"></div>
      <div class="opt-foot">${lockupMarkup('omni-lockup')}<span class="credit">Painted with blendi/oil-paint</span><span class="ver">v${version}</span></div>
    </div>`);
  root.id = 'omni-options';
  document.body.appendChild(root);
  const body = root.querySelector('.opt-body');
  const groups = {};
  const group = (name) => {
    if (!groups[name]) {
      groups[name] = el('section', 'opt-group', `<h3>${name}</h3>`);
      body.appendChild(groups[name]);
    }
    return groups[name];
  };
  const row = (g, label, control) => {
    const r = el('div', 'opt-row', `<span class="opt-label">${label}</span>`);
    r.appendChild(control);
    group(g).appendChild(r);
    return r;
  };

  // each setting's control, and how to show a value on it
  const views = {};
  for (const s of SETTINGS) {
    const set = (v) => { settings.set(s.key, v); apply(s.key, v); views[s.key](v); };
    if (s.kind === 'choice') {
      const seg = el('div', 'opt-seg');
      seg.setAttribute('role', 'radiogroup');
      seg.setAttribute('aria-label', s.label);
      const opts = s.choices.map(([v, name]) => {
        const b = el('button', '', name);
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.addEventListener('click', () => set(v));
        seg.appendChild(b);
        return b;
      });
      // the arrows step along the choices, as in any radio group
      seg.addEventListener('keydown', (e) => {
        const d = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.code];
        if (!d) return;
        e.preventDefault();
        const at = Math.max(0, s.choices.findIndex(([v]) => v === settings.values[s.key]));
        const next = (at + d + s.choices.length) % s.choices.length;
        set(s.choices[next][0]);
        opts[next].focus();
      });
      views[s.key] = (v) => opts.forEach((b, i) => {
        const on = s.choices[i][0] === v;
        b.setAttribute('aria-checked', on);
        b.tabIndex = on || !s.choices.some(([c]) => c === v) && i === 0 ? 0 : -1;
      });
      row(s.group, s.label, seg);
    } else if (s.kind === 'toggle') {
      const sw = el('button', 'opt-switch', '<i></i>');
      sw.type = 'button';
      sw.setAttribute('role', 'switch');
      sw.setAttribute('aria-label', s.label);
      sw.addEventListener('click', () => set(!settings.values[s.key]));
      views[s.key] = (v) => sw.setAttribute('aria-checked', !!v);
      row(s.group, s.label, sw);
    } else {
      const wrap = el('div', 'opt-range', `<input type="range" min="${s.min}" max="${s.max}" step="${s.step}" aria-label="${s.label}"><output></output>`);
      const input = wrap.querySelector('input'), out = wrap.querySelector('output');
      input.addEventListener('input', () => set(Number(input.value)));
      views[s.key] = (v) => { input.value = v; out.textContent = s.show(v); input.style.setProperty('--at', `${(100 * (v - s.min)) / (s.max - s.min)}%`); };
      row(s.group, s.label, wrap);
    }
    views[s.key](settings.values[s.key]);
  }

  const action = (g, label, text, fn) => {
    const b = el('button', 'opt-action', text);
    b.type = 'button';
    b.addEventListener('click', fn);
    row(g, label, b);
    return b;
  };
  action('Travel', 'Back to where you woke', 'Respawn', actions.respawn);
  action('Travel', 'The headland from above', 'Open map', actions.map);
  action('Travel', 'Things to do', 'Open goals', actions.goals);
  const reset = action('Progress', 'Forget every goal and stone', 'Reset progress', () => {});
  twoStep(reset, actions.reset);

  const sheet = el('section', 'opt-group opt-controls', `<h3>Controls</h3>
    <table><thead><tr><th>Action</th><th>Keyboard and mouse</th><th>Gamepad</th></tr></thead>
    <tbody>${CONTROLS.map(([a, k, p]) => `<tr><td>${a}</td><td>${k}</td><td>${p || '<span class="none">none</span>'}</td></tr>`).join('')}</tbody></table>`);
  body.appendChild(sheet);

  let isOpen = false;
  function setOpen(on) {
    if (on === isOpen) return;
    isOpen = on;
    if (on) { if (document.pointerLockElement) document.exitPointerLock?.(); body.scrollTop = 0; }
    else if (root.contains(document.activeElement)) document.activeElement.blur();
    root.classList.toggle('on', on);
    button.classList.toggle('on', on);
    onOpen?.(on);
  }
  button.addEventListener('click', () => setOpen(!isOpen));
  root.querySelector('.opt-resume').addEventListener('click', () => { setOpen(false); actions.resume(); });
  // a click on the dim round the card is a resume too
  root.addEventListener('mousedown', (e) => { if (e.target === root) { e.preventDefault(); setOpen(false); actions.resume(); } });

  return {
    get isOpen() { return isOpen; },
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!isOpen),
    /** A value changed from outside the menu (lab, Patch): show it. */
    show: (key) => views[key]?.(settings.values[key]),
  };
}
