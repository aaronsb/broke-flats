// Freight wall. A slow train that never ends fills the whole wrap ring, so
// the one crossing gate stays down. The way across is through a box car with
// its doors open, or over a flat car. Which cars are open only shows from
// the side: every box car wears the same roof.
import { box, makeTrain, makeFreightCar, makeRailSignal, makeGate, makeHeadlightCone } from '../meshes.js';
import { W, SPAN, GW, DETAIL_W } from '../lane.js';
import { CONE } from '../headlights.js';
import { sfx } from '../sfx.js';
import { rand, pick } from '../util.js';
import { traffic, kindsFor } from '../tuning.js';
import './rail.js';   // the `train` death
import './road.js';   // the `hauled` death

const HOP = 0.16;                 // seconds a hop is in the air (player.js); the car moves this far before you land
const GATE_CELLS = 3;             // columns the arm covers, from the edge of play inward
const GATE_ARM = 0.6 + GATE_CELLS;
const CAR_LEN = 1.9, GAP = 0.2;
const CAR_PITCH = CAR_LEN + GAP;
const ENGINE_LEN = 2.2;
const BASE_SPEED = [1.4, 1.7];    // units per second before the traffic multiplier: a crawl on level one
const REVERSE_LEVEL = 4;          // from here the train may run away from the gate
const REVERSE_CHANCE = 0.3;
const HORN_WAIT = [9, 18];
const MIX = { closed: 4, box1: 3, box2: 2, flat: 1 };
const LEAST = { box2: 3, flat: 2 };   // however the roll falls, the ring holds this many ways through

function pickKinds(n, level) {
  const allowed = kindsFor('freight', level);
  const total = allowed.reduce((a, k) => a + MIX[k], 0);
  const roll = () => { let r = Math.random() * total; for (const k of allowed) { r -= MIX[k]; if (r <= 0) return k; } return allowed[0]; };
  const kinds = Array.from({ length: n }, roll);
  for (const [k, least] of Object.entries(LEAST)) {
    if (!allowed.includes(k)) continue;
    let have = kinds.filter((x) => x === k).length;
    while (have < least) { const i = Math.floor(Math.random() * n); if (kinds[i] !== 'box2' && kinds[i] !== 'flat') { kinds[i] = k; have++; } }
  }
  return kinds;
}

// The mover whose rideable span is nearest x, within slack of it.
function bedAt(lane, x, slack) {
  let best = null, bestD = slack;
  for (const m of lane.movers) {
    for (const sp of m.beds ?? []) {
      const a = m.x + lane.dir * sp[0], b = m.x + lane.dir * sp[1];
      const d = Math.max(Math.min(a, b) - x, x - Math.max(a, b), 0);
      if (d <= bestD) { best = m; bestD = d; }
    }
  }
  return best;
}

