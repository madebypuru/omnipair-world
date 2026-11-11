// The game's rules (src/coast/game.js), checked in plain node: `node tools/game-rules.test.mjs`.
import assert from 'node:assert/strict';
import { RULES, newRun, collect, use, trade, lend, leverage, land, crash, deposit, tick, finish, record, pickRadius } from '../src/coast/game.js';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const carry = (a, b, now = 0) => {
  let s = newRun(now);
  for (let i = 0; i < a; i++) [s] = collect(s, 'a');
  for (let i = 0; i < b; i++) [s] = collect(s, 'b');
  return s;
};

test('pairs are the lesser count', () => {
  assert.equal(carry(7, 3).pairs, 3);
  assert.equal(carry(0, 5).pairs, 0);
  assert.equal(carry(4, 4).pairs, 4);
});

test('a deposit banks every pair and keeps the leftover', () => {
  const [s, out] = deposit(carry(7, 3));
  assert.deepEqual([s.a, s.b, s.delivered, out.pairs, out.score], [4, 0, 3, 3, 3 * RULES.PAIR]);
  const [same, none] = deposit(carry(5, 0));
  assert.equal(none.pairs, 0);
  assert.equal(same.score, 0);
});

test('trade moves half the surplus, less the fee', () => {
  const [s, out] = trade(carry(12, 2));
  assert.equal(out.give, 5);
  assert.equal(out.get, 5 - RULES.FEE);
  assert.deepEqual([s.a, s.b, s.pairs], [7, 6, 6]);
  assert.match(out.text, /5 A became 4 B/);
  const [t] = trade(carry(1, 9));
  assert.deepEqual([t.a, t.b], [4, 5]);
  const [u, refused] = trade(carry(5, 3));
  assert.equal(refused.ok, false);
  assert.deepEqual([u.a, u.b], [5, 3]);
});

test('lending fills the lacking kind and is repaid from the next deposit plus one', () => {
  const [s, out] = lend(carry(8, 3));
  assert.deepEqual([s.a, s.b, s.pairs], [8, 8, 8]);
  assert.deepEqual(s.debt, { kind: 'b', amount: 5 + RULES.INTEREST });
  assert.equal(out.owe, 6);
  const [after, dep] = deposit(s);
  assert.equal(dep.repaid, 6);
  assert.equal(dep.score, (8 - 6) * RULES.PAIR);
  assert.equal(after.debt, null);
  const [, again] = lend(s);
  assert.equal(again.ok, false, 'one loan at a time');
});

test('a deposit too small to repay leaves the rest owed', () => {
  let [s] = lend(carry(10, 0));
  [s] = collect(s, 'a');
  s = { ...s, a: 1, b: 1, pairs: 1 };
  const [after, dep] = deposit(s);
  assert.equal(dep.score, 0);
  assert.equal(after.debt.amount, 11 - 1);
});

test('leverage multiplies the next deposit, then is spent', () => {
  let [s] = leverage(carry(4, 4), 0);
  assert.equal(s.multiplier, RULES.LEVER);
  let dep;
  [s, dep] = deposit(s);
  assert.equal(dep.score, 4 * RULES.PAIR * RULES.LEVER);
  assert.equal(dep.leveraged, true);
  assert.equal(s.leverage.on, false);
  [s] = collect(collect(s, 'a')[0], 'b');
  [, dep] = deposit(s);
  assert.equal(dep.score, RULES.PAIR, 'the deposit after is plain');
});

test('leverage goes to x3 after chained clean tricks', () => {
  let [s] = leverage(carry(2, 2), 0);
  [s] = land(s, { flips: 1, clean: true });
  assert.equal(s.leverage.level, RULES.LEVER);
  [s] = land(s, { spins: 1, clean: true });
  assert.equal(s.leverage.level, RULES.LEVER_CHAINED);
});

test('leverage expires', () => {
  let [s] = leverage(carry(2, 2), 10);
  s = tick(s, 1, 10 + RULES.LEVER_TIME - 1);
  assert.equal(s.leverage.on, true);
  s = tick(s, 1, 10 + RULES.LEVER_TIME + 0.01);
  assert.equal(s.leverage.on, false);
  assert.equal(s.multiplier, 1);
});

