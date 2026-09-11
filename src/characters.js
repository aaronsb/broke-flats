// Playable characters. Each factory returns a Group modeled facing -z,
// about one unit tall, feet at y = 0.
import * as THREE from 'three';
import { box, makeChicken, makeChick } from './meshes.js';

const BLACK = 0x111111;
const eyes = (g, y, z, dx = 0.22, s = 0.08) => {
  g.add(box(s, s * 1.2, s, BLACK, dx, y, z));
  g.add(box(s, s * 1.2, s, BLACK, -dx, y, z));
};
const legs = (g, color, dx = 0.15, z = 0.05, h = 0.25) => {
  g.add(box(0.1, h, 0.1, color, dx, 0, z));
  g.add(box(0.1, h, 0.1, color, -dx, 0, z));
};

export function makeDuck() {
  const g = new THREE.Group();
  const body = 0x8a6a3a, head = 0x2a7a3a, bill = 0xf2c53d;
  g.add(box(0.62, 0.45, 0.85, body, 0, 0.25, 0.05));
  g.add(box(0.7, 0.12, 0.5, 0xe8dcc0, 0, 0.4, 0.15));       // wing band
  g.add(box(0.42, 0.42, 0.42, head, 0, 0.7, -0.3));
  g.add(box(0.36, 0.1, 0.32, bill, 0, 0.78, -0.62));
  eyes(g, 0.95, -0.4, 0.2);
  g.add(box(0.25, 0.15, 0.2, body, 0, 0.55, 0.5));          // tail
  legs(g, 0xf2a33a, 0.14, 0.1, 0.25);
  return g;
}

export function makeFrog() {
  const g = new THREE.Group();
  const green = 0x4ac24a, dark = 0x2f8f2f;
  g.add(box(0.72, 0.42, 0.72, green, 0, 0.18, 0));
  g.add(box(0.72, 0.1, 0.3, dark, 0, 0.3, -0.36));          // mouth line
  for (const dx of [-0.22, 0.22]) {
    g.add(box(0.22, 0.22, 0.22, green, dx, 0.6, -0.15));    // eye bumps
    g.add(box(0.1, 0.1, 0.1, BLACK, dx, 0.68, -0.27));
  }
  for (const dx of [-0.42, 0.42]) {
    g.add(box(0.18, 0.18, 0.4, dark, dx, 0, 0.2));          // back legs
    g.add(box(0.12, 0.18, 0.3, dark, dx, 0, -0.25));        // front legs
  }
  return g;
}

export function makePig() {
  const g = new THREE.Group();
  const pink = 0xf4a6c0, dark = 0xe07fa4;
  g.add(box(0.66, 0.55, 0.8, pink, 0, 0.25, 0.05));
  g.add(box(0.5, 0.5, 0.45, pink, 0, 0.6, -0.3));
  g.add(box(0.28, 0.2, 0.1, dark, 0, 0.7, -0.57));          // snout
  g.add(box(0.06, 0.06, 0.04, BLACK, 0.07, 0.77, -0.63));
  g.add(box(0.06, 0.06, 0.04, BLACK, -0.07, 0.77, -0.63));
  eyes(g, 0.92, -0.4, 0.18, 0.07);
  g.add(box(0.12, 0.18, 0.08, dark, 0.18, 1.1, -0.25));     // ears
  g.add(box(0.12, 0.18, 0.08, dark, -0.18, 1.1, -0.25));
  g.add(box(0.08, 0.08, 0.2, dark, 0, 0.6, 0.5));           // tail
  legs(g, dark, 0.2, 0.15, 0.25);
  legs(g, dark, 0.2, -0.2, 0.25);
  return g;
}

// Cat archetypes: body colour, optional stripes, muzzle, and Siamese points.
const CATS = {
  tabby:   { body: 0x9a7b55, stripe: 0x5e4630, muzzle: 0xd8c2a3, points: null },
  orange:  { body: 0xf2a044, stripe: 0xc7772a, muzzle: 0xfff4e0, points: null },
  black:   { body: 0x24242a, stripe: null,     muzzle: 0x3a3a42, points: null },
  siamese: { body: 0xefe0c8, stripe: null,     muzzle: 0x5a4030, points: 0x5a4030 },
  white:   { body: 0xf8f8f8, stripe: null,     muzzle: 0xffe6ec, points: null },
};

