import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { sfx } from './sfx.js';
import { damp, lerp, clamp } from './util.js';

// ---------- renderer ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setPixelRatio(1);
let pixelScale = 2; // render at 1/pixelScale resolution, upscale with nearest-neighbour

const SKY = 0x8fd3ff;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 44, 62);

// ---------- camera rig ----------
// rig (yaw) -> pivot (tilt) -> ortho camera hanging D units up, looking straight down.
// Tilt 0 is Frogger top-down. Tilting swings the camera behind and to the side.
const TOP = { tilt: 0, yaw: 0 };
const ISO = { tilt: 0.85, yaw: 0.55 };
const D = 40, HALF = 10.5;
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 100);
camera.position.set(0, D, 0);
camera.rotation.x = -Math.PI / 2;
const pivot = new THREE.Object3D();
const rig = new THREE.Object3D();
pivot.add(camera);
rig.add(pivot);
scene.add(rig);
let tilted = false;
let view = { tilt: 0, yaw: 0 };
// Tilting costs time. Coins buy more.
const START_TILT = 6, COIN_TILT = 3, MAX_TILT = 30;
let tiltTime = START_TILT;

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(Math.floor(w / pixelScale), Math.floor(h / pixelScale), false);
  const aspect = w / h;
  camera.left = -HALF; camera.right = HALF;
  camera.top = HALF / aspect; camera.bottom = -HALF / aspect;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0xcfe9ff, 0x6a8f3a, 0.7));
const sun = new THREE.DirectionalLight(0xfff4e0, 1.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -18; sun.shadow.camera.right = 18;
sun.shadow.camera.top = 18; sun.shadow.camera.bottom = -18;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 80;
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

// ---------- game state ----------
let world = new World(scene);
const player = new Player(scene, world);
let started = false, over = false, time = 0;
let best = Number(localStorage.getItem('rc-best') || 0);

const ui = {
  score: document.getElementById('score'),
  best: document.getElementById('best'),
  coins: document.getElementById('coins'),
  over: document.getElementById('over'),
  overTitle: document.getElementById('over-title'),
  overScore: document.getElementById('over-score'),
  overCoins: document.getElementById('over-coins'),
  title: document.getElementById('title'),
  view: document.getElementById('view'),
  meter: document.getElementById('meter'),
};
player.onCoin = () => { tiltTime = Math.min(MAX_TILT, tiltTime + COIN_TILT); };
ui.best.textContent = `BEST ${best}`;

function restart() {
  world.dispose();
  world = new World(scene);
  player.world = world;
  player.reset();
  world.ensure(26);
  over = false;
  ui.over.classList.remove('show');
  rig.position.set(0, 0, -3);
  tiltTime = START_TILT;
  setTilt(false);
}
world.ensure(26);
rig.position.set(0, 0, -3);

function begin() {
  if (started) return;
  started = true;
  sfx.unlock();
  sfx.start();
  ui.title.classList.add('hide');
}

function setTilt(on) {
  if (on === tilted) return;
  if (on && tiltTime <= 0) { sfx.bump(); return; }
  tilted = on;
  ui.view.classList.toggle('on', tilted);
  sfx.tilt();
}

// ---------- input ----------
const KEYS = {
  ArrowUp: [0, 1], KeyW: [0, 1],
  ArrowDown: [0, -1], KeyS: [0, -1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (!started) { begin(); if (!KEYS[e.code]) return; }
  if (e.code === 'Space') { e.preventDefault(); setTilt(!tilted); return; }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { setTilt(true); return; }
  if (e.code === 'KeyP') { pixelScale = pixelScale >= 3 ? 1 : pixelScale + 1; resize(); return; }
  if (e.code === 'KeyR' && over) { restart(); return; }
  const d = KEYS[e.code];
  if (d) { e.preventDefault(); player.hop(d[0], d[1]); }
});
addEventListener('keyup', (e) => {
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') setTilt(false);
});
ui.view.addEventListener('click', () => { begin(); setTilt(!tilted); });
document.getElementById('retry').addEventListener('click', restart);

// Touch: swipe to hop, tap to hop forward.
let touchStart = null;
canvas.addEventListener('pointerdown', (e) => { begin(); touchStart = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (!touchStart) return;
  const dx = e.clientX - touchStart.x, dy = e.clientY - touchStart.y;
  touchStart = null;
  if (over) return;
  if (Math.hypot(dx, dy) < 20) player.hop(0, 1);
  else if (Math.abs(dx) > Math.abs(dy)) player.hop(Math.sign(dx), 0);
  else player.hop(0, dy < 0 ? 1 : -1);
});

// ---------- loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;

  if (started && !over) {
    player.update(dt);
    world.update(dt, time);
    world.ensure(player.row + 26);
    world.cull(player.row - 10);
    if (!player.alive && player.deadFor > 0.9) {
      over = true;
      if (player.maxRow > best) { best = player.maxRow; localStorage.setItem('rc-best', best); }
      ui.best.textContent = `BEST ${best}`;
      ui.overTitle.textContent = player.deadBy === 'car' ? 'SPLAT' : 'GLUB';
      ui.overScore.textContent = `score ${player.maxRow}`;
      ui.overCoins.textContent = `coins ${player.coins}`;
      ui.over.classList.add('show');
      sfx.over();
    }
  } else if (started) {
    world.update(dt, time);
  }

  if (tilted && started && !over) {
    tiltTime -= dt;
    if (tiltTime <= 0) { tiltTime = 0; setTilt(false); }
  }
  ui.meter.style.width = `${(tiltTime / MAX_TILT) * 100}%`;
  ui.meter.parentElement.classList.toggle('empty', tiltTime <= 0);

  // camera follow + view blend
  const goal = tilted ? ISO : TOP;
  const k = damp(6, dt);
  view.tilt = lerp(view.tilt, goal.tilt, k);
  view.yaw = lerp(view.yaw, goal.yaw, k);
  pivot.rotation.x = view.tilt;
  rig.rotation.y = view.yaw;
  const lead = 3 + view.tilt * 3;
  const tz = player.z - lead;
  const tx = clamp(player.x, -3, 3) * 0.35;
  const f = damp(5, dt);
  rig.position.x = lerp(rig.position.x, tx, f);
  rig.position.z = lerp(rig.position.z, tz, f);

  sun.position.set(player.x - 8, 22, player.z + 10);
  sun.target.position.set(player.x, 0, player.z);

  ui.score.textContent = player.maxRow;
  ui.coins.textContent = `● ${player.coins}`;

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
