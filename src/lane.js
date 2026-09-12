import * as THREE from 'three';
import { makeGround, makeCoin, makeEgg, makeFlagMarker, setBrake } from './meshes.js';
import { rand } from './util.js';
import { sfx } from './sfx.js';

export const W = 8;          // playable columns run -W..W
export const VIEW = W + 5;   // about what a top-down window shows either side: "just off screen"
// Movers wrap at ±SPAN. It has to sit outside the widest view or the wrap is a
// vehicle popping into existence in front of you: top-down reaches 10.5 units,
// but the tilted peek reaches 31.4, so the old ±VIEW wrap was 18 units inside
// the edge of the tilted screen.
export const SPAN = 35;
const RING = SPAN / VIEW;    // the ring grew by this much, so counts scale with it to hold the density
export const OFF_EDGE = 11.6; // carried this far is off screen and lost
export const GW = 120;       // ground width: far past any camera edge, even tilted
export const VERGE_W = 1.1;  // width of the darker strip marking the edge of play
export const DETAIL_W = 60;  // repeated details (dashes, stripes, sleepers) only span this
const EASE = 2.5;            // v per second: how a staller slows and how anything pulls away
// Halting lanes (roads) brake for a procession. A vehicle sights a blocker
// HALT_PAD + speed·HALT_LOOK ahead of its bumper and eases to 0 at
// EASE·(1 + HALT_GAIN·(followers − 1)): one follower brakes like a staller and
// its stop ends right at HALT_PAD (HALT_LOOK is 1/EASE); more brake harder.
const HALT_PAD = 1.2;
const HALT_GAIN = 0.6;
const HALT_LOOK = 1 / EASE;
// Following. A driver notices the vehicle ahead slowing (v under BRAKE_SEEN)
// only after REACT seconds, holding speed until then: a gentle staller gives
// the queue time, a hard halt does not, and a close queue rear-ends it. Once
// reacting, the follower eases to the pace ahead at FOLLOW_BRAKE, scaled down
// by how far inside gapMin it sits so a queue opens back out as it moves.
const REACT = 0.4;
const BRAKE_SEEN = 0.9;
const FOLLOW_BRAKE = 4;
const HONK_V = 1.2;          // a honked vehicle pulls away at this speed and eases back to 1
const HONK_WAIT = [4, 12];   // seconds a honked staller keeps going before its next stop
const TOUCH = 0.05;          // bumpers this close have met
const CRASH_DV = 0.15;       // meeting while this much faster than the vehicle ahead is a crash

// One board row. Scenarios fill it through these helpers; the board and the
// player only read the fields (blocked, coins, movers, dir, speed).
export class Lane {
  constructor(r, scenario, world = null) {
    this.r = r;
    this.scenario = scenario;
    this.world = world;
    this.scenery = world?.config?.scenery ?? null;
    this.group = new THREE.Group();
    this.group.position.z = -r;
    this.blocked = new Set();
    this.kinds = new Map();      // block kind per cell: 'solid', 'fence', 'bush'; a perk may pass one
    this.coins = new Map();
    this.eggs = new Map();
    this.flags = new Map();      // player-planted markers, any row
    this.movers = [];
    this.dir = 0;
    this.speed = 0;
    this.halts = false;      // traffic brakes for a procession (roads)
    this.blockers = null;    // [{ x, n }] cells held by a player and followers, refreshed per frame
    this.data = {};          // scenario-private state
  }

  add(mesh, x) {
    if (x !== undefined) mesh.position.x = x;
    this.group.add(mesh);
    return mesh;
  }

  ground(color, top = 0, thick = 0.5) {
    this.add(makeGround(GW, color, top, thick));
    this.verge(color, top);
  }

