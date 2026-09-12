// Playable characters. Each factory returns a Group modeled facing -z, about
// one unit tall, feet at y = 0, with two pose frames: `frames[0]` at rest and
// `frames[1]` in the air (wings out, legs stretched). No rigging: the frames
// are separate box sets and only one is visible at a time.
import * as THREE from 'three';
import { box, makeChick } from './meshes.js';

const BLACK = 0x111111;
const eyes = (g, y, z, dx = 0.22, s = 0.08) => {
  g.add(box(s, s * 1.2, s, BLACK, dx, y, z));
  g.add(box(s, s * 1.2, s, BLACK, -dx, y, z));
};
const legs = (g, color, dx = 0.15, z = 0.05, h = 0.25) => {
  g.add(box(0.1, h, 0.1, color, dx, 0, z));
  g.add(box(0.1, h, 0.1, color, -dx, 0, z));
};

// Build the character twice, once per pose; `air` is true for the second.
function twoFrames(build) {
  const g = new THREE.Group();
  g.frames = [0, 1].map((i) => { const f = new THREE.Group(); build(f, i === 1); f.visible = i === 0; g.add(f); return f; });
  return g;
}

export function setFrame(mesh, i) {
  if (!mesh.frames) return;
  mesh.frames.forEach((f, k) => { f.visible = k === i; });
}

export const makeChicken = () => twoFrames((g, air) => {
  const white = 0xffffff, cream = 0xe8e8e8, orange = 0xf2a33a, red = 0xe03a2f;
  g.add(box(0.6, 0.55, 0.75, white, 0, 0.25, 0));          // body
  g.add(box(0.5, 0.5, 0.45, white, 0, 0.65, -0.25));        // head
  g.add(box(0.15, 0.25, 0.3, red, 0, 1.15, -0.25));         // comb
  g.add(box(0.16, 0.14, 0.2, orange, 0, 0.85, -0.55));      // beak
  g.add(box(0.12, 0.2, 0.12, red, 0, 0.66, -0.5));          // wattle
  eyes(g, 0.95, -0.35, 0.27);
  if (air) {                                                 // wings out flat
    g.add(box(0.5, 0.1, 0.45, cream, 0.55, 0.6, 0.05));
    g.add(box(0.5, 0.1, 0.45, cream, -0.55, 0.6, 0.05));
  } else {
    g.add(box(0.1, 0.3, 0.45, cream, 0.33, 0.35, 0.05));
    g.add(box(0.1, 0.3, 0.45, cream, -0.33, 0.35, 0.05));
  }
  g.add(box(0.3, 0.25, 0.15, cream, 0, 0.5, 0.42));         // tail
  legs(g, orange, 0.15, air ? 0.2 : 0.05, air ? 0.2 : 0.25);
});

export const makeGoose = () => twoFrames((g, air) => {
  const white = 0xf4f4f4, grey = 0xd0d0d0, bill = 0xf2a33a;
  g.add(box(0.6, 0.5, 0.95, white, 0, 0.25, 0.1));
  if (air) {
    g.add(box(0.9, 0.1, 0.55, grey, 0.75, 0.55, 0.15));      // wings spread
    g.add(box(0.9, 0.1, 0.55, grey, -0.75, 0.55, 0.15));
  } else {
    g.add(box(0.62, 0.12, 0.5, grey, 0, 0.55, 0.2));          // folded wing shading
  }
  g.add(box(0.22, 0.6, 0.22, white, 0, 0.6, air ? -0.45 : -0.35));
  g.add(box(0.34, 0.3, 0.42, white, 0, 1.15, air ? -0.55 : -0.4));
  g.add(box(0.2, 0.12, 0.3, bill, 0, 1.2, air ? -0.87 : -0.72));
  eyes(g, 1.32, air ? -0.65 : -0.5, 0.15, 0.06);
  g.add(box(0.22, 0.15, 0.2, white, 0, 0.6, 0.6));
  legs(g, bill, 0.14, air ? 0.35 : 0.15, air ? 0.18 : 0.25);
});

export const makeDuck = () => twoFrames((g, air) => {
  const body = 0x8a6a3a, head = 0x2a7a3a, bill = 0xf2c53d;
  g.add(box(0.62, 0.45, 0.85, body, 0, 0.25, 0.05));
  if (air) {
    g.add(box(0.7, 0.1, 0.5, 0xe8dcc0, 0.6, 0.5, 0.15));
    g.add(box(0.7, 0.1, 0.5, 0xe8dcc0, -0.6, 0.5, 0.15));
  } else {
    g.add(box(0.7, 0.12, 0.5, 0xe8dcc0, 0, 0.4, 0.15));
  }
  g.add(box(0.42, 0.42, 0.42, head, 0, 0.7, -0.3));
  g.add(box(0.36, 0.1, 0.32, bill, 0, 0.78, -0.62));
  eyes(g, 0.95, -0.4, 0.2);
  g.add(box(0.25, 0.15, 0.2, body, 0, 0.55, 0.5));
  legs(g, 0xf2a33a, 0.14, air ? 0.3 : 0.1, air ? 0.18 : 0.25);
});

