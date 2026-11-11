// The wanderer on a headland at sunset: he walks north along the clifftop with the sea and the low sun on his left.
// Painted with the same painter as the other two scenes (src/oilpaint); only the world is new.
//   ?capture       no clock: window.lab.step(dt, n) advances it (for stills and films)
//   ?quality=high|medium|low, ?dither=0, ?dmatrix=16, ?dsize=, ?impasto=, ?sens=, ?invert=1, ?fov=
//                  the options menu's settings (options.js) for this visit, not saved
//   ?canvas=0      part of the finish, for comparing
//   ?patch-test=1  Patch's test: an autopilot walks him, opens a stone and lights the great mark, logging pass/fail
import * as THREE from 'three';
import RAPIER from '../figure/rapier/rapier.mjs';
import { createShared, WIND } from '../oilpaint/common.js';
import { createBrushSheet, KNIFE } from '../oilpaint/brush.js';
import { createShade } from '../oilpaint/shade.js';
import { createFrame } from '../oilpaint/finish.js';
import { noise } from '../world/noise.js';
import { createFigure } from '../figure/figure.js';
import { Animator } from '../figure/animator.js';
import { Player } from '../figure/player.js';
import { Input } from '../figure/input.js';
import { Follow } from '../figure/camera.js';
import { prepareLand, createLand, heightAt, wayX, edgeX, START, POINT, ARCH, SUN, EXTENT } from './land.js';
import { createGround } from './ground.js';
import { createSky } from './sky.js';
import { createSea } from './sea.js';
import { createArch } from './arch.js';
import { createOmni } from './omni.js';
import { createHud } from './hud.js';
import { createBrowse } from './boards.js';
import { createMap } from './map.js';
import { createGoals, createGoalsUi, twoStep } from './achievements.js';
import { loadSettings, createOptionsUi } from './options.js';
import { CREAM, iconMarkup, symbolMarkup } from './brand.js';

const q = new URLSearchParams(location.search);
const capture = q.has('capture');
const patchTest = q.get('patch-test') === '1';

// Patch's game rules: pause while the page is hidden or the window has lost focus (Patch lets go of held keys then).
// The test window is driven by its autopilot and may never be focused, so there only hiding pauses it.
let hidden = document.hidden, blurred = false;
let loaded = false;
addEventListener('visibilitychange', () => { hidden = document.hidden; if (loaded) run(); });
addEventListener('blur', () => { blurred = !patchTest; if (loaded) run(); });
addEventListener('focus', () => { blurred = false; if (loaded) run(); });
const loading = document.querySelector('#loading .label');
const progress = (value, label) => { if (loading) loading.textContent = label; document.getElementById('loading')?.style.setProperty('--done', value.toFixed(3)); };
progress(0.03, 'Laying the ground');
const timings = {};
let mark = performance.now();
const lap = (name) => { const now = performance.now(); timings[name] = Math.round(now - mark); mark = now; };

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(capture ? 1 : Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.autoClear = false;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
document.getElementById('view').appendChild(renderer.domElement);

// sunset: the sun low over the sea, peach air toward it and lilac blue away, thin enough to see the far headlands
const shared = createShared();
shared.tBrush.value = createBrushSheet();
shared.uSunDir.value.copy(SUN);
shared.uHaze.value.setRGB(0.55, 0.58, 0.82);
shared.uHazeSun.value.setRGB(0.98, 0.7, 0.5);
shared.uHazeGlow.value.setRGB(0.12, 0.08, 0.02);
shared.uHazeDensity.value = 0.0003;
shared.uShadeBias.value = 0.0006;
shared.uBounce.value.setRGB(0.09, 0.05, 0.03);
shared.uGlazeMul.value.setRGB(0.42, 0.42, 0.72); // his shadow on the turf is blue violet
shared.uGlazeAdd.value.setRGB(0.02, 0.02, 0.07);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.3, 16000);
lap('start');

let told = 0;
const say = (value, label) => { told = Math.max(told, value); progress(told, label); };
const figureComing = createFigure(shared, (done) => say(0.05 + 0.55 * done, 'Fetching the wanderer'), {}, { cells: [KNIFE, 4] });

