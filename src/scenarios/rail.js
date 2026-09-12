// Railway crossing. Empty most of the time; the gates drop over the outer
// columns, the signal blinks and a horn sounds, then a train crosses. Steam
// trains are slow and puff, diesels are middling, bullet trains are fast.
// Flat cars and box-car doorways can be ridden; everything else is fatal.
import { box, makeTrain, makeRailSignal, makeGate, makeHeadlightCone } from '../meshes.js';
import { W, SPAN, GW } from '../lane.js';
import { registerDeath } from '../deaths.js';
import { CONE } from '../headlights.js';
import { sfx } from '../sfx.js';
import { rand, randInt, pick, damp } from '../util.js';
import { traffic, kindsFor } from '../tuning.js';
import * as THREE from 'three';
import { LEFT_HAND } from '../locale.js';

registerDeath('train', { anim: 'flat', title: 'CHOO CHOO', sfx: 'splat' });

const WARN = 2.0;         // seconds of gates and blinking before the train arrives
const PARK = 30;          // how far off the strip a waiting train sits: beyond the tilted view
const GATE_ARM = W + 1.6; // each arm reaches a cell past the centre: closed arms overlap two cells
const TYPES = {
  steam:  { speed: [5, 7],   cars: ['flat', 'box', 'closed', 'flat'], w: 3 },
  diesel: { speed: [8, 11],  cars: ['flat', 'box', 'closed'], w: 4 },
  bullet: { speed: [13, 16], cars: ['closed'], w: 2 },
};
function pickType(level) {
  const allowed = kindsFor('rail', level);
  let roll = Math.random() * allowed.reduce((a, k) => a + TYPES[k].w, 0);
  for (const k of allowed) { roll -= TYPES[k].w; if (roll <= 0) return k; }
  return allowed[0];
}

const puffMat = new THREE.MeshBasicMaterial({ color: 0xdedede, transparent: true, opacity: 0.85, depthWrite: false });
const unit = new THREE.BoxGeometry(1, 1, 1);

