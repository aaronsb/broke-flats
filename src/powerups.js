// Powerups. Each sits in a crate on the board (see Lane.crate), tucked under
// a one-cell overhang (Lane.cover) so nothing shows from straight above; the
// item floats over the crate and shows only while the camera is tilted.
// The registry mirrors registerDeath in deaths.js: scenarios or later passes
// add entries with registerPowerup.
//
//   registerPowerup(id, {
//     name       HUD label, upper case
//     make       () => item mesh, about 0.5 tall, floats above the crate
//     duration   seconds; 0 is instant (apply and forget); Infinity lasts the level
//     weight     crate roll weight (default 1)
//     apply(ctx)         on grant
//     update(ctx, dt)    each frame while active (optional)
//     expire(ctx)        when time runs out, on death, or on dispose
//   })
//
// ctx = { player, mode, world, game, train } is built per grant by
// Player.grant, so per-power state can live on it. Powers belong to the
// leader only; followers carry none.
import * as THREE from 'three';
import { makeStar, makeHourglass, makeMagnet, makeWhistle, makeGoldenEgg, makeMushroom, makeAcorn, makeChili, makeTiltIcon, makeFireball } from './meshes.js';
import { sfx } from './sfx.js';
import { music } from './music.js';
import { W, SPAN } from './lane.js';
import { randInt, clamp, rand } from './util.js';

export const POWERUPS = {};
export function registerPowerup(id, spec) { POWERUPS[id] = { weight: 1, ...spec, id }; }

// A weighted draw from the registry.
export function rollPowerup() {
  const all = Object.values(POWERUPS);
  let roll = Math.random() * all.reduce((a, p) => a + (p.weight ?? 1), 0);
  for (const p of all) { roll -= p.weight ?? 1; if (roll <= 0) return p.id; }
  return all[all.length - 1]?.id;
}

// Crates never sit in the open. A safe row grows an overhang — a shop awning,
// a porch, a bough, the corner of a building on its pillar — at COVER_CHANCE,
// and only then is it rolled for what is underneath. Left on bare ground a
// crate was a brown square from above, visible a dozen rows off and worth
// walking to; under cover it is a peek away and most of the peeks come up
// empty, which is what makes the full ones worth taking.
//
// The rate a crate actually appears is unchanged at 0.06 on level 1 rising to
// about 0.14 by level 5, so the roll under the roof is scaled by how rarely
// the roof comes. Never on the intro rows, never on a gauntlet (those keep
// their own drops), never next to another crate or on a coin.
// Set well above the crate rate on purpose: at level 5 about a third of the
// overhangs on a board have anything under them, and on level 1 nearer a
// sixth. A roof that usually pays out is the brown box wearing a hat.
const COVER_CHANCE = 0.4;
const CRATE_BASE = 0.06, CRATE_STEP = 0.02, CRATE_MAX = 0.14;
export function rollCrate(lane, { level = 1, gauntlet = false, avoid = null } = {}) {
  if (lane.r < 4 || gauntlet || !Object.keys(POWERUPS).length) return null;
  if (Math.random() > COVER_CHANCE) return null;
  for (let tries = 0; tries < 6; tries++) {
    const c = randInt(-W + 1, W - 1);
    if (lane.blocked.has(c) || lane.coins.has(c) || lane.eggs.has(c) || lane.crateNear(c)) continue;
    if (avoid?.includes(c)) continue;                        // a bay under a shelter is roofed already
    lane.cover(c);
    const per = clamp(CRATE_BASE + (level - 1) * CRATE_STEP, CRATE_BASE, CRATE_MAX);
    if (Math.random() > per / COVER_CHANCE) return null;     // an empty bay
    const id = rollPowerup();
    lane.crate(c, id);
    return id;
  }
  return null;
}

// ---- the powerups ----

// Star: whatever would have killed you blows up instead (Player.starSave).
// The player's own colours cycle through the rainbow while it lasts.
const STAR_FLICKER = 0.08;
registerPowerup('star', {
  name: 'STAR', duration: 8, weight: 1,
  make: makeStar,
  apply(ctx) {
    ctx.player.own();
    ctx.hue = 0; ctx.clock = 0;
    music.setMood({ star: true });
  },
  update(ctx, dt) {
    ctx.clock += dt;
    if (ctx.clock < STAR_FLICKER) return;
    ctx.clock = 0;
    ctx.hue = (ctx.hue + 0.11) % 1;
    ctx.player.mesh.traverse((o) => { if (o.isMesh && o.userData.mat0) o.material.color.setHSL(ctx.hue, 1, 0.6); });
  },
  expire(ctx) {
    ctx.player.restore();
    music.setMood({ star: false });
  },
});

