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

// --- the Department seal --------------------------------------------------
// A round rubber-stamp badge: DPG large in the middle, the department's full
// name around the rim. Red ink on nothing, so it sits on any panel.
const INK = '#e0392e';
export const sealSvg = () => `
  <svg class="dpg" viewBox="0 0 120 120" role="img" aria-label="Department of Pedestrian Grievances">
    <defs><path id="dpg-rim" d="M 60 60 m -44 0 a 44 44 0 1 1 88 0 a 44 44 0 1 1 -88 0"/></defs>
    <g fill="none" stroke="${INK}">
      <circle cx="60" cy="60" r="56" stroke-width="4"/>
      <circle cx="60" cy="60" r="52" stroke-width="1.5"/>
      <circle cx="60" cy="60" r="35" stroke-width="2.5"/>
    </g>
    <text fill="${INK}" font-size="6.6" letter-spacing=".6">
      <textPath href="#dpg-rim" startOffset="50%" text-anchor="middle" textLength="270" lengthAdjust="spacingAndGlyphs">DEPARTMENT OF PEDESTRIAN GRIEVANCES ·</textPath>
    </text>
    <text x="60" y="69" text-anchor="middle" font-size="22" fill="${INK}">DPG</text>
    <g fill="${INK}"><rect x="52" y="76" width="16" height="2"/><rect x="52" y="42" width="16" height="2"/></g>
  </svg>`;

// The seal as a DOM element, ready to append.
export function makeSeal() {
  const holder = document.createElement('div');
  holder.innerHTML = sealSvg();
  return holder.firstElementChild;
}

// --- stage signs ----------------------------------------------------------
// One board per stage kind for the banner scene (src/banner.js). Each is its
// own prop in the crossing sign's style: chunky shapes, Arcade text, a class
// on the part that moves so the CSS can drop, swing or blink it.
const IRON = '#9aa0a8', IRON_DARK = '#767c84', BRASS = '#c9a34a', WALNUT = '#5a3a1e';

// A chicken in silhouette, 52 x 44 from the origin, facing right.
const chicken = (fill = TAR) => `
  <g fill="${fill}">
    <rect x="6" y="16" width="28" height="18"/><rect x="0" y="10" width="8" height="10"/><rect x="2" y="5" width="5" height="6"/>
    <rect x="30" y="8" width="10" height="12"/><rect x="32" y="3" width="13" height="10"/><rect x="35" y="0" width="3" height="3"/><rect x="39" y="-1" width="3" height="4"/>
    <rect x="45" y="6" width="6" height="3"/><rect x="36" y="13" width="3" height="4"/>
    <rect x="14" y="34" width="3" height="6"/><rect x="23" y="34" width="3" height="6"/><rect x="12" y="40" width="8" height="2"/><rect x="21" y="40" width="8" height="2"/>
  </g>`;

