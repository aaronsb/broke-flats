import * as THREE from 'three';
import { CameraRig } from './camera.js';
import { Sky } from './sky.js';
import { Headlights } from './headlights.js';
import { Game } from './game.js';
import { sfx } from './sfx.js';
import { music } from './music.js';
import { installDebug } from './debug.js';
import { Select } from './select.js';
import { installTouch } from './touch.js';

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
  title: $('title'), view: $('view'), hint: $('hint'), chicks: $('chicks'), debug: $('debug'),
  p1: $('p1'), p2: $('p2'), lives: $('lives'), retry: $('retry'),
};
const game = new Game({ scene, camera, sky, ui, headlights });
if (import.meta.env.DEV) window.__game = game;   // for the headless smoke test
const debugKey = installDebug(game, ui);
installTouch(document.getElementById('hud'));
let started = false;
game.preview();
let select = new Select(scene, camera);
select.setPicks(game.picks);

// Insert coin: lives clink in, the picked cards blink, and the run starts.
function begin() {
  if (started || select.confirming || inserting) return;
  sfx.unlock();
  inserting = true;
  game.insertCoin(() => select.confirm(game.picks, () => {
    started = true;
    inserting = false;
    select.dispose();
    select = null;
    music.setMood({ attract: false });
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
  music.setMood({ attract: true, dead: false, countdown: 0, danger: false, battle: false, gauntlet: false });
  ui.title.classList.remove('hide');
  select = new Select(scene, camera);
  select.setPicks(game.picks);
}
let inserting = false;
game.onTimeout = toTitle;

// Attract music from the start: scheduled now, audible as soon as the
// browser lets audio play (immediately, or on the first key or tap).
music.start();
music.setMood({ attract: true });
const unlock = () => { sfx.unlock(); removeEventListener('keydown', unlock); removeEventListener('pointerdown', unlock); };
addEventListener('keydown', unlock);
addEventListener('pointerdown', unlock);

// ---------- input ----------
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (!started) {
    if (select.confirming) return;
    const changed = game.select(e);
    if (changed !== false) { select.setPicks(game.picks, changed); e.preventDefault(); return; }
    if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyC') begin();
    return;
  }
  if (e.code === 'KeyM') { music.toggleMute(); return; }
  if (e.code === 'KeyP') { pixelScale = pixelScale >= 3 ? 1 : pixelScale + 1; resize(); return; }
  if (debugKey(e)) { e.preventDefault(); return; }
  if (game.over) {
    if (e.code === 'KeyC') game.buyLife();
    else if (e.code === 'Enter' || e.code === 'Space') game.resume();
    else if (e.code === 'KeyR') toTitle();
    return;
  }
  if (game.mode.onKey(e)) e.preventDefault();
});
addEventListener('keyup', (e) => { if (started && !game.over) game.mode.onKeyUp(e); });
ui.view.addEventListener('click', () => { begin(); if (!game.over) game.mode.onViewButton(); });
$('retry').addEventListener('click', () => { if (game.run.lives > 0) game.resume(); else if (!game.buyLife()) toTitle(); });

let touchStart = null;
canvas.addEventListener('pointerdown', (e) => { begin(); touchStart = { x: e.clientX, y: e.clientY }; });
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
  if (started) game.update(dt, time);
  else { select.update(dt); sky.update(dt, 0, -2, camera.distance); }
  renderer.render(scene, camera.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
