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
  };
}
