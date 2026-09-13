// Water with things to ride: logs, flat boats, submarines and alligators.
// Divers (some logs, every sub, some gators) submerge on a cycle and drown
// whoever is aboard. Gator heads bite, and gape between bites. A row holding
// gators turns around now and then. Foam flecks drift on the surface.
import { makeLog, makeRiverBoat, makeSub, makeGator, makeFirefly, makeFleck } from '../meshes.js';
import { setFrame } from '../characters.js';
import { W, SPAN, VIEW } from '../lane.js';
import { registerDeath } from '../deaths.js';
import { rand, randInt, pick, damp } from '../util.js';
import { traffic, kindsFor, mixesAllowed } from '../tuning.js';

registerDeath('chomped', { anim: 'flat', title: 'CHOMP', sfx: 'crack' });
registerDeath('rundown', { anim: 'sink', title: 'RUN DOWN', sfx: 'splash' });
export const SWIM_Y = -0.5;   // afloat: legs under the surface

// Lane compositions. One kind per lane is the norm; mixes are rarer.
const KINDS = {
  log:   () => { const len = randInt(2, 4); return { mesh: makeLog(len), len, bed: [-len / 2, len / 2], rideY: 0, offCause: 'water' }; },
  boat:  () => makeRiverBoat(),
  sub:   () => makeSub(),
  gator: () => makeGator(),
};
const WEIGHT = { log: 4, boat: 2, gator: 2, sub: 1 };
const DIVE_CHANCE = { log: 0.35, sub: 1, gator: 0.4, boat: 0 };
// Gators gape between bites: jaws open for GAPE_OPEN of a GAPE_PERIOD cycle.
const GAPE_PERIOD = [2.4, 4.2];
const GAPE_OPEN = [0.5, 1.1];
// A row with gators in it elects a new heading every TURN_SLACK crossings —
// one crossing being the time a gator takes to enter one edge and leave the
// far one — and keeps the heading it has TURN_HOLD of the time.
const TURN_SLACK = 1.25;
const TURN_HOLD = 0.25;

// The whole row comes about in one frame: heading, hulls and foam together.
// Nothing here eases. `within` reads the bite span off lane.dir, so a mesh
// swinging round over even a fifth of a second would leave the jaws drawn at
// one end of the gator and biting from the other.
function reverse(lane) {
  lane.dir *= -1;
  for (const m of lane.movers) m.mesh.rotation.y = lane.dir < 0 ? Math.PI : 0;
  for (const f of lane.data.flecks) f.speed *= -1;
}

function pickComposition(level) {
  const kinds = kindsFor('river', level);
  if (mixesAllowed(level) && kinds.length > 1 && Math.random() < 0.25) return kinds;
  let roll = Math.random() * kinds.reduce((a, k) => a + WEIGHT[k], 0);
  for (const k of kinds) { roll -= WEIGHT[k]; if (roll <= 0) return [k]; }
  return [kinds[0]];
}

// World-space test of a local x span on a mover, honouring its heading.
// `slack` widens the span: decks are forgiving, jaws are not.
function within(lane, m, span, x, slack = 0.3) {
  const a = m.x + lane.dir * span[0], b = m.x + lane.dir * span[1];
  return x > Math.min(a, b) - slack && x < Math.max(a, b) + slack;
}

