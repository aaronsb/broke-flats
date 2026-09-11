// Top-level state machine. Holds the run record (score, coins, level) that
// survives mode switches; each mode owns everything else and rebuilds it.
import { CrossingMode } from './modes/crossing.js';
import { BattleMode } from './modes/battle.js';
import { levelFor } from './levels.js';
import { SKIES } from './sky.js';
import { SCENERY } from './scenery/index.js';
import { DEATHS } from './deaths.js';
import { CHARACTERS } from './characters.js';
import { sfx } from './sfx.js';
import { music } from './music.js';

const START_COINS = 4;
const ODD_WEATHER = 0.1;   // chance the first level opens under a different sky

export class Game {
  constructor({ scene, camera, sky, ui, headlights }) {
    this.scene = scene;
    this.camera = camera;
    this.sky = sky;
    this.headlights = headlights;
    this.ui = ui;
    this.mode = null;
    this.over = false;
    this.best = Number(localStorage.getItem('rc-best') || 0);
    this.ui.best.textContent = this.best;
    this.run = { level: 1, score: 0, coins: START_COINS, flock: [], tries: 0, variants: [] };
    this.debug = { on: false, force: null, sky: null, scenery: null, god: false };
    this.picks = [0];          // roster indices into CHARACTERS, one per player
  }

  get roster() { return this.picks.map((i) => CHARACTERS[i]); }

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
    this.run = { level: 1, score: 0, coins: START_COINS, flock: [], tries: 0, variants: [] };
    const others = Object.keys(SKIES).filter((k) => k !== levelFor(1).sky);
    this.run.oddSky = Math.random() < ODD_WEATHER ? others[Math.floor(Math.random() * others.length)] : null;
    this.over = false;
    this.ui.over.classList.remove('show');
    this.setLevel(1);
    this.setMode(new CrossingMode(this));
    sfx.start();
  }

  setLevel(n) {
    this.level = levelFor(n);
    this.run.level = n;
    const skyName = this.debug.sky ?? (n === 1 ? this.run.oddSky : null) ?? this.level.sky;
    this.sky.apply(skyName);
    this.headlights.enabled = this.sky.headlights;
    this.ui.level.innerHTML = `LV <b>${n}</b> ${SKIES[skyName].label}${this.debug.on ? ' <b>DEBUG</b>' : ''}`;
  }

  // Sequencer weights for the current stage, honouring a forced scenario.
  stageWeights() {
    return this.debug.force ? { [this.debug.force]: 1 } : this.level.weights;
  }

  scenery() { return SCENERY[this.debug.scenery ?? this.level.scenery]; }

  jumpLevel(n) { this.setLevel(n); this.setMode(new CrossingMode(this)); }
  restartStage() { this.setLevel(this.run.level); this.setMode(new CrossingMode(this)); }

  setMode(mode) {
    this.mode?.exit();
    this.mode = mode;
    mode.enter();
    this.ui.hint.textContent = mode.hint;
  }

  stageClear() { this.setMode(new BattleMode(this)); }

  nextLevel() {
    this.setLevel(this.run.level + 1);
    this.setMode(new CrossingMode(this));
  }

  // Death is a reset to the start of the stage, never a game over.
  splat(cause) {
    this.card(DEATHS[cause]?.title ?? 'OUCH');
    setTimeout(() => this.card(''), 1200);
    this.run.tries += 1;
    if (this.run.score > this.best) { this.best = this.run.score; localStorage.setItem('rc-best', this.best); }
    this.ui.best.textContent = this.best;
    this.restartStage();
  }

  gameOver(cause) {
    this.over = true;
    if (this.run.score > this.best) { this.best = this.run.score; localStorage.setItem('rc-best', this.best); }
    this.ui.best.textContent = this.best;
    this.ui.overTitle.textContent = DEATHS[cause]?.title ?? 'OUCH';
    this.ui.overScore.textContent = `score ${this.run.score} · level ${this.run.level}`;
    this.ui.overCoins.textContent = `coins ${Math.floor(this.run.coins)}`;
    this.ui.over.classList.add('show');
    sfx.over();
    music.setMood({ dead: true });
  }

  hud(score, flock = '') {
    this.ui.score.textContent = score;
    this.ui.coinCount.textContent = Math.floor(this.run.coins);
    this.ui.tries.textContent = this.run.tries;
    this.ui.chicks.innerHTML = `FLOCK ${flock || '<b>0</b>'}`;
  }

  card(text) {
    this.ui.card.textContent = text;
    this.ui.card.hidden = !text;
  }

  update(dt, time) {
    if (this.over) { this.mode.world?.update(dt, time); return; }
    this.mode.update(dt, time);
  }
}
