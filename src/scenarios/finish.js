// Checkered finish line. Landing on it ends the crossing stage. The district's
// leaving sign stands just past it, leaning back so it reads from above.
import { makeCheckerTile, makeFlag, makeDistrictSign } from '../meshes.js';
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
    const d = world.config.district;
    if (d) lane.add(makeDistrictSign(['NOW LEAVING', d.name, d.leave]), 0).position.z = -1.1;
    lane.data.world = world;
  },
  onLand(lane) { lane.data.world.onFinish?.(); return null; },
};
