import * as THREE from 'three';
import { CameraRig } from './camera.js';
import { Sky } from './sky.js';
import { Game } from './game.js';
import { sfx } from './sfx.js';
import { music } from './music.js';
import { installDebug } from './debug.js';

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
  score: $('score'), best: $('best'), coins: $('coins'), level: $('level'), card: $('card'),
  over: $('over'), overTitle: $('over-title'), overScore: $('over-score'), overCoins: $('over-coins'),
  title: $('title'), view: $('view'), hint: $('hint'), chicks: $('chicks'), debug: $('debug'),
};
const game = new Game({ scene, camera, sky, ui });
if (import.meta.env.DEV) window.__game = game;   // for the headless smoke test
const debugKey = installDebug(game, ui);
let started = false;

function begin() {
  if (started) return;
  started = true;
  sfx.unlock();
  music.start();
  ui.title.classList.add('hide');
  game.start();
}

// ---------- input ----------
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (!started) { begin(); return; }
  if (e.code === 'KeyM') { music.toggleMute(); return; }
  if (e.code === 'KeyP') { pixelScale = pixelScale >= 3 ? 1 : pixelScale + 1; resize(); return; }
  if (debugKey(e)) { e.preventDefault(); return; }
  if (game.over) { if (e.code === 'KeyR') game.start(); return; }
  if (game.mode.onKey(e)) e.preventDefault();
});
addEventListener('keyup', (e) => { if (started && !game.over) game.mode.onKeyUp(e); });
ui.view.addEventListener('click', () => { begin(); if (!game.over) game.mode.onViewButton(); });
$('retry').addEventListener('click', () => game.start());

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
  renderer.render(scene, camera.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