  // The play area ends at ±W and, on a road or a river, nothing said so: you
  // walked over open ground into an invisible fence. A darker verge just
  // outside the last column marks it on every row — including the ones where
  // traffic runs through those columns and a fence post could not stand.
  verge(color, top) {
    if (typeof color !== 'number') return;
    // Contrast against whatever it lies on rather than simply darker: a darker
    // strip is invisible on a night road, and a lighter one is invisible on
    // grass. Dark ground gets a pale verge, bright ground a deep one.
    const c = new THREE.Color(color);
    const lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
    const shade = (lum > 0.3 ? c.multiplyScalar(0.55) : c.lerp(new THREE.Color(0xffffff), 0.42)).getHex();
    for (const s of [-1, 1]) this.add(makeGround(VERGE_W, shade, top + 0.012, 0.02), s * (W + 0.5 + VERGE_W / 2));
  }

  block(c, kind = 'solid') { this.blocked.add(c); this.kinds.set(c, kind); }
  blockKind(c) { return this.blocked.has(c) ? this.kinds.get(c) ?? 'solid' : null; }

  // Fill outside the playable strip with the level's scenery.
  edges() { this.scenery.edge(this, this.world); }

  // Ground in the scenery's style (grass, pavement, asphalt).
  terrain() { this.scenery.ground(this); }

  coin(c) { this.coins.set(c, this.add(makeCoin(), c)); }

  egg(c) {
    this.eggs.set(c, this.add(makeEgg(), c));
    if (this.world) this.world.data.eggsPlaced = (this.world.data.eggsPlaced ?? 0) + 1;
  }

  // A coin or egg left lying in the row, untouched by whatever crosses it.
  bonusDrop(chance = 0.5, eggShare = 0.35) {
    if (Math.random() > chance) return;
    const c = Math.round(rand(-W + 1, W - 1));
    if (Math.random() < eggShare) this.egg(c); else this.coin(c);
  }

  toggleFlag(c) {
    const f = this.flags.get(c);
    if (f) { this.group.remove(f); this.flags.delete(c); return false; }
    this.flags.set(c, this.add(makeFlagMarker(), c));
    return true;
  }

  takeEgg(c) {
    const egg = this.eggs.get(c);
    if (!egg) return false;
    this.group.remove(egg);
    this.eggs.delete(c);
    return true;
  }

  takeCoin(c) {
    const coin = this.coins.get(c);
    if (!coin) return false;
    this.group.remove(coin);
    this.coins.delete(c);
    return true;
  }

  // Spread n movers along the wrap span so they never overlap.
  // make() returns { mesh, len }; extra fields are kept on the mover.
  spawnMovers(n, make, gap = 0.5) {
    n = Math.max(1, Math.round(n * RING));   // n is per visible span; the ring holds more
    const slot = (2 * SPAN) / n;
    for (let i = 0; i < n; i++) {
      const m = make(i);
      m.x = -SPAN + i * slot + rand(gap, slot - m.len - gap);
      m.v = 1;
      if (this.dir < 0) m.mesh.rotation.y = Math.PI;
      this.add(m.mesh, m.x);
      this.movers.push(m);
    }
    return this.movers;
  }

  // Place movers nose to tail with random gaps of gapMin..gapMin+gapVar,
  // dropping any that would not fit around the wrap. Stallers (per `stall`
  // chance) ease to a halt now and then and pull away again.
  spawnSpaced(n, make, { gapMin, gapVar, stall = 0, reckless = 0 }) {
    n = Math.max(1, Math.round(n * RING));   // n is per visible span; the ring holds more
    let x = -SPAN + rand(0, gapVar);
    for (let i = 0; i < n; i++) {
      const m = make(i);
      x += m.len / 2;
      if (x + m.len / 2 > SPAN - gapMin) break;
      m.x = x; m.v = 1;
      if (Math.random() < stall) m.staller = { phase: 'go', wait: rand(2, 7) };
      else if (Math.random() < (reckless ?? 0)) m.reckless = true;   // never brakes: will rear-end a staller
      if (this.dir < 0) m.mesh.rotation.y = Math.PI;
      this.add(m.mesh, m.x);
      this.movers.push(m);
      x += m.len / 2 + gapMin + rand(0, gapVar);
    }
    this.gapMin = gapMin;
    return this.movers;
  }

