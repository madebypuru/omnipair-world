// The ride: he stands on a skim board and the coast is a place to go fast over. W pushes, S brakes, A/D carve,
// Shift boosts, Space leaps (held, it glides on the way down), and in the air W/S flip and A/D spin. F steps off and
// on; walking is the Player as before. The board is fastest and slidiest on water and wet sand, slower with more grip
// on turf, cannot climb what is steeper than 35 degrees, and bounces off stones and cliffs. Out on deep water it
// skims while it is quick and sinks under him when it is slow, and he comes back on the nearest shore.
//
// One state, `mode`: walk (the board waits where he left it, or comes when whistled), ride (on a surface), air,
// crash (a tumble, a short stun), sink. Each frame main.js calls drive (moves him), place and pose (puts the
// figure on the board), camera and afterCamera (the eye), in that order.
import * as THREE from 'three';
import { createBoard } from '../figure/board.js';
import { Stance } from '../figure/stance.js';
import { createWake, KIND } from './wake.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt);
const clamp = THREE.MathUtils.clamp;
const toward = (a, b, step) => (a < b ? Math.min(b, a + step) : Math.max(b, a - step));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export const RIDE = {
  boostCruise: 22, boostPush: 1.8, boostTime: 2.6, boostCooldown: 4,
  brake: 11, gravity: 18, slopeGravity: 12, maxSlope: 35 * DEG,
  leap: 5.6, leapPerSpeed: 0.18, crouchTime: 0.09,
  glideGravity: 0.25, glideFall: 2.6, glideDrain: 0.4, glideFill: 0.5,
  flipRate: 8, spinRate: 9, clean: 25 * DEG, crashTilt: 110 * DEG,
  sinkSpeed: 4, deep: 1.5, whistle: 30, reach: 2.5, stun: 1.1,
  swell: 0.3, // metres the board rises over a swell crest out deep
  float: 0.14, // the board rides on the water's paint, which lies a little above the water
};
// How each surface rides: cruise (m/s while pushing), push (m/s² to get there), roll (m/s² lost coasting), grip (how
// fast the travel follows the board's nose, 1/s: low is a drift), turn (scales the carve).
export const SURFACES = {
  water: { cruise: 14, push: 7, roll: 0.3, grip: 1.9, turn: 1 },
  sand: { cruise: 13, push: 6.5, roll: 0.55, grip: 2.6, turn: 1 },
  turf: { cruise: 9, push: 5, roll: 1.4, grip: 6.5, turn: 1.15 },
  rock: { cruise: 8, push: 4.5, roll: 1.8, grip: 6, turn: 1.1 },
};
/** The carve's turn rate at a speed: tight when slow, wide when fast (radius 2.5 m + 0.55 s × speed). */
export const turnRate = (speed) => (speed < 2 ? THREE.MathUtils.lerp(1.8, 2 / (2.5 + 1.1), speed / 2) : speed / (2.5 + 0.55 * speed));

