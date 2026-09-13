// Scenario contract. Each module exports an object:
//   id        unique name
//   danger    true if the row can kill (drives the music mood)
//   weight    sequencer pick weight (0 = only placed explicitly)
//   band      [min, max] rows per band, or a function of the level number returning one
//   pad       optional scenario id placed before and after the band
//   minGap    optional minimum rows between two bands of this scenario
//   keepGap   honour minGap even when the sequencer is forced to one scenario
//   flank     optional list of scenario ids allowed directly before and after the band
//   family    optional group name; scenarios in a family share minGap
//   follows   optional scenario id; after a band of it the sequencer may queue this one next
//   build(lane, ctx)          fill the lane; ctx = { world, index, count, prev, sky, difficulty }
//   update(lane, dt, time)    optional per-frame step
//   onLand(lane, player)      optional; return a death cause, or set player.carrier
//   lethalAt(lane, x)         optional; return a death cause if x is deadly now
import meadow from './meadow.js';
import grass from './grass.js';
import road from './road.js';
import river from './river.js';
import finish from './finish.js';
import runway from './runway.js';
import rail from './rail.js';
import mines from './mines.js';
import freight from './freight.js';
import { BARRIERS } from './barrier.js';

export const SCENARIOS = { meadow, grass, road, river, runway, rail, freight, mines, ...BARRIERS, finish };
export const INTRO = 'meadow';
