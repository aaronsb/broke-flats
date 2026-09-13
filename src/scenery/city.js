// Pavement with tetromino-footprint buildings; windows light up at night.
// The column just off the strip is street level — shops and market stalls —
// with the blocks planned behind it.
import { makeDumpster, makePlanter, makeBench, makeBuildingCell, buildingStyle, makeCanopy,
  makeShopfront, makeStand, makeBuildingOverhang } from '../meshes.js';
import { W } from '../lane.js';
import { Footprints } from './footprints.js';

export default {
  id: 'city',
  ground(lane) { lane.ground(lane.r % 2 ? 0xa9a9ad : 0x9e9ea3); },
  edge(lane, world) {
    const fp = (world.data.footprints ??= new Footprints());
    const lit = !!world.config.sky?.dark;
    for (const s of [-1, 1]) {
      const [a, b] = s < 0 ? [-W - 7, -W - 2] : [W + 2, W + 7];
      const planned = !fp.occupied(lane.r, a, b) && Math.random() < 0.7 && fp.plan(lane.r, a, b, buildingStyle('tower', lit));
      // A shop at the kerb where no block was raised this row, so the street
      // reads as shopfronts punctuating the blocks rather than one long parade
      // of awnings down the edge of the board.
      if (!planned && Math.random() < 0.35) {
        const shop = Math.random() < 0.6 ? makeShopfront(lit) : makeStand();
        shop.rotation.y = -s * Math.PI / 2;            // turned to face in across the street, as the blocks are
        lane.add(shop, s * (W + 1));
      }
    }
    for (const cell of fp.take(lane.r)) lane.add(makeBuildingCell({ ...cell.style, lift: cell.lift }, cell.x < 0 ? 1 : -1), cell.x);
  },
  obstacle: () => (Math.random() < 0.5 ? makeDumpster() : makePlanter()),
  shelter: () => makeCanopy(makeBench(), 0x3a6ea5),
  overhang: (lane) => {
    const lit = !!lane.world?.config?.sky?.dark;
    const roll = Math.random();
    if (roll < 0.4) return makeShopfront(lit);
    if (roll < 0.7) return makeStand();
    return makeBuildingOverhang(lit);
  },
};
