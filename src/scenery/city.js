// Pavement with tetromino-footprint buildings; windows light up at night.
import { makeDumpster, makePlanter, makeBench, makeBuildingCell, buildingStyle, makeCanopy } from '../meshes.js';
import { W } from '../lane.js';
import { Footprints } from './footprints.js';

export default {
  id: 'city',
  ground(lane) { lane.ground(lane.r % 2 ? 0xa9a9ad : 0x9e9ea3); },
  edge(lane, world) {
    const fp = (world.data.footprints ??= new Footprints());
    const lit = !!world.config.sky?.dark;
    for (const s of [-1, 1]) {
      const [a, b] = s < 0 ? [-W - 7, -W - 1] : [W + 1, W + 7];
      if (!fp.occupied(lane.r, a, b) && Math.random() < 0.7) fp.plan(lane.r, a, b, buildingStyle('tower', lit));
    }
    for (const cell of fp.take(lane.r)) lane.add(makeBuildingCell(cell.style, cell.x < 0 ? 1 : -1), cell.x);
  },
  obstacle: () => (Math.random() < 0.5 ? makeDumpster() : makePlanter()),
  shelter: () => makeCanopy(makeBench(), 0x3a6ea5),
};
