import * as THREE from 'three';
import { makeChicken, setFrame } from './characters.js';
import { makeHalo, makeRedX } from './meshes.js';
import { W, OFF_EDGE } from './lane.js';
import { SWIM_Y } from './scenarios/river.js';
import { DEATHS } from './deaths.js';
import { POWERUPS } from './powerups.js';
import { POSES, pickPose } from './poses.js';
import { sfx, voices } from './sfx.js';
import { lerp, rand, pick } from './util.js';

const HOP = 0.16;             // seconds per hop
const ARC = 0.55;             // height of a hop
const LONG_WINDOW = 0.18;     // a second forward press this soon after a hop makes it a long jump
const LONG_ARC = 0.9;
const PERCH_Y = 0.58;         // where a fences player stands on a fence: the top rail
const LEAF = [0x3a8c3a, 0x45a045, 0x2a6e2a, 0x6bbf3a];
export const BACK_LIMIT = 12; // rows allowed behind the furthest row reached

const HOVER = 0.5;        // seconds hanging in the air after leaving a high wing
const GRAVITY = 14;
const BURST_GAP = 0.32;   // hops closer than this count toward a burst
const BURST_HOPS = 4;     // burst length that earns a call
export const DEATH_FLAP = 0.8; // seconds of frame-flapping before the death pose
const TILT_GRAB = 1.5;    // a crate grabbed while peeking lasts this much longer
const SIZE_TWEEN = 0.4;   // seconds a mushroom or acorn takes to change the player's size, with a boing
const GIANT_ARC = 0.75;   // a giant's two-row hop flies higher
const GIANT_HOP = 1.5;    // and takes this many times as long
// Skids (sky.js `slip`). The last SKID_HOPS hops landing inside SKID_WINDOW
// seconds of game time make a fast run; on a slippery board it slides on.
const SKID_HOPS = 3;
const SKID_WINDOW = 0.9;
const INTRO_ROWS = 4;     // no skid lands here: the start line never slides you into the first band

export class Player {
  constructor(scene, world, character = { make: makeChicken, voice: 'chicken' }, variant) {
    this.scene = scene;
    this.world = world;
    this.variant = variant;
    // Perks, plain fields copied off the roster entry (see characters.js).
    this.swims = !!character.swims && !character.heavy;   // water is just another surface for waterfowl
    this.fences = !!character.fences;     // fence cells are passable: the chicken perches on the rail
    this.bushes = !!character.bushes;     // shrub and hedge cells are passable: the pig pushes through
    this.longJump = !!character.longJump; // a double-tap forward hops two rows
    this.heavy = !!character.heavy;       // never bounces off a bumper, sinks on touching water
    this.mesh = character.make(variant);
    this.voice = voices[character.voice];
    this.powers = new Map();    // active powerups: id -> { left, ctx } (see powerups.js)
    this.powerCtx = null;       // hook: () => extra ctx fields (mode, game, train) for a grant
    scene.add(this.mesh);
    this.reset();
  }

  reset() {
    this.clearPowers();
    POSES[this.deathAnim]?.exit?.(this);
    this.restore?.();
    this.posed = false;
    this.arriving = null;
    this.deathAnim = null;
    if (this.mesh) {
      this.mesh.visible = true;
      this.mesh.scale.set(1, 1, 1);
      this.mesh.rotation.set(0, 0, 0);
    }
    this.squash = 1.7;        // a pancake needs one even on a player that never died
    this.fall = this.fall ?? ['x', -1];   // and getting up needs a direction to get up from
    this.col = 0; this.row = 0;
    this.x = 0; this.z = 0; this.y = 0;
    this.moving = false; this.t = 0;
    this.long = false; this.arc = ARC;
    this.buffered = null;
    this.facing = 0;
    this.alive = true; this.deadBy = null; this.deadFor = 0;
    this.maxRow = 0;
    this.carrier = null;      // mover currently carrying the player (a log, a wing)
    this.carrierOffset = 0;   // where on the carrier the player stands
    this.airborne = null;     // { hover } after hopping off something tall
    this.onLanded = null;     // hook: called after every landing
    this.isOccupied = null;   // hook: (col, row) => true blocks a hop
    this.invincible = false;
    this.frozen = false;
    this.bump = 0;
    this.size = 1; this.sizeFrom = 1; this.sizeGoal = 1; this.sizeT = SIZE_TWEEN;   // mesh scale, tweened (mushroom, acorn)
    this.giant = false;       // mushroom: two-cell hops, crushes movers, too big for a hedge tunnel
    this.tiny = false;        // acorn: under truck beds, through fences, a bounce keeps the buffered hop
    this.stride = 1;
    this.lastHop = -10; this.burst = 0; this.idle = 0;
    this.time = 0;            // game seconds, for the skid window
    this.recent = [];         // the last SKID_HOPS hops: { dir: [dc, dr], t }
    this.skids = 0; this.skidding = false; this.skidDir = null;   // forced hops still to go, and the one in flight
    this.mesh.scale.set(1, 1, 1);
    this.mesh.position.set(0, 0, 0);
    this.mesh.rotation.set(0, 0, 0);
    if (this.halo) { this.mesh.remove(this.halo); this.halo = null; }
    if (this.xMark) { this.scene.remove(this.xMark); this.xMark = null; }
    setFrame(this.mesh, 0);
  }

