// Scenario contract. Each module exports an object:
//   id        unique name
//   danger    true if the row can kill (drives the music mood)
//   weight    sequencer pick weight (0 = only placed explicitly)
//   band      [min, max] rows per band
//   pad       optional scenario id placed before and after the band
//   minGap    optional minimum rows between two bands of this scenario
//   build(lane, ctx)          fill the lane; ctx = { world, index, count, prev, sky, difficulty }
//   update(lane, dt, time)    optional per-frame step
//   onLand(lane, player)      optional; return a death cause, or set player.carrier
//   lethalAt(lane, x)         optional; return a death cause if x is deadly now
import meadow from './meadow.js';
import grass from './grass.js';
import road from './road.js';
import river from './river.js';
import hedge from './hedge.js';
import finish from './finish.js';
import runway from './runway.js';
import rail from './rail.js';

export const SCENARIOS = { meadow, grass, road, river, runway, rail, hedge, finish };
export const INTRO = 'meadow';