// Hourglass: every mover on every lane stops (Lane.frozen reads world.frozen,
// so rows built during the freeze stop too). Water still drowns. The sky goes
// cold and a clock ticks until time starts again.
const FREEZE_TINT = new THREE.Color(0x3a5cff);
registerPowerup('hourglass', {
  name: 'HOURGLASS', duration: 6, weight: 1,
  make: makeHourglass,
  apply(ctx) {
    ctx.world.frozen = true;
    ctx.tock = 0; ctx.beat = 0;
    const sky = ctx.game?.sky;
    if (sky) {
      sky.scene.background.lerp(FREEZE_TINT, 0.45);
      sky.scene.fog.color.copy(sky.scene.background);
      sky.hemi.color.lerp(FREEZE_TINT, 0.5);
    }
  },
  update(ctx, dt) {
    ctx.tock += dt;
    if (ctx.tock < 0.5) return;
    ctx.tock = 0;
    sfx.clock((ctx.beat = 1 - ctx.beat) === 1);
  },
  expire(ctx) {
    ctx.world.frozen = false;
    ctx.game?.sky?.apply(ctx.game.sky.name);
  },
});

// Magnet: coins and eggs within MAGNET_REACH cells slide to the player and are
// taken the way a landing takes them.
const MAGNET_REACH = 2, MAGNET_SPEED = 6, MAGNET_TAKE = 0.3;
registerPowerup('magnet', {
  name: 'MAGNET', duration: 12, weight: 1,
  make: makeMagnet,
  update(ctx, dt) {
    const p = ctx.player;
    for (let r = p.row - MAGNET_REACH; r <= p.row + MAGNET_REACH; r++) {
      const lane = ctx.world.laneAt(r);
      if (!lane) continue;
      const pull = (items, take) => {
        for (const [c, mesh] of [...items]) {
          if (Math.abs(c - p.x) > MAGNET_REACH + 0.5) continue;
          const dx = p.x - mesh.position.x, dz = p.z - (mesh.position.z - lane.r);
          const d = Math.hypot(dx, dz);
          if (d < MAGNET_TAKE) { take(c); continue; }
          const step = Math.min(d, MAGNET_SPEED * dt) / d;
          mesh.position.x += dx * step;
          mesh.position.z += dz * step;
        }
      };
      pull(lane.coins, (c) => { if (lane.takeCoin(c)) p.gotCoin(); });
      pull(lane.eggs, (c) => { if (lane.takeEgg(c)) p.onEgg?.(); });
    }
  },
});

// Whistle: every follower waiting at the finish line runs back and rejoins.
registerPowerup('whistle', {
  name: 'WHISTLE', duration: 0, weight: 1,
  make: makeWhistle,
  apply(ctx) {
    const n = ctx.train?.recall() ?? 0;
    sfx.whistle();
    const p = ctx.player;
    p.fx?.sparkles(new THREE.Vector3(p.x, p.y, p.z), 10 + n * 4);
  },
});

// Golden egg: every follower at the tally is worth a full 1.0x instead of 0.5x.
// Lasts the rest of the level; the mode reads followerMul in openSummary.
registerPowerup('goldenEgg', {
  name: 'GOLDEN EGG', duration: Infinity, weight: 0.7,
  make: makeGoldenEgg,
  apply(ctx) { if (ctx.mode) ctx.mode.followerMul = 1; },
  expire(ctx) { if (ctx.mode) ctx.mode.followerMul = null; },
});

// Mushroom: the player doubles in size, strides two cells a hop and crushes
// whatever it comes down on (Player.starSave, as under a star). Too big for a
// hedge tunnel (World.isBlocked). The camera pulls back a little to fit.
const GIANT_SCALE = 2, GIANT_ZOOM = 1.15;
registerPowerup('mushroom', {
  name: 'MUSHROOM', duration: 20, weight: 1,
  make: makeMushroom,
  apply(ctx) {
    const p = ctx.player;
    p.revoke('acorn');
    p.giant = true;
    p.setSize(GIANT_SCALE);
    if (ctx.game?.camera) ctx.game.camera.zoomGoal = GIANT_ZOOM;
    sfx.boink();
  },
  expire(ctx) {
    const p = ctx.player;
    p.giant = false;
    p.setSize(1);
    if (ctx.game?.camera) ctx.game.camera.zoomGoal = 1;
    sfx.squeak();
  },
});

