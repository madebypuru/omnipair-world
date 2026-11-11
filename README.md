---
kind: game
engine: three.js
---

# Omnipair World

Walk a clifftop at sunset, painted stroke by stroke like a palette-knife oil and seen through a colour dither. Three stones along the way stand for Omnipair's three products, Leverage, Lending and Trade, each painted as its app icon. Read all three and the great mark on the point, Omnipair's symbol, turns cream and lights up. It runs in the browser and is published on Patch.

![The wanderer on the clifftop among poppies, the sea stacks and the sunset over the sea](shots/coast-stacks-dither.jpg)

## Controls

| Key | Does |
|---|---|
| Click, then mouse | Look |
| WASD | Walk |
| Shift | Sprint |
| Space | Jump |
| Alt, Caps Lock | Walk slowly |
| F, right mouse | Strafe |
| Wheel | Zoom |
| E | Read a stone, and close it again |
| M | Map |
| J | Goals |
| O, Esc | Options: picture, camera, travel, progress and every key |
| V | Through his eyes |
| H | Hide the hint |

Esc shuts an open board, map or goals list first. Inside Patch's player Esc is Patch's own, so there it is O or the gear top right. Settings are remembered; `?dither=0`, `?dmatrix=16`, `?dsize=`, `?quality=`, `?impasto=`, `?sens=`, `?invert=1` and `?fov=` set them for one visit without saving.

A gamepad works too: left stick moves, right stick looks, A jumps, L3 or RB sprints, LT strafes, d-pad zooms. The game pauses when its window is hidden or loses focus.

## What is where

The scene lives in `src/coast/`. The painter it uses is `src/oilpaint/`, described below.

| File | Holds |
|---|---|
| `main.js` | Start-up, the game loop, pause, `window.lab` for headless stills, and the `?patch-test=1` autopilot |
| `land.js` | The ground's heights and land map, the sun (`SUN`), and where the arch (`ARCH`) and stacks stand |
| `paint.js` | The palette in GLSL: turf, rock, wet rock, flowers and the sky |
| `sky.js` | The sky dome, its knife slabs, the clouds and the sun |
| `sea.js` | The far water, far headlands, near water and foam |
| `ground.js` | Turf and rock strokes, and the flowers |
| `arch.js` | The sea arch |
| `brand.js`, `brand/` | Omnipair's symbol, lockup and three app icons (copied clean from the Figma export by `tools/brand-svgs.mjs`), the product colours and the panel words |
| `omni.js`, `hud.js` | The three stones, the great mark, its light column, and the glass on screen: count, prompt, panel, lockup |

`tools/shots.mjs` and `tools/omni-shots.mjs` render stills from the built game (`npm run build` first).

## Credits

Built on `blendi/oil-paint` (MIT), whose painter, figure rig and tools this repo keeps. The wanderer is Patch's CC0 starter man with Quaternius' CC0 animations. `LICENCE-NOTES.md` lists every part and its licence.

# The painter (from blendi/oil-paint)

## The idea

Nothing is filtered after the picture is drawn. Everything is a **dab**: one touch of a loaded brush, in one mixed colour, pinned to a point of the world and turned to lie along a direction of the world (the grain of a trunk, the fall of a cloak).

- **Colour is paint, not light.** A thing has three mixes (light, half-tone, shade). Each dab picks one from how lit its spot is, then is mixed a little differently from its neighbours. Nothing is tone-mapped, so you choose colours as they should look on the canvas.
- **The brush** is a sheet of eight marks made in code: where there is paint, how thick it stands, and a streak of a second colour. A light from the upper left of the canvas rakes across the thickness.
- **Distance simplifies.** Dabs keep between a least and a most size on the canvas, so far things are painted with fewer, larger touches.
- **The ground stays put.** Its dabs lie flat on it, real patches of the surface, each at its own small height, so they overlap in one fixed order and never turn with the eye. Every dab belongs to one small square of ground for good. With distance, one in four is drawn larger to stand for its neighbours; as you come nearer it shrinks back where it lies and the others grow in round it. Nothing is swapped for something else.
- **Nothing is put in order by the eye.** Which of two overlapping strokes is on top must never depend on where the camera is, or the paint crawls as you breathe. Near things are given a depth each. Far things (ranges, water, sky) are too far apart for a depth to tell them from each other, so they are laid in one fixed order, far to near.
- **Shade.** The still world's shade is drawn once from the sun (or the moon), and a dab takes it whole, so a shadow's edge is a ragged line of whole dabs. A moving thing's shadow would make dabs flick as it passed, so it goes over the ground as a soft glaze, pixel by pixel.
- **Light that is light.** A few things are painted in strokes that add up instead of covering: the aurora, a flame, the glow round a candle. A carried lamp (`uLamp`) turns what is near it toward that thing's own warm colour.
- **Mist** puts distance between one row of things and the next. In the wood, the one thing that is not a dab is the sun standing in that mist, found by walking each line of sight through the shade.

