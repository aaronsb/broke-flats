// Air-Sea Battle. The board is gone; the chicken slides along the bottom row
// and lobs eggs up-screen at cars, boats and planes crossing at three depths.
// Timed. Ends the level and hands the run record to the next one.
import * as THREE from 'three';
import { makeChicken, makeGround, makeCar, makeTruck, makeBoat, makePlane, makeEgg, makeHeadlightCone } from '../meshes.js';
import { W, SPAN, GW } from '../lane.js';
import { sfx } from '../sfx.js';
import { music } from '../music.js';
import { rand, pick, clamp } from '../util.js';

const ROWS = { land: 4, sea: 8, air: 12 };            // z depth of each target row
const POINTS = { land: 10, sea: 20, air: 30 };
const SLIDE = 7, EGG_SPEED = 14, COOLDOWN = 0.3;

export class BattleMode {
  constructor(game) {
    this.game = game;
    this.hint = 'A/D or arrows slide · SPACE / W / UP fire eggs';
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
    this.dark = sky.dark;

    for (let r = 0; r <= 14; r++) {
      const g = r === ROWS.land ? makeGround(GW, 0x4a4a52)
        : r === ROWS.sea ? makeGround(GW, 0x3f8fd6, -0.3, 0.2)
        : makeGround(GW, r % 2 ? 0x9ad24a : 0x8fca43);
      g.position.z = -r;
      this.group.add(g);
    }
    this.chicken = makeChicken();
    this.group.add(this.chicken);
    this.cx = 0;

    this.game.camera.snap(0, -6, 'battle');
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
    return e.code in { ArrowLeft: 1, ArrowRight: 1, KeyA: 1, KeyD: 1 };
  }
  onKeyUp(e) { this.keys[e.code] = false; }
  onSwipe(dx) { if (Math.abs(dx) < 20) this.fire(); else this.cx = clamp(this.cx + Math.sign(dx) * 2, -W, W); }
  onViewButton() {}

  fire() {
    if (this.cooldown > 0 || this.ending) return;
    this.cooldown = COOLDOWN;
    const egg = makeEgg();
    egg.position.set(this.cx, 0.6, 0);
    this.group.add(egg);
    this.eggs.push({ mesh: egg, x: this.cx, z: 0 });
    sfx.hop();
  }

  spawn(kind) {
    const t = kind === 'land' ? (Math.random() < 0.3 ? makeTruck() : makeCar())
      : kind === 'sea' ? makeBoat() : makePlane();
    t.kind = kind;
    t.dir = pick(-1, 1);
    t.speed = rand(2.5, 4.5) + this.game.level.difficulty * 0.5 + (kind === 'air' ? 1.5 : 0);
    t.z = ROWS[kind];
    t.x = -t.dir * (SPAN + 2);
    t.mesh.position.set(t.x, kind === 'air' ? 3.2 : 0, -t.z);
    if (t.dir < 0) t.mesh.rotation.y = Math.PI;
    if (this.dark && kind === 'land') t.mesh.add(makeHeadlightCone(2.2));
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

    // Eggs
    for (const e of this.eggs) {
      e.z += EGG_SPEED * dt;
      e.mesh.position.set(e.x, 0.6 + Math.sin(e.z * 0.4) * 0.3, -e.z);
      e.mesh.rotation.x += dt * 10;
      for (const t of this.targets) {
        if (t.dying !== undefined || Math.abs(e.z - t.z) > 0.6 || Math.abs(e.x - t.x) > t.len / 2 + 0.3) continue;
        t.dying = 0;
        e.z = 99;
        this.points += POINTS[t.kind];
        game.run.coins += 1;
        (t.kind === 'sea' ? sfx.splash : sfx.splat)();
        break;
      }
    }
    this.eggs = this.eggs.filter((e) => { const gone = e.z > 16; if (gone) this.group.remove(e.mesh); return !gone; });

    game.camera.update(dt, 0, -6);
    game.sky.update(dt, 0, -6);
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
