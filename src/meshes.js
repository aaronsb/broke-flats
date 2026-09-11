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

const GLASS = 0x8fd0ff, TIRE = 0x222222;
// Lamps are unlit so they read as glowing at night without any effect.
const HEADLAMP = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
const TAILLAMP = new THREE.MeshBasicMaterial({ color: 0xff2a1a });

// Vehicles are modeled driving toward +x.
export function makeCar() {
  const color = pick(...CAR_COLORS);
  const g = new THREE.Group();
  g.add(box(1.7, 0.45, 0.85, color, 0, 0.25, 0));
  g.add(box(0.85, 0.35, 0.78, GLASS, -0.05, 0.7, 0));
  g.add(box(0.9, 0.08, 0.82, color, -0.05, 1.05, 0));
  for (const sx of [-0.55, 0.55]) for (const sz of [-0.42, 0.42]) g.add(box(0.35, 0.3, 0.15, TIRE, sx, 0.05, sz));
  g.add(box(0.06, 0.15, 0.2, HEADLAMP, 0.86, 0.4, 0.28));  // headlights
  g.add(box(0.06, 0.15, 0.2, HEADLAMP, 0.86, 0.4, -0.28));
  g.add(box(0.06, 0.12, 0.2, TAILLAMP, -0.86, 0.4, 0.28)); // tail lights
  g.add(box(0.06, 0.12, 0.2, TAILLAMP, -0.86, 0.4, -0.28));
  return { mesh: g, len: 1.7 };
}

export function makeTruck() {
  const color = pick(...CAR_COLORS);
  const g = new THREE.Group();
  g.add(box(0.9, 0.85, 0.9, color, 0.95, 0.25, 0));           // cab
  g.add(box(0.3, 0.35, 0.8, GLASS, 1.26, 0.7, 0));            // windshield
  g.add(box(1.9, 1.05, 0.95, 0xe6e6e6, -0.5, 0.25, 0));       // trailer
  g.add(box(0.06, 0.15, 0.2, HEADLAMP, 1.42, 0.35, 0.3));
  g.add(box(0.06, 0.15, 0.2, HEADLAMP, 1.42, 0.35, -0.3));
  g.add(box(0.06, 0.14, 0.2, TAILLAMP, -1.46, 0.4, 0.35));
  g.add(box(0.06, 0.14, 0.2, TAILLAMP, -1.46, 0.4, -0.35));
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
  for (let i = 0; i < randInt(2, 4); i++) {                                   // bark lines
    const w = rand(0.4, Math.min(1.2, len - 0.6));
    g.add(box(w, 0.03, 0.08, pick(0x6b4423, 0x74492a), rand(-len / 2 + 0.3 + w / 2, len / 2 - 0.3 - w / 2), 0, rand(-0.28, 0.28), false));
  }
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

const haloMat = new THREE.MeshBasicMaterial({ color: 0xffe36b });
// A ring of eight little cubes.
export function makeHalo() {
  const g = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.add(box(0.14, 0.08, 0.14, haloMat, Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32, false));
  }
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
  g.add(box(0.12, 0.12, 0.12, navRed, 0.95, 0.15, 0.3));    // bow: red port, green starboard
  g.add(box(0.12, 0.12, 0.12, navGreen, 0.95, 0.15, -0.3));
  g.add(box(0.14, 0.14, 0.14, lantern, -0.5, 1.1));         // masthead lantern
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
  g.add(box(0.15, 0.12, 0.15, navRed, 0.1, 0.2, 1.15));     // wingtip lights
  g.add(box(0.15, 0.12, 0.15, navGreen, 0.1, 0.2, -1.15));
  g.add(box(0.12, 0.12, 0.12, navRed, -1.05, 1.0, 0));      // tail beacon
  return { mesh: g, len: 2.4 };
}

const eggMat = new THREE.MeshLambertMaterial({ color: 0xfff6e0, emissive: 0x332a10 });
export function makeEgg() {
  const g = new THREE.Group();
  g.add(box(0.3, 0.38, 0.3, eggMat, 0, 0.2));
  g.add(box(0.2, 0.12, 0.2, eggMat, 0, 0.56));
  return g;
}

