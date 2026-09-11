// Traffic lanes. Cars and trucks wrap around; touching one is fatal.
import { box, makeCar, makeTruck } from '../meshes.js';
import { W, GW } from '../lane.js';
import { rand, randInt, pick } from '../util.js';

export default {
  id: 'road',
  danger: true,
  weight: 4,
  band: [1, 4],
  build(lane, { prev }) {
    lane.ground(0x4a4a52);
    if (prev && prev.scenario.id === 'road') {
      for (let x = -GW / 2; x < GW / 2; x += 1.5) lane.add(box(0.7, 0.02, 0.1, 0xdedede, x, 0, 0.5, false));
    }
    lane.dir = pick(-1, 1);
    lane.speed = rand(2, 4.5) + Math.min(3, lane.r / 60);
    lane.spawnMovers(randInt(2, 4), () => (Math.random() < 0.3 ? makeTruck() : makeCar()));
    if (Math.random() < 0.3) lane.coin(randInt(-W + 1, W - 1));
  },
  update(lane, dt) { lane.advance(dt); },
  lethalAt(lane, x) { return lane.moverAt(x, 0.35) ? 'car' : null; },
};