export default {
  id: 'river',
  danger: true,
  weight: 2,
  band: [1, 3],
  build(lane, { sky, difficulty, gauntlet, level }) {
    lane.ground(0x3f8fd6, -0.3, 0.2);
    lane.dir = pick(-1, 1);
    const tr = traffic(difficulty + lane.r / 120);
    lane.speed = rand(1.2, 2.2) * tr.speed;
    const kinds = pickComposition(level);
    const diveBoost = Math.min(0.3, difficulty * 0.08);
    lane.spawnSpaced(randInt(...tr.count), () => {
      const kind = pick(...kinds);
      const m = KINDS[kind]();
      m.kind = kind;
      if (level >= 2 && Math.random() < DIVE_CHANCE[kind] + (kind === 'boat' ? 0 : diveBoost)) {
        m.diver = { period: rand(3.5, 6), phase: rand(0, 6), down: rand(1.0, 1.6) };
      }
      if (kind === 'gator') m.gape = { period: rand(...GAPE_PERIOD), phase: rand(0, 6), open: rand(...GAPE_OPEN) };
      m.submerged = false;
      m.baseY = m.mesh.position.y;
      return m;
    }, { gapMin: Math.max(1.4, tr.gapMin - 0.6), gapVar: tr.gapVar });
    for (const m of lane.movers) if (m.kind === 'log' && Math.random() < 0.3) lane.moverCoin(m);
    if (gauntlet) lane.bonusDrop();

    // A crossing is ±VIEW, the far side of one screen edge to the far side of
    // the other: on for that long and a bit over, then the row decides again.
    if (kinds.includes('gator')) {
      const every = ((2 * VIEW) / lane.speed) * TURN_SLACK;
      lane.data.turn = { every, t: every };
    }
    lane.data.flecks = [];
    for (let i = 0; i < 18; i++) {         // spread over the wrap ring, not just the screen
      const f = lane.add(makeFleck(), rand(-SPAN, SPAN));
      lane.data.flecks.push({ mesh: f, speed: lane.dir * lane.speed * rand(0.25, 0.6) });
    }
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
    for (const m of lane.movers) {
      if (m.gape) setFrame(m.mesh, (time + m.gape.phase) % m.gape.period < m.gape.open ? 1 : 0);
      if (!m.diver) continue;
      const t = (time + m.diver.phase) % m.diver.period;
      m.submerged = t < m.diver.down;
      const warn = t > m.diver.period - 0.6;                       // wobble before going under
      const target = m.submerged ? -0.9 : warn ? Math.sin(time * 25) * 0.06 : 0;
      m.mesh.position.y += (target - m.mesh.position.y) * damp(m.submerged ? 4 : 8, dt);
    }
    const turn = lane.data.turn;
    if (turn && !lane.frozen) {
      turn.t -= dt;
      if (turn.t <= 0) {
        turn.t = turn.every;
        if (Math.random() > TURN_HOLD) reverse(lane);
      }
    }
    for (const f of lane.data.flecks) {
      f.mesh.position.x += f.speed * dt;
      if (f.mesh.position.x > SPAN) f.mesh.position.x -= 2 * SPAN;
      if (f.mesh.position.x < -SPAN) f.mesh.position.x += 2 * SPAN;
    }
    if (lane.data.flies) for (const f of lane.data.flies) {
      f.mesh.position.x += Math.sin(time * f.speed + f.phase) * dt * 1.5;
      f.mesh.position.y = 0.5 + Math.sin(time * 2 * f.speed + f.phase) * 0.3;
      f.mesh.visible = Math.sin(time * 3 + f.phase) > -0.6;
    }
  },

  // A swimmer afloat: whatever drifts onto them either carries them (log, gator
  // back) or runs them down (boat, sub hull). Gator heads bite as ever.
  swimContact(lane, player) {
    const m = lane.moverAt(player.x, 0.3);
    if (!m || m.submerged) return null;
    if (m.head && within(lane, m, m.head, player.x, -0.1)) return 'chomped';
    if (m.kind === 'boat' || m.kind === 'sub') return 'rundown';
    if (within(lane, m, m.bed, player.x)) player.mount(m);
    return null;
  },

  onLand(lane, player) {
    const m = lane.moverAt(player.x, 0.3);
    if (!m || m.submerged) return player.swims ? null : 'water';     // waterfowl just swim
    if (m.head && within(lane, m, m.head, player.x, -0.1)) return 'chomped';
    if (!within(lane, m, m.bed, player.x)) return lane.riding(m, player) ? 'bounce' : player.swims ? null : 'water';
    player.carrier = m;
    return null;
  },
};
