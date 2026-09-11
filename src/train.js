// Chick followers. Snake rule: after each leader hop, chick k hops to where
// the leader stood k+1 hops ago. Records remember the carrier they were on,
// so chicks ride the same log or flatbed the leader did.
import { makeChick } from './meshes.js';
import { W } from './lane.js';
import { sfx } from './sfx.js';
import { lerp } from './util.js';

const HOP = 0.16;

export class Train {
  constructor(scene, world, player) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.chicks = [];
    this.trail = [];      // most recent leader landing first
    this.delivered = 0;
    player.onLanded = () => this.onLeaderLanded();
    player.isOccupied = (c, r) => this.chicks.some((k) => !k.moving && k.rec && k.rec.row === r && Math.round(this.resolveX(k.rec)) === c);
  }

  get count() { return this.chicks.length; }

  record() {
    const p = this.player;
    const carrier = p.carrier;
    return { row: p.row, x: p.x, carrier, offset: carrier ? p.x - carrier.x : 0, rideY: carrier?.rideY ?? 0 };
  }

  resolveX(rec) { return rec.carrier ? rec.carrier.x + rec.offset : rec.x; }

  hatch() {
    const mesh = makeChick();
    this.scene.add(mesh);
    const rec = this.record();
    mesh.position.set(this.resolveX(rec), rec.rideY, -rec.row);
    this.chicks.push({ mesh, rec, moving: false, t: 0, from: null, facing: this.player.facing });
    sfx.hatch();
  }

  onLeaderLanded() {
    this.trail.unshift(this.record());
    if (this.trail.length > this.chicks.length + 1) this.trail.length = this.chicks.length + 1;
    this.chicks.forEach((k, i) => {
      const target = this.trail[i + 1];
      if (!target || target === k.rec) return;
      k.from = { x: this.resolveX(k.rec), z: -k.rec.row, y: k.rec.rideY };
      const dx = this.resolveX(target) - k.from.x, dz = -target.row - k.from.z;
      k.facing = Math.abs(dz) > Math.abs(dx) ? (dz < 0 ? 0 : Math.PI) : (dx < 0 ? Math.PI / 2 : -Math.PI / 2);
      k.rec = target;
      k.moving = true;
      k.t = -i * 0.06;   // ripple down the line
    });
  }

  lose(k, cause) {
    this.scene.remove(k.mesh);
    this.chicks = this.chicks.filter((c) => c !== k);
    (cause === 'water' ? sfx.splash : sfx.splat)();
  }

  update(dt) {
    for (const k of [...this.chicks]) {
      const tx = this.resolveX(k.rec), tz = -k.rec.row, ty = k.rec.rideY;
      let sy = 1;
      if (k.moving) {
        k.t += dt / HOP;
        const t = Math.max(0, Math.min(1, k.t));
        const s = Math.sin(Math.PI * t);
        k.mesh.position.set(lerp(k.from.x, tx, t), lerp(k.from.y, ty, t) + s * 0.4, lerp(k.from.z, tz, t));
        sy = 1 + 0.2 * s;
        if (k.t >= 1) k.moving = false;
      } else {
        k.mesh.position.set(tx, ty, tz);
      }
      k.mesh.rotation.y = k.facing;
      k.mesh.scale.set(1, sy, 1);

      if (k.moving && k.t < 0.5) continue;
      const lane = this.world.laneAt(k.rec.row);
      const cause = lane?.scenario.lethalAt?.(lane, k.mesh.position.x);
      if (cause) this.lose(k, cause);
      else if (Math.abs(k.mesh.position.x) > W + 0.6) this.lose(k, k.rec.carrier?.offCause ?? 'water');
    }
  }

  dispose() {
    for (const k of this.chicks) this.scene.remove(k.mesh);
    this.chicks = [];
  }
}
