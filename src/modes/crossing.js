// The board stage: hop across bands until the finish line. Owns the world
// and the player; tears both down on exit. Only the run record survives.
import { World } from '../world.js';
import { Player, BACK_LIMIT } from '../player.js';
import { Train } from '../train.js';
import { sfx } from '../sfx.js';
import { music } from '../music.js';

const TILT_COST = 1; // coins per second while peeking
const CHICK_BONUS = 25;

const KEYS = {
  ArrowUp: [0, 1], KeyW: [0, 1],
  ArrowDown: [0, -1], KeyS: [0, -1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};

export class CrossingMode {
  constructor(game) {
    this.game = game;
    this.hint = 'arrows / WASD hop · SPACE peek in 3D (burns coins) · M mute · P pixels';
  }

  enter() {
    const { scene, level, sky } = this.game;
    this.world = new World(scene, {
      weights: level.weights, bands: level.bands, difficulty: level.difficulty, sky,
      onFinish: () => { this.finished = true; },
    });
    this.player = new Player(scene, this.world);
    this.player.coins = this.game.run.coins;
    this.train = new Train(scene, this.world, this.player);
    this.player.onEgg = () => this.train.hatch();
    this.world.ensure(26);
    this.finished = false;
    this.tilted = false;
    this.game.camera.snap(0, -3, 'top');
    this.game.ui.view.hidden = false;
    music.setMood({ dead: false, danger: false, battle: false, tilted: false });
  }

  exit() {
    this.world.dispose();
    this.train.dispose();
    this.game.scene.remove(this.player.mesh);
    this.game.ui.view.hidden = true;
    this.game.ui.view.classList.remove('on');
  }

  setTilt(on) {
    if (on === this.tilted) return;
    if (on && this.player.coins < 1) { sfx.bump(); return; }
    this.tilted = on;
    this.game.ui.view.classList.toggle('on', on);
    this.game.camera.setGoal(on ? 'iso' : 'top');
    sfx.tilt();
  }

  onKey(e) {
    if (e.code === 'Space') { this.setTilt(!this.tilted); return true; }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { this.setTilt(true); return true; }
    const d = KEYS[e.code];
    if (d) { this.player.hop(d[0], d[1]); return true; }
    return false;
  }

  onKeyUp(e) {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.setTilt(false);
  }

  onSwipe(dx, dy) {
    if (Math.hypot(dx, dy) < 20) this.player.hop(0, 1);
    else if (Math.abs(dx) > Math.abs(dy)) this.player.hop(Math.sign(dx), 0);
    else this.player.hop(0, dy < 0 ? 1 : -1);
  }

  onViewButton() { this.setTilt(!this.tilted); }

  update(dt, time) {
    const { game, player, world } = this;
    player.update(dt);
    this.train.update(dt);
    world.update(dt, time);
    world.ensure(player.row + 26);
    world.cull(player.maxRow - BACK_LIMIT - 2);

    const lane = world.laneAt(player.moving ? player.trow : player.row);
    music.setMood({ danger: !!lane?.scenario.danger, tilted: this.tilted });

    if (this.tilted) {
      player.coins -= TILT_COST * dt;
      if (player.coins <= 0) { player.coins = 0; this.setTilt(false); }
    }
    game.ui.coins.classList.toggle('draining', this.tilted);
    game.ui.view.classList.toggle('broke', player.coins < 1);

    // Camera leads further ahead as the view tilts.
    const cam = game.camera;
    const lead = 3 + cam.tilt * 3;
    cam.update(dt, Math.max(-3, Math.min(3, player.x)) * 0.35, player.z - lead);
    game.sky.update(dt, player.x, player.z);

    game.run.coins = player.coins;
    game.hud(game.run.score + player.maxRow);
    game.ui.chicks.textContent = this.train.count ? `🐥 ${this.train.count}` : '';

    if (this.finished) {
      // Every chick led home is worth a bonus.
      game.run.score += player.maxRow + this.train.count * CHICK_BONUS;
      game.run.coins += this.train.count;
      game.stageClear();
    } else if (!player.alive && player.deadFor > 0.9) {
      game.run.score += player.maxRow;
      game.gameOver(player.deadBy);
    }
  }
}