  moverCoin(m) { m.coin = makeCoin(); m.mesh.add(m.coin); }

  takeMoverCoin(m) {
    if (!m.coin) return false;
    m.mesh.remove(m.coin);
    m.coin = null;
    return true;
  }

  // True when x sits on one of a mover's rideable spans (local, heading-aware),
  // with a little slack past each end so an edge landing still counts.
  onBed(m, x, slack = 0.25) {
    const spans = m.beds ?? (m.bed ? [m.bed] : []);
    for (const sp of spans) {
      const a = m.x + this.dir * sp[0], b = m.x + this.dir * sp[1];
      if (x > Math.min(a, b) - slack && x < Math.max(a, b) + slack) return true;
    }
    return false;
  }

  // True when x is at a mover's rear bumper and the mover is pulling away.
  rearOf(m, x, pad = 0.5) {
    const rear = m.x - this.dir * m.len / 2;
    return Math.abs(x - rear) < pad && (m.x - x) * this.dir > 0;
  }

  // True when the player is riding (or just hopped along) this very mover.
  riding(m, player) { return !!player && (player.carrier === m || player.hopCarrier === m); }

  moverAt(x, pad) {
    for (const m of this.movers) if (Math.abs(x - m.x) < m.len / 2 + pad) return m;
    return null;
  }

  // Strength of the nearest blocker in this mover's look-ahead, 0 for none.
  blockerAhead(m) {
    if (!this.blockers?.length) return 0;
    const front = m.x + this.dir * m.len / 2;
    const look = HALT_PAD + this.speed * HALT_LOOK;
    let n = 0;
    for (const b of this.blockers) {
      const d = (b.x - front) * this.dir;
      if (d > -0.3 && d < look) n = Math.max(n, b.n);
    }
    return n;
  }

  // A goose honks at x: every stalled or braking vehicle whose nearer bumper
  // is within `radius` pulls away. A vehicle halted for a blocker still ahead
  // stays put: the honk clears stallers, it does not override the flock halt.
  // Returns the vehicles it moved on.
  honk(x, radius, fx = null) {
    let n = 0;
    for (const m of this.movers) {
      if (m.wrecked) continue;
      const stalled = m.staller?.phase === 'stop' || (m.braking ?? 0) > 0 || (m.v ?? 1) < BRAKE_SEEN;
      if (!stalled || Math.abs(m.x - x) - m.len / 2 > radius || this.blockerAhead(m)) continue;
      if (m.staller) { m.staller.phase = 'go'; m.staller.wait = rand(...HONK_WAIT); }
      m.braking = 0;
      m.v = HONK_V;
      n++;
      if (fx) {
        const at = new THREE.Vector3(m.x - this.dir * m.len / 2, 0.2, -this.r);
        for (let i = 0; i < 3; i++) fx.puff(at, 0x9a9a9a, rand(0.12, 0.2), rand(0.5, 0.9), new THREE.Vector3(-this.dir * rand(0.5, 1.5), rand(0.8, 1.6), rand(-0.3, 0.3)), 1.6);
      }
    }
    return n;
  }

