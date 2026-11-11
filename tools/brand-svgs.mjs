// Copies Omnipair's marks from the Figma export (../brand/figma) into src/coast/brand/, clean: only the shapes,
// no page, frame or guide that came with them. Run it again whenever the brand files change:
//   node tools/brand-svgs.mjs [path to brand/figma]
// symbol, wordmark and lockup are drawn in currentColor, so the page picks their colour; the three app icons keep
// their own gradients, with ids prefixed by the product so several can sit inline on one page.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = resolve(fileURLToPath(import.meta.url), '..', '..');
const from = resolve(process.argv[2] ?? resolve(here, '..', 'brand', 'figma'));
const to = resolve(here, 'src', 'coast', 'brand');
mkdirSync(to, { recursive: true });
const read = (name) => readFileSync(resolve(from, name), 'utf8');
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const paths = (svg) => [...svg.matchAll(/<path\b[^>]*\sd="([^"]+)"[^>]*>/g)].map((m) => m[1]);
const put = (name, svg) => { writeFileSync(resolve(to, name), svg + '\n'); console.log('wrote', resolve(to, name)); };
const flat = (box, ds) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" fill="currentColor">${ds.map((d) => `<path d="${d}"/>`).join('')}</svg>`;

// the symbol: one path
const symbol = paths(read('symbol.svg'));
if (symbol.length !== 1) throw new Error(`symbol.svg: expected 1 path, found ${symbol.length}`);
put('symbol.svg', flat(attr(read('symbol.svg').match(/<svg[^>]*>/)[0], 'viewBox'), symbol));

// the wordmark: its letters
const word = read('wordmark.svg');
put('wordmark.svg', flat(attr(word.match(/<svg[^>]*>/)[0], 'viewBox'), paths(word)));

// the lockup: the symbol and the letters inside <g id="lockup">, without the frame and guides round it
const lock = read('omnipair-lockup.svg');
const inner = lock.slice(lock.indexOf('<g id="lockup">'));
const lockSymbol = inner.match(/<path id="omnipair-symbol"[^>]*\sd="([^"]+)"/)[1];
const lockWord = paths(inner.slice(inner.indexOf('<g id="omnipair-wordmark">')));
put('lockup.svg', flat('0 0 567 135', [lockSymbol, ...lockWord]));

// the app icons: a rounded square in the product's gradient (a deep base and four soft blurred ellipses rising from
// the bottom) with the white glyph on it
for (const key of ['leverage', 'lending', 'trade']) {
  const svg = read(`icon-${key}.svg`);
  const tile = svg.match(/<rect width="239\.3\d*" height="239\.3\d*" rx="[\d.]+" fill="(#[0-9A-Fa-f]{6})"\/>/);
  const blur = Object.fromEntries([...svg.matchAll(/<filter id="(filter\d_f_[^"]+)"[\s\S]*?stdDeviation="([\d.]+)"/g)].map((m) => [m[1], m[2]]));
  const ellipses = [...svg.matchAll(/<g id="[-\d]+" filter="url\(#([^)]+)\)">\s*<ellipse ([^>]*)\/>/g)].map((m) => ({ blur: blur[m[1]], attrs: m[2] }));
  const glyphs = [...svg.matchAll(/<path d="([^"]+)" fill="url\(#(paint\d_linear_[^)]+)\)"\/>/g)].map((m) => ({ d: m[1], paint: m[2] }));
  const grads = Object.fromEntries([...svg.matchAll(/<linearGradient id="([^"]+)" ([^>]*)>/g)].map((m) => [m[1], m[2]]));
  if (!tile || ellipses.length !== 4 || !glyphs.length) throw new Error(`icon-${key}.svg: shape not recognised`);
  const id = (s) => `${key}-${s}`;
  const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 239.36 239.36"><defs>`
    + `<clipPath id="${id('clip')}"><rect width="239.36" height="239.36" rx="63.085"/></clipPath>`
    + ellipses.map((e, i) => `<filter id="${id(`b${i}`)}" filterUnits="userSpaceOnUse" x="-300" y="-300" width="840" height="840"><feGaussianBlur stdDeviation="${e.blur}"/></filter>`).join('')
    + glyphs.map((g, i) => `<linearGradient id="${id(`g${i}`)}" ${grads[g.paint]}><stop stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0.6"/></linearGradient>`).join('')
    + `</defs><g clip-path="url(#${id('clip')})"><rect width="239.36" height="239.36" fill="${tile[1]}"/>`
    + ellipses.map((e, i) => `<ellipse ${e.attrs} filter="url(#${id(`b${i}`)})"/>`).join('')
    + `</g>` + glyphs.map((g, i) => `<path class="glyph" d="${g.d}" fill="url(#${id(`g${i}`)})"/>`).join('') + `</svg>`;
  put(`icon-${key}.svg`, out);
}
