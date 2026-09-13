import * as THREE from 'three';
import { music } from './music.js';

// Lighting presets. Applied per level; scenarios read `sky.name` to add
// their own emitters (headlights, fireflies) when it is dark.
// fog: [near, far] as offsets from the camera distance to its target.
// horizon: far backdrop colours (sea band, far and near mountain ranges,
// clouds, the sun or moon disc and its height).
export const SKIES = {
  day:    { bg: 0x8fd3ff, hemi: [0xcfe9ff, 0x6a8f3a, 0.7],  sun: [0xfff4e0, 1.6], sunPos: [-8, 22, 10], fog: [6, 34], label: 'DAY',
            horizon: { sea: 0x2f7fc9, far: 0x6d8fb8, near: 0x4d7a5a, cloud: 0xffffff, disc: 0xfff2a8, discY: 46 } },
  sunset: { bg: 0xff9a5c, hemi: [0xffb37a, 0x5a4a3a, 0.5],  sun: [0xffb070, 1.0], sunPos: [-16, 9, 8],  fog: [6, 32], label: 'SUNSET', dusk: true,
            horizon: { sea: 0xd9683a, far: 0x7a3a6a, near: 0x4a2a4a, cloud: 0xffc9a0, disc: 0xffd36b, discY: 22 } },
  night:  { bg: 0x0b1230, hemi: [0x2a3a70, 0x0c1418, 0.45], sun: [0x8090ff, 0.35], sunPos: [6, 22, -4], fog: [4, 26], label: 'NIGHT', dark: true,
            horizon: { sea: 0x0e1e4a, far: 0x141c3e, near: 0x0a1028, cloud: 0x263258, disc: 0xe8ecff, discY: 50, stars: true } },
  rain:   { bg: 0x6f7d8c, hemi: [0x9aa8b8, 0x3f4a3a, 0.55], sun: [0xcfd8e0, 0.8], sunPos: [-8, 22, 10], fog: [3, 22], label: 'RAIN', rain: true, wet: true, slip: 1,
            horizon: { sea: 0x4a6478, far: 0x55606c, near: 0x3c4a44, cloud: 0x8a96a2, disc: 0x8a96a2, discY: 40 } },
  // Pale grey, cold fog close in, headlights on. slip 2: fast hops slide two cells.
  snow:   { bg: 0xb9c2cb, hemi: [0xdce4ec, 0x8c949c, 0.7],  sun: [0xeef2f6, 0.9], sunPos: [-8, 22, 10], fog: [2, 20], label: 'SNOW', snow: true, slip: 2, headlights: true,
            horizon: { sea: 0x7d95a6, far: 0xa4aeb8, near: 0xcfd6dc, cloud: 0xdde2e6, disc: 0xd2d8de, discY: 40 } },
};
// A weather field the board reads through the Sky: `wet` darkens the ground and
// lays puddles, `snow` whitens it, `slip` is how many cells a fast run skids.

const RAIN_COUNT = 500;
const SNOW_COUNT = 420;
const SNOW_FALL = 2.2;     // flakes drop this fast; rain falls at 18
const SNOW_DRIFT = 0.9;    // and sway sideways this much
const HORIZON_Z = 90;   // how far ahead of the camera target the backdrop starts

// Unlit, unfogged, so it reads as a flat pixel backdrop behind the fogged ground.
const flat = (color) => new THREE.MeshBasicMaterial({ color, fog: false });
const unit = new THREE.BoxGeometry(1, 1, 1);
function slab(mat, w, h, d, x, y, z) {
  const m = new THREE.Mesh(unit, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y + h / 2, z);
  return m;
}

