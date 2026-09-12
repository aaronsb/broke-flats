import * as THREE from 'three';
import { makeGround, makeCoin, makeEgg, makeFlagMarker } from './meshes.js';
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
    this.coins = new Map();
    this.eggs = new Map();
    this.flags = new Map();      // player-planted markers, any row
    this.movers = [];
    this.dir = 0;
    this.speed = 0;
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

  block(c) { this.blocked.add(c); }

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

  advance(dt) {
    const n = this.movers.length;
    // Stallers: go -> slowing -> stopped -> go, each phase eased.
    for (const m of this.movers) {
      if (!m.staller) continue;
      const st = m.staller;
      st.wait -= dt;
      if (st.wait <= 0) {
        st.phase = st.phase === 'go' ? 'stop' : 'go';
        st.wait = st.phase === 'stop' ? rand(1, 3) : rand(4, 12);
      }
      const target = st.phase === 'stop' ? 0 : 1;
      m.v += (target - m.v) * Math.min(1, dt * 2.5);
    }
    // Car following: nobody closes on the vehicle ahead past the minimum gap.
    const ordered = [...this.movers].sort((a, b) => a.x * this.dir - b.x * this.dir);
    const gapMin = this.gapMin ?? 0;
    for (let i = 0; i < n; i++) {
      const m = ordered[i], ahead = ordered[(i + 1) % n];
      let v = m.v ?? 1;
      let step = this.speed * v * dt;
      if (n > 1 && gapMin > 0) {
        let gap = (ahead.x - m.x) * this.dir - (ahead.len + m.len) / 2;
        if (i === n - 1) gap += 2 * SPAN;
        if (m.reckless) {
          // Never brakes: closes to the bumper, then crashes into anything slower or rides it.
          if (gap <= 0.05 && v > (ahead.v ?? 1) + 0.02) { this.crash(m, ahead); break; }
          if (gap <= 0.05) v = Math.min(v, ahead.v ?? 1);
          step = Math.min(this.speed * v * dt, Math.max(0, gap));
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

  // Two vehicles meet: both break apart and the lane runs one short for a while.
  crash(a, b) {
    const fx = this.world?.config?.fx;
    for (const m of [a, b]) {
      if (fx) fx.explode(m.mesh, 1.1); else this.group.remove(m.mesh);
      this.movers = this.movers.filter((o) => o !== m);
    }
    sfx.boom(1.2);
  }

  spinCoins(time) {
    const spin = (coin) => { coin.rotation.y = time * 1.4; coin.position.y = Math.sin(time * 2.5) * 0.06; };
    for (const coin of this.coins.values()) spin(coin);
    for (const m of this.movers) if (m.coin) spin(m.coin);
  }
}
