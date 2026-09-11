// A level is data: sky, how many danger bands the crossing runs, sequencer
// weights, the player variant, and the battle mix that ends it.
// After the last entry the list cycles with a rising difficulty multiplier.
export const LEVELS = [
  { sky: 'day',    bands: 8,  weights: { road: 4, river: 2, grass: 3, meadow: 1, hedge: 1 }, variant: 'solo',
    battle: { air: 1, sea: 1, land: 2, duration: 30 } },
  { sky: 'sunset', bands: 9,  weights: { road: 4, river: 3, grass: 3, meadow: 1, hedge: 1 }, variant: 'solo',
    battle: { air: 2, sea: 2, land: 2, duration: 30 } },
  { sky: 'night',  bands: 10, weights: { road: 5, river: 3, grass: 2, meadow: 1, hedge: 1 }, variant: 'train',
    battle: { air: 2, sea: 2, land: 3, duration: 35 } },
  { sky: 'rain',   bands: 10, weights: { road: 4, river: 4, grass: 3, meadow: 1, hedge: 1 }, variant: 'solo',
    battle: { air: 3, sea: 2, land: 2, duration: 35 } },
];

export function levelFor(n) {
  const base = LEVELS[(n - 1) % LEVELS.length];
  const loop = Math.floor((n - 1) / LEVELS.length);
  return { ...base, number: n, difficulty: (n - 1) * 0.6 + loop * 1.5 };
}
