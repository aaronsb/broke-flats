import { makeChicken, setFrame } from './characters.js';
import { makeHalo } from './meshes.js';
import { W, OFF_EDGE } from './lane.js';
import { DEATHS } from './deaths.js';
import { sfx, voices } from './sfx.js';
import { lerp } from './util.js';

const HOP = 0.16;             // seconds per hop
export const BACK_LIMIT = 12; // rows allowed behind the furthest row reached

const BURST_GAP = 0.32;   // hops closer than this count toward a burst
const BURST_HOPS = 4;     // burst length that earns a call
export const DEATH_FLAP = 0.8; // seconds of frame-flapping before the death pose

export class Player {
  constructor(scene, world, character = { make: makeChicken, voice: 'chicken' }, variant) {
    this.world = world;
    this.variant = variant;
    this.mesh = character.make(variant);
    this.voice = voices[character.voice];
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
    this.maxRow = 0;
    this.carrier = null;      // mover currently carrying the player (a log, say)
    this.onLanded = null;     // hook: called after every landing
    this.isOccupied = null;   // hook: (col, row) => true blocks a hop
    this.invincible = false;
    this.bump = 0;
    this.lastHop = -10; this.burst = 0; this.idle = 0;
    this.mesh.scale.set(1, 1, 1);
    this.mesh.position.set(0, 0, 0);
    this.mesh.rotation.set(0, 0, 0);
    if (this.halo) { this.mesh.remove(this.halo); this.halo = null; }
    setFrame(this.mesh, 0);
  }

  hop(dc, dr) {
    if (!this.alive) return;
    if (this.moving) { this.buffered = [dc, dr]; return; }
    this.facing = dr > 0 ? 0 : dr < 0 ? Math.PI : dc < 0 ? Math.PI / 2 : -Math.PI / 2;
    const tc = Math.round(this.x) + dc;
    const tr = this.row + dr;
    if (Math.abs(tc) > W || tr < 0 || tr < this.maxRow - BACK_LIMIT || !this.world.laneAt(tr) || this.world.isBlocked(tc, tr) || this.isOccupied?.(tc, tr)) {
      this.bump = 0.12;
      sfx.bump();
      return;
    }
    this.from = { x: this.x, z: this.z, y: this.y };
    this.to = { x: tc, z: -tr };
    this.tcol = tc; this.trow = tr;
    this.moving = true; this.t = 0;
    this.carrier = null;
    sfx.hop();
    this.call();
  }

  // A run of quick hops earns a call from the character.
  call() {
    const now = performance.now() / 1000;
    this.burst = now - this.lastHop < BURST_GAP ? this.burst + 1 : 1;
    this.lastHop = now;
    this.idle = 0;
    if (this.burst >= BURST_HOPS && Math.random() < 0.6) { this.burst = 0; this.voice?.(); }
  }

  gotCoin() {
    sfx.coin();
    this.onCoin?.();
  }

  die(cause) {
    if (!this.alive || this.invincible) return;
    this.alive = false;
    this.deadBy = cause;
    this.deadFor = 0;
    this.moving = false;
    const spec = DEATHS[cause];
    // Sometimes the 80s way out: a stepped spin and a halo instead of the usual pose.
    this.deathAnim = Math.random() < 0.35 ? 'halo' : (spec?.anim ?? 'squash');
    if (this.deathAnim === 'halo') sfx.halo(); else if (spec?.sfx) sfx[spec.sfx]?.();
    this.voice?.(0.85);
    this.onDie?.(cause);
  }

  land() {
    const lane = this.world.laneAt(this.row);
    if (!lane) return;
    const cause = lane.scenario.onLand?.(lane, this);
    if (cause) { this.die(cause); return; }
    if (lane.takeCoin(this.col)) this.gotCoin();
    if (this.carrier && Math.abs(this.x - this.carrier.x) < 0.6 && lane.takeMoverCoin(this.carrier)) this.gotCoin();
    if (this.row > this.maxRow) this.maxRow = this.row;
    this.onLanded?.();
    if (lane.takeEgg(this.col)) this.onEgg?.();
    if (this.buffered) { const b = this.buffered; this.buffered = null; this.hop(...b); }
  }