// An escaped text node: the titles come from level data, so no markup rides along.
const esc = (t) => String(t ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

// Font size that fits `text` into `width` units: the arcade face is monospaced
// at one em per glyph, capped at `max`.
const fit = (text, width, max) => Math.min(max, width / Math.max(1, String(text ?? '').length));

// Day start: the district's welcome sign, a green board in the town sign's
// livery on two wooden posts: a chicken stencilled in the corner, NOW ENTERING, the district, its motto, and a
// white tab with the day and the sky. Bad weather hangs a weather-service
// placard from the bottom edge on two chains.
const daySign = ({ title, sub, motto, advisory }) => `
  <svg class="board day" viewBox="0 0 300 250" role="img" aria-label="${esc(title)}">
    <g class="post"><rect x="78" y="150" width="9" height="100" fill="${WOOD}"/><rect x="213" y="150" width="9" height="100" fill="${WOOD}"/><rect x="78" y="150" width="3" height="100" fill="#5c3f26"/><rect x="213" y="150" width="3" height="100" fill="#5c3f26"/></g>
    <g class="plate">
      <rect x="26" y="18" width="248" height="136" rx="6" fill="${BONE}"/>
      <rect x="31" y="23" width="238" height="126" rx="4" fill="${GREEN}"/>
      <circle cx="240" cy="36" r="9" fill="#fff" opacity=".06"/>
      <g transform="translate(46 30) scale(.4)" opacity=".7">${chicken(BONE)}</g>
      <text x="150" y="46" text-anchor="middle" font-size="7" fill="#eceada" opacity=".55">NOW ENTERING</text>
      <text class="name" x="150" y="${76 + fit(title, 216, 20) / 2}" text-anchor="middle" font-size="${fit(title, 216, 20)}" fill="#f4f2e4">${esc(title)}</text>
      <text x="150" y="108" text-anchor="middle" font-size="${fit(motto, 216, 7)}" fill="#eceada" opacity=".8">${esc(motto)}</text>
      <rect x="70" y="118" width="160" height="22" rx="2" fill="#f4f2ea"/>
      <text x="150" y="133" text-anchor="middle" font-size="${fit(sub, 150, 8)}" fill="${TAR}">${esc(sub)}</text>
      <circle cx="40" cy="32" r="2.5" fill="#1d4429"/><circle cx="260" cy="32" r="2.5" fill="#1d4429"/>
      <circle cx="40" cy="140" r="2.5" fill="#1d4429"/><circle cx="260" cy="140" r="2.5" fill="#1d4429"/>
    </g>
    ${advisory ? `
    <g class="placard">
      <rect x="92" y="154" width="2" height="16" fill="${IRON_DARK}"/><rect x="206" y="154" width="2" height="16" fill="${IRON_DARK}"/>
      <rect x="72" y="170" width="156" height="38" rx="3" fill="${TAR}"/>
      <rect x="75" y="173" width="150" height="32" rx="2" fill="#f0a020"/>
      <text x="150" y="187" text-anchor="middle" font-size="6" fill="${TAR}" opacity=".8">WEATHER SERVICE</text>
      <text x="150" y="199" text-anchor="middle" font-size="7.5" fill="${TAR}">${esc(advisory)}</text>
    </g>` : ''}
  </svg>`;

// The hazard board's stripes: a black field under a tilted yellow-black band.
const stripes = (id, a = YELLOW, b = TAR) => `
  <defs><pattern id="${id}" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="28" height="28" fill="${b}"/><rect width="14" height="28" fill="${a}"/>
  </pattern></defs>`;

// Gauntlet: a striped hazard board on two posts. Mines swap the centre panel
// for a red DANGER plaque; the maze puts up an arcade marquee ringed in bulbs;
// the snake maze's stripes are green.
const gauntletSign = ({ title, sub, variant }) => {
  const mines = variant === 'mines', maze = variant === 'maze', snake = variant === 'snake';
  const bulbs = maze ? [...Array(11)].map((_, i) => `<circle class="bulb ${i % 2 ? 'b' : 'a'}" cx="${52 + i * 19.6}" cy="42" r="4.5" fill="${YELLOW}"/><circle class="bulb ${i % 2 ? 'a' : 'b'}" cx="${52 + i * 19.6}" cy="166" r="4.5" fill="${YELLOW}"/>`).join('') : '';
  const centre = maze ? `
      <rect x="62" y="56" width="176" height="96" rx="4" fill="#12103a"/>
      <text x="150" y="112" text-anchor="middle" font-size="34" fill="#ff4fa3" stroke="#7a1a4a" stroke-width="1.5">${esc(title)}</text>
      <text x="150" y="136" text-anchor="middle" font-size="${fit(sub, 168, 7.5)}" fill="${YELLOW}">${esc(sub)}</text>`
    : mines ? `
      <g class="plaque">
        <rect x="58" y="52" width="184" height="104" rx="5" fill="#f4f2ea"/>
        <rect x="63" y="57" width="174" height="94" rx="3" fill="#c8281e"/>
        <rect x="68" y="62" width="164" height="84" rx="2" fill="none" stroke="#f4f2ea" stroke-width="2"/>
        <text x="150" y="96" text-anchor="middle" font-size="26" fill="#f4f2ea">DANGER</text>
        <text x="150" y="121" text-anchor="middle" font-size="${title?.length > 10 ? 10.5 : 14}" fill="#f4f2ea">${esc(title)}</text>
        <text x="150" y="139" text-anchor="middle" font-size="${fit(sub, 156, 6.5)}" fill="#f4f2ea" opacity=".85">${esc(sub)}</text>
      </g>`
    : `
      <rect x="58" y="60" width="184" height="88" rx="3" fill="${TAR}"/>
      <text x="150" y="100" text-anchor="middle" font-size="${title?.length > 12 ? 12 : 16}" fill="${YELLOW}">${esc(title)}</text>
      <text x="150" y="126" text-anchor="middle" font-size="${fit(sub, 172, 7.5)}" fill="#f4f2ea" opacity=".85">${esc(sub)}</text>`;
  return `
  <svg class="board gauntlet ${variant ?? ''}" viewBox="0 0 300 250" role="img" aria-label="${esc(title)}">
    ${maze ? '' : snake ? stripes('bn-stripes', '#8ccf3a', '#1e4a1a') : stripes('bn-stripes')}
    <g class="post"><rect x="78" y="180" width="9" height="70" fill="${IRON}"/><rect x="213" y="180" width="9" height="70" fill="${IRON}"/><rect x="78" y="180" width="3" height="70" fill="${IRON_DARK}"/><rect x="213" y="180" width="3" height="70" fill="${IRON_DARK}"/></g>
    <g class="plate">
      <rect x="34" y="24" width="232" height="160" rx="6" fill="${TAR}"/>
      <rect x="40" y="30" width="220" height="148" rx="3" fill="${maze ? '#2a1e6e' : 'url(#bn-stripes)'}"/>
      ${bulbs}${centre}
    </g>
  </svg>`;
};

// The hearing: a brass plaque in a walnut frame, the seal large on the left,
// the department's name engraved beside it, a NOW SERVING card slotted below.
const hearingSign = ({ title, sub }) => {
  const words = String(title ?? '').split(' ');
  const lines = words.length >= 3 ? [words.slice(0, 2).join(' '), ...words.slice(2)] : words;
  const grain = [...Array(9)].map((_, i) => `<rect x="8" y="${14 + i * 18}" width="384" height="1.5" fill="#3d2410" opacity=".35"/>`).join('');
  return `
  <svg class="board hearing" viewBox="0 0 400 190" role="img" aria-label="${esc(title)}">
    <defs><linearGradient id="bn-brass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e2c36a"/><stop offset=".5" stop-color="${BRASS}"/><stop offset="1" stop-color="#9d7a2c"/></linearGradient></defs>
    <g class="plate">
      <rect x="4" y="4" width="392" height="182" rx="6" fill="${WALNUT}"/>
      ${grain}
      <rect x="4" y="4" width="392" height="182" rx="6" fill="none" stroke="#2c1a0a" stroke-width="3"/>
      <rect x="22" y="22" width="356" height="146" rx="3" fill="url(#bn-brass)"/>
      <rect x="27" y="27" width="346" height="136" rx="2" fill="none" stroke="#6e5220" stroke-width="1.5"/>
      <g fill="#6e5220"><circle cx="33" cy="33" r="2.5"/><circle cx="367" cy="33" r="2.5"/><circle cx="33" cy="157" r="2.5"/><circle cx="367" cy="157" r="2.5"/></g>
      <g class="seal-slot" transform="translate(40 36)"></g>
      <g fill="#3a2a12">${lines.map((ln, i) => `<text x="262" y="${64 + i * 26}" text-anchor="middle" font-size="${ln.length > 12 ? 11 : 13}" fill="#f0dc9a" opacity=".55" transform="translate(1 1)">${esc(ln)}</text><text x="262" y="${64 + i * 26}" text-anchor="middle" font-size="${ln.length > 12 ? 11 : 13}">${esc(ln)}</text>`).join('')}</g>
      <rect x="168" y="130" width="188" height="26" rx="2" fill="#6e5220"/>
      <rect x="172" y="133" width="180" height="20" rx="1" fill="#f4f2ea"/>
      <text x="262" y="147" text-anchor="middle" font-size="${fit(sub, 172, 8)}" fill="${TAR}">${esc(sub)}</text>
    </g>
  </svg>`;
};

const SIGNS = { day: daySign, gauntlet: gauntletSign, hearing: hearingSign };

// A stage sign as a DOM element for the banner layer. The hearing's seal is
// the shared `makeSeal()` nested inside its plaque.
export function makeBanner(kind, opts = {}) {
  const build = SIGNS[kind] ?? SIGNS.day;
  const holder = document.createElement('div');
  holder.innerHTML = build(opts);
  const el = holder.firstElementChild;
  const slot = el.querySelector('.seal-slot');
  if (slot) {
    const seal = makeSeal();
    seal.setAttribute('width', '118'); seal.setAttribute('height', '118');
    slot.appendChild(seal);
  }
  return el;
}

// --- attract intro -----------------------------------------------------
// The framed scene holds the screen for an eighth of the loop, then hands it
// back to the insert-coin screen until the next turn.
const SLAM = 1040;    // ms into the intro: the town sign lands
const CREAK = 1500;   // ms: the post gives and it leans
const INTRO = 3400;   // ms the frame stays up: the slam, the creak, then a beat to read it
const CYCLE = 27200;  // ms for the whole loop — the sign gets an eighth of it

const IDLE = CYCLE - INTRO;   // how long the insert-coin screen holds between showings

let timers = [];
let els = null;               // { intro, title } while the cycle is running
const clear = () => { timers.forEach(clearTimeout); timers = []; };
const later = (fn, ms) => timers.push(setTimeout(fn, ms));
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function hide() {
  if (!els || els.intro.hidden) return;
  els.intro.classList.remove('show');
  els.title?.classList.remove('dim');
  later(() => { els.intro.hidden = true; els.intro.innerHTML = ''; }, 400);
}

// One showing: mount a fresh scene so its animations start from the top.
function show() {
  if (!els) return;
  // The about crawl paints under the intro, so wait rather than cover it.
  if (document.getElementById('about')?.classList.contains('show')) { later(show, IDLE); return; }
  els.intro.innerHTML = `<div class="frame">${sceneSvg()}</div>`;
  els.intro.hidden = false;
  requestAnimationFrame(() => els?.intro.classList.add('show'));
  els.title?.classList.add('dim');
  if (!still()) { later(() => sfx.slam(), SLAM); later(() => sfx.creak(), CREAK); }
  later(hide, INTRO);
  later(show, CYCLE);
}

export function startTitleCycle(intro, title) {
  stopTitleCycle();
  if (!intro) return;
  // Reduced motion still gets the postcard — the CSS holds it at its settled
  // pose and show() keeps the slam quiet. Less motion, not less game.
  els = { intro, title };
  show();
}

// Someone is at the controls: drop the sign if it is up and start the idle
// count over, so picking through the roster is never interrupted by the title.
export function bumpTitleCycle() {
  if (!els) return;
  clear();
  hide();
  later(show, IDLE);
}

export function stopTitleCycle() {
  clear();
  if (els) {
    els.title?.classList.remove('dim');
    els.intro.classList.remove('show');
    els.intro.hidden = true;
    els.intro.innerHTML = '';
  }
  els = null;
}
