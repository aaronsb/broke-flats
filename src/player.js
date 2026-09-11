import { makeChicken } from './meshes.js';
import { W } from './world.js';
import { sfx } from './sfx.js';
import { lerp } from './util.js';

const HOP = 0.16;      // seconds per hop
const BACK_LIMIT = 5;  // rows allowed behind the furthest row reached

export class Player {
  constructor(scene, world) {
    this.world = world;
    this.mesh = makeChicken();
    scene.add(this.mesh);
    this.reset();
  }

  reset() {
    this.col = 0; this.row = 0;
    this.x = 0; this.z = 0; this.y = 0;
    this.moving = false; this.t = 0;
    this.buffered = null;
    this.facing = 0;
    this.alive = true; this.deadBy = null; this.deadFor = 0;
    this.maxRow = 0; this.coins = 0;
    this.onLog = null;
    this.bump = 0;
    this.mesh.scale.set(1, 1, 1);
    this.mesh.position.set(0, 0, 0);
    this.mesh.rotation.set(0, 0, 0);
  }

  hop(dc, dr) {
    if (!this.alive) return;
    if (this.moving) { this.buffered = [dc, dr]; return; }
    this.facing = dr > 0 ? 0 : dr < 0 ? Math.PI : dc < 0 ? Math.PI / 2 : -Math.PI / 2;
    const tc = Math.round(this.x) + dc;
    const tr = this.row + dr;
    if (Math.abs(tc) > W || tr < 0 || tr < this.maxRow - BACK_LIMIT || this.world.isBlocked(tc, tr)) {
      this.bump = 0.12;
      sfx.bump();
      return;
    }
    this.from = { x: this.x, z: this.z };
    this.to = { x: tc, z: -tr };
    this.tcol = tc; this.trow = tr;
    this.moving = true; this.t = 0;
    this.onLog = null;
    sfx.hop();
  }

  die(how) {
    if (!this.alive) return;
    this.alive = false;
    this.deadBy = how;
    this.deadFor = 0;
    this.moving = false;
    if (how === 'car') sfx.splat(); else sfx.splash();
  }

  land() {
    const lane = this.world.laneAt(this.row);
    if (!lane) return;
    if (lane.type === 'river') {
      this.onLog = this.world.logAt(lane, this.x);
      if (!this.onLog) { this.die('water'); return; }
    }
    if (this.world.takeCoin(lane, this.col)) { this.coins++; sfx.coin(); }
    if (this.row > this.maxRow) this.maxRow = this.row;
    if (this.buffered) { const b = this.buffered; this.buffered = null; this.hop(...b); }
  }

  update(dt) {
    const m = this.mesh;
    if (!this.alive) {
      this.deadFor += dt;
      const k = Math.min(1, this.deadFor / 0.12);
      if (this.deadBy === 'car') m.scale.set(1 + 0.5 * k, 1 - 0.88 * k, 1 + 0.5 * k);
      else { m.position.y = -Math.min(1.2, this.deadFor * 2.5); m.rotation.z = this.deadFor * 3; }
      return;
    }

    let sx = 1, sy = 1;
    if (this.moving) {
      this.t += dt / HOP;
      const t = Math.min(1, this.t);
      this.x = lerp(this.from.x, this.to.x, t);
      this.z = lerp(this.from.z, this.to.z, t);
      const s = Math.sin(Math.PI * t);
      this.y = s * 0.55;
      sy = 1 + 0.25 * s; sx = 1 - 0.12 * s;
      if (this.t >= 1) {
        this.moving = false;
        this.x = this.to.x; this.z = this.to.z; this.y = 0;
        this.col = this.tcol; this.row = this.trow;
        this.land();
      }
    } else {
      const lane = this.world.laneAt(this.row);
      if (this.onLog && lane) {
        this.x += lane.dir * lane.speed * dt;
        this.col = Math.round(this.x);
        if (Math.abs(this.x) > W + 0.6) { this.die('water'); return; }
      }
      if (this.bump > 0) { this.bump -= dt; const k = this.bump / 0.12; sy = 1 - 0.3 * k; sx = 1 + 0.2 * k; }
    }

    // Traffic check against whichever row the chicken is mostly in.
    const checkRow = this.moving && this.t > 0.5 ? this.trow : this.row;
    const lane = this.world.laneAt(checkRow);
    if (lane && this.world.vehicleAt(lane, this.x)) { this.die('car'); }

    m.position.set(this.x, this.y, this.z);
    m.rotation.y = this.facing;
    m.scale.set(sx, sy, sx);
  }
}
