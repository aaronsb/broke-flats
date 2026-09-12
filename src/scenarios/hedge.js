// A wall with one visible gap and one hidden tunnel. The tunnel roof matches
// the hedge from above; only the tilted view shows the opening. Both are
// placed at random and kept apart so the tunnel is a real shortcut.
import { makeHedge, makeTunnel } from '../meshes.js';
import { W } from '../lane.js';
import { randInt } from '../util.js';

export default {
  id: 'hedge',
  danger: false,
  weight: 1,
  band: [1, 1],
  pad: 'meadow',     // treeless rows either side keep every column reachable
  minGap: 14,
  build(lane, { world }) {
    lane.terrain();
    lane.edges();
    const tunnel = randInt(-W + 1, W - 1);
    let gap;
    do gap = randInt(-W, W); while (Math.abs(gap - tunnel) < 6);
    world.pathCol = tunnel;
    lane.data.hidden = true;            // the tunnel only shows from the side
    for (let c = -W; c <= W; c++) {
      if (c === gap) continue;
      lane.add(c === tunnel ? makeTunnel() : makeHedge(), c);
      if (c !== tunnel) lane.block(c, 'bush');   // a bushes player pushes through; the tunnel is for everyone
    }
  },
};
