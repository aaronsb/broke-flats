// Water with drifting logs. Land on a log and it carries you; miss and you sink.
import { makeLog, makeFirefly } from '../meshes.js';
import { W } from '../lane.js';
import { rand, randInt, pick } from '../util.js';

export default {
  id: 'river',
  danger: true,
  weight: 2,
  band: [1, 3],
  build(lane, { sky, difficulty }) {
    lane.ground(0x3f8fd6, -0.3, 0.2);
    lane.dir = pick(-1, 1);
    lane.speed = rand(1.2, 2.4) + Math.min(1.5, difficulty * 0.4 + lane.r / 120);
    lane.spawnMovers(randInt(2, 3), () => { const len = randInt(2, 4); return { mesh: makeLog(len), len }; }, 0.3);
    for (const m of lane.movers) if (Math.random() < 0.3) lane.moverCoin(m);
    if (sky.dark) {
      lane.data.flies = [];
      for (let i = 0; i < 6; i++) {
        const f = lane.add(makeFirefly(), rand(-W, W));
        f.position.y = rand(0.3, 0.9);
        lane.data.flies.push({ mesh: f, phase: rand(0, 6.28), speed: rand(0.6, 1.4) });
      }
    }
  },
  update(lane, dt, time) {
    lane.advance(dt);
    if (lane.data.flies) for (const f of lane.data.flies) {
      f.mesh.position.x += Math.sin(time * f.speed + f.phase) * dt * 1.5;
      f.mesh.position.y = 0.5 + Math.sin(time * 2 * f.speed + f.phase) * 0.3;
      f.mesh.visible = Math.sin(time * 3 + f.phase) > -0.6;
    }
  },
  onLand(lane, player) {
    const log = lane.moverAt(player.x, 0.3);
    if (!log) return 'water';
    player.carrier = log;
    return null;
  },
};
