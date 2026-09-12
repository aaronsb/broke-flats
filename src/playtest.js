// URL-driven playtest setup. Only active while PLAYTEST_URL is on.
// Example: ?level=3&force=river&sky=night&god=1&start=1
import { PLAYTEST_URL } from './config.js';
import { CHARACTERS } from './characters.js';
import { SCENARIOS } from './scenarios/index.js';
import { SKIES } from './sky.js';
import { SCENERY } from './scenery/index.js';

const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null; };
const oneOf = (v, set) => (v && set.includes(v) ? v : null);

// Parse the query string into a plain options object, or null when off.
export function readPlaytest(search = location.search) {
  if (!PLAYTEST_URL) return null;
  const q = new URLSearchParams(search);
  if ([...q.keys()].length === 0) return null;
  const hazards = Object.values(SCENARIOS).filter((s) => s.danger).map((s) => s.id);
  const o = {
    level: num(q.get('level'), 1, 99),
    force: oneOf(q.get('force'), Object.keys(SCENARIOS).filter((k) => k !== 'finish')),
    gauntlet: oneOf(q.get('gauntlet'), hazards),
    sky: oneOf(q.get('sky'), Object.keys(SKIES)),
    scenery: oneOf(q.get('scenery'), Object.keys(SCENERY)),
    chars: (q.get('chars') ?? '').split(',').map((id) => CHARACTERS.findIndex((c) => c.id === id)).filter((i) => i >= 0).slice(0, 2),
    coins: num(q.get('coins'), 0, 9999),
    lives: num(q.get('lives'), 0, 99),
    god: q.has('god'),
    debug: q.has('debug'),
    start: q.has('start') || q.has('battle'),
    battle: q.has('battle'),
  };
  return o;
}

// Apply the pre-start options (roster, debug switches) to the game.
export function applyBeforeStart(game, o) {
  if (o.chars.length) game.picks = o.chars;
  game.debug.force = o.force;
  game.debug.sky = o.sky;
  game.debug.scenery = o.scenery;
  game.debug.god = o.god;
}

// Apply the in-run options once the crossing exists.
export function applyAfterStart(game, o) {
  if (o.lives !== null) game.run.lives = o.lives;
  if (o.level !== null || o.gauntlet) {
    if (o.level !== null) game.setLevel(o.level);
    game.run.gauntlet = o.gauntlet;
    game.restartStage();
  }
  if (o.coins !== null) game.run.coins = o.coins;
  if (o.battle) game.stageClear();
  game.hud(game.run.score);
}
