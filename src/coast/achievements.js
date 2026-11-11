// Goals: a table of things to do on the headland, some to see it all and some for fun. Each goal has a test that
// reads the walk's state this frame (and its own progress so far) and gives back its new progress; reaching `goal`
// earns it, which drops a toast from the top of the screen. Progress is kept in localStorage under one key, so a
// return visit remembers it. The list (J, or the button top right) shows every goal with a bar.
import './achievements.css';
import { symbolMarkup } from './brand.js';
import { slot } from './hud.js';

const KEY = 'omnipair-world.goals.v1';
const SKY = 'var(--leverage)', AQUA = 'var(--lending)', DAWN = 'var(--trade)', CREAM = 'var(--cream)';

// w: one frame of the walk (see track below). p: the goal's progress so far.
export const GOALS = [
  { id: 'first-pair', title: 'The pair of everything', description: 'Bank your first pair in the Pool.', goal: 1, accent: CREAM, test: (w, p) => p + w.events.pairs },
  { id: 'pairs-10', title: 'Ten in the Pool', description: 'Deliver 10 pairs.', goal: 10, accent: SKY, test: (w, p) => p + w.events.pairs },
  { id: 'pairs-50', title: 'Deep liquidity', description: 'Deliver 50 pairs.', goal: 50, accent: AQUA, test: (w, p) => p + w.events.pairs },
  { id: 'pairs-200', title: 'One pool for everything', description: 'Deliver 200 pairs.', goal: 200, accent: DAWN, test: (w, p) => p + w.events.pairs },
  { id: 'products', title: 'All three', description: 'Ride through the Leverage, Lending and Trade rings.', goal: 3, accent: AQUA, test: (w, p) => p + w.events.productNew },
  { id: 'leveraged', title: 'On margin', description: 'Bank a deposit under Leverage.', goal: 1, accent: SKY, test: (w) => +!!w.events.leveraged },
  { id: 'clean-flip', title: 'Stuck it', description: 'Land a flip clean.', goal: 1, accent: DAWN, test: (w) => +!!w.events.cleanFlip },
  { id: 'combo', title: 'Five times over', description: 'Build a combo to x5.', goal: 1, accent: SKY, test: (w) => +!!w.events.combo5 },
  { id: 'air-token', title: 'Out of thin air', description: 'Pick up a token in mid air.', goal: 1, accent: AQUA, test: (w) => +!!w.events.airToken },
  { id: 'finish', title: 'Banked', description: 'Finish a run at the Pool (Enter).', goal: 1, accent: CREAM, test: (w) => +!!w.events.finish },
  { id: 'leave', title: 'Off you go', description: 'Walk away from where you woke.', goal: 1, accent: CREAM, test: (w) => +(w.fromStart > 40) },
  { id: 'first-stone', title: 'Reading the signs', description: 'Read one of the product stones.', goal: 1, accent: SKY, test: (w) => +(w.found > 0) },
  { id: 'stones', title: 'Full set', description: 'Read Leverage, Lending and Trade.', goal: 3, accent: AQUA, test: (w) => w.found },
  { id: 'point', title: "Land's end", description: 'Reach the point at the north end.', goal: 1, accent: SKY, test: (w) => +(w.toPoint < 30) },
  { id: 'arch', title: 'Mind the gap', description: 'Stand at the cliff edge across from the sea arch.', goal: 1, accent: DAWN, test: (w) => +(w.toArch < w.archNear && w.y > 1) },
  { id: 'map', title: 'Lay of the land', description: 'Open the map.', goal: 1, accent: AQUA, test: (w) => +w.events.map },
  { id: 'travel', title: 'Shortcut', description: 'Travel somewhere from the map.', goal: 1, accent: SKY, test: (w) => +w.events.travel },
  { id: 'above', title: "Bird's eye", description: 'Pull the view far back and look straight down.', goal: 1, accent: CREAM, test: (w) => +(w.pitch > 1.3 && w.reach > 45) },
  { id: 'first', title: 'In his shoes', description: 'See it through his eyes (V).', goal: 1, accent: AQUA, test: (w) => +w.first },
  { id: 'jumps', title: 'Spring in the step', description: 'Jump or leap ten times.', goal: 10, accent: DAWN, test: (w, p) => p + w.events.jump },
  { id: 'walk', title: 'The long way round', description: 'Cover a kilometre, riding or on foot.', goal: 1000, unit: 'm', accent: SKY, test: (w, p) => p + w.walked },
  { id: 'sea', title: 'Under the sea', description: 'Fall in the sea and wash up again.', goal: 1, accent: AQUA, test: (w) => +w.events.sea },
  { id: 'sunset', title: 'Golden hour', description: 'Stand still for a minute and watch the sun.', goal: 60, unit: 's', accent: DAWN, test: (w, p) => Math.max(p, w.still) },
];

