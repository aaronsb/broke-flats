// The board stage: hop across bands until the finish line. Owns the world,
// the players and their chick trains; tears them down on exit. Only the run
// record survives. Co-op: every roster entry is a player on the same board.
import { World } from '../world.js';
import { Player, BACK_LIMIT, DEATH_FLAP } from '../player.js';
import { Train } from '../train.js';
import { sfx } from '../sfx.js';
import { music } from '../music.js';
import { lerp, clamp } from '../util.js';
import { rollVariant } from '../characters.js';
import { Debris } from '../debris.js';
import { GAUNTLET_BONUS } from '../game.js';

const TILT_COST = 1;   // coins per second while peeking
const LED_BONUS = 50;    // per follower led across the line
const FOUND_BONUS = 20;  // per follower that made its own way to the finish
const TALLY_TIME = 6;    // seconds to run around while the score counts up
const LEASH = 8;       // rows a player may lead the other by

// Player 1 on the arrows, player 2 on WASD. Solo, both sets drive player 1.
export const KEYMAPS = [
  { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] },
  { KeyW: [0, 1], KeyS: [0, -1], KeyA: [-1, 0], KeyD: [1, 0] },
];

export class CrossingMode {
  constructor(game) {
    this.game = game;
    this.hint = 'arrows / WASD hop · SPACE peek in 3D (burns coins) · M mute · P pixels';
  }

  get player() { return this.players[0]; }
  get train() { return this.trains[0]; }

  enter() {
    const { scene, level, sky } = this.game;
    this.world = new World(scene, {
      weights: this.game.stageWeights(), bands: level.bands, difficulty: level.difficulty, sky,
      scenery: this.game.scenery(),
      ignoreGaps: !!this.game.debug.force || !!this.game.run.gauntlet,
      gauntlet: this.game.run.gauntlet,
      onFinish: () => { this.finished = true; },
    });
    this.fx = new Debris(scene);
    this.buildPlayers();
    this.world.ensure(26);
    this.finished = false;
    this.tally = null;
    this.tilted = false;
    this.focus = { x: 0, z: 0 };
    this.game.camera.snap(0, -3, 'top');
    this.game.ui.view.hidden = false;
    music.setMood({ dead: false, danger: false, battle: false, tilted: false, gauntlet: !!this.game.run.gauntlet, countdown: 0 });
    if (this.game.run.gauntlet) { this.game.card(`${this.game.run.gauntlet.toUpperCase()} GAUNTLET`); setTimeout(() => this.game.card(''), 2200); }
    if (this.game.roster.length > 1) this.hint = 'P1 arrows · P2 WASD · SPACE peek in 3D (burns coins) · M mute';
  }

  buildPlayers() {
    const { scene, roster, run, debug } = this.game;
    this.players = roster.map((c, i) => {
      const variant = (run.variants[i] ??= rollVariant(c));
      const p = new Player(scene, this.world, c, variant);
      p.index = i;
      p.invincible = debug.god;
      p.onCoin = () => { run.coins += 1; };
      p.onDie = (cause) => { if (cause === 'water') this.fx.splash(p.mesh.position); };
      p.isOccupied = (col, row) => this.blocked(p, col, row);
      const col = roster.length > 1 ? (i === 0 ? -1 : 1) : 0;
      p.col = col; p.x = col; p.mesh.position.x = col;
      return p;
    });
    this.trains = this.players.map((p, i) => {
      const t = new Train(scene, this.world, p, () => roster[i].young(p.variant), p.voice, this.fx);
      p.onEgg = () => t.hatch();
      const flock = this.game.flockFor(i);
      t.waiting = flock.waiting;
      for (let k = 0; k < flock.count; k++) t.hatch(true);
      return t;
    });
  }

