// The board stage: hop across bands until the finish line. Owns the world,
// the players and their chick trains; tears them down on exit. Only the run
// record survives. Co-op: every roster entry is a player on the same board.
import { World } from '../world.js';
import { Player, BACK_LIMIT, DEATH_FLAP } from '../player.js';
import { Train } from '../train.js';
import { sfx } from '../sfx.js';
import { DEATHS } from '../deaths.js';
import { music } from '../music.js';
import { lerp, clamp } from '../util.js';
import { W } from '../lane.js';
import { FLAG_BONUS } from '../scenarios/mines.js';
import { MAZE_CLEAR_BONUS } from '../scenarios/maze.js';
import { SNAKE_FOLLOWER, SNAKE_CLEAR_BONUS, TIME_PAY } from '../scenarios/snake.js';
import { rollVariant } from '../characters.js';
import { Debris } from '../debris.js';
import { stampOf } from '../stamp.js';
import { GAUNTLET_BONUS } from '../game.js';
import { grievanceFor } from '../grievances.js';
import { POWERUPS } from '../powerups.js';
import { SKIES } from '../sky.js';

const TILT_COST = 0.4;   // coins per second while peeking (2.5 s per coin)
const NUDGE_AFTER = 12;  // seconds without a peek before the button starts flashing
const LED_BONUS = 50;    // per follower led across the line
const FOUND_BONUS = 20;  // per follower that made its own way to the finish
const FOLLOWER_MUL = 0.5; // added to the score multiplier per follower carried over
const UPHELD_BONUS = 250; // a clean day: every egg hatched, every follower led rather than found
const TALLY_TIME = 6;    // seconds to run around while the score counts up
const LEASH = 8;       // rows a player may lead the other by
const HONK_RADIUS = 3;   // cells either side a goose's honk reaches, on road rows within HONK_ROWS
const HONK_ROWS = 2;
const HONK_COOLDOWN = 1.5; // seconds between honks

// Player 1 on the arrows, player 2 on WASD. Solo, both sets drive player 1.
export const KEYMAPS = [
  { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] },
  { KeyW: [0, 1], KeyS: [0, -1], KeyA: [-1, 0], KeyD: [1, 0] },
];

