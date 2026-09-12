// The Broke Flats signs, as one drawable asset.
//
// `signSvg()` is the pair on its own: the yellow CROSSING diamond set a little
// left, and the town sign slung across the bottom two thirds of it, a little
// right. The title and the about panel both mount it.
//
// `sceneSvg()` frames that same sign group over a flat daytime scene — a few
// buildings, trees and a car — for the attract intro, where the town sign
// slams down over the crossing sign and then creaks askew on its posts.
import { sfx } from './sfx.js';

// --- palette, shared with the game's own ---
const SKY = '#8fd3ff', GRASS = '#6fbf52', TAR = '#141208', YELLOW = '#f5c518';
const ROAD = '#4a4a52', WOOD = '#7a5636', GREEN = '#2f6b41', BONE = '#ded9c4';

// A walking figure over two crosswalk stripes, 26 x 33, drawn from the origin.
const pedestrian = () => `
  <g fill="${TAR}">
    <rect x="10" y="0" width="6" height="6"/><rect x="9.5" y="7" width="7" height="10"/>
    <rect x="5" y="8" width="4.5" height="3"/><rect x="16.5" y="10" width="4" height="3"/>
    <rect x="6" y="17" width="4" height="5"/><rect x="4.5" y="21.5" width="4" height="4"/>
    <rect x="14.5" y="17" width="4" height="5"/><rect x="16.5" y="21.5" width="4" height="4"/>
    <rect x="0" y="26.5" width="26" height="2.2"/><rect x="0" y="30" width="26" height="2.2"/>
  </g>`;

// The sign pair in its own 300 x 210 space. Two groups so the intro can move
// them separately: .xing drops in, .town slams over it.
export const signGroup = () => `
  <g class="xing">
    <rect x="87.5" y="100" width="9" height="110" fill="#9aa0a8"/>
    <rect x="87.5" y="100" width="3" height="110" fill="#767c84"/>
    <g transform="rotate(45 92 66)">
      <rect x="56" y="30" width="72" height="72" rx="5" fill="${TAR}"/>
      <rect x="59" y="33" width="66" height="66" rx="3" fill="${YELLOW}"/>
    </g>
    <text x="92" y="49" text-anchor="middle" font-size="6" fill="${TAR}">CROSSING</text>
    <g transform="translate(79 59)">${pedestrian()}</g>
  </g>
  <ellipse class="dust l" cx="114" cy="206" rx="20" ry="5"/>
  <ellipse class="dust r" cx="250" cy="206" rx="17" ry="4"/>
  <g class="town">
    <rect x="110" y="116" width="8" height="94" fill="${WOOD}"/>
    <rect x="246" y="116" width="8" height="94" fill="${WOOD}"/>
    <rect x="70" y="57" width="216" height="68" rx="3" fill="${BONE}"/>
    <rect x="74" y="61" width="208" height="60" rx="2" fill="${GREEN}"/>
    <circle cx="103" cy="107" r="8" fill="#000" opacity=".1"/>
    <circle cx="243" cy="70" r="7" fill="#000" opacity=".1"/>
    <circle cx="178" cy="66" r="10" fill="#fff" opacity=".06"/>
    <rect x="96" y="55" width="10" height="8" fill="#8a5a33"/>
    <rect x="228" y="119" width="8" height="7" fill="#8a5a33"/>
    <text x="178" y="80" text-anchor="middle" font-size="7.5" fill="#eceada" opacity=".42">WELCOME TO</text>
    <text class="name" x="178" y="109" text-anchor="middle" font-size="17" fill="#f4f2e4">BROKE FLATS</text>
  </g>`;

// The sign pair alone, for the title logo and the about panel.
export const signSvg = () =>
  `<svg class="sign" viewBox="0 0 300 210" role="img" aria-label="Broke Flats">${signGroup()}</svg>`;

// Buildings along the far side of the road: x, width, height, colour.
const BLOCKS = [[16, 52, 62, '#d9702a'], [76, 40, 46, '#4a7fc1'], [124, 62, 80, '#e0d8c6'],
                [252, 44, 54, '#9b5aa8'], [304, 58, 70, '#3f8f6f']];

const building = ([x, w, h, fill]) => {
  const top = 196 - h;
  let s = `<rect x="${x}" y="${top}" width="${w}" height="${h}" fill="${fill}"/>
           <rect x="${x - 3}" y="${top - 6}" width="${w + 6}" height="6" fill="${TAR}" opacity=".55"/>`;
  for (let wy = top + 10; wy < 188; wy += 16)
    for (let wx = x + 7; wx < x + w - 9; wx += 15)
      s += `<rect x="${wx}" y="${wy}" width="8" height="9" fill="${wy < top + 20 ? '#ffd23f' : '#2b3a52'}" opacity=".8"/>`;
  return s;
};

