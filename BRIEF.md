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