  // Remove everything this player put in the scene.
  dispose() {
    this.clearPowers();
    POSES[this.deathAnim]?.exit?.(this);
    this.restore();
    if (this.halo) { this.mesh.remove(this.halo); this.halo = null; }
    if (this.xMark) { this.scene.remove(this.xMark); this.xMark = null; }
    this.scene.remove(this.mesh);
  }

  // ---- powerups ----
  ctxFor() { return { player: this, world: this.world, ...(this.powerCtx?.() ?? {}) }; }

  // Grant a powerup for `mul` times its base duration. Instant ones apply and
  // are gone; re-granting an active one tops its time back up.
  grant(id, mul = 1) {
    const spec = POWERUPS[id];
    if (!spec) return false;
    const ctx = this.ctxFor();
    const left = (spec.duration ?? 0) * mul;
    if (!left) { spec.apply?.(ctx); return true; }
    const active = this.powers.get(id);
    if (active) { active.left = Math.max(active.left, left); spec.regrant?.(active.ctx); return true; }
    this.powers.set(id, { left, ctx });
    spec.apply?.(ctx);
    return true;
  }

  hasPower(id) { return this.powers.has(id); }

  // End a power early (a chili out of shots).
  revoke(id) {
    const e = this.powers.get(id);
    if (!e) return;
    this.powers.delete(id);
    POWERUPS[id]?.expire?.(e.ctx);
  }

  // Grow or shrink toward `goal` over SIZE_TWEEN seconds, overshooting on the way.
  setSize(goal) {
    this.sizeFrom = this.size;
    this.sizeGoal = goal;
    this.sizeT = 0;
  }

  // Opening a crate: the peek pays off in duration.
  takePower(id) {
    const tilted = !!this.ctxFor().mode?.tilted;
    this.grant(id, tilted ? TILT_GRAB : 1);
    sfx.power();
    this.fx?.sparkles(new THREE.Vector3(this.x, this.y, this.z), 10);
  }

  tickPowers(dt) {
    for (const [id, e] of this.powers) {
      const spec = POWERUPS[id];
      e.left -= dt;
      if (e.left <= 0) { this.powers.delete(id); spec.expire?.(e.ctx); continue; }
      spec.update?.(e.ctx, dt);
    }
  }

  clearPowers() {
    if (!this.powers?.size) return;
    const had = [...this.powers];
    this.powers.clear();
    for (const [id, e] of had) POWERUPS[id]?.expire?.(e.ctx);
  }

  // Under a star (or as a giant) the thing that would have killed you blows up
  // instead. Water and being carried off the edge still count: there is nothing to blow up.
  starSave(cause) {
    if (cause === 'water' || Math.abs(this.x) > W + 0.5) return false;
    const lane = this.world.laneAt(this.moving && this.t > 0.5 ? this.trow : this.row);
    const m = lane?.moverAt(this.x, 0.6);
    if (m) { lane.wreck(m, 1.3); if (this.carrier === m) this.carrier = null; }
    return true;
  }

  // Which kinds of static block this player walks through.
  passes(kind) {
    return (kind === 'fence' && (this.fences || this.tiny)) || (kind === 'bush' && this.bushes);
  }

  // Whether a hop may land on (tc, tr) from this player's row.
  canHop(tc, tr) {
    return Math.abs(tc) <= W && tr >= 0 && tr >= this.maxRow - BACK_LIMIT && !!this.world.laneAt(tr) && !this.world.isBlocked(tc, tr, this.row, this) && !this.isOccupied?.(tc, tr);
  }

