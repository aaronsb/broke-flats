// Traffic lanes. Cars and trucks wrap around; touching one is fatal.
import { box, makeCar, makeTruck, makeFlatbed, makeHeadlightCone } from '../meshes.js';
import { registerDeath } from '../deaths.js';
import { CONE } from '../headlights.js';
import { W, GW } from '../lane.js';
import { rand, randInt, pick } from '../util.js';

registerDeath('hauled', { anim: 'squash', title: 'HAULED OFF', sfx: 'splat' });

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

// World-space bed span of a flatbed, accounting for its heading.
function onBed(lane, m, x) {
  if (!m.bed) return false;
  const a = m.x + lane.dir * m.bed[0], b = m.x + lane.dir * m.bed[1];
  return x > Math.min(a, b) + 0.1 && x < Math.max(a, b) - 0.1;
}

export default {
  id: 'road',
  danger: true,
  weight: 4,
  band: [1, 4],
  build(lane, { prev, sky, difficulty }) {
    lane.ground(0x4a4a52);
    if (prev && prev.scenario.id === 'road') {
      for (let x = -GW / 2; x < GW / 2; x += 1.5) lane.add(box(0.7, 0.02, 0.1, 0xdedede, x, 0, 0.5, false));
    }
    lane.dir = pick(-1, 1);
    lane.speed = rand(2, 4.5) + Math.min(3, difficulty + lane.r / 80);
    const kinds = pickComposition();
    lane.spawnMovers(randInt(2, 4), () => MAKERS[pick(...kinds)]());
    if (sky.headlights) for (const m of lane.movers) m.mesh.add(makeHeadlightCone(m.len * CONE));
    if (Math.random() < 0.3) lane.coin(randInt(-W + 1, W - 1));
  },
  update(lane, dt) { lane.advance(dt); },
  lethalAt(lane, x) {
    const m = lane.moverAt(x, 0.35);
    return m && !onBed(lane, m, x) ? 'car' : null;
  },
  onLand(lane, player) {
    const m = lane.moverAt(player.x, 0.35);
    if (m && onBed(lane, m, player.x)) player.carrier = m;
    return null;
  },
};
