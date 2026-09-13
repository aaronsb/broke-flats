// Maze ghosts: four vehicles that hunt the corridor grid of a maze gauntlet
// (scenarios/maze.js). They move cell to cell, turn only at junctions and
// never reverse unless cornered. Blinky chases the player's cell, Pinky aims
// four cells ahead of its facing, Inky reflects Blinky through the point two
// cells ahead, Clyde wanders and backs off to its corner when close. Every
// SCATTER_EVERY seconds all four scatter to their corners for a while. At a
// junction a ghost keeps out of a cell another ghost holds; two that touch
// anyway explode and come back at home a few seconds later, and so does one
// a powerup wrecks. Each ghost is registered as a mover on the row it is on, so the
// row's lethalAt and Lane.wreck see it like any vehicle.
import * as THREE from 'three';
import { box, makeCar, makeTruck, makePlane, makeTrain, makeHeadlightCone, setBrake } from './meshes.js';
import { CONE } from './headlights.js';
import { W } from './lane.js';
import { sfx } from './sfx.js';
import { lerp, clamp, pick, rand } from './util.js';

const RESPAWN = 4;             // seconds a crashed ghost stays gone
const TOUCH = 0.6;             // cells apart that counts as a crash
const GRACE = 2;               // seconds after spawning before a ghost can crash into another
const SCATTER_EVERY = 20, SCATTER_FOR = 6;
const CLYDE_SHY = 6;           // cells: Clyde backs off inside this
const HORN_REACH = 5;          // cells: a train ghost honks inside this
const HORN_GAP = [0.5, 2.2];   // seconds between honks, close to far
const LEN = 0.9;               // mover length for the row's hit test
const BRAKE_AT = 0.4;          // cells short of a turn the brake lights come on
const DIRS = [[0, 1], [-1, 0], [0, -1], [1, 0]];   // up (toward the finish), left, down, right: Pac-Man's tie-break order
const NAMES = ['blinky', 'pinky', 'inky', 'clyde'];
// Vehicle builders per surface, scaled to sit in a one-cell corridor.
const MAKERS = {
  road:   () => { const m = Math.random() < 0.3 ? makeTruck() : makeCar(); return { ...m, scale: m.tall ? 0.55 : 0.8 }; },
  runway: () => ({ ...makePlane(), scale: 0.5 }),
  track:  () => ({ ...makeTrain('diesel', []), scale: 0.65 }),
};
const STROBE = new THREE.MeshBasicMaterial({ color: 0xffffff });

export class Ghosts {
  // maze: { grid, rows, firstRow, kind, homes, corners }. lane: the row whose group
  // carries the meshes; the last maze row, culled last and disposed with the world.
  constructor(maze, lane, world, { sky, difficulty }) {
    this.maze = maze;
    this.lane = lane;
    this.world = world;
    this.headlights = !!sky.headlights;
    this.speed = lerp(1.6, 3.2, clamp(difficulty / 5, 0, 1));   // cells per second
    this.clock = 0;
    this.scattering = false;
    this.honks = 0;
    this.all = NAMES.map((name, k) => ({ name, home: maze.homes[k], pos: [...maze.homes[k]], to: [...maze.homes[k]], dir: null, next: null, corner: maze.corners[k], dead: 0, grace: 0, mesh: null, mover: null, braking: false, hornIn: rand(0, 1) }));
    for (const g of this.all) this.spawn(g);
  }

  spawn(g) {
    const { mesh, len, scale } = MAKERS[this.maze.kind]();
    mesh.scale.setScalar(scale);
    if (this.headlights) this.lamps(mesh, len);
    if (this.maze.kind === 'runway') { g.strobe = box(0.14, 0.14, 0.14, STROBE, -1.05, 1.15, 0, false); mesh.add(g.strobe); }
    this.lane.group.add(mesh);
    g.mesh = mesh;
    g.dead = 0;
    g.grace = GRACE;
    g.braking = false;
    g.pos = [...g.home]; g.to = [...g.home]; g.dir = null;
    g.next = this.choose(g, g.home, null);
    g.mover = { mesh, x: g.home[0] - W, z: 0, len: LEN, v: 0, ghost: g };
    this.place(g);
  }

