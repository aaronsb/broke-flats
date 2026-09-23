// The town map: one per run, seeded, so continues keep it and a new run
// deals a new one. A Plinko board of districts: MAP_ROWS rows of spots at
// alternating positions across MAP_W, entered at the bottom middle. From a
// spot the way on is up-left or up-right; a share of spots lose one of the
// two, so some routes are forced and the board reads as a maze. Each spot is
// a district (look, hazard mix, battle), and some are gauntlets. Past the top
// row the run turns a page: a fresh board, seeded from the run's, entered
// where the last one was left.
import { LEVELS } from './levels.js';

export const MAP_W = 7;          // spot positions across
export const MAP_ROWS = 6;       // rows per page
const ONE_WAY = 0.35;            // spots that keep only one of their two exits
const GAUNTLET_SHARE = 0.15;     // spots above the first row that are gauntlets
// The gauntlets a spot can be, weighted by repetition.
const GAUNTLETS = ['snake', 'snake', 'maze', 'mines', 'road', 'river', 'runway', 'rail'];

// mulberry32: a small seeded generator, enough for a board.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const newSeed = () => (Math.random() * 2 ** 32) >>> 0;

// Spot positions on row r: alternate parity so the lattice is a diamond grid.
const positions = (r, entry) => {
  const parity = (entry + r) % 2;
  const out = [];
  for (let p = parity; p < MAP_W; p += 2) out.push(p);
  return out;
};

// One page: { seed, page, entry, rows: [[spot]] }, a spot { r, p, district, gauntlet, exits: [p] }.
// The first page's first spot is Pine Hollow with no gauntlet, so every run opens the same way.
export function makePage(seed, page = 0, entry = (MAP_W - 1) / 2) {
  const rand = rng(seed + page * 7919);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const rows = [];
  for (let r = 0; r < MAP_ROWS; r++) {
    const ps = r === 0 ? [entry] : positions(r, entry);
    rows.push(ps.map((p) => ({ r, p, district: 0, gauntlet: null, exits: [] })));
  }
  for (let r = 0; r < MAP_ROWS; r++) {
    for (const s of rows[r]) {
      // Neighbouring spots differ in district where they can.
      const below = r ? rows[r - 1].filter((b) => Math.abs(b.p - s.p) === 1).map((b) => b.district) : [];
      const pool = [...LEVELS.keys()].filter((d) => !below.includes(d));
      s.district = page === 0 && r === 0 ? 0 : pick(pool.length ? pool : [...LEVELS.keys()]);
      if (r > 0 && rand() < GAUNTLET_SHARE) s.gauntlet = pick(GAUNTLETS);
      if (r === MAP_ROWS - 1) { s.exits = [s.p - 1, s.p + 1].filter((p) => p >= 0 && p < MAP_W); continue; }
      const up = rows[r + 1].map((u) => u.p);
      let exits = [s.p - 1, s.p + 1].filter((p) => up.includes(p));
      if (exits.length === 2 && rand() < ONE_WAY) exits = [pick(exits)];
      s.exits = exits;
    }
  }
  // Only spots a route reaches stay on the board: the edges of the lower rows
  // and the spots one-way exits pass by are dropped.
  const reached = new Set([`0,${entry}`]);
  for (let r = 0; r < MAP_ROWS - 1; r++) for (const s of rows[r]) if (reached.has(`${r},${s.p}`)) for (const p of s.exits) reached.add(`${r + 1},${p}`);
  for (let r = 0; r < MAP_ROWS; r++) rows[r] = rows[r].filter((s) => reached.has(`${r},${s.p}`));
  return { seed, page, entry, rows };
}

export const spotAt = (map, r, p) => map.rows[r]?.find((s) => s.p === p) ?? null;