export function createRide(ctx) {
  const { shared, scene, physics, player, animator, follow, figure, heightAt, shoreAt, landAt, camera } = ctx;
  const man = figure.man;
  const board = createBoard(shared);
  const wake = createWake(shared);
  const stance = new Stance(animator);
  scene.add(board.group, wake.mesh);
  const kcc = physics.createCharacterController(0.03);
  kcc.setUp({ x: 0, y: 1, z: 0 });
  kcc.setSlideEnabled(true);
  kcc.setMaxSlopeClimbAngle(RIDE.maxSlope);

  const s = {
    mode: 'walk',
    pos: new THREE.Vector3(), // the middle of the board's underside, on the surface
    vel: new THREE.Vector3(), // horizontal x, z; vertical in vy
    vy: 0,
    heading: 0, // where the nose points (yaw: forward is sin, cos)
    surface: 'turf', depth: 0,
    up: new THREE.Vector3(0, 1, 0),
    lean: 0, turn: 0, steer: 0,
    crouch: 0, crouchFor: 0, leapQueued: false,
    air: 0, pitch: 0, spin: 0, takeoffHeading: 0, glide: 1, gliding: false, fall: 0, leapt: false,
    boostLeft: 0, boostCool: 0,
    stun: 0, sink: 0, slow: 0, tumble: 0,
    whistle: null, // { from, t } while the board comes to him
    wobble: 0, shake: 0, fov: 0, roll: 0, lookIdle: 9,
    trail: 0, dust: 0,
    last: null, // the last landing, for the lab
    top: 0,
  };
  const boardQ = new THREE.Quaternion(), manQ = new THREE.Quaternion(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), root = new THREE.Vector3(), lead = new THREE.Vector3();
  const feet = { l: new THREE.Vector3(), r: new THREE.Vector3() };
  const STANCE_YAW = -Math.PI / 2 + 0.25; // he faces the board's right rail, turned a little toward the nose
  const published = ctx.ride;

  // --- the surface under a point ------------------------------------------------------------------------------
  function surfaceAt(x, z, out = {}) {
    const h = heightAt(x, z);
    if (h < 0.02) {
      const depth = Math.max(0, -h);
      const swell = RIDE.swell * smooth(1.5, 6, depth) * (0.5 + 0.5 * Math.sin((((x * 0.97 + z * 0.24) / 38) - ctx.time() * 0.32) * TAU));
      out.y = Math.max(h, 0) + RIDE.float + swell; out.kind = 'water'; out.depth = depth;
      return out;
    }
    out.y = h; out.depth = 0;
    out.kind = h < 1.4 ? 'sand' : landAt(x, z)[0] > 0.5 ? 'rock' : 'turf';
    return out;
  }
  const surfY = (x, z) => surfaceAt(x, z, tmpS).y;
  const tmpS = {}, here = {};
  function gradient(x, z, out) {
    const e = 0.6;
    return out.set((surfY(x + e, 0 + z) - surfY(x - e, z)) / (2 * e), 0, (surfY(x, z + e) - surfY(x, z - e)) / (2 * e));
  }
  const grad = new THREE.Vector3();

  /** The nearest dry, gentle ground to (x, z): searched in rings, once, when he has to be put ashore. */
  function nearestShore(x, z) {
    for (let r = 4; r < 600; r += 4) {
      const n = Math.max(16, Math.round(r * 0.8));
      let best = null;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU, px = x + r * Math.sin(a), pz = z + r * Math.cos(a);
        const h = heightAt(px, pz);
        if (h < 0.35 || Math.max(Math.abs(px), Math.abs(pz)) > 470) continue;
        if (gradient(px, pz, v1).length() > 0.35) continue;
        // a few metres in from the water
        const inX = px + 3 * Math.sin(a), inZ = pz + 3 * Math.cos(a);
        if (heightAt(inX, inZ) < 0.35) continue;
        const d = Math.hypot(px - x, pz - z);
        if (!best || d < best.d) best = { x: inX, z: inZ, d, heading: Math.atan2(x - px, z - pz) };
      }
      if (best) return best;
    }
    return { x: ctx.lab?.START?.x ?? 0, z: ctx.lab?.START?.z ?? 0, heading: Math.PI };
  }

  // --- putting him on and off -----------------------------------------------------------------------------
  function setAt(x, z, heading, speed = 0) {
    surfaceAt(x, z, here);
    s.pos.set(x, here.y, z);
    s.heading = heading;
    s.vel.set(Math.sin(heading) * speed, 0, Math.cos(heading) * speed);
    s.vy = 0; s.air = 0; s.pitch = 0; s.spin = 0; s.stun = 0; s.sink = 0; s.slow = 0; s.tumble = 0; s.wobble = 0;
    s.lean = 0; s.turn = 0; s.crouch = 0; s.crouchFor = 0; s.leapQueued = false; s.gliding = false;
    syncBody(true);
  }
  function mount() {
    const f = player.feet;
    if (s.mode === 'walk') { s.mode = 'ride'; setAt(f.x, f.z, player.yaw, Math.min(player.speed, 4)); }
    s.whistle = null;
    animator.lock = null; animator.lockOff = null;
    animator.enter(animator.locoState({ strafe: false }), 0.2);
    ctx.emit('ride:mount', { position: s.pos.clone() });
  }
  function dismount() {
    // he steps off on his heel side and the board stays where it is
    const side = v1.set(Math.cos(s.heading), 0, -Math.sin(s.heading)).multiplyScalar(0.7);
    s.mode = 'walk';
    s.vel.set(0, 0, 0);
    ctx.place(s.pos.x + side.x, s.pos.z + side.z, s.heading - Math.PI / 2);
    man.object.quaternion.identity();
    ctx.emit('ride:dismount', { position: s.pos.clone() });
  }
  function respawn(x, z, heading) {
    // put far off, the eye goes with him at once rather than sweeping across the coast
    if (Math.hypot(x - player.feet.x, z - player.feet.z) > 10) { follow.pivot.set(0, 0, 0); follow.yaw = heading; }
    s.mode = 'ride';
    setAt(x, z, heading);
  }

  // --- the capsule goes with him, a little above the board so the ground's small bumps don't catch it --------
  const LIFT = 0.45;
  function syncBody(teleport = false) {
    const half = player.halfHeight(), r = player.t.radius;
    const p = { x: s.pos.x, y: s.pos.y + LIFT + r + half, z: s.pos.z };
    // a jump: where it is and where it is going are both here, or the next step sweeps him across the coast
    if (teleport) { player.body.setTranslation(p, true); player.body.setNextKinematicTranslation(p); physics.propagateModifiedBodyPositionsToColliders(); }
    else player.body.setNextKinematicTranslation(p);
    player.feet.set(s.pos.x, s.pos.y + board.deckY, s.pos.z);
    player.prevFeet.copy(player.feet);
    player.visualY = player.feet.y;
    player.yaw = player.lastYaw = s.heading;
    player.speed = Math.hypot(s.vel.x, s.vel.z);
    player.vel.set(s.vel.x, s.vy, s.vel.z);
    player.grounded = s.mode !== 'air';
    player.mode = 'move';
  }
  /** Moves him horizontally by his velocity, sliding along and bouncing off what he meets. */
  function travel(dt) {
    const want = { x: s.vel.x * dt, y: 0, z: s.vel.z * dt };
    kcc.computeColliderMovement(player.collider, want);
    const mv = kcc.computedMovement();
    let hit = null;
    for (let i = 0; i < kcc.numComputedCollisions(); i++) {
      const c = kcc.computedCollision(i);
      if (c && Math.abs(c.normal1.y) < 0.75) { hit = c; break; }
    }
    if (hit) {
      const n = v2.set(hit.normal1.x, 0, hit.normal1.z).normalize();
      if (n.dot(s.vel) > 0) n.negate();
      const vn = s.vel.dot(n);
      if (vn < -0.5) {
        s.vel.addScaledVector(n, -1.45 * vn).multiplyScalar(0.8);
        if (s.vel.lengthSq() > 4) s.heading = Math.atan2(s.vel.x, s.vel.z);
        s.shake = Math.max(s.shake, clamp((-vn - 4) / 12, 0, 0.6));
        ctx.emit('ride:bump', { speed: -vn });
      }
    }
    s.pos.x += mv.x; s.pos.z += mv.z;
    // the edge of the world is a wall too
    const E = 480;
    for (const k of ['x', 'z']) if (Math.abs(s.pos[k]) > E) { s.pos[k] = Math.sign(s.pos[k]) * E; s.vel[k] *= -0.5; }
  }

  // --- each frame: the controls and the board's motion ---------------------------------------------------
  function drive(dt, inp) {
    const pushIn = inp.push ?? Math.max(0, inp.move.y), brakeIn = inp.brake ?? Math.max(0, -inp.move.y);
    s.steer = inp.move.x;
    if (s.mode === 'walk') {
      if (inp.mount) callBoard();
      updateWaiting(dt);
      wake.update(dt, surfY);
      return false;
    }
    if (inp.mount && (s.mode === 'ride') && s.depth < 0.5) { dismount(); wake.update(dt, surfY); return false; }

    s.boostCool = Math.max(0, s.boostCool - dt);
    if (s.boostLeft > 0) { s.boostLeft -= dt; if (s.boostLeft <= 0) s.boostCool = RIDE.boostCooldown; }
    else if (inp.boost && s.boostCool <= 0 && s.mode !== 'crash' && s.mode !== 'sink') { s.boostLeft = RIDE.boostTime; ctx.emit('ride:boost', {}); }
    const boosting = s.boostLeft > 0;

    if (s.mode === 'ride') ground(dt, inp, pushIn, brakeIn, boosting);
    else if (s.mode === 'air') flight(dt, inp);
    else if (s.mode === 'crash') crashed(dt);
    else if (s.mode === 'sink') sinking(dt);
    if (s.mode !== 'walk') { travel(dt); syncBody(); }
    physics.step();
    effects(dt, boosting);
    s.top = Math.max(s.top, Math.hypot(s.vel.x, s.vel.z));
    return s.mode !== 'walk';
  }

  function ground(dt, inp, pushIn, brakeIn, boosting) {
    surfaceAt(s.pos.x, s.pos.z, here);
    const S = SURFACES[here.kind];
    s.surface = here.kind; s.depth = here.depth;
    s.glide = Math.min(1, s.glide + RIDE.glideFill * dt);
    let speed = Math.hypot(s.vel.x, s.vel.z);
    // carve: the nose turns, the travel follows it as the surface grips
    const rate = turnRate(speed) * S.turn * (s.crouch > 0.05 ? 1.2 : 1);
    const before = s.heading;
    s.heading = wrap(s.heading - s.steer * rate * dt);
    s.turn = damp(s.turn, wrap(before - s.heading) / Math.max(dt, 1e-4), 10, dt); // + is a right turn
    let velYaw = speed > 0.3 ? Math.atan2(s.vel.x, s.vel.z) : s.heading;
    const slip = wrap(s.heading - velYaw);
    const follow = 1 - Math.exp(-S.grip * dt);
    velYaw += slip * follow;
    speed *= 1 - 0.3 * Math.abs(Math.sin(slip)) * follow;
    // push, coast, brake
    const cruise = boosting ? RIDE.boostCruise * (S.cruise / 14) : S.cruise;
    if (pushIn > 0.05 && speed < cruise) speed = Math.min(cruise, speed + S.push * pushIn * (boosting ? RIDE.boostPush : 1) * dt);
    else if (speed > cruise && pushIn > 0.05) speed -= (S.roll + 0.8 * (speed - cruise)) * dt;
    else speed -= (S.roll + 0.0035 * speed * speed) * dt;
    speed = Math.max(0, speed - RIDE.brake * brakeIn * dt);
    s.vel.set(Math.sin(velYaw) * speed, 0, Math.cos(velYaw) * speed);
    // the slope: downhill speeds him up; past 35 degrees it will not hold him and he slides back
    gradient(s.pos.x, s.pos.z, grad);
    const g2 = grad.lengthSq();
    s.vel.addScaledVector(grad, (-RIDE.slopeGravity / (1 + g2)) * dt);
    if (Math.atan(Math.sqrt(g2)) > RIDE.maxSlope && s.vel.dot(grad) > 0) s.vel.addScaledVector(grad, (-14 / Math.sqrt(g2)) * dt);
    // the deck lies on the surface
    v1.set(-grad.x, 1, -grad.z).normalize();
    s.up.lerp(v1, 1 - Math.exp(-12 * dt)).normalize();
    speed = Math.hypot(s.vel.x, s.vel.z);
    const lean = clamp(0.9 * Math.atan2(speed * s.turn, 9.81), -0.55, 0.55);
    s.lean = damp(s.lean, lean, 8, dt);
    // a leap: a short crouch, then up, higher the faster he goes and the more the ground lifts him
    s.crouchFor = Math.max(0, s.crouchFor - dt);
    if (inp.jump && !s.leapQueued) { s.leapQueued = true; s.crouchFor = RIDE.crouchTime; }
    const wantCrouch = (s.leapQueued ? 0.34 : 0.24) + 0.1 * Math.abs(s.lean) + (s.wobble > 0 ? 0.08 : 0);
    s.crouch = damp(s.crouch, wantCrouch, s.leapQueued ? 30 : 8, dt);
    s.wobble = Math.max(0, s.wobble - dt);
    // where the surface is now, and whether it has fallen away faster than he can follow it
    const oldY = s.pos.y;
    surfaceAt(s.pos.x + s.vel.x * dt, s.pos.z + s.vel.z * dt, tmpS);
    const ballistic = oldY + s.vy * dt - 0.5 * RIDE.gravity * dt * dt;
    if (s.leapQueued && s.crouchFor <= 0) return leap(dt, speed);
    if (tmpS.y < ballistic - 0.04 && s.vy > -1) { takeOff(dt, false); return; }
    s.vy = damp(s.vy, (tmpS.y - oldY) / Math.max(dt, 1e-4), 20, dt);
    s.pos.y = tmpS.y;
    // deep water holds him only while he is quick
    if (here.kind === 'water' && here.depth > RIDE.deep && speed < RIDE.sinkSpeed) s.slow += dt; else s.slow = 0;
    if (s.slow > 0.3) { s.mode = 'sink'; s.sink = 0; }
  }

  function leap(dt, speed) {
    s.leapQueued = false;
    s.vy = Math.max(0, s.vy) + RIDE.leap + RIDE.leapPerSpeed * speed;
    takeOff(dt, true);
    ctx.emit('ride:leap', { speed, vy: s.vy });
  }
  function takeOff(dt, leapt) {
    s.mode = 'air';
    s.air = 0; s.pitch = 0; s.spin = 0; s.leapt = leapt;
    s.takeoffHeading = s.heading;
    s.leapQueued = false;
    // keys held from the ground (W pushing, A/D carving) do no tricks until they are let go once
    s.armed = { flip: false, spin: false };
    s.pos.y += s.vy * dt;
  }

  function flight(dt, inp) {
    s.air += dt;
    s.crouch = damp(s.crouch, 0.05, 6, dt);
    s.gliding = !!inp.hold && s.vy < 0.5 && s.glide > 0 && s.air > 0.2;
    if (s.gliding) {
      s.glide = Math.max(0, s.glide - RIDE.glideDrain * dt);
      s.vy -= RIDE.gravity * RIDE.glideGravity * dt;
      s.vy = Math.max(s.vy, -RIDE.glideFall);
    } else s.vy -= RIDE.gravity * dt;
    s.vy = Math.max(s.vy, -40);
    s.vel.multiplyScalar(Math.exp(-0.05 * dt));
    // tricks: W/S tumble him nose over tail, A/D spin him round; let go and he eases back level and along his way
    if (Math.abs(inp.move.y) < 0.1) s.armed.flip = true;
    if (Math.abs(inp.move.x) < 0.1) s.armed.spin = true;
    const flip = s.armed.flip ? inp.move.y : 0, spin = s.armed.spin ? -inp.move.x : 0;
    if (Math.abs(flip) > 0.1) s.pitch += flip * RIDE.flipRate * dt;
    else s.pitch = toward(s.pitch, Math.round(s.pitch / TAU) * TAU, 6 * dt);
    if (Math.abs(spin) > 0.1) s.spin += spin * RIDE.spinRate * dt;
    else s.spin = toward(s.spin, Math.round(s.spin / Math.PI) * Math.PI, 1.5 * dt);
    s.heading = wrap(s.takeoffHeading + s.spin);
    s.lean = damp(s.lean, 0, 4, dt);
    s.up.lerp(Y, 1 - Math.exp(-4 * dt)).normalize();
    s.fall = -s.vy;
    s.pos.y += s.vy * dt;
    const floor = surfY(s.pos.x + s.vel.x * dt, s.pos.z + s.vel.z * dt);
    if (s.pos.y <= floor && s.vy <= 0) land(floor);
  }

  function land(floor) {
    s.pos.y = floor;
    const tilt = Math.abs(wrap(s.pitch));
    const speed = Math.hypot(s.vel.x, s.vel.z);
    const velYaw = speed > 0.5 ? Math.atan2(s.vel.x, s.vel.z) : s.heading;
    const off = wrap(s.heading - velYaw), fakie = Math.abs(off) > Math.PI / 2;
    const along = fakie ? Math.PI - Math.abs(off) : Math.abs(off);
    const flips = Math.round(Math.abs(s.pitch) / TAU);
    const spins = Math.round((Math.abs(s.spin) / TAU) * 2) / 2;
    const airtime = +s.air.toFixed(3);
    s.gliding = false;
    if (tilt > RIDE.crashTilt) {
      s.mode = 'crash'; s.stun = RIDE.stun; s.tumble = 0;
      s.last = { airtime, flips: 0, spins: 0, clean: false, crash: true };
      ctx.emit('ride:crash', { airtime, position: s.pos.clone() });
      s.shake = 0.5;
      ring(14, 1.4);
      return;
    }
    const clean = tilt < RIDE.clean && along < RIDE.clean;
    s.mode = 'ride';
    s.pitch = 0; s.spin = 0;
    // he lands going the way he goes: a backward landing turns the board under him
    s.heading = fakie ? wrap(velYaw) : velYaw;
    if (!clean) { s.vel.multiplyScalar(0.65); s.wobble = 0.6; }
    s.shake = Math.max(s.shake, clamp((s.fall - 7) / 12, 0, 0.45));
    s.vy = 0;
    ring(clean ? 16 : 10, clamp(0.6 + s.fall / 10, 0.6, 1.6));
    s.last = { airtime, flips, spins, clean };
    if (s.leapt || airtime > 0.25) ctx.emit('ride:land', { airtime, flips, spins, clean });
  }

  function crashed(dt) {
    s.stun -= dt;
    s.tumble = Math.min(1, s.tumble + dt * 2.2);
    s.vel.multiplyScalar(Math.exp(-3 * dt));
    surfaceAt(s.pos.x, s.pos.z, here);
    s.pos.y = here.y;
    if (s.stun <= 0) {
      if (here.kind === 'water' && here.depth > RIDE.deep) { const p = nearestShore(s.pos.x, s.pos.z); ctx.emit('ride:swim', { x: p.x, z: p.z }); respawn(p.x, p.z, p.heading); }
      else respawn(s.pos.x, s.pos.z, s.heading);
    }
  }

  function sinking(dt) {
    s.sink = Math.min(1, s.sink + dt / 0.8);
    s.vel.multiplyScalar(Math.exp(-4 * dt));
    if (s.sink >= 1) {
      const p = nearestShore(s.pos.x, s.pos.z);
      ctx.emit('ride:swim', { x: p.x, z: p.z });
      respawn(p.x, p.z, p.heading);
    }
  }

  // --- the board while he walks ------------------------------------------------------------------------------
  function callBoard() {
    const f = player.feet, d = Math.hypot(s.pos.x - f.x, s.pos.z - f.z);
    if (d <= RIDE.reach) return mount();
    if (d <= RIDE.whistle) { s.whistle = { from: s.pos.clone(), t: 0 }; ctx.emit('ride:whistle', { distance: d }); return; }
    // too far to come over the ground: it is simply under his feet again
    ctx.emit('ride:far', { distance: d });
    mount();
  }
  function updateWaiting(dt) {
    if (s.whistle) {
      const w = s.whistle, f = player.feet;
      w.t = Math.min(1, w.t + dt / (0.25 + w.from.distanceTo(f) / 30));
      const k = w.t * w.t * (3 - 2 * w.t);
      s.pos.lerpVectors(w.from, v1.set(f.x, 0, f.z), k);
      s.pos.y = surfY(s.pos.x, s.pos.z) + Math.sin(k * Math.PI) * 0.6;
      s.heading = wrap(s.heading + dt * 6 * (1 - k));
      if (w.t >= 1) mount();
    } else s.pos.y = surfY(s.pos.x, s.pos.z);
    s.up.set(0, 1, 0);
  }

  // --- paint thrown about ----------------------------------------------------------------------------------------
  function ring(n, size) {
    const water = s.surface === 'water';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random() * 0.3, c = Math.cos(a), sn = Math.sin(a);
      const sp = 2 + Math.random() * 1.5;
      wake.emit(KIND.ring, s.pos.x + sn * 0.6, s.pos.y + 0.02, s.pos.z + c * 0.6, sn * sp, 0, c * sp, sn, c, size);
      if (!water && i % 2 === 0) wake.emit(KIND.dust, s.pos.x + sn * 0.4, s.pos.y + 0.1, s.pos.z + c * 0.4, sn * sp, 1.5 + Math.random() * 2, c * sp, sn, c, 1.2);
      if (water && i % 2 === 0) wake.emit(KIND.spray, s.pos.x + sn * 0.4, s.pos.y + 0.1, s.pos.z + c * 0.4, sn * sp * 0.6, 2.5 + Math.random() * 2.5, c * sp * 0.6, sn, c, 1.1);
    }
  }
  function effects(dt, boosting) {
    const speed = Math.hypot(s.vel.x, s.vel.z);
    if (s.mode === 'ride' && speed > 1.5) {
      const fx = s.vel.x / speed, fz = s.vel.z / speed, rx = -fz, rz = fx;
      s.trail += speed * dt;
      if (s.surface === 'water') {
        // the wake: two touches off the tail every 30 cm, drifting apart
        while (s.trail > 0.3) {
          s.trail -= 0.3;
          for (const side of [-1, 1]) {
            const out = 0.5 + Math.random() * 0.7;
            wake.emit(KIND.wake, s.pos.x - fx * 0.7 + rx * side * 0.16, s.pos.y + 0.01, s.pos.z - fz * 0.7 + rz * side * 0.16, rx * side * out, 0, rz * side * out, fx + rx * side * 0.35, fz + rz * side * 0.35, 0.8 + speed / 20);
          }
        }
        // spray off the outside rail in a carve
        s.dust += Math.abs(s.turn) * speed * 3.2 * dt;
        const outside = -Math.sign(s.turn);
        while (s.dust > 1) {
          s.dust -= 1;
          const out = 2 + Math.random() * 2.5, up = 1.5 + Math.random() * 2.5;
          wake.emit(KIND.spray, s.pos.x + rx * outside * 0.25, s.pos.y + 0.1, s.pos.z + rz * outside * 0.25, rx * outside * out + fx * speed * 0.3, up, rz * outside * out + fz * speed * 0.3, rx * outside, rz * outside, 1);
        }
      } else {
        s.trail = Math.min(s.trail, 1);
        s.dust += (speed * (s.surface === 'sand' ? 1.6 : 2.4) + Math.abs(s.turn) * speed * 2) * dt;
        while (s.dust > 1) {
          s.dust -= 1;
          const side = Math.random() - 0.5;
          wake.emit(KIND.dust, s.pos.x - fx * 0.6 + rx * side * 0.4, s.pos.y + 0.05, s.pos.z - fz * 0.6 + rz * side * 0.4, rx * side * 2 + fx * speed * 0.25, 0.8 + Math.random() * 1.6, rz * side * 2 + fz * speed * 0.25, fx, fz, s.surface === 'sand' ? 0.8 : 1);
        }
      }
    }
    wake.update(dt, surfY);
  }

  // --- the figure on the board ---------------------------------------------------------------------------------
  function boardPose() {
    // board: yaw, then the deck's slope, then a roll into the carve; in the air a tumble about its own width
    q1.setFromAxisAngle(Y, s.heading);
    q2.setFromUnitVectors(Y, s.up);
    boardQ.copy(q2).multiply(q1);
    if (s.mode === 'air') boardQ.multiply(q1.setFromAxisAngle(X, s.pitch));
    boardQ.multiply(q1.setFromAxisAngle(Z, s.lean));
    if (s.wobble > 0) boardQ.multiply(q1.setFromAxisAngle(Z, Math.sin(s.wobble * 30) * 0.12 * s.wobble));
    if (s.mode === 'crash') boardQ.multiply(q1.setFromAxisAngle(X, s.tumble * 5));
    board.group.position.copy(s.pos);
    if (s.mode === 'sink') board.group.position.y -= s.sink * 0.9;
    board.group.quaternion.copy(boardQ);
    board.group.updateMatrixWorld(true);
  }
  /** Puts the figure on the board (or the board where it waits). Call after drive, before the animator. */
  function place() {
    boardPose();
    if (s.mode === 'walk') return null;
    root.set(0, board.deckY, 0).applyMatrix4(board.group.matrixWorld);
    man.object.position.copy(root);
    manQ.copy(boardQ).multiply(q1.setFromAxisAngle(Y, STANCE_YAW));
    if (s.mode === 'crash') {
      // he goes over sideways and lies along the way he was going
      man.object.position.copy(s.pos);
      manQ.setFromAxisAngle(Y, s.heading + STANCE_YAW).premultiply(q2.setFromAxisAngle(v1.set(Math.sin(s.heading), 0, Math.cos(s.heading)), -smooth(0, 1, s.tumble) * 1.45));
    }
    if (s.mode === 'sink') man.object.position.y -= s.sink * 1.2;
    man.object.quaternion.copy(manQ);
    man.object.updateMatrixWorld(true);
    return root;
  }
  /** Sets his bones on the board. Call after the animator's update. */
  function pose(dt) {
    if (s.mode === 'walk') return;
    const m = board.group.matrixWorld;
    feet.l.set(0, board.deckY, 0.37).applyMatrix4(m);
    feet.r.set(0, board.deckY, -0.35).applyMatrix4(m);
    const up = v2.set(0, 1, 0).applyQuaternion(boardQ);
    const air = s.mode === 'air' ? smooth(0.05, 0.25, s.air) : 0;
    const w = {
      ride: (1 - air) * (1 - smooth(0.28, 0.4, s.crouch)),
      crouch: (1 - air) * smooth(0.28, 0.4, s.crouch),
      air: air * (s.gliding ? 0.2 : 1),
      glide: air * (s.gliding ? 0.8 : 0),
    };
    if (s.mode !== 'crash') stance.pose(w, s.crouch, feet, up);
    animator.lookToward(dt, v1.set(Math.sin(s.heading), -0.15, Math.cos(s.heading)), 1);
    animator.relaxHands(4);
    man.object.updateMatrixWorld(true);
  }

  // --- the eye ---------------------------------------------------------------------------------------------------
  let pulled = 0;
  function cameraBefore(dt, inp) {
    if (s.mode === 'walk') { s.fov = damp(s.fov, 0, 3, dt); s.roll = damp(s.roll, 0, 4, dt); return null; }
    const speed = Math.hypot(s.vel.x, s.vel.z);
    s.lookIdle = Math.abs(inp.look.x) + Math.abs(inp.look.y) > 1e-4 ? 0 : s.lookIdle + dt;
    if (s.lookIdle > 1.2 && s.mode !== 'crash') {
      const travelYaw = speed > 1.5 ? Math.atan2(s.vel.x, s.vel.z) : s.heading;
      // when the sun is ahead or to a side, the eye turns a little toward it so the sea and the sun stay in the picture
      const sun = ctx.shared.uSunDir?.value, toSun = sun ? wrap(Math.atan2(sun.x, sun.z) - travelYaw) : 0;
      const bias = sun ? 0.24 * Math.sin(toSun) * smooth(-0.4, 0.3, Math.cos(toSun)) : 0;
      const k = smooth(1.2, 2.5, s.lookIdle) * (1 - Math.exp(-2.2 * dt));
      follow.yaw += wrap(travelYaw + bias - follow.yaw) * k;
      if (follow.pitch < 0.45) follow.pitch = damp(follow.pitch, 0.1, 0.8 * smooth(1.2, 2.5, s.lookIdle), dt);
    }
    // farther back, higher and wider the faster he goes; the eye looks a little ahead of him
    const fast = smooth(4, 22, speed);
    s.fov = damp(s.fov, 19 * fast, 2.5, dt);
    pulled = 2.2 * fast;
    follow.want += pulled;
    lead.set(s.vel.x, 0, s.vel.z).multiplyScalar(0.12);
    return v1.copy(root).add(lead);
  }
  function cameraAfter(dt) {
    follow.want = Math.max(follow.reach[0], follow.want - pulled);
    pulled = 0;
    const speed = Math.hypot(s.vel.x, s.vel.z);
    s.roll = damp(s.roll, s.mode === 'ride' ? clamp(s.turn * speed * 0.006, -0.07, 0.07) : 0, 3, dt);
    camera.rotateZ(-s.roll);
    s.shake = Math.max(0, s.shake - dt * 1.6);
    if (s.shake > 0.01) {
      const t = ctx.time() * 37;
      camera.position.add(v1.set(Math.sin(t) * 0.6, Math.sin(t * 1.3 + 1) * 0.8, Math.cos(t * 0.9)).multiplyScalar(s.shake * s.shake * 0.25));
    }
    publish();
  }

  function publish() {
    published.mounted = s.mode !== 'walk';
    published.speed = Math.hypot(s.vel.x, s.vel.z);
    published.airborne = s.mode === 'air';
    published.position.copy(s.pos);
    published.heading = s.heading;
    published.glide = s.glide;
    published.boost = s.boostLeft > 0 ? s.boostLeft / RIDE.boostTime : 1 - s.boostCool / RIDE.boostCooldown;
    published.mode = s.mode;
    published.surface = s.surface;
  }

  // start on the board
  setAt(player.feet.x, player.feet.z, player.yaw);
  s.mode = 'ride';
  publish();

  return {
    state: s,
    get active() { return s.mode !== 'walk'; },
    get fov() { return s.fov; },
    drive, place, pose, cameraBefore, cameraAfter, surfaceAt, nearestShore,
    /** main.js's place() moved him: the board goes with him. */
    moved(x, z, yaw) { if (s.mode !== 'walk') setAt(x, z, yaw); },
    /** Walking into deep water: ashore, on the board. */
    ashore() {
      const p = nearestShore(player.feet.x, player.feet.z);
      ctx.emit('ride:swim', { x: p.x, z: p.z });
      respawn(p.x, p.z, p.heading);
      mount();
    },
    lab: {
      state: () => ({
        mode: s.mode, mounted: s.mode !== 'walk', surface: s.surface, depth: +s.depth.toFixed(2),
        speed: +Math.hypot(s.vel.x, s.vel.z).toFixed(2), top: +s.top.toFixed(2), vy: +s.vy.toFixed(2),
        position: s.pos.toArray().map((v) => +v.toFixed(2)), heading: +s.heading.toFixed(3), turn: +s.turn.toFixed(3),
        air: +s.air.toFixed(2), pitch: +s.pitch.toFixed(2), spin: +s.spin.toFixed(2), glide: +s.glide.toFixed(2),
        boost: +published.boost.toFixed(2), boosting: s.boostLeft > 0, last: s.last, wake: wake.emitted.n,
      }),
      mount(on) { if (on && s.mode === 'walk') mount(); else if (!on && s.mode !== 'walk') dismount(); return this.state(); },
      launch(speed) { s.vel.set(Math.sin(s.heading) * speed, 0, Math.cos(s.heading) * speed); return this.state(); },
      resetTop() { s.top = 0; },
      /** Puts him on the board at (x, z) heading the given way, with a speed. */
      at(x, z, heading, speed = 0) { if (s.mode === 'walk') s.mode = 'ride'; setAt(x, z, heading, speed); s.mode = 'ride'; return this.state(); },
    },
  };
}
