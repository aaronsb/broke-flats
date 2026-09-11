// Tetromino footprints for buildings that span several rows. Rows are built
// one at a time, so a planner reserves cells ahead and each row draws its
// share. Cells of one building share a style so they read as one block.
import { pick, randInt } from '../util.js';

const SHAPES = [
  [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [0, 1], [0, 2], [0, 3]],
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [1, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 2]],
  [[1, 0], [2, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [1, 1], [2, 1]],
];

export class Footprints {
  constructor() { this.cells = new Map(); }

  key(r, x) { return `${r}:${x}`; }

  // Try to start a building whose cells fall within [xMin, xMax] on rows >= r.
  plan(r, xMin, xMax, style) {
    const shape = pick(...SHAPES);
    const w = Math.max(...shape.map(([dx]) => dx));
    const x0 = randInt(xMin, xMax - w);
    const cells = shape.map(([dx, dr]) => [r + dr, x0 + dx]);
    if (cells.some(([cr, cx]) => this.cells.has(this.key(cr, cx)))) return false;
    for (const [cr, cx] of cells) this.cells.set(this.key(cr, cx), { x: cx, style });
    return true;
  }

  occupied(r, xMin, xMax) {
    for (let x = xMin; x <= xMax; x++) if (this.cells.has(this.key(r, x))) return true;
    return false;
  }

  // Cells reserved for row r, removed as they are handed out.
  take(r) {
    const out = [];
    for (const [k, v] of this.cells) {
      if (k.startsWith(`${r}:`)) { out.push(v); this.cells.delete(k); }
    }
    return out;
  }
}