  advance(dt) {
    // Stallers: go -> slowing -> stopped -> go, each phase eased.
    for (const m of this.movers) {
      if (!m.staller) continue;
      const st = m.staller;
      st.wait -= dt;
      if (st.wait <= 0) {
        st.phase = st.phase === 'go' ? 'stop' : 'go';
        st.wait = st.phase === 'stop' ? rand(1, 3) : rand(4, 12);
      }
      if (!this.halts) m.v += ((st.phase === 'stop' ? 0 : 1) - m.v) * Math.min(1, dt * EASE);
    }
    // Car following, nearest ahead first so a wreck this frame is skipped by
    // whoever was behind it: they follow the survivor instead.
    const ordered = [...this.movers].sort((a, b) => a.x * this.dir - b.x * this.dir);
    const n = ordered.length;
    const gapMin = this.gapMin ?? 0;
    for (let i = 0; i < n; i++) {
      const m = ordered[i];
      if (m.wrecked) continue;
      let ahead = null, wrap = false;
      for (let k = 1; k < n && !ahead; k++) { const o = ordered[(i + k) % n]; if (!o.wrecked) { ahead = o; wrap = i + k >= n; } }
      let gap = ahead ? (ahead.x - m.x) * this.dir - (ahead.len + m.len) / 2 + (wrap ? 2 * SPAN : 0) : Infinity;
      if (this.halts && !m.reckless) {
        // Own braking: a blocker ahead, or a staller's stop; otherwise pull toward full speed.
        let target = 1, rate = EASE;
        if (m.staller?.phase === 'stop') target = 0;
        const hold = this.blockerAhead(m);
        if (hold) { target = 0; rate = EASE * (1 + HALT_GAIN * (hold - 1)); }
        // Inside gapMin the vehicle ahead sets the pace, once its slowing has been seen.
        if (ahead && gapMin > 0 && gap < gapMin && (ahead.braking ?? 0) >= REACT) {
          const pace = (ahead.v ?? 1) * Math.min(1, Math.max(0, gap) / gapMin);
          if (pace < target) { target = pace; rate = FOLLOW_BRAKE; }
        }
        m.v += (target - m.v) * Math.min(1, dt * rate);
        m.braking = m.v < BRAKE_SEEN ? (m.braking ?? 0) + dt : 0;
        const lit = target < Math.min(m.v, 1) - 0.02;   // pulling away from a honk is not braking
        if (lit !== !!m.lit) { m.lit = lit; setBrake(m.mesh, lit); }
      }
      let v = m.v ?? 1;
      let step = this.speed * v * dt;
      if (ahead && gapMin > 0) {
        if (m.reckless) {
          // Never brakes: closes to the bumper, then crashes into anything slower or rides it.
          if (gap <= TOUCH && v > (ahead.v ?? 1) + 0.02) { this.crash(m, ahead); continue; }
          if (gap <= TOUCH) v = Math.min(v, ahead.v ?? 1);
          step = Math.min(this.speed * v * dt, Math.max(0, gap));
        } else if (this.halts) {
          if (gap <= TOUCH && v > (ahead.v ?? 1) + CRASH_DV) { this.crash(m, ahead); continue; }
          step = Math.min(step, Math.max(0, gap));   // never through the bumper
        } else {
          if (gap < gapMin) v = Math.min(v, ahead.v ?? 1);
          step = Math.min(this.speed * v * dt, Math.max(0, gap - gapMin + 0.02));   // never past the minimum gap
        }
      }
      m.x += this.dir * step;
      if (m.x > SPAN) m.x -= 2 * SPAN;
      if (m.x < -SPAN) m.x += 2 * SPAN;
      m.mesh.position.x = m.x;
    }
  }

  // Two vehicles meet: the faster one breaks apart and the slower one drives on.
  crash(a, b) {
    const m = (a.v ?? 1) >= (b.v ?? 1) ? a : b;
    const fx = this.world?.config?.fx;
    if (fx) fx.explode(m.mesh, 1.1); else this.group.remove(m.mesh);
    m.wrecked = true;
    this.movers = this.movers.filter((o) => o !== m);
    sfx.boom(1.2);
  }

  spinCoins(time) {
    const spin = (coin) => { coin.rotation.y = time * 1.4; coin.position.y = Math.sin(time * 2.5) * 0.06; };
    for (const coin of this.coins.values()) spin(coin);
    for (const m of this.movers) if (m.coin) spin(m.coin);
  }
}
