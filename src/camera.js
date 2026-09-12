import * as THREE from 'three';
import { clamp, damp, lerp } from './util.js';

// rig (yaw) -> pivot (tilt) -> perspective camera on the pivot's local +y axis,
// looking straight down. Tilt 0 is Frogger top-down. Tilting swings the camera
// behind and to the side. The field of view opens as the view tilts: narrow
// from above (near-orthographic, so canopies hide what is under them), wide
// when low so the ground converges to a horizon.
//
// tilt: radians from vertical. fov: degrees. Distance is always derived: from
// the board rule below for the crossing views, or from a preset's own `span`.
//
// Holding the width constant keeps the same span of lanes on any window, but a
// tall portrait phone drives the derived height to three times a desktop's,
// which reads as badly zoomed out. Past HALF_H_MAX the view stops growing
// taller and narrows instead, landing near ten cells across on a phone.
const HALF = 10.5;
const HALF_H_MAX = 9;
// Views that frame a fixed arrangement rather than the board — the card row and
// the battle gallery — carry `span`: the vertical half-extent that framing needs.
// Distance is derived from it, so one tuning holds at any window shape. Wider
// than the reference the span is already enough and holds, so a desktop and a
// tablet turned sideways are untouched; narrower, the camera pulls back to widen
// the view, up to FIT_PULL. Without it a portrait tablet framed two cards.
const FIT_REF = 1.78;
const FIT_PULL = 1.6;
const PRESETS = {
  top:        { tilt: 0,    yaw: 0,   fov: 12 },
  iso:        { tilt: 0.85, yaw: 0.55, fov: 20 },   // near-orthographic isometric
  select:     { tilt: 1.2,  yaw: 0,    fov: 38, span: 3.1 },
  // Battle: camera about 9-10 units up and 8-9 behind the chicken; the tilt
  // picks which row sits mid-screen. Targets are set by the battle mode.
  battleLand: { tilt: 0.95, yaw: 0,   fov: 50, span: 7.37 },
  battleSea:  { tilt: 1.1,  yaw: 0,   fov: 50, span: 9.47 },
  battleAir:  { tilt: 1.2,  yaw: 0,   fov: 50, span: 12.87 },
};

export class CameraRig {
  constructor(scene) {
    this.camera = new THREE.PerspectiveCamera(12, 1, 0.5, 600);
    this.camera.rotation.x = -Math.PI / 2;
    this.pivot = new THREE.Object3D();
    this.rig = new THREE.Object3D();
    this.pivot.add(this.camera);
    this.rig.add(this.pivot);
    scene.add(this.rig);
    this.aspect = 1;
    this.view = { ...PRESETS.top };
    this.goal = PRESETS.top;
    this.distance = 40;
    this.applyView();
  }

  get tilt() { return this.view.tilt; }

  resize(aspect) { this.aspect = aspect; this.applyView(); }

  applyView() {
    const c = this.camera, v = this.view;
    const halfH = v.span > 0
      ? v.span * clamp(FIT_REF / this.aspect, 1, FIT_PULL)
      : Math.min(HALF / this.aspect, HALF_H_MAX);
    const derived = halfH / Math.tan((v.fov * Math.PI) / 360);
    this.distance = derived;
    this.halfW = halfH * this.aspect;   // world units visible either side of the target
    c.fov = v.fov;
    c.aspect = this.aspect;
    c.position.set(0, this.distance, 0);
    c.updateProjectionMatrix();
    this.pivot.rotation.x = v.tilt;
    this.rig.rotation.y = v.yaw;
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
    this.view.fov = lerp(this.view.fov, this.goal.fov, k);
    this.view.span = lerp(this.view.span ?? 0, this.goal.span ?? 0, k);
    const f = damp(5, dt);
    this.rig.position.x = lerp(this.rig.position.x, tx, f);
    this.rig.position.z = lerp(this.rig.position.z, tz, f);
    this.applyView();
  }
}