export const makeFrog = () => twoFrames((g, air) => {
  const green = 0x4ac24a, dark = 0x2f8f2f;
  g.add(box(0.72, 0.42, 0.72, green, 0, 0.18, 0));
  g.add(box(0.72, 0.1, 0.3, air ? 0x1f5f1f : dark, 0, air ? 0.22 : 0.3, -0.36));   // mouth, open in the air
  for (const dx of [-0.22, 0.22]) {
    g.add(box(0.22, 0.22, 0.22, green, dx, 0.6, -0.15));
    g.add(box(0.1, 0.1, 0.1, BLACK, dx, 0.68, -0.27));
  }
  for (const dx of [-0.42, 0.42]) {
    if (air) {
      g.add(box(0.18, 0.14, 0.8, dark, dx, 0.05, 0.45));   // legs stretched back
      g.add(box(0.12, 0.14, 0.4, dark, dx, 0.1, -0.35));   // arms forward
    } else {
      g.add(box(0.18, 0.18, 0.4, dark, dx, 0, 0.2));
      g.add(box(0.12, 0.18, 0.3, dark, dx, 0, -0.25));
    }
  }
});

export const makePig = () => twoFrames((g, air) => {
  const pink = 0xf4a6c0, dark = 0xe07fa4;
  g.add(box(0.66, 0.55, 0.8, pink, 0, 0.25, 0.05));
  g.add(box(0.5, 0.5, 0.45, pink, 0, 0.6, -0.3));
  g.add(box(0.28, 0.2, 0.1, dark, 0, 0.7, -0.57));
  g.add(box(0.06, 0.06, 0.04, BLACK, 0.07, 0.77, -0.63));
  g.add(box(0.06, 0.06, 0.04, BLACK, -0.07, 0.77, -0.63));
  eyes(g, 0.92, -0.53, 0.14, 0.07);                          // on the face
  g.add(box(0.12, 0.18, 0.08, dark, 0.18, air ? 1.16 : 1.1, air ? -0.15 : -0.25));   // ears flap back
  g.add(box(0.12, 0.18, 0.08, dark, -0.18, air ? 1.16 : 1.1, air ? -0.15 : -0.25));
  g.add(box(0.08, 0.08, 0.2, dark, 0, air ? 0.7 : 0.6, 0.5));
  legs(g, dark, 0.2, air ? 0.35 : 0.15, air ? 0.2 : 0.25);
  legs(g, dark, 0.2, air ? -0.4 : -0.2, air ? 0.2 : 0.25);
});

// Cat archetypes: body colour, optional stripes, muzzle, and Siamese points.
const CATS = {
  tabby:   { body: 0x9a7b55, stripe: 0x5e4630, muzzle: 0xd8c2a3, points: null },
  orange:  { body: 0xf2a044, stripe: 0xc7772a, muzzle: 0xfff4e0, points: null },
  black:   { body: 0x24242a, stripe: null,     muzzle: 0x3a3a42, points: null },
  siamese: { body: 0xefe0c8, stripe: null,     muzzle: 0x5a4030, points: 0x5a4030 },
  white:   { body: 0xf8f8f8, stripe: null,     muzzle: 0xffe6ec, points: null },
};

export const makeCat = (kind = 'tabby') => { const m = twoFrames((g, air) => {
  const c = CATS[kind];
  const ear = c.points ?? c.body, paw = c.points ?? c.body, tail = c.points ?? c.stripe ?? c.body;
  const bodyY = air ? 0.35 : 0.25;
  g.add(box(0.55, 0.5, air ? 0.95 : 0.78, c.body, 0, bodyY, 0.05));     // stretched when leaping
  if (c.stripe) for (const z of [-0.15, 0.1, 0.35]) g.add(box(0.56, 0.1, 0.1, c.stripe, 0, bodyY + 0.41, z));
  g.add(box(0.48, 0.44, 0.42, c.body, 0, bodyY + 0.45, -0.3));
  g.add(box(0.2, 0.15, 0.2, c.muzzle, 0, bodyY + 0.45, -0.5));
  if (c.points) g.add(box(0.3, 0.26, 0.06, c.points, 0, bodyY + 0.47, -0.5));
  g.add(box(0.06, 0.05, 0.06, 0xe07fa4, 0, bodyY + 0.57, -0.62));
  eyes(g, bodyY + 0.72, -0.52, 0.13, 0.07);                  // on the face
  g.add(box(0.12, 0.16, 0.08, ear, 0.16, bodyY + 0.89, air ? -0.2 : -0.3));   // ears back in the air
  g.add(box(0.12, 0.16, 0.08, ear, -0.16, bodyY + 0.89, air ? -0.2 : -0.3));
  if (air) g.add(box(0.1, 0.1, 0.5, tail, 0.15, bodyY + 0.3, 0.7));    // tail straight back
  else g.add(box(0.1, 0.5, 0.1, tail, 0.15, 0.5, 0.48));
  legs(g, paw, 0.18, air ? -0.45 : 0.2, air ? 0.2 : 0.25);
  legs(g, paw, 0.18, air ? 0.5 : -0.15, air ? 0.2 : 0.25);
}); m.variant = kind; return m; };

