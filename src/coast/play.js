// The game loop (BRIEF.md, The game): the run's rules live in game.js, the tokens in tokens.js, the glass in
// playhud.js; this joins them to the world. Each frame it picks up the tokens he reaches, works the product ring he
// rides through, banks his pairs when he rides into the Pool, and tells the rest of the game through ctx's events:
//   emits    token:collect { kind }, product:use { key, text } (product:refuse { key, text } while cooling or not
//            possible), pool:deposit { pairs, score, multiplier }, run:finish { score }
//   ctx.game is a new object after every rule: read it each frame, do not keep it.
//   listens  ride:land { airtime, flips, spins, clean }, ride:crash, ride:swim, ride:leap
// What is kept between visits (personal best, lifetime totals, the lessons done) is in localStorage, and only off the
// patch test and ?capture.
import * as THREE from 'three';
import { RULES, newRun, tick, collect, use, land, crash, deposit, finish, record, surplus } from './game.js';
import { createTokens } from './tokens.js';
import { createPlayHud } from './playhud.js';
import { PRODUCTS, CREAM } from './brand.js';
import { START } from './land.js';

const SAVE = 'omnipair-world.play.v1';
const TEACH = 'omnipair-world.teach.v1';
const ACCENT = Object.fromEntries(PRODUCTS.map((p) => [p.key, p.ramp[2]]));
const NAME = Object.fromEntries(PRODUCTS.map((p) => [p.key, p.name]));

// the first minute: one line at a time, each gone for good once done
const LESSONS = [
  { id: 'collect', text: () => 'Hold W to push off and ride through the floating discs' },
  { id: 'other', text: (s) => `Pairs need one of each: find a ${s.a ? 'dark B' : 'cream A'} token` },
  { id: 'pool', text: () => 'Carry your pair into the ring round the great mark' },
  { id: 'ring', text: () => 'Ride through a product ring by its stone for a power-up' },
];

const places = import.meta.glob('./places.js');
const MODAL = new Set(['board', 'map', 'goals', 'options']);

