// Attract-mode backdrop: a blue wall behind the character cards with rows of
// random entities scrolling across it, alternating direction row by row.
// Every entity in a row shares the same spin, so each row turns as one.
import * as THREE from 'three';
import { makeCar, makeTruck, makeFlatbed, makeBoat, makePlane, makeTree, makeHedge, makeCoin, makeChick, makeLog, makeGator, makeSub, makeTrain } from './meshes.js';
import { CHARACTERS, rollVariant } from './characters.js';
import { rand, pick } from './util.js';

const ROWS = 7;            // rows up the wall
const ROW_BASE = -11;      // lowest row; the select camera sees the wall from about -11 to +3
const ROW_GAP = 2.4;       // vertical spacing
const HALF_W = 60;         // scroll span each side; wraps beyond this
const SPACING = 4.2;       // along the row
const WALL_Z = -13;

const MAKERS = [
  () => makeCar().mesh, () => makeTruck().mesh, () => makeFlatbed().mesh, () => makeBoat().mesh, () => makePlane().mesh,
  () => makeTree(true), makeHedge, makeCoin, makeChick, () => makeLog(3), () => makeGator().mesh, () => makeSub().mesh,
  () => makeTrain('steam', ['flat']).mesh,
  ...CHARACTERS.map((c) => () => c.make(rollVariant(c))),
];

export class Attract {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(400, 80), new THREE.MeshBasicMaterial({ color: 0x27469a, fog: false }));
    wall.position.set(0, 0, WALL_Z - 1.5);
    this.group.add(wall);
    this.rows = [];
    for (let r = 0; r < ROWS; r++) {
      const dir = r % 2 ? -1 : 1;
      const row = { y: ROW_BASE + r * ROW_GAP, dir, speed: rand(1.4, 2.6), spin: rand(0.5, 1.1) * dir, phase: rand(0, 6.28), items: [] };
      for (let x = -HALF_W; x < HALF_W; x += SPACING) {
        const m = pick(...MAKERS)();
        m.position.set(x + rand(-0.6, 0.6), row.y, WALL_Z);
        m.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
        this.group.add(m);
        row.items.push(m);
      }
      this.rows.push(row);
    }
    scene.add(this.group);
  }

  update(dt, time) {
    for (const row of this.rows) {
      const angle = row.phase + time * row.spin;
      for (const m of row.items) {
        m.position.x += row.dir * row.speed * dt;
        if (m.position.x > HALF_W) m.position.x -= 2 * HALF_W;
        if (m.position.x < -HALF_W) m.position.x += 2 * HALF_W;
        m.rotation.y = angle;
      }
    }
  }

  dispose() { this.scene.remove(this.group); }
}