const VISOR = new THREE.MeshBasicMaterial({ color: 0x66e0ff });
const VISOR_HOT = new THREE.MeshBasicMaterial({ color: 0xff8040 });
export const makeRobot = () => twoFrames((g, air) => {
  const steel = 0x9aa4b2, dark = 0x5a6572;
  g.add(box(0.6, 0.55, 0.6, steel, 0, 0.3, 0));
  g.add(box(0.62, 0.08, 0.62, dark, 0, 0.3, 0));
  g.add(box(0.5, 0.42, 0.5, steel, 0, 0.88, 0));
  g.add(box(0.4, 0.12, 0.06, air ? VISOR_HOT : VISOR, 0, 1.02, -0.26));
  g.add(box(0.06, 0.25, 0.06, dark, 0, 1.3, 0));
  g.add(box(0.12, 0.12, 0.12, air ? 0xffe36b : 0xff4040, 0, 1.55, 0));
  if (air) {                                                   // arms up
    g.add(box(0.12, 0.4, 0.12, dark, 0.38, 0.7, 0));
    g.add(box(0.12, 0.4, 0.12, dark, -0.38, 0.7, 0));
    g.add(box(0.5, 0.12, 0.5, 0xffb02a, 0, -0.1, 0));         // thruster glow
  } else {
    g.add(box(0.12, 0.35, 0.12, dark, 0.38, 0.35, 0));
    g.add(box(0.12, 0.35, 0.12, dark, -0.38, 0.35, 0));
  }
  g.add(box(0.7, 0.3, 0.7, dark, 0, 0, 0));
});

// Followers are half-size adults, except chickens, which get chicks.
const small = (make) => (variant) => { const m = make(variant); m.scale.setScalar(0.5); return m; };

// A character may list visual `variants`; make(variant) and young(variant)
// take the one the run rolled so a player's followers match their parent.
// Perks are plain fields the player copies; `scoreMul` scales every cash-in:
// perks that make crossing easier cost a little, handicaps pay a little.
//   swims      open water is a surface; logs pick you up, boats run you down
//   fences     fence cells are passable
//   bushes     shrub and hedge cells are passable (tunnels stay the way through a hedge wall)
//   longJump   a quick double-tap forward hops two rows
//   heavy      never bounces off a bumper, sinks the moment it touches water
//   nineLives  the first death on each level is free
//   honk       a key that makes nearby stalled vehicles pull away
export const CHARACTERS = [
  { id: 'chicken', name: 'CHICKEN', voice: 'chicken', make: makeChicken, young: makeChick, fences: true, scoreMul: 0.95 },
  { id: 'goose',   name: 'GOOSE',   voice: 'goose',   make: makeGoose,   young: small(makeGoose), swims: true, honk: true, scoreMul: 0.9 },
  { id: 'duck',    name: 'DUCK',    voice: 'duck',    make: makeDuck,    young: small(makeDuck),  swims: true, scoreMul: 0.9 },
  { id: 'frog',    name: 'FROG',    voice: 'frog',    make: makeFrog,    young: small(makeFrog), longJump: true, scoreMul: 0.9 },
  { id: 'cat',     name: 'CAT',     voice: 'cat',     make: makeCat,     young: small(makeCat), variants: Object.keys(CATS), nineLives: true, scoreMul: 0.92 },
  { id: 'pig',     name: 'PIG',     voice: 'pig',     make: makePig,     young: small(makePig), bushes: true, scoreMul: 0.9 },
  { id: 'robot',   name: 'ROBOT',   voice: 'robot',   make: makeRobot,   young: small(makeRobot), heavy: true, scoreMul: 1.05 },
];

export const rollVariant = (c) => (c.variants ? c.variants[Math.floor(Math.random() * c.variants.length)] : undefined);

export const characterById = (id) => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