export class CrossingMode {
  constructor(game, { retry = false } = {}) {
    this.game = game;
    this.retry = retry;   // the same board again after a death: a short sign, no tune
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
      district: level.district,
      // The snake maze lays the first player's young on every corridor cell;
      // whoever collects one gets a young of their own kind in their line.
      young: () => this.game.roster[0].young(this.game.run.variants[0]),
      fx: this.fx,
      ignoreGaps: !!this.game.debug.force || !!this.game.run.gauntlet,
      gauntlet: this.game.run.gauntlet,
      onFinish: () => { this.finished = true; },
    });
    this.world.onMine = () => { this.mined = 0.001; };
    this.world.players = () => this.players;   // maze ghosts read the players they hunt
    this.buildPlayers();
    this.flockAtStart = this.trains.map((t) => t.count);   // the snake maze cashes out everything past these
    this.game.run.lastPose = null;   // spent: the next arrival is earned afresh
    this.world.ensure(26);
    this.finished = false;
    this.tally = null;
    this.followerMul = null;     // a golden egg sets 1; otherwise FOLLOWER_MUL at the tally
    this.tilted = false;
    this.forceTilt = false;      // the tilt powerup holds the iso view without a coin cost
    this.sinceTilt = 0;
    this.hinted = new Set();     // rows already dinged for
    this.focus = { x: 0, z: 0 };
    this.game.camera.snap(0, -3, 'top');
    this.game.ui.view.hidden = false;
    this.sign();
    // Forced boards (debug, playtest URLs) lay mines without setting the
    // gauntlet, so ask both before showing the turn and flag controls.
    this.mines = this.game.run.gauntlet === 'mines' || this.game.debug.force === 'mines';
    document.body.classList.toggle('mines', this.mines);
    if (this.mines) this.hint = 'arrows hop · Q/E turn · F flag the cell you face · followers sweep: beep and a red blink on a mine';
    this.maze = this.game.run.gauntlet === 'maze' || this.game.debug.force === 'maze';
    if (this.maze) this.hint = 'arrows hop · four vehicles hunt the maze · eat every coin for the bonus · SPACE peek finds the gaps';
    this.snake = this.game.run.gauntlet === 'snake' || this.game.debug.force === 'snake';
    if (this.snake) this.hint = 'arrows hop · collect them all before the clock · stepping on your own line resets the streak';
    if (this.game.roster.length > 1) this.hint = 'P1 arrows · P2 WASD · SPACE peek in 3D (burns coins) · M mute';
    const geese = this.players.filter((p) => p.honk);
    document.body.classList.toggle('honk', geese.length > 0);
    if (geese.length) this.hint += this.game.roster.length > 1 ? ` · ${geese.map((p) => (p.index ? 'G' : 'H')).join('/')} honk` : ' · H honk';
  }

  // The stage sign: the district's welcome board with the day and its sky, or
  // the gauntlet's hazard board naming the district it runs through.
  sign() {
    const { level, sky, run, debug, banner } = this.game;
    if (debug.quickBanner) return;
    const day = `DAY ${level.number}`;
    const label = SKIES[sky.name]?.label ?? '';
    const wx = label === 'DAY' ? 'CLEAR SKIES' : label;   // DAY 1 · DAY read as a stutter
    const pace = this.retry ? { ms: 1400, tune: false } : {};
    const { name, motto } = level.district;
    if (run.gauntlet) banner.show('gauntlet', { title: `${run.gauntlet.toUpperCase()} GAUNTLET`, sub: `${name} · ${wx}`, variant: run.gauntlet, ...pace });
    else banner.show('day', { title: name, sub: `${day} · ${wx}`, motto, advisory: sky.slip ? 'ADVISORY: SLIPPERY' : null, ...pace });
  }

  buildPlayers() {
    const { scene, roster, run, debug } = this.game;
    this.players = roster.map((c, i) => {
      const variant = (run.variants[i] ??= rollVariant(c));
      const p = new Player(scene, this.world, c, variant);
      p.index = i;
      p.fx = this.fx;                 // poses that throw blocks or sparkles need it
      p.invincible = debug.god;
      p.nineLives = !!c.nineLives;    // the first death on each level is free
      p.honk = !!c.honk;              // H (G for player 2) moves stalled traffic on
      p.honkReady = 0;
      p.onCoin = () => { run.coins += 1; };
      const landed = () => this.hintNearby(p);
      p.onLandedHint = landed;
      // Remember the way they went out. A solo death rebuilds the whole mode,
      // so it rides on the run to become the way they come back.
      p.onDie = (cause) => { run.lastPose = p.deathAnim; run.lastCause = cause; if (cause === 'water') this.fx.splash(p.mesh.position); };
      p.isOccupied = (col, row) => this.blocked(p, col, row);
      p.powerCtx = () => ({ mode: this, game: this.game, train: this.trains?.[i] });
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
    if (!partner) { this.game.splat(p.deadBy, p); return; }
    // With a partner still going, coming back costs a life (a cat's first on
    // the level is free); none left means sitting out.
    const free = this.game.freeDeath(p);
    if (!free && !this.game.spendLife()) { p.gone = true; return; }
    let row = Math.max(0, partner.row - 2);
    while (row > 0 && this.world.laneAt(row)?.scenario.danger) row--;
    const pose = p.deathAnim;
    p.reset();
    p.row = row; p.col = -partner.col || 1; p.x = p.col; p.z = -row; p.maxRow = partner.maxRow;
    p.mesh.position.set(p.x, 0, p.z);
    p.arrive(pose);
    t.trail = [];
    this.game.card(free ? `${DEATHS[p.deadBy]?.title ?? 'OUCH'} · NINE LIVES` : '');
    if (free) setTimeout(() => this.game.card(''), 1200);
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
    document.body.classList.remove('mines', 'honk', 'chili');
  }

  alive() { return this.players.filter((p) => p.alive); }

  // A hop is refused into another player's cell, another player's follower,
  // or too far ahead of a living partner. Your own followers swap with you.
  // In the snake maze a partner's line is walked through: in corridors one
  // cell wide, two lines would otherwise wall each other in.
  blocked(me, col, row) {
    for (const p of this.players) {
      if (p === me || !p.alive) continue;
      const pc = p.moving ? p.tcol : Math.round(p.x), pr = p.moving ? p.trow : p.row;
      if (pc === col && pr === row) return true;
      if (row > p.row + LEASH) return true;
    }
    return !this.snake && this.trains.some((t) => t.player !== me && t.occupies(col, row));
  }

  setTilt(on) {
    if (on === this.tilted) return;
    if (on && this.game.run.coins < 1) { sfx.bump(); return; }
    this.tilted = on;
    this.sinceTilt = 0;
    this.game.ui.view.classList.toggle('on', on);
    if (!this.forceTilt) this.game.camera.setGoal(on ? 'iso' : 'top');
    sfx.tilt();
  }

  // The tilt powerup: the camera rides into the rolled iso view for free and
  // comes back to wherever the peek left it.
  setForceTilt(on) {
    this.forceTilt = on;
    this.game.camera.setGoal(on ? 'slide' : this.tilted ? 'iso' : 'top');
  }

  onKey(e) {
    if (e.code === 'Space') { this.setTilt(!this.tilted); return true; }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { this.setTilt(true); return true; }
    if (e.code === 'KeyQ' || e.code === 'KeyE') { this.players[0].turn(e.code === 'KeyQ' ? 1 : -1); return true; }
    if (e.code === 'KeyF') { const p = this.players[0]; if (p.hasPower('chili')) this.fire(p); else this.plantFlag(p); return true; }
    const solo = this.players.length === 1;
    if (e.code === 'KeyH' || e.code === 'KeyG') { this.honk(this.players[solo || e.code === 'KeyH' ? 0 : 1]); return true; }
    for (let i = 0; i < KEYMAPS.length; i++) {
      const d = KEYMAPS[i][e.code];
      if (!d) continue;
      const p = this.players[solo ? 0 : i];
      if (p) p.hop(d[0], d[1]);
      return true;
    }
    return false;
  }

  // A goose honks: stalled traffic on the road rows around it pulls away.
  honk(p) {
    if (!p?.honk || !p.alive) return 0;
    const now = performance.now();
    if (now < p.honkReady) return 0;
    p.honkReady = now + HONK_COOLDOWN * 1000;
    sfx.honk();
    let n = 0;
    for (let r = p.row - HONK_ROWS; r <= p.row + HONK_ROWS; r++) {
      const lane = this.world.laneAt(r);
      if (lane?.halts) n += lane.honk(p.x, HONK_RADIUS, this.fx);
    }
    return n;
  }

  // A chili in hand: F (touch: the fire button in A's place) sends a fireball the way the player faces.
  fire(p) {
    const e = p.powers.get('chili');
    if (!e || !p.alive) return;
    POWERUPS.chili.fire(e.ctx);
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
      // Maze ghosts drive both axes; the pool only beams along x, so those heading up or down keep their lamps alone.
      if (lane.scenario.id === 'maze') for (const m of lane.movers) if (m.ghost?.dir && m.ghost.dir[1] === 0) out.push({ x: m.x, z: m.z ?? -lane.r, dir: m.ghost.dir[0], len: 1.6 });
    }
    return out;
  }

  // A player with followers is a procession, and road traffic brakes for it:
  // the cells the leader and its followers hold go on their lanes as blockers,
  // each as strong as the train is long.
  setBlockers() {
    for (const lane of this.held ?? []) lane.blockers = null;
    this.held = [];
    const mark = (x, row, n) => {
      const lane = this.world.laneAt(row);
      if (!lane?.halts) return;
      if (!lane.blockers) { lane.blockers = []; this.held.push(lane); }
      lane.blockers.push({ x, n });
    };
    for (const t of this.trains) {
      const p = t.player, n = t.count;
      if (!n || !p.alive) continue;
      if (!p.carrier) mark(p.x, p.moving && p.t > 0.5 ? p.trow : p.row, n);
      for (const k of t.chicks) if (!k.rec.carrier && (!k.moving || k.t > 0.5)) mark(k.mesh.position.x, k.rec.row, n);
    }
  }

  update(dt, time) {
    const { game, world } = this;
    for (const p of this.players) p.update(dt);
    for (const t of this.trains) t.update(dt, time);
    this.fx.update(dt);
    this.setBlockers();
    world.update(dt, time);

    const alive = this.alive();
    const front = Math.max(...this.players.map((p) => p.maxRow));
    const back = alive.length ? Math.min(...alive.map((p) => p.maxRow)) : front;
    world.ensure(front + 26);
    world.cull(back - BACK_LIMIT - 2);

    const danger = alive.some((p) => world.laneAt(p.moving ? p.trow : p.row)?.scenario.danger);
    music.setMood({ danger, tilted: this.tilted });

    // Crates show their item only from the side; the HUD chip lists what is running.
    const side = this.tilted || this.forceTilt;
    for (const lane of world.rows.values()) for (const c of lane.crates.values()) c.item.visible = side;
    this.showPowers();
    document.body.classList.toggle('chili', this.players[0].hasPower('chili'));

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
    const snake = this.snake && world.data.snake;
    const clock = snake ? ` · STREAK <b>${snake.bonus.reduce((a, b) => a + (b ?? 0), 0)}</b> · <b>${Math.max(0, Math.ceil(snake.clock))}s</b>` : '';
    game.hud(game.run.score + front, `<b>${chicks}</b>${waiting ? ` +${waiting} WAITING` : ''}${clock}`);
    // The snake maze's clock runs while the board is in play; at zero the maze closes and the day tallies.
    if (snake && !this.tally && !this.finished && !game.banner.up && snake.clock > 0) {
      snake.clock -= dt;
      if (snake.clock <= 0) {
        snake.clock = 0; snake.timedOut = true; this.finished = true;
        game.card('TIME'); setTimeout(() => game.card(''), 1400);
        // The maze closes: whoever is still waiting stays put, and can no longer be collected.
        for (const l of world.rows.values()) if (l.scenario.id === 'snake') { (l.data.left ??= new Map()); for (const [c, m] of l.eggs) l.data.left.set(c, m); l.eggs.clear(); }
      }
    }

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

  // NAME 6s per active power on the leader, hidden when there are none. A
  // power with its own `label(entry)` (a chili's shots) writes its own chip.
  showPowers() {
    const el = this.powerChip ??= document.getElementById('power');
    if (!el) return;
    const parts = [];
    for (const [id, e] of this.players[0].powers) {
      const spec = POWERUPS[id];
      const name = spec?.name ?? id.toUpperCase();
      parts.push(spec?.label?.(e) ?? (Number.isFinite(e.left) ? `${name} <b>${Math.ceil(e.left)}s</b>` : name));
    }
    const html = parts.join(' · ');
    if (html !== this.powerHtml) { this.powerHtml = html; el.innerHTML = html; }
    el.hidden = !parts.length;
  }

  // Crossing the line freezes the score tiers, then leaves a few seconds to
  // run around and collect the followers waiting there before the battle.
  startTally(front) {
    const { game } = this;
    // The snake maze's line is cashed out, not led home: only the flock each player came in with counts as led.
    const base = (t, i) => (this.snake ? Math.min(t.count, this.flockAtStart[i] ?? 0) : t.count);
    const led = this.trains.reduce((a, t, i) => a + base(t, i), 0);
    const found = this.trains.reduce((a, t) => a + t.waiting, 0);
    const missed = this.snake ? 0 : Math.max(0, (this.world.data.eggsPlaced ?? 0) - this.trains.reduce((a, t) => a + t.hatched, 0));
    const per = this.trains.map((t, i) => base(t, i) + t.waiting);   // whose stamps, in roster order
    const snake = this.snake && this.world.data.snake
      ? { collected: this.trains.reduce((a, t, i) => a + t.count - base(t, i), 0), placed: this.world.data.snake.placed, bonus: this.world.data.snake.bonus.reduce((a, b) => a + (b ?? 0), 0), left: Math.floor(this.world.data.snake.clock), timedOut: !!this.world.data.snake.timedOut }
      : null;
    this.tally = { t: 0, led, found, missed, per, rows: front, done: false, gauntlet: !!game.run.gauntlet, mines: game.run.gauntlet === 'mines', maze: this.maze, snake };
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
    if (T.maze) {
      // Every pellet eaten pays the clear bonus; otherwise the panel says how many were left.
      const rows = [...this.world.rows.values()].filter((l) => l.scenario.id === 'maze');
      const left = rows.reduce((a, l) => a + l.coins.size, 0);
      if (rows.length && !left) lines.push({ label: 'MAZE CLEARED', each: MAZE_CLEAR_BONUS });
      else lines.push({ label: 'PELLETS LEFT', count: left, each: 0 });
    }
    if (T.snake) {
      // Each follower in the line pays points and a coin; the streak and the clock pay points.
      const S = T.snake;
      lines.push({ label: 'FOLLOWERS CASHED', count: S.collected, each: SNAKE_FOLLOWER });
      if (S.collected === S.placed) lines.push({ label: 'EVERY LAST ONE', each: SNAKE_CLEAR_BONUS });
      else lines.push({ label: 'LEFT BEHIND', count: S.placed - S.collected, each: 0 });
      lines.push({ label: 'STREAK', count: S.bonus, each: 1 });
      if (!S.timedOut) lines.push({ label: 'TIME LEFT', count: S.left, each: TIME_PAY });
      game.run.coins += S.collected;
    }
    if (T.gauntlet && !T.snake?.timedOut) lines.push({ label: 'PHEW, MADE IT', each: GAUNTLET_BONUS });
    game.run.coins += T.led + T.found;
    game.run.score -= T.rows;        // rows were credited at the line; the panel counts them again
    music.reset({ tally: true });
    if (T.gauntlet) sfx.phew();
    const owners = T.per.flatMap((n, k) => Array(n).fill(k));
    const stamp = (k) => { const c = game.roster[k], v = game.run.variants[k]; return stampOf(`${c.id}:${v}`, () => c.young(v)); };
    if (T.led + T.found) stamp(owners[0] ?? 0);   // first render compiles shaders; do it before the cadence starts
    const level = game.level.number;
    const quip = grievanceFor({ scenarios: [...this.world.rows.values()].map((l) => l.scenario.id), lastDeath: game.run.lastCause ?? null, level, rows: T.rows });
    // A clean day is UPHELD: nothing missed, nothing merely found. A day with
    // no eggs and no followers at all is a clean walk and counts.
    // In the snake maze a clean day also leaves no follower behind.
    const clean = T.missed === 0 && T.found === 0 && (!T.snake || T.snake.collected === T.snake.placed);
    const ruling = clean ? { text: 'UPHELD', bonus: UPHELD_BONUS } : { text: 'NOTED', bonus: 0 };
    T.summaryMs = game.summary.show(`DAY ${level} · CLAIM FILED`, lines, {
      quip,
      stamp: `FILED · DAY ${level}`,
      ruling,
      mul: game.scoreMul(),
      stamps: { count: T.led + T.found, image: (i) => stamp(owners[i] ?? 0), each: this.followerMul ?? FOLLOWER_MUL },
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
      game.run.lastCause = null;       // the next day's grievance is its own
      // Everyone carries over, gathered or not. The snake maze's line disbands:
      // only the flock it came in with (as counted at the line) goes on.
      this.trains.forEach((t, i) => { game.run.flock[i] = { count: this.snake ? T.per[i] : t.total, waiting: 0 }; });
      game.card('');
      game.stageClear();
    }
  }
}
