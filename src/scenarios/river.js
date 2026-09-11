// Water with drifting logs. Land on a log and it carries you; miss and you sink.
import { makeLog } from '../meshes.js';
import { rand, randInt, pick } from '../util.js';

export default {
  id: 'river',
  danger: true,
  weight: 2,
  band: [1, 3],
  build(lane) {
    lane.ground(0x3f8fd6, -0.3, 0.2);
    lane.dir = pick(-1, 1);
    lane.speed = rand(1.2, 2.4) + Math.min(1.5, lane.r / 100);
    lane.spawnMovers(randInt(2, 3), () => { const len = randInt(2, 4); return { mesh: makeLog(len), len }; }, 0.3);
    for (const m of lane.movers) if (Math.random() < 0.3) lane.moverCoin(m);
  },
  update(lane, dt) { lane.advance(dt); },
  onLand(lane, player) {
    const log = lane.moverAt(player.x, 0.3);
    if (!log) return 'water';
    player.carrier = log;
    return null;
  },
};
