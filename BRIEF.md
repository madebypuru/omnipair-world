# Omnipair World: brief

## Goal
An open world people can walk around in, published on Patch (patch.gg), that looks like Omnipair's imagery:
a palette-knife oil painting of a sunset coast, shown through a colour ordered dither. Omnipair's symbol and its
three products (Leverage, Lending, Trade) live in the world as things you walk up to and use.

## What we start from
This repo is a remix of `blendi/oil-paint` (MIT, CC0 art). Read `README.md` first. It draws a three.js scene as
brush dabs pinned to the world. `src/oilpaint/` is the painter. `src/night/` (aurora ridge) and `src/world/`
(autumn wood) are the two demo scenes and are the pattern to copy.

## References (the look is judged against these)
- `../brand/reference/2.webp`, `4.webp`: the plain paintings. Sea arch, cliffs, cobalt and turquoise sea, apricot
  and gold sunset, coral flowers on the clifftop.
- `../brand/reference/1.webp`, `3.webp`: the same two with the dither on. This is the final look.
- `../brand/reference/5.png` and `../brand/dither.md`: the dither settings. Bayer 8x8, size 2, levels 7,
  brightness about 1.1, contrast 1.18, colour (mono off).
- `../brand/tokens.md` and `../brand/figma/` (from the Figma brand guideline, the source of truth): the chunky
  five-terminal symbol, never coloured (cream `#FBF9F7` on dark, near-black `#0C0C0C` on light); colour comes only
  from the three product app icons: Leverage sky blue, Lending aqua turquoise, Trade dawn orange. Glassy dark cards.
  The game's copies are in `src/coast/brand/` (`tools/brand-svgs.mjs`). Font Aeonik is not ours to ship: use a
  system sans stack.

## The scene: `src/coast/`
One world, one hour: sunset on a headland. The wanderer walks north along a clifftop, sea and sun on the left.
Draft files exist, written but never run. Treat them as a first sketch to fix, not as correct code.

| File | Owns |
|---|---|
| `land.js` | Heights and land map: headland, west cliff, shelf, stacks, arch feet, east beach, the point |
| `paint.js` | The palette in GLSL: `sunOn`, `turfPaint`, `rockPaint`, `wetPaint`, `flowerPaint`, `coastSky` |
| `sky.js` | Dome, knife slabs, clouds, sun |
| `sea.js` | Far water, far headlands, near water with foam |
| `ground.js` | Near ground rings, scattered cliff and turf strokes, flowers |
| `main.js` | Not written yet. The scene's entry, modelled on `src/night/main.js` |
| `brand.js`, `brand/` | Omnipair's symbol, lockup, app icons, product colours and words |
| `omni.js`, `hud.js` | The three product stones, the great mark, and the on-screen glass |

## Rules for every task
- Patch browser game rules: self-contained, no network calls, no `alert`/popups, Esc belongs to Patch, pause on
  blur, size by `devicePixelRatio`, honour `window.patch?.quality`. `pch guide` prints the full rules.
- Keep `?capture`, `window.lab` and `tools/` working: they are how the picture is checked headless.
- Colours are paint, not light. Nothing is tone-mapped. Pick colours as they should look on the canvas.
- Stay inside the files your task names. Other agents are editing the rest at the same time.
- Do not commit, push or publish. The director does that.
- Done means you looked at a rendered still and compared it with the references, not that it compiles.
- Report back in under 200 words: what works, what you saw in the still, what is left, files touched.

---

# Rebuild: from a walk to a ride (plan v2, 2026-11-12)

## Why
The user played starrynightrider.com (ride a bicycle through The Starry Night, collect orbs, carry them to the
steeple) and said ours "looks sad in front of it". The director agrees. Theirs is a dense lit place, a fast
vehicle, a scoring loop, clear solid forms, framing and music. Ours is a slow walk across an empty meadow with
reading stops. Director's screenshots of theirs: a cobbled village street at night, warm windows and lamps,
people standing about, a rider on a bicycle; HUD with an objective chip top centre ("The Steeple 35 m"), a
Highlights list on the left (Tab cycles), a round minimap bottom left, key hints along the bottom, score top
left, music toggle top right; a title screen that is the painting in a gold frame with "Step into the painting".