const turn = () => new Promise((resolve) => setTimeout(resolve, 0));
await prepareLand((done) => { say(0.03 + 0.09 * done, 'Laying the ground'); return turn(); });
const land = createLand(shared);
lap('land');
say(0.12, 'Laying the turf');
await turn();
const ground = createGround(shared);
lap('ground');
const sky = createSky(shared);
const sea = createSea(shared);
const arch = createArch(shared);
const omni = createOmni(shared, { remember: !capture && !patchTest });
land.shade.add(arch.caster, omni.caster);
// The sun sees the whole headland from just over the sea: its picture of the shade is long and shallow, the
// cliffs' shadows lying far across the shelf and the stacks'.
const shade = createShade(renderer, shared, land.shade, { sun: SUN, size: [4096, 2048], box: [760, 190], centre: [40, 20, 40], back: 1400, near: 300, far: 2500 });
lap('shade');
say(0.25, 'Fetching the wanderer');
await turn();
scene.add(sky.group, sea.group, land.mesh, ground.group, arch.group, omni.group);

await RAPIER.init();
const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
{
  const f = land.heightField();
  physics.createCollider(RAPIER.ColliderDesc.heightfield(f.cells, f.cells, f.heights, { x: 2 * f.half, y: 1, z: 2 * f.half }));
  for (const s of omni.solid) {
    physics.createCollider(RAPIER.ColliderDesc.cuboid(s.hx, s.hy, s.hz).setTranslation(s.x, s.y, s.z).setRotation({ x: 0, y: Math.sin(s.yaw / 2), z: 0, w: Math.cos(s.yaw / 2) }));
  }
}
lap('physics');

const figure = await figureComing;
const { man } = figure;
scene.add(man.object, figure.cloakMesh, figure.dabs);
const animator = new Animator(man);
const spawn = new THREE.Vector3(START.x, heightAt(START.x, START.z), START.z);
const player = new Player({ RAPIER, world: physics, man, animator, spawn, yaw: Math.PI });
const follow = new Follow(camera);
follow.yaw = Math.PI;
// the eye sits low and looks a little up past him: the picture is half sky
follow.pitch = -0.04;
follow.lift = 1.2;
follow.sink = 0.7;
// the coast is a picture to look over: the eye may climb almost straight above him and step far back
follow.pitchRange = [-0.9, 1.5];
follow.reach = [2.8, 90];
const input = new Input(renderer.domElement, { pads: !capture && !q.has('nopad') });
physics.step();
lap('figure');

const frame = createFrame(renderer, shared);
frame.uniforms.uCanvas.value = q.has('canvas') ? +q.get('canvas') : 1;
frame.uniforms.uShafts.value = 0; // the air over the headland is open: no sun standing between trunks

// The options (options.js): ?quality and the rest win for this visit, then what was chosen before, then Patch's
// performance mode. What each one does to the picture, the eye and the mouse:
const settings = loadSettings({ remember: !capture && !patchTest, auto: (key) => (key === 'quality' ? window.patch?.quality : undefined) });
// pixels per CSS pixel at each quality: Medium draws at the screen's own pixels, Low at three quarters of them
const RATIO = { high: () => Math.min(devicePixelRatio, 1.5), medium: () => Math.min(devicePixelRatio, 1), low: () => 0.75 * Math.min(devicePixelRatio, 1) };
let fov = 46;
const APPLY = {
  quality(v) {
    renderer.setPixelRatio(capture ? 1 : (RATIO[v] ?? RATIO.high)());
    renderer.setSize(innerWidth, innerHeight);
    frame.resize();
  },
  dither(v) { frame.uniforms.uDither.value = v ? 1 : 0; },
  pattern(v) { frame.uniforms.uDitherMatrix.value = v > 8 ? 16 : 8; },
  ditherSize(v) { frame.uniforms.uDitherSize.value = v; },
  relief(v) { shared.uImpasto.value = v; }, // Normal, 0.5: the knife's paint stands low, a thin lip and no slabs
  sensitivity(v) { input.sensitivity = 0.0022 * v; },
  invertY(v) { input.invertY = !!v; },
  fov(v) { fov = v; },
};
for (const [key, v] of Object.entries(settings.values)) APPLY[key](v);
/** Makes a setting so now; saved unless save is false. */
function setOption(key, value, save = true) {
  if (!settings.set(key, value, save)) return false;
  APPLY[key](value);
  options?.show(key);
  return true;
}
window.patch?.addEventListener?.('qualitychange', () => setOption('quality', window.patch.quality ?? 'high', false));

