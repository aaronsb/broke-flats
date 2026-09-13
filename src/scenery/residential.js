// Fenced yards with tetromino-footprint houses beyond the strip.
import { makeFence, makeShrub, makeTree, makeBuildingCell, buildingStyle, makeCanopy, makeParkedCar,
  makePorch, makeCarport, makeStand } from '../meshes.js';
import { W } from '../lane.js';
import { pick } from '../util.js';
import { Footprints } from './footprints.js';

export default {
  id: 'residential',
  ground(lane) { lane.ground(lane.r % 2 ? 0x9ad24a : 0x8fca43); },
  edge(lane, world) {
    const fp = (world.data.footprints ??= new Footprints());
    const lit = !!world.config.sky?.dark;
    for (const s of [-1, 1]) {
      lane.add(makeFence('z'), s * (W + 1));         // property line down the column
      const [a, b] = s < 0 ? [-W - 7, -W - 2] : [W + 2, W + 7];
      if (!fp.occupied(lane.r, a, b) && Math.random() < 0.5) fp.plan(lane.r, a, b, buildingStyle('house', lit));
      if (Math.random() < 0.3) lane.add(makeTree(true), s * (W + 7.5));
    }
    for (const cell of fp.take(lane.r)) lane.add(makeBuildingCell({ ...cell.style, lift: cell.lift }, cell.x < 0 ? 1 : -1), cell.x);
  },
  obstacle: () => (Math.random() < 0.5 ? makeFence(Math.random() < 0.5 ? 'x' : 'z') : makeShrub()),
  shelter: () => makeCanopy(makeParkedCar(), pick(0x8b3a2f, 0x4a4a55)),
  overhang: () => {
    const roll = Math.random();
    if (roll < 0.45) return makePorch();
    if (roll < 0.8) return makeCarport(pick(0x8b3a2f, 0x4a4a55, 0x6b4a2f));
    return makeStand();            // a farm stand at the end of the drive
  },
};
