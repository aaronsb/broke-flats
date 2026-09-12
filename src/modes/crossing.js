// The board stage: hop across bands until the finish line. Owns the world,
// the players and their chick trains; tears them down on exit. Only the run
// record survives. Co-op: every roster entry is a player on the same board.
import { World } from '../world.js';
import { Player, BACK_LIMIT, DEATH_FLAP } from '../player.js';
import { Train } from '../train.js';
import { sfx } from '../sfx.js';
import { music } from '../music.js';
import { lerp, clamp } from '../util.js';
import { W } from '../lane.js';
import { FLAG_BONUS } from '../scenarios/mines.js';
import { rollVariant } from '../characters.js';
import { Debris } from '../debris.js';
import { GAUNTLET_BONUS } from '../game.js';

const TILT_COST = 0.4;   // coins per second while peeking (2.5 s per coin)
const NUDGE_AFTER = 12;  // seconds without a peek before the button starts flashing
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

  get mood() { return { gauntlet: !!this.game.run.gauntlet }; }
  get player() { return this.players[0]; }
  get train() { return this.trains[0]; }

  enter() {
    const { scene, level, sky } = this.game;
    this.fx = new Debris(scene);
    this.world = new World(scene, {
      weights: this.game.stageWeights(), bands: level.bands, difficulty: level.difficulty, sky,
      scenery: this.game.scenery(),
      level: level.number,
      fx: this.fx,
      ignoreGaps: !!this.game.debug.force || !!this.game.run.gauntlet,
      gauntlet: this.game.run.gauntlet,
      onFinish: () => { this.finished = true; },
    });
    this.world.onMine = () => { this.mined = 0.001; };
    this.buildPlayers();
    this.game.run.lastPose = null;   // spent: the next arrival is earned afresh
    this.world.ensure(26);
    this.finished = false;
    this.tally = null;
    this.tilted = false;
    this.sinceTilt = 0;
    this.hinted = new Set();     // rows already dinged for
    this.focus = { x: 0, z: 0 };
    this.game.camera.snap(0, -3, 'top');
    this.game.ui.view.hidden = false;
    if (this.game.run.gauntlet) { this.game.card(`${this.game.run.gauntlet.toUpperCase()} GAUNTLET`); setTimeout(() => this.game.card(''), 2200); }
    // Forced boards (debug, playtest URLs) lay mines without setting the
    // gauntlet, so ask both before showing the turn and flag controls.
    this.mines = this.game.run.gauntlet === 'mines' || this.game.debug.force === 'mines';
    document.body.classList.toggle('mines', this.mines);
    if (this.mines) this.hint = 'arrows hop · Q/E turn · F flag the cell you face · followers sweep: beep and a red blink on a mine';
    if (this.game.roster.length > 1) this.hint = 'P1 arrows · P2 WASD · SPACE peek in 3D (burns coins) · M mute';
  }

  buildPlayers() {
    const { scene, roster, run, debug } = this.game;
    this.players = roster.map((c, i) => {
      const variant = (run.variants[i] ??= rollVariant(c));
      const p = new Player(scene, this.world, c, variant);
      p.index = i;
      p.fx = this.fx;                 // poses that throw blocks or sparkles need it
      p.invincible = debug.god;
      p.onCoin = () => { run.coins += 1; };
      const landed = () => this.hintNearby(p);
      p.onLandedHint = landed;
      // Remember the way they went out. A solo death rebuilds the whole mode,
      // so it rides on the run to become the way they come back.
      p.onDie = (cause) => { run.lastPose = p.deathAnim; if (cause === 'water') this.fx.splash(p.mesh.position); };
      p.isOccupied = (col, row) => this.blocked(p, col, row);
      const col = roster.length > 1 ? (i === 0 ? -1 : 1) : 0;
      p.col = col; p.x = col; p.mesh.position.x = col;
      if (run.lastPose) p.arrive(run.lastPose);
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
    const pose = p.deathAnim;
    p.reset();
    p.row = row; p.col = -partner.col || 1; p.x = p.col; p.z = -row; p.maxRow = partner.maxRow;
    p.mesh.position.set(p.x, 0, p.z);
    p.arrive(pose);
    t.trail = [];
    this.game.card(''); 
  }

  // Swap characters while the title card is up.
  setRoster() {
    for (const p of this.players) p.dispose();
    for (const t of this.trains) t.dispose();
    this.buildPlayers();
  }

  exit() {
    this.fx.dispose();
    this.world.dispose();
    for (const t of this.trains) t.dispose();
    for (const p of this.players) p.dispose();
    this.game.ui.view.hidden = true;
    this.game.ui.view.classList.remove('on');
    document.body.classList.remove('mines');
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
    this.sinceTilt = 0;
    this.game.ui.view.classList.toggle('on', on);
    this.game.camera.setGoal(on ? 'iso' : 'top');
    sfx.tilt();
  }

  onKey(e) {
    if (e.code === 'Space') { this.setTilt(!this.tilted); return true; }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { this.setTilt(true); return true; }
    if (e.code === 'KeyQ' || e.code === 'KeyE') { this.players[0].turn(e.code === 'KeyQ' ? 1 : -1); return true; }
    if (e.code === 'KeyF') { this.plantFlag(this.players[0]); return true; }
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

  // Toggle a flag on the cell the player faces, on any row.
  plantFlag(p) {
    const [c, r] = p.ahead();
    const lane = this.world.laneAt(r);
    if (!lane || Math.abs(c) > W) { sfx.bump(); return; }
    lane.toggleFlag(c);
    sfx.tick();
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

  // Once per hidden row: the TILT placard blinks twice and dings twice as the
  // player comes within two rows of it.
  hintNearby(p) {
    for (const r of [p.row + 1, p.row + 2]) {
      const lane = this.world.laneAt(r);
      if (!lane?.data.hidden || this.hinted.has(r)) continue;
      this.hinted.add(r);
      const v = this.game.ui.view;
      v.classList.remove('hint'); void v.offsetWidth; v.classList.add('hint');
      setTimeout(() => v.classList.remove('hint'), 1000);
      sfx.dingding();
      return;
    }
  }

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
    this.sinceTilt += dt;
    game.ui.view.classList.toggle('nudge', !this.tilted && game.run.coins >= 1 && this.sinceTilt > NUDGE_AFTER);

    // Camera: centre of the living players. Where the whole board fits across
    // the window, top-down barely follows x — the wide-screen feel, board held
    // still — and tilted it follows fully. A portrait window cannot hold all
    // 2W + 1 columns, so top-down follows there too, pan-and-scan, or the
    // player walks off the side. Panning past the playable edge is safe:
    // movers live out to SPAN, five columns further than the board.
    if (alive.length) {
      this.focus.x = alive.reduce((a, p) => a + p.x, 0) / alive.length;
      this.focus.z = alive.reduce((a, p) => a + p.z, 0) / alive.length;
    }
    const cam = game.camera;
    const k = clamp(cam.tilt / 0.85, 0, 1);
    const fits = cam.halfW >= W + 0.5;
    const flat = fits ? clamp(this.focus.x, -3, 3) * 0.35 : this.focus.x;
    const tx = lerp(flat, this.focus.x, k);
    const lead = lerp(3, 1.2, k);
    cam.update(dt, tx, this.focus.z - lead);
    game.sky.update(dt, this.focus.x, this.focus.z, cam.distance);
    game.headlights.update(this.emitters(-this.focus.z), this.focus.z);
    world.focusRow = -this.focus.z;

    const chicks = this.trains.reduce((a, t) => a + t.count, 0);
    const waiting = this.trains.reduce((a, t) => a + t.waiting, 0);
    game.hud(game.run.score + front, `<b>${chicks}</b>${waiting ? ` +${waiting} WAITING` : ''}`);

    if (this.mined) {
      // A mine went off: a beat to take it in, then straight to the next level with nothing earned.
      this.mined += dt;
      game.card('KABOOM · NO BONUS');
      if (this.mined > 2.4) { game.card(''); game.run.gauntlet = null; game.nextLevel(); }
      return;
    }
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
    this.tally = { t: 0, led, found, missed, rows: front, done: false, gauntlet: !!game.run.gauntlet, mines: game.run.gauntlet === 'mines' };
    for (const p of this.players) p.invincible = true;
    // Minefield finale: everything left in the ground goes up, nearest rows first.
    if (this.tally.mines) for (const l of this.world.rows.values()) if (l.scenario.id === 'mines') l.scenario.detonateAll(l, this.players[0].row);
    this.setTilt(false);
    game.run.score += front;
    sfx.start();
  }

  // The cash-in panel, once the minefield finale (if any) has had its moment.
  openSummary() {
    const { game } = this;
    const T = this.tally;
    const lines = [{ label: 'ROWS', count: T.rows, each: 1 }, { label: 'LED HOME', count: T.led, each: LED_BONUS }, { label: 'FOUND', count: T.found, each: FOUND_BONUS }];
    if (T.missed) lines.push({ label: 'MISSED', count: T.missed, each: 0 });
    if (T.mines) {
      const rows = [...this.world.rows.values()].filter((l) => l.scenario.id === 'mines');
      const hits = rows.reduce((a, l) => a + (l.data.hits ?? 0), 0);
      const planted = [...this.world.rows.values()].reduce((a, l) => a + l.flags.size, 0);
      lines.push({ label: 'FLAGS RIGHT', count: hits, each: FLAG_BONUS });
      if (planted > hits) lines.push({ label: 'FLAGS WRONG', count: planted - hits, each: 0 });
    }
    if (T.gauntlet) lines.push({ label: 'PHEW, MADE IT', each: GAUNTLET_BONUS });
    game.run.coins += T.led + T.found;
    game.run.score -= T.rows;        // rows were credited at the line; the panel counts them again
    music.reset({ tally: true });
    if (T.gauntlet) sfx.phew();
    T.summaryMs = game.summary.show(`LEVEL ${game.level.number} CLEAR`, lines, {
      mul: game.scoreMul(),
      onTotal: (v) => { game.run.score += v; },
      done: () => { T.summaryDone = true; },
    });
  }

  updateTally(dt) {
    const { game } = this;
    const T = this.tally;
    T.t += dt;
    for (const t of this.trains) t.gather();
    if (!T.opened && T.t > (T.mines ? 2.6 : 0.6)) { T.opened = true; this.openSummary(); }
    if (T.summaryDone) {
      if (T.gauntlet) game.run.gauntlet = null;
      // Everyone carries over, gathered or not.
      this.trains.forEach((t, i) => { game.run.flock[i] = { count: t.total, waiting: 0 }; });
      game.card('');
      game.stageClear();
    }
  }
}
