import { Lane } from './lane.js';
import { SCENARIOS, INTRO } from './scenarios/index.js';
import { randInt } from './util.js';

export { W, SPAN } from './lane.js';

// The board: owns the rows, sequences scenario bands, and dispatches the
// per-row hooks. Scenario-specific behaviour lives in src/scenarios/.
export class World {
  constructor(scene) {
    this.scene = scene;
    this.rows = new Map();
    this.nextRow = 0;
    this.pathCol = 0;        // a guaranteed-open column that scenarios keep solvable
    this.queue = [];         // pending row specs { scenario, index, count }
    this.lastUsed = {};
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

  // ---- sequencer ----
  pickScenario(r) {
    const pool = Object.values(SCENARIOS).filter((s) => s.weight > 0 && r - (this.lastUsed[s.id] ?? -100) >= (s.minGap ?? 0));
    let roll = Math.random() * pool.reduce((a, s) => a + s.weight, 0);
    for (const s of pool) { roll -= s.weight; if (roll <= 0) return s; }
    return pool[pool.length - 1];
  }

  nextSpec(r) {
    if (r < 4) return { scenario: SCENARIOS[INTRO], index: r, count: 4 };
    if (this.queue.length === 0) {
      const s = this.pickScenario(r);
      const count = randInt(s.band[0], s.band[1]);
      const pad = s.pad && { scenario: SCENARIOS[s.pad], index: 0, count: 1 };
      if (pad) this.queue.push(pad);
      for (let i = 0; i < count; i++) this.queue.push({ scenario: s, index: i, count });
      if (pad) this.queue.push({ ...pad });
      this.lastUsed[s.id] = r;
    }
    return this.queue.shift();
  }

  addRow(r) {
    const spec = this.nextSpec(r);
    const lane = new Lane(r, spec.scenario);
    spec.scenario.build(lane, { world: this, index: spec.index, count: spec.count, prev: this.rows.get(r - 1) });
    this.scene.add(lane.group);
    this.rows.set(r, lane);
  }

  // ---- per-frame ----
  update(dt, time) {
    for (const lane of this.rows.values()) {
      lane.scenario.update?.(lane, dt, time);
      lane.spinCoins(time);
    }
  }
}
