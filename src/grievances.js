// The one-line grievance under the report title: what the day was about, in
// form language. RE: prefix, a comma, four to six words. Keyed by scenario id
// and by cause of death; the pick is seeded so a replayed day reads the same.

const BY_SCENARIO = {
  road:   ['RE: FLATBED, WOULD NOT YIELD', 'RE: TRAFFIC, NO CROSSWALK', 'RE: SEDAN, DID NOT SLOW', 'RE: ROAD, TOO MANY LANES'],
  river:  ['RE: GATOR, LOOKED AT ME FUNNY', 'RE: LOGS, DRIFTED OFF SCHEDULE', 'RE: BOAT, NO HORN SOUNDED', 'RE: RIVER, NO BRIDGE'],
  rail:   ['RE: TRAIN, TWO GATES, ONE TRACK', 'RE: GATES, CAME DOWN LATE', 'RE: TRAIN, NO WHISTLE', 'RE: TRACK, NO TIMETABLE POSTED'],
  runway: ['RE: RUNWAY, PLANES USE IT', 'RE: JET, TAXIED WITHOUT LOOKING', 'RE: WING, NO HANDRAIL', 'RE: TOWER, NEVER CALLED BACK'],
  mines:  ['RE: MINES, NO SIGNAGE', 'RE: FLAGS, WRONG COLOUR', 'RE: FIELD, TICKING NOISES', 'RE: MINES, WHO APPROVED THIS'],
  hedge:  ['RE: HEDGE, NEEDS TRIMMING', 'RE: TUNNEL, NOT ON MAP', 'RE: SHRUB, BLOCKED THE VIEW'],
  trees:  ['RE: TREES, TOO CLOSE TOGETHER', 'RE: CANOPY, HID THE WAY', 'RE: ONE TREE, MISSING'],
  busStop: ['RE: BUS, NEVER CAME', 'RE: SHELTER, NO BACK WALL', 'RE: TIMETABLE, FICTIONAL'],
  picket: ['RE: FENCE, ONE BOARD LOOSE', 'RE: PICKETS, FRESHLY PAINTED', 'RE: GATE, THERE WAS NONE'],
  chainlink: ['RE: FENCE, HOLE CUT LOW', 'RE: CHAIN LINK, RATTLED', 'RE: PANEL, SOMEONE GOT THERE FIRST'],
  wall:   ['RE: WALL, NO DOOR', 'RE: CULVERT, DAMP', 'RE: BRICKS, UNSYMPATHETIC'],
  grass:  ['RE: GRASS, GENERALLY FINE', 'RE: LAWN, NO COMPLAINTS FILED', 'RE: FIELD, LONG WALK'],
  meadow: ['RE: MEADOW, PLEASANT, SUSPICIOUS', 'RE: MEADOW, TOO QUIET', 'RE: FLOWERS, UNMARKED'],
  finish: ['RE: FINISH, FURTHER THAN STATED', 'RE: LINE, MOVED OVERNIGHT', 'RE: ARRIVAL, NO ONE THERE'],
};

const BY_CAUSE = {
  car:     ['RE: SEDAN, DID NOT BRAKE', 'RE: DRIVER, PHONE IN HAND', 'RE: CAR, NO INDICATOR'],
  hauled:  ['RE: FLATBED, HAULED ME OFF', 'RE: TRUCK, LEFT TOWN WITH ME'],
  water:   ['RE: RIVER, WET', 'RE: LOG, ROLLED', 'RE: WATER, DEEPER THAN POSTED'],
  chomped: ['RE: GATOR, LOOKED AT ME FUNNY', 'RE: GATOR, BIT FIRST'],
  rundown: ['RE: BOAT, NO HORN SOUNDED', 'RE: SUBMARINE, SURFACED UNDER ME'],
  train:   ['RE: TRAIN, TWO GATES, ONE TRACK', 'RE: TRAIN, NO WHISTLE', 'RE: GATES, CAME DOWN LATE'],
  plane:   ['RE: JET, TAXIED WITHOUT LOOKING', 'RE: PLANE, LANDED ON ME'],
  flown:   ['RE: WING, NO HANDRAIL', 'RE: FLIGHT, DID NOT BOOK'],
  mine:    ['RE: MINE, WENT OFF EARLY', 'RE: MINES, NO SIGNAGE'],
};

const FALLBACK = ['RE: THE DAY, GENERALLY', 'RE: EVERYTHING, SEE ATTACHED'];
// Filler bands only speak for the day when nothing dangerous was on the board.
const FILLER = new Set(['grass', 'meadow', 'finish']);

// One step of a 32-bit LCG on the seed, mapped onto [0, n).
const pickAt = (list, seed) => list[Math.abs(Math.imul(seed >>> 0, 1103515245) + 12345) % list.length];

// scenarios: scenario ids, one per row on the board. lastDeath: the cause of
// the last death this level, if any. The seed is level * 7919 + rows.
export function grievanceFor({ scenarios = [], lastDeath = null, level = 1, rows = 0 } = {}) {
  const seed = level * 7919 + rows;
  if (lastDeath && BY_CAUSE[lastDeath]) return pickAt(BY_CAUSE[lastDeath], seed);
  const tally = {};
  for (const id of scenarios) if (BY_SCENARIO[id]) tally[id] = (tally[id] ?? 0) + 1;
  const hazards = Object.keys(tally).some((id) => !FILLER.has(id));
  let best = null;
  for (const id of Object.keys(BY_SCENARIO)) {
    if (!tally[id] || (hazards && FILLER.has(id))) continue;
    if (best === null || tally[id] > tally[best]) best = id;
  }
  return pickAt(best ? BY_SCENARIO[best] : FALLBACK, seed);
}