  // Ground height on arrival at a cell: a fence rail for a fences player,
  // swimming depth for a swimmer bound for open water, otherwise the ground.
  restY(c, r) {
    const lane = this.world.laneAt(r);
    if (this.fences && lane.blockKind(c) === 'fence') return PERCH_Y;
    if (this.swims && lane?.scenario.id === 'river') return SWIM_Y;
    return 0;
  }

  hop(dc, dr) {
    if (!this.alive || this.frozen) return;
    if (this.moving) {
      if (this.bouncing && !this.tiny) return;   // a bounce swallows queued input; a tiny player keeps it
      if (this.longJump && this.extend(dc, dr)) return;
      this.buffered = [dc, dr];
      return;
    }
    this.facing = dr > 0 ? 0 : dr < 0 ? Math.PI : dc < 0 ? Math.PI / 2 : -Math.PI / 2;
    // A giant strides two cells; where the far cell is off the board or blocked, one.
    this.stride = this.giant && !this.skidding && this.canHop(Math.round(this.x) + dc * 2, this.row + dr * 2) ? 2 : 1;
    const tc = Math.round(this.x) + dc * this.stride;
    const tr = this.row + dr * this.stride;
    if (!this.canHop(tc, tr)) {
      this.bump = 0.12;
      sfx.bump();
      return;
    }
    if (!this.skidding) { this.recent.push({ dir: [dc, dr], t: this.time }); if (this.recent.length > SKID_HOPS) this.recent.shift(); }
    this.from = { x: this.x, z: this.z, y: this.y };
    // A hop that starts on a carrier moves with it (a sideways hop along a deck
    // lands on the deck, not where the deck used to be).
    this.hopCarrier = dr === 0 && this.carrier ? this.carrier : null;
    this.hopCarrierX = this.hopCarrier?.x ?? 0;
    this.hopDir = [dc, dr];
    // Water to water for a swimmer is a paddle, not a flap; a skid glides the same way.
    this.paddling = this.skidding || (this.swims && !this.carrier && this.world.laneAt(this.row)?.scenario.id === 'river' && this.world.laneAt(tr)?.scenario.id === 'river');
    // Leaving something tall: the hop keeps its altitude, then comes the drop.
    // A swimmer bound for open water settles at swimming depth.
    const high = this.y > 0.6;
    this.to = { x: tc, z: -tr, y: high ? this.y : this.restY(tc, tr) };
    this.airborne = high ? { hover: HOVER, vy: 0 } : null;
    this.tcol = tc; this.trow = tr;
    this.moving = true; this.t = 0;
    this.long = false; this.arc = this.stride > 1 ? GIANT_ARC : ARC;
    this.carrier = null;
    if (this.skidding) { sfx.skid(); return; }
    sfx.hop();
    this.call();
  }

  // A fast run on a slippery board slides on after the last hop lands: one
  // forced hop per slip, one cell at a time, so every landing check runs.
  // Called on every landing; true when a forced hop went out.
  skid(bounced) {
    if (this.skids > 0) return this.slide();
    this.skidding = false;
    const slip = Math.max(0, (this.world.config.sky?.slip ?? 0) - (this.heavy ? 1 : 0));
    if (!slip || bounced || this.carrier || this.sizeT < SIZE_TWEEN || this.row < INTRO_ROWS || this.recent.length < SKID_HOPS) return false;
    const r = this.recent;
    if (r[r.length - 1].t - r[0].t > SKID_WINDOW) return false;
    const dc = Math.sign(r.reduce((a, h) => a + h.dir[0], 0)), dr = Math.sign(r.reduce((a, h) => a + h.dir[1], 0));
    this.recent = [];
    if (!dc && !dr) return false;
    this.skidDir = [dc, dr];
    this.skids = slip;
    return this.slide();
  }

  // One forced cell of a skid. A refused hop bumps and the skid is over.
  slide() {
    this.skids--;
    this.skidding = true;
    this.hop(...this.skidDir);
    if (!this.moving) { this.skids = 0; this.skidding = false; return false; }
    this.fx?.spray(new THREE.Vector3(this.x, 0, this.z), this.world.config.sky?.snow ? [0xffffff, 0xe8f0f6] : [0xbfe6ff, 0xffffff]);
    return true;
  }

