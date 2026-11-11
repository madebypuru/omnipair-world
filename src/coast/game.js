// The game's rules: tokens of two kinds, A and B, carried and banked at the Pool as pairs. Pure: every rule takes a
// run and the clock and gives back the next run and what happened, so tools/game-rules.test.mjs can check them in node.
//
//   rule                     number
//   points per banked pair   PAIR = 10
//   Trade                    gives half the surplus, gets that less FEE = 1; needs a surplus of 4
//   Lending                  lends the lacking kind up to the surplus; owes that plus INTEREST = 1, paid off the next deposit
//   Leverage                 next deposit x2, x3 after CHAIN = 2 clean tricks; lasts LEVER_TIME = 60 s; a crash or the
//                            deep sea while it is on drops everything carried
//   product rings            each one works once per COOL = 20 s
//   combo                    + flips + spins + whole seconds of air per landing (at least 1); multiplier 1 + combo / 4,
//                            at most 5; held HOLD = 6 s after a landing, then it loses one a second; a sloppy landing
//                            halves it, a crash clears it
//   tokens                   picked up within 1.8 m, more when fast (pickRadius); back RESPAWN = 45 s after

export const RULES = { PAIR: 10, FEE: 1, TRADE_MIN: 4, INTEREST: 1, LEVER: 2, LEVER_CHAINED: 3, CHAIN: 2, LEVER_TIME: 60, COOL: 20, HOLD: 6, DECAY: 1, COMBO_STEP: 0.25, COMBO_MAX: 5, RESPAWN: 45, PICK: 1.8 };
export const KINDS = ['a', 'b'];
export const KEYS = ['leverage', 'lending', 'trade'];

/**
 * A run: { a, b, pairs, score, combo, multiplier, debt: { kind, amount } | null, leverage: { on, until, level, chain },
 *   delivered, deposits, bestCombo, used: Set of product keys, cool: { key: time it is ready }, idle: seconds since a
 *   landing, riding: seconds on the board, started }
 */
export function newRun(now = 0) {
  return derive({
    a: 0, b: 0, pairs: 0, score: 0, combo: 0, multiplier: 1, debt: null,
    leverage: { on: false, until: 0, level: 1, chain: 0 },
    delivered: 0, deposits: 0, bestCombo: 0, used: new Set(), cool: { leverage: 0, lending: 0, trade: 0 },
    idle: 0, riding: 0, started: now,
  });
}

const copy = (s) => ({ ...s, leverage: { ...s.leverage }, debt: s.debt && { ...s.debt }, used: new Set(s.used), cool: { ...s.cool } });
const comboMultiplier = (combo) => Math.min(RULES.COMBO_MAX, 1 + RULES.COMBO_STEP * combo);
function derive(s) {
  s.pairs = Math.min(s.a, s.b);
  s.multiplier = comboMultiplier(s.combo) * (s.leverage.on ? s.leverage.level : 1);
  return s;
}
const other = (kind) => (kind === 'a' ? 'b' : 'a');
/** The kind there is more of, and by how much. */
export const surplus = (s) => (s.a >= s.b ? { kind: 'a', n: s.a - s.b } : { kind: 'b', n: s.b - s.a });
/** How near a token must be to be picked up, at a speed in m/s. */
export const pickRadius = (speed = 0) => RULES.PICK + Math.min(1.4, 0.06 * Math.max(0, speed));

/** The clock moves on: the combo cools, Leverage runs out, time on the board adds up. */
export function tick(s, dt, now, riding = false) {
  const n = copy(s);
  n.idle += dt;
  if (n.idle > RULES.HOLD && n.combo > 0) n.combo = Math.max(0, n.combo - RULES.DECAY * Math.min(dt, n.idle - RULES.HOLD));
  if (n.leverage.on && now >= n.leverage.until) n.leverage = { on: false, until: 0, level: 1, chain: 0 };
  if (riding) n.riding += dt;
  return derive(n);
}

export function collect(s, kind) {
  const n = copy(s);
  n[kind] += 1;
  return [derive(n), { kind }];
}

/** A product ring, ridden through: its power-up, unless it is cooling. out.ok says whether it worked, out.text what it did. */
export function use(s, key, now) {
  if (now < s.cool[key]) return [s, { key, ok: false, text: `${NAMES[key]} is ready in ${Math.ceil(s.cool[key] - now)} s` }];
  const [n, out] = { trade, lending: lend, leverage }[key](s, now);
  if (!out.ok) return [n, { key, ...out }];
  n.used.add(key);
  n.cool[key] = now + RULES.COOL;
  return [n, { key, ...out }];
}
const NAMES = { leverage: 'Leverage', lending: 'Lending', trade: 'Trade' };
const K = (kind) => kind.toUpperCase();

