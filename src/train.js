// Followers. Snake rule: after each leader hop, follower k hops to where the
// leader stood k+1 hops ago. Records remember the carrier they were on, so
// followers ride the same log or flatbed the leader did. A follower that gets
// hit is not lost: it runs ahead to wait at the finish line and rejoins there.
import { W, OFF_EDGE } from './lane.js';
import { setFrame } from './characters.js';
import { SWIM_Y } from './scenarios/river.js';
import { sfx } from './sfx.js';
import { lerp, randInt } from './util.js';

const HOP = 0.16;
const CHATTER_GAP = 1.8;   // the whole line calls at most this often, however long it grows

export class Train {
  constructor(scene, world, player, makeYoung, voice = null, fx = null) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.makeYoung = makeYoung;
    this.voice = voice;
    this.fx = fx;
    this.chicks = [];
    this.trail = [];      // most recent leader landing first
    this.waiting = 0;     // followers already at the finish line
    this.waitingMeshes = null;
    this.hatched = 0;     // eggs found this stage
    this.hush = 0;        // seconds until any follower may call again
    player.onLanded = () => this.onLeaderLanded();
  }

  get count() { return this.chicks.length; }
  get total() { return this.chicks.length + this.waiting; }

  occupies(c, r) {
    return this.chicks.some((k) => !k.moving && k.rec && k.rec.row === r && Math.round(this.resolveX(k.rec)) === c);
  }

  // Is some follower on this cell, or still to step on it? trail[i + 1] is
  // follower i's cell and trail[0] the leader's last landing, where the first
  // follower steps next, so with a line the whole way ahead is in the trail.
  bound(c, r) {
    if (this.occupies(c, r)) return true;
    return this.chicks.length > 0 && this.trail.slice(0, this.chicks.length + 1).some((rec) => rec.row === r && !rec.carrier && Math.round(rec.x) === c);
  }

  record() {
    const p = this.player;
    const carrier = p.carrier;
    // y remembers a perch (a fences leader on a fence rail) so the young sit there too.
    return { row: p.row, x: p.x, carrier, offset: carrier ? p.x - carrier.x : 0, rideY: carrier?.rideY ?? 0, y: carrier ? 0 : p.y };
  }

  resolveX(rec) { return rec.carrier ? rec.carrier.x + rec.offset : rec.x; }

  // A new follower joins at the tail: on the cell the line just left when
  // there is one, so it does not have to run the length of the line to its place.
  hatch(quiet = false) {
    const mesh = this.makeYoung();
    this.scene.add(mesh);
    const rec = this.trail[this.chicks.length + 1] ?? this.record();
    mesh.position.set(this.resolveX(rec), rec.rideY, -rec.row);
    this.chicks.push({ mesh, rec, moving: false, t: 0, from: null, facing: this.player.facing, chatter: randInt(6, 18) });
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

  // The whistle: every follower waiting at the finish runs back and rejoins
  // the line here. Returns how many came.
  recall() {
    const n = this.waiting;
    if (!n) return 0;
    if (this.waitingMeshes) { for (const w of this.waitingMeshes) w.mesh.parent?.remove(w.mesh); this.waitingMeshes = null; }
    this.waiting = 0;
    for (let i = 0; i < n; i++) this.hatch(true);
    this.voice?.(1.6);
    return n;
  }

  // The follower standing on a cell, if any.
  chickAt(c, r) {
    return this.chicks.find((k) => k.rec && k.rec.row === r && Math.round(this.resolveX(k.rec)) === c) ?? null;
  }

  // Open water for a swimmer's young means swimming depth; a fence rail the
  // leader perched on holds the young at the same height.
  restY(rec) {
    if (rec.carrier) return rec.carrier.wing ? rec.carrier.y + 0.4 : rec.rideY;
    const lane = this.world.laneAt(rec.row);
    if (lane?.scenario.footing?.(lane, Math.round(rec.x))) return rec.y ?? 0;   // ice or a lily pad holds the young where it held the leader
    return this.player.swims && lane?.scenario.id === 'river' ? SWIM_Y : rec.y ?? 0;
  }

  sendTo(k, target, delay = 0) {
    k.from = { x: this.resolveX(k.rec), z: -k.rec.row, y: this.restY(k.rec) };
    k.paddling = this.player.swims && !k.rec.carrier && !target.carrier
      && this.world.laneAt(k.rec.row)?.scenario.id === 'river' && this.world.laneAt(target.row)?.scenario.id === 'river';
    const dx = this.resolveX(target) - k.from.x, dz = -target.row - k.from.z;
    k.facing = Math.abs(dz) > Math.abs(dx) ? (dz < 0 ? 0 : Math.PI) : (dx < 0 ? Math.PI / 2 : -Math.PI / 2);
    k.rec = target;
    k.moving = true;
    k.t = -delay;
  }

  // Doubling back onto a follower swaps places with it; otherwise the line
  // ripples forward along the trail. trail[i + 1] is always follower i's cell.
  onLeaderLanded() {
    const rec = this.record();
    const prev = this.trail[0];
    const occupant = this.chickAt(Math.round(this.resolveX(rec)), rec.row);
    if (occupant && prev) {
      this.sendTo(occupant, prev);
      this.trail[0] = rec;
      this.trail[this.chicks.indexOf(occupant) + 1] = prev;
      return;
    }
    this.trail.unshift(rec);
    // One spare entry past the tail: the cell the line just left, where a new follower joins.
    if (this.trail.length > this.chicks.length + 2) this.trail.length = this.chicks.length + 2;
    this.chicks.forEach((k, i) => {
      const target = this.trail[i + 1];
      if (!target || target === k.rec) return;
      this.sendTo(k, target, i * 0.06);   // ripple down the line
    });
  }

  // A hit follower scampers off to the finish line.
  lose(k, water = false) {
    if (water) this.fx?.splash(k.mesh.position, 0.6); else sfx.bump();
    this.scene.remove(k.mesh);
    this.chicks = this.chicks.filter((c) => c !== k);
    this.trail = [this.trail[0], ...this.chicks.map((c) => c.rec)];
    this.waiting++;
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

    this.hush -= dt;
    for (const k of [...this.chicks]) {
      // Followers chatter now and then, always pitched above the player; a long line takes turns.
      k.chatter -= dt;
      if (k.chatter < 0) {
        k.chatter = randInt(10, 25);
        if (this.hush <= 0) { this.hush = CHATTER_GAP; this.voice?.(1.5 + Math.random() * 0.4); }
      }
      const tx = this.resolveX(k.rec), tz = -k.rec.row, ty = this.restY(k.rec);
      let sy = 1;
      if (k.moving) {
        k.t += dt / HOP;
        const t = Math.max(0, Math.min(1, k.t));
        const s = k.paddling ? 0 : Math.sin(Math.PI * t);
        k.mesh.position.set(lerp(k.from.x, tx, t), lerp(k.from.y, ty, t) + s * 0.4, lerp(k.from.z, tz, t));
        sy = 1 + 0.2 * s;
        setFrame(k.mesh, !k.paddling && t > 0.2 && t < 0.85 ? 1 : 0);
        if (k.t >= 1) {
          k.moving = false; setFrame(k.mesh, 0);
          const l = this.world.laneAt(k.rec.row);
          l?.scenario.onFollowerLand?.(l, Math.round(this.resolveX(k.rec)));
        }
      } else {
        k.mesh.position.set(tx, ty, tz);
      }
      k.mesh.rotation.y = k.facing;
      k.mesh.scale.set(k.mesh.scale.x, sy * k.mesh.scale.x, k.mesh.scale.x);

      if (k.moving && k.t < 0.5) continue;
      const lane = this.world.laneAt(k.rec.row);
      // A swimmer's young afloat: logs and gator backs pick it up, boats run it down.
      if (this.player.swims && !k.moving && !k.rec.carrier && lane?.scenario.id === 'river' && !lane.scenario.footing(lane, Math.round(k.rec.x))) {
        const m = lane.moverAt(k.mesh.position.x, 0.3);
        if (m && !m.submerged) {
          const x = k.mesh.position.x;
          const on = (span) => { const a = m.x + lane.dir * span[0], b = m.x + lane.dir * span[1]; return x > Math.min(a, b) + 0.1 && x < Math.max(a, b) - 0.1; };
          if ((m.head && on(m.head)) || m.kind === 'boat' || m.kind === 'sub') { this.lose(k, true); continue; }
          if (on(m.bed)) { k.rec = { ...k.rec, carrier: m, offset: x - m.x, rideY: m.rideY ?? 0 }; }
        }
        continue;
      }
      const hit = lane?.scenario.lethalAt?.(lane, k.mesh.position.x);
      if (hit && hit !== 'bounce') this.lose(k);
      else if (Math.abs(k.mesh.position.x) > OFF_EDGE) this.lose(k, lane?.scenario.id === 'river');
      else if (k.rec.carrier?.submerged && !this.player.swims) this.lose(k, true);
    }
  }

  dispose() {
    for (const k of this.chicks) this.scene.remove(k.mesh);
    this.chicks = [];
    this.waitingMeshes = null;
  }
}