Do not copy their game, art, names or layout. Take the lessons and make Omnipair's own.

## The game
**Omnipair: The pair of everything.** You ride a skim board over a painted coast at dusk, gather tokens of two
kinds, and bring them to the Pool as pairs.

- **Tokens.** Two kinds, A (cream) and B (near-black with a cream ring), as in the board slides. They float in
  trails and clusters over water, sand, turf, cliff edges and in the air off jumps. You carry counts of each.
- **Pairs.** Only pairs count: pairs = min(A, B). Riding into the Pool (the great mark at POINT) deposits every
  pair for score and keeps the leftover.
- **The three products are power-ups**, triggered by riding through the ring at each product stone:
  - Trade: swaps half your surplus kind into the kind you lack. Small fee (one token).
  - Lending: lends you tokens of the kind you lack, up to your surplus; repaid from your next deposit plus one.
  - Leverage: doubles the score of your next deposit, then triples if you chain tricks; while it is on, falling
    into deep sea or a hard crash drops what you carry.
- **Tricks.** Leaps, flips and spins in the air build a combo that multiplies the next deposit.
- **A run** is open-ended. "Finish" at the Pool (Enter) shows a score card: pairs delivered, best combo,
  products used, personal best (localStorage). No server: no global leaderboard, no live rider count.
- Reading a product's board (E) still exists and still counts for goals.

## The world
Keep the west cliff, the sea stacks, the mark-cut arch, the flowers and the point. Add what the brand imagery
shows (`../brand/figma/page-type.png`): on the east side a wide mirror-calm lagoon a hand deep, with sand bars,
a pavilion standing in the water, low far headlands and tall cloud banks. Add life: lamps along the way, a
jetty and a few boats, a handful of standing figures. **Dusk**: sun at the horizon, a deepening blue sky with
peach cloud banks, and warm lamps and windows that glow. Forms must read at a glance: solid underpainted shapes
with strokes laid on them, not loose strokes floating in air. The dither is a finish, not a fog.

## The ride
A skim board. W push, S brake, A/D carve, Shift boost, Space leap, hold Space to glide, in the air W/S flip and
A/D spin, F step off and walk (walking is what exists today). Fast and slidey on water and wet sand, slower on
turf, cannot climb cliffs. The camera sits behind and low, pulls back with speed, and leans into carves.

## Contracts (so four agents can build at once)
- Each new feature is its own module under `src/coast/` exporting `create(ctx)` which returns an object with
  `update(dt)` and whatever else it offers. `ctx` is built in `main.js` and holds: `shared, scene, camera,
  renderer, frame, physics, RAPIER, player, animator, follow, input, figure, omni, heightAt, shoreAt, landAt,
  hud, options, achievements, lab, time()` and an event hub `ctx.on(name, fn)` / `ctx.emit(name, data)`.
  If a field you need is missing, add it to ctx in main.js in one line.
- Events (emit these exact names): `ride:mount`, `ride:dismount`, `ride:leap`, `ride:land` {airtime, flips,
  spins, clean}, `ride:crash`, `ride:swim`, `token:collect` {kind}, `pool:deposit` {pairs, score, multiplier},
  `product:use` {key}, `run:finish` {score}, `title:enter`.
- State other modules may read: `ctx.ride` {mounted, speed, airborne, position, heading}, `ctx.game` {a, b,
  pairs, score, combo, multiplier, debt}.
- `main.js` is shared. Its owner is the ride agent. Everyone else adds exactly one import and one `create(ctx)`
  line plus one `update(dt)` call, re-reading the file immediately before each edit.
- UI follows the screen regions and `body[data-ui]` rules in `hud.js`. Brand: `../brand/tokens.md`. Never green.
- Patch rules still hold (self-contained, no network, no dialogs, Esc is Patch's). `?capture`, `window.lab`,
  `?patch-test=1` (four pass lines) and `tools/ui-shots.mjs` must keep working. The patch-test `he-walks`
  check may be satisfied by riding forward: W must move him 3 m with no other key.
- Build to your own folder while iterating (`npx vite build --outDir dist-<you>`, `node tools/serve.mjs
  dist-<you> <port>`), delete it at the end, and add it to .gitignore.
- Frame budget for the whole game: 10 ms on this Mac at 1080p (it is about 7.3 now). Say what you cost.
