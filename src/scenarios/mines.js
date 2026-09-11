// Minesweeper gauntlet: open ground, no traffic, buried mines that never show
// from any angle. A guaranteed safe path random-walks up the field and carries
// coins; eggs sit on safe cells, and the followers they hatch are your mine
// detectors: a follower stepping on a mine makes it beep underground. Landing
// on a safe cell shows its adjacent-mine count as red dots. Q/E turn in place
// and F plants a flag one cell ahead. Stepping on a mine raises it, beeping,
// and it blows the level with no bonus. Crossing the line blows every mine at
// once instead, and the flags that were right pay out.
import { makeMine, makeCountTile, makeFlagMarker, makeScorch } from '../meshes.js';
import { W } from '../lane.js';
import { sfx } from '../sfx.js';
import { randInt, clamp } from '../util.js';

const DENSITY = 0.16;
const FUSE = 1.7;          // seconds of beeping before the blast
export const FLAG_BONUS = 30;

export default {
  id: 'mines',
  danger: true,
  weight: 0,          // only as a gauntlet (or forced)
  band: [3, 4],
  build(lane, { world }) {
    lane.terrain();
    lane.edges();
    lane.data.mines = new Map();
    lane.data.flags = new Map();
    lane.data.revealed = new Set();
    world.pathCol = clamp(world.pathCol + randInt(-1, 1), -W + 1, W - 1);
    const safe = new Set([world.pathCol - 1, world.pathCol, world.pathCol + 1]);
    for (let c = -W; c <= W; c++) {
      if (safe.has(c)) continue;
      if (Math.random() < DENSITY) lane.data.mines.set(c, { c, mesh: null, t: 0 });
      else if (Math.random() < 0.12) lane.coin(c);
      else if (Math.random() < 0.05) lane.egg(c);
    }
    if (lane.r % 2 === 0) lane.coin(world.pathCol);
  },

  adjacent(lane, c) {
    let n = 0;
    for (const r of [lane.r - 1, lane.r, lane.r + 1]) {
      const l = lane.world.rows.get(r);
      if (!l?.data.mines) continue;
      for (const dc of [-1, 0, 1]) if (l.data.mines.has(c + dc)) n++;
    }
    return n;
  },

  arm(lane, mine, delay = 0) {
    mine.mesh = lane.add(makeMine(), mine.c);
    mine.mesh.position.y = -0.9;
    mine.t = -delay;
    (lane.data.armed ??= []).push(mine);
  },

  onLand(lane, player) {
    const mine = lane.data.mines.get(player.col);
    if (mine && !mine.mesh) {
      this.arm(lane, mine);
      lane.data.fatal = true;
      player.frozen = true;
      return null;
    }
    if (!lane.data.revealed.has(player.col)) {
      lane.data.revealed.add(player.col);
      const n = this.adjacent(lane, player.col);
      if (n) lane.add(makeCountTile(n), player.col);
    }
    return null;
  },

  // A follower on a mine: it beeps, buried, and nothing else happens.
  onFollowerLand(lane, c) {
    if (lane.data.mines.has(c)) sfx.beep(0.6);
  },

  toggleFlag(lane, c) {
    const f = lane.data.flags.get(c);
    if (f) { lane.group.remove(f); lane.data.flags.delete(c); }
    else lane.data.flags.set(c, lane.add(makeFlagMarker(), c));
    sfx.tick();
  },

  // The finale: every remaining mine rises and goes off, nearest rows first.
  detonateAll(lane, fromRow) {
    for (const m of lane.data.mines.values()) if (!m.mesh) this.arm(lane, m, Math.abs(lane.r - fromRow) * 0.08);
    lane.data.finale = true;
  },

  update(lane, dt, time) {
    const armed = lane.data.armed;
    if (!armed?.length) return;
    const on = Math.sin(time * 40) > 0;
    for (const m of [...armed]) {
      m.t += dt;
      if (m.t < 0) continue;
      m.mesh.position.y = Math.min(0, -0.9 + m.t * 1.6);
      m.mesh.lamp.material.color.set(on ? 0xff2a1a : 0x3a0a0a);
      if (m.t >= FUSE) {
        armed.splice(armed.indexOf(m), 1);
        lane.data.mines.delete(m.c);
        const fx = lane.world.config.fx;
        if (fx) fx.explode(m.mesh, 1.4); else lane.group.remove(m.mesh);
        lane.add(makeScorch(), m.c);
        if (lane.data.flags.has(m.c)) lane.data.hits = (lane.data.hits ?? 0) + 1;
        if (!lane.data.finale) { sfx.boom(1.6); lane.world.onMine?.(); }
      }
    }
    // One beep for the row per tick, so a finale is a chorus rather than a wall.
    const ticking = armed.some((m) => m.t >= 0 && m.t < FUSE);
    if (ticking && Math.floor(time / 0.12) !== lane.data.beat) { lane.data.beat = Math.floor(time / 0.12); if (Math.abs(lane.r - (lane.world.focusRow ?? lane.r)) <= 9) sfx.beep(); }
  },
};
