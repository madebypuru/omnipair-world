// The skim board he rides: a near-black deck with rounded ends, its edge cream, a stripe of the three products' colours
// down it with Omnipair's symbol in cream, and Lending's turquoise underneath. Painted like he is (figure.js's paint), so the sun and the haze fall on it as on his clothes.
// The group's origin is the middle of the board's underside; +z is its nose, +y its deck.
import * as THREE from 'three';
import { paint } from './figure.js';
import { SYMBOL, CREAM, PRODUCTS, rgb } from '../coast/brand.js';

export const BOARD = { length: 1.46, width: 0.44, thick: 0.06 };
const DECK = [[0.13, 0.13, 0.15], [0.07, 0.07, 0.085], [0.035, 0.035, 0.05]];
const RIM = [[0.99, 0.96, 0.9], [0.82, 0.74, 0.7], [0.5, 0.44, 0.5]];

function outline() {
  const { length: L, width: W } = BOARD;
  const s = new THREE.Shape();
  const r = W / 2, half = L / 2 - r;
  // a long capsule, the nose a little narrower than the tail
  s.moveTo(-r, -half);
  s.lineTo(-r * 0.92, half);
  s.absarc(0, half, r * 0.92, Math.PI, 0, true);
  s.lineTo(r, -half);
  s.absarc(0, -half, r, 0, Math.PI, true);
  return s;
}

// the deck's top as the follow camera sees it: near-black, a cream line just in from the edge, a stripe down the middle
// running through the three products' colours (Leverage at the nose, Lending, Trade at the tail) and the symbol in cream
// on it. Drawn in the outline's own metres, nose up the canvas.
const PX = 400; // canvas pixels per metre
function deckTexture() {
  const { length: L, width: W } = BOARD;
  const c = document.createElement('canvas');
  c.width = Math.round(W * PX); c.height = Math.round(L * PX);
  const g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2);
  g.scale(PX, -PX);
  const edge = new Path2D();
  for (const [i, p] of outline().getPoints(24).entries()) i ? edge.lineTo(p.x, p.y) : edge.moveTo(p.x, p.y);
  edge.closePath();
  g.fillStyle = '#1b1816';
  g.fill(edge);
  const stripe = g.createLinearGradient(0, L / 2, 0, -L / 2);
  PRODUCTS.forEach((p, i) => stripe.addColorStop(i / (PRODUCTS.length - 1), p.ramp[2]));
  g.save();
  g.clip(edge);
  g.fillStyle = stripe;
  g.fillRect(-0.06, -L / 2, 0.12, L);
  g.restore();
  g.strokeStyle = CREAM;
  g.lineWidth = 0.022;
  g.save();
  g.scale(0.9, 0.955);
  g.stroke(edge);
  g.restore();
  // the symbol, cream, on a near-black disc so it stands clear of the stripe
  g.save();
  g.translate(0, -0.08);
  g.fillStyle = '#1b1816';
  g.beginPath(); g.arc(0, 0, 0.12, 0, Math.PI * 2); g.fill();
  const k = 0.18 / Math.max(SYMBOL.w, SYMBOL.h);
  g.scale(k, -k);
  g.translate(-SYMBOL.w / 2, -SYMBOL.h / 2);
  g.fillStyle = CREAM;
  g.fill(new Path2D(SYMBOL.path));
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A flat copy of the outline lying at height y (seen from both sides), its UVs spanning the board, nose +z. */
function face(y) {
  const { length: L, width: W } = BOARD;
  const g = new THREE.ShapeGeometry(outline(), 14);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / W + 0.5, pos.getY(i) / L + 0.5);
  g.rotateX(Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

export function createBoard(shared) {
  const geometry = new THREE.ExtrudeGeometry(outline(), { depth: BOARD.thick, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.012, bevelSegments: 2, curveSegments: 14 });
  // the shape is drawn in x/y and pushed out along z: lay it down so y is up and the nose is +z
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, BOARD.thick, 0);
  const deck = paint(shared, DECK, { grain: 3 }), rim = paint(shared, RIM, { grain: 3 });
  // ExtrudeGeometry's groups: 0 the two faces, 1 the sides (cream)
  const body = new THREE.Mesh(geometry, [deck, rim]);
  const top = new THREE.Mesh(face(BOARD.thick + 0.01), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, map: deckTexture(), color: new THREE.Color(0.95, 0.93, 0.9), polygonOffset: true, polygonOffsetFactor: -2 }));
  // the underside in Lending's turquoise, seen in a flip and from low over the water
  const under = new THREE.Mesh(face(-0.004), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: new THREE.Color().setRGB(...rgb(PRODUCTS[1].ramp[2])).multiplyScalar(0.85) }));
  const group = new THREE.Group();
  group.add(body, top, under);
  group.matrixAutoUpdate = true;
  return { group, deckY: BOARD.thick + 0.012 };
}
