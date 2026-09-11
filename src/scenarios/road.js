// Traffic lanes. Cars and trucks wrap around; touching one is fatal.
import { box, makeCar, makeTruck, makeFlatbed, makeHeadlightCone } from '../meshes.js';
import { registerDeath } from '../deaths.js';
import { CONE } from '../headlights.js';
import { W, GW } from '../lane.js';
import { rand, randInt, pick } from '../util.js';
import { traffic } from '../tuning.js';

registerDeath('hauled', { anim: 'flat', title: 'HAULED OFF', sfx: 'splat' });

// Lane compositions: usually one kind, sometimes a mix.
const MAKERS = { car: makeCar, truck: makeTruck, flatbed: makeFlatbed };
const COMPOSITIONS = [
  { kinds: ['car'], w: 5 }, { kinds: ['truck'], w: 2 }, { kinds: ['flatbed'], w: 0.5 },
  { kinds: ['car', 'truck'], w: 2 }, { kinds: ['car', 'truck', 'flatbed'], w: 1 },
];
function pickComposition() {
  let roll = Math.random() * COMPOSITIONS.reduce((a, c) => a + c.w, 0);
  for (const c of COMPOSITIONS) { roll -= c.w; if (roll <= 0) return c.kinds; }
  return ['car'];
}

export default {
  id: 'road',
  danger: true,
  weight: 4,
  band: [1, 4],
  build(lane, { prev, sky, difficulty, gauntlet }) {
    lane.ground(0x4a4a52);
    if (prev && prev.scenario.id === 'road') {
      for (let x = -GW / 2; x < GW / 2; x += 1.5) lane.add(box(0.7, 0.02, 0.1, 0xdedede, x, 0, 0.5, false));
    }
    lane.dir = pick(-1, 1);
    const tr = traffic(difficulty + lane.r / 120);
    lane.speed = rand(2, 4) * tr.speed;
    const kinds = pickComposition();
    lane.spawnSpaced(randInt(...tr.count), () => MAKERS[pick(...kinds)](), tr);
    if (sky.headlights) for (const m of lane.movers) m.mesh.add(makeHeadlightCone(m.len * CONE));
    if (Math.random() < 0.3) lane.coin(randInt(-W + 1, W - 1));
    if (gauntlet) lane.bonusDrop();
  },
  update(lane, dt) { lane.advance(dt); },
  lethalAt(lane, x) {
    const m = lane.moverAt(x, 0.35);
    if (!m || lane.onBed(m, x)) return null;
    return lane.rearOf(m, x) ? 'bounce' : 'car';
  },
  onLand(lane, player) {
    const m = lane.moverAt(player.x, 0.35);
    if (m && lane.onBed(m, player.x)) player.carrier = m;
    return null;
  },
};