const wind = { x: WIND.x, z: WIND.y };
let time = 0;
function air(x, y, z, out) {
  const along = x * wind.x + z * wind.z, across = -x * wind.z + z * wind.x;
  const gust = THREE.MathUtils.clamp(0.5 + 0.8 * noise((along - time * 4) / 40, across / 90) + 0.3 * noise((along - time * 6.5) / 11, across / 17), 0, 1);
  const speed = 0.6 + 3.6 * gust * gust;
  return out.set(wind.x * speed, 0.25 * Math.sin(time * 2.3 + x) * gust, wind.z * speed);
}

function place(x, z, yaw) {
  const y = heightAt(x, z), half = player.halfHeight();
  player.body.setTranslation({ x, y: y + player.t.radius + half + 0.05, z }, true);
  physics.propagateModifiedBodyPositionsToColliders();
  player.feet.set(x, y, z); player.prevFeet.copy(player.feet); player.visualY = y;
  player.vel.set(0, 0, 0); player.speed = 0; player.mode = 'move'; player.grounded = true;
  player.yaw = player.lastYaw = yaw;
  animator.lock = null; animator.lockOff = null;
  animator.enter(animator.locoState({ strafe: false }), 0.05);
}

// Omnipair's stones: E by one browses its board (boards.js; reading the last slide marks it found), E again leaves.
// By the great mark E opens its panel; E again, or walking off, closes it.
const hud = capture || q.has('clean') ? null : createHud();
const quest = { near: -1, open: -1 };
const browse = createBrowse({ omni, dom: !!hud, travel: (i) => placeAt(omni.stand(i)) });
function press() {
  if (browse.at >= 0) browse.close();
  else if (quest.open >= 0) quest.open = -1;
  else if (quest.near === omni.stones.length) quest.open = quest.near;
  else if (quest.near >= 0) browse.open(quest.near);
}
addEventListener('keydown', (e) => { if (e.code === 'KeyE' && !e.repeat && !menuOpen()) press(); });

