// The mini map: the run's town page as a small SVG in the HUD corner. Spots
// are dots (a gauntlet a hazard diamond), the ways between them thin lines,
// the route walked so far a thick one, the current spot ringed. While a
// hearing's doors are open the two spots they lead to pulse.
import { MAP_W, MAP_ROWS } from './townmap.js';
import { LEVELS } from './levels.js';

const GAP_X = 14, GAP_Y = 16, PAD = 9;
const WIDTH = PAD * 2 + GAP_X * (MAP_W - 1), HEIGHT = PAD * 2 + GAP_Y * (MAP_ROWS - 1);
const X = (p) => PAD + p * GAP_X;
const Y = (r) => HEIGHT - PAD - r * GAP_Y;
// A dot colour per district, in the order of LEVELS: forest, residential, city, parking, snow.
const TINT = ['#3f9a4a', '#e0a44a', '#6a7cc9', '#9a9aa2', '#e8f2ff'];

// map: a page from townmap.js; at: { r, p } the current spot; path: [{ r, p }]
// walked on this page, oldest first; offer: positions on row r + 1 open to pick.
export function drawMinimap(el, { map, at, path = [], offer = null }) {
  if (!el || !map) return;
  const parts = [];
  for (const row of map.rows) {
    for (const s of row) {
      if (s.r === MAP_ROWS - 1) continue;
      for (const e of s.exits) parts.push(`<line x1="${X(s.p)}" y1="${Y(s.r)}" x2="${X(e)}" y2="${Y(s.r + 1)}" class="way"/>`);
    }
  }
  for (let k = 1; k < path.length; k++) parts.push(`<line x1="${X(path[k - 1].p)}" y1="${Y(path[k - 1].r)}" x2="${X(path[k].p)}" y2="${Y(path[k].r)}" class="walked"/>`);
  const walked = new Set(path.map((s) => `${s.r},${s.p}`));
  for (const row of map.rows) {
    for (const s of row) {
      const x = X(s.p), y = Y(s.r), cls = walked.has(`${s.r},${s.p}`) ? 'spot walked' : 'spot';
      const fill = TINT[s.district % TINT.length];
      parts.push(s.gauntlet
        ? `<rect x="${x - 3.5}" y="${y - 3.5}" width="7" height="7" transform="rotate(45 ${x} ${y})" fill="#f5c518" stroke="#141208" class="${cls}"><title>${s.gauntlet.toUpperCase()} GAUNTLET</title></rect>`
        : `<circle cx="${x}" cy="${y}" r="3.5" fill="${fill}" class="${cls}"><title>${LEVELS[s.district].district.name}</title></circle>`);
    }
  }
  if (offer) for (const p of offer) parts.push(`<circle cx="${X(p)}" cy="${Y(at.r + 1)}" r="6.5" class="offer"/>`);
  if (at) parts.push(`<circle cx="${X(at.p)}" cy="${Y(at.r)}" r="6" class="here"/>`);
  el.innerHTML = `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Town map">${parts.join('')}</svg>`;
  el.hidden = false;
}
