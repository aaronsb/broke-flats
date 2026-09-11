import * as THREE from 'three';
import { box, makeCar, makeTruck, makeTree, makeUmbrellaTree, makeLog, makeCoin, makeHedge, makeTunnel, makeGround } from './meshes.js';
import { rand, randInt, pick, clamp } from './util.js';

export const W = 8;          // playable columns run -W..W
export const SPAN = W + 5;   // movers wrap at ±SPAN
const GW = 44;               // ground width

function spin(coin, time) {
  coin.rotation.y = time * 1.4;
  coin.position.y = Math.sin(time * 2.5) * 0.06;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.rows = new Map();
    this.nextRow = 0;
    this.pathCol = 0;        // a guaranteed-open column that random-walks upward
    this.queue = [];
    this.lastHedge = -20;
  }

  dispose() {
    for (const lane of this.rows.values()) this.scene.remove(lane.group);
    this.rows.clear();
  }

  ensure(upTo) { while (this.nextRow <= upTo) this.addRow(this.nextRow++); }

  cull(below) {
    for (const [r, lane] of this.rows) if (r < below) { this.scene.remove(lane.group); this.rows.delete(r); }
  }

  laneAt(r) { return this.rows.get(r); }
  isBlocked(c, r) { const lane = this.rows.get(r); return !!lane && lane.blocked.has(c); }

  placeCoin(lane, c) {
    const coin = makeCoin();
    coin.position.x = c;
    lane.group.add(coin);
    lane.coins.set(c, coin);
  }

  takeCoin(lane, c) {
    const coin = lane.coins.get(c);
    if (!coin) return false;
    lane.group.remove(coin);
    lane.coins.delete(c);
    return true;
  }

  nextType(r) {
    if (r < 4) return 'meadow';
    if (this.queue.length === 0) {
      const roll = Math.random();
      if (r - this.lastHedge > 14 && Math.random() < 0.3) {
        this.queue.push('meadow', 'hedge', 'meadow');
        this.lastHedge = r;
      } else if (roll < 0.3) this.queue.push(...Array(randInt(1, 3)).fill('grass'));
      else if (roll < 0.72) this.queue.push(...Array(randInt(1, 4)).fill('road'));
      else this.queue.push(...Array(randInt(1, 3)).fill('river'));
    }
    return this.queue.shift();
  }

  addRow(r) {
    const type = this.nextType(r);
    const group = new THREE.Group();
    group.position.z = -r;
    const lane = { r, type, group, blocked: new Set(), coins: new Map(), movers: [], dir: 0, speed: 0 };
    if (type === 'road') this.buildRoad(lane);
    else if (type === 'river') this.buildRiver(lane);
    else if (type === 'hedge') this.buildHedge(lane);
    else this.buildGrass(lane, type === 'grass');
    this.scene.add(group);
    this.rows.set(r, lane);
  }

  // Dense forest outside the playable strip.
  addForestEdges(lane) {
    for (let c = W + 1; c <= W + 7; c++) {
      for (const s of [-1, 1]) {
        if (Math.random() < 0.75) {
          const t = makeTree(true);
          t.position.x = s * c + rand(-0.15, 0.15);
          lane.group.add(t);
        }
      }
    }
  }

  buildGrass(lane, trees) {
    lane.group.add(makeGround(GW, lane.r % 2 ? 0x9ad24a : 0x8fca43));
    this.addForestEdges(lane);
    if (!trees) return;
    this.pathCol = clamp(this.pathCol + randInt(-1, 1), -W + 1, W - 1);

    // Umbrella tree with a coin tucked under its canopy.
    let shade = null;
    if (Math.random() < 0.45) {
      const c = randInt(-W + 2, W - 2);
      if (c !== this.pathCol) {
        shade = c;
        const t = makeUmbrellaTree();
        t.position.x = c;
        lane.group.add(t);
        lane.blocked.add(c);
        this.placeCoin(lane, c + pick(-1, 1));
      }
    }
    for (let c = -W; c <= W; c++) {
      if (c === this.pathCol) continue;
      if (shade !== null && Math.abs(c - shade) <= 1) continue;
      if (Math.random() < 0.22) {
        const t = makeTree();
        t.position.x = c;
        lane.group.add(t);
        lane.blocked.add(c);
      } else if (Math.random() < 0.04) this.placeCoin(lane, c);
    }
  }

  // A wall with one visible gap and one hidden tunnel, both placed at random
  // and kept far apart so the tunnel is a real shortcut. The meadow rows on
  // either side are treeless, so every column is reachable.
  buildHedge(lane) {
    lane.group.add(makeGround(GW, 0x8fca43));
    this.addForestEdges(lane);
    const tunnel = randInt(-W + 1, W - 1);
    let gap;
    do gap = randInt(-W, W); while (Math.abs(gap - tunnel) < 6);
    this.pathCol = tunnel;
    for (let c = -W; c <= W; c++) {
      if (c === gap) continue;
      const m = c === tunnel ? makeTunnel() : makeHedge();
      m.position.x = c;
      lane.group.add(m);
      if (c !== tunnel) lane.blocked.add(c);
    }
  }

  buildRoad(lane) {
    lane.group.add(makeGround(GW, 0x4a4a52));
    const prev = this.rows.get(lane.r - 1);
    if (prev && prev.type === 'road') {
      for (let x = -GW / 2; x < GW / 2; x += 1.5) lane.group.add(box(0.7, 0.02, 0.1, 0xdedede, x, 0, 0.5, false));
    }
    lane.dir = pick(-1, 1);
    lane.speed = rand(2, 4.5) + Math.min(3, lane.r / 60);
    const n = randInt(2, 4);
    const slot = (2 * SPAN) / n;
    for (let i = 0; i < n; i++) {
      const { mesh, len } = Math.random() < 0.3 ? makeTruck() : makeCar();
      if (lane.dir < 0) mesh.rotation.y = Math.PI;
      const x = -SPAN + i * slot + rand(0.5, slot - len - 0.5);
      mesh.position.x = x;
      lane.group.add(mesh);
      lane.movers.push({ mesh, x, len });
    }
    if (Math.random() < 0.3) this.placeCoin(lane, randInt(-W + 1, W - 1));
  }

  buildRiver(lane) {
    lane.group.add(makeGround(GW, 0x3f8fd6, -0.3, 0.2));
    lane.dir = pick(-1, 1);
    lane.speed = rand(1.2, 2.4) + Math.min(1.5, lane.r / 100);
    const n = randInt(2, 3);
    const slot = (2 * SPAN) / n;
    for (let i = 0; i < n; i++) {
      const len = randInt(2, 4);
      const mesh = makeLog(len);
      const x = -SPAN + i * slot + rand(0.3, slot - len - 0.3);
      mesh.position.x = x;
      lane.group.add(mesh);
      const mover = { mesh, x, len, coin: null };
      if (Math.random() < 0.3) {
        mover.coin = makeCoin();
        mesh.add(mover.coin);          // rides along with the log
      }
      lane.movers.push(mover);
    }
  }

  takeLogCoin(mover) {
    if (!mover.coin) return false;
    mover.mesh.remove(mover.coin);
    mover.coin = null;
    return true;
  }

  moverAt(lane, x, pad) {
    for (const m of lane.movers) if (Math.abs(x - m.x) < m.len / 2 + pad) return m;
    return null;
  }
  vehicleAt(lane, x) { return lane.type === 'road' ? this.moverAt(lane, x, 0.35) : null; }
  logAt(lane, x) { return lane.type === 'river' ? this.moverAt(lane, x, 0.3) : null; }

  update(dt, time) {
    for (const lane of this.rows.values()) {
      for (const m of lane.movers) {
        m.x += lane.dir * lane.speed * dt;
        if (m.x > SPAN) m.x -= 2 * SPAN;
        if (m.x < -SPAN) m.x += 2 * SPAN;
        m.mesh.position.x = m.x;
      }
      for (const coin of lane.coins.values()) spin(coin, time);
      for (const m of lane.movers) if (m.coin) spin(m.coin, time);
    }
  }
}