// Goals (achievements.js) and the map (map.js). While either is up he stands still and the mouse is free.
const goals = createGoals({ remember: !capture && !patchTest, onEarn: (g) => goalsUi?.earned(g) });
const goalsUi = hud ? createGoalsUi({
  goals,
  onReset() { omni.found.fill(false); try { localStorage.removeItem('omnipair-world.found.v2'); } catch { /* storage off */ } },
  onOpen(on) { if (on) { map.close(); options?.close(); quest.open = -1; if (browse.at >= 0) browse.close(); } input.lockable = !menuOpen(); },
}) : null;
function placeAt({ x, z, fx, fz }) {
  place(x, z, Math.atan2(fx - x, fz - z));
  follow.yaw = player.yaw; follow.pivot.set(0, 0, 0);
}
// a few metres short of each thing, facing it
const before = (b, back) => ({ x: b.x + back * Math.sin(b.yaw), z: b.z + back * Math.cos(b.yaw), fx: b.x, fz: b.z });
// the arch stands in the sea: the nearest he can come is the clifftop opposite it. Beside it is that and a little more.
const archEdge = (() => {
  let best = { d: Infinity };
  for (let z = ARCH.z - 60; z <= ARCH.z + 60; z += 1) {
    for (let x = edgeX(z) - 25; x <= edgeX(z) + 10; x += 0.5) {
      const d = Math.hypot(x - ARCH.x, z - ARCH.z);
      if (heightAt(x, z) > 20 && d < best.d) best = { x, z, d };
    }
  }
  return best;
})();
const ARCH_NEAR = archEdge.d + 5;
const archLook = { x: archEdge.x + 10 * (archEdge.x - ARCH.x) / archEdge.d, z: archEdge.z + 10 * (archEdge.z - ARCH.z) / archEdge.d, fx: ARCH.x, fz: ARCH.z };
const map = hud ? createMap({
  places: [
    ...omni.stones.map((s) => ({ id: s.key, name: s.name, kind: 'product', x: s.x, z: s.z, accent: s.ramp[2], icon: iconMarkup(s, 'pin-icon'), go: before(s, 6) })),
    { id: 'great', name: 'The great mark', kind: 'great', x: omni.great.x, z: omni.great.z, accent: CREAM, icon: symbolMarkup('omni-mark'), go: before(omni.great, 14) },
    { id: 'arch', name: 'The sea arch', kind: 'arch', x: ARCH.x, z: ARCH.z, accent: CREAM, go: archLook },
    { id: 'start', name: 'Where you woke', kind: 'start', x: START.x, z: START.z, accent: CREAM, go: { x: START.x, z: START.z, fx: START.x, fz: START.z - 10 } },
  ],
  canvas: renderer.domElement,
  heightAt,
  paint(cam) {
    renderer.getDrawingBufferSize(size);
    shared.uPixel.value = (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / size.y;
    ground.follow(cam.position.x, cam.position.z);
    frame.render(scene, cam);
  },
  place: placeAt,
  onOpen(on) { if (on) { goalsUi.close(); options?.close(); goals.note('map'); quest.open = -1; if (browse.at >= 0) browse.close(); } input.lockable = !menuOpen(); },
  onTravel: () => goals.note('travel'),
}) : null;
const WOKE = { x: START.x, z: START.z, fx: START.x, fz: START.z - 10 };
// Options (options.js). While it is up the walk and its clock stand still; the picture is still drawn, so each change
// shows behind the glass.
const lockMouse = () => renderer.domElement.requestPointerLock?.()?.catch?.(() => {});
const options = hud ? createOptionsUi({
  settings,
  apply: (key, v) => APPLY[key](v),
  twoStep,
  actions: {
    resume: lockMouse,
    respawn() { placeAt(WOKE); options.close(); lockMouse(); },
    map: () => map.open(),
    goals: () => goalsUi.open(),
    reset: () => goalsUi.reset(),
  },
  onOpen(on) {
    if (on) { map.close(); goalsUi.close(); quest.open = -1; if (browse.at >= 0) browse.close(); input.release(); }
    input.paused = on;
    input.lockable = !menuOpen();
  },
}) : null;
function menuOpen() { return !!(map?.isOpen || goalsUi?.isOpen || options?.isOpen); }
// Esc on the open web: it shuts what is open (a board, the map, goals, the great mark's panel), and with nothing open
// it opens or shuts the options. Inside Patch's player Esc is Patch's and never arrives; O and the gear do it there.
function escape() {
  if (browse.at >= 0) browse.close();
  else if (map?.isOpen) map.close();
  else if (goalsUi?.isOpen) goalsUi.close();
  else if (quest.open >= 0) quest.open = -1;
  else options?.toggle();
}
// With the mouse locked the browser spends Esc on letting it go and the page hears no key, only the lock going.
// The map, goals and options let go of it themselves (they are open by then); any other loss of it was Esc.
let lostAt = -1e9;
function lockLost() {
  if (document.pointerLockElement || window.patch || patchTest || !options || menuOpen()) return false;
  if (document.hidden || !document.hasFocus()) return false; // the window went away, and the walk pauses on blur
  lostAt = performance.now();
  escape();
  return true;
}
document.addEventListener('pointerlockchange', lockLost);
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyO') options?.toggle();
  else if (e.code === 'Escape' && !window.patch && performance.now() - lostAt > 300) escape();
});
const IDLE = { move: { x: 0, y: 0 }, walk: false, sprint: false, strafe: false, jump: false, look: { x: 0, y: 0 }, zoom: 0, device: 'keyboard' };
let lastMode = player.mode, goalsClock = 0;

