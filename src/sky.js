import * as THREE from 'three';

// Lighting presets. Applied per level; scenarios read `sky.name` to add
// their own emitters (headlights, fireflies) when it is dark.
export const SKIES = {
  day:    { bg: 0x8fd3ff, hemi: [0xcfe9ff, 0x6a8f3a, 0.7],  sun: [0xfff4e0, 1.6], sunPos: [-8, 22, 10], fog: [44, 62], label: 'DAY' },
  sunset: { bg: 0xff9a5c, hemi: [0xffb37a, 0x5a4a3a, 0.6],  sun: [0xffb070, 1.4], sunPos: [-16, 9, 8],  fog: [40, 60], label: 'SUNSET' },
  night:  { bg: 0x0b1230, hemi: [0x2a3a70, 0x0c1418, 0.45], sun: [0x8090ff, 0.35], sunPos: [6, 22, -4], fog: [30, 52], label: 'NIGHT', dark: true },
  rain:   { bg: 0x6f7d8c, hemi: [0x9aa8b8, 0x3f4a3a, 0.55], sun: [0xcfd8e0, 0.8], sunPos: [-8, 22, 10], fog: [26, 46], label: 'RAIN', rain: true },
};

const RAIN_COUNT = 500;

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
    this.apply('day');
  }

  get dark() { return !!SKIES[this.name].dark; }

  apply(name) {
    const s = SKIES[name];
    this.name = name;
    this.hemi.color.set(s.hemi[0]); this.hemi.groundColor.set(s.hemi[1]); this.hemi.intensity = s.hemi[2];
    this.sun.color.set(s.sun[0]); this.sun.intensity = s.sun[1];
    this.sunPos = s.sunPos;
    this.scene.background.set(s.bg);
    this.scene.fog.color.set(s.bg);
    this.scene.fog.near = s.fog[0]; this.scene.fog.far = s.fog[1];
    this.setRain(!!s.rain);
  }

  setRain(on) {
    if (on && !this.rain) {
      const pos = new Float32Array(RAIN_COUNT * 3);
      for (let i = 0; i < RAIN_COUNT; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 30;
        pos[i * 3 + 1] = Math.random() * 16;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 30;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const m = new THREE.PointsMaterial({ color: 0xdde8f0, size: 0.12, transparent: true, opacity: 0.7 });
      this.rain = new THREE.Points(g, m);
      this.scene.add(this.rain);
    } else if (!on && this.rain) {
      this.scene.remove(this.rain);
      this.rain = null;
    }
  }

  // Keep the sun (and its shadow box) and the rain volume centred on the action.
  update(dt, cx, cz) {
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
  }
}
