import * as THREE from 'three';
import { pick, rand, randInt } from './util.js';

const unit = new THREE.BoxGeometry(1, 1, 1);
const mats = new Map();

export function mat(color) {
  let m = mats.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    mats.set(color, m);
  }
  return m;
}

// Box with its base at y (not its center), so stacking reads naturally.
export function box(w, h, d, color, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(unit, typeof color === 'number' ? mat(color) : color);
  m.scale.set(w, h, d);
  m.position.set(x, y + h / 2, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

export const HEDGE = 0x2f7a2f;
const GREENS = [0x2e8b3d, 0x3da34a, 0x27703a, 0x46a852];
const CAR_COLORS = [0xe0473a, 0x3a7be0, 0xf2c53d, 0xffffff, 0x8f3ae0, 0x3ac9a8, 0xf07f2b];

// Modeled facing -z (screen-up in the top-down view).
export function makeChicken() {
  const g = new THREE.Group();
  const white = 0xffffff, cream = 0xe8e8e8, orange = 0xf2a33a, red = 0xe03a2f;
  g.add(box(0.6, 0.55, 0.75, white, 0, 0.25, 0));          // body
  g.add(box(0.5, 0.5, 0.45, white, 0, 0.65, -0.25));        // head
  g.add(box(0.15, 0.25, 0.3, red, 0, 1.15, -0.25));         // comb
  g.add(box(0.16, 0.14, 0.2, orange, 0, 0.85, -0.55));      // beak
  g.add(box(0.12, 0.2, 0.12, red, 0, 0.66, -0.5));          // wattle
  g.add(box(0.08, 0.1, 0.08, 0x111111, 0.27, 0.95, -0.35)); // eyes
  g.add(box(0.08, 0.1, 0.08, 0x111111, -0.27, 0.95, -0.35));
  g.add(box(0.1, 0.3, 0.45, cream, 0.33, 0.35, 0.05));      // wings
  g.add(box(0.1, 0.3, 0.45, cream, -0.33, 0.35, 0.05));
  g.add(box(0.3, 0.25, 0.15, cream, 0, 0.5, 0.42));         // tail
  g.add(box(0.1, 0.25, 0.1, orange, 0.15, 0, 0.05));        // legs
  g.add(box(0.1, 0.25, 0.1, orange, -0.15, 0, 0.05));
  return g;
}

const GLASS = 0x8fd0ff, TIRE = 0x222222;

// Vehicles are modeled driving toward +x.
export function makeCar() {
  const color = pick(...CAR_COLORS);
  const g = new THREE.Group();
  g.add(box(1.7, 0.45, 0.85, color, 0, 0.25, 0));
  g.add(box(0.85, 0.35, 0.78, GLASS, -0.05, 0.7, 0));
  g.add(box(0.9, 0.08, 0.82, color, -0.05, 1.05, 0));
  for (const sx of [-0.55, 0.55]) for (const sz of [-0.42, 0.42]) g.add(box(0.35, 0.3, 0.15, TIRE, sx, 0.05, sz));
  g.add(box(0.06, 0.15, 0.2, 0xfff2a8, 0.86, 0.4, 0.28));  // headlights
  g.add(box(0.06, 0.15, 0.2, 0xfff2a8, 0.86, 0.4, -0.28));
  g.add(box(0.06, 0.12, 0.2, 0xff3b30, -0.86, 0.4, 0.28)); // tail lights
  g.add(box(0.06, 0.12, 0.2, 0xff3b30, -0.86, 0.4, -0.28));
  return { mesh: g, len: 1.7 };
}

export function makeTruck() {
  const color = pick(...CAR_COLORS);
  const g = new THREE.Group();
  g.add(box(0.9, 0.85, 0.9, color, 0.95, 0.25, 0));           // cab
  g.add(box(0.3, 0.35, 0.8, GLASS, 1.26, 0.7, 0));            // windshield
  g.add(box(1.9, 1.05, 0.95, 0xe6e6e6, -0.5, 0.25, 0));       // trailer
  g.add(box(0.06, 0.15, 0.2, 0xfff2a8, 1.42, 0.35, 0.3));
  g.add(box(0.06, 0.15, 0.2, 0xfff2a8, 1.42, 0.35, -0.3));
  for (const sx of [-1.15, -0.45, 1.0]) for (const sz of [-0.45, 0.45]) g.add(box(0.4, 0.35, 0.15, TIRE, sx, 0.05, sz));
  return { mesh: g, len: 2.9 };
}

export function makeTree(tall = false) {
  const g = new THREE.Group();
  const h = tall ? rand(0.9, 1.6) : rand(0.5, 1.0);
  const c1 = pick(...GREENS), c2 = pick(...GREENS);
  g.add(box(0.3, h, 0.3, 0x7a4a1f));
  g.add(box(0.9, 0.9, 0.9, c1, 0, h));
  g.add(box(0.6, 0.5, 0.6, c2, 0, h + 0.9));
  if (tall) g.add(box(0.35, 0.35, 0.35, c1, 0, h + 1.4));
  return g;
}

// Wide flat canopy over the two neighbouring cells. Straight down it hides
// whatever sits under it; tilt the camera and the underside shows.
export function makeUmbrellaTree() {
  const g = new THREE.Group();
  const c1 = pick(...GREENS), c2 = pick(...GREENS);
  g.add(box(0.3, 1.3, 0.3, 0x7a4a1f));
  g.add(box(2.95, 0.6, 0.98, c1, 0, 1.3));
  g.add(box(1.6, 0.5, 0.8, c2, 0, 1.9));
  g.add(box(0.7, 0.4, 0.5, c1, 0, 2.4));
  return g;
}

export function makeLog(len) {
  const g = new THREE.Group();
  g.add(box(len, 0.45, 0.8, 0x8b5a2b, 0, -0.45));
  g.add(box(0.12, 0.35, 0.6, 0xc4915c, -len / 2 + 0.02, -0.4));
  g.add(box(0.12, 0.35, 0.6, 0xc4915c, len / 2 - 0.02, -0.4));
  return g;
}

const coinMat = new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x6b4a00 });
export function makeCoin() {
  const g = new THREE.Group();
  g.add(box(0.45, 0.45, 0.12, coinMat, 0, 0.3));
  g.add(box(0.15, 0.25, 0.14, 0xc99a1c, 0, 0.4));
  return g;
}