/**
 * The goals' bookkeeping, apart from any page: feed it one frame of the walk with update(); note(name) marks an event
 * (map, travel, jump, sea, and the game's: pairs, productNew, leveraged, cleanFlip, combo5, airToken, finish) for the
 * next frame. onEarn(goal) is told when one is earned.
 */
export function createGoals({ remember = true, onEarn } = {}) {
  const progress = Object.fromEntries(GOALS.map((g) => [g.id, 0]));
  if (remember) {
    try { Object.entries(JSON.parse(localStorage.getItem(KEY))?.progress ?? {}).forEach(([id, n]) => { if (id in progress) progress[id] = +n || 0; }); } catch { /* storage off: start fresh */ }
  }
  let dirty = false, sinceSave = 0;
  const save = () => {
    dirty = false; sinceSave = 0;
    if (remember) try { localStorage.setItem(KEY, JSON.stringify({ progress })); } catch { /* storage off */ }
  };
  const events = { map: 0, travel: 0, jump: 0, sea: 0, pairs: 0, productNew: 0, leveraged: 0, cleanFlip: 0, combo5: 0, airToken: 0, finish: 0 };
  const w = { events, walked: 0, still: 0 };
  let last = null;

  return {
    progress,
    note(name, n = 1) { events[name] = (events[name] ?? 0) + n; },
    /**
     * f: { dt, x, y, z, moving, found, lit, greatOpen, fromStart, toPoint, toArch, archNear, pitch, reach, first }
     */
    update(f) {
      Object.assign(w, f);
      // steps along the ground; a jump of more than a few metres in one frame is a journey by map or by sea
      const d = last ? Math.hypot(f.x - last.x, f.z - last.z) : 0;
      w.walked = d < 3 ? d : 0;
      last = { x: f.x, z: f.z };
      w.still = f.moving ? 0 : w.still + f.dt;
      for (const g of GOALS) {
        const before = progress[g.id];
        if (before >= g.goal) continue;
        const now = Math.min(g.goal, Math.max(before, g.test(w, before)));
        if (now === before) continue;
        progress[g.id] = now;
        dirty = true;
        if (now >= g.goal) { save(); onEarn?.(g); }
      }
      for (const k in events) events[k] = 0;
      sinceSave += f.dt;
      if (dirty && sinceSave > 5) save();
    },
    earned: () => GOALS.filter((g) => progress[g.id] >= g.goal).map((g) => g.id),
    reset() { for (const id in progress) progress[id] = 0; w.still = 0; save(); },
    flush: () => dirty && save(),
  };
}

const el = (tag, cls, html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.innerHTML = html;
  return e;
};
const control = (e) => { e.tabIndex = -1; e.addEventListener('mousedown', (ev) => ev.preventDefault()); return e; };
const TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
/**
 * Makes `button` ask twice: the first press arms it for a few seconds, the second runs fn. Gives back its disarm.
 */
