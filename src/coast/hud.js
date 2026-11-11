// What is on the glass over the painting. The screen has fixed regions, laid out in index.html (#omni-top,
// #omni-bottom) and filled by whoever owns each piece:
//   top band     tl: the count of stones found, or the open board's name   tc: goal toasts   tr: the map, goals and options buttons
//   bottom band  the prompt to use a stone, over Omnipair's lockup and the hint
//   modal        the board (boards.js), the map (map.js), the goals list (achievements.js) or the options
//                (options.js), always under the top band
// body[data-ui] names what is open (walk, panel, board, map, goals, options) and the CSS decides what yields to it.
// Plain DOM, drawn from one state each frame and touched only when that state changes. Nothing here takes the
// keyboard's focus or the mouse: E is read in main.js, and Space must stay his jump.
// The mark is always cream on near-black glass; each panel's accent is its product's colour.
import { PRODUCTS, GREAT, CREAM, symbolMarkup, lockupMarkup, iconMarkup } from './brand.js';

const el = (id, html, parent = document.body) => {
  const e = document.createElement('div');
  if (id) e.id = id;
  e.innerHTML = html;
  parent.appendChild(e);
  return e;
};

const slots = {};
/** A region of the screen to put a piece of glass in: 'tl', 'tc', 'tr' (the top band) or 'bottom'. */
export function slot(name) {
  if (!slots.tl) {
    const top = el('omni-top', '<div class="tl"></div><div class="tc"></div><div class="tr"></div>');
    for (const k of ['tl', 'tc', 'tr']) slots[k] = top.querySelector(`.${k}`);
    slots.bottom = el('omni-bottom', '');
  }
  return slots[name];
}

const N = PRODUCTS.length;
// per panel: its accent and the picture in its header (the app icon, or for the great mark the symbol on a dark tile)
const look = (i) => (i < N
  ? { name: PRODUCTS[i].name, eyebrow: 'Omnipair', title: PRODUCTS[i].name, text: PRODUCTS[i].text, accent: PRODUCTS[i].ramp[2], icon: iconMarkup(PRODUCTS[i], 'omni-icon') }
  : { name: GREAT.name, eyebrow: 'The great mark', title: GREAT.title, text: GREAT.text, accent: CREAM, icon: `<span class="omni-icon omni-tile">${symbolMarkup('omni-mark')}</span>` });

export function createHud() {
  const count = el('omni-count', `${symbolMarkup('omni-mark')}<span class="n"></span><span class="goal">All three found. The great mark is lit on the point, to the north.</span>`, slot('tl'));
  const bottom = slot('bottom');
  const prompt = el('omni-prompt', `<span class="key">E</span><span class="dot">·</span><span class="what"></span>`, bottom);
  el('omni-lockup', lockupMarkup('omni-lockup'), bottom);
  const hint = document.getElementById('hint');
  if (hint) bottom.appendChild(hint);
  const panel = el('omni-panel', `
    <div class="head"><span class="pic"></span><div><div class="eyebrow"></div><div class="title"></div></div></div>
    <p class="text"></p>
    <div class="foot"><span class="dots">${PRODUCTS.map((p) => `<i title="${p.name}" style="--c: ${p.ramp[2]}"></i>`).join('')}</span><span class="found"></span></div>`);
  const n = count.querySelector('.n'), what = prompt.querySelector('.what');
  const pic = panel.querySelector('.pic'), eyebrow = panel.querySelector('.eyebrow'), title = panel.querySelector('.title'), text = panel.querySelector('.text');
  const dots = [...panel.querySelectorAll('.dots i')], foundText = panel.querySelector('.found');
  let last = '';

  return {
    /**
     * near: the beacon he can use (-1 none), open: the one whose panel is up (-1 none), found: a boolean per stone,
     * ui: what holds the screen, 'walk' | 'panel' | 'board' | 'map' | 'goals' | 'options'.
     */
    render({ near, open, found, ui }) {
      const key = `${near}|${open}|${found.join()}|${ui}`;
      if (key === last) return;
      last = key;
      document.body.dataset.ui = ui;
      const k = found.filter(Boolean).length;
      n.textContent = `${k} / ${N}`;
      count.classList.toggle('done', k === N);
      prompt.classList.toggle('on', near >= 0 && open < 0 && ui === 'walk');
      if (near >= 0) {
        what.textContent = look(near).name;
        prompt.style.setProperty('--accent', look(near).accent);
      }
      // a stone's board has its own viewer (boards.js); the panel is the great mark's
      panel.classList.toggle('on', open === N);
      if (open === N) {
        const L = look(open);
        panel.style.setProperty('--accent', L.accent);
        pic.innerHTML = L.icon;
        eyebrow.textContent = L.eyebrow;
        title.textContent = L.title;
        text.textContent = L.text;
        dots.forEach((d, i) => { d.classList.toggle('lit', found[i]); d.classList.toggle('here', i === open); });
        foundText.textContent = k === N ? 'All three stones found' : `${k} of ${N} stones found`;
      }
    },
  };
}
