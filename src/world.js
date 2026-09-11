import { Lane } from './lane.js';
import { SCENARIOS, INTRO } from './scenarios/index.js';
import { randInt } from './util.js';

export { W, SPAN } from './lane.js';

// The board: owns the rows, sequences scenario bands, and dispatches the
// per-row hooks. Scenario-specific behaviour lives in src/scenarios/.
export class World {
  // config: { weights, bands, difficulty, sky, scenery, onFinish }
  constructor(scene, config) {
    this.scene = scene;
    this.config = config;
    this.data = {};          // scratch shared by scenery planners
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

  // A grounded plane whose wing reaches over cell (x, row) from a runway on
  // either side. Wings span the neighbouring rows.
  wingAt(x, row) {
    for (const r of [row - 1, row + 1]) {
      const lane = this.rows.get(r);
      if (!lane || lane.scenario.id !== 'runway') continue;
      for (const m of lane.movers) if (m.y < 1.0 && Math.abs(x - (m.x + lane.dir * 0.1)) < 0.45) return m;
    }
    return null;
  }
  // Static blocks, plus scenario rules that depend on which row you come from
  // (crossing gates block entry under an arm, and exit toward one).
  isBlocked(c, r, fromRow = null) {
    const lane = this.rows.get(r);
    if (!lane) return false;
    if (lane.blocked.has(c)) return true;
    if (fromRow !== null && lane.scenario.blockedFrom?.(lane, c, fromRow)) return true;
    const from = fromRow !== null ? this.rows.get(fromRow) : null;
    if (from?.scenario.blockedExit?.(from, c, r)) return true;
    return false;
  }

  // ---- sequencer ----
  weightOf(s) { return this.config.weights[s.id] ?? 0; }

  pickScenario(r) {
    const gap = (s) => (this.config.ignoreGaps && !s.keepGap ? 0 : s.minGap ?? 0);
    const pool = Object.values(SCENARIOS).filter((s) => this.weightOf(s) > 0 && r - (this.lastUsed[s.id] ?? -100) >= gap(s));
    if (pool.length === 0) return SCENARIOS[INTRO];
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
    const lane = new Lane(r, spec.scenario, this);
    spec.scenario.build(lane, {
      world: this, index: spec.index, count: spec.count, prev: this.rows.get(r - 1),
      sky: this.config.sky, difficulty: this.config.difficulty, gauntlet: !!this.config.gauntlet,
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