export function twoStep(button, fn) {
  const label = button.textContent;
  let armed = 0;
  const disarm = () => { clearTimeout(armed); armed = 0; button.classList.remove('armed'); button.textContent = label; };
  button.addEventListener('click', () => {
    if (!armed) {
      button.classList.add('armed');
      button.textContent = 'Press again to forget everything';
      armed = setTimeout(disarm, 3500);
      return;
    }
    disarm();
    fn();
  });
  return disarm;
}
const amount = (g, n) => `${Math.floor(n)} / ${g.goal}${g.unit ? ` ${g.unit}` : ''}`;

/**
 * The page side: toasts as goals are earned, and the list. goals: createGoals()'s result. onReset: also forget the
 * stones. onOpen(open): told when the list opens or shuts.
 */
export function createGoalsUi({ goals, onReset, onOpen }) {
  const toasts = el('div', '');
  toasts.id = 'omni-toasts';
  const button = control(el('button', 'omni-corner goals-open', `${TICK}<span>J</span>`));
  button.setAttribute('aria-label', 'Goals (J)');
  const panel = el('div', '', `
    <div class="goals-head"><span class="goals-title">${symbolMarkup('omni-mark')}Goals</span><span class="goals-count"></span></div>
    <ol class="goals-list"></ol>
    <div class="goals-foot"><span><b>J</b> close</span></div>`);
  panel.id = 'omni-goals';
  const reset = control(el('button', 'goals-reset', 'Reset progress'));
  panel.querySelector('.goals-foot').appendChild(reset);
  slot('tc').appendChild(toasts);
  slot('tr').appendChild(button);
  document.body.appendChild(panel);
  const list = panel.querySelector('.goals-list'), count = panel.querySelector('.goals-count');
  const rows = GOALS.map((g) => {
    const li = el('li', '', `<span class="mark">${TICK}</span><div class="what"><div class="t">${g.title}</div><div class="d">${g.description}</div>
      <div class="bar"><i></i></div></div><span class="n"></span>`);
    li.style.setProperty('--accent', g.accent);
    list.appendChild(li);
    return { li, bar: li.querySelector('.bar i'), n: li.querySelector('.n') };
  });

  let isOpen = false;
  function draw() {
    GOALS.forEach((g, i) => {
      const p = goals.progress[g.id], r = rows[i];
      r.li.classList.toggle('done', p >= g.goal);
      r.bar.style.width = `${(100 * p / g.goal).toFixed(1)}%`;
      r.n.textContent = amount(g, p);
    });
    count.textContent = `${goals.earned().length} / ${GOALS.length}`;
  }
  function setOpen(on) {
    if (on === isOpen) return;
    isOpen = on;
    if (on) { if (document.pointerLockElement) document.exitPointerLock?.(); draw(); }
    else disarm();
    panel.classList.toggle('on', on);
    button.classList.toggle('on', on);
    onOpen?.(on);
  }

  const forget = () => { goals.reset(); onReset?.(); draw(); };
  const disarm = twoStep(reset, forget);

  addEventListener('keydown', (e) => { if (e.code === 'KeyJ' && !e.repeat) setOpen(!isOpen); });
  button.addEventListener('click', () => setOpen(!isOpen));

  return {
    get isOpen() { return isOpen; },
    open: () => setOpen(true),
    close: () => setOpen(false),
    /** Forgets every goal and stone, as the reset button's second press does. */
    reset: forget,
    /** A goal was earned: queue its toast, and keep the list current if it is up. */
    earned(g) {
      const t = el('div', 'goal-toast', `<span class="sym">${symbolMarkup('omni-mark')}</span><div class="what"><div class="t">${g.title}</div><div class="d">${g.description}</div></div>
        <span class="n">${amount(g, g.goal)}</span><span class="tick">${TICK}</span>`);
      t.style.setProperty('--accent', g.accent);
      // one at a time: only the first toast shows and runs its clock (achievements.css), and none run while a modal
      // holds the screen, so a toast earned on the board or the map waits for it to shut
      t.addEventListener('animationend', () => t.remove());
      toasts.appendChild(t);
      if (isOpen) draw();
    },
    /** Each so often while the list is up, so the bars that creep (walking, standing still) move. */
    refresh() { if (isOpen) draw(); },
  };
}
