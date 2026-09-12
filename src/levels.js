// A level is data: sky, scenery theme, how many danger bands the crossing runs, sequencer
// weights, and the battle mix that ends it.
// After the last entry the list cycles with a rising difficulty multiplier.
export const LEVELS = [
  { sky: 'day',    scenery: 'forest',      bands: 8,  weights: { road: 5, river: 2, grass: 3, meadow: 1, hedge: 1 },
    battle: { air: 1, sea: 1, land: 2, duration: 30 } },
  { sky: 'sunset', scenery: 'residential', bands: 9,  weights: { road: 4, river: 3, rail: 1, grass: 3, meadow: 1, hedge: 1 },
    battle: { air: 2, sea: 2, land: 2, duration: 30 } },
  { sky: 'night',  scenery: 'city',        bands: 10, weights: { road: 4, river: 3, runway: 1, rail: 1, grass: 2, meadow: 1, hedge: 1 },
    battle: { air: 2, sea: 2, land: 3, duration: 35 } },
  { sky: 'rain',   scenery: 'parking',     bands: 10, weights: { road: 4, river: 4, runway: 2, rail: 2, grass: 3, meadow: 1, hedge: 1 },
    battle: { air: 3, sea: 2, land: 2, duration: 35 } },
];

// The first pass through the table introduces crossing types one level at a
// time; every later loop uses the full mix from the last entry.
export function levelFor(n) {
  const base = LEVELS[(n - 1) % LEVELS.length];
  const loop = Math.floor((n - 1) / LEVELS.length);
  const weights = loop > 0 ? LEVELS[LEVELS.length - 1].weights : base.weights;
  return { ...base, weights, number: n, difficulty: (n - 1) * 0.6 + loop * 1.5 };
}