  // Flap between the two frames for a moment, then play the death pose.
  updateDead(dt) {
    const m = this.mesh;
    this.deadFor += dt;
    if (this.deadFor < DEATH_FLAP) {
      setFrame(m, Math.floor(this.deadFor / 0.1) % 2);
      m.position.y = this.y + Math.abs(Math.sin(this.deadFor * 30)) * 0.15;
      return;
    }
    setFrame(m, 0);
    const t = this.deadFor - DEATH_FLAP;
    const anim = this.deathAnim;
    if (anim === 'halo') {
      // Quarter-turn steps, a slow rise, and a halo that climbs above the head.
      m.rotation.y = this.facing + Math.floor(t / 0.16) * (Math.PI / 2);
      m.position.y = this.y + t * 0.5;
      if (!this.halo) { this.halo = makeHalo(); m.add(this.halo); }
      this.halo.position.y = 1.35 + Math.min(0.6, t * 0.8);
      this.halo.rotation.y = t * 2;
    } else if (anim === 'squash') {
      const k = Math.min(1, t / 0.12);
      m.position.y = this.y;
      m.scale.set(1 + 0.5 * k, 1 - 0.88 * k, 1 + 0.5 * k);
    } else if (anim === 'sink') {
      m.position.y = -Math.min(1.2, t * 2.5);
      m.rotation.z = t * 3;
    } else if (anim === 'launch') {
      m.position.y = t * 12 - t * t * 9;
      m.rotation.x = t * 8;
    }
  }

  update(dt) {
    if (!this.alive) { this.updateDead(dt); return; }
    const m = this.mesh;
    let sx = 1, sy = 1;
    this.idle += dt;
    if (this.idle > 9 && Math.random() < dt * 0.15) { this.idle = 0; this.voice?.(); }

    if (this.moving) {
      this.t += dt / HOP;
      const t = Math.min(1, this.t);
      this.x = lerp(this.from.x, this.to.x, t);
      this.z = lerp(this.from.z, this.to.z, t);
      const s = Math.sin(Math.PI * t);
      this.y = lerp(this.from.y, 0, t) + s * 0.55;
      sy = 1 + 0.25 * s; sx = 1 - 0.12 * s;
      setFrame(m, t > 0.2 && t < 0.85 ? 1 : 0);
      if (this.t >= 1) {
        this.moving = false;
        this.x = this.to.x; this.z = this.to.z; this.y = 0;
        this.col = this.tcol; this.row = this.trow;
        this.land();
      }
    } else {
      const lane = this.world.laneAt(this.row);
      if (this.carrier && lane) {
        this.x += lane.dir * lane.speed * dt;
        this.col = Math.round(this.x);
        this.y = (this.carrier.rideY ?? 0) + Math.min(0, this.carrier.mesh.position.y);
        if (this.carrier.submerged) { this.die('water'); return; }
        if (Math.abs(this.x) > OFF_EDGE) { this.die(this.carrier.offCause ?? 'water'); return; }
      }
      if (this.bump > 0) { this.bump -= dt; const k = this.bump / 0.12; sy = 1 - 0.3 * k; sx = 1 + 0.2 * k; }
    }

    // Hazard check against whichever row the chicken is mostly in.
    const checkRow = this.moving && this.t > 0.5 ? this.trow : this.row;
    const lane = this.world.laneAt(checkRow);
    const cause = lane?.scenario.lethalAt?.(lane, this.x);
    if (cause) this.die(cause);

    m.position.set(this.x, this.y, this.z);
    m.rotation.y = this.facing;
    m.scale.set(sx, sy, sx);
  }
}