export default {
  id: 'rail',
  danger: true,
  weight: 1,
  band: [1, 1],
  minGap: 2,        // never back to back, even when forced: gates need a row between
  keepGap: true,
  build(lane, { sky, difficulty, gauntlet, level }) {
    lane.ground(0x6a645c);
    for (let x = -GW / 2; x < GW / 2; x += 0.7) lane.add(box(0.3, 0.06, 0.9, 0x5a3d24, x, 0, 0, false));   // sleepers
    for (const z of [-0.3, 0.3]) lane.add(box(GW, 0.08, 0.08, 0xb8b8b8, 0, 0.05, z, false));                // rails
    lane.dir = pick(-1, 1);
    const type = pickType(level);
    const spec = TYPES[type];
    lane.speed = rand(...spec.speed) * (0.85 + traffic(difficulty).speed * 0.25);
    const n = randInt(2, 5);
    const t = makeTrain(type, Array.from({ length: n }, () => pick(...spec.cars)));
    t.x = -lane.dir * (PARK + t.len / 2);            // parked out of sight, hidden until it runs
    if (lane.dir < 0) t.mesh.rotation.y = Math.PI;
    t.mesh.position.x = t.x;
    t.mesh.visible = false;
    if (sky.headlights) t.mesh.add(makeHeadlightCone(t.len * CONE * 0.4, t.len / 2 + 0.9, 0.05, 0, 1.1));
    lane.add(t.mesh);
    lane.movers.push(t);
    Object.assign(lane.data, { train: t, wait: rand(3, 8), state: 'idle', puffs: [], puffClock: 0 });
    if (gauntlet) lane.bonusDrop();
    lane.data.signals = [-W - 1, W + 1].map((x) => { const s = lane.add(makeRailSignal(), x); s.position.z = 0.6; return s; });
    // Each gate guards the lane approaching the track: with right-hand traffic
    // the near-side (bottom) gate is on the right and the far-side gate on the
    // left. Left-hand-traffic locales mirror that.
    lane.data.gates = [-1, 1].map((side) => {
      const g = lane.add(makeGate(GATE_ARM), side * (W + 0.6));
      const nearSide = LEFT_HAND ? side < 0 : side > 0;
      g.position.z = nearSide ? 0.55 : -0.55;
      if (side > 0) g.rotation.y = Math.PI;       // arm swings toward the centre from each side
      return g;
    });
  },

  update(lane, dt, time) {
    const d = lane.data, t = d.train;
    const near = Math.abs(lane.r - (lane.world?.focusRow ?? lane.r)) <= 7;
    if (d.state === 'idle') {
      d.wait -= dt;
      if (d.wait <= 0) { d.state = 'warn'; d.wait = WARN; if (near) sfx.horn(); }
    } else if (d.state === 'warn') {
      d.wait -= dt;
      if (d.wait <= 0) { d.state = 'run'; t.mesh.visible = true; if (near) sfx.rumble(); }
    } else {
      t.x += lane.dir * lane.speed * dt;
      t.mesh.position.x = t.x;
      if (Math.abs(t.x) > PARK + t.len / 2) {
        t.x = -lane.dir * (PARK + t.len / 2);
        t.mesh.position.x = t.x;
        t.mesh.visible = false;
        d.state = 'idle';
        d.wait = rand(5, 11);
      }
      if (t.type === 'steam' && (d.puffClock -= dt) <= 0) {
        d.puffClock = 0.12;
        const m = new THREE.Mesh(unit, puffMat);
        m.scale.setScalar(0.25);
        m.position.set(t.x + lane.dir * t.stackX, 1.75, 0);
        lane.group.add(m);
        d.puffs.push({ mesh: m, life: 1.1 });
      }
    }
    for (const q of d.puffs) { q.life -= dt; q.mesh.position.y += dt * 1.4; q.mesh.position.x -= lane.dir * dt * 0.6; q.mesh.scale.setScalar(0.25 + (1.1 - q.life) * 0.5); }
    d.puffs = d.puffs.filter((q) => { const gone = q.life <= 0; if (gone) lane.group.remove(q.mesh); return !gone; });

    // Gates down while a train is due or passing; the outer columns are blocked.
    const down = d.state !== 'idle';
    const blink = down && Math.sin(time * 14) > 0;
    for (const s of d.signals) s.lamp.material.color.set(blink ? 0xff2a1a : 0x3a0a0a);
    for (const g of d.gates) {
      g.pivot.rotation.z += ((down ? 0 : Math.PI / 2 - 0.15) - g.pivot.rotation.z) * damp(5, dt);
      g.lamps.forEach((l, i) => l.material.color.set(down && (Math.sin(time * 14) > 0) === (i % 2 === 0) ? 0xff2a1a : 0x3a0a0a));
    }
    d.down = down;
  },

  // Columns under the near-side arm (guards entry from below) and the far-side arm.
  // The arm on side s covers from its post to one cell past the centre.
  covered(side, c) { return side > 0 ? c >= -1 : c <= 1; },
  nearSide() { return LEFT_HAND ? -1 : 1; },
  blockedFrom(lane, c, fromRow) {
    if (!lane.data.down) return false;
    if (fromRow === lane.r - 1) return this.covered(this.nearSide(), c);   // coming up from below
    if (fromRow === lane.r + 1) return this.covered(-this.nearSide(), c);  // coming down from above
    return false;
  },
  blockedExit(lane, c, toRow) {
    if (!lane.data.down) return false;
    if (toRow === lane.r - 1) return this.covered(this.nearSide(), c);
    if (toRow === lane.r + 1) return this.covered(-this.nearSide(), c);
    return false;
  },

  lethalAt(lane, x, player) {
    const m = lane.moverAt(x, 0.35);
    if (!m || lane.onBed(m, x)) return null;
    return lane.rearOf(m, x) || lane.riding(m, player) ? 'bounce' : 'train';
  },
  onLand(lane, player) {
    const m = lane.moverAt(player.x, 0.35);
    if (m && lane.onBed(m, player.x)) player.carrier = m;
    return null;
  },
};