const size = new THREE.Vector2();
// Through his own eyes with V. `first` is how far the eye has gone over to it, 0..1.
let first = 0, firstKey = false;
const outlook = new THREE.Vector3(), eyeAt = new THREE.Vector3(), gaze = new THREE.Vector3();
addEventListener('keydown', (e) => { if (e.code === 'KeyV') firstKey = !firstKey; });
let fp = 0;
function tick(dt) {
  dt = Math.min(dt, 1 / 20);
  if (options?.isOpen) {
    hud.render({ near: quest.near, open: -1, found: omni.found, ui: 'options' });
    draw();
    return;
  }
  time += dt;
  const inp = (menuOpen() || browse.at >= 0) && !input.override ? (input.read(dt), IDLE) : input.read(dt);
  first += ((firstKey ? 1 : 0) - first) * (1 - Math.exp(-6 * dt));
  fp = first * first * (3 - 2 * first);
  player.update(dt, inp, follow.yaw);
  // into the sea, or off the map: he starts again
  if (player.feet.y < 0.3 || Math.max(Math.abs(player.feet.x), Math.abs(player.feet.z)) > EXTENT - 30) {
    if (player.feet.y < 0.3) goals.note('sea');
    place(spawn.x, spawn.z, Math.PI);
  }
  const root = player.visualRoot(dt);
  man.object.position.copy(root);
  man.object.rotation.set(0, player.yaw, 0);
  man.object.updateMatrixWorld(true);
  const local = player.vel.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -player.yaw);
  animator.update(dt, { speed: player.mode === 'move' ? player.speed : Math.hypot(local.x, local.z), moveAngle: player.moveAngle, grounded: player.grounded });
  animator.relaxHands(player.speed);
  animator.uprightTrunk(dt, player.speed, player.grounded && player.mode !== 'jump' && player.mode !== 'air' ? 1 : 0.3);
  const lookW = player.mode === 'move' || player.mode === 'idleExtra' ? THREE.MathUtils.clamp(1 - (player.speed - 1.5) / 2, 0, 1) : 0;
  animator.lookToward(dt, camera.getWorldDirection(new THREE.Vector3()), lookW);
  animator.armClearance(dt);
  if (player.mode === 'move' && !player.strafe) animator.leanInto(dt, player.turnRate, player.speed, player.accelF);
  else animator.leanInto(dt, 0, 0, 0);
  const onGround = player.grounded && player.mode !== 'jump' && player.mode !== 'air';
  animator.placeFeet(dt, (x, z, from) => player.ground(x, z, from, 1.4), root.y, onGround ? 1 : 0);
  man.object.updateMatrixWorld(true);
  figure.updateCloak(dt, air, heightAt);
  omni.update(dt);
  quest.near = omni.nearest(player.feet);
  if (quest.open >= 0 && omni.distance(quest.open, player.feet) > omni.away(quest.open)) quest.open = -1;
  hud?.render({
    near: quest.near, open: browse.at >= 0 ? browse.at : quest.open, found: omni.found,
    ui: map?.isOpen ? 'map' : goalsUi?.isOpen ? 'goals' : options?.isOpen ? 'options' : browse.at >= 0 ? 'board' : quest.open >= 0 ? 'panel' : 'walk',
  });
  if (player.mode === 'jump' && lastMode !== 'jump') goals.note('jump');
  lastMode = player.mode;
  const feet = player.feet;
  goals.update({
    dt, x: feet.x, y: feet.y, z: feet.z,
    moving: player.speed > 0.1 || !player.grounded || menuOpen(),
    found: omni.found.filter(Boolean).length, lit: omni.lit(), greatOpen: quest.open === omni.stones.length,
    fromStart: Math.hypot(feet.x - spawn.x, feet.z - spawn.z), toPoint: Math.hypot(feet.x - POINT.x, feet.z - POINT.z),
    toArch: Math.hypot(feet.x - ARCH.x, feet.z - ARCH.z), archNear: ARCH_NEAR,
    pitch: follow.pitch, reach: follow.want, first: firstKey && first > 0.9,
  });
  map?.update(feet.x, feet.z, player.yaw);
  if ((goalsClock += dt) > 0.5) { goalsClock = 0; goalsUi?.refresh(); }

  // a rock between the eye and him brings the eye in; over the ground it rises instead
  follow.update(dt, root, inp.look, inp.zoom, (o, d, max) => {
    const hit = player.castRay(o, d, max);
    return hit != null && o.y + d.y * hit - heightAt(o.x + d.x * hit, o.z + d.z * hit) < 0.5 ? null : hit;
  }, (x, z) => heightAt(x, z) + 0.55);
  if (fp > 0.002) {
    // the eye comes forward into his head and looks where the mouse has it look
    const cp = Math.cos(follow.pitch), sp = Math.sin(follow.pitch);
    gaze.set(Math.sin(follow.yaw) * cp, -sp, Math.cos(follow.yaw) * cp);
    eyeAt.set(root.x + Math.sin(follow.yaw) * 0.08, root.y + 1.66, root.z + Math.cos(follow.yaw) * 0.08);
    camera.getWorldDirection(outlook).multiplyScalar(6).add(camera.position);
    camera.position.lerp(eyeAt, fp);
    camera.lookAt(outlook.lerp(eyeAt.addScaledVector(gaze, 6), fp));
  }
  setLens();
  browse.update(dt, camera);
  man.object.visible = figure.cloakMesh.visible = figure.dabs.visible = fp < 0.5;
  shared.uTime.value = time;
  shared.uFocus.value.copy(root);
  shade.update(scene, root);
  draw();
}
function setLens() {
  camera.fov = fov + 18 * fp;
  camera.near = 0.3 - 0.2 * fp;
  camera.updateProjectionMatrix();
}
/** Paints the frame as the camera has it now. */
function draw() {
  if (options?.isOpen) setLens();
  camera.updateMatrixWorld(true);
  renderer.getDrawingBufferSize(size);
  shared.uPixel.value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / size.y;
  ground.follow(camera.position.x, camera.position.z);
  frame.render(scene, camera);
}