  // A second forward press inside LONG_WINDOW of a forward hop stretches it
  // one row further. The row in between is never landed on: a long jump clears
  // a one-row hazard. The hop keeps its place and height as it stretches, then
  // finishes over twice the distance in twice the time.
  extend(dc, dr) {
    if (dr !== 1 || dc !== 0 || this.long || this.hopDir?.[0] !== 0 || this.hopDir?.[1] !== 1) return false;
    if (this.hopCarrier || this.airborne || this.paddling || this.t >= 1) return false;
    if (performance.now() / 1000 - this.lastHop > LONG_WINDOW) return false;
    const tc = this.tcol, tr = this.trow + 1;
    if (!this.world.laneAt(tr) || this.world.isBlocked(tc, tr, this.trow, this) || this.isOccupied?.(tc, tr)) return false;
    const t = this.t;
    this.arc = Math.max(0.35, Math.min(LONG_ARC, 2 * ARC * Math.cos((Math.PI * t) / 2)));
    this.t = t / 2;
    this.long = true;
    this.trow = tr;
    this.to = { ...this.to, z: -tr, y: this.restY(tc, tr) };
    sfx.hop();
    return true;
  }

  // Turn a quarter without moving; the flag goes where you face.
  turn(dir) {
    if (!this.alive || this.moving) return;
    this.facing += dir * (Math.PI / 2);
    sfx.tick();
  }

  // The cell one step ahead in the facing direction.
  ahead() {
    const a = Math.round(this.facing / (Math.PI / 2)) & 3;   // 0 fwd, 1 left, 2 back, 3 right
    const d = [[0, 1], [-1, 0], [0, -1], [1, 0]][a];
    return [Math.round(this.x) + d[0], this.row + d[1]];
  }

  mount(m) {
    this.carrier = m;
    this.carrierOffset = this.x - m.x;
  }

  // A run of quick hops earns a call from the character.
  call() {
    const now = performance.now() / 1000;
    this.burst = now - this.lastHop < BURST_GAP ? this.burst + 1 : 1;
    this.lastHop = now;
    this.idle = 0;
    if (this.burst >= BURST_HOPS && Math.random() < 0.6) { this.burst = 0; this.voice?.(); }
  }

  // Shoved one cell back by a bumper. Nowhere to go means a splat after all.
  // A rider bumping into the cab goes back to the deck cell it came from.
  bounce(lane) {
    const fromDeck = this.moving && this.hopCarrier;
    const col = fromDeck ? Math.round(this.from.x) : Math.round(this.x) - lane.dir;
    const row = this.moving ? this.trow : this.row;
    if (Math.abs(col) > W || this.world.isBlocked(col, row, row, this) || this.isOccupied?.(col, row)) { this.die(lane.scenario.id === 'rail' || lane.scenario.id === 'freight' ? 'train' : lane.scenario.id === 'runway' ? 'plane' : 'car'); return; }
    this.row = row; this.col = col;
    this.from = { x: this.x, z: this.z, y: this.y };
    this.to = { x: col, z: -row };
    this.tcol = col; this.trow = row;
    this.moving = true; this.t = 0;
    this.long = false; this.arc = ARC;
    this.carrier = null;
    this.facing = lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.bounces = (this.bounces ?? 0) + 1;
    this.bouncing = true;        // no second hit until this hop lands
    if (!this.tiny) this.buffered = null;   // and no automatic retry into the same bumper; a tiny player keeps its hop
    sfx.bump();
  }

  gotCoin() {
    sfx.coin();
    this.onCoin?.();
  }

  die(cause) {
    if (!this.alive || this.invincible) return;
    if ((this.hasPower('star') || this.giant) && this.starSave(cause)) return;
    this.clearPowers();
    this.alive = false;
    this.skids = 0; this.skidding = false;
    this.deadBy = cause;
    this.deadFor = 0;
    this.moving = false;
    const spec = DEATHS[cause];
    this.deathAnim = pickPose(spec?.anim ?? 'flat');
    this.squash = spec?.squash ?? 1.6;    // how far a pancake is drawn out along the lane
    this.fall = [['x', -1], ['x', 1], ['z', 1], ['z', -1]][Math.floor(Math.random() * 4)];   // back, face, left, right
    // Impact first, the character's own cry a beat later, then the pose's own
    // punchline — a halo chime, a clatter of blocks, a hole swallowing them.
    if (spec?.sfx) sfx[spec.sfx]?.();
    setTimeout(() => this.voice?.(0.85), 160);
    const cue = POSES[this.deathAnim]?.cue;
    if (cue) setTimeout(() => sfx[cue[0]]?.(), cue[1]);
    this.onDie?.(cause);
  }