const HEDGE_H = 1.5;

// Random top clutter. Both hedge variants call this so the roofline is
// indistinguishable from straight above.
function greeble(g, top) {
  const n = randInt(2, 4);
  for (let i = 0; i < n; i++) {
    const s = rand(0.18, 0.36);
    g.add(box(s, rand(0.1, 0.22), s, pick(0x3a8c3a, 0x2a6e2a, 0x45a045), rand(-0.32, 0.32), top, rand(-0.32, 0.32)));
  }
}

export function makeHedge() {
  const g = new THREE.Group();
  g.add(box(0.98, HEDGE_H, 0.98, HEDGE));
  greeble(g, HEDGE_H);
  return g;
}

// Same footprint and roofline as a hedge, with a walk-through gap underneath.
export function makeTunnel() {
  const g = new THREE.Group();
  g.add(box(0.98, HEDGE_H - 1.0, 0.98, HEDGE, 0, 1.0));
  greeble(g, HEDGE_H);
  g.add(box(1, 0.05, 1, 0x4a2f14, 0, 0, 0, false));
  return g;
}

export function makeGround(width, color, top = 0, thick = 0.5) {
  return box(width, thick, 1, color, 0, top - thick, 0, false);
}

// ---- battle targets and night props ----

// Boats are modeled sailing toward +x, sitting on the water surface (-0.3).
export function makeBoat() {
  const color = pick(...CAR_COLORS);
  const g = new THREE.Group();
  g.add(box(2.2, 0.5, 0.9, color, 0, -0.4));               // hull
  g.add(box(0.9, 0.5, 0.7, 0xf4f4f4, -0.2, 0.1));          // cabin
  g.add(box(0.4, 0.3, 0.6, GLASS, 0.3, 0.15));             // windshield
  g.add(box(0.12, 0.5, 0.12, 0x333333, -0.5, 0.6));        // stack
  return { mesh: g, len: 2.2 };
}

