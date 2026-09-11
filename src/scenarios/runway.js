// Runway rows: planes cross like traffic. Taxiing planes crawl on the ground,
// take-offs accelerate and lift in the second half of the row, landings drop
// in from height and roll out. A plane only kills while it is on or near the
// ground, so a lifting or descending one passes overhead (watch its shadow).
import { box, makePlane, makeHeadlightCone } from '../meshes.js';
import { W, SPAN, GW } from '../lane.js';
import { registerDeath } from '../deaths.js';
import { CONE } from '../headlights.js';
import { rand, randInt, pick } from '../util.js';
import { sfx } from '../sfx.js';

registerDeath('plane', { anim: 'flat', title: 'FLATTENED', sfx: 'splat' });

const CLIMB = 4;          // height reached at the end of the row
const LETHAL_BELOW = 1.0; // plane height under which it can hit you

const COMPOSITIONS = [
  { kinds: ['taxi'], w: 3 }, { kinds: ['takeoff'], w: 2 }, { kinds: ['landing'], w: 2 },
  { kinds: ['taxi', 'takeoff', 'landing'], w: 2 },
];
function pickComposition() {
  let roll = Math.random() * COMPOSITIONS.reduce((a, c) => a + c.w, 0);
  for (const c of COMPOSITIONS) { roll -= c.w; if (roll <= 0) return c.kinds; }
  return ['taxi'];
}

// Progress 0..1 along the row in the direction of travel.
const progress = (lane, m) => (m.x * lane.dir + SPAN) / (2 * SPAN);

function profile(kind, p) {
  if (kind === 'takeoff') return { y: p < 0.5 ? 0 : ((p - 0.5) * 2) ** 2 * CLIMB, speed: 1 + p * 1.6 };
  if (kind === 'landing') return { y: p < 0.5 ? ((0.5 - p) * 2) ** 2 * CLIMB : 0, speed: 1.6 - p * 0.9 };
  return { y: 0, speed: 0.45 };
}

const EDGE_LIGHT = new (class { constructor() { this.blue = 0x66a8ff; this.white = 0xfff6c8; } })();

export default {
  id: 'runway',
  danger: true,
  weight: 2,
  band: [1, 3],
  build(lane, { prev, sky, difficulty }) {
    lane.ground(0x3e3e46);
    for (let x = -GW / 2; x < GW / 2; x += 2) lane.add(box(1.1, 0.02, 0.12, 0xe8e8e8, x, 0, 0, false));   // centreline
    if (!prev || prev.scenario.id !== 'runway') {
      for (let x = -GW / 2; x < GW / 2; x += 2.5) lane.add(box(0.14, 0.1, 0.14, EDGE_LIGHT.blue, x, 0, 0.47, false));
    }
    lane.dir = pick(-1, 1);
    lane.speed = rand(2.5, 4) + Math.min(3, difficulty + lane.r / 80);
    const kinds = pickComposition();
    lane.spawnMovers(randInt(2, 3), () => {
      const m = makePlane();
      m.kind = pick(...kinds);
      m.y = 0;
      if (sky.headlights) for (const dz of [-1.15, 1.15]) m.mesh.add(makeHeadlightCone(m.len * CONE, m.len * CONE / 2 + 0.2, 0.15, dz, 0.5));
      return m;
    }, 0.6);
  },

  update(lane, dt) {
    const near = Math.abs(lane.r - (lane.world?.focusRow ?? lane.r)) <= 7;
    for (const m of lane.movers) {
      const p = progress(lane, m);
      const { y, speed } = profile(m.kind, p);
      // Whoosh at the moment of lift-off or touchdown, if the row is close enough to hear.
      if (m.kind !== 'taxi' && m.prevP !== undefined && m.prevP < 0.5 && p >= 0.5 && near) sfx.jet(m.kind === 'takeoff');
      m.prevP = p;
      m.y = y;
      m.x += lane.dir * lane.speed * speed * dt;
      if (m.x > SPAN) m.x -= 2 * SPAN;
      if (m.x < -SPAN) m.x += 2 * SPAN;
      m.mesh.position.set(m.x, y, 0);
      m.mesh.rotation.z = lane.dir * (m.kind === 'takeoff' ? -0.25 : m.kind === 'landing' ? 0.18 : 0) * (y > 0.05 ? 1 : 0);
    }
  },

  lethalAt(lane, x) {
    const m = lane.moverAt(x, 0.35);
    return m && m.y < LETHAL_BELOW ? 'plane' : null;
  },
};
