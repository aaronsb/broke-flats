// Hunting maze: scenery obstacles with coins, and three-wide shelters whose
// side bays hide a coin or egg from straight above.
import { W } from '../lane.js';
import { randInt, pick, clamp } from '../util.js';

export default {
  id: 'grass',
  danger: false,
  weight: 3,
  band: [1, 3],
  build(lane, { world }) {
    lane.terrain();
    lane.edges();
    const scenery = lane.scenery;
    world.pathCol = clamp(world.pathCol + randInt(-1, 1), -W + 1, W - 1);

    let shade = null;
    if (Math.random() < 0.45) {
      const c = randInt(-W + 2, W - 2);
      if (c !== world.pathCol) {
        shade = c;
        lane.add(scenery.shelter(), c);
        lane.block(c);
        // Under the canopy only, so the egg is never visible from straight above.
        const cc = c + pick(-1, 1);
        if (Math.random() < 0.4) lane.egg(cc); else lane.coin(cc);
        lane.data.hidden = true;        // something under a roof: worth a peek
      }
    }
    for (let c = -W; c <= W; c++) {
      if (c === world.pathCol) continue;
      if (shade !== null && Math.abs(c - shade) <= 1) continue;
      if (Math.random() < 0.22) { lane.add(scenery.obstacle(), c); lane.block(c); }
      else if (Math.random() < 0.04) lane.coin(c);
    }
  },
};
