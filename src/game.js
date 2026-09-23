// Top-level state machine. Holds the run record (score, coins, level) that
// survives mode switches; each mode owns everything else and rebuilds it.
import { CrossingMode } from './modes/crossing.js';
import { BattleMode } from './modes/battle.js';
import { levelFor } from './levels.js';
import { makePage, spotAt, newSeed, MAP_ROWS } from './townmap.js';
import { drawMinimap } from './minimap.js';
import { SKIES } from './sky.js';
import { SCENERY } from './scenery/index.js';
import { DEATHS } from './deaths.js';
import { CHARACTERS } from './characters.js';
import { Summary } from './summary.js';
import { Banner } from './banner.js';
import { sfx } from './sfx.js';
import { music } from './music.js';

const SESSION_COINS = 100;   // every new session starts with a pocketful
export const LIFE_COST = 25; // coins per life, at the slot or to continue
const START_LIVES = 4;       // one coin buys this many
const ODD_WEATHER = 0.1;     // chance the first level opens under a different sky
const CONTINUE_TIME = 10;    // seconds to decide at game over
const GAUNTLET_CHANCE = 0.06; // a level that is all one hazard, from level 2 on
const GAUNTLET_KINDS = ['road', 'river', 'runway', 'rail', 'mines', 'maze', 'snake'];
export const GAUNTLET_BONUS = 500;

export class Game {
  constructor({ scene, camera, sky, ui, headlights }) {
    this.scene = scene;
    this.camera = camera;
    this.sky = sky;
    this.headlights = headlights;
    this.ui = ui;
    this.summary = new Summary(ui);
    this.banner = new Banner(ui);
    this.mode = null;
    this.over = false;
    this.best = Number(localStorage.getItem('rc-best') || 0);
    this.ui.best.textContent = this.best;
    this.run = this.freshRun(SESSION_COINS);
    this.debug = { on: false, force: null, sky: null, scenery: null, god: false, quickBanner: false };   // quickBanner: the stage signs skip straight to play (the smoke harness sets it)
    this.picks = [0];          // roster indices into CHARACTERS, one per player
    this.hud(0);
  }

  freshRun(coins) { return { level: 1, score: 0, coins, lives: 0, flock: [], tries: 0, variants: [], freeDeathUsed: false }; }

  // Back to the title with a fresh pocket of coins.
  newSession() {
    this.run = this.freshRun(SESSION_COINS);
    this.over = false;
    this.ui.over.classList.remove('show');
    this.setLevel(1);
    this.hud(0);
  }

  // Feed the slot: each life clinks in one at a time. done() fires after the last.
  insertCoin(done) {
    const n = Math.min(START_LIVES, Math.floor(this.run.coins / LIFE_COST));
    if (n === 0) { sfx.bump(); return false; }
    for (let i = 0; i < n; i++) {
      setTimeout(() => { this.run.coins -= LIFE_COST; this.run.lives += 1; sfx.clink(); this.hud(this.run.score); }, i * 220);
    }
    setTimeout(done, n * 220 + 100);
    return true;
  }

  // A death costs a life. Returns false when none are left.
  spendLife() {
    if (this.run.lives <= 0) return false;
    this.run.lives -= 1;
    this.run.tries += 1;
    return true;
  }

  // At game over, each coin buys one life; resume whenever you like.
  buyLife() {
    if (this.run.coins < LIFE_COST) { sfx.bump(); return false; }
    this.run.coins -= LIFE_COST;
    this.run.lives += 1;
    sfx.clink();
    this.hud(this.run.score);
    this.renderOver();
    return true;
  }

  resume() {
    if (this.run.lives <= 0) { sfx.bump(); return false; }
    this.over = false;
    this.countdown = null;
    this.ui.over.classList.remove('show');
    this.restartStage();
    return true;
  }

  renderOver() {
    const coins = Math.floor(this.run.coins), lives = this.run.lives;
    this.ui.overScore.textContent = `SCORE ${this.run.score} · LEVEL ${this.run.level} · LIVES ${lives}`;
    this.ui.overCoins.textContent = coins >= LIFE_COST
      ? `C PAY THE FILING FEE · ${LIFE_COST} OF YOUR ${coins} COINS BUYS AN APPEAL`
      : `NO FEE MONEY LEFT (${coins})`;
    this.ui.retry.textContent = lives > 0 ? 'RESUME (ENTER)' : coins >= LIFE_COST ? 'PAY FEE (C)' : 'NEW GAME (R)';
    if (this.countdown !== null && this.countdown !== undefined) this.ui.overTitle.textContent = `APPEAL? ${Math.ceil(this.countdown)}`;
  }

  get roster() { return this.picks.map((i) => CHARACTERS[i]); }