window.lab = {
  THREE, player, follow, camera, input, animator, figure, shared, frame, renderer, timings, counts: { ...ground.counts, ...arch.counts, ...omni.counts }, heightAt, wayX, edgeX, START, POINT, ARCH, sky,
  step(dt = 1 / 60, n = 1) { for (let i = 0; i < n; i++) tick(dt); },
  setInput(fn) { input.override = fn; },
  /** Puts him at (x, z) on the ground, facing (fx, fz), with the eye behind him. */
  teleport(x, z, fx, fz) {
    place(x, z, Math.atan2(fx - x, fz - z));
    follow.yaw = player.yaw; follow.pivot.set(0, 0, 0);
    tick(1 / 60);
  },
  /** A fixed view for stills: eye and what it looks at. Call with nothing to go back to following him. */
  view(eye, target) { follow.free = eye ? { position: new THREE.Vector3(...eye), target: new THREE.Vector3(...target) } : null; },
  /** Moves the clock on without moving him, to see the sea at another moment. */
  wait(seconds) { time += seconds; },
  /** Through his eyes (true) or from behind him (false), as V does. */
  first(on) { firstKey = on; },
  arch,
  map: map && {
    open: () => map.open(),
    close: () => map.close(),
    get isOpen() { return map.isOpen; },
    /** Travels to a place by its id, as a click on its marker does: leverage, lending, trade, great, arch, start. */
    travel: (id) => map.travel(id),
    places: () => map.places.map((p) => ({ id: p.id, name: p.name, x: p.x, z: p.z, at: p.at, go: p.go })),
  },
  options: {
    open: () => options?.open(),
    close: () => options?.close(),
    /** Sets an option as its control does, and saves it: quality, dither, pattern, ditherSize, relief, sensitivity, invertY, fov. */
    set: (key, value) => setOption(key, value),
    /** The values, and what they did: the dither's uniforms, the pixel ratio, the lens, the mouse. */
    state: () => ({
      open: !!options?.isOpen, ui: document.body.dataset.ui, values: { ...settings.values },
      dither: frame.uniforms.uDither.value, matrix: frame.uniforms.uDitherMatrix.value, size: frame.uniforms.uDitherSize.value,
      impasto: shared.uImpasto.value, pixelRatio: renderer.getPixelRatio(), fov: camera.fov, sensitivity: input.sensitivity, invertY: input.invertY,
    }),
    /** The lock-loss handler, for a check that cannot really be granted the lock: true when it acted. */
    lockLost,
  },
  achievements: {
    state: () => ({ progress: { ...goals.progress }, earned: goals.earned() }),
    open: () => goalsUi?.open(),
    close: () => goalsUi?.close(),
  },
  omni: {
    /** Puts him in front of beacon i (0..2 the stones' boards, 3 the great mark) and presses E there, as a player would. */
    visit(i) {
      const s = omni.stand(i);
      browse.close();
      window.lab.teleport(s.x, s.z, s.fx, s.fz);
      quest.open = -1;
      press();
      return this.state();
    },
    /** Browses stone i's board, as E by it does. */
    browse(i) { return this.visit(i); },
    /** Shows slide n (from 0) of the board being browsed; the last one marks it found. */
    slide(n) { browse.go(n); return this.state(); },
    /** A browse key, exactly as pressed: ArrowLeft / ArrowRight / ArrowUp / ArrowDown or A D W S. */
    key: (code) => browse.key(code),
    /** E, exactly as the key does it. */
    press,
    /** on('browse', key) when a board opens; on('read', key) when a product's last slide is first read. */
    on: (name, fn) => omni.on(name, fn),
    state: () => ({ found: [...omni.found], count: omni.found.filter(Boolean).length, near: quest.near, open: browse.at >= 0 ? browse.at : quest.open, browse: browse.at, slide: browse.at >= 0 ? browse.state.slide : -1, lit: +omni.lit().toFixed(3) }),
    solid: omni.solid,
    stones: omni.stones,
    great: omni.great,
  },
};

