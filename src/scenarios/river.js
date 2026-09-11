// Water with things to ride: logs, flat boats, submarines and alligators.
// Divers (some logs, every sub, some gators) submerge on a cycle and drown
// whoever is aboard. Gator heads bite. Foam flecks drift on the surface.
import { makeLog, makeRiverBoat, makeSub, makeGator, makeFirefly, makeFleck } from '../meshes.js';
import { W, SPAN } from '../lane.js';
import { registerDeath } from '../deaths.js';
import { rand, randInt, pick, damp } from '../util.js';
import { traffic } from '../tuning.js';

registerDeath('chomped', { anim: 'flat', title: 'CHOMP', sfx: 'crack' });

// Lane compositions. One kind per lane is the norm; mixes are rarer.
const KINDS = {
  log:   () => { const len = randInt(2, 4); return { mesh: makeLog(len), len, bed: [-len / 2, len / 2], rideY: 0, offCause: 'water' }; },
  boat:  () => makeRiverBoat(),
  sub:   () => makeSub(),
  gator: () => makeGator(),
};
const COMPOSITIONS = [
  { kinds: ['log'], w: 4 }, { kinds: ['boat'], w: 2 }, { kinds: ['gator'], w: 2 }, { kinds: ['sub'], w: 1 },
  { kinds: ['log', 'boat', 'gator', 'sub'], w: 2 },
];
const DIVE_CHANCE = { log: 0.35, sub: 1, gator: 0.4, boat: 0 };

function pickComposition() {
  let roll = Math.random() * COMPOSITIONS.reduce((a, c) => a + c.w, 0);
  for (const c of COMPOSITIONS) { roll -= c.w; if (roll <= 0) return c.kinds; }
  return ['log'];
}

// World-space test of a local x span on a mover, honouring its heading.
function within(lane, m, span, x) {
  const a = m.x + lane.dir * span[0], b = m.x + lane.dir * span[1];
  return x > Math.min(a, b) + 0.1 && x < Math.max(a, b) - 0.1;
}

export default {
  id: 'river',
  danger: true,
  weight: 2,
  band: [1, 3],
  build(lane, { sky, difficulty, gauntlet }) {
    lane.ground(0x3f8fd6, -0.3, 0.2);
    lane.dir = pick(-1, 1);
    const tr = traffic(difficulty + lane.r / 120);
    lane.speed = rand(1.2, 2.2) * tr.speed;
    const kinds = pickComposition();
    const diveBoost = Math.min(0.3, difficulty * 0.08);
    lane.spawnSpaced(randInt(...tr.count), () => {
      const kind = pick(...kinds);
      const m = KINDS[kind]();
      m.kind = kind;
      if (Math.random() < DIVE_CHANCE[kind] + (kind === 'boat' ? 0 : diveBoost)) {
        m.diver = { period: rand(3.5, 6), phase: rand(0, 6), down: rand(1.0, 1.6) };
      }
      m.submerged = false;
      m.baseY = m.mesh.position.y;
      return m;
    }, { gapMin: Math.max(1.4, tr.gapMin - 0.6), gapVar: tr.gapVar });
    for (const m of lane.movers) if (m.kind === 'log' && Math.random() < 0.3) lane.moverCoin(m);
    if (gauntlet) lane.bonusDrop();

    lane.data.flecks = [];
    for (let i = 0; i < 7; i++) {
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
      if (!m.diver) continue;
      const t = (time + m.diver.phase) % m.diver.period;
      m.submerged = t < m.diver.down;
      const warn = t > m.diver.period - 0.6;                       // wobble before going under
      const target = m.submerged ? -0.9 : warn ? Math.sin(time * 25) * 0.06 : 0;
      m.mesh.position.y += (target - m.mesh.position.y) * damp(m.submerged ? 4 : 8, dt);
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

  onLand(lane, player) {
    const m = lane.moverAt(player.x, 0.3);
    if (!m || m.submerged) return 'water';
    if (m.head && within(lane, m, m.head, player.x)) return 'chomped';
    if (!within(lane, m, m.bed, player.x)) return 'water';
    player.carrier = m;
    return null;
  },
};
