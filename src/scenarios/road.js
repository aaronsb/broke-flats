// Traffic lanes. Cars and trucks wrap around; touching one is fatal.
import { box, makeCar, makeTruck, makeFlatbed, makeHeadlightCone, makeTire } from '../meshes.js';
import { sfx } from '../sfx.js';
import { registerDeath } from '../deaths.js';
import { CONE } from '../headlights.js';
import { W, DETAIL_W } from '../lane.js';
import { rand, randInt, pick } from '../util.js';
import { traffic, kindsFor, mixesAllowed } from '../tuning.js';

const TIRE_HOLD = 2.5;   // seconds traffic stops for a thrown tire before running it over

registerDeath('hauled', { anim: 'flat', title: 'HAULED OFF', sfx: 'splat', squash: 2.4 });

// Lane compositions: usually one kind, sometimes a mix once the level allows it.
const MAKERS = { car: makeCar, truck: makeTruck, flatbed: makeFlatbed };
const WEIGHT = { car: 5, truck: 2, flatbed: 0.5 };
function pickComposition(level) {
  const kinds = kindsFor('road', level);
  if (mixesAllowed(level) && kinds.length > 1 && Math.random() < 0.28) return kinds;
  let roll = Math.random() * kinds.reduce((a, k) => a + WEIGHT[k], 0);
  for (const k of kinds) { roll -= WEIGHT[k]; if (roll <= 0) return [k]; }
  return [kinds[0]];
}

export default {
  id: 'road',
  danger: true,
  weight: 4,
  band: [1, 4],
  build(lane, { prev, sky, difficulty, gauntlet, level }) {
    lane.ground(0x4a4a52);
    if (prev && prev.scenario.id === 'road') {
      for (let x = -DETAIL_W / 2; x < DETAIL_W / 2; x += 1.5) lane.add(box(0.7, 0.02, 0.1, 0xdedede, x, 0, 0.5, false));
    }
    lane.dir = pick(-1, 1);
    lane.halts = true;
    const tr = traffic(difficulty + lane.r / 120);
    lane.speed = rand(2, 4) * tr.speed;
    const kinds = pickComposition(level);
    lane.spawnSpaced(randInt(...tr.count), () => MAKERS[pick(...kinds)](), tr);
    if (sky.headlights) for (const m of lane.movers) m.mesh.add(makeHeadlightCone(m.len * CONE));
    if (Math.random() < 0.3) lane.coin(randInt(-W + 1, W - 1));
    if (gauntlet) lane.bonusDrop();
  },
  update(lane, dt) {
    lane.advance(dt);
    // A thrown tire holds the traffic for TIRE_HOLD (the mode lists it as a
    // blocker, like a procession), then the next vehicle to reach it runs it over.
    for (const [c, tire] of lane.data.tires ?? []) {
      tire.hold -= dt;
      if (tire.hold > 0 || !lane.moverAt(c, 0.45)) continue;
      lane.group.remove(tire.mesh);
      lane.data.tires.delete(c);
      sfx.bump();
    }
  },

  // A thrown rock lands a tire in the lane; a vehicle already on the cell takes the rock instead.
  onThrow(lane, c) {
    if (lane.moverAt(c, 0.8) || lane.data.tires?.has(c)) return false;
    (lane.data.tires ??= new Map()).set(c, { mesh: lane.add(makeTire(), c), hold: TIRE_HOLD });
    sfx.kathunk();
    return true;
  },
  lethalAt(lane, x, player) {
    const m = lane.moverAt(x, 0.35);
    if (!m || lane.onBed(m, x)) return null;
    return lane.rearOf(m, x) || lane.riding(m, player) ? 'bounce' : 'car';
  },
  onLand(lane, player) {
    const m = lane.moverAt(player.x, 0.35);
    if (m && lane.onBed(m, player.x)) player.carrier = m;
    return null;
  },
};