// Chunky voxel-ish tree: trunk plus two stacked canopy blocks.
const tree = (x, scale = 1) => `
  <g transform="translate(${x} 196) scale(${scale})">
    <rect x="-4" y="-30" width="8" height="30" fill="${WOOD}"/>
    <rect x="-17" y="-50" width="34" height="22" fill="#2f7d3f"/>
    <rect x="-12" y="-64" width="24" height="16" fill="#3d9950"/>
  </g>`;

const car = `
  <g transform="translate(298 196)">
    <rect x="2" y="14" width="68" height="18" rx="3" fill="#d94a3a"/>
    <rect x="18" y="2" width="34" height="14" rx="3" fill="#e8604f"/>
    <rect x="22" y="5" width="12" height="9" fill="#bfe6ff"/>
    <rect x="37" y="5" width="12" height="9" fill="#bfe6ff"/>
    <circle cx="17" cy="34" r="7" fill="#1a1a20"/><circle cx="17" cy="34" r="3" fill="#8a8f98"/>
    <circle cx="57" cy="34" r="7" fill="#1a1a20"/><circle cx="57" cy="34" r="3" fill="#8a8f98"/>
  </g>`;

const cloud = (x, y, s) => `
  <g transform="translate(${x} ${y}) scale(${s})" fill="#fff" opacity=".92">
    <rect x="0" y="8" width="54" height="12" rx="6"/><rect x="12" y="0" width="30" height="14" rx="7"/>
  </g>`;

// The framed postcard: scene behind, the sign group in front of it.
export const sceneSvg = () => `
  <svg class="scene" viewBox="0 0 400 266" role="img" aria-label="Broke Flats">
    <rect width="400" height="266" fill="${SKY}"/>
    <circle cx="352" cy="34" r="16" fill="#ffd23f"/>
    ${cloud(48, 32, 1)}${cloud(196, 18, .8)}${cloud(292, 52, .6)}
    <rect y="176" width="400" height="90" fill="${GRASS}"/>
    ${BLOCKS.map(building).join('')}
    ${tree(44, .8)}${tree(291, .78)}${tree(378, .85)}
    <rect y="196" width="400" height="46" fill="${ROAD}"/>
    <rect y="196" width="400" height="3" fill="#d8d8d8"/><rect y="239" width="400" height="3" fill="#d8d8d8"/>
    ${Array.from({ length: 10 }, (_, i) => `<rect x="${12 + i * 42}" y="217" width="20" height="4" fill="${YELLOW}"/>`).join('')}
    ${car}
    <g transform="translate(40 80) scale(.86)">${signGroup()}</g>
  </svg>`;

export function mountSign(el) { if (el) el.innerHTML = signSvg(); }

// --- attract intro -----------------------------------------------------
// The framed scene holds the screen for an eighth of the loop, then hands it
// back to the insert-coin screen until the next turn.
const SLAM = 1040;    // ms into the intro: the town sign lands
const CREAK = 1500;   // ms: the post gives and it leans
const INTRO = 3400;   // ms the frame stays up: the slam, the creak, then a beat to read it
const CYCLE = 27200;  // ms for the whole loop — the sign gets an eighth of it

let timers = [];
const clear = () => { timers.forEach(clearTimeout); timers = []; };
const later = (fn, ms) => timers.push(setTimeout(fn, ms));
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// One showing: mount a fresh scene so its animations start from the top.
function showIntro(intro, title) {
  intro.innerHTML = `<div class="frame">${sceneSvg()}</div>`;
  intro.hidden = false;
  requestAnimationFrame(() => intro.classList.add('show'));
  title?.classList.add('dim');
  if (!still()) { later(() => sfx.slam(), SLAM); later(() => sfx.creak(), CREAK); }
  later(() => {
    intro.classList.remove('show');
    title?.classList.remove('dim');
    later(() => { intro.hidden = true; intro.innerHTML = ''; }, 400);
  }, INTRO);
}

export function startTitleCycle(intro, title) {
  stopTitleCycle(intro, title);
  if (!intro) return;
  if (still()) return;              // no cycling for anyone who asked for stillness
  const turn = () => { showIntro(intro, title); later(turn, CYCLE); };
  turn();
}

export function stopTitleCycle(intro, title) {
  clear();
  title?.classList.remove('dim');
  if (intro) { intro.classList.remove('show'); intro.hidden = true; intro.innerHTML = ''; }
}