const navRed = new THREE.MeshBasicMaterial({ color: 0xff4040 });
const navGreen = new THREE.MeshBasicMaterial({ color: 0x40ff60 });
const lantern = new THREE.MeshBasicMaterial({ color: 0xfff0a0 });
const coneMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.18, depthWrite: false });
// Translucent light spill facing +x. Defaults sit it in front of a car.
export function makeHeadlightCone(len = 2.2, x = len / 2 + 0.85, y = 0.05, z = 0, width = 1.3) {
  const m = new THREE.Mesh(unit, coneMat);
  m.scale.set(len, 0.06, width);
  m.position.set(x, y, z);
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
  g.add(box(0.06, 0.15, 0.2, HEADLAMP, 1.52, 0.35, 0.3));
  g.add(box(0.06, 0.15, 0.2, HEADLAMP, 1.52, 0.35, -0.3));
  g.add(box(0.06, 0.12, 0.2, TAILLAMP, -1.56, 0.3, 0.35));
  g.add(box(0.06, 0.12, 0.2, TAILLAMP, -1.56, 0.3, -0.35));
  for (const sx of [-1.2, -0.4, 1.05]) for (const sz of [-0.45, 0.45]) g.add(box(0.4, 0.35, 0.15, TIRE, sx, 0.05, sz));
  return { mesh: g, len: 3.1, bed: [-1.55, 0.55], rideY: 0.45, offCause: 'hauled' };
}

// Baby chick follower. Modeled facing -z like the chicken.
export function makeChick() {
  const g = new THREE.Group();
  const y = 0xffd93a, o = 0xf2a33a;
  g.add(box(0.36, 0.32, 0.4, y, 0, 0.12, 0));            // body
  g.add(box(0.3, 0.3, 0.28, y, 0, 0.4, -0.12));          // head
  g.add(box(0.1, 0.08, 0.12, o, 0, 0.5, -0.3));          // beak
  g.add(box(0.05, 0.06, 0.05, 0x111111, 0.1, 0.58, -0.2));
  g.add(box(0.05, 0.06, 0.05, 0x111111, -0.1, 0.58, -0.2));
  g.add(box(0.06, 0.14, 0.06, o, 0.08, 0, 0.02));        // legs
  g.add(box(0.06, 0.14, 0.06, o, -0.08, 0, 0.02));
  return g;
}

// ---- scenery ----

const WINDOW_LIT = new THREE.MeshBasicMaterial({ color: 0xffe28a });
const WINDOW_DARK = 0x2a3140;
const BUILDING_COLORS = [0xb8b0a4, 0xd9c8b0, 0x9c6b52, 0x7c8590, 0xc9b99a, 0x8a6a5a];
const HOUSE_COLORS = [0xf3e2c5, 0xd7e6f2, 0xf2d2c9, 0xe6f0cf, 0xf9e6a8];
const ROOF_COLORS = [0x8b3a2f, 0x4a4a55, 0x6b4a2f];

// One 1x1 column of a footprint building. `side` is which x face looks at
// the playable strip (-1 or +1); windows go on that face.
export function makeBuildingCell({ h, color, roof, windows, lit }, side) {
  const g = new THREE.Group();
  g.add(box(1, h, 1, color));
  if (roof) g.add(box(1.08, 0.22, 1.08, roof, 0, h));
  if (windows) {
    const mat = lit ? WINDOW_LIT : WINDOW_DARK;
    for (let y = 0.5; y < h - 0.5; y += 1) {
      for (const z of [-0.25, 0.25]) { const w = box(0.06, 0.4, 0.3, mat, side * 0.5, y, z, false); w.userData.window = true; g.add(w); }
    }
  }
  return g;
}

export function buildingStyle(kind, lit) {
  if (kind === 'house') return { h: rand(1.4, 2.0), color: pick(...HOUSE_COLORS), roof: pick(...ROOF_COLORS), windows: true, lit };
  return { h: rand(3, 8), color: pick(...BUILDING_COLORS), roof: null, windows: true, lit };
}

// Picket fence one cell long, running along x.
export function makeFence() {
  const g = new THREE.Group();
  const c = 0xe9e4d6;
  g.add(box(1, 0.08, 0.08, c, 0, 0.55));
  g.add(box(1, 0.08, 0.08, c, 0, 0.25));
  for (const x of [-0.35, 0, 0.35]) g.add(box(0.1, 0.8, 0.1, c, x, 0));
  return g;
}

export function makeShrub() {
  const g = new THREE.Group();
  g.add(box(0.8, 0.6, 0.8, pick(...GREENS)));
  g.add(box(0.5, 0.3, 0.5, pick(...GREENS), 0, 0.6));
  return g;
}

export function makeDumpster() {
  const g = new THREE.Group();
  g.add(box(0.9, 0.7, 0.8, 0x2f6b3a));
  g.add(box(0.95, 0.1, 0.85, 0x244f2b, 0, 0.7));
  return g;
}

export function makePlanter() {
  const g = new THREE.Group();
  g.add(box(0.9, 0.4, 0.9, 0x8a6a4a));
  g.add(box(0.7, 0.5, 0.7, pick(...GREENS), 0, 0.4));
  return g;
}

// A car parked nose-in along z, squashed to fit a one-deep row.
export function makeParkedCar() {
  const { mesh } = makeCar();
  mesh.rotation.y = pick(Math.PI / 2, -Math.PI / 2);
  mesh.scale.set(0.55, 1, 1);
  return mesh;
}