// Acorn: half size. Fences are passable, trucks and flatbeds (movers marked
// `tall`) pass overhead, and a bounce off a bumper keeps the buffered hop.
const TINY_SCALE = 0.5;
registerPowerup('acorn', {
  name: 'ACORN', duration: 15, weight: 1,
  make: makeAcorn,
  apply(ctx) {
    const p = ctx.player;
    p.revoke('mushroom');
    p.tiny = true;
    p.setSize(TINY_SCALE);
    sfx.squeak();
  },
  expire(ctx) {
    const p = ctx.player;
    p.tiny = false;
    p.setSize(1);
    sfx.boink();
  },
});

// Chili: five fireballs. F (touch: the fire button) sends one the way the
// player faces, along a low arc over up to FIRE_RANGE cells; it wrecks the
// first mover it meets on any row, or stops at a block with a puff. The chip
// counts the shots left; the power ends when the last one lands.
const CHILI_SHOTS = 5, FIRE_SPEED = 12, FIRE_RANGE = 6, FIRE_HIT = 0.6, FIRE_Y = 0.35, FIRE_ARC = 0.5;
const HEADINGS = [[0, 1], [-1, 0], [0, -1], [1, 0]];   // by quarter turn of Player.facing: fwd, left, back, right
registerPowerup('chili', {
  name: 'CHILI', duration: Infinity, weight: 0.8,
  make: makeChili,
  label: (e) => `CHILI <b>×${e.ctx.shots}</b>`,
  apply(ctx) { ctx.shots = CHILI_SHOTS; ctx.balls = []; },
  regrant(ctx) { ctx.shots = CHILI_SHOTS; },
  fire(ctx) {
    if (ctx.shots <= 0) return false;
    const p = ctx.player;
    const [dx, dr] = HEADINGS[Math.round(p.facing / (Math.PI / 2)) & 3];
    const mesh = makeFireball();
    mesh.position.set(p.x, FIRE_Y, p.z);
    p.scene.add(mesh);
    ctx.balls.push({ mesh, x0: p.x, r0: p.row, dx, dr, d: 0 });
    ctx.shots--;
    sfx.fwoosh();
    return true;
  },
  update(ctx, dt) {
    const { player: p, world } = ctx;
    const fx = world.config?.fx;
    for (const b of ctx.balls) {
      b.d += FIRE_SPEED * dt;
      const x = b.x0 + b.dx * b.d, r = b.r0 + b.dr * b.d;
      const y = FIRE_Y + Math.sin(Math.PI * Math.min(1, b.d / FIRE_RANGE)) * FIRE_ARC;
      b.mesh.position.set(x, y, -r);
      b.mesh.rotation.x += dt * 9; b.mesh.rotation.z += dt * 7;
      const lane = world.laneAt(Math.round(r));
      const puff = () => { if (fx) for (let i = 0; i < 4; i++) fx.puff(b.mesh.position, 0x9a9a9a, rand(0.12, 0.2), rand(0.4, 0.7), new THREE.Vector3(rand(-0.6, 0.6), rand(0.8, 1.6), rand(-0.6, 0.6)), 1.6); sfx.puff(); };
      if (!lane || Math.abs(x) > W + 0.5 || b.d > FIRE_RANGE) { puff(); b.gone = true; continue; }
      const m = lane.moverAt(x, FIRE_HIT);
      if (m && m !== p.carrier && !(m.y > 1.5) && m.mesh.visible) { lane.wreck(m, 1.2); b.gone = true; continue; }   // wreck plays the boom
      const kind = lane.blockKind(Math.round(x));
      if (kind && !p.passes(kind) && b.d > 0.5) { puff(); b.gone = true; }
    }
    ctx.balls = ctx.balls.filter((b) => { if (b.gone) p.scene.remove(b.mesh); return !b.gone; });
    if (ctx.shots <= 0 && !ctx.balls.length) p.revoke('chili');
  },
  expire(ctx) {
    for (const b of ctx.balls) ctx.player.scene.remove(b.mesh);
    ctx.balls = [];
  },
});