export default {
  id: 'freight',
  danger: true,
  weight: 1,
  band: [1, 1],
  minGap: 2,        // the gate rules reach into the rows either side
  keepGap: true,
  build(lane, { sky, difficulty, level }) {
    lane.ground(0x6a645c);
    for (let x = -DETAIL_W / 2; x < DETAIL_W / 2; x += 0.7) lane.add(box(0.3, 0.06, 0.9, 0x5a3d24, x, 0, 0, false));   // sleepers
    for (const z of [-0.3, 0.3]) lane.add(box(GW, 0.08, 0.08, 0xb8b8b8, 0, 0.05, z, false));                // rails
    const gateSide = pick(-1, 1);
    lane.dir = level >= REVERSE_LEVEL && Math.random() < REVERSE_CHANCE ? -gateSide : gateSide;
    lane.speed = rand(...BASE_SPEED) * traffic(difficulty).speed;
    lane.data.hidden = true;    // which doors are open only shows from the side

    // Engine at the head, then cars nose to tail around the ring; the slack
    // left over sits between the last car's tail and the engine.
    const n = Math.floor((2 * SPAN - ENGINE_LEN - 2.5) / CAR_PITCH);
    const engine = makeTrain('diesel', []);
    engine.kind = 'engine';
    if (sky.headlights) engine.mesh.add(makeHeadlightCone(engine.len * CONE * 0.4, engine.len / 2 + 0.9, 0.05, 0, 1.1));
    const place = (m, x) => {
      m.x = ((x + SPAN) % (2 * SPAN) + 2 * SPAN) % (2 * SPAN) - SPAN;
      m.v = 1;
      lane.add(m.mesh, m.x);
      lane.movers.push(m);
    };
    const head = rand(-SPAN, SPAN);
    if (lane.dir < 0) engine.mesh.rotation.y = Math.PI;
    place(engine, head);
    let x = head - lane.dir * (ENGINE_LEN / 2 + GAP + CAR_LEN / 2);
    pickKinds(n, level).forEach((kind) => {
      place(makeFreightCar(kind, pick(-1, 1)), x);
      x -= lane.dir * CAR_PITCH;
    });

    lane.data.signals = [-1, 1].map((s) => { const sig = lane.add(makeRailSignal(), s * (W + 1)); sig.position.z = 0.6; return sig; });
    const g = lane.add(makeGate(GATE_ARM), gateSide * (W + 0.6));
    g.position.z = 0.55;
    if (gateSide > 0) g.rotation.y = Math.PI;       // the arm swings in from its post
    g.pivot.rotation.z = 0;                         // down from the start
    Object.assign(lane.data, { gateSide, gates: [g], horn: rand(2, 6), heard: false });
  },

  update(lane, dt, time) {
    lane.advance(dt);
    const d = lane.data;
    const near = Math.abs(lane.r - (lane.world?.focusRow ?? lane.r)) <= 7;
    if (near && !d.heard) { d.heard = true; sfx.rumble(); }
    if (!near) d.heard = false;
    if ((d.horn -= dt) <= 0) { d.horn = rand(...HORN_WAIT); if (near) sfx.horn(); }
    const blink = Math.sin(time * 14) > 0;
    for (const s of d.signals) s.lamp.material.color.set(blink ? 0xff2a1a : 0x3a0a0a);
    for (const g of d.gates) g.lamps.forEach((l, i) => l.material.color.set(blink === (i % 2 === 0) ? 0xff2a1a : 0x3a0a0a));
  },

  // Columns under the arm: the gated edge of play, GATE_CELLS deep.
  gated(lane, c) { return c * lane.data.gateSide >= W - GATE_CELLS + 1; },

  // A cell you can hop into from `side` (+1 from below, -1 from above), judged
  // where the car will be when the hop lands: a doorway counts while it
  // overlaps most of the cell. Along the train (side 0) only a flat car takes
  // you: a box car's ends are solid.
  boardable(lane, x, side) {
    if (!side) return bedAt(lane, x, 0.25)?.kind === 'flat';
    const m = bedAt(lane, x - lane.dir * lane.speed * HOP, 0.3);
    if (!m) return false;
    return m.kind !== 'box1' || m.side === side;
  },

  blockedFrom(lane, c, fromRow) {
    if (fromRow === lane.r) return !this.boardable(lane, c, 0);
    const side = fromRow === lane.r - 1 ? 1 : fromRow === lane.r + 1 ? -1 : 0;
    if (!side) return false;
    return this.gated(lane, c) || !this.boardable(lane, c, side);
  },

  // Leaving toward a row: not under the arm, and not through a box car's closed wall.
  blockedExit(lane, c, toRow) {
    const side = toRow === lane.r - 1 ? 1 : toRow === lane.r + 1 ? -1 : 0;
    if (!side) return false;
    if (this.gated(lane, c)) return true;
    const m = bedAt(lane, c, 0.75);
    return !!m && m.kind === 'box1' && m.side !== side;
  },

  lethalAt(lane, x, player) {
    if (player?.moving && player.trow === lane.r && !player.hopCarrier) return null;   // the landing decides
    if (bedAt(lane, x, 0.6)) return null;
    const m = lane.moverAt(x, 0.35);
    if (!m) return null;
    return lane.rearOf(m, x) || lane.riding(m, player) ? 'bounce' : 'train';
  },
  onLand(lane, player) {
    const m = bedAt(lane, player.x, 0.5);
    if (!m) return 'train';
    player.carrier = m;
    return null;
  },
};
