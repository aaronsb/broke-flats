import * as THREE from 'three';
import { CameraRig } from './camera.js';
import { Sky } from './sky.js';
import { Headlights } from './headlights.js';
import { Game } from './game.js';
import { sfx } from './sfx.js';
import { music } from './music.js';
import { installDebug } from './debug.js';
import { Select } from './select.js';
import { Attract } from './attract.js';
import { mountSign, startTitleCycle, stopTitleCycle, bumpTitleCycle } from './logo.js';
import { installTouch } from './touch.js';
import { readPlaytest, applyBeforeStart, applyAfterStart } from './playtest.js';

// ---------- renderer ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setPixelRatio(1);
let pixelScale = 2; // render at 1/pixelScale resolution, upscale with nearest-neighbour

const scene = new THREE.Scene();
const camera = new CameraRig(scene);
const sky = new Sky(scene);
const headlights = new Headlights(scene);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(Math.floor(w / pixelScale), Math.floor(h / pixelScale), false);
  camera.resize(w / h);
}
addEventListener('resize', resize);
resize();

// ---------- game ----------
const $ = (id) => document.getElementById(id);
const ui = {
  score: $('score'), best: $('best'), coins: $('coins'), coinCount: $('coin-count'), level: $('level'), card: $('card'), tries: $('tries'),
  over: $('over'), overTitle: $('over-title'), overScore: $('over-score'), overCoins: $('over-coins'),
  title: $('title'), view: $('view'), hint: $('hint'), chicks: $('chicks'), debug: $('debug'), about: $('about'),
  intro: $('intro'),
  summary: $('summary'), summaryTitle: $('summary-title'), summaryBody: $('summary-body'),
  p1: $('p1'), p2: $('p2'), lives: $('lives'), retry: $('retry'),
};
mountSign($('logo'));
mountSign($('about-sign'));
const game = new Game({ scene, camera, sky, ui, headlights });
if (import.meta.env.DEV) { window.__game = game; import('./meshes.js').then((m) => { window.__meshes = m; }); }   // for the headless smoke test
const debugKey = installDebug(game, ui);
installTouch(document.getElementById('hud'));
let started = false;
const playtest = readPlaytest();
if (playtest) applyBeforeStart(game, playtest);
game.preview();
let select = new Select(scene, camera);
select.setPicks(game.picks);
let attract = new Attract(scene, sky);

// Insert coin: lives clink in, the picked cards blink, and the run starts.
function begin() {
  if (started || select.confirming || inserting) return;
  sfx.unlock();
  stopTitleCycle();
  inserting = true;
  game.insertCoin(() => select.confirm(game.picks, () => {
    started = true;
    inserting = false;
    select.dispose();
    select = null;
    attract.dispose();
    attract = null;
    ui.title.classList.add('hide');
    game.start();
  })) || (inserting = false);
}

// Game over with no continue: back to the title, fresh coins.
function toTitle() {
  started = false;
  game.mode?.exit();
  game.mode = null;
  game.newSession();
  music.reset({ attract: true });
  ui.title.classList.remove('hide');
  select = new Select(scene, camera);
  select.setPicks(game.picks);
  attract = new Attract(scene, sky);
  startTitleCycle(ui.intro, ui.title);
}
let inserting = false;
game.onTimeout = toTitle;

// Playtest URLs can skip the title: straight into the run with the options applied.
if (playtest?.start) {
  started = true;
  select.dispose();
  select = null;
  attract.dispose();
  attract = null;
  ui.title.classList.add('hide');
  game.run.lives = 4;
  game.start();
  applyAfterStart(game, playtest);
  if (playtest.debug) debugKey({ code: 'Backquote' });
} else if (playtest?.debug) {
  debugKey({ code: 'Backquote' });
}
if (!playtest?.start) startTitleCycle(ui.intro, ui.title);

// About: a crawl over the title with its own epilogue theme.
function openAbout() {
  if (started || ui.about.classList.contains('show')) return;
  bumpTitleCycle();
  sfx.unlock();
  ui.about.classList.add('show');
  music.reset({ epilogue: true });
}
function closeAbout() {
  if (!ui.about.classList.contains('show')) return;
  ui.about.classList.remove('show');
  music.reset({ attract: true });
}
$('about-open').addEventListener('click', openAbout);
$('about-close').addEventListener('click', closeAbout);

