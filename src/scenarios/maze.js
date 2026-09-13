// Maze gauntlet: a Pac-Man board the width of the strip and as deep as the
// level's band quota, walled with the scenery theme and floored with one
// vehicle's surface. Four vehicles of that kind hunt the corridors
// (src/ghosts.js); touching one is that vehicle's death. Some wall cells are
// weaknesses that read as wall from above: the tilt finds them. Coins line the
// corridors, and clearing every one before the finish pays MAZE_CLEAR_BONUS.
// Track mazes carry a crossing gate or two that drop when a train is near.
import { box, makeHedge, makeTunnel, makePicket, makeChainlink, makeWall, makeGate } from '../meshes.js';
import { W } from '../lane.js';
import { levelFor } from '../levels.js';
import { rollPowerup } from '../powerups.js';
import { randInt, pick, damp } from '../util.js';
import { Ghosts } from '../ghosts.js';
import './rail.js';     // the 'train' death
import './runway.js';   // the 'plane' death

export const MAZE_CLEAR_BONUS = 300;
const COLS = 2 * W + 1;
const COIN_CHANCE = 0.4;       // corridor cells carrying a coin
const CRATE_CHANCE = 0.1;      // per row, a crate on a corridor cell
const WEAK_SHARE = 0.08;       // walls between two corridors that give way
const WEAK_CRATE = 0.35;       // a roofed weakness hides a crate this often
const LOOPS = 0.1;             // extra walls knocked out beyond the dead-end rule
const STUB = 2;                // longest dead end left standing, in cells
const GATE_REACH = 4;          // a train ghost this close drops a gate
const GATE_RUN = 5;            // a straight this long may carry a gate
const GATES_MAX = 2;
const DIRS = [[0, 1], [-1, 0], [0, -1], [1, 0]];

// Corridor surfaces: the level each starts at, the death it deals, the tile colour.
const KINDS = {
  road:   { from: 1, death: 'car',   tile: 0x4a4a52 },
  track:  { from: 2, death: 'train', tile: 0x6a645c },
  runway: { from: 3, death: 'plane', tile: 0x3e3e46 },
};
// Wall kinds: make(weak) builds a cell, `kind` is what blocks (a perk may pass
// it), `roof` hides a crate under the weak cell, `thin` panels turn to follow the wall.
// No tree wall: a maze of touching canopies roofs the corridors over from the tilted view.
const WALLS = {
  hedge:     { make: (weak) => (weak ? makeTunnel() : makeHedge()), kind: 'bush', roof: true },
  picket:    { make: makePicket, kind: 'fence', thin: true },
  chainlink: { make: makeChainlink, kind: 'fence', thin: true },
  wall:      { make: makeWall, kind: 'solid', thin: true },
};
const THEME_WALLS = { forest: ['hedge'], residential: ['picket'], city: ['wall'], parking: ['chainlink'] };

