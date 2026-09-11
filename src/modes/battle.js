// Air-Sea Battle. The board is gone; the chicken slides along the bottom row
// and lobs eggs up-screen at cars, boats and planes crossing at three depths.
// Timed. Ends the level and hands the run record to the next one.
import * as THREE from 'three';
import { makeChicken, makeGround, makeCar, makeTruck, makeBoat, makePlane, makeEgg, makeHeadlightCone, makeTree, makeHedge } from '../meshes.js';
import { Lane } from '../lane.js';
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
const HEIGHT = { land: 0.6, sea: 0.6, air: 3.2 };
const SLIDE = 7, EGG_SPEED = 14, COOLDOWN = 0.3;

export class BattleMode {
  constructor(game) {
    this.game = game;
    this.hint = 'A/D slide · SPACE / W / UP fire · S / DOWN tilt to aim land, sea or air';
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
    this.cooldown = 0;
    this.ending = 0;

    // The field borrows the level's scenery for the strip edges, and the far
    // rows get trees and hedges so the horizon is not bare.
    const scenery = this.game.scenery();
    const fakeWorld = { data: {}, config: { sky, scenery } };
    for (let r = -6; r <= 16; r++) {
      const g = r === ROWS.land ? makeGround(FIELD_W, 0x4a4a52)
        : r === ROWS.sea ? makeGround(FIELD_W, 0x3f8fd6, -0.3, 0.2)
        : makeGround(FIELD_W, r % 2 ? 0x9ad24a : 0x8fca43);
      g.position.z = -r;
      this.group.add(g);
      if (r === ROWS.land || r === ROWS.sea) continue;
      const lane = new Lane(r, null, fakeWorld);
      lane.edges();
      if (r > 0 && r !== ROWS.air) for (let c = -W; c <= W; c++) {
        if (r >= 13 && Math.random() < 0.5) lane.add(Math.random() < 0.6 ? makeTree(true) : makeHedge(), c);
        else if (Math.random() < 0.06) lane.add(makeTree(), c);
      }
      for (let c = W + 8; c <= 40; c += 1) for (const s of [-1, 1]) if (Math.random() < 0.35) lane.add(makeTree(true), s * c);
      this.group.add(lane.group);
    }
    const far = makeGround(FIELD_W, 0x8fca43);   // plain ground out to the fog line
    far.scale.z = 120; far.position.z = -16.5 - 60;
    this.group.add(far);
    this.chicken = makeChicken();
    this.group.add(this.chicken);
    this.cx = 0;

    this.aim = 'land';
    this.game.camera.snap(0, -VIEW.land[1], VIEW.land[0]);
    music.setMood({ battle: true, dead: false, tilted: false, danger: false });
    this.game.card(`LEVEL ${level.number} CLEAR · BATTLE`);
  }

  exit() {
    this.game.scene.remove(this.group);
    this.game.card('');
  }

  onKey(e) {
    this.keys[e.code] = true;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { this.fire(); return true; }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { this.cycleAim(); return true; }
    return e.code in { ArrowLeft: 1, ArrowRight: 1, KeyA: 1, KeyD: 1 };
  }
  onKeyUp(e) { this.keys[e.code] = false; }
  onSwipe(dx, dy) {
    if (Math.hypot(dx, dy) < 20) this.fire();
    else if (Math.abs(dx) > Math.abs(dy)) this.cx = clamp(this.cx + Math.sign(dx) * 2, -W, W);
    else this.cycleAim();
  }
  onViewButton() { this.cycleAim(); }

  // The tilt is the aim: boats are slow and cheap, planes fast and rich.
  cycleAim() {
    this.aim = TILTS[(TILTS.indexOf(this.aim) + 1) % TILTS.length];
    this.game.camera.setGoal(VIEW[this.aim][0]);
    sfx.tilt();
  }

  fire() {
    if (this.cooldown > 0 || this.ending) return;
    this.cooldown = COOLDOWN;
    const egg = makeEgg();
    egg.position.set(this.cx, 0.6, 0);
    this.group.add(egg);
    this.eggs.push({ mesh: egg, x: this.cx, z: 0, aim: this.aim });
    sfx.hop();
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
    this.cooldown -= dt;

    // Slide
    let vx = 0;
    if (this.keys.ArrowLeft || this.keys.KeyA) vx -= SLIDE;
    if (this.keys.ArrowRight || this.keys.KeyD) vx += SLIDE;
    this.cx = clamp(this.cx + vx * dt, -W, W);
    this.chicken.position.x = this.cx;
    this.chicken.rotation.y = vx < 0 ? Math.PI / 2 : vx > 0 ? -Math.PI / 2 : 0;

    // Spawns, weighted by the level's mix
    if (!this.ending) for (const kind of ['land', 'sea', 'air']) {
      const n = this.mix[kind];
      if (!n) continue;
      this.spawnClock[kind] -= dt;
      if (this.spawnClock[kind] <= 0) { this.spawn(kind); this.spawnClock[kind] = rand(2.5, 4.5) / n; }
    }

    // Move targets, cull those that crossed
    for (const t of this.targets) {
      if (t.dying !== undefined) { t.dying += dt; t.mesh.scale.setScalar(Math.max(0.01, 1 - t.dying * 5)); continue; }
      t.x += t.dir * t.speed * dt;
      t.mesh.position.x = t.x;
    }
    this.targets = this.targets.filter((t) => {
      const gone = Math.abs(t.x) > SPAN + 3 || (t.dying !== undefined && t.dying > 0.2);
      if (gone) this.group.remove(t.mesh);
      return !gone;
    });

    // Eggs fly to the row they were aimed at and only hit targets there.
    for (const e of this.eggs) {
      e.z += EGG_SPEED * dt;
      const reach = ROWS[e.aim], k = Math.min(1, e.z / reach);
      e.mesh.position.set(e.x, 0.6 + Math.sin(k * Math.PI) * 2.2 + HEIGHT[e.aim] * k, -e.z);
      e.mesh.rotation.x += dt * 10;
      for (const t of this.targets) {
        if (t.kind !== e.aim || t.dying !== undefined || Math.abs(e.z - t.z) > 0.6 || Math.abs(e.x - t.x) > t.len / 2 + 0.3) continue;
        t.dying = 0;
        e.z = 99;
        this.points += POINTS[t.kind];
        game.run.coins += 1;
        (t.kind === 'sea' ? sfx.splash : sfx.splat)();
        break;
      }
    }
    this.eggs = this.eggs.filter((e) => { const gone = e.z > ROWS[e.aim] + 1; if (gone) this.group.remove(e.mesh); return !gone; });

    const tz = -VIEW[this.aim][1];
    game.camera.update(dt, this.cx * 0.3, tz);
    game.sky.update(dt, this.cx * 0.3, tz, game.camera.distance);
    game.headlights.update(this.targets.filter((t) => t.dying === undefined).map((t) => (
      t.kind === 'air' ? { x: t.x, z: -t.z, dir: t.dir, len: t.len, y: 3.35, front: 0.2, lateral: [-1.15, 1.15] }
      : t.kind === 'sea' ? { x: t.x, z: -t.z, dir: t.dir, len: t.len, y: 0.15, front: 1.1 }
      : { x: t.x, z: -t.z, dir: t.dir, len: t.len }
    )), -ROWS.sea);
    game.hud(game.run.score + this.points);

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