  lamps(mesh, len) {
    const kind = this.maze.kind;
    if (kind === 'road') mesh.add(makeHeadlightCone(len * CONE));
    else if (kind === 'runway') for (const dz of [-1.15, 1.15]) mesh.add(makeHeadlightCone(len * CONE, len * CONE / 2 + 0.2, 0.15, dz, 0.5));
    else mesh.add(makeHeadlightCone(len * CONE * 0.4, len / 2 + 0.9, 0.05, 0, 1.1));
  }

  // Corridor cells a ghost may drive: the door rows at either end are the player's alone.
  open(i, j) {
    const { grid, rows } = this.maze;
    return j >= 1 && j <= rows - 2 && i >= 0 && i <= 2 * W && grid[j][i] === 1;
  }

  // The living player nearest this ghost, in grid coordinates.
  nearest(g) {
    let best = null, bestD = Infinity;
    for (const p of this.world.players?.() ?? []) {
      if (!p.alive) continue;
      const d = Math.hypot(p.x + W - g.pos[0], p.row - this.maze.firstRow - g.pos[1]);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  // Where this ghost is heading, or null to wander.
  target(g) {
    if (this.scattering) return g.corner;
    const p = this.nearest(g);
    if (!p) return null;
    const P = [Math.round(p.x) + W, p.row - this.maze.firstRow];
    const f = DIRS[Math.round(p.facing / (Math.PI / 2)) & 3];   // the player's facing as a grid step
    switch (g.name) {
      case 'blinky': return P;
      case 'pinky': return [P[0] + 4 * f[0], P[1] + 4 * f[1]];
      case 'inky': { const b = this.all[0].pos; const two = [P[0] + 2 * f[0], P[1] + 2 * f[1]]; return [2 * two[0] - b[0], 2 * two[1] - b[1]]; }
      default: return Math.hypot(g.pos[0] - P[0], g.pos[1] - P[1]) < CLYDE_SHY ? g.corner : null;
    }
  }

  // Cells other ghosts stand on or are heading for.
  claimed(g) {
    const cells = new Set();
    for (const o of this.all) if (o !== g && o.dead <= 0) { cells.add(`${Math.round(o.pos[0])},${Math.round(o.pos[1])}`); cells.add(`${o.to[0]},${o.to[1]}`); }
    return cells;
  }

  // The way out of cell (i, j) for a ghost that arrived heading `dir`: never
  // back the way it came unless that is all there is, and not into another
  // ghost's cell while there is anywhere else to go.
  choose(g, [i, j], dir) {
    let options = DIRS.filter(([di, dj]) => !(dir && di === -dir[0] && dj === -dir[1]) && this.open(i + di, j + dj));
    if (!options.length) return dir ? [-dir[0], -dir[1]] : null;
    const taken = this.claimed(g);
    const clear = options.filter(([di, dj]) => !taken.has(`${i + di},${j + dj}`));
    if (clear.length) options = clear;
    if (options.length === 1) return options[0];
    const t = this.target(g);
    if (!t) return pick(...options);
    let best = null, bestD = Infinity;
    for (const d of options) {
      const dd = (i + d[0] - t[0]) ** 2 + (j + d[1] - t[1]) ** 2;
      if (dd < bestD) { bestD = dd; best = d; }
    }
    return best;
  }

  // At a cell centre: take the turn planned for it and plan the next one a
  // cell ahead, as Pac-Man's ghosts do.
  arrive(g) {
    g.dir = g.next ?? this.choose(g, g.to, g.dir);
    if (!g.dir) return;
    g.to = [g.to[0] + g.dir[0], g.to[1] + g.dir[1]];
    g.next = this.choose(g, g.to, g.dir);
  }

  step(g, dt) {
    if (g.pos[0] === g.to[0] && g.pos[1] === g.to[1]) this.arrive(g);
    let left = this.speed * dt;
    while (left > 0 && g.dir) {
      const dx = g.to[0] - g.pos[0], dz = g.to[1] - g.pos[1];
      const d = Math.abs(dx) + Math.abs(dz);
      if (d <= left) { g.pos = [...g.to]; left -= d; this.arrive(g); }
      else { g.pos[0] += Math.sign(dx) * left; g.pos[1] += Math.sign(dz) * left; left = 0; }
    }
  }

  // Drop a ghost on a cell with no plan; it picks a way out on the next tick.
  teleport(g, i, j) {
    g.pos = [i, j]; g.to = [i, j]; g.dir = null; g.next = null;
  }

  // A ghost leaves play for RESPAWN seconds. Its mesh is already gone (blown up).
  gone(g) {
    g.dead = RESPAWN;
    g.mesh = null;
    g.mover = null;
    g.strobe = null;
  }

  crash(g) {
    const fx = this.world.config?.fx;
    if (fx) fx.explode(g.mesh, 1.2); else this.lane.group.remove(g.mesh);
    this.gone(g);
  }

  // Mesh where the ghost is, facing the way it drives; brake lights before a
  // turn, a strobe on a taxiing plane. The mover mirrors the position for the row.
  place(g, time = 0) {
    const m = g.mesh, [x, z] = g.pos;
    m.position.set(x - W, 0, this.maze.rows - 1 - z);
    if (g.dir) m.rotation.y = g.dir[0] ? (g.dir[0] > 0 ? 0 : Math.PI) : (g.dir[1] > 0 ? Math.PI / 2 : -Math.PI / 2);
    g.mover.x = x - W;
    g.mover.z = -(this.maze.firstRow + z);
    const turning = g.next && g.dir && (g.next[0] !== g.dir[0] || g.next[1] !== g.dir[1]);
    const braking = !!turning && Math.abs(g.to[0] - x) + Math.abs(g.to[1] - z) < BRAKE_AT;
    if (braking !== g.braking) { g.braking = braking; setBrake(m, braking); }
    if (g.strobe) g.strobe.visible = (time * 2) % 1 < 0.15;
  }

  // A train ghost honks inside HORN_REACH of a player, oftener the closer it is.
  honk(dt) {
    for (const g of this.all) {
      if (g.dead > 0) continue;
      const p = this.nearest(g);
      if (!p) continue;
      const d = Math.hypot(g.pos[0] - (p.x + W), g.pos[1] - (p.row - this.maze.firstRow));
      if (d > HORN_REACH) continue;
      g.hornIn -= dt;
      if (g.hornIn > 0) continue;
      g.hornIn = lerp(HORN_GAP[0], HORN_GAP[1], d / HORN_REACH);
      sfx.toot();
      this.honks++;
    }
  }

  // True when a train ghost is within `reach` cells of (i, j): the gates read it.
  trainNear(i, j, reach) {
    return this.maze.kind === 'track' && this.all.some((g) => g.dead <= 0 && Math.hypot(g.pos[0] - i, g.pos[1] - j) <= reach);
  }

  update(dt, time) {
    const { world, maze } = this;
    this.clock += dt;
    this.scattering = this.clock % (SCATTER_EVERY + SCATTER_FOR) < SCATTER_FOR;
    for (const g of this.all) {
      if (g.dead > 0) { g.dead -= dt; if (g.dead <= 0) this.spawn(g); continue; }
      if (g.mover.wrecked) { this.gone(g); continue; }   // a star, a giant or a fireball: Lane.wreck has blown it up already
      g.grace -= dt;
      if (!world.frozen) this.step(g, dt);
    }
    // Two ghosts in one cell, both past their grace: both go up.
    const live = this.all.filter((g) => g.dead <= 0 && g.grace <= 0);
    for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) {
      const A = live[a], B = live[b];
      if (A.dead > 0 || B.dead > 0) continue;
      if (Math.hypot(A.pos[0] - B.pos[0], A.pos[1] - B.pos[1]) < TOUCH) { this.crash(A); this.crash(B); sfx.boom(1.4); }
    }
    // Each ghost is the mover of the row it is on this frame.
    for (let j = 0; j < maze.rows; j++) { const lane = world.rows.get(maze.firstRow + j); if (lane) lane.movers = []; }
    for (const g of this.all) {
      if (g.dead > 0) continue;
      this.place(g, time);
      world.rows.get(maze.firstRow + Math.round(g.pos[1]))?.movers.push(g.mover);
    }
    if (maze.kind === 'track') this.honk(dt);
  }
}