// Flat roof on four corner posts spanning three cells; the middle cell holds
// `centre` (a parked car, a bench). The bays either side stay walkable.
export function makeCanopy(centre, roofColor = 0x5a5a62) {
  const g = new THREE.Group();
  for (const x of [-1.45, 1.45]) for (const z of [-0.45, 0.45]) g.add(box(0.1, 1.3, 0.1, 0x555555, x, 0, z));
  g.add(box(3, 0.2, 1, roofColor, 0, 1.3));
  g.add(box(2.6, 0.12, 0.7, 0x3a3a40, 0, 1.5));
  if (centre) g.add(centre);
  return g;
}

export function makeBench() {
  const g = new THREE.Group();
  g.add(box(0.8, 0.08, 0.35, 0x8a5a2b, 0, 0.4));
  g.add(box(0.8, 0.3, 0.06, 0x8a5a2b, 0, 0.5, -0.18));
  for (const x of [-0.3, 0.3]) g.add(box(0.06, 0.4, 0.3, 0x333333, x, 0));
  return g;
}

export function makeParkingStripe() {
  return box(0.08, 0.02, 0.9, 0xe0e0e0, 0, 0, 0, false);
}

// ---- water traffic (all modeled moving toward +x, deck at y ≈ 0.05) ----

// Flat boat: cabin at the stern, open deck ahead of it to ride on.
export function makeRiverBoat(len = 2.4) {
  const color = pick(...CAR_COLORS);
  const g = new THREE.Group();
  g.add(box(len, 0.5, 0.9, color, 0, -0.45));
  g.add(box(len - 0.3, 0.06, 0.7, 0xd8c9a8, 0.1, 0.05));            // deck planks
  g.add(box(0.6, 0.5, 0.7, 0xf4f4f4, -len / 2 + 0.5, 0.05));         // cabin
  g.add(box(0.14, 0.14, 0.14, lantern, len / 2 - 0.15, 0.1));
  return { mesh: g, len, bed: [-len / 2 + 0.9, len / 2 - 0.1], rideY: 0.11, offCause: 'water' };
}

// Submarine: a boat that dives. Grey hull, conning tower, periscope.
export function makeSub(len = 2.6) {
  const g = new THREE.Group();
  g.add(box(len, 0.55, 0.85, 0x5f6b78, 0, -0.5));
  g.add(box(len - 0.4, 0.06, 0.6, 0x76838f, 0, 0.05));
  g.add(box(0.7, 0.5, 0.5, 0x4a5561, -0.3, 0.05));                   // tower
  g.add(box(0.06, 0.45, 0.06, 0x2f3740, -0.2, 0.55));                // periscope
  g.add(box(0.12, 0.12, 0.12, navRed, -0.3, 0.55));
  return { mesh: g, len, bed: [-len / 2 + 0.3, len / 2 - 0.1], rideY: 0.11, offCause: 'water' };
}

// Alligator: ride the back, never the head.
export function makeGator(len = 3.2) {
  const g = new THREE.Group();
  const hide = 0x3f7a3a, belly = 0x5a9a4a;
  const body = len - 1.1;
  g.add(box(body, 0.35, 0.8, hide, -0.45, -0.3));                     // body
  for (let x = -body / 2 - 0.3; x < body / 2 - 0.4; x += 0.4) g.add(box(0.2, 0.12, 0.3, belly, x, 0.05));  // ridges
  g.add(box(0.7, 0.2, 0.4, hide, -len / 2 + 0.2, -0.25));            // tail
  g.add(box(0.95, 0.3, 0.7, hide, len / 2 - 0.5, -0.28));            // head
  g.add(box(0.15, 0.15, 0.15, 0xffe36b, len / 2 - 0.75, 0.02, 0.25)); // eyes
  g.add(box(0.15, 0.15, 0.15, 0xffe36b, len / 2 - 0.75, 0.02, -0.25));
  for (const z of [-0.25, -0.08, 0.08, 0.25]) g.add(box(0.08, 0.1, 0.08, 0xffffff, len / 2 - 0.08, -0.22, z)); // teeth
  return { mesh: g, len, bed: [-len / 2 + 0.2, len / 2 - 1.0], head: [len / 2 - 1.0, len / 2 + 0.1], rideY: 0.05, offCause: 'water' };
}

const fleckMat = new THREE.MeshBasicMaterial({ color: 0xbfe6ff });
// A little foam streak drifting on the surface.
export function makeFleck() {
  const m = new THREE.Mesh(unit, fleckMat);
  m.scale.set(rand(0.3, 0.7), 0.04, 0.1);
  m.position.y = -0.27;
  return m;
}