test('a crash under leverage drops the carry; without it only the combo', () => {
  let [s] = land(carry(6, 3), { flips: 2, clean: true });
  let out;
  [s, out] = crash(s);
  assert.deepEqual([s.a, s.b, s.combo], [6, 3, 0]);
  assert.deepEqual(out.dropped, { a: 0, b: 0 });
  [s] = leverage(s, 0);
  [s, out] = crash(s);
  assert.deepEqual([s.a, s.b, s.leverage.on], [0, 0, false]);
  assert.deepEqual(out.dropped, { a: 6, b: 3 });
});

test('the combo builds, multiplies a deposit and decays', () => {
  let s = carry(2, 2);
  [s] = land(s, { flips: 2, spins: 1, airtime: 1.4, clean: true });
  assert.equal(s.combo, 4);
  assert.equal(s.multiplier, 1 + 4 * RULES.COMBO_STEP);
  s = tick(s, RULES.HOLD - 0.5, 0);
  assert.equal(s.combo, 4, 'held for a while after the landing');
  s = tick(s, 1, 0);
  assert.ok(s.combo < 4 && s.combo > 3, `decays after the hold (${s.combo})`);
  for (let i = 0; i < 10; i++) s = tick(s, 1, 0);
  assert.equal(s.combo, 0);
  [s] = land(s, { flips: 4, clean: true });
  [s] = land(s, { flips: 1, clean: false });
  assert.equal(s.combo, 2, 'a sloppy landing halves it');
  [s] = land(carry(1, 1), { flips: 40, clean: true });
  assert.equal(s.multiplier, RULES.COMBO_MAX);
  const [, dep] = deposit(s);
  assert.equal(dep.score, RULES.PAIR * RULES.COMBO_MAX);
});

test('a leap with no trick and little air does not count', () => {
  const [s, out] = land(carry(1, 1), { airtime: 0.6, clean: true });
  assert.equal(out.value, 0);
  assert.equal(s.combo, 0);
});

test('a product ring cools for twenty seconds', () => {
  let s = carry(10, 0), out;
  [s, out] = use(s, 'trade', 100);
  assert.equal(out.ok, true);
  assert.ok(s.used.has('trade'));
  [s, out] = use(s, 'trade', 100 + RULES.COOL - 1);
  assert.equal(out.ok, false);
  assert.match(out.text, /ready in 1 s/);
  [s] = collect(s, 'a'); [s] = collect(s, 'a'); [s] = collect(s, 'a'); [s] = collect(s, 'a');
  [, out] = use(s, 'trade', 100 + RULES.COOL);
  assert.equal(out.ok, true);
});

test('rules never change the run they are given', () => {
  const s = carry(9, 2);
  const before = JSON.stringify({ ...s, used: [...s.used] });
  trade(s); lend(s, 0); leverage(s, 0); land(s, { flips: 1 }); crash(s); deposit(s); tick(s, 10, 100);
  assert.equal(JSON.stringify({ ...s, used: [...s.used] }), before);
});

test('pick-up reach grows with speed', () => {
  assert.equal(pickRadius(0), RULES.PICK);
  assert.ok(pickRadius(15) > RULES.PICK + 0.8);
  assert.ok(pickRadius(1000) <= RULES.PICK + 1.4);
});

test('the personal best and the totals count each run once', () => {
  let [s] = deposit(carry(5, 5));
  const card = finish(s, 60);
  let r = record(null, card);
  assert.equal(r.newBest, true);
  assert.deepEqual(r.saved.life, { score: 50, delivered: 5, runs: 1, used: [] });
  [s] = deposit(carry(1, 1));
  const ride = { score: 60, delivered: 6, bestCombo: 1, used: ['trade'] };
  r = record(r.saved, ride, { score: 50, delivered: 5, finished: true });
  assert.deepEqual(r.saved.life, { score: 60, delivered: 6, runs: 1, used: ['trade'] });
  r = record(r.saved, { score: 20, delivered: 2, bestCombo: 1, used: [] });
  assert.equal(r.newBest, false);
  assert.equal(r.saved.best.score, 60);
  assert.equal(r.saved.life.runs, 2);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`pass ${name}`); } catch (e) { failed++; console.log(`fail ${name}: ${e.message}`); }
}
console.log(failed ? `${failed} of ${tests.length} failed` : `all ${tests.length} pass`);
process.exitCode = failed ? 1 : 0;