// grid[j][i]: 0 wall, 1 corridor, 2 weakness. Odd cells are the corridor
// lattice; a perfect maze is carved on it, then the ring, the spine, the
// doors, and the loops that leave no dead end deeper than STUB.
export function generate(rows) {
  const grid = Array.from({ length: rows }, () => new Array(COLS).fill(0));
  const open = (i, j) => i >= 0 && i < COLS && j >= 0 && j < rows && grid[j][i] === 1;
  const seen = new Set(['1,1']);
  const stack = [[1, 1]];
  grid[1][1] = 1;
  while (stack.length) {
    const [i, j] = stack[stack.length - 1];
    const next = DIRS.map(([di, dj]) => [i + 2 * di, j + 2 * dj]).filter(([a, b]) => a >= 1 && a <= COLS - 2 && b >= 1 && b <= rows - 2 && !seen.has(`${a},${b}`));
    if (!next.length) { stack.pop(); continue; }
    const [a, b] = pick(...next);
    grid[(j + b) / 2][(i + a) / 2] = 1;
    grid[b][a] = 1;
    seen.add(`${a},${b}`);
    stack.push([a, b]);
  }
  for (let i = 1; i <= COLS - 2; i++) { grid[1][i] = 1; grid[rows - 2][i] = 1; }
  for (let j = 1; j <= rows - 2; j++) { grid[j][1] = 1; grid[j][COLS - 2] = 1; }
  const spine = 2 * randInt(1, W - 2) + 1;
  for (let j = 0; j < rows; j++) grid[j][spine] = 1;
  for (const j of [0, rows - 1]) for (let n = randInt(1, 2); n > 0; n--) grid[j][2 * randInt(0, W - 1) + 1] = 1;
  // Dead ends: from a tip, the stub runs to the first junction; a long one gets a wall knocked through at the tip.
  const degree = (i, j) => DIRS.filter(([di, dj]) => open(i + di, j + dj)).length;
  const stubLen = (i, j) => {
    let len = 1, pi = null, pj = null, ci = i, cj = j;
    for (;;) {
      const s = DIRS.find(([di, dj]) => open(ci + di, cj + dj) && !(ci + di === pi && cj + dj === pj));
      if (!s) return len;
      const ni = ci + s[0], nj = cj + s[1];
      if (degree(ni, nj) !== 2) return len;
      pi = ci; pj = cj; ci = ni; cj = nj; len++;
      if (len > STUB) return len;
    }
  };
  for (let guard = 0, fixed = true; fixed && guard < 400; guard++) {
    fixed = false;
    for (let j = 1; j <= rows - 2 && !fixed; j += 2) for (let i = 1; i <= COLS - 2 && !fixed; i += 2) {
      if (degree(i, j) !== 1 || stubLen(i, j) <= STUB) continue;
      const outs = DIRS.filter(([di, dj]) => !open(i + di, j + dj) && open(i + 2 * di, j + 2 * dj));
      if (!outs.length) continue;
      const [di, dj] = pick(...outs);
      grid[j + dj][i + di] = 1;
      fixed = true;
    }
  }
  // Walls between two corridors: a share become loops, a share become weaknesses.
  const between = [];
  for (let j = 1; j <= rows - 2; j++) for (let i = 1; i <= COLS - 2; i++) {
    if (grid[j][i] !== 0 || (i + j) % 2 === 0) continue;
    if ((open(i - 1, j) && open(i + 1, j)) || (open(i, j - 1) && open(i, j + 1))) between.push([i, j]);
  }
  between.sort(() => Math.random() - 0.5);
  const loops = Math.round(between.length * LOOPS), weak = Math.round(between.length * WEAK_SHARE);
  between.slice(0, loops).forEach(([i, j]) => { grid[j][i] = 1; });
  between.slice(loops, loops + weak).forEach(([i, j]) => { grid[j][i] = 2; });
  return { grid, spine };
}

// Breadth-first from the bottom doors to the top row over corridor cells.
// Returns one corridor column per row along the path, or null when cut off.
function pathThrough(grid) {
  const rows = grid.length;
  const prev = new Map();
  const queue = [];
  for (let i = 0; i < COLS; i++) if (grid[0][i] === 1) { queue.push([i, 0]); prev.set(`${i},0`, null); }
  let end = null;
  while (queue.length && !end) {
    const [i, j] = queue.shift();
    if (j === rows - 1) { end = [i, j]; break; }
    for (const [di, dj] of DIRS) {
      const a = i + di, b = j + dj, k = `${a},${b}`;
      if (a < 0 || a >= COLS || b < 0 || b >= rows || grid[b][a] !== 1 || prev.has(k)) continue;
      prev.set(k, [i, j]);
      queue.push([a, b]);
    }
  }
  if (!end) return null;
  const path = new Array(rows).fill(null);
  for (let c = end; c; c = prev.get(`${c[0]},${c[1]}`)) path[c[1]] = c[0];
  return path;
}

