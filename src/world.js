import { Lane } from './lane.js';
import { SCENARIOS, INTRO } from './scenarios/index.js';
import { randInt } from './util.js';

export { W, SPAN } from './lane.js';

// The board: owns the rows, sequences scenario bands, and dispatches the
// per-row hooks. Scenario-specific behaviour lives in src/scenarios/.
export class World {
  // config: { weights, bands, difficulty, sky, onFinish }
  constructor(scene, config) {
    this.scene = scene;
    this.config = config;
    this.rows = new Map();
    this.nextRow = 0;
    this.pathCol = 0;        // a guaranteed-open column that scenarios keep solvable
    this.queue = [];         // pending row specs { scenario, index, count }
    this.lastUsed = {};
    this.dangerBands = 0;
    this.done = false;       // finish line has been queued
    this.onFinish = config.onFinish;
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
  weightOf(s) { return this.config.weights[s.id] ?? 0; }

  pickScenario(r) {
    const pool = Object.values(SCENARIOS).filter((s) => this.weightOf(s) > 0 && r - (this.lastUsed[s.id] ?? -100) >= (s.minGap ?? 0));
    let roll = Math.random() * pool.reduce((a, s) => a + this.weightOf(s), 0);
    for (const s of pool) { roll -= this.weightOf(s); if (roll <= 0) return s; }
    return pool[pool.length - 1];
  }

  // After the level's danger-band quota, lay the finish line and then only meadow.
  queueFinish() {
    const pad = { scenario: SCENARIOS[INTRO], index: 0, count: 1 };
    this.queue.push(pad, { scenario: SCENARIOS.finish, index: 0, count: 1 }, { ...pad }, { ...pad });
    this.done = true;
  }

  nextSpec(r) {
    if (r < 4) return { scenario: SCENARIOS[INTRO], index: r, count: 4 };
    if (this.queue.length === 0 && this.done) return { scenario: SCENARIOS[INTRO], index: 0, count: 1 };
    if (this.queue.length === 0 && this.dangerBands >= this.config.bands) this.queueFinish();
    if (this.queue.length === 0) {
      const s = this.pickScenario(r);
      if (s.danger) this.dangerBands++;
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
    spec.scenario.build(lane, {
      world: this, index: spec.index, count: spec.count, prev: this.rows.get(r - 1),
      sky: this.config.sky, difficulty: this.config.difficulty,
    });
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