// Planes are modeled flying toward +x.
export function makePlane() {
  const color = pick(...CAR_COLORS);
  const g = new THREE.Group();
  g.add(box(2.4, 0.5, 0.5, color, 0, 0));                  // fuselage
  g.add(box(0.7, 0.35, 2.4, 0xf4f4f4, 0.1, 0.05));         // wings
  g.add(box(0.5, 0.5, 0.9, color, -1.0, 0.3));             // tail
  g.add(box(0.4, 0.5, 0.15, color, -1.05, 0.5));           // fin
  g.add(box(0.5, 0.3, 0.45, GLASS, 0.6, 0.45));            // cockpit
  return { mesh: g, len: 2.4 };
}

const eggMat = new THREE.MeshLambertMaterial({ color: 0xfff6e0, emissive: 0x332a10 });
export function makeEgg() {
  const g = new THREE.Group();
  g.add(box(0.3, 0.38, 0.3, eggMat, 0, 0.2));
  g.add(box(0.2, 0.12, 0.2, eggMat, 0, 0.56));
  return g;
}

const coneMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.35, depthWrite: false });
// Additive-looking light spill in front of a vehicle, facing +x.
export function makeHeadlightCone(len = 2.2) {
  const m = new THREE.Mesh(unit, coneMat);
  m.scale.set(len, 0.06, 1.3);
  m.position.set(len / 2 + 0.85, 0.05, 0);
  return m;
}

const fireflyMat = new THREE.MeshBasicMaterial({ color: 0xd8ff5a });
export function makeFirefly() {
  const m = new THREE.Mesh(unit, fireflyMat);
  m.scale.set(0.12, 0.12, 0.12);
  return m;
}

export function makeFlag(color) {
  const g = new THREE.Group();
  g.add(box(0.12, 1.8, 0.12, 0xdddddd));
  g.add(box(0.06, 0.5, 0.8, color, 0, 1.3, 0.4));
  return g;
}

export function makeCheckerTile(c) {
  return box(1, 0.06, 1, c % 2 ? 0xf2f2f2 : 0x222222, 0, 0, 0, false);
}

// Flatbed truck: the cab kills, the low bed behind it carries you like a log.
// Modeled driving toward +x; bed spans local x in [-1.55, 0.55].
export function makeFlatbed() {
  const color = pick(...CAR_COLORS);
  const g = new THREE.Group();
  g.add(box(0.9, 0.85, 0.9, color, 1.05, 0.25, 0));           // cab
  g.add(box(0.3, 0.35, 0.8, GLASS, 1.36, 0.7, 0));            // windshield
  g.add(box(2.1, 0.2, 0.95, 0x5a4634, -0.5, 0.25, 0));        // bed
  g.add(box(2.1, 0.12, 0.08, 0x3a2c20, -0.5, 0.45, 0.44));    // side rails
  g.add(box(2.1, 0.12, 0.08, 0x3a2c20, -0.5, 0.45, -0.44));
  g.add(box(0.08, 0.5, 0.95, 0x3a2c20, 0.52, 0.45, 0));       // headboard
  g.add(box(0.06, 0.15, 0.2, 0xfff2a8, 1.52, 0.35, 0.3));
  g.add(box(0.06, 0.15, 0.2, 0xfff2a8, 1.52, 0.35, -0.3));
  for (const sx of [-1.2, -0.4, 1.05]) for (const sz of [-0.45, 0.45]) g.add(box(0.4, 0.35, 0.15, TIRE, sx, 0.05, sz));
  return { mesh: g, len: 3.1, bed: [-1.55, 0.55], rideY: 0.45, offCause: 'hauled' };
}
