// The skim board he rides: a thin near-black deck with rounded ends, its edge cream, and Omnipair's symbol in cream on
// the deck. Painted like he is (figure.js's paint), so the sun and the haze fall on it as on his clothes.
// The group's origin is the middle of the board's underside; +z is its nose, +y its deck.
import * as THREE from 'three';
import { paint } from './figure.js';
import { SYMBOL, CREAM } from '../coast/brand.js';

export const BOARD = { length: 1.46, width: 0.44, thick: 0.045 };
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

function symbolTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const k = 200 / Math.max(SYMBOL.w, SYMBOL.h);
  g.translate(128 - (SYMBOL.w * k) / 2, 128 - (SYMBOL.h * k) / 2);
  g.scale(k, k);
  g.fillStyle = CREAM;
  g.fill(new Path2D(SYMBOL.path));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export function createBoard(shared) {
  const geometry = new THREE.ExtrudeGeometry(outline(), { depth: BOARD.thick, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.012, bevelSegments: 2, curveSegments: 14 });
  // the shape is drawn in x/y and pushed out along z: lay it down so y is up and the nose is +z
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, BOARD.thick, 0);
  const deck = paint(shared, DECK, { grain: 3 }), rim = paint(shared, RIM, { grain: 3 });
  // ExtrudeGeometry's groups: 0 the two faces, 1 the sides
  const body = new THREE.Mesh(geometry, [deck, rim]);
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ map: symbolTexture(), transparent: true, depthWrite: false, color: new THREE.Color(0.94, 0.92, 0.88) }));
  mark.rotation.x = -Math.PI / 2;
  mark.position.set(0, BOARD.thick + 0.013, -0.02);
  mark.renderOrder = 2;
  const group = new THREE.Group();
  group.add(body, mark);
  group.matrixAutoUpdate = true;
  return { group, deckY: BOARD.thick + 0.012 };
}
