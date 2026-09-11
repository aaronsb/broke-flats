// Character select: a row of standing cards, one per character, each with
// the character on a pedestal in front. The row slides so player 1's pick is
// centred; a changed pick spins its card once; confirming blinks the picked
// cards with a chime before the game begins.
import * as THREE from 'three';
import { box } from './meshes.js';
import { CHARACTERS } from './characters.js';
import { sfx } from './sfx.js';
import { damp, lerp } from './util.js';

const GAP = 2.1, ROW_Z = -2.2;
const CARD = [0x3a7be0, 0xe0473a, 0xf2c53d, 0x3ac9a8, 0x8f3ae0, 0xf07f2b, 0x27703a, 0x9aa4b2, 0xd9683a, 0x2f7fc9, 0x8b3a2f];
const P1 = new THREE.MeshBasicMaterial({ color: 0xffd23f });
const P2 = new THREE.MeshBasicMaterial({ color: 0x66e0ff });

export class Select {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.row = new THREE.Group();
    this.row.position.z = ROW_Z;
    this.cards = CHARACTERS.map((c, i) => {
      const g = new THREE.Group();
      g.position.x = i * GAP;
      g.add(box(1.7, 1.9, 0.12, CARD[i % CARD.length], 0, 0, -0.6));      // backdrop
      g.add(box(1.8, 0.1, 0.12, 0xffffff, 0, 1.9, -0.6));                  // top edge
      g.add(box(1.4, 0.15, 1.3, 0xdddddd, 0, 0, 0.1));                     // pedestal
      const mesh = c.make();
      mesh.scale.setScalar(1.25);
      mesh.position.set(0, 0.15, 0.1);
      g.add(mesh);
      const ring1 = box(1.9, 0.06, 1.5, P1, 0, -0.06, 0.05);
      const ring2 = box(2.1, 0.06, 1.7, P2, 0, -0.1, 0.05);
      ring1.visible = ring2.visible = false;
      g.add(ring1, ring2);
      this.row.add(g);
      return { group: g, mesh, ring1, ring2, spin: 0, blink: 0 };
    });
    scene.add(this.row);
    this.targetX = 0;
    this.row.position.x = 0;
    this.confirming = null;
    this.keep = 0;          // card index to keep on screen
    this.camera.snap(0, ROW_Z - 0.4, 'select');
  }

  // picks: roster indices; changed: which player moved (spins that card).
  setPicks(picks, changed = -1) {
    this.cards.forEach((c, i) => {
      c.ring1.visible = picks[0] === i;
      c.ring2.visible = picks[1] === i;
    });
    if (changed >= 0) this.cards[picks[changed]].spin = 1;
    this.keep = picks[Math.max(0, changed)];
  }

  // Screen-space x of card i (normalised, -1..1) at a given row offset.
  ndcX(i, rowX) {
    const v = new THREE.Vector3(i * GAP + rowX, 1, ROW_Z);
    v.project(this.camera.camera);
    return v.x;
  }

  // Slide the row only as far as needed to keep the kept card on screen.
  // Measured by projection, so it is right for any window shape.
  ensureVisible() {
    const n = this.cards.length;
    const scale = this.ndcX(0, 1) - this.ndcX(0, 0);      // ndc per world unit
    if (!(scale > 0)) return;
    const first = this.ndcX(0, this.targetX), last = this.ndcX(n - 1, this.targetX);
    if (last - first <= 1.6) { this.targetX = -((n - 1) * GAP) / 2; return; }   // fits: centre it
    const x = this.ndcX(this.keep, this.targetX);
    if (x > 0.8) this.targetX -= (x - 0.8) / scale;
    else if (x < -0.8) this.targetX += (-0.8 - x) / scale;
    if (this.ndcX(0, this.targetX) > -0.8) this.targetX -= (this.ndcX(0, this.targetX) + 0.8) / scale;
    if (this.ndcX(n - 1, this.targetX) < 0.8) this.targetX += (0.8 - this.ndcX(n - 1, this.targetX)) / scale;
  }

  confirm(picks, done) {
    if (this.confirming) return;
    this.confirming = { t: 0, picks, done };
    for (const i of picks) this.cards[i].blink = 1;
    sfx.confirm();
  }

  update(dt) {
    this.ensureVisible();
    this.row.position.x = lerp(this.row.position.x, this.targetX, damp(8, dt));
    for (const c of this.cards) {
      if (c.spin > 0) {
        c.spin = Math.max(0, c.spin - dt / 0.6);
        c.group.rotation.y = (1 - c.spin) * Math.PI * 2;
      }
      if (c.blink > 0) {
        c.blink = Math.max(0, c.blink - dt / 0.5);
        const on = Math.floor((1 - c.blink) * 6) % 2 === 0;
        c.group.scale.setScalar(on ? 1.08 : 1);
      }
      c.mesh.rotation.y = Math.sin(performance.now() / 700 + c.group.position.x) * 0.25;
    }
    this.camera.update(dt, 0, ROW_Z - 0.4);
    if (this.confirming) {
      this.confirming.t += dt;
      if (this.confirming.t > 0.7) { const d = this.confirming.done; this.confirming = null; d(); }
    }
  }

  dispose() { this.scene.remove(this.row); }
}