// The picture follows the size of its own box, not only the window's resize event: a browser's side panel sliding
// away can change the box without that event arriving at its final size, and the canvas is then stretched by CSS.
const viewBox = document.getElementById('view');
let fitW = 0, fitH = 0;
function fit() {
  const w = viewBox.clientWidth || innerWidth, h = viewBox.clientHeight || innerHeight;
  if (w === fitW && h === fitH) return;
  fitW = w; fitH = h;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  frame.resize();
}
addEventListener('resize', fit);
new ResizeObserver(fit).observe(viewBox);
say(0.68, 'Mixing paint');
function gpuDone() {
  const gl = renderer.getContext();
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  return new Promise((resolve) => {
    const poll = () => {
      if (gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED) return void setTimeout(poll, 4);
      gl.deleteSync(sync);
      resolve();
    };
    poll();
  });
}
if (!capture) {
  renderer.debug.checkShaderErrors = false;
  await renderer.compileAsync(scene, camera);
  lap('shaders');
  say(0.86, 'Mixing paint');
}
for (let i = 0; i < (capture ? 1 : 5); i++) {
  tick(1 / 60);
  if (capture) break;
  await gpuDone();
  say(0.88 + 0.025 * i, 'First strokes');
  await turn();
}
lap('first frame');

let running = false;
let last = 0;
function run() {
  const want = !hidden && !blurred && !capture;
  if (want === running) return;
  running = want;
  last = performance.now();
  renderer.setAnimationLoop(want ? () => { const now = performance.now(); tick((now - last) / 1000); last = now; } : null);
}
if (!capture) {
  const hint = document.getElementById('hint');
  addEventListener('keydown', (e) => { if (e.code === 'KeyH') hint.classList.toggle('off'); });
  setTimeout(() => hint.classList.add('faded'), 9000);
}
loaded = true;
run();
document.getElementById('loading')?.remove();
if (q.has('clean') || capture) document.getElementById('hint')?.remove();
window.lab.ready = true;

// Patch's test (?patch-test=1): it reads "pass <name>" and "fail <name>: why" from the console. Timed by the clock,
// since the test's window draws only a few frames a second.
async function autopilot() {
  const L = window.lab;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (ok, ms) => { const t = performance.now(); while (!ok() && performance.now() - t < ms) await sleep(100); return ok(); };
  console.log('pass world-loads');
  const from = player.feet.clone();
  const walked = () => Math.hypot(player.feet.x - from.x, player.feet.z - from.z);
  input.override = () => ({ move: { x: 0, y: 1 }, walk: false, sprint: false, strafe: false, jump: false, look: { x: 0, y: 0 }, zoom: 0, device: 'keyboard' });
  const moved = await until(() => walked() >= 3, 20000);
  input.override = null;
  console.log(moved ? 'pass he-walks' : `fail he-walks: moved ${walked().toFixed(2)} m in 20 s`);
  const first = L.omni.visit(0);
  console.log(first.browse === 0 && first.slide === 0 ? 'pass stone-opens' : `fail stone-opens: ${JSON.stringify(first)}`);
  // page through every board's slides with the keys a player uses, travelling board to board with Down
  const key = (code) => dispatchEvent(new KeyboardEvent('keydown', { code }));
  for (let i = 0; i < omni.stones.length; i++) {
    await until(() => L.omni.state().browse === i && !browse.state.travel, 5000);
    for (let n = 1; n < omni.stones[i].slides.length; n++) { key('ArrowRight'); await sleep(150); }
    if (i < omni.stones.length - 1) key('ArrowDown');
  }
  key('KeyE');
  const lit = await until(() => omni.lit() > 0.9, 15000);
  const st = L.omni.state();
  console.log(lit && st.count === omni.stones.length ? 'pass beacon-lights' : `fail beacon-lights: ${JSON.stringify(st)}`);
  L.omni.visit(omni.stones.length);
}
if (patchTest) autopilot().catch((e) => console.log(`fail world-loads: ${e.message}`));
