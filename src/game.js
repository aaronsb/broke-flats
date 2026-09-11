// Top-level state machine. Holds the run record (score, coins, level) that
// survives mode switches; each mode owns everything else and rebuilds it.
import { CrossingMode } from './modes/crossing.js';
import { BattleMode } from './modes/battle.js';
import { levelFor } from './levels.js';
import { SKIES } from './sky.js';
import { DEATHS } from './deaths.js';
import { sfx } from './sfx.js';
import { music } from './music.js';

const START_COINS = 4;

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
    this.ui.best.textContent = `BEST ${this.best}`;
    this.run = { level: 1, score: 0, coins: START_COINS };
    this.debug = { on: false, force: null, sky: null, god: false };
  }

  start() {
    this.run = { level: 1, score: 0, coins: START_COINS };
    this.over = false;
    this.ui.over.classList.remove('show');
    this.setLevel(1);
    this.setMode(new CrossingMode(this));
    sfx.start();
  }

  setLevel(n) {
    this.level = levelFor(n);
    this.run.level = n;
    const skyName = this.debug.sky ?? this.level.sky;
    this.sky.apply(skyName);
    this.headlights.enabled = this.sky.headlights;
    this.ui.level.textContent = `LV ${n} · ${SKIES[skyName].label}${this.debug.on ? ' · DEBUG' : ''}`;
  }

  // Sequencer weights for the current stage, honouring a forced scenario.
  stageWeights() {
    return this.debug.force ? { [this.debug.force]: 1 } : this.level.weights;
  }

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

  gameOver(cause) {
    this.over = true;
    if (this.run.score > this.best) { this.best = this.run.score; localStorage.setItem('rc-best', this.best); }
    this.ui.best.textContent = `BEST ${this.best}`;
    this.ui.overTitle.textContent = DEATHS[cause]?.title ?? 'OUCH';
    this.ui.overScore.textContent = `score ${this.run.score} · level ${this.run.level}`;
    this.ui.overCoins.textContent = `coins ${Math.floor(this.run.coins)}`;
    this.ui.over.classList.add('show');
    sfx.over();
    music.setMood({ dead: true });
  }

  hud(score) {
    this.ui.score.textContent = score;
    this.ui.coins.textContent = `● ${Math.floor(this.run.coins)}`;
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
