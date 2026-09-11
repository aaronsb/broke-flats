// Checkered finish line. Landing on it ends the crossing stage.
import { makeCheckerTile, makeFlag } from '../meshes.js';
import { W } from '../lane.js';

export default {
  id: 'finish',
  danger: false,
  weight: 0,
  band: [1, 1],
  build(lane, { world }) {
    lane.terrain();
    lane.edges();
    for (let c = -W; c <= W; c++) lane.add(makeCheckerTile(c + W), c);
    lane.add(makeFlag(0xe0473a), -W - 1);
    lane.add(makeFlag(0xe0473a), W + 1);
    lane.data.world = world;
  },
  onLand(lane) { lane.data.world.onFinish?.(); return null; },
};
