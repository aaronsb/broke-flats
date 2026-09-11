// Followers. Snake rule: after each leader hop, follower k hops to where the
// leader stood k+1 hops ago. Records remember the carrier they were on, so
// followers ride the same log or flatbed the leader did. A follower that gets
// hit is not lost: it runs ahead to wait at the finish line and rejoins there.
import { W, OFF_EDGE } from './lane.js';
import { sfx } from './sfx.js';
import { lerp, randInt } from './util.js';

const HOP = 0.16;

export class Train {
  constructor(scene, world, player, makeYoung, voice = null) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.makeYoung = makeYoung;
    this.voice = voice;
    this.chicks = [];
    this.trail = [];      // most recent leader landing first
    this.waiting = 0;     // followers already at the finish line
    this.waitingMeshes = null;
    this.hatched = 0;     // eggs found this stage
    player.onLanded = () => this.onLeaderLanded();
  }

  get count() { return this.chicks.length; }
  get total() { return this.chicks.length + this.waiting; }

  occupies(c, r) {
    return this.chicks.some((k) => !k.moving && k.rec && k.rec.row === r && Math.round(this.resolveX(k.rec)) === c);
  }

  record() {
    const p = this.player;
    const carrier = p.carrier;
    return { row: p.row, x: p.x, carrier, offset: carrier ? p.x - carrier.x : 0, rideY: carrier?.rideY ?? 0 };
  }

  resolveX(rec) { return rec.carrier ? rec.carrier.x + rec.offset : rec.x; }

  hatch(quiet = false) {
    const mesh = this.makeYoung();
    this.scene.add(mesh);
    const rec = this.record();
    mesh.position.set(this.resolveX(rec), rec.rideY, -rec.row);
    this.chicks.push({ mesh, rec, moving: false, t: 0, from: null, facing: this.player.facing });
    if (!quiet) { sfx.hatch(); this.hatched++; }
  }

  // During the finish tally, a waiting follower next to the leader rejoins the line.
  gather() {
    if (!this.waitingMeshes) return;
    const lane = [...this.world.rows.values()].find((l) => l.scenario?.id === 'finish');
    const p = this.player;
    for (const w of [...this.waitingMeshes]) {
      const wx = w.mesh.position.x, wz = -lane.r;
      if (Math.hypot(p.x - wx, p.z - wz) > 1.2) continue;
      lane.group.remove(w.mesh);
      this.waitingMeshes = this.waitingMeshes.filter((o) => o !== w);
      this.waiting--;
      this.hatch(true);
      this.voice?.(1.6);   // the baby version of the character's call, once
    }
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

  // A hit follower scampers off to the finish line.
  lose(k) {
    this.scene.remove(k.mesh);
    this.chicks = this.chicks.filter((c) => c !== k);
    this.waiting++;
    sfx.bump();
  }

  // Send every current follower to wait at the finish (used when the leader resets).
  scatter() {
    for (const k of this.chicks) this.scene.remove(k.mesh);
    this.waiting += this.chicks.length;
    this.chicks = [];
  }

  // Show the waiting followers milling about on the finish lane once it exists.
  showWaiting() {
    if (this.waitingMeshes || this.waiting === 0) return;
    const lane = [...this.world.rows.values()].find((l) => l.scenario?.id === 'finish');
    if (!lane) return;
    this.waitingMeshes = [];
    for (let i = 0; i < this.waiting; i++) {
      const m = this.makeYoung();
      m.position.set(randInt(-W + 1, W - 1), 0, 0);
      m.rotation.y = Math.PI;
      lane.group.add(m);
      this.waitingMeshes.push({ mesh: m, phase: Math.random() * 6.28 });
    }
  }

  update(dt, time = 0) {
    this.showWaiting();
    if (this.waitingMeshes) for (const w of this.waitingMeshes) w.mesh.position.y = Math.abs(Math.sin(time * 6 + w.phase)) * 0.2;

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
      k.mesh.scale.set(k.mesh.scale.x, sy * k.mesh.scale.x, k.mesh.scale.x);

      if (k.moving && k.t < 0.5) continue;
      const lane = this.world.laneAt(k.rec.row);
      if (lane?.scenario.lethalAt?.(lane, k.mesh.position.x) || Math.abs(k.mesh.position.x) > OFF_EDGE) this.lose(k);
    }
  }

  dispose() {
    for (const k of this.chicks) this.scene.remove(k.mesh);
    this.chicks = [];
    this.waitingMeshes = null;
  }
}