export function makeCat(kind = 'tabby') {
  const c = CATS[kind];
  const g = new THREE.Group();
  const ear = c.points ?? c.body, paw = c.points ?? c.body, tail = c.points ?? c.stripe ?? c.body;
  g.add(box(0.55, 0.5, 0.78, c.body, 0, 0.25, 0.05));
  if (c.stripe) for (const z of [-0.15, 0.1, 0.35]) g.add(box(0.56, 0.1, 0.1, c.stripe, 0, 0.66, z));
  g.add(box(0.48, 0.44, 0.42, c.body, 0, 0.7, -0.3));
  g.add(box(0.2, 0.15, 0.2, c.muzzle, 0, 0.7, -0.5));         // muzzle
  if (c.points) g.add(box(0.3, 0.26, 0.06, c.points, 0, 0.72, -0.5));  // face mask
  g.add(box(0.06, 0.05, 0.06, 0xe07fa4, 0, 0.82, -0.62));     // nose
  eyes(g, 0.95, -0.45, 0.16, 0.07);
  g.add(box(0.12, 0.16, 0.08, ear, 0.16, 1.14, -0.3));        // ears
  g.add(box(0.12, 0.16, 0.08, ear, -0.16, 1.14, -0.3));
  g.add(box(0.1, 0.5, 0.1, tail, 0.15, 0.5, 0.48));           // tail up
  legs(g, paw, 0.18, 0.2, 0.25);
  legs(g, paw, 0.18, -0.15, 0.25);
  return g;
}

export function makeGoose() {
  const g = new THREE.Group();
  const white = 0xf4f4f4, grey = 0xd0d0d0, bill = 0xf2a33a;
  g.add(box(0.6, 0.5, 0.95, white, 0, 0.25, 0.1));
  g.add(box(0.62, 0.12, 0.5, grey, 0, 0.55, 0.2));          // wing shading
  g.add(box(0.22, 0.6, 0.22, white, 0, 0.6, -0.35));         // neck
  g.add(box(0.34, 0.3, 0.42, white, 0, 1.15, -0.4));         // head
  g.add(box(0.2, 0.12, 0.3, bill, 0, 1.2, -0.72));
  eyes(g, 1.32, -0.5, 0.15, 0.06);
  g.add(box(0.22, 0.15, 0.2, white, 0, 0.6, 0.6));           // tail
  legs(g, bill, 0.14, 0.15, 0.25);
  return g;
}

// Followers are half-size adults, except chickens, which get chicks.
const small = (make) => () => { const m = make(); m.scale.setScalar(0.5); return m; };

const VISOR = new THREE.MeshBasicMaterial({ color: 0x66e0ff });
export function makeRobot() {
  const g = new THREE.Group();
  const steel = 0x9aa4b2, dark = 0x5a6572;
  g.add(box(0.6, 0.55, 0.6, steel, 0, 0.3, 0));
  g.add(box(0.62, 0.08, 0.62, dark, 0, 0.3, 0));            // belt
  g.add(box(0.5, 0.42, 0.5, steel, 0, 0.88, 0));
  g.add(box(0.4, 0.12, 0.06, VISOR, 0, 1.02, -0.26));       // visor
  g.add(box(0.06, 0.25, 0.06, dark, 0, 1.3, 0));            // antenna
  g.add(box(0.12, 0.12, 0.12, 0xff4040, 0, 1.55, 0));
  g.add(box(0.12, 0.35, 0.12, dark, 0.38, 0.35, 0));        // arms
  g.add(box(0.12, 0.35, 0.12, dark, -0.38, 0.35, 0));
  g.add(box(0.7, 0.3, 0.7, dark, 0, 0, 0));                 // treads
  return g;
}

export const CHARACTERS = [
  { id: 'chicken', name: 'CHICKEN', voice: 'chicken', make: makeChicken, young: makeChick },
  { id: 'goose',   name: 'GOOSE',   voice: 'goose',   make: makeGoose,   young: small(makeGoose) },
  { id: 'duck',    name: 'DUCK',    voice: 'duck',    make: makeDuck,    young: small(makeDuck) },
  { id: 'frog',    name: 'FROG',    voice: 'frog',    make: makeFrog,    young: small(makeFrog) },
  ...['tabby', 'orange', 'black', 'siamese', 'white'].map((k) => ({
    id: `cat-${k}`, name: `${k.toUpperCase()} CAT`, voice: 'cat', make: () => makeCat(k), young: small(() => makeCat(k)),
  })),
  { id: 'pig',     name: 'PIG',     voice: 'pig',     make: makePig,     young: small(makePig) },
  { id: 'robot',   name: 'ROBOT',   voice: 'robot',   make: makeRobot,   young: small(makeRobot) },
];

export const characterById = (id) => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