// Attract music from the start: scheduled now, audible as soon as the
// browser lets audio play (immediately, or on the first key or tap).
music.start();
music.reset({ attract: true });
const unlock = () => { sfx.unlock(); removeEventListener('keydown', unlock); removeEventListener('pointerdown', unlock); };
addEventListener('keydown', unlock);
addEventListener('pointerdown', unlock);

// ---------- fullscreen ----------
// Hidden where the API does not exist at all — iPhone Safari has it for video
// only — since the button would be a dead control there. No key: F already
// flags a cell in the minefield gauntlet.
const fullBtn = $('full');
const fullEl = () => document.fullscreenElement ?? document.webkitFullscreenElement;
const canFull = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
fullBtn.hidden = !canFull;
fullBtn.addEventListener('click', () => {
  bumpTitleCycle();
  const el = document.documentElement;
  const done = fullEl() ? (document.exitFullscreen?.() ?? document.webkitExitFullscreen?.())
                        : (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
  done?.catch?.(() => {});          // a refusal is not an error worth throwing
});
for (const ev of ['fullscreenchange', 'webkitfullscreenchange'])
  addEventListener(ev, () => { fullBtn.classList.toggle('on', !!fullEl()); resize(); });

// ---------- input ----------
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (!started) {
    bumpTitleCycle();   // anything but starting means someone is picking; hold the title off
    if (ui.about.classList.contains('show')) { if (e.code === 'Escape' || e.code === 'KeyI' || e.code === 'Enter') closeAbout(); return; }
    if (e.code === 'KeyI') { openAbout(); return; }
    if (e.code === 'Backquote') { debugKey(e); return; }
    if (select.confirming) return;
    const changed = game.select(e);
    if (changed !== false) { select.setPicks(game.picks, changed); e.preventDefault(); return; }
    if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyC') begin();
    return;
  }
  if (e.code === 'KeyM') { music.toggleMute(); return; }
  if (e.code === 'KeyP') { pixelScale = pixelScale >= 5 ? 1 : pixelScale + 1; resize(); return; }
  if (debugKey(e)) { e.preventDefault(); return; }
  if (game.summary.ready && (e.code === 'Enter' || e.code === 'Space')) { game.summary.confirm(); e.preventDefault(); return; }
  if (game.over) {
    if (e.code === 'KeyC') game.buyLife();
    else if (e.code === 'Enter' || e.code === 'Space') game.resume();
    else if (e.code === 'KeyR') toTitle();
    return;
  }
  if (game.mode.onKey(e)) e.preventDefault();
});
addEventListener('keyup', (e) => { held.delete(e.code); if (started && !game.over) game.mode.onKeyUp(e); });

// Key repeat for hops: a movement key held past half a second fires again at
// the hop cadence. The battle handles held keys itself.
const REPEAT_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);
const held = new Map();
addEventListener('keydown', (e) => { if (!e.repeat && REPEAT_KEYS.has(e.code) && !held.has(e.code)) held.set(e.code, { since: performance.now(), next: performance.now() + 500 }); });
addEventListener('blur', () => held.clear());
function repeatHeld(now) {
  if (!started || game.over || !game.mode?.players) return;
  for (const [code, h] of held) {
    if (now < h.next) continue;
    h.next = now + 180;
    game.mode.onKey({ code, repeat: true });
  }
}
ui.view.addEventListener('click', () => { begin(); if (!game.over) game.mode.onViewButton(); });
$('retry').addEventListener('click', () => { if (game.run.lives > 0) game.resume(); else if (!game.buyLife()) toTitle(); });

let touchStart = null;
canvas.addEventListener('pointerdown', (e) => { begin(); touchStart = { x: e.clientX, y: e.clientY }; });
ui.summary.addEventListener('pointerdown', () => game.summary.confirm());
canvas.addEventListener('pointerup', (e) => {
  if (!touchStart) return;
  const dx = e.clientX - touchStart.x, dy = e.clientY - touchStart.y;
  touchStart = null;
  if (!game.over) game.mode.onSwipe(dx, dy);
});

// ---------- loop ----------
let last = performance.now(), time = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  repeatHeld(now);
  if (started) game.update(dt, time);
  else if (select) {
    attract.update(dt, time);
    sky.update(dt, 0, -2, camera.distance);
    select.update(dt);          // may end the title screen and null both
  }
  renderer.render(scene, camera.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
