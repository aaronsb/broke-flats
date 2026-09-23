// Snake maze gauntlet: the maze gauntlet's corridors with nothing hunting
// them, a follower waiting on every corridor cell, and a clock. Walking onto
// a follower adds it to the line behind you, so the line grows with the run
// and the corridors fill with it. Each player's streak pays SNAKE_PAY per
// follower collected and drops to zero whenever they step onto their own
// line. The mode (src/modes/crossing.js) runs the clock and cashes the line
// out at the tally.
//
// The maze is laid more open than the hunted one: no dead ends (the only way
// out of one is back over your own line), more loops, no weak walls.
import { W } from '../lane.js';
import { levelFor } from '../levels.js';
import { generate, pathThrough, layRow, wallFor } from './maze.js';

export const SNAKE_PAY = 10;         // streak bonus per follower collected
export const SNAKE_FOLLOWER = 10;    // points per follower at the tally, besides its coin
export const SNAKE_CLEAR_BONUS = 300;
export const TIME_PAY = 5;           // points per second left on the clock
const PER_CELL = 0.9;                // seconds on the clock per follower placed
const OPEN = { loops: 0.22, stub: 0, weak: 0 };
const WAITING_SCALE = 0.62;          // a follower not yet collected sits small, so the line reads apart from it

function plan(world, rows, firstRow) {
  const { grid, spine } = generate(rows, OPEN);
  let path = pathThrough(grid);
  if (!path) { console.error('snake: no path from start to finish; falling back to the spine'); path = new Array(rows).fill(spine); }
  return {
    grid, rows, firstRow, path, kind: 'path', wall: wallFor(world),
    placed: 0,          // followers laid on the board
    clock: 0,           // seconds left, set once the last row is laid
    streak: [],         // per player: followers collected since last touching their own line
    bonus: [],          // per player: the streak bonus banked so far
    touches: 0,         // times any player stepped onto their own line
  };
}

export default {
  id: 'snake',
  danger: true,       // a gauntlet: the full band plays, and it fills the danger quota
  weight: 0,          // only as a gauntlet (or forced)
  pad: 'meadow',
  band: (level) => { const n = levelFor(level).bands | 1; return [n, n]; },
  build(lane, { world, index, count }) {
    if (index === 0) world.data.snake = plan(world, count, lane.r);
    const snake = world.data.snake;
    lane.data.snake = snake;
    // Followers ride the lane's egg slot: landing takes one after the line has
    // moved up, and the player's onEgg adds it to the line.
    for (const c of layRow(lane, snake, index)) {
      const young = world.config.young?.();
      if (!young) continue;
      young.rotation.y = Math.PI + (Math.random() - 0.5) * 1.2;
      young.scale.multiplyScalar(WAITING_SCALE);
      young.scale.y *= 0.8;
      lane.eggs.set(c, lane.add(young, c));
      snake.placed++;
    }
    world.pathCol = snake.path[index] - W;
    lane.data.pathCol = world.pathCol;
    if (index === count - 1) {
      snake.clock = Math.ceil(snake.placed * PER_CELL);
      world.dangerBands = Math.max(world.dangerBands, world.config.bands);
    }
  },

  // Before the line ripples up: a landing on one of your own followers resets your streak.
  onLand(lane, player) {
    const snake = lane.data.snake;
    const i = player.index ?? 0;
    const train = player.powerCtx?.().train;
    if (train?.chickAt(player.col, lane.r)) {
      snake.streak[i] = 0;
      snake.bonus[i] = 0;
      snake.touches++;
    } else if (lane.eggs.has(player.col)) {
      snake.streak[i] = (snake.streak[i] ?? 0) + 1;
      snake.bonus[i] = (snake.bonus[i] ?? 0) + SNAKE_PAY;
    }
    return null;
  },
};
