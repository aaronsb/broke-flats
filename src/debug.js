// Playtest controls. Backquote toggles the panel; keys only act while it is open.
import { SCENARIOS } from './scenarios/index.js';
import { BARRIER_IDS } from './scenarios/barrier.js';
import { SKIES } from './sky.js';
import { SCENERY } from './scenery/index.js';

const FORCE = { KeyQ: 'road', KeyE: 'river', KeyI: 'runway', KeyO: 'rail', KeyB: 'freight', KeyL: 'mines', KeyZ: 'maze', KeyX: 'snake', KeyT: 'grass', KeyU: 'meadow' };

export function installDebug(game, ui) {
  const panel = ui.debug;
  const render = () => {
    panel.innerHTML = [
      '<b>DEBUG</b> (` closes)',
      '1-4 level &nbsp; 5 hearing &nbsp; N next level',
      'Q road &nbsp; E river &nbsp; I runway &nbsp; O rail &nbsp; B freight &nbsp; L mines &nbsp; Z maze &nbsp; X snake &nbsp; T grass &nbsp; Y barrier (again: next variant) &nbsp; U meadow &nbsp; 0 clear',
      'K sky &nbsp; J scenery &nbsp; V gauntlet &nbsp; G god &nbsp; C +10 coins &nbsp; H hatch chick',
      `<i>force: ${game.debug.force ?? 'none'} · sky: ${game.debug.sky ?? 'level'} · scenery: ${game.debug.scenery ?? 'level'} · god: ${game.debug.god ? 'on' : 'off'}</i>`,
    ].join('<br>');
  };

  return (e) => {
    if (e.code === 'Backquote') {
      game.debug.on = !game.debug.on;
      panel.hidden = !game.debug.on;
      if (game.level) game.setLevel(game.run.level);   // refresh the DEBUG tag in the bar
      render();
      return true;
    }
    if (!game.debug.on || game.over) return false;
    const c = e.code;
    if (c >= 'Digit1' && c <= 'Digit4') game.jumpLevel(Number(c.slice(5)));
    else if (c === 'Digit5') game.stageClear();
    else if (c === 'KeyN') game.nextLevel();
    else if (c in FORCE) { game.debug.force = FORCE[c]; game.restartStage(); }
    else if (c === 'KeyY') { game.debug.force = BARRIER_IDS[(BARRIER_IDS.indexOf(game.debug.force) + 1) % BARRIER_IDS.length]; game.restartStage(); }
    else if (c === 'Digit0') { game.debug.force = null; game.restartStage(); }
    else if (c === 'KeyK') {
      const names = Object.keys(SKIES);
      game.debug.sky = names[(names.indexOf(game.debug.sky ?? game.level.sky) + 1) % names.length];
      game.restartStage();
    }
    else if (c === 'KeyJ') {
      const names = Object.keys(SCENERY);
      game.debug.scenery = names[(names.indexOf(game.debug.scenery ?? game.level.scenery) + 1) % names.length];
      game.restartStage();
    }
    else if (c === 'KeyV') { game.run.gauntlet = game.debug.force ?? 'road'; game.debug.force = null; game.restartStage(); }
    else if (c === 'KeyG') { game.debug.god = !game.debug.god; game.mode.players?.forEach((p) => { p.invincible = game.debug.god; }); }
    else if (c === 'KeyC') { game.run.coins += 10; }
    else if (c === 'KeyH') game.mode.trains?.forEach((t) => t.hatch());
    else return false;
    render();
    return true;
  };
}