// Junction cells inside long straights: a crossing gate stands at up to GATES_MAX of them, well apart.
function pickGates(grid) {
  const rows = grid.length;
  const cands = [];
  for (let j = 1; j <= rows - 2; j += 2) {
    let run = 0;
    for (let i = 1; i <= COLS; i++) {
      if (i < COLS && grid[j][i] === 1) { run++; continue; }
      if (run >= GATE_RUN) for (let c = i - run + 1; c < i - 1; c++) if (grid[j - 1][c] === 1 || grid[j + 1][c] === 1) cands.push([c, j]);
      run = 0;
    }
  }
  cands.sort(() => Math.random() - 0.5);
  const gates = [];
  for (const [i, j] of cands) {
    if (gates.length >= GATES_MAX) break;
    if (gates.every((g) => Math.abs(g.i - i) + Math.abs(g.j - j) >= 4)) gates.push({ i, j, down: false, arms: [] });
  }
  return gates;
}

function pickKind(level) {
  const allowed = Object.keys(KINDS).filter((k) => level >= KINDS[k].from);
  return pick(...allowed);
}

// The whole board, planned once when the first row is laid.
function plan(world, rows, level, firstRow) {
  const { grid, spine } = generate(rows);
  let path = pathThrough(grid);
  if (!path) { console.error('maze: no path from start to finish; falling back to the spine'); path = new Array(rows).fill(spine); }
  const kind = pickKind(level);
  const top = rows - 2;   // the far ring row: the ghosts start there, spread out, and two of them scatter to its corners
  return {
    grid, rows, firstRow, kind, path, spine,
    wall: pick(...(THEME_WALLS[world.config.scenery?.id] ?? ['hedge'])),
    homes: [[COLS - 4, top], [3, top], [COLS - 8, top], [7, top]],
    corners: [[COLS - 2, top], [1, top], [COLS - 2, 1], [1, 1]],
    gates: kind === 'track' ? pickGates(grid) : [],
    ghosts: null,
    coins: 0,
  };
}

// One corridor cell's floor: the kind's tile, with dashes or rails along the
// axes it connects (ax along the row, az up the board).
function surface(lane, c, kind, ax, az) {
  lane.add(box(1, 0.03, 1, KINDS[kind].tile, c, 0, 0, false));
  if (!ax && !az) ax = true;
  if (kind === 'track') {
    if (ax) {
      for (const dx of [-0.25, 0.25]) lane.add(box(0.2, 0.04, 0.9, 0x5a3d24, c + dx, 0.03, 0, false));
      for (const z of [-0.3, 0.3]) lane.add(box(1, 0.06, 0.08, 0xb8b8b8, c, 0.06, z, false));
    }
    if (az) {
      for (const dz of [-0.25, 0.25]) lane.add(box(0.9, 0.04, 0.2, 0x5a3d24, c, 0.03, dz, false));
      for (const x of [-0.3, 0.3]) lane.add(box(0.08, 0.06, 1, 0xb8b8b8, c + x, 0.06, 0, false));
    }
    return;
  }
  const [len, wid, col] = kind === 'road' ? [0.5, 0.08, 0xdedede] : [0.7, 0.12, 0xe8e8e8];
  if (ax) lane.add(box(len, 0.01, wid, col, c, 0.03, 0, false));
  if (az) lane.add(box(wid, 0.01, len, col, c, 0.03, 0, false));
}