// Tilt: the camera rides into a rolled iso view (the `slide` preset, board
// sloping to +x) for TILT_TIME seconds with no coin cost, and every mover on
// every row within TILT_ROWS slides downhill, faster and faster, popping at
// the edge of the ring. The rows are frozen and empty until time is up; then
// traffic comes back from upstream in its old formation, held out of play
// beyond the ring until Lane.advance lets each one in. Players and followers
// stay put, and so does whatever is carrying them. A rail train parks at its
// idle position instead; a freight wall is left alone (its ring is full and
// could never be emptied and refilled).
const TILT_TIME = 4, TILT_ROWS = 14, SLIDE_V0 = 12, SLIDE_ACCEL = 80;
// lane.js imports this module for the registry, so its constants are read at call time, never at load.
const holdX = () => -SPAN - 30;        // where a shelved mover waits, well beyond the ring
const reenter = () => W + 3;           // the lead mover comes back this far upstream of the board
registerPowerup('tilt', {
  name: 'TILT', duration: TILT_TIME, weight: 0.6,
  make: makeTiltIcon,
  apply(ctx) {
    const { player: p, world, mode } = ctx;
    mode?.setForceTilt(true);
    const carried = new Set();
    for (const q of mode?.players ?? [p]) if (q.carrier) carried.add(q.carrier);
    for (const t of mode?.trains ?? []) for (const k of t.chicks) if (k.rec?.carrier) carried.add(k.rec.carrier);
    ctx.lanes = []; ctx.sliding = []; ctx.slideAt = 0.15;
    for (const lane of world.rows.values()) {
      if (Math.abs(lane.r - p.row) > TILT_ROWS || !lane.movers.length || lane.scenario.id === 'freight') continue;
      lane.frozen = true;
      ctx.lanes.push(lane);
      for (const m of lane.movers) {
        if (carried.has(m) || m.held || !m.mesh.visible) continue;
        ctx.sliding.push({ lane, m, v: SLIDE_V0, x0: m.x, done: false });
      }
    }
    sfx.slam();
  },
  update(ctx, dt) {
    if (ctx.slideAt > 0 && (ctx.slideAt -= dt) <= 0) sfx.slide();
    const fx = ctx.world.config?.fx;
    for (const s of ctx.sliding) {
      if (s.done) continue;
      s.v += SLIDE_ACCEL * dt;
      s.m.x += s.v * dt;
      s.m.mesh.position.x = s.m.x;
      if (s.m.x < SPAN) continue;
      if (fx) for (let i = 0; i < 4; i++) fx.puff(new THREE.Vector3(SPAN, 0.3, -s.lane.r), 0x9a9a9a, rand(0.15, 0.25), rand(0.5, 0.8), new THREE.Vector3(rand(1, 3), rand(1, 2), rand(-0.5, 0.5)), 1.5);
      shelve(s);
    }
  },
  expire(ctx) {
    ctx.mode?.setForceTilt(false);
    for (const s of ctx.sliding) if (!s.done) shelve(s);
    for (const lane of ctx.lanes) {
      lane.frozen = false;
      const back = ctx.sliding.filter((s) => s.lane === lane && lane.data.train !== s.m).sort((a, b) => b.x0 * lane.dir - a.x0 * lane.dir);   // lead first
      if (!back.length) continue;
      const runway = lane.scenario.id === 'runway';
      const pitch = Math.max(back[0].m.len + 0.6, (SPAN - reenter()) / back.length);   // planes wrap on their own row, so they are packed to fit the ring
      const lead = back[0].x0 * lane.dir;
      back.forEach((s, i) => {
        const m = s.m;
        let u = -reenter() - (runway ? i * pitch : lead - s.x0 * lane.dir);
        if (runway) u = ((u + SPAN) % (2 * SPAN) + 2 * SPAN) % (2 * SPAN) - SPAN;   // the runway wraps its own planes and never releases a held one
        m.x = lane.dir * u;
        m.held = u < -SPAN;               // beyond the ring: Lane.advance walks it in and shows it at the edge
        m.mesh.visible = !m.held;
        m.mesh.position.x = m.x;
        m.v = 1;
      });
    }
  },
});

// A slid mover leaves play: a rail train goes back to its idle parking spot
// and its row goes quiet; anything else waits, hidden, off the end of the ring.
function shelve(s) {
  const { lane, m } = s;
  s.done = true;
  if (lane.data.train === m) {
    m.x = -lane.dir * (SPAN + m.len / 2);
    m.mesh.visible = false;
    Object.assign(lane.data, { state: 'idle', wait: rand(4, 8) });
  } else {
    m.x = holdX();
    m.held = true;
    m.mesh.visible = false;
  }
  m.mesh.position.x = m.x;
}
