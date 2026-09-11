// Tree maze with coins. Umbrella canopies hide a coin from straight above.
import { makeTree, makeUmbrellaTree } from '../meshes.js';
import { W } from '../lane.js';
import { randInt, pick, clamp } from '../util.js';

export default {
  id: 'grass',
  danger: false,
  weight: 3,
  band: [1, 3],
  build(lane, { world }) {
    lane.ground(lane.r % 2 ? 0x9ad24a : 0x8fca43);
    lane.forestEdges();
    world.pathCol = clamp(world.pathCol + randInt(-1, 1), -W + 1, W - 1);

    let shade = null;
    if (Math.random() < 0.45) {
      const c = randInt(-W + 2, W - 2);
      if (c !== world.pathCol) {
        shade = c;
        lane.add(makeUmbrellaTree(), c);
        lane.block(c);
        // Under the canopy only, so the egg is never visible from straight above.
        const cc = c + pick(-1, 1);
        if (Math.random() < 0.4) lane.egg(cc); else lane.coin(cc);
      }
    }
    for (let c = -W; c <= W; c++) {
      if (c === world.pathCol) continue;
      if (shade !== null && Math.abs(c - shade) <= 1) continue;
      if (Math.random() < 0.22) { lane.add(makeTree(), c); lane.block(c); }
      else if (Math.random() < 0.04) lane.coin(c);
    }
  },
};
