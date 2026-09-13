// Traffic difficulty curve. `difficulty` grows about 0.6 per level; the curve
// saturates around level nine. Gaps never close below a passable cell.
import { clamp, lerp } from './util.js';

export function traffic(difficulty) {
  const k = clamp(difficulty / 5, 0, 1);
  return {
    speed: lerp(0.8, 1.6, k),                  // multiplier on each lane's base speed
    gapMin: lerp(3.2, 1.6, k),                 // smallest bumper-to-bumper gap
    gapVar: lerp(3.0, 1.2, k),                 // random extra gap on top
    count: [Math.round(lerp(2, 3, k)), Math.round(lerp(3, 5, k))],
    stall: lerp(0.05, 0.55, k),                // chance a vehicle is a staller
    reckless: lerp(-0.25, 0.35, k),            // chance a vehicle never brakes (negative = none yet)
  };
}

// Which kinds a lane may use at a given level, and whether it may mix them.
// Level one is plain: logs and cars. The rest unlock as the levels climb.
const UNLOCK = {
  road:   { car: 1, truck: 2, flatbed: 3 },
  river:  { log: 1, boat: 2, gator: 3, sub: 4 },
  runway: { taxi: 1, takeoff: 2, landing: 3 },
  rail:   { diesel: 1, steam: 2, bullet: 4 },
  freight: { closed: 1, box2: 1, flat: 1, box1: 2 },   // one-sided cars, the trap, wait a level
};
export function kindsFor(scenario, level) {
  return Object.entries(UNLOCK[scenario]).filter(([, at]) => level >= at).map(([k]) => k);
}
export const mixesAllowed = (level) => level >= 3;