  // A dead player comes back alone. With a living partner it rejoins beside
  // them; otherwise the whole stage restarts. Its followers wait at the finish.
  respawn(p) {
    const i = p.index;
    const t = this.trains[i];
    t.scatter();
    const flock = this.game.flockFor(i);
    flock.count = 0; flock.waiting = t.waiting;
    const partner = this.alive()[0];
    if (!partner) { this.game.splat(p.deadBy); return; }
    // With a partner still going, coming back costs a life; none left means sitting out.
    if (!this.game.spendLife()) { p.gone = true; return; }
    let row = Math.max(0, partner.row - 2);
    while (row > 0 && this.world.laneAt(row)?.scenario.danger) row--;
    p.reset();
    p.row = row; p.col = -partner.col || 1; p.x = p.col; p.z = -row; p.maxRow = partner.maxRow;
    p.mesh.position.set(p.x, 0, p.z);
    t.trail = [];
    this.game.card(''); 
  }

  // Swap characters while the title card is up.
  setRoster() {
    for (const p of this.players) this.game.scene.remove(p.mesh);
    for (const t of this.trains) t.dispose();
    this.buildPlayers();
  }

  exit() {
    this.fx.dispose();
    this.world.dispose();
    for (const t of this.trains) t.dispose();
    for (const p of this.players) this.game.scene.remove(p.mesh);
    this.game.ui.view.hidden = true;
    this.game.ui.view.classList.remove('on');
  }

  alive() { return this.players.filter((p) => p.alive); }

  // A hop is refused into another player's cell, another player's follower,
  // or too far ahead of a living partner. Your own followers swap with you.
  blocked(me, col, row) {
    for (const p of this.players) {
      if (p === me || !p.alive) continue;
      const pc = p.moving ? p.tcol : Math.round(p.x), pr = p.moving ? p.trow : p.row;
      if (pc === col && pr === row) return true;
      if (row > p.row + LEASH) return true;
    }
    return this.trains.some((t) => t.player !== me && t.occupies(col, row));
  }

  setTilt(on) {
    if (on === this.tilted) return;
    if (on && this.game.run.coins < 1) { sfx.bump(); return; }
    this.tilted = on;
    this.game.ui.view.classList.toggle('on', on);
    this.game.camera.setGoal(on ? 'iso' : 'top');
    sfx.tilt();
  }

  onKey(e) {
    if (e.code === 'Space') { this.setTilt(!this.tilted); return true; }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { this.setTilt(true); return true; }
    const solo = this.players.length === 1;
    for (let i = 0; i < KEYMAPS.length; i++) {
      const d = KEYMAPS[i][e.code];
      if (!d) continue;
      const p = this.players[solo ? 0 : i];
      if (p) p.hop(d[0], d[1]);
      return true;
    }
    return false;
  }

  onKeyUp(e) {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.setTilt(false);
  }

  onSwipe(dx, dy) {
    const p = this.players[0];
    if (Math.hypot(dx, dy) < 20) p.hop(0, 1);
    else if (Math.abs(dx) > Math.abs(dy)) p.hop(Math.sign(dx), 0);
    else p.hop(0, dy < 0 ? 1 : -1);
  }

  onViewButton() { this.setTilt(!this.tilted); }

  // Vehicles on nearby road rows, for the headlight pool.
  emitters(focusRow) {
    const out = [];
    for (const lane of this.world.rows.values()) {
      if (Math.abs(lane.r - focusRow) > 11) continue;
      if (lane.scenario.id === 'road') for (const m of lane.movers) out.push({ x: m.x, z: -lane.r, dir: lane.dir, len: m.len });
      if (lane.scenario.id === 'runway') for (const m of lane.movers) out.push({ x: m.x, z: -lane.r, dir: lane.dir, len: m.len, y: m.y + 0.2, front: 0.2, lateral: [-1.15, 1.15] });
      if (lane.scenario.id === 'rail' && lane.data.state === 'run') for (const m of lane.movers) out.push({ x: m.x, z: -lane.r, dir: lane.dir, len: m.len, y: 0.8 });
    }
    return out;
  }