  land() {
    const bounced = this.bouncing;
    this.bouncing = false;
    const lane = this.world.laneAt(this.row);
    if (!lane) return;
    // A wing over this cell catches you before whatever is below can.
    const wing = this.world.wingAt(this.x, this.row);
    if (wing) { this.mount(wing); this.onLanded?.(); this.onLandedHint?.(); return; }
    let cause = lane.scenario.onLand?.(lane, this);
    // A giant coming down on a river crushes the boat or the gator, then meets the water.
    if (cause && cause !== 'water' && this.giant && lane.scenario.id === 'river') { this.starSave(cause); cause = this.swims ? null : 'water'; }
    if (cause === 'bounce') {
      if (!this.heavy) { this.moving = true; this.t = 1; this.bounce(lane); return; }
      // Heavy: past the end of a log is open water; a bumper on land pulls away.
      cause = lane.scenario.id === 'river' ? 'water' : null;
    }
    if (cause) { this.die(cause); return; }
    if (this.carrier) this.carrierOffset = this.x - this.carrier.x;
    if (this.bushes && lane.blockKind(this.col) === 'bush') this.rustle();
    if (lane.takeCoin(this.col)) this.gotCoin();
    const power = lane.takeCrate(this.col);
    if (power) this.takePower(power);
    if (this.carrier && Math.abs(this.x - this.carrier.x) < 0.6 && lane.takeMoverCoin(this.carrier)) this.gotCoin();
    if (this.row > this.maxRow) this.maxRow = this.row;
    this.onLanded?.();
    this.onLandedHint?.();
    if (lane.takeEgg(this.col)) this.onEgg?.();
    if (this.skid(bounced)) return;
    if (this.buffered) { const b = this.buffered; this.buffered = null; this.hop(...b); }
  }

  // Leaves shaken loose by pushing through a bush.
  rustle() {
    if (this.fx) {
      const at = new THREE.Vector3(this.x, this.y, this.z);
      for (let i = 0; i < 6; i++) this.fx.puff(at, pick(...LEAF), rand(0.08, 0.16), rand(0.4, 0.7), new THREE.Vector3(rand(-1.2, 1.2), rand(1, 2.5), rand(-1.2, 1.2)), -1);
    }
    sfx.puff();
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
    const pose = POSES[this.deathAnim];
    if (!this.posed) { this.posed = true; pose?.enter?.(this); }
    pose?.update?.(this, t);
  }

  // Materials are shared by colour across the whole scene, so anything that
  // fades or greys this one works on its own copies and hands them back.
  own() {
    this.mesh.traverse((o) => {
      if (!o.isMesh || o.userData.mat0) return;
      o.userData.mat0 = o.material;
      o.userData.col0 = o.material.color.clone();
      o.material = o.material.clone();
      o.material.transparent = true;
    });
  }

  restore() {
    this.mesh.traverse((o) => {
      if (!o.isMesh || !o.userData.mat0) return;
      o.material.dispose();
      o.material = o.userData.mat0;
      o.userData.mat0 = null;
    });
  }

  // Come back the way you went out, played backwards — a pancake rehydrates,
  // a beam rematerialises. Purely a picture: you can move the moment you land
  // and the animation just catches up with you.
  arrive(pose) {
    const spec = POSES[pose];
    if (!spec?.spawn) { this.arriving = null; return; }
    this.arriving = { spec, t: 0 };
    if (spec.spawnSfx) setTimeout(() => sfx[spec.spawnSfx[0]]?.(), spec.spawnSfx[1]);
  }