export default {
  id: 'maze',
  danger: true,
  weight: 0,          // only as a gauntlet (or forced)
  pad: 'meadow',
  // One band is the whole gauntlet: the level's band count in rows, made odd for the corridor lattice.
  band: (level) => { const n = levelFor(level).bands | 1; return [n, n]; },
  build(lane, { world, index, count, sky, difficulty, level }) {
    if (index === 0) world.data.maze = plan(world, count, level, lane.r);
    const maze = world.data.maze;
    const { grid } = maze;
    const j = index, row = grid[j];
    lane.data.maze = maze;
    lane.data.j = j;
    lane.terrain();
    lane.edges();
    const wall = WALLS[maze.wall];
    const at = (i, jj) => (i >= 0 && i < COLS && jj >= 0 && jj < maze.rows ? grid[jj][i] : -1);
    const isWall = (i, jj) => at(i, jj) === 0 || at(i, jj) === 2;
    const free = [];
    for (let i = 0; i < COLS; i++) {
      const c = i - W, v = row[i];
      if (v === 1) { surface(lane, c, maze.kind, at(i - 1, j) === 1 || at(i + 1, j) === 1, at(i, j - 1) === 1 || at(i, j + 1) === 1); free.push(c); continue; }
      const mesh = wall.make(v === 2);
      if (wall.thin) {
        // A panel follows the wall it is part of; a weak panel stands across the way through it.
        const hx = isWall(i - 1, j) || isWall(i + 1, j), hz = isWall(i, j - 1) || isWall(i, j + 1);
        const alongZ = v === 2 ? at(i - 1, j) === 1 && at(i + 1, j) === 1 : hz && !hx;
        if (alongZ) mesh.rotation.y = Math.PI / 2;
        if (v === 0 && hx && hz) { const m2 = wall.make(false); m2.rotation.y = Math.PI / 2; lane.add(m2, c); }
      }
      lane.add(mesh, c);
      if (v === 0) lane.block(c, wall.kind);
      else {
        lane.data.hidden = true;            // the way through only shows from the side
        if (wall.roof && Math.random() < WEAK_CRATE) lane.crate(c, rollPowerup());
      }
    }
    // Gates: an arm across each open side of the cell, swung from the corner post.
    for (const g of maze.gates) {
      if (g.j !== j) continue;
      const c = g.i - W;
      if (at(g.i, j - 1) === 1) { const m = lane.add(makeGate(1), c - 0.5); m.position.z = 0.5; g.arms.push(m); }
      if (at(g.i, j + 1) === 1) { const m = lane.add(makeGate(1), c + 0.5); m.position.z = -0.5; m.rotation.y = Math.PI; g.arms.push(m); }
      (lane.data.gates ??= []).push(g);
    }
    // Pickups: a crate on one corridor cell now and then, coins as pellets on the rest.
    const gated = new Set(maze.gates.filter((g) => g.j === j).map((g) => g.i - W));
    const cells = free.filter((c) => !gated.has(c));
    if (cells.length && Math.random() < CRATE_CHANCE) { const c = cells.splice(randInt(0, cells.length - 1), 1)[0]; lane.crate(c, rollPowerup()); }
    for (const c of cells) if (Math.random() < COIN_CHANCE) { lane.coin(c); maze.coins++; }
    world.pathCol = maze.path[j] - W;
    lane.data.pathCol = world.pathCol;
    if (index === count - 1) {
      // The last row carries the ghosts (it outlives the rest), and closes the level's danger quota.
      maze.ghosts = new Ghosts(maze, lane, world, { sky, difficulty });
      world.dangerBands = Math.max(world.dangerBands, world.config.bands);
    }
  },

  update(lane, dt, time) {
    const maze = lane.data.maze;
    if (maze.ghosts && maze.tick !== time) { maze.tick = time; maze.ghosts.update(dt, time); }
    for (const g of lane.data.gates ?? []) {
      g.down = !!maze.ghosts?.trainNear(g.i, g.j, GATE_REACH);
      for (const arm of g.arms) {
        arm.pivot.rotation.z += ((g.down ? 0 : Math.PI / 2 - 0.15) - arm.pivot.rotation.z) * damp(5, dt);
        arm.lamps.forEach((l, k) => l.material.color.set(g.down && (Math.sin(time * 14) > 0) === (k % 2 === 0) ? 0xff2a1a : 0x3a0a0a));
      }
    }
  },

  // A dropped gate refuses entry to its cell from the rows either side.
  blockedFrom(lane, c, fromRow) {
    return fromRow !== lane.r && (lane.data.gates ?? []).some((g) => g.down && g.i - W === c);
  },

  lethalAt(lane, x) {
    return lane.moverAt(x, 0.35) ? KINDS[lane.data.maze.kind].death : null;
  },
};