  // Cash-in multiplier for the roster: the mean of each character's own.
  scoreMul() {
    const r = this.roster;
    return r.reduce((a, c) => a + (c.scoreMul ?? 1), 0) / r.length;
  }

  // Title card: sky for level 1 behind the character cards.
  preview() {
    this.setLevel(1);
    this.renderTitle();
  }

  // Title-card input: player 1 picks on the arrows, player 2 joins and picks on A/D.
  select(e) {
    const step = (i, d) => { this.picks[i] = (this.picks[i] + d + CHARACTERS.length) % CHARACTERS.length; };
    let changed = 0;
    if (e.code === 'ArrowLeft') step(0, -1);
    else if (e.code === 'ArrowRight') step(0, 1);
    else if (e.code === 'KeyA' || e.code === 'KeyD') {
      changed = 1;
      if (this.picks.length < 2) this.picks.push((this.picks[0] + 1) % CHARACTERS.length);
      else step(1, e.code === 'KeyA' ? -1 : 1);
    } else if (e.code === 'Escape' && this.picks.length > 1) { this.picks.pop(); changed = -1; }
    else return false;
    this.renderTitle();
    sfx.tilt();
    return changed;
  }

  renderTitle() {
    const [a, b] = this.roster;
    this.ui.p1.textContent = `P1  ◀ ${a.name} ▶   arrows`;
    this.ui.p2.textContent = b ? `P2  ◀ ${b.name} ▶   A / D  (ESC leaves)` : 'P2  press A or D to join';
  }

  // Followers per player: those trailing, and those waiting at the finish.
  flockFor(i) { return (this.run.flock[i] ??= { count: 0, waiting: 0 }); }

  start() {
    this.run = { ...this.freshRun(this.run.coins), lives: this.run.lives };
    this.run.map = this.newMap(this.debug.seed ?? newSeed());
    const others = Object.keys(SKIES).filter((k) => k !== levelFor(1).sky);
    this.run.oddSky = Math.random() < ODD_WEATHER ? others[Math.floor(Math.random() * others.length)] : null;
    this.over = false;
    this.ui.over.classList.remove('show');
    this.setLevel(1);
    this.setMode(new CrossingMode(this));
    sfx.start();
  }

  // ---- the town map ----
  // One per run: continues and retries keep it, a new run deals a new one.
  // `at` is the spot being played, `path` the spots walked on this page, and
  // `level` the level number `at` was entered as: a jump by level number
  // (debug, the smoke harness) plays the level table and leaves the map alone.
  newMap(seed) {
    const page = makePage(seed, 0);
    const at = { r: 0, p: page.entry };
    return { seed, page, at, path: [at], level: 1 };
  }

  // The spot being played, or null when the level is not one of the map's.
  spot(n = this.run.level) {
    const m = this.run.map;
    return m && m.level === n ? spotAt(m.page, m.at.r, m.at.p) : null;
  }

  // The ways on from the spot being played: [left, right], each { p, spot } or
  // null when that way is closed. Past the top row the way leads onto a new page.
  exits() {
    const m = this.run.map, here = this.spot();
    if (!here) return [null, null];
    return [here.p - 1, here.p + 1].map((p) => {
      if (!here.exits.includes(p)) return null;
      const spot = here.r + 1 < MAP_ROWS ? spotAt(m.page, here.r + 1, p) : makePage(m.seed, m.page.page + 1, p).rows[0][0];
      return { p, spot };
    });
  }

  // Walk the map to position p on the next row (a new page past the top).
  advance(p) {
    const m = this.run.map;
    if (m.at.r + 1 < MAP_ROWS) m.at = { r: m.at.r + 1, p };
    else { m.page = makePage(m.seed, m.page.page + 1, p); m.at = { r: 0, p }; m.path = []; }
    m.path.push(m.at);
    m.level = this.run.level + 1;
  }

  // The HUD map: the page, the route, and the ways offered while a hearing's doors are open.
  showMap(offer = null) {
    const m = this.run.map;
    if (!m) { if (this.ui.minimap) this.ui.minimap.hidden = true; return; }
    drawMinimap(this.ui.minimap, { map: m.page, at: this.spot() ? m.at : null, path: m.path, offer });
  }

  setLevel(n) {
    this.level = levelFor(n, this.spot(n)?.district ?? null);
    this.showMap();
    if (n !== this.run.level) this.run.freeDeathUsed = false;   // a cat's free death comes back with each new level
    this.run.level = n;
    const skyName = this.debug.sky ?? (n === 1 ? this.run.oddSky : null) ?? this.level.sky;
    this.sky.apply(skyName);
    this.headlights.enabled = this.sky.headlights;
    const tag = this.run.gauntlet ? ` <b>${this.run.gauntlet.toUpperCase()} GAUNTLET</b>` : '';
    this.ui.level.innerHTML = `LV <b>${n}</b> ${SKIES[skyName].label}${tag}${this.debug.on ? ' <b>DEBUG</b>' : ''}`;
  }

