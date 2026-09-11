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
import { traffic, kindsFor, mixesAllowed } from '../tuning.js';

registerDeath('plane', { anim: 'flat', title: 'FLATTENED', sfx: 'splat' });
registerDeath('flown', { anim: 'launch', title: 'FLOWN OFF', sfx: 'splat' });

const CLIMB = 4;          // height reached at the end of the row
const LETHAL_BELOW = 1.0; // plane height under which it can hit you

const WEIGHT = { taxi: 3, takeoff: 2, landing: 2 };
function pickComposition(level) {
  const kinds = kindsFor('runway', level);
  if (mixesAllowed(level) && kinds.length > 1 && Math.random() < 0.3) return kinds;
  let roll = Math.random() * kinds.reduce((a, k) => a + WEIGHT[k], 0);
  for (const k of kinds) { roll -= WEIGHT[k]; if (roll <= 0) return [k]; }
  return [kinds[0]];
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
  band: [1, 1],     // one row per band, and never within two rows of another: wings must not touch
  minGap: 3,
  keepGap: true,    // even when forced or in a gauntlet
  flank: ['meadow', 'road', 'road', 'river'],   // wings need flat rows either side
  build(lane, { prev, sky, difficulty, gauntlet, level }) {
    lane.ground(0x3e3e46);
    for (let x = -GW / 2; x < GW / 2; x += 2) lane.add(box(1.1, 0.02, 0.12, 0xe8e8e8, x, 0, 0, false));   // centreline
    if (!prev || prev.scenario.id !== 'runway') {
      for (let x = -GW / 2; x < GW / 2; x += 2.5) lane.add(box(0.14, 0.1, 0.14, EDGE_LIGHT.blue, x, 0, 0.47, false));
    }
    lane.dir = pick(-1, 1);
    const tr = traffic(difficulty + lane.r / 120);
    lane.speed = rand(2.5, 3.5) * tr.speed;
    const kinds = pickComposition(level);
    lane.spawnMovers(Math.min(3, randInt(...tr.count)), () => {
      const m = makePlane();
      m.kind = pick(...kinds);
      m.y = 0;
      m.wing = true;                 // ridable from the rows either side
      m.offCause = 'flown';
      if (sky.headlights) for (const dz of [-1.15, 1.15]) m.mesh.add(makeHeadlightCone(m.len * CONE, m.len * CONE / 2 + 0.2, 0.15, dz, 0.5));
      return m;
    }, 0.6);
    if (gauntlet) lane.bonusDrop();
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
      m.v = speed;
    }
    // No overrunning on the ground: a plane closing on the one ahead matches its
    // speed. Anything airborne may pass over.
    const ordered = [...lane.movers].sort((a, b) => a.x * lane.dir - b.x * lane.dir);
    for (let i = 0; i < ordered.length; i++) {
      const m = ordered[i], ahead = ordered[(i + 1) % ordered.length];
      if (ordered.length > 1 && m.y < 1 && ahead.y < 1) {
        let gap = (ahead.x - m.x) * lane.dir - (ahead.len + m.len) / 2;
        if (i === ordered.length - 1) gap += 2 * SPAN;
        if (gap < 1.2) m.v = Math.min(m.v, ahead.v);
      }
    }
    for (const m of lane.movers) {
      const y = m.y;
      m.x += lane.dir * lane.speed * m.v * dt;
      if (m.x > SPAN) m.x -= 2 * SPAN;
      if (m.x < -SPAN) m.x += 2 * SPAN;
      m.mesh.position.set(m.x, y, 0);
      m.mesh.rotation.z = lane.dir * (m.kind === 'takeoff' ? -0.25 : m.kind === 'landing' ? 0.18 : 0) * (y > 0.05 ? 1 : 0);
    }
  },

  lethalAt(lane, x) {
    const m = lane.moverAt(x, 0.35);
    if (!m || m.y >= LETHAL_BELOW) return null;
    return lane.rearOf(m, x) ? 'bounce' : 'plane';
  },
};