## Use it in a game

It owns the picture: a three.js `WebGLRenderer` (WebGL2), its own render target and final pass, and every material. Your scene, camera and game loop stay yours. Built on three 0.186.

```js
import * as THREE from 'three';
import { createShared, createBrushSheet, dabMaterial, dabGeometry, dabMesh, groundRings, pinDabs, createShade, createFrame } from './src/oilpaint/index.js';

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.autoClear = false;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // colours are paint: written as they are

const shared = createShared();              // sun, wind, mist, maps: every material reads these
shared.tBrush.value = createBrushSheet();
// shared.tHeight / shared.tLand: your ground's height and a map of what lies where (see src/world/land.js)

// 1. dabs of your own: positions in buffers, colour and direction decided in GLSL
const mesh = dabMesh(dabGeometry(count, { aPos: [positions, 3] }), dabMaterial(shared, {
  head: `in vec3 aPos;`,
  body: `void makeDab(inout Dab d) {
    float lit = sunAt(aPos);
    vec4 r = hash4(float(gl_InstanceID));
    d.pos = aPos;
    d.dir = vec3(0.0, 1.0, 0.0);                       // the way the stroke runs
    d.size = vec2(0.2, 0.5);                           // across and along, metres
    d.c1 = hazed(jitter(paint3(LIGHT, HALF, SHADE, lit, r.x), r.yzw, 0.5), aPos);
    d.c2 = d.c1 * 1.15;                                // the colour streaked into it
  }`,
}));

// 2. a ground with no end (see src/world/floor.js for the leaf carpet, src/night/snow.js for snow)
const carpet = groundRings(shared, { body: carpetGLSL, per: 3, n: 192, cell0: 0.14, levels: 6, minPx: [5, 9], maxPx: [4000, 4000], cells: [0, 8] });

// 3. paint on any mesh, rigged or not: pins spread over its surface and carried with it
const paint = pinDabs(shared, [[light, half, shade]], [{ mesh: model, count: 500, style: (p, n) => ({ pal: 0, size: [0.06, 0.12], dir: UP }) }]);
scene.add(mesh, carpet.group, paint.mesh);

// 4. shade and the canvas
const shade = createShade(renderer, shared, stillThingsScene);   // the still world, once
const frame = createFrame(renderer, shared);

function tick() {
  shared.uTime.value = time;
  shared.uPixel.value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / drawingBufferHeight;
  carpet.follow(camera.position.x, camera.position.z);
  paint.update();                    // after the model has moved
  shade.update(scene, heroPosition); // the moving thing's shadow: draws the meshes on layer 1
  frame.render(scene, camera);
}
```

In `makeDab` you have `paint3` (the three mixes), `jitter` (broken colour), `hazed` (mist), `sunAt` / `woodSunAt` (shade), `lampAt` (a carried light), `gustAt` (wind), `heightAt` / `normalAt` (the ground) and `hash4`. Set `d.lie = 1.0` with `d.nrm` and `d.height` for a dab that lies on a surface, `d.glaze = 1.0` for one the moving shadow passes over, and `d.base = 1.0` for one pinned by its foot (a blade of grass, a ray of the aurora). `createShade` takes the sun's direction and how much of the world its picture of the shade must hold.

For **made things** (a cabin, furniture, pots) there is a kit in `src/night/kit.js`: give it flat faces or any geometry with the name of a palette and it keeps the faces as an underpainting and lays strokes on them along the grain, with logs and planks in courses. `src/night/cabin.js`, `roof.js` and `details.js` are a whole house built with it.

## The dither

The last step of `finish.js` is a colour ordered dither, the Omnipair look (`../brand/dither.md`): Bayer 8x8,
brightness x1.1 and contrast 1.18 about mid grey, then each channel quantised to 7 levels against the Bayer
threshold. It lives on its own in `src/oilpaint/dither.js` as a GLSL string, `DITHER`, with
`vec3 dither(vec3 col, vec2 fragCoord)` and its uniforms; no textures and no integer ops, so it pastes into a p5.js
shader as is. Size is in buffer pixels (`gl_FragCoord`): size 2 is a 2x2 cell at a pixel ratio of 1 and at
`?quality=low`, and smaller on screen when the pixel ratio is above 1.

