// A level is data: the district of Broke Flats it is set in, sky, scenery theme,
// how many danger bands the crossing runs, sequencer weights, and the battle mix
// that ends it. A district's motto rides under its name on the welcome signs;
// `leave` is the line on the sign at its finish.
// After the last entry the list cycles with a rising difficulty multiplier.
export const LEVELS = [
  { district: { name: 'PINE HOLLOW', motto: 'THE ROAD CAME LATER', leave: 'COME BACK IN ONE PIECE' },
    sky: 'day',    scenery: 'forest',      bands: 8,  weights: { road: 5, river: 2, grass: 3, meadow: 1, freight: 0.5, hedge: 1, trees: 1, picket: 0.5, wall: 0.5 },
    battle: { air: 1, sea: 1, land: 2, duration: 30 } },
  { district: { name: 'CUL-DE-SAC HEIGHTS', motto: 'EVERY STREET ENDS HERE', leave: 'NO THROUGH TRAFFIC. HA' },
    sky: 'sunset', scenery: 'residential', bands: 9,  weights: { road: 4, river: 3, rail: 1, freight: 1, grass: 3, meadow: 1, hedge: 0.5, trees: 0.5, picket: 1, chainlink: 0.5, busStop: 0.5 },
    battle: { air: 2, sea: 2, land: 2, duration: 30 } },
  { district: { name: 'DOWNTOWN', motto: 'NEVER SLEEPS. NEVER YIELDS', leave: 'PARKING ENFORCED 24 HRS' },
    sky: 'night',  scenery: 'city',        bands: 10, weights: { road: 4, river: 3, runway: 1, rail: 1, freight: 1.5, grass: 2, meadow: 1, busStop: 1, chainlink: 1, wall: 1 },
    battle: { air: 2, sea: 2, land: 3, duration: 35 } },
  { district: { name: 'LOT 9', motto: 'OVERFLOW PARKING SINCE 1974', leave: 'VALIDATE YOUR TICKET' },
    sky: 'rain',   scenery: 'parking',     bands: 10, weights: { road: 4, river: 4, runway: 2, rail: 2, freight: 1.5, grass: 3, meadow: 1, chainlink: 1, wall: 1, busStop: 0.5, picket: 0.5 },
    battle: { air: 3, sea: 2, land: 2, duration: 35 } },
  { district: { name: 'FROSTGATE', motto: 'PLOWED ALTERNATE TUESDAYS', leave: "DRIVE SLOW. THEY WON'T" },
    sky: 'snow',   scenery: 'residential', bands: 11, weights: { road: 4, river: 4, runway: 2, rail: 2, freight: 1.5, grass: 3, meadow: 1, chainlink: 1, wall: 1, busStop: 0.5, picket: 0.5 },
    battle: { air: 3, sea: 2, land: 3, duration: 35 } },
];

// The first pass through the table introduces crossing types one level at a
// time; every later loop uses the full mix from the last entry.
export function levelFor(n) {
  const base = LEVELS[(n - 1) % LEVELS.length];
  const loop = Math.floor((n - 1) / LEVELS.length);
  const weights = loop > 0 ? LEVELS[LEVELS.length - 1].weights : base.weights;
  return { ...base, weights, number: n, difficulty: (n - 1) * 0.6 + loop * 1.5 };
}
