// Omnipair's brand as the world uses it (../brand/tokens.md, from the Figma brand guideline): the symbol, the
// lockup, and the three products, each with its app icon, its colour ramp and what its stone says. The SVGs in
// ./brand are copied clean from the Figma export by tools/brand-svgs.mjs. The mark is never coloured: cream on dark,
// near-black on light. Colour belongs to the products.
import symbolSvg from './brand/symbol.svg?raw';
import lockupSvg from './brand/lockup.svg?raw';
import leverageSvg from './brand/icon-leverage.svg?raw';
import lendingSvg from './brand/icon-lending.svg?raw';
import tradeSvg from './brand/icon-trade.svg?raw';

export const CREAM = '#FBF9F7';
export const INK = '#0C0C0C';

const box = (svg) => svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
const ds = (svg, sel = '') => [...svg.matchAll(new RegExp(`<path ${sel}d="([^"]+)"`, 'g'))].map((m) => m[1]);

/** The symbol: one path, `w` by `h` in its own units, y down. */
export const SYMBOL = { path: ds(symbolSvg)[0], w: box(symbolSvg)[2], h: box(symbolSvg)[3] };

/** The three products, south to north along the way. ramp: the icon's gradient, deep at the top to light at the foot.
 *  slides: what its board shows, in order: what it is, how it works, why the single pool matters, a closing line.
 *  `art` names a drawing in boards.js. Plain words, no rates or promises. */
export const PRODUCTS = [
  {
    key: 'leverage', name: 'Leverage', z: 230, icon: leverageSvg,
    ramp: ['#062D8F', '#083DB5', '#37A9FB', '#9BD4FE'],
    text: 'Go long or short on a token, straight from the pool. The pool lends you the extra, so the whole position sits in the same place as the liquidity it draws on.',
    slides: [
      { art: 'long-short', title: 'Go long or short on a token.', text: 'Leverage lets you take a bigger position than the tokens you put in, betting the price goes up, or down.' },
      { art: 'multiply', title: 'Your stake, plus what the pool lends you.', text: 'You put in a stake. The pool lends you more of the pair, and together they make one larger position.' },
      { art: 'rise', title: 'The position rises from the pool itself.', text: 'The extra comes from the same pool that traders and lenders use, so nothing is borrowed from somewhere else.' },
      { art: 'close', title: 'Leverage, from the pool.', text: 'One pool for the pair. It trades, it lends, and it backs your position.' },
    ],
  },
  {
    key: 'lending', name: 'Lending', z: 80, icon: lendingSvg,
    ramp: ['#047269', '#079E92', '#30E7D7', '#D6FAF7'],
    text: 'Lend your tokens, or borrow against them, with no one in between. Lenders earn the interest that borrowers pay.',
    slides: [
      { art: 'lend-borrow', title: 'Lend your tokens, or borrow against them.', text: 'Lenders put tokens into the pool. Borrowers take tokens out, with no one in between.' },
      { art: 'loan-loop', title: 'Collateral in, loan out, interest back.', text: 'A borrower leaves one token as collateral and takes a loan of the other. The interest they pay goes back to the pool.' },
      { art: 'shared', title: 'Lent from the pool traders use.', text: 'The tokens you lend sit in the pair’s one pool, so the same liquidity is there for trades and for loans.' },
      { art: 'close', title: 'Lending, from the pool.', text: 'Lenders earn the interest that borrowers pay, all inside one pool.' },
    ],
  },
  {
    key: 'trade', name: 'Trade', z: -70, icon: tradeSvg,
    ramp: ['#6A1306', '#9C2301', '#EF8332', '#FFEF7A'],
    text: 'Swap one token for another at a low fee. Each pair has a single pool, so every trade draws on all of that pair\'s liquidity.',
    slides: [
      { art: 'swap', title: 'Swap one token for another.', text: 'Give the pool one token of a pair and it gives you the other.' },
      { art: 'two-into-one', title: 'Two tokens, one pool.', text: 'Each pair has a single pool holding both of its tokens. Every trade puts one in and takes the other out.' },
      { art: 'merge', title: 'All of the pair’s liquidity, in one place.', text: 'The pair’s liquidity is not split across many small pools, so every trade draws on all of it.' },
      { art: 'close', title: 'Trade, from the pool.', text: 'One pool for the pair, and every trade meets all of it.' },
    ],
  },
].map((p) => ({ ...p, glyph: { paths: ds(p.icon, 'class="glyph" '), w: 239.36, h: 239.36 } }));

/** The great mark at the point: what its panel says once it is lit. */
export const GREAT = {
  name: 'Omnipair',
  title: 'Omnipair: The pair of everything.',
  text: 'Every pair on Omnipair is one pool, and that one pool does all three. The liquidity you trade against is the same liquidity that is lent out and that backs leverage.',
};

/** A hex colour as three numbers 0..1 (display values: colours are paint here, nothing is tone-mapped). */
export const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

/** Inline SVG markup for the page, drawn in currentColor. */
export const symbolMarkup = (cls) => symbolSvg.replace('<svg ', `<svg class="${cls}" aria-hidden="true" `);
export const lockupMarkup = (cls) => lockupSvg.replace('<svg ', `<svg class="${cls}" role="img" aria-label="omnipair" `);
export const iconMarkup = (p, cls) => p.icon.replace('<svg ', `<svg class="${cls}" aria-hidden="true" `);
