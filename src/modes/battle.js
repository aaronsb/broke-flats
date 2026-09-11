// Air-Sea Battle. The board is gone; the chicken slides along the bottom row
// and lobs eggs up-screen at cars, boats and planes crossing at three depths.
// Timed. Ends the level and hands the run record to the next one.
import * as THREE from 'three';
import {
  makeGround, makeCar, makeTruck, makeBoat, makePlane, makeEgg, makeHeadlightCone,
  makeTree, makeHedge, makeShrub, makeParkedCar, makeFence, makeDumpster, makePlanter, makeBuildingCell, buildingStyle,
} from '../meshes.js';
import { Footprints } from '../scenery/footprints.js';
import { Debris } from '../debris.js';
import { setFrame } from '../characters.js';
import { W, SPAN } from '../lane.js';
import { sfx } from '../sfx.js';
import { music } from '../music.js';
import { CONE } from '../headlights.js';
import { rand, pick, clamp } from '../util.js';

const ROWS = { land: 4, sea: 8, air: 12 };            // z depth of each target row
const POINTS = { land: 10, sea: 20, air: 30 };
const TILTS = ['land', 'sea', 'air'];                 // each tilt aims at one row
// [camera preset, ground point the camera looks at]
const VIEW = { land: ['battleLand', 3.5], sea: ['battleSea', 8.7], air: ['battleAir', 13.7] };
const FIELD_W = 400;   // wide enough to reach the fog at every tilt
const GRID_X = 40;     // props are placed on cells out to ±GRID_X
// Field themes: prop mix (weighted by repetition), building style and how
// often a footprint is attempted per side per row. One is picked per battle.
const tall = () => makeTree(true);
const THEMES = {
  forest:      { props: [tall, tall, tall, makeTree, makeTree, makeHedge, makeHedge, makeShrub, makeShrub], building: 'house', buildProb: 0.08 },
  residential: { props: [makeFence, makeFence, makeShrub, makeShrub, makeTree, tall, tall, makeHedge], building: 'house', buildProb: 0.5 },
  city:        { props: [makeDumpster, makePlanter, makePlanter, makePlanter, makeTree, makeTree, makeHedge, makeParkedCar], building: 'tower', buildProb: 0.7 },
  parking:     { props: [makeParkedCar, makeFence, makeFence, makePlanter, makePlanter, makeShrub, makeTree, makeHedge], building: 'tower', buildProb: 0.15 },
};
const HEIGHT = { land: 0.6, sea: 0.6, air: 3.2 };
const PROP_POINTS = 5;
const SLIDE = 7, EGG_SPEED = 14, COOLDOWN = 0.3;
// Per-pilot keys: player 1 moves on the arrows and fires with Space, player 2
// moves on WASD and fires with Q. Shift cycles the aim for everyone.
const PILOT_KEYS = [
  { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', fire: ['Space'] },
  { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', fire: ['KeyQ'] },
];
const AIM_KEYS = ['ShiftLeft', 'ShiftRight', 'Tab'];
const FORWARD = 2.5;   // how far up the field a pilot may advance

export class BattleMode {
  constructor(game) {
    this.game = game;
    this.hint = 'arrows move · SPACE fire · SHIFT tilt to aim land, sea or air';
  }

  enter() {
    const { scene, level, sky } = this.game;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.mix = level.battle;
    this.timeLeft = this.mix.duration;
    this.points = 0;
    this.targets = [];
    this.eggs = [];
    this.spawnClock = { land: 1, sea: 2, air: 3 };
    this.keys = {};
    this.ending = 0;
    this.props = [];                 // breakable scenery inside the strip
    this.debris = new Debris(scene);

    this.buildField(sky);
    const roster = this.game.roster;
    this.pilots = roster.map((c, i) => {
      const mesh = c.make(this.game.run.variants[i]);
      this.group.add(mesh);
      return { mesh, cx: roster.length > 1 ? (i === 0 ? -2 : 2) : 0, cz: 0, cooldown: 0, keys: PILOT_KEYS[i] };
    });
    if (roster.length > 1) this.hint = 'P1 arrows + SPACE · P2 WASD + Q · SHIFT tilt to aim';

    this.aim = 'land';
    this.game.camera.snap(0, -VIEW.land[1], VIEW.land[0]);
    music.setMood({ battle: true, dead: false, tilted: false, danger: false });
    this.game.card(`LEVEL ${level.number} CLEAR · BATTLE`);
  }

  // Grid the field and fill it in one theme's style. Target rows and the
  // chicken's row stay clear; buildings take tetromino footprints outside the
  // strip; other cells roll for a prop.
  buildField(sky) {
    const fp = new Footprints();
    const lit = !!sky.dark;
    const theme = THEMES[pick(...Object.keys(THEMES))];
    for (let r = -6; r <= 16; r++) {
      const g = r === ROWS.land ? makeGround(FIELD_W, 0x4a4a52)
        : r === ROWS.sea ? makeGround(FIELD_W, 0x3f8fd6, -0.3, 0.2)
        : makeGround(FIELD_W, r % 2 ? 0x9ad24a : 0x8fca43);
      g.position.z = -r;
      this.group.add(g);
      if (r === ROWS.land || r === ROWS.sea) continue;

      const row = new THREE.Group();
      row.position.z = -r;
      const taken = new Set();
      for (const s of [-1, 1]) {
        const [a, b] = s < 0 ? [-GRID_X, -W - 2] : [W + 2, GRID_X];
        for (let i = 0; i < 3; i++) if (Math.random() < theme.buildProb) fp.plan(r, a, b, buildingStyle(theme.building, lit));
      }
      for (const cell of fp.take(r)) {
        const m = makeBuildingCell(cell.style, cell.x < 0 ? 1 : -1);
        m.position.x = cell.x;
        row.add(m);
        taken.add(cell.x);
        if (Math.abs(cell.x) <= W + 1) this.props.push({ mesh: m, x: cell.x, z: r, h: cell.style.h, hp: Math.max(1, Math.ceil(cell.style.h / 2.5)), lean: 0 });
      }
      for (let c = -GRID_X; c <= GRID_X; c++) {
        if (taken.has(c)) continue;
        const inStrip = Math.abs(c) <= W + 1;
        if (inStrip && r <= 3) continue;                  // clear sight lines in front of the chicken
        const density = inStrip ? (r >= 13 ? 0.45 : 0.02) : 0.3;
        if (Math.random() < density) {
          const m = pick(...theme.props)();
          m.position.x = c;
          row.add(m);
          if (inStrip) this.props.push({ mesh: m, x: c, z: r, h: 2.2, hp: 1, lean: 0 });
        }
      }
      this.group.add(row);
    }
    const far = makeGround(FIELD_W, 0x8fca43);
    far.scale.z = 120; far.position.z = -16.5 - 60;
    this.group.add(far);
  }

  exit() {
    this.debris.dispose();
    this.game.scene.remove(this.group);
    this.game.card('');
  }

  // An egg that clips scenery breaks it apart. Tall buildings take several
  // hits: each one cracks, leans the tower further and sheds windows; the
  // last tips it over before it shatters.
  hitProps(e, y) {
    for (const p of this.props) {
      if (p.tipping || Math.abs(e.x - p.x) > 0.6 || Math.abs(e.z - p.z) > 0.5 || y > p.h) continue;
      p.hp -= 1;
      if (p.hp > 0) {
        p.lean += 0.07;
        p.mesh.rotation.z = p.lean * (e.x < p.x ? -1 : 1);
        const windows = [];
        p.mesh.traverse((o) => { if (o.userData.window) windows.push(o); });
        for (const w of windows.sort(() => Math.random() - 0.5).slice(0, 2)) this.debris.shed(w);
        sfx.crack();
        return true;
      }
      if (p.h > 2.5) { p.tipping = { t: 0, dir: e.x < p.x ? -1 : 1 }; sfx.crack(); return true; }
      this.smash(p);
      return true;
    }
    return false;
  }

  smash(p) {
    this.debris.explode(p.mesh, 0.8 + p.h * 0.1);
    this.props = this.props.filter((q) => q !== p);
    this.points += PROP_POINTS * Math.ceil(p.h / 2);
    sfx.boom(0.6 + p.h * 0.1);
  }

  // Tip a doomed tower over from its base, then shatter it.
  updateTipping(dt) {
    for (const p of [...this.props]) {
      if (!p.tipping) continue;
      p.tipping.t += dt;
      const k = Math.min(1, p.tipping.t / 0.7);
      p.mesh.rotation.z = p.tipping.dir * (k * k) * (Math.PI / 2);
      if (k >= 1) this.smash(p);
    }
  }

  // Solo, both key sets drive pilot 0.
  pilotFor(i) { return this.pilots[this.pilots.length === 1 ? 0 : i]; }

  onKey(e) {
    this.keys[e.code] = true;
    if (AIM_KEYS.includes(e.code)) { this.cycleAim(); return true; }
    for (let i = 0; i < PILOT_KEYS.length; i++) {
      const k = PILOT_KEYS[i];
      if (k.fire.includes(e.code)) { this.fire(this.pilotFor(i)); return true; }
      if ([k.left, k.right, k.up, k.down].includes(e.code)) return true;
    }
    return false;
  }
  onKeyUp(e) { this.keys[e.code] = false; }
  onSwipe(dx, dy) {
    const p = this.pilots[0];
    if (Math.hypot(dx, dy) < 20) this.fire(p);
    else if (Math.abs(dx) > Math.abs(dy)) p.cx = clamp(p.cx + Math.sign(dx) * 2, -W, W);
    else this.cycleAim();
  }
  onViewButton() { this.cycleAim(); }

  // The tilt is the aim: boats are slow and cheap, planes fast and rich.
  cycleAim() {
    this.aim = TILTS[(TILTS.indexOf(this.aim) + 1) % TILTS.length];
    this.game.camera.setGoal(VIEW[this.aim][0]);
    sfx.tilt();
  }

  fire(pilot) {
    if (pilot.cooldown > 0 || this.ending) return;
    pilot.cooldown = COOLDOWN;
    const egg = makeEgg();
    egg.position.set(pilot.cx, 0.6, -pilot.cz);
    this.group.add(egg);
    this.eggs.push({ mesh: egg, x: pilot.cx, z: pilot.cz, z0: pilot.cz, aim: this.aim });
    setFrame(pilot.mesh, 1);
    setTimeout(() => setFrame(pilot.mesh, 0), 180);
    sfx.plink();
  }

  spawn(kind) {
    const t = kind === 'land' ? (Math.random() < 0.3 ? makeTruck() : makeCar())
      : kind === 'sea' ? makeBoat() : makePlane();
    t.kind = kind;
    t.dir = pick(-1, 1);
    const base = kind === 'sea' ? rand(1.5, 2.5) : kind === 'air' ? rand(5, 7.5) : rand(3, 4.5);
    t.speed = base + this.game.level.difficulty * 0.5;
    t.z = ROWS[kind];
    t.x = -t.dir * (SPAN + 2);
    t.mesh.position.set(t.x, kind === 'air' ? 3.2 : 0, -t.z);
    if (t.dir < 0) t.mesh.rotation.y = Math.PI;
    if (this.game.sky.headlights) {
      const reach = t.len * CONE;
      if (kind === 'land') t.mesh.add(makeHeadlightCone(reach));
      else if (kind === 'sea') t.mesh.add(makeHeadlightCone(reach, reach / 2 + 1.1, 0.1, 0, 0.9));
      else for (const dz of [-1.15, 1.15]) t.mesh.add(makeHeadlightCone(reach, reach / 2 + 0.2, 0.15, dz, 0.5));
    }
    this.group.add(t.mesh);
    this.targets.push(t);
  }

  update(dt) {
    const { game } = this;

    // Slide each pilot on its own keys
    const solo = this.pilots.length === 1;
    for (const p of this.pilots) {
      p.cooldown -= dt;
      let vx = 0, vz = 0;
      for (const k of (solo ? PILOT_KEYS : [p.keys])) {
        if (this.keys[k.left]) vx -= SLIDE;
        if (this.keys[k.right]) vx += SLIDE;
        if (this.keys[k.up]) vz += SLIDE * 0.7;
        if (this.keys[k.down]) vz -= SLIDE * 0.7;
      }
      p.cx = clamp(p.cx + vx * dt, -W, W);
      p.cz = clamp(p.cz + vz * dt, 0, FORWARD);
      p.mesh.position.set(p.cx, 0, -p.cz);
      p.mesh.rotation.y = vx < 0 ? Math.PI / 2 : vx > 0 ? -Math.PI / 2 : vz < 0 ? Math.PI : 0;
    }
    const cx = this.pilots.reduce((a, p) => a + p.cx, 0) / this.pilots.length;

    // Spawns, weighted by the level's mix
    if (!this.ending) for (const kind of ['land', 'sea', 'air']) {
      const n = this.mix[kind];
      if (!n) continue;
      this.spawnClock[kind] -= dt;
      if (this.spawnClock[kind] <= 0) { this.spawn(kind); this.spawnClock[kind] = rand(2.5, 4.5) / n; }
    }

    // Move targets, cull those that crossed
    for (const t of this.targets) {
      t.x += t.dir * t.speed * dt;
      t.mesh.position.x = t.x;
    }
    this.targets = this.targets.filter((t) => {
      const gone = Math.abs(t.x) > SPAN + 3;
      if (gone) this.group.remove(t.mesh);
      return !gone;
    });
    this.updateTipping(dt);
    this.debris.update(dt);

    // Eggs fly to the row they were aimed at and only hit targets there.
    for (const e of this.eggs) {
      e.z += EGG_SPEED * dt;
      const reach = ROWS[e.aim], k = Math.min(1, (e.z - e.z0) / (reach - e.z0));
      const y = 0.6 + Math.sin(k * Math.PI) * 2.2 + HEIGHT[e.aim] * k;
      e.mesh.position.set(e.x, y, -e.z);
      e.mesh.rotation.x += dt * 10;
      if (this.hitProps(e, y)) { e.z = 99; continue; }
      for (const t of this.targets) {
        if (t.kind !== e.aim || Math.abs(e.z - t.z) > 0.6 || Math.abs(e.x - t.x) > t.len / 2 + 0.3) continue;
        this.debris.explode(t.mesh, 1.2);
        this.targets = this.targets.filter((q) => q !== t);
        e.z = 99;
        this.points += POINTS[t.kind];
        game.run.coins += 1;
        sfx.boom(t.kind === 'air' ? 1.3 : t.kind === 'sea' ? 0.8 : 1);
        if (t.kind === 'sea') sfx.splash();
        break;
      }
    }
    this.eggs = this.eggs.filter((e) => { const gone = e.z > ROWS[e.aim] + 1; if (gone) this.group.remove(e.mesh); return !gone; });

    const tz = -VIEW[this.aim][1];
    game.camera.update(dt, cx * 0.3, tz);
    game.sky.update(dt, cx * 0.3, tz, game.camera.distance);
    game.headlights.update(this.targets.map((t) => (
      t.kind === 'air' ? { x: t.x, z: -t.z, dir: t.dir, len: t.len, y: 3.35, front: 0.2, lateral: [-1.15, 1.15] }
      : t.kind === 'sea' ? { x: t.x, z: -t.z, dir: t.dir, len: t.len, y: 0.15, front: 1.1 }
      : { x: t.x, z: -t.z, dir: t.dir, len: t.len }
    )), -ROWS.sea);
    game.hud(game.run.score + this.points, `<b>${game.run.flock.reduce((a, f) => a + (f?.count ?? 0), 0)}</b>`);

    if (this.ending) {
      this.ending += dt;
      if (this.ending > 2.5) { game.run.score += this.points; game.nextLevel(); }
      return;
    }
    this.timeLeft -= dt;
    game.card(`BATTLE ${Math.ceil(this.timeLeft)} · +${this.points}`);
    if (this.timeLeft <= 0) { this.ending = 0.001; game.card(`BATTLE OVER · +${this.points}`); sfx.start(); }
  }
}