export function createPlay(ctx) {
  const { shared, omni } = ctx;
  const remember = !ctx.capture && !ctx.patchTest;
  const load = (key, fallback) => { if (!remember) return fallback; try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const store = (key, value) => { if (remember) try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage off */ } };

  const tokens = createTokens(shared);
  ctx.scene.add(tokens.group);
  const now = () => ctx.time();
  let run = newRun(now());
  let saved = load(SAVE, null);
  let counted = { score: 0, delivered: 0, finished: false };
  const learnt = new Set(load(TEACH, []));
  const learn = (id) => { if (!learnt.has(id)) { learnt.add(id); store(TEACH, [...learnt]); } };
  const note = (name, n = 1) => ctx.achievements?.note(name, n);

  const hud = ctx.hud ? createPlayHud({ onRideOn: () => showCard(false), onStartOver: startOver }) : null;

  // where he is: the board's position while riding, else his feet; `at` is his middle, for reaching tokens
  const pos = new THREE.Vector3(), at = new THREE.Vector3(), prev = new THREE.Vector3();
  const rider = () => (ctx.ride?.mounted ? ctx.ride.position : ctx.player.feet);
  const speed = () => (ctx.ride?.mounted ? ctx.ride.speed : ctx.player.speed ?? 0);
  const heading = () => (ctx.ride?.mounted ? ctx.ride.heading : ctx.player.yaw);
  prev.copy(rider());

  function apply([next, out]) { run = next; ctx.game = run; return out; }
  ctx.game = run;

  function onToken(t) {
    apply(collect(run, t.kind));
    learn('collect');
    if (run.pairs) learn('other');
    if (ctx.ride?.airborne) note('airToken');
    ctx.emit('token:collect', { kind: t.kind });
  }

  function useProduct(key) {
    const out = apply(use(run, key, now()));
    if (out.ok) {
      learn('ring');
      const life = new Set(saved?.life?.used ?? []);
      if (!life.has(key)) { saved = { ...(saved ?? {}), life: { ...(saved?.life ?? { score: 0, delivered: 0, runs: 0 }), used: [...life, key] } }; store(SAVE, saved); note('productNew'); }
    }
    hud?.flash(out.text, out.ok ? ACCENT[key] : CREAM);
    ctx.emit(out.ok ? 'product:use' : 'product:refuse', { key, text: out.text });
    return out;
  }

  const poolTop = new THREE.Vector3(omni.pool.x, omni.great.top ?? omni.pool.y + 8, omni.pool.z);
  function bank() {
    const out = apply(deposit(run));
    if (!out.pairs) {
      const { kind } = surplus(run);
      hud?.flash(run.a + run.b ? `No pairs yet: bring a ${kind === 'a' ? 'dark B' : 'cream A'} to go with your ${kind.toUpperCase()}` : 'Bring tokens in pairs, one A and one B', CREAM);
      return out;
    }
    omni.kindle();
    tokens.pour(rider(), poolTop, out.pairs, now());
    hud?.deposit(out);
    learn('pool');
    note('pairs', out.pairs);
    if (out.leveraged) note('leveraged');
    ctx.emit('pool:deposit', { pairs: out.pairs, score: out.score, multiplier: out.multiplier });
    return out;
  }

  let card = null;
  function showCard(on) {
    if (!on) { card = null; hud?.card(null); ctx.input.paused = false; ctx.input.lockable = true; return; }
    const c = finish(run, now());
    const r = record(saved, c, counted);
    saved = r.saved;
    store(SAVE, saved);
    counted = { score: c.score, delivered: c.delivered, finished: true };
    card = { ...c, best: saved.best.score, newBest: r.newBest };
    note('finish');
    ctx.emit('run:finish', { score: c.score });
    if (hud) {
      if (document.pointerLockElement) document.exitPointerLock?.();
      ctx.input.paused = true;
      ctx.input.lockable = false;
      hud.card(card);
    }
    return card;
  }
  function startOver() {
    showCard(false);
    run = newRun(now());
    ctx.game = run;
    counted = { score: 0, delivered: 0, finished: false };
    tokens.reset();
    ctx.lab?.teleport?.(START.x, START.z, START.x, START.z - 10);
  }

  // the rider's tricks and falls (ride.js)
  ctx.on('ride:land', (e) => {
    const before = run.combo;
    const out = apply(land(run, e ?? {}));
    if (e?.clean && (e.flips ?? 0) >= 1) note('cleanFlip');
    if (1 + RULES.COMBO_STEP * run.combo >= RULES.COMBO_MAX && before < run.combo) note('combo5');
    if (out.value) lastLanding = now();
  });
  const fall = () => {
    const out = apply(crash(run));
    if (out.dropped.a || out.dropped.b) hud?.flash(`Leverage: the crash cost you ${out.dropped.a} A and ${out.dropped.b} B`, ACCENT.leverage);
  };
  ctx.on('ride:crash', fall);
  ctx.on('ride:swim', () => { if (run.leverage.on) fall(); });
  ctx.on('ride:leap', () => note('jump'));

  // the targets to steer by: next (the Pool when there is a pair to bank, else the nearest token he lacks), the Pool,
  // each product's ring, and the places worth seeing (places.js, once there is one)
  const targets = [
    { id: 'next', name: 'Next', accent: CREAM },
    { id: 'pool', name: 'The Pool', x: omni.pool.x, z: omni.pool.z, accent: CREAM },
    ...omni.gates.map((g) => ({ id: g.key, name: NAME[g.key], x: g.x, z: g.z, accent: ACCENT[g.key] })),
  ];
  places['./places.js']?.().then((m) => {
    for (const h of m.HIGHLIGHTS ?? []) if (Number.isFinite(h.x) && Number.isFinite(h.z)) targets.push({ id: h.id ?? h.name, name: h.name, x: h.x, z: h.z, accent: h.accent ?? CREAM });
  }).catch(() => {});
  let chosen = 0;
  addEventListener('keydown', (e) => {
    if (e.repeat || ctx.input.paused && !card) return;
    if (e.code === 'Tab') { e.preventDefault(); chosen = (chosen + 1) % Math.min(targets.length, 9); }
    else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !ctx.map?.isOpen) {
      if (card) showCard(false);
      else if (inPool && !MODAL.has(document.body.dataset.ui)) showCard(true);
    } else if (e.code === 'KeyR' && card) startOver();
  });

  const look = new THREE.Vector3();
  function steer(t, x, z) {
    let tx = t.x, tz = t.z, name = t.name;
    if (t.id === 'next') {
      if (run.pairs) { tx = omni.pool.x; tz = omni.pool.z; name = 'The Pool'; } else {
        const want = run.a === run.b ? null : run.a > run.b ? 'b' : 'a';
        const tok = tokens.nearest(x, z, want, now());
        if (!tok) return { name: 'The Pool', far: null, turn: 0, accent: CREAM };
        tx = tok.x; tz = tok.z; name = want === 'b' ? 'Nearest B token' : want === 'a' ? 'Nearest A token' : 'Nearest token';
      }
    }
    const dx = tx - x, dz = tz - z;
    ctx.camera.getWorldDirection(look);
    const fl = Math.hypot(look.x, look.z) || 1, fx = look.x / fl, fz = look.z / fl;
    return { name, far: Math.hypot(dx, dz), turn: Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz), accent: t.accent };
  }

  let pickups = true;
  const born = now();
  let inPool = false, lastLanding = -1e9, wasAir = false, airEnd = -1e9;
  const gateSide = omni.gates.map(() => 0);
  const near = [];

  const lab = {
    state: () => ({ ...run, used: [...run.used], inPool, card, chosen, tokens: tokens.count, saved, teach: [...learnt] }),
    give(a = 0, b = 0) { run = { ...run, a: run.a + a, b: run.b + b }; run.pairs = Math.min(run.a, run.b); ctx.game = run; return lab.state(); },
    deposit: () => bank(),
    use: (key) => useProduct(key),
    finish: () => showCard(true),
    close: () => showCard(false),
    startOver,
    land: (e) => ctx.emit('ride:land', e),
    crash: () => ctx.emit('ride:crash'),
    target(i) { chosen = i; },
    /** Whether tokens are picked up (off for a check that rides past them). */
    pickups(on) { pickups = on; },
    tokens: () => tokens.list.map((tk, i) => ({ ...tk, here: tokens.here(i, now()) })),
    /** The update's own time per frame: cpu(true) starts counting afresh, cpu() reads { mean, p95, frames } in ms. */
    cpu(reset) {
      if (reset) { spent.length = 0; return null; }
      const s = [...spent].sort((x, y) => x - y);
      return { mean: s.reduce((a, b) => a + b, 0) / (s.length || 1), p95: s[Math.floor(s.length * 0.95)] ?? 0, frames: s.length };
    },
  };
  const spent = [];
  if (ctx.lab) ctx.lab.game = lab;

  function update(dt) {
      const t = now();
      pos.copy(rider());
      const riding = !!ctx.ride?.mounted;
      apply([tick(run, dt, t, riding), null]);
      at.set(pos.x, pos.y + 1.0, pos.z);
      if (pickups) tokens.update(t, at, speed(), onToken);

      // a product ring: crossed from one side of its face to the other, inside its rim
      omni.gates.forEach((g, i) => {
        const dx = pos.x - g.x, dz = pos.z - g.z;
        const side = dx * g.nx + dz * g.nz, across = dx * -g.nz + dz * g.nx, up = at.y - g.y;
        const was = gateSide[i];
        gateSide[i] = side;
        const jump = Math.hypot(pos.x - prev.x, pos.z - prev.z) > 12; // a teleport, not a ride through
        if (!jump && was && Math.sign(was) !== Math.sign(side) && Math.abs(across) < g.r && Math.abs(up) < g.r) useProduct(g.key);
        omni.gate(i, Math.min(1, Math.max(0, 1 - (run.cool[g.key] - t) / RULES.COOL)));
      });

      // the Pool: riding into its ring banks every pair
      const inside = Math.hypot(pos.x - omni.pool.x, pos.z - omni.pool.z) < omni.pool.r;
      if (inside && !inPool) bank();
      inPool = inside;

      const airborne = !!ctx.ride?.airborne;
      if (wasAir && !airborne) airEnd = t;
      wasAir = airborne;
      prev.copy(pos);
      if (!hud) return;

      const lesson = LESSONS.find((l) => !learnt.has(l.id) && !(l.id === 'other' && !run.a && !run.b));
      near.length = 0;
      tokens.list.forEach((tk, i) => { if (Math.abs(tk.x - pos.x) < 125 && Math.abs(tk.z - pos.z) < 125 && tokens.here(i, t)) near.push(tk); });
      const k = Math.min(chosen, targets.length - 1);
      hud.render({
        dt, score: run.score, best: saved?.best?.score ?? 0, a: run.a, b: run.b, pairs: run.pairs, debt: run.debt,
        leverage: { on: run.leverage.on, level: run.leverage.level, left: run.leverage.until - t },
        target: steer(targets[k], pos.x, pos.z), teach: lesson ? lesson.text(run) : '',
        highlights: targets.slice(0, 9).map((h) => ({ ...steer(h, pos.x, pos.z), name: h.id === 'next' ? 'Next' : h.name })),
        chosen: k, riding, inPool, airborne,
        combo: run.combo, multiplier: run.multiplier,
        hold: Math.max(0, 1 - run.idle / RULES.HOLD),
        showCombo: airborne || (run.combo > 0 && (t - airEnd < 3 || t - lastLanding < 3)),
        minimap: { x: pos.x, z: pos.z, heading: heading(), near, gates: omni.gates, pool: omni.pool, picture: t - born > 1.5 ? ctx.map?.picture : null },
      });
  }

  return {
    update(dt) {
      const t0 = performance.now();
      update(dt);
      if (spent.length < 4096) spent.push(performance.now() - t0);
    },
    tokens,
    lab,
  };
}