// Seeded so the skyline is the same every session.
function seeded(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

class Horizon {
  constructor(scene) {
    this.group = new THREE.Group();
    this.mats = { sea: flat(0), far: flat(0), near: flat(0), cloud: flat(0), disc: flat(0), star: flat(0xffffff) };
    const r = seeded(7);
    this.group.add(slab(this.mats.sea, 900, 0.2, 260, 0, -0.4, -130));
    for (let x = -420; x < 420; x += 24) this.group.add(slab(this.mats.far, 20 + r() * 26, 14 + r() * 22, 20, x + r() * 10, 0, -230));
    for (let x = -420; x < 420; x += 34) this.group.add(slab(this.mats.near, 26 + r() * 30, 8 + r() * 12, 20, x + r() * 12, 0, -170));
    this.clouds = [];
    for (let i = 0; i < 14; i++) {
      const c = slab(this.mats.cloud, 14 + r() * 20, 3 + r() * 3, 4, -400 + r() * 800, 28 + r() * 22, -215);
      c.userData.speed = 0.6 + r() * 1.2;
      this.clouds.push(c);
      this.group.add(c);
    }
    this.disc = slab(this.mats.disc, 12, 12, 2, 70, 0, -240);
    this.group.add(this.disc);
    this.stars = new THREE.Group();
    for (let i = 0; i < 90; i++) this.stars.add(slab(this.mats.star, 1, 1, 1, -420 + r() * 840, 30 + r() * 70, -245));
    this.group.add(this.stars);
    this.group.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
    scene.add(this.group);
  }

  apply(h) {
    for (const k of ['sea', 'far', 'near', 'cloud', 'disc']) this.mats[k].color.set(h[k]);
    this.disc.position.y = h.discY;
    this.stars.visible = !!h.stars;
  }

  update(dt, cx, cz) {
    this.group.position.set(cx, 0, cz - HORIZON_Z);
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 420) c.position.x = -420;
    }
  }
}

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.name = 'day';
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 1; sc.far = 80;
    this.sun.shadow.bias = -0.0005;
    scene.add(this.hemi, this.sun, this.sun.target);
    scene.fog = new THREE.Fog(0xffffff, 40, 60);
    scene.background = new THREE.Color(0xffffff);
    this.rain = null;
    this.flakes = null;
    this.horizon = new Horizon(scene);
    this.fogOffsets = [6, 34];
    this.apply('day');
  }

  get dark() { return !!SKIES[this.name].dark; }

  // Size of the sun's shadow box around the focus; the title needs a wide one.
  setShadowSpan(size) {
    const sc = this.sun.shadow.camera;
    sc.left = -size; sc.right = size; sc.top = size; sc.bottom = -size;
    sc.updateProjectionMatrix();
  }
  get headlights() { const s = SKIES[this.name]; return !!(s.dark || s.dusk || s.headlights); }
  get wet() { return !!SKIES[this.name].wet; }
  get snow() { return !!SKIES[this.name].snow; }
  get slip() { return SKIES[this.name].slip ?? 0; }

  apply(name) {
    const s = SKIES[name];
    this.name = name;
    this.hemi.color.set(s.hemi[0]); this.hemi.groundColor.set(s.hemi[1]); this.hemi.intensity = s.hemi[2];
    this.sun.color.set(s.sun[0]); this.sun.intensity = s.sun[1];
    this.sunPos = s.sunPos;
    this.scene.background.set(s.bg);
    this.scene.fog.color.set(s.bg);
    this.fogOffsets = s.fog;
    this.horizon.apply(s.horizon);
    this.setRain(!!s.rain);
    this.setSnow(!!s.snow);
    music.setWeather?.(name);
  }

  // A cloud of points over the action, `count` of them, drops falling in a 30x16x30 box.
  particles(count, color, size, opacity) {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 1] = Math.random() * 16;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 30;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color, size, transparent: true, opacity });
    return new THREE.Points(g, m);
  }

  setRain(on) {
    if (on && !this.rain) {
      this.rain = this.particles(RAIN_COUNT, 0xdde8f0, 0.12, 0.7);
      this.scene.add(this.rain);
    } else if (!on && this.rain) {
      this.scene.remove(this.rain);
      this.rain = null;
    }
  }

  // Flakes: bigger, whiter, slow, and each sways on its own phase.
  setSnow(on) {
    if (on && !this.flakes) {
      this.flakes = this.particles(SNOW_COUNT, 0xffffff, 0.2, 0.9);
      this.flakes.userData.phase = Float32Array.from({ length: SNOW_COUNT }, () => Math.random() * Math.PI * 2);
      this.flakeTime = 0;
      this.scene.add(this.flakes);
    } else if (!on && this.flakes) {
      this.scene.remove(this.flakes);
      this.flakes = null;
    }
  }

  // Keep the sun (and its shadow box), the backdrop and the rain volume centred
  // on the action. Fog is measured from the camera, so it tracks camera distance.
  update(dt, cx, cz, camDistance = 40) {
    this.scene.fog.near = camDistance + this.fogOffsets[0];
    this.scene.fog.far = camDistance + this.fogOffsets[1];
    this.horizon.update(dt, cx, cz);
    const p = this.sunPos;
    this.sun.position.set(cx + p[0], p[1], cz + p[2]);
    this.sun.target.position.set(cx, 0, cz);
    if (this.rain) {
      this.rain.position.set(cx, 0, cz);
      const a = this.rain.geometry.attributes.position;
      for (let i = 0; i < RAIN_COUNT; i++) {
        let y = a.getY(i) - 18 * dt;
        if (y < 0) y += 16;
        a.setY(i, y);
      }
      a.needsUpdate = true;
    }
    if (this.flakes) {
      this.flakes.position.set(cx, 0, cz);
      this.flakeTime += dt;
      const a = this.flakes.geometry.attributes.position;
      const ph = this.flakes.userData.phase;
      for (let i = 0; i < SNOW_COUNT; i++) {
        let y = a.getY(i) - SNOW_FALL * dt;
        if (y < 0) y += 16;
        a.setY(i, y);
        a.setX(i, a.getX(i) + Math.cos(this.flakeTime * 1.3 + ph[i]) * SNOW_DRIFT * dt);
      }
      a.needsUpdate = true;
    }
  }
}