  update(dt, time) {
    const { game, world } = this;
    for (const p of this.players) p.update(dt);
    for (const t of this.trains) t.update(dt, time);
    this.fx.update(dt);
    world.update(dt, time);

    const alive = this.alive();
    const front = Math.max(...this.players.map((p) => p.maxRow));
    const back = alive.length ? Math.min(...alive.map((p) => p.maxRow)) : front;
    world.ensure(front + 26);
    world.cull(back - BACK_LIMIT - 2);

    const danger = alive.some((p) => world.laneAt(p.moving ? p.trow : p.row)?.scenario.danger);
    music.setMood({ danger, tilted: this.tilted });

    if (this.tilted) {
      game.run.coins -= TILT_COST * dt;
      if (game.run.coins <= 0) { game.run.coins = 0; this.setTilt(false); }
    }
    game.ui.coins.classList.toggle('draining', this.tilted);
    game.ui.view.classList.toggle('broke', game.run.coins < 1);

    // Camera: centre of the living players. Top-down barely follows x since
    // the whole width is on screen; tilted, it follows fully and keeps the
    // characters nearer the middle of the screen.
    if (alive.length) {
      this.focus.x = alive.reduce((a, p) => a + p.x, 0) / alive.length;
      this.focus.z = alive.reduce((a, p) => a + p.z, 0) / alive.length;
    }
    const cam = game.camera;
    const k = clamp(cam.tilt / 0.85, 0, 1);
    const tx = lerp(clamp(this.focus.x, -3, 3) * 0.35, this.focus.x, k);
    const lead = lerp(3, 1.2, k);
    cam.update(dt, tx, this.focus.z - lead);
    game.sky.update(dt, this.focus.x, this.focus.z, cam.distance);
    game.headlights.update(this.emitters(-this.focus.z), this.focus.z);
    world.focusRow = -this.focus.z;

    const chicks = this.trains.reduce((a, t) => a + t.count, 0);
    const waiting = this.trains.reduce((a, t) => a + t.waiting, 0);
    game.hud(game.run.score + front, `<b>${chicks}</b>${waiting ? ` +${waiting} WAITING` : ''}`);

    if (this.tally) { this.updateTally(dt); return; }
    if (this.finished) { this.startTally(front); return; }
    for (const p of this.players) if (!p.alive && !p.gone && p.deadFor > DEATH_FLAP + 0.9) { this.respawn(p); return; }
  }

  // Crossing the line freezes the score tiers, then leaves a few seconds to
  // run around and collect the followers waiting there before the battle.
  startTally(front) {
    const { game } = this;
    const led = this.trains.reduce((a, t) => a + t.count, 0);
    const found = this.trains.reduce((a, t) => a + t.waiting, 0);
    const missed = Math.max(0, (this.world.data.eggsPlaced ?? 0) - this.trains.reduce((a, t) => a + t.hatched, 0));
    this.tally = { t: 0, led, found, missed, rows: front, done: false, gauntlet: !!game.run.gauntlet };
    for (const p of this.players) p.invincible = true;
    this.setTilt(false);
    game.run.score += front;
    sfx.start();
  }

  updateTally(dt) {
    const { game } = this;
    const T = this.tally;
    T.t += dt;
    for (const t of this.trains) t.gather();
    const lines = [`ROWS ${T.rows}`];
    if (T.t > 0.8) lines.push(`LED HOME ×${T.led}  +${T.led * LED_BONUS}`);
    if (T.t > 1.8) lines.push(`FOUND ×${T.found}  +${T.found * FOUND_BONUS}`);
    if (T.t > 2.8 && T.missed) lines.push(`MISSED ×${T.missed}`);
    if (T.t > 3.4 && T.gauntlet) lines.push(`PHEW, MADE IT  +${GAUNTLET_BONUS}`);
    game.card(lines.join('   ·   '));
    if (T.t > 1.8 && !T.paid) {
      T.paid = true;
      game.run.score += T.led * LED_BONUS + T.found * FOUND_BONUS;
      game.run.coins += T.led + T.found;
    }
    if (T.t > 3.4 && T.gauntlet && !T.phew) { T.phew = true; game.run.score += GAUNTLET_BONUS; game.run.gauntlet = null; sfx.phew(); }
    if (T.t > TALLY_TIME) {
      // Everyone carries over, gathered or not.
      this.trains.forEach((t, i) => { game.run.flock[i] = { count: t.total, waiting: 0 }; });
      game.card('');
      game.stageClear();
    }
  }
}
