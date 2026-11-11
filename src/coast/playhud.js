// The play HUD: the glass over the ride (play.js holds the game; this only shows it). It follows hud.js's regions:
//   top left     the score and the carry: A and B as two chips with the pairs between them, debt and Leverage as tags
//   top centre   where to go next, with an arrow and how far, and the first minute's lessons under it; toasts below
//   left         the highlights (Tab picks the one to steer by), each with its distance and an arrow
//   bottom left  a round map, north up, with the tokens near him, the rings, the Pool and him
//   bottom       the keys for riding or walking; the combo just above while in the air
//   middle       a deposit's count-up and what a product ring just did; the score card at the Pool
// Plain DOM, touched only when what it shows changes. Nothing takes the keyboard's focus; the card's buttons are
// pressed with the mouse or with Enter and R, read in play.js.
import './playhud.css';
import { PRODUCTS, CREAM, symbolMarkup } from './brand.js';
import { slot } from './hud.js';

const el = (tag, cls, html = '', parent) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.innerHTML = html;
  parent?.appendChild(e);
  return e;
};
const control = (e) => { e.tabIndex = -1; e.addEventListener('mousedown', (ev) => ev.preventDefault()); return e; };
const ARROW = '<svg class="play-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 17-7-4.2L5 20z" fill="currentColor"/></svg>';
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const metres = (d) => (d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`);
const turn = (e, rad) => e.style.setProperty('--turn', `${rad.toFixed(3)}rad`);
const ACCENT = Object.fromEntries(PRODUCTS.map((p) => [p.key, p.ramp[2]]));

/** onRideOn(), onStartOver(): the score card's two buttons. */
export function createPlayHud({ onRideOn, onStartOver }) {
  document.body.classList.add('playing');
  const score = el('div', 'play-glass', `
    <div class="row">${symbolMarkup('omni-mark')}<span class="score">0</span><span class="best"></span></div>
    <div class="row"><span class="play-chip a"><i class="disc"></i>A <span class="n">0</span></span><span class="play-chip pairs none">0 pairs</span><span class="play-chip b"><i class="disc"></i>B <span class="n">0</span></span></div>
    <div class="tags"></div>`, slot('tl'));
  score.id = 'play-score';
  const [nScore, nBest] = [score.querySelector('.score'), score.querySelector('.best')];
  const chipA = score.querySelector('.play-chip.a'), chipB = score.querySelector('.play-chip.b'), chipP = score.querySelector('.play-chip.pairs');
  const tags = score.querySelector('.tags');

  const tc = slot('tc');
  const objective = el('div', 'play-glass play-yield', `<div class="row">${ARROW}<span class="name"></span><span class="far"></span></div><div class="teach"></div>`);
  objective.id = 'play-objective';
  tc.insertBefore(objective, tc.firstChild);
  const oArrow = objective.querySelector('.play-arrow'), oName = objective.querySelector('.name'), oFar = objective.querySelector('.far'), oTeach = objective.querySelector('.teach');

  const highlights = el('div', 'play-glass play-yield', '<div class="head"><span>Highlights</span><span><b>Tab</b> next</span></div><ol></ol>', document.body);
  highlights.id = 'play-highlights';
  const hList = highlights.querySelector('ol');
  let hRows = [];

  const minimap = el('div', 'play-glass play-yield', '<canvas></canvas><span class="n">N</span>', document.body);
  minimap.id = 'play-minimap';
  const mCanvas = minimap.querySelector('canvas');

  const keys = el('div', 'play-glass play-yield', '', slot('bottom'));
  keys.id = 'play-keys';

  const combo = el('div', 'play-glass play-yield', '<span class="x"></span><span class="what"></span><span class="bar"><i></i></span>', document.body);
  combo.id = 'play-combo';
  const cX = combo.querySelector('.x'), cWhat = combo.querySelector('.what');

  const center = el('div', '', '', document.body);
  center.id = 'play-center';
  const count = el('div', 'play-glass', '<span class="plus"></span><span class="how"></span>', center);
  count.id = 'play-count';
  const flashEl = el('div', 'play-glass', '<span class="t"></span>', center);
  flashEl.id = 'play-flash';
  count.addEventListener('animationend', () => count.classList.remove('on'));
  flashEl.addEventListener('animationend', () => flashEl.classList.remove('on'));

  const card = el('div', '', `<div class="card">
      <div class="eyebrow">${symbolMarkup('omni-mark')}Run banked at the Pool</div>
      <div class="total">0</div><span class="newbest">New best</span>
      <dl>
        <dt>Pairs delivered</dt><dd class="pairs"></dd>
        <dt>Best combo</dt><dd class="combo"></dd>
        <dt>Products used</dt><dd><span class="used">${PRODUCTS.map((p) => `<i data-key="${p.key}" title="${p.name}" style="--c: ${p.ramp[2]}"></i>`).join('')}</span> <span class="usedn"></span></dd>
        <dt>Time riding</dt><dd class="riding"></dd>
        <dt>Personal best</dt><dd class="best"></dd>
      </dl>
      <div class="buttons"></div>
      <div class="keys"><b>Enter</b> ride on · <b>R</b> start over</div>
    </div>`, document.body);
  card.id = 'play-card';
  const rideOn = control(el('button', 'ride', 'Ride on', card.querySelector('.buttons')));
  const over = control(el('button', 'over', 'Start over', card.querySelector('.buttons')));
  rideOn.addEventListener('click', () => onRideOn());
  over.addEventListener('click', () => onStartOver());

  // what was last drawn, so a frame only touches what changed
  const last = {};
  const put = (key, value, fn) => { if (last[key] !== value) { last[key] = value; fn(value); } };

  // the round map: drawn ten times a second from the map's painted picture, if the map has one to share
  let mapClock = 0;
  const MM_R = 120; // metres from him to the map's edge
  function drawMinimap(v) {
    const size = Math.round(mCanvas.clientWidth * Math.min(devicePixelRatio, 2));
    if (!size) return;
    if (mCanvas.width !== size) { mCanvas.width = size; mCanvas.height = size; }
    const g = mCanvas.getContext('2d');
    const s = size / (2 * MM_R), cx = size / 2;
    const to = (x, z) => [cx + (x - v.x) * s, cx + (z - v.z) * s];
    g.fillStyle = '#20304f';
    g.fillRect(0, 0, size, size);
    const pic = v.picture?.();
    if (pic?.image.width) {
      const [u0, w0] = pic.spot(v.x - MM_R, v.z - MM_R), [u1, w1] = pic.spot(v.x + MM_R, v.z + MM_R);
      const W = pic.image.width, H = pic.image.height;
      g.drawImage(pic.image, u0 * W, w0 * H, (u1 - u0) * W, (w1 - w0) * H, 0, 0, size, size);
    }
    const dot = (x, z, r, fill, stroke) => {
      const [a, b] = to(x, z);
      g.beginPath(); g.arc(a, b, r, 0, Math.PI * 2);
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) { g.lineWidth = r * 0.45; g.strokeStyle = stroke; g.stroke(); }
    };
    const px = size / 150;
    for (const t of v.near) dot(t.x, t.z, 1.7 * px, t.kind === 'a' ? CREAM : '#0c0c0c', t.kind === 'a' ? null : CREAM);
    for (const gt of v.gates) dot(gt.x, gt.z, 5 * px, null, ACCENT[gt.key]);
    dot(v.pool.x, v.pool.z, Math.max(4 * px, v.pool.r * s), null, CREAM);
    // him: an arrow the way he heads
    g.save();
    g.translate(cx, cx);
    g.rotate(Math.PI - v.heading);
    g.beginPath(); g.moveTo(0, -7 * px); g.lineTo(5 * px, 6 * px); g.lineTo(0, 3 * px); g.lineTo(-5 * px, 6 * px); g.closePath();
    g.fillStyle = CREAM; g.strokeStyle = '#0c0c0c'; g.lineWidth = 1.5 * px; g.fill(); g.stroke();
    g.restore();
  }

  return {
    /**
     * v: { score, best, a, b, pairs, debt, leverage: { on, left, level }, target: { name, far, turn, accent }, teach,
     *   highlights: [{ name, far, turn, accent }], chosen, riding (mounted), inPool, airborne, combo, multiplier, hold,
     *   showCombo, minimap: { x, z, heading, near, gates, pool, picture }, dt }
     */
    render(v) {
      put('score', Math.round(v.score), (n) => { nScore.textContent = fmt(n); });
      put('best', v.best, (n) => { nBest.textContent = n ? `Best ${fmt(n)}` : ''; });
      put('a', v.a, (n) => { chipA.querySelector('.n').textContent = n; chipA.classList.remove('bump'); void chipA.offsetWidth; chipA.classList.add('bump'); });
      put('b', v.b, (n) => { chipB.querySelector('.n').textContent = n; chipB.classList.remove('bump'); void chipB.offsetWidth; chipB.classList.add('bump'); });
      put('pairs', v.pairs, (n) => { chipP.textContent = n === 1 ? '1 pair' : `${n} pairs`; chipP.classList.toggle('none', !n); });
      const tagKey = `${v.debt ? v.debt.amount : ''}|${v.leverage.on ? `${v.leverage.level}:${Math.ceil(v.leverage.left)}` : ''}`;
      put('tags', tagKey, () => {
        tags.innerHTML = (v.leverage.on ? `<span class="play-tag" style="--accent: ${ACCENT.leverage}">Leverage x${v.leverage.level} · ${Math.ceil(v.leverage.left)} s</span>` : '')
          + (v.debt ? `<span class="play-tag" style="--accent: ${ACCENT.lending}">Owe ${v.debt.amount} pairs</span>` : '');
      });

      put('oName', v.target.name, (s) => { oName.textContent = s; });
      put('oFar', v.target.far == null ? '' : metres(v.target.far), (s) => { oFar.textContent = s; });
      put('oAccent', v.target.accent, (c) => objective.style.setProperty('--accent', c));
      turn(oArrow, v.target.turn);
      put('teach', v.teach ?? '', (s) => { oTeach.textContent = s; });

      put('hNames', v.highlights.map((h) => h.name).join('|'), () => {
        hList.innerHTML = '';
        hRows = v.highlights.map((h) => {
          const li = el('li', '', `${ARROW}<span class="name"></span><span class="far"></span>`, hList);
          li.style.setProperty('--accent', h.accent);
          li.querySelector('.name').textContent = h.name;
          return { li, arrow: li.querySelector('.play-arrow'), far: li.querySelector('.far') };
        });
        last.chosen = -1;
      });
      put('chosen', v.chosen, (k) => hRows.forEach((r, i) => r.li.classList.toggle('on', i === k)));
      v.highlights.forEach((h, i) => { turn(hRows[i].arrow, h.turn); const s = h.far == null ? '' : metres(h.far); if (hRows[i].s !== s) { hRows[i].s = s; hRows[i].far.textContent = s; } });

      const keyKey = `${v.riding ? 'ride' : 'walk'}|${v.inPool ? 1 : 0}`;
      put('keys', keyKey, () => {
        const k = (key, what, go) => `<span${go ? ' class="go"' : ''}><b>${key}</b>${what}</span>`;
        keys.innerHTML = (v.inPool ? k('Enter', 'finish the run', true) : '')
          + (v.riding
            ? k('W', 'push') + k('A D', 'carve') + k('Space', 'leap, hold to glide') + k('Shift', 'boost') + k('F', 'walk')
            : k('WASD', 'walk') + k('Space', 'jump') + k('F', 'ride') + k('E', 'read'))
          + k('Tab', 'target') + k('M', 'map');
      });

      combo.classList.toggle('on', v.showCombo);
      if (v.showCombo) {
        put('cX', v.multiplier.toFixed(2).replace(/\.?0+$/, ''), (s) => { cX.textContent = `x${s}`; });
        put('cWhat', v.airborne ? 'in the air' : `combo ${Math.floor(v.combo)}`, (s) => { cWhat.textContent = s; });
        combo.style.setProperty('--hold', v.hold.toFixed(3));
      }

      if ((mapClock -= v.dt) <= 0 && minimap.getClientRects().length) { mapClock = 0.1; drawMinimap(v.minimap); }
    },
    /** A deposit: the big count-up in the middle. */
    deposit({ pairs, score: gained, multiplier, repaid }) {
      const plus = count.querySelector('.plus'), how = count.querySelector('.how');
      how.textContent = `${pairs} ${pairs === 1 ? 'pair' : 'pairs'}${multiplier > 1 ? ` · x${+multiplier.toFixed(2)}` : ''}${repaid ? ` · ${repaid} repaid` : ''}`;
      count.classList.remove('on'); void count.offsetWidth; count.classList.add('on');
      const t0 = performance.now();
      const step = () => {
        const t = Math.min(1, (performance.now() - t0) / 1500);
        plus.textContent = `+${fmt(gained * (1 - (1 - t) ** 3))}`;
        if (t < 1) requestAnimationFrame(step);
      };
      step();
    },
    /** One line in the middle, in a product's colour: what a ring just did. */
    flash(text, accent = CREAM) {
      flashEl.style.setProperty('--accent', accent);
      flashEl.querySelector('.t').textContent = text;
      flashEl.classList.remove('on'); void flashEl.offsetWidth; flashEl.classList.add('on');
    },
    /** The score card: c = { score, delivered, bestCombo, used, riding, best, newBest } to show it, or null to shut it. */
    card(c) {
      document.body.dataset.play = c ? 'card' : 'ride';
      card.classList.toggle('on', !!c);
      if (!c) return;
      card.classList.toggle('best', c.newBest);
      card.querySelector('.total').textContent = fmt(c.score);
      card.querySelector('.pairs').textContent = fmt(c.delivered);
      card.querySelector('.combo').textContent = `x${+c.bestCombo.toFixed(2)}`;
      card.querySelectorAll('.used i').forEach((i) => i.classList.toggle('on', c.used.includes(i.dataset.key)));
      card.querySelector('.usedn').textContent = `${c.used.length} / ${PRODUCTS.length}`;
      const m = Math.floor(c.riding / 60), s = Math.floor(c.riding % 60);
      card.querySelector('.riding').textContent = `${m}:${String(s).padStart(2, '0')}`;
      card.querySelector('.best').textContent = fmt(c.best);
    },
    get cardOpen() { return card.classList.contains('on'); },
  };
}
