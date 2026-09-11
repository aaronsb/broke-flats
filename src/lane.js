import * as THREE from 'three';
import { makeGround, makeCoin, makeEgg } from './meshes.js';
import { rand } from './util.js';

export const W = 8;          // playable columns run -W..W
export const SPAN = W + 5;   // movers wrap at ±SPAN
export const GW = 44;        // ground width

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

  ground(color, top = 0, thick = 0.5) { this.add(makeGround(GW, color, top, thick)); }

  block(c) { this.blocked.add(c); }

  // Fill outside the playable strip with the level's scenery.
  edges() { this.scenery.edge(this, this.world); }

  // Ground in the scenery's style (grass, pavement, asphalt).
  terrain() { this.scenery.ground(this); }

  coin(c) { this.coins.set(c, this.add(makeCoin(), c)); }

  egg(c) { this.eggs.set(c, this.add(makeEgg(), c)); }

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
    const slot = (2 * SPAN) / n;
    for (let i = 0; i < n; i++) {
      const m = make(i);
      m.x = -SPAN + i * slot + rand(gap, slot - m.len - gap);
      if (this.dir < 0) m.mesh.rotation.y = Math.PI;
      this.add(m.mesh, m.x);
      this.movers.push(m);
    }
    return this.movers;
  }

  moverCoin(m) { m.coin = makeCoin(); m.mesh.add(m.coin); }

  takeMoverCoin(m) {
    if (!m.coin) return false;
    m.mesh.remove(m.coin);
    m.coin = null;
    return true;
  }

  moverAt(x, pad) {
    for (const m of this.movers) if (Math.abs(x - m.x) < m.len / 2 + pad) return m;
    return null;
  }

  advance(dt) {
    for (const m of this.movers) {
      m.x += this.dir * this.speed * dt;
      if (m.x > SPAN) m.x -= 2 * SPAN;
      if (m.x < -SPAN) m.x += 2 * SPAN;
      m.mesh.position.x = m.x;
    }
  }

  spinCoins(time) {
    const spin = (coin) => { coin.rotation.y = time * 1.4; coin.position.y = Math.sin(time * 2.5) * 0.06; };
    for (const coin of this.coins.values()) spin(coin);
    for (const m of this.movers) if (m.coin) spin(m.coin);
  }
}