  // Rolled once on entering a level; a map spot's gauntlet is fixed. A death
  // clears it, so the retry is normal.
  rollGauntlet(n) {
    const spot = this.spot(n);
    if (spot) { this.run.gauntlet = spot.gauntlet; return; }
    this.run.gauntlet = n > 1 && Math.random() < GAUNTLET_CHANCE ? GAUNTLET_KINDS[Math.floor(Math.random() * GAUNTLET_KINDS.length)] : null;
  }

  // Sequencer weights for the current stage, honouring a forced scenario or a gauntlet.
  stageWeights() {
    if (this.debug.force) return { [this.debug.force]: 1 };
    if (this.run.gauntlet) return { [this.run.gauntlet]: 1 };
    return this.level.weights;
  }

  scenery() { return SCENERY[this.debug.scenery ?? this.level.scenery]; }

  jumpLevel(n) { this.rollGauntlet(n); this.setLevel(n); this.setMode(new CrossingMode(this)); }
  // A retry: the same board again, its sign shown short and without the tune.
  restartStage() { this.setLevel(this.run.level); this.setMode(new CrossingMode(this, { retry: true })); }

  setMode(mode) {
    this.summary.clear();
    this.banner.clear();
    // A mode's clean-up never holds up the next one: a failure there is logged and the switch goes on.
    try { this.mode?.exit(); } catch (err) { console.error('mode exit failed', err); }
    this.mode = mode;
    music.reset(mode.mood ?? {});
    mode.enter();
    this.ui.hint.textContent = mode.hint;
  }

  // The board is crossed: the day's grievances go to the hearing.
  stageClear() { this.setMode(new BattleMode(this)); }

  // On to the next day. `p` is the map position chosen at the hearing's door;
  // without one the level table decides (debug and harness jumps).
  nextLevel(p = null) {
    if (p !== null && this.run.map) this.advance(p);
    this.rollGauntlet(this.run.level + 1);
    this.setLevel(this.run.level + 1);
    this.setMode(new CrossingMode(this));
  }

  // Nine lives: a cat's first death on each level costs nothing. True, and
  // the free death is spent, when `p` is a cat and this level still has it.
  freeDeath(p) {
    if (!p?.nineLives || this.run.freeDeathUsed) return false;
    this.run.freeDeathUsed = true;
    sfx.halo();
    return true;
  }

  // Death costs a life and resets the stage; with no lives left it is game
  // over. `who` is the player that died, for the cat's free death.
  splat(cause, who = this.mode?.players?.[0]) {
    const free = this.freeDeath(who);
    this.card((DEATHS[cause]?.title ?? 'OUCH') + (free ? ' · NINE LIVES' : ''));
    setTimeout(() => this.card(''), 1200);
    if (this.run.score > this.best) { this.best = this.run.score; localStorage.setItem('rc-best', this.best); }
    this.ui.best.textContent = this.best;
    if (!free && !this.spendLife()) { this.gameOver(cause); return; }
    this.run.gauntlet = null;      // no second run at a gauntlet
    this.restartStage();
  }

  gameOver(cause) {
    this.over = true;
    this.banner.clear();
    if (this.run.score > this.best) { this.best = this.run.score; localStorage.setItem('rc-best', this.best); }
    this.ui.best.textContent = this.best;
    this.ui.overTitle.textContent = 'CLAIM DENIED';
    this.countdown = CONTINUE_TIME;
    this.renderOver();
    this.ui.over.classList.add('show');
    sfx.over();
    music.reset({ dead: true });
  }

  hud(score, flock = '') {
    this.ui.score.textContent = score;
    this.ui.coinCount.textContent = Math.floor(this.run.coins);
    this.ui.lives.textContent = this.run.lives;
    this.ui.tries.textContent = this.run.tries;
    this.ui.chicks.innerHTML = `FLOCK ${flock || '<b>0</b>'}`;
  }

  card(text) {
    this.ui.card.textContent = text;
    this.ui.card.hidden = !text;
  }

  update(dt, time) {
    if (this.over) {
      this.mode.world?.update(dt, time);
      if (this.countdown !== null) {
        // The clock runs down and the music winds up with it.
        this.countdown = Math.max(0, this.countdown - dt);
        music.setMood({ dead: false, danger: true, countdown: 1 - this.countdown / CONTINUE_TIME });
        if (Math.ceil(this.countdown) !== this.lastTick) { this.lastTick = Math.ceil(this.countdown); this.renderOver(); if (this.countdown > 0) sfx.tick(); }
        if (this.countdown <= 0) { this.countdown = null; this.onTimeout?.(); }
      }
      return;
    }
    this.mode.update(dt, time);
  }
}
