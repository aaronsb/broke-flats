// The hearing at the Department of Pedestrian Grievances. The board is gone;
// the chicken slides along the bottom row and files complaint forms up-screen
// at the cars, boats and planes that nearly ran it over all day, crossing at
// three depths. Each hit is damages awarded. Timed: the office closes, the
// case closes, and the run record goes on to the next day.
import * as THREE from 'three';
import {
  box, makeGround, makeCar, makeTruck, makeBoat, makePlane, makeForm, makeHeadlightCone,
  makeTrain, makeTree, makeHedge, makeDistrictSign, makeShrub, makeParkedCar, makeFence, makeDumpster, makePlanter, makeBuildingCell, buildingStyle,
} from '../meshes.js';
import { Footprints } from '../scenery/footprints.js';
import { Debris } from '../debris.js';
import { HEADER } from '../summary.js';
import { setFrame } from '../characters.js';
import { W, VIEW as OFFSCREEN } from '../lane.js';   // VIEW is taken here by the camera presets
import { sfx } from '../sfx.js';
import { music } from '../music.js';
import { CONE } from '../headlights.js';
import { rand, randInt, pick, clamp } from '../util.js';
import { LEVELS } from '../levels.js';

const ROWS = { land: 4, sea: 8, air: 12 };            // z depth of each target row
const POINTS = { land: 10, sea: 20, air: 30 };
const TILTS = ['land', 'sea', 'air'];                 // each tilt aims at one row
const DESK = { land: 'ROADS', sea: 'HARBOR', air: 'AVIATION' };   // what the placard calls each row
// [camera preset, ground point the camera looks at]
const VIEW = { land: ['battleLand', 3.5], sea: ['battleSea', 8.7], air: ['battleAir', 13.7] };
const FIELD_W = 400;   // wide enough to reach the fog at every tilt
const GRID_X = 40;     // props are placed on cells out to ±GRID_X
// Field themes: prop mix (weighted by repetition), building style and how
// often a footprint is attempted per side per row. One is picked per hearing.
const tall = () => makeTree(true);
const CHAR = new THREE.MeshLambertMaterial({ color: 0x1a1410 });   // what is left of a tree
const CHAR_HOLD = 0.7;    // seconds the black stick stands before it crumbles
const THEMES = {
  forest:      { props: [tall, tall, tall, makeTree, makeTree, makeHedge, makeHedge, makeShrub, makeShrub], building: 'house', buildProb: 0.08 },
  residential: { props: [makeFence, makeFence, makeShrub, makeShrub, makeTree, tall, tall, makeHedge], building: 'house', buildProb: 0.5 },
  city:        { props: [makeDumpster, makePlanter, makePlanter, makePlanter, makeTree, makeTree, makeHedge, makeParkedCar], building: 'tower', buildProb: 0.7 },
  parking:     { props: [makeParkedCar, makeFence, makeFence, makePlanter, makePlanter, makeShrub, makeTree, makeHedge], building: 'tower', buildProb: 0.15 },
};
const HEIGHT = { land: 0.6, sea: 0.6, air: 3.2 };
const NEXT = { land: 'sea', sea: 'air' };            // where a missed form bounces on to
const FAR = ROWS.air + 2;                             // forms past here burst in the air
const PROP_POINTS = 5;
const SLIDE = 7, EGG_SPEED = 14, COOLDOWN = 0.3;
const ARC = 2.2, BOUNCE_ARC = 0.55;                   // first-arc height and the bounce's share of it
const VOLLEY_MS = 60;                                 // stagger between follower forms
const YOUNG_DMG = 0.5, YOUNG_SCALE = 0.6;
// Per-pilot keys: player 1 moves on the arrows and fires with Space, player 2
// moves on WASD and fires with Q. Shift cycles the aim for everyone.
const PILOT_KEYS = [
  { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', fire: ['Space'] },
  { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', fire: ['KeyQ'] },
];
const AIM_KEYS = ['ShiftLeft', 'ShiftRight', 'Tab'];
const FORWARD = 2.5;   // how far up the field a pilot may advance
// The doors out: when the case closes, each end of the pilots' row opens onto
// one of the ways on across the town map. A pilot sliding this far past the
// edge has left by that door.
const DOOR_X = W + 1.2, DOOR_OUT = W + 1.6;

export class BattleMode {
  constructor(game) {
    this.game = game;
    this.hint = 'arrows move · SPACE file a complaint · SHIFT tilt to the next window';
  }

  get mood() { return { hearing: true }; }

  enter() {
    const { scene, level, sky } = this.game;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.mix = level.battle;
    this.timeLeft = this.mix.duration;
    this.points = 0;
    this.tally = { land: 0, sea: 0, air: 0, train: 0, props: 0 };
    this.crossedUnhit = 0;           // targets that left the field without taking a hit
    this.targets = [];
    this.eggs = [];
    this.spawnClock = { land: 1, sea: 2, air: 3 };
    this.rowDir = { land: pick(-1, 1), sea: pick(-1, 1), air: pick(-1, 1) };   // one way per row, all hearing
    this.keys = {};
    this.ending = 0;
    this.doors = null;               // [left, right] ways out once the case is closed, each { p, spot } or null
    this.reach = [-W, W];            // how far the pilots may slide; an open door widens its side
    this.props = [];                 // breakable scenery inside the strip
    this.burning = [];               // trees part way through going up
    this.debris = new Debris(scene);

    this.buildField(sky);
    const roster = this.game.roster;
    this.pilots = roster.map((c, i) => {
      const mesh = c.make(this.game.run.variants[i]);
      this.group.add(mesh);
      const cx = roster.length > 1 ? (i === 0 ? -2 : 2) : 0;
      // The flock comes along for the show, trailing the pilot's path.
      const young = [];
      for (let k = 0; k < (this.game.flockFor(i).count ?? 0); k++) {
        const m = c.young(this.game.run.variants[i]);
        m.position.set(cx, 0, 0.7 * (k + 1));
        this.group.add(m);
        young.push(m);
      }
      return { mesh, cx, cz: 0, cooldown: 0, keys: PILOT_KEYS[i], young, trail: [{ x: cx, z: 0 }] };
    });
    if (roster.length > 1) this.hint = 'P1 arrows + SPACE · P2 WASD + Q · SHIFT tilt to the next window';

    this.aim = 'land';
    this.showAim();
    this.game.camera.snap(0, -VIEW.land[1], VIEW.land[0]);
    if (!this.game.debug.quickBanner) this.game.banner.show('hearing', { title: HEADER, sub: `RE: ${level.district.name} · DAY ${level.number}` });
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
        const mid = (r >= 5 && r <= 7) || (r >= 9 && r <= 11);   // between the target rows
        const density = inStrip ? (r >= 13 ? 0.45 : mid ? 0.18 : 0.02) : 0.3;
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

  // The case is closed: a door opens at each end of the row the map offers a
  // way through, a sign over it names where it leads, and a way the map
  // closes gets a barrier. With no map spot to leave from (a level reached
  // by number: a debug jump, or ?battle&level=N past the first) the day just moves on.
  openDoors() {
    const { game } = this;
    this.doors = game.exits();
    if (!this.doors.some(Boolean)) { this.doors = null; game.nextLevel(); return; }
    this.doors.forEach((d, k) => {
      const side = k ? 1 : -1;
      const x = side * DOOR_X;
      const frame = new THREE.Group();
      const post = d ? 0x6e5220 : 0x8a1a14;
      frame.add(box(0.2, 1.8, 0.2, post, 0, 0, -0.5), box(0.2, 1.8, 0.2, post, 0, 0, 0.5), box(0.24, 0.2, 1.2, post, 0, 1.8, 0));
      if (!d) for (const y of [0.5, 1.1]) frame.add(box(0.12, 0.16, 1.1, 0xf4f2ea, 0, y, 0));
      frame.position.x = x;
      this.group.add(frame);
      const lines = d
        ? [side < 0 ? '< THIS WAY' : 'THIS WAY >', LEVELS[d.spot.district].district.name, d.spot.gauntlet ? `${d.spot.gauntlet.toUpperCase()} GAUNTLET` : LEVELS[d.spot.district].district.motto]
        : ['CLOSED', 'NO THROUGH ROUTE', 'BY ORDER OF THE DEPT.'];
      const sign = makeDistrictSign(lines);
      sign.scale.setScalar(0.6);
      sign.position.set(side * (W - 1.2), 0, -1.6);
      this.group.add(sign);
    });
    this.reach = [this.doors[0] ? -DOOR_OUT - 0.1 : -W, this.doors[1] ? DOOR_OUT + 0.1 : W];
    const name = (d) => (d ? LEVELS[d.spot.district].district.name : 'CLOSED');
    game.card(`< ${name(this.doors[0])} · PICK A DOOR · ${name(this.doors[1])} >`);
    game.showMap(this.doors.filter(Boolean).map((d) => d.p));
    sfx.clink();
  }

  // The first pilot through a door chooses the way for everyone.
  walkOut() {
    const out = this.pilots.find((p) => Math.abs(p.cx) >= DOOR_OUT);
    if (!out) return;
    const d = this.doors[out.cx < 0 ? 0 : 1];
    if (!d) return;
    this.doors = [];            // once only: nextLevel replaces this mode
    this.game.card('');
    this.game.nextLevel(d.p);
  }

  exit() {
    this.debris.dispose();
    this.game.scene.remove(this.group);
    this.game.card('');
    const v = this.game.ui.view;
    v.hidden = true;
    v.textContent = 'TILT';
    for (const b of this.burning) b.mesh.parent?.remove(b.mesh);
    this.burning = [];
  }

  // A form that clips scenery breaks it apart. Tall buildings take several
  // hits: each one cracks, leans the tower further and sheds windows; the
  // last tips it over before it shatters.
  hitProps(e, y) {
    for (const p of this.props) {
      if (p.tipping || Math.abs(e.x - p.x) > 0.6 || Math.abs(e.z - p.z) > 0.5 || y > p.h) continue;
      p.hp -= e.dmg;
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
    this.props = this.props.filter((q) => q !== p);
    this.points += PROP_POINTS * Math.ceil(p.h / 2);
    this.tally.props++;
    if (p.mesh.userData.burns) { this.torch(p); return; }
    this.debris.explode(p.mesh, 0.8 + p.h * 0.1);
    sfx.boom(0.6 + p.h * 0.1);
  }

  // A tree does not shatter, it goes up. Fire takes the canopy in one fwoosh
  // and leaves a black stick standing in the smoke, which crumbles a moment
  // later — tree, fire, stick, gone.
  torch(p) {
    const at = new THREE.Vector3();
    p.mesh.getWorldPosition(at);
    at.y += 0.6;
    this.debris.ignite(at, 0.9 + p.h * 0.1);
    sfx.fwoosh();
    p.mesh.traverse((o) => {
      if (!o.isMesh) return;
      if (o.userData.trunk) o.material = CHAR;   // charred, still standing
      else o.visible = false;                    // the canopy is what burns off
    });
    this.burning.push({ mesh: p.mesh, t: 0, at });
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
    else if (Math.abs(dx) > Math.abs(dy)) p.cx = clamp(p.cx + Math.sign(dx) * 2, this.reach[0], this.reach[1]);   // an open door is in reach
    else this.cycleAim();
  }
  onViewButton() { this.cycleAim(); }

  // The placard doubles as the aim control here — onViewButton cycles it — so
  // it has to be on screen and has to name the window the forms are going to.
  // Without it a touch player has no visible way to shift aim at all.
  showAim() {
    const v = this.game.ui.view;
    v.hidden = false;
    v.textContent = DESK[this.aim];
    v.classList.remove('on', 'broke', 'nudge');
  }

  // The tilt is the aim: boats are slow and cheap, planes fast and rich.
  cycleAim() {
    this.aim = TILTS[(TILTS.indexOf(this.aim) + 1) % TILTS.length];
    this.game.camera.setGoal(VIEW[this.aim][0]);
    this.showAim();
    sfx.tilt();
  }

  // The pilot's form leads and the flock's follow, one every few frames, all
  // at the window that was aimed when the trigger went.
  fire(pilot) {
    if (pilot.cooldown > 0 || this.ending) return;
    pilot.cooldown = COOLDOWN;
    const aim = this.aim;
    this.launch(pilot.cx, pilot.cz, aim, 1, 1);
    setFrame(pilot.mesh, 1);
    setTimeout(() => setFrame(pilot.mesh, 0), 180);
    pilot.young.forEach((m, k) => setTimeout(() => {
      if (this.ending || this.game.mode !== this) return;
      this.launch(m.position.x, -m.position.z, aim, YOUNG_DMG, YOUNG_SCALE);
      setFrame(m, 1);
      setTimeout(() => setFrame(m, 0), 180);
    }, VOLLEY_MS * (k + 1)));
  }

  launch(x, z, aim, dmg, scale) {
    const form = makeForm();
    form.scale.setScalar(scale);
    form.position.set(x, 0.6, -z);
    this.group.add(form);
    this.eggs.push({ mesh: form, x, z, from: z, to: ROWS[aim], kind: aim, h0: 0, h1: HEIGHT[aim], amp: ARC, dmg, bounced: false });
    sfx.plink();
  }

  // A half-damaged target rocks and puffs; the finishing hit gets the boom and
  // the coin, whoever threw it.
  hitTargets(e) {
    for (const t of this.targets) {
      if (t.kind !== e.kind || Math.abs(e.z - t.z) > 0.6 || Math.abs(e.x - t.x) > t.len / 2 + 0.3) continue;
      t.hp = (t.hp ?? 1) - e.dmg;
      if (t.hp > 0) {
        t.mesh.rotation.z = (e.x < t.x ? -1 : 1) * 0.12;
        this.debris.puff(e.mesh.position, 0x8a8a8a, 0.25, 0.6, new THREE.Vector3(0, 1.5, 0), 2);
        sfx.crack();
        return true;
      }
      this.debris.explode(t.mesh, 1.2);
      this.targets = this.targets.filter((q) => q !== t);
      this.points += t.points;
      this.tally[t.points === 60 ? 'train' : t.kind]++;
      this.game.run.coins += 1;
      sfx.boom(t.kind === 'air' ? 1.3 : t.kind === 'sea' ? 0.8 : 1);
      if (t.kind === 'sea') sfx.splash();
      return true;
    }
    return false;
  }

  // Off the back of the map: a flash, a boom, nothing on the board.
  airburst(at) {
    this.debris.burst(at, 0.9);
    this.debris.puff(at, 0xffffff, 1.1, 0.16, new THREE.Vector3(), 1.6);
    this.debris.puff(at, 0xffe36b, 0.8, 0.22, new THREE.Vector3(), 2.2);
    sfx.boom(0.5);
  }

  // Followers sit at fixed distances back along the pilot's recorded path.
  trailFlock(p, moving) {
    const head = p.trail[0];
    if (Math.hypot(p.cx - head.x, -p.cz - head.z) > 0.08) p.trail.unshift({ x: p.cx, z: -p.cz });
    if (p.trail.length > 400) p.trail.length = 400;
    p.young.forEach((m, k) => {
      let want = 0.7 * (k + 1), i = 0;
      while (i + 1 < p.trail.length) {
        const a = p.trail[i], b = p.trail[i + 1];
        const seg = Math.hypot(b.x - a.x, b.z - a.z);
        if (seg >= want) { const t = want / seg; m.position.set(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t); break; }
        want -= seg; i++;
      }
      if (i + 1 >= p.trail.length) { const e = p.trail[p.trail.length - 1]; m.position.set(e.x, 0, e.z + want); }
      const ahead = k === 0 ? p.mesh.position : p.young[k - 1].position;
      m.rotation.y = Math.atan2(-(ahead.x - m.position.x), -(ahead.z - m.position.z));
      setFrame(m, moving && Math.floor(performance.now() / 120) % 2 === 0 ? 1 : 0);
    });
  }

  // Overlap on a row: the slower one loses. A train catching a queue of cars
  // plows straight through them.
  plow() {
    const dead = new Set();
    const list = this.targets;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.kind !== b.kind || Math.abs(a.x - b.x) >= (a.len + b.len) / 2 - 0.1) continue;
        dead.add(a.speed < b.speed ? a : b);
      }
    }
    if (!dead.size) return;
    for (const t of dead) this.debris.explode(t.mesh, 1.2);
    this.targets = list.filter((t) => !dead.has(t));
    sfx.boom(1.1);
  }

  // Everything on a row travels the same way, and a newcomer waits until the
  // entry point is clear of the last one.
  spawn(kind) {
    const dir = this.rowDir[kind];
    const train = kind === 'land' && Math.random() < 0.15;
    const t = train ? makeTrain(pick('steam', 'diesel', 'bullet'), Array.from({ length: randInt(2, 4) }, () => 'closed'))
      : kind === 'land' ? (Math.random() < 0.3 ? makeTruck() : makeCar())
      : kind === 'sea' ? makeBoat() : makePlane();
    const entry = -dir * (OFFSCREEN + 2 + t.len / 2);
    if (this.targets.some((o) => o.kind === kind && Math.abs(o.x - entry) < (o.len + t.len) / 2 + 1.5)) return false;
    t.kind = kind;
    t.hp = 1;
    t.points = train ? 60 : POINTS[kind];
    t.dir = dir;
    const base = train ? rand(5, 7) : kind === 'sea' ? rand(1.5, 2.5) : kind === 'air' ? rand(5, 7.5) : rand(3, 4.5);
    t.speed = base + this.game.level.difficulty * 0.5;
    t.z = ROWS[kind];
    t.x = -t.dir * (OFFSCREEN + 2 + t.len / 2);
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
    return true;
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
      p.cx = clamp(p.cx + vx * dt, this.reach[0], this.reach[1]);
      p.cz = clamp(p.cz + vz * dt, 0, FORWARD);
      p.mesh.position.set(p.cx, 0, -p.cz);
      p.mesh.rotation.y = vx < 0 ? Math.PI / 2 : vx > 0 ? -Math.PI / 2 : vz < 0 ? Math.PI : 0;
      this.trailFlock(p, vx !== 0 || vz !== 0);
    }
    const cx = this.pilots.reduce((a, p) => a + p.cx, 0) / this.pilots.length;

    // Spawns, weighted by the level's mix
    if (!this.ending) for (const kind of ['land', 'sea', 'air']) {
      const n = this.mix[kind];
      if (!n) continue;
      this.spawnClock[kind] -= dt;
      if (this.spawnClock[kind] <= 0) this.spawnClock[kind] = this.spawn(kind) ? rand(2.5, 4.5) / n : 0.3;   // entry blocked: try again shortly
    }

    // Move targets, cull those that crossed
    for (const t of this.targets) {
      t.x += t.dir * t.speed * dt;
      t.mesh.position.x = t.x;
    }
    this.targets = this.targets.filter((t) => {
      const gone = Math.abs(t.x) > OFFSCREEN + 3 + t.len / 2;
      if (gone) { this.group.remove(t.mesh); if (t.hp === 1) this.crossedUnhit++; }
      return !gone;
    });
    this.plow();
    this.updateTipping(dt);
    this.debris.update(dt);
    for (const b of this.burning) {
      b.t += dt;
      const k = Math.max(0, (b.t - CHAR_HOLD) / 0.35);
      if (k > 0) b.mesh.scale.setScalar(Math.max(0.001, 1 - k));
    }
    this.burning = this.burning.filter((b) => {
      if (b.t <= CHAR_HOLD + 0.35) return true;
      for (let i = 0; i < 3; i++) this.debris.puff(b.at, 0x8a8a8a, 0.22, 1.1, new THREE.Vector3(rand(-0.3, 0.3), rand(1, 1.8), rand(-0.3, 0.3)), 2);
      b.mesh.parent?.remove(b.mesh);
      return false;
    });

    // Forms arc to the row they were aimed at and only hit targets there. A
    // miss skips once, lower and on to the next row; a miss after that drops
    // in the harbor or flies off the back and bursts.
    for (const e of this.eggs) {
      e.z += EGG_SPEED * dt;
      const k = Math.min(1, (e.z - e.from) / (e.to - e.from));
      const y = 0.6 + Math.sin(k * Math.PI) * e.amp + e.h0 + (e.h1 - e.h0) * k;
      e.mesh.position.set(e.x, y, -e.z);
      e.mesh.rotation.x += dt * 10;
      e.mesh.rotation.z += dt * 6.5;   // a second axis: the slip flutters rather than spins
      if (this.hitProps(e, y) || this.hitTargets(e)) { e.gone = true; continue; }
      if (e.z > FAR) { this.airburst(e.mesh.position); e.gone = true; continue; }
      if (e.z <= e.to + 0.6 || e.kind === 'air') continue;
      if (e.bounced) {
        this.debris.splash(e.mesh.position, 0.6);
        e.gone = true;
        continue;
      }
      const next = NEXT[e.kind];
      this.debris.puff(e.mesh.position, 0xcfcfcf, 0.18, 0.4, new THREE.Vector3(0, 1, 0), 2);
      Object.assign(e, { from: e.z, to: ROWS[next], h0: HEIGHT[e.kind], h1: HEIGHT[next], kind: next, amp: ARC * BOUNCE_ARC, bounced: true });
    }
    this.eggs = this.eggs.filter((e) => { if (e.gone) this.group.remove(e.mesh); return !e.gone; });

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
      // Watchdog: a case-closed panel that can no longer close by itself for a second lets the doors open anyway.
      if (!this.summaryDone) {
        this.stuck = game.summary.stuck() ? (this.stuck ?? 0) + dt : 0;
        if (this.stuck > 1) { console.warn('hearing watchdog: the summary never closed; opening the doors'); this.summaryDone = true; }
      }
      if (this.summaryDone && !this.doors) this.openDoors();
      if (this.doors) this.walkOut();
      return;
    }
    if (!this.game.banner.up) this.timeLeft -= dt;   // the clock waits for the sign
    game.card(`OFFICE CLOSES IN ${Math.ceil(this.timeLeft)} · AWARDED ${this.points}`);
    if (this.timeLeft <= 0) {
      this.ending = 0.001;
      game.card('');
      music.reset({ tally: true });
      const T = this.tally;
      game.summary.show('CASE CLOSED', [
        { label: 'ROAD CLAIMS', count: T.land, each: POINTS.land }, { label: 'MARINE CLAIMS', count: T.sea, each: POINTS.sea },
        { label: 'AVIATION CLAIMS', count: T.air, each: POINTS.air }, { label: 'RAIL CLAIMS', count: T.train, each: 60 },
        { label: 'COLLATERAL (UNCONTESTED)', count: T.props, each: PROP_POINTS },
      ], {
        mul: game.scoreMul(), onTotal: (v) => { game.run.score += v; }, done: () => { this.summaryDone = true; },
        stamp: `CASE CLOSED · DAY ${game.level.number}`,
        ruling: { text: this.crossedUnhit === 0 ? 'UPHELD' : 'DISMISSED', bonus: 0 },
      });
    }
  }
}
