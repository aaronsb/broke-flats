import * as THREE from 'three';
import { damp, lerp } from './util.js';

// rig (yaw) -> pivot (tilt) -> ortho camera hanging D units up, looking straight down.
// Tilt 0 is Frogger top-down. Tilting swings the camera behind and to the side.
const D = 40;
const PRESETS = {
  top:    { tilt: 0,    yaw: 0,    half: 10.5 },
  iso:    { tilt: 0.85, yaw: 0.55, half: 10.5 },
  battle: { tilt: 1.05, yaw: 0,    half: 11.5 },
};

export class CameraRig {
  constructor(scene) {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 100);
    this.camera.position.set(0, D, 0);
    this.camera.rotation.x = -Math.PI / 2;
    this.pivot = new THREE.Object3D();
    this.rig = new THREE.Object3D();
    this.pivot.add(this.camera);
    this.rig.add(this.pivot);
    scene.add(this.rig);
    this.aspect = 1;
    this.view = { ...PRESETS.top };
    this.goal = PRESETS.top;
    this.applyView();
  }

  get tilt() { return this.view.tilt; }

  resize(aspect) { this.aspect = aspect; this.applyView(); }

  applyView() {
    const c = this.camera, h = this.view.half;
    c.left = -h; c.right = h;
    c.top = h / this.aspect; c.bottom = -h / this.aspect;
    c.updateProjectionMatrix();
    this.pivot.rotation.x = this.view.tilt;
    this.rig.rotation.y = this.view.yaw;
  }

  setGoal(name) { this.goal = PRESETS[name]; }

  snap(x, z, name) {
    if (name) { this.setGoal(name); this.view = { ...this.goal }; }
    this.rig.position.set(x, 0, z);
    this.applyView();
  }

  // Blend toward the goal preset and glide toward the target point.
  update(dt, tx, tz) {
    const k = damp(6, dt);
    this.view.tilt = lerp(this.view.tilt, this.goal.tilt, k);
    this.view.yaw = lerp(this.view.yaw, this.goal.yaw, k);
    this.view.half = lerp(this.view.half, this.goal.half, k);
    const f = damp(5, dt);
    this.rig.position.x = lerp(this.rig.position.x, tx, f);
    this.rig.position.z = lerp(this.rig.position.z, tz, f);
    this.applyView();
  }
}