  update(dt) {
    if (!this.alive) { this.updateDead(dt); return; }
    this.tickPowers(dt);
    const m = this.mesh;
    let sx = 1, sy = 1;
    this.idle += dt;
    this.time += dt;
    if (this.idle > 9 && Math.random() < dt * 0.15) { this.idle = 0; this.voice?.(); }

    if (this.sizeT < SIZE_TWEEN) {
      this.sizeT = Math.min(SIZE_TWEEN, this.sizeT + dt);
      const k = this.sizeT / SIZE_TWEEN;
      this.size = lerp(this.sizeFrom, this.sizeGoal, 1 - Math.cos(k * Math.PI * 1.5) * (1 - k));   // lands early, overshoots, settles
    }

    if (this.moving) {
      this.t += dt / (this.long ? 2 * HOP : this.stride > 1 ? GIANT_HOP * HOP : HOP);
      const t = Math.min(1, this.t);
      if (this.hopCarrier) {
        const dx = this.hopCarrier.x - this.hopCarrierX;
        this.from.x += dx; this.to.x += dx; this.hopCarrierX = this.hopCarrier.x;
      }
      this.x = lerp(this.from.x, this.to.x, t);
      this.z = lerp(this.from.z, this.to.z, t);
      const s = this.paddling ? 0 : Math.sin(Math.PI * t);   // paddling glides flat
      this.y = lerp(this.from.y, this.to.y ?? 0, t) + s * this.arc;
      sy = 1 + 0.25 * s; sx = 1 - 0.12 * s;
      setFrame(m, !this.paddling && t > 0.2 && t < 0.85 ? 1 : 0);
      if (this.t >= 1) {
        this.moving = false;
        this.x = this.to.x; this.z = this.to.z; this.y = this.to.y ?? 0;
        this.col = this.tcol; this.row = this.trow;
        if (!this.airborne) this.land();
      }
    } else if (this.airborne) {
      // Hang for a beat, notice, then drop; landing checks run on touchdown.
      const a = this.airborne;
      if (a.hover > 0) {
        a.hover -= dt;
        setFrame(m, Math.floor(a.hover / 0.08) % 2);     // frantic flapping, to no effect
        if (a.hover <= 0) { sfx.fall(); setFrame(m, 1); }
      } else { a.vy += GRAVITY * dt; this.y -= a.vy * dt; }
      if (this.y <= 0) { this.y = 0; this.airborne = null; setFrame(m, 0); sfx.boom(0.45); this.land(); }
    } else {
      if (this.carrier) {
        this.x = this.carrier.x + this.carrierOffset;
        this.col = Math.round(this.x);
        this.y = this.carrier.wing ? this.carrier.y + 0.4 : (this.carrier.rideY ?? 0) + Math.min(0, this.carrier.mesh.position.y);
        if (this.carrier.submerged) { if (this.swims) { this.carrier = null; this.y = SWIM_Y; } else { this.die('water'); return; } }
        if (Math.abs(this.x) > OFF_EDGE) { this.die(this.carrier.offCause ?? 'water'); return; }
      }
      if (this.bump > 0) { this.bump -= dt; const k = this.bump / 0.12; sy = 1 - 0.3 * k; sx = 1 + 0.2 * k; }
      // A swimmer afloat sits low, paddles rather than flaps, and takes whatever drifts onto it.
      const here = this.world.laneAt(this.row);
      if (!this.carrier && this.swims && here?.scenario.id === 'river') {
        this.y = SWIM_Y;
        setFrame(m, 0);
        const cause = here.scenario.swimContact?.(here, this);
        if (cause) { this.die(cause); return; }
      }
    }

    // Hazard check against whichever row the chicken is mostly in. Nothing
    // can reach you on a wing or in the air.
    if (!this.carrier?.wing && !this.airborne && !(this.moving && this.bouncing)) {
      const checkRow = this.moving && this.t > 0.5 ? this.trow : this.row;
      const lane = this.world.laneAt(checkRow);
      let cause = lane?.scenario.lethalAt?.(lane, this.x, this);
      if (cause && cause !== 'bounce' && this.tiny && lane.moverAt(this.x, 0.35)?.tall) cause = null;   // an acorn slips under a truck
      if (cause === 'bounce') { if (!this.heavy && !this.hasPower('star') && !this.giant) this.bounce(lane); }   // heavy: the bumper pulls away; a star or a giant shrugs it off
      else if (cause) this.die(cause);
    }

    m.position.set(this.x, this.y, this.z);
    m.rotation.y = this.facing;
    m.scale.set(sx * this.size, sy * this.size, sx * this.size);

    if (this.arriving) {
      const a = this.arriving;
      const done = a.spec.spawn(this, a.t);
      a.t += dt;
      if (done) { this.arriving = null; m.scale.set(1, 1, 1); }
    }
  }
}