export function trade(s) {
  const { kind, n: extra } = surplus(s);
  if (extra < RULES.TRADE_MIN) return [s, { ok: false, text: extra ? `Trade: carry ${RULES.TRADE_MIN} more ${K(kind)} than ${K(other(kind))} to swap` : 'Trade: nothing to swap, you are even' }];
  const give = Math.floor(extra / 2), get = give - RULES.FEE;
  const n = copy(s);
  n[kind] -= give;
  n[other(kind)] += get;
  return [derive(n), { ok: true, give, get, from: kind, to: other(kind), text: `Trade: ${give} ${K(kind)} became ${get} ${K(other(kind))}` }];
}

export function lend(s) {
  const { kind, n: extra } = surplus(s);
  if (s.debt) return [s, { ok: false, text: `Lending: pay back the ${s.debt.amount} you owe first` }];
  if (!extra) return [s, { ok: false, text: 'Lending: nothing to lend against, you are even' }];
  const n = copy(s);
  n[other(kind)] += extra;
  n.debt = { kind: other(kind), amount: extra + RULES.INTEREST };
  return [derive(n), { ok: true, lent: extra, kind: other(kind), owe: extra + RULES.INTEREST, text: `Lending: ${extra} ${K(other(kind))} lent, ${extra + RULES.INTEREST} pairs owed from your next deposit` }];
}

export function leverage(s, now) {
  const n = copy(s);
  n.leverage = { on: true, until: now + RULES.LEVER_TIME, level: RULES.LEVER, chain: 0 };
  return [derive(n), { ok: true, text: `Leverage: your next deposit counts x${RULES.LEVER}, x${RULES.LEVER_CHAINED} after ${RULES.CHAIN} clean tricks` }];
}

/** A landing: { airtime, flips, spins, clean }. A leap with nothing in it still counts once it has had a second of air. */
export function land(s, { airtime = 0, flips = 0, spins = 0, clean = true } = {}) {
  const value = Math.round(flips) + Math.round(spins) + Math.floor(airtime);
  const n = copy(s);
  if (value < 1) return [derive(n), { value: 0 }];
  n.idle = 0;
  n.combo = clean ? n.combo + value : Math.floor(n.combo / 2);
  n.bestCombo = Math.max(n.bestCombo, comboMultiplier(n.combo));
  if (n.leverage.on && clean && ++n.leverage.chain >= RULES.CHAIN) n.leverage.level = RULES.LEVER_CHAINED;
  return [derive(n), { value: clean ? value : 0, clean }];
}

/** A hard crash, or the deep sea: the combo is gone, and under Leverage so is everything carried. */
export function crash(s) {
  const n = copy(s);
  const dropped = n.leverage.on ? { a: n.a, b: n.b } : { a: 0, b: 0 };
  n.combo = 0;
  if (n.leverage.on) { n.a = 0; n.b = 0; n.leverage = { on: false, until: 0, level: 1, chain: 0 }; }
  return [derive(n), { dropped }];
}

/** Riding into the Pool: every pair is banked, the debt paid off it first, the leftover kept. */
export function deposit(s) {
  const pairs = Math.min(s.a, s.b);
  if (!pairs) return [s, { pairs: 0, score: 0, multiplier: s.multiplier, repaid: 0 }];
  const n = copy(s);
  const multiplier = s.multiplier;
  const gross = pairs * RULES.PAIR * multiplier;
  const repaid = n.debt ? Math.min(n.debt.amount, Math.floor(gross / RULES.PAIR)) : 0;
  if (n.debt) { n.debt.amount -= repaid; if (n.debt.amount <= 0) n.debt = null; }
  const score = Math.round(gross - repaid * RULES.PAIR);
  n.a -= pairs; n.b -= pairs;
  n.score += score;
  n.delivered += pairs;
  n.deposits += 1;
  const leveraged = s.leverage.on;
  n.leverage = { on: false, until: 0, level: 1, chain: 0 };
  n.combo = 0;
  return [derive(n), { pairs, score, multiplier, repaid, leveraged }];
}

/** The score card for the run so far. */
export function finish(s, now) {
  return { score: s.score, delivered: s.delivered, bestCombo: s.bestCombo, used: [...s.used], riding: s.riding, time: now - s.started };
}

/**
 * What is kept between visits: { best: { score, delivered, combo }, life: { score, delivered, runs, used: [...] } }.
 * A card is counted into the totals once: `counted` is how much of this run's score and pairs is in them already,
 * and whether it has been finished before (Ride on keeps the run going).
 */
export function record(saved, card, counted = { score: 0, delivered: 0, finished: false }) {
  const best = saved?.best ?? { score: 0, delivered: 0, combo: 0 };
  const life = saved?.life ?? { score: 0, delivered: 0, runs: 0, used: [] };
  const newBest = card.score > best.score;
  return {
    newBest,
    saved: {
      best: { score: Math.max(best.score, card.score), delivered: Math.max(best.delivered, card.delivered), combo: Math.max(best.combo, card.bestCombo) },
      life: {
        score: life.score + card.score - counted.score, delivered: life.delivered + card.delivered - counted.delivered,
        runs: life.runs + (counted.finished ? 0 : 1), used: [...new Set([...life.used, ...card.used])],
      },
    },
  };
}
