// Barrier rows: a wall across the strip with no open gap. One cell is the
// weakness, passable for everyone, and from above it looks like its
// neighbours: only the tilted view shows the way through. Each variant is its
// own scenario id, built here from one table, and they share a spawn gap
// (`family`) and a taste for sitting next to a road (`follows`).
import { makeHedge, makeTunnel, makeTreeWall, makeBusShelter, makeBus, makePicket, makeChainlink, makeWall, makeParkedCar } from '../meshes.js';
import { W } from '../lane.js';
import { randInt } from '../util.js';

const APART = 4;         // columns between the two weaknesses of a double band
const DOUBLE_LEVEL = 3;  // from here a band may hold two barrier rows around an open corridor
const DOUBLE_CHANCE = 0.5;

// The weak column: any inner cell (or one of `cands`), at least APART from
// `avoid` when a previous row in the band already set one.
function chooseWeak(avoid, cands = null) {
  const pool = (cands ?? Array.from({ length: 2 * W - 1 }, (_, i) => i - W + 1)).filter((c) => avoid === null || Math.abs(c - avoid) >= APART);
  return pool[randInt(0, pool.length - 1)];
}

// One mesh per cell: the weak one gets the `weak` build, the rest block with `kind`.
const perCell = (make, kind) => (lane, avoid) => {
  const weak = chooseWeak(avoid);
  for (let c = -W; c <= W; c++) {
    lane.add(make(c === weak), c);
    if (c !== weak) lane.block(c, kind);
  }
  return weak;
};

// Shelters every fourth cell with a bus parked between; leftover cells at the
// ends take a parked car. The weakness is a shelter with no back wall.
function busStop(lane, avoid) {
  const off = randInt(0, 3);
  const shelters = [];
  for (let c = -W; c <= W; c++) if ((c - off) % 4 === 0) shelters.push(c);
  const weak = chooseWeak(avoid, shelters.filter((c) => Math.abs(c) < W));
  for (const c of shelters) { lane.add(makeBusShelter(c === weak), c); if (c !== weak) lane.block(c, 'solid'); }
  let c = -W;
  while (c <= W) {
    if (shelters.includes(c)) { c++; continue; }
    let n = 0;
    while (c + n <= W && !shelters.includes(c + n)) n++;
    if (n === 3) lane.add(makeBus(3), c + 1);
    else for (let i = 0; i < n; i++) lane.add(makeParkedCar(), c + i);
    for (let i = 0; i < n; i++) lane.block(c + i, 'solid');
    c += n;
  }
  return weak;
}

// id → fill(lane, avoid) returning the weak column.
const VARIANTS = {
  hedge:     perCell((weak) => (weak ? makeTunnel() : makeHedge()), 'bush'),   // the pig pushes through the rest
  trees:     perCell(makeTreeWall, 'solid'),
  busStop,
  picket:    perCell(makePicket, 'fence'),      // the chicken hops any board
  chainlink: perCell(makeChainlink, 'fence'),
  wall:      perCell(makeWall, 'solid'),
};

function barrier(id, fill) {
  return {
    id,
    danger: false,
    weight: 1,
    family: 'barrier',
    follows: 'road',
    band: (level) => (level >= DOUBLE_LEVEL && Math.random() < DOUBLE_CHANCE ? [3, 3] : [1, 1]),
    pad: 'meadow',     // open rows either side keep every column reachable
    minGap: 6,
    build(lane, { world, index, count }) {
      lane.terrain();
      lane.edges();
      // The corridor between two barrier rows: open, with a coin for the detour.
      if (count === 3 && index === 1) { lane.coin(chooseWeak(null)); return; }
      const weak = fill(lane, count === 3 && index === 2 ? world.pathCol : null);
      lane.data.weak = weak;
      lane.data.hidden = true;            // the way through only shows from the side
      world.pathCol = weak;
    },
  };
}

export const BARRIERS = Object.fromEntries(Object.entries(VARIANTS).map(([id, fill]) => [id, barrier(id, fill)]));
export const BARRIER_IDS = Object.keys(BARRIERS);