- `?dither=0` off, `?dmatrix=16` Bayer 16x16 instead of 8x8 (the brand's Shaders page), `?dsize=3` cell size,
  `?dlevels=4` tones per channel, `?dbright=1` and `?dcontrast=1` brightness and contrast. All are uniforms on
  `frame.uniforms` (`uDither`, `uDitherMatrix`, `uDitherSize`, `uDitherLevels`, `uDitherBrightness`,
  `uDitherContrast`, `uDitherMono`, `uDitherMonoColor`).
- `node tools/omni-shots.mjs dither` renders one view at 8x8 and at 16x16 with the brand page's settings (levels 7,
  brightness 1, contrast 1) to `shots/dither-8.jpg` and `shots/dither-16.jpg`.
- `node tools/dither-check.mjs` runs the same string on the plain brand paintings and writes
  `shots/dither-2.png` and `shots/dither-4.png`, with the tone error against the dithered references.

## What is where

| | |
|---|---|
| `src/oilpaint/` | The painter: `dabs.js` (the dab), `brush.js` (the marks), `common.js` (shared uniforms and GLSL), `ground.js` (the steady ground), `pins.js` (paint on a mesh), `shade.js`, `finish.js` (the canvas), `dither.js` (the colour dither) |
| `src/night/` | The aurora: `land.js` (the ridge, the horns, the fjord), `paint.js` (the night's palette), `snow.js` (snow and rock), `pines.js`, `sky.js` (stars, moon, the aurora), `far.js` (water and ranges), `cabin.js` with `kit.js`, `roof.js`, `details.js`, `lantern.js`, `tracks.js` (his footprints), `drift.js` (snow in the air), `main.js` |
| `src/world/` | The wood: `land.js` (ground and the way through), `floor.js` (leaf carpet, undergrowth), `forest.js` (about 3,100 trees: trunks, bark, about 570,000 leaf dabs), `sky.js`, `leaves.js` (falling), `kick.js` (kicked up) |
| `src/figure/` | The wanderer: Patch's starter man and his movement (`man.js`, `animator.js`, `player.js`, `input.js`), his hat, and `cloak.js`, a cloth of points on threads kept off his body and under the hat's brim |
| `src/main.js`, `src/scenes.js`, `src/boot.js` | The wood's demo; which picture is shown; the page's start |
| `tools/` | Headless stills (`shots.mjs`), a film (`clip.mjs`), frame time (`shots.mjs --time`, `fps.mjs`), steadiness (`steady.mjs` for the ground, `jitter.mjs` for anything), the scene switch (`switch.mjs`), a first visit (`cold.mjs`) |

## Limits

- three.js on WebGL2 only. It is not a node material and does not run on WebGPU.
- Almost everything is opaque: there is no glass, and water is strokes that give back the sky, not a mirror of the world.
- Textures on your models are ignored; colour comes from the palettes you give.
- Measured only on an RTX 4090 at 1080p: about 4.5 ms a frame in the aurora, about 4.6 in the wood. `?quality=low`, or Patch's performance mode, draws less (in the aurora: fewer pixels, no veil behind the curtains, less snow in the air; in the wood: no sun in the mist, fewer falling leaves).
- The demo downloads about 26 MB, most of it the wanderer's clips. A first visit is ready in about 9 seconds on a fast machine.
- Each scene is one hour of one day. Walk off the ridge into the fjord, or more than 78 m from the way in the wood, and you are put back at the start.
- Through his own eyes you see no body or hands.

## Build

`npm install`, then `npm run build`: the demo is in `dist/` with `index.html` at the top. `node tools/serve.mjs dist 5405` serves it. The tools in `tools/` drive it headless with Playwright: set `CHROME` to a Chromium of your own if Playwright has none. They show the wood unless given `--query "scene=aurora"`.

## Credits

Code MIT, art CC0 1.0. The wanderer is Patch's starter man (a MakeHuman figure, CC0) with clips from Quaternius' Universal Animation Library (CC0) and Patch's own (CC0). Physics by Rapier (Apache-2.0). Everything else in both scenes is made in code. Every part and its source is in [LICENCE-NOTES.md](LICENCE-NOTES.md).
