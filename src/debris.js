import * as THREE from 'three';
import { rand, pick } from './util.js';
import { sfx } from './sfx.js';

const unit = new THREE.BoxGeometry(1, 1, 1);
const FIRE = [0xffe36b, 0xffb02a, 0xff6a1a, 0xff3b1a];
const SMOKE = [0x6f6f6f, 0x8a8a8a, 0xa5a5a5];

// Break-apart effect. Every leaf box of a group is detached in place, given a
// loft and a spin, and falls under gravity until it drops out of sight.
const GRAVITY = 16;
const LIFE = 1.6;

export class Debris {
  constructor(scene) {
    this.scene = scene;
    this.pieces = [];
    this.puffs = [];
  }

  // A burst of fire cubes that shrink fast, and smoke cubes that rise, swell and fade.
  burst(at, kick = 1) {
    for (let i = 0; i < 6; i++) this.puff(at, pick(...FIRE), 0.28 * kick, 0.35, new THREE.Vector3(rand(-2, 2), rand(2, 5), rand(-2, 2)).multiplyScalar(kick), -1);
    for (let i = 0; i < 5; i++) this.puff(at, pick(...SMOKE), 0.35 * kick, rand(0.9, 1.4), new THREE.Vector3(rand(-0.6, 0.6), rand(1.2, 2), rand(-0.6, 0.6)), 2.2);
    sfx.puff();
    sfx.crackle();
  }

  // Pixel splash: light cubes thrown up from the water line, falling back.
  splash(at, kick = 1) {
    for (let i = 0; i < 10; i++) {
      this.puff(new THREE.Vector3(at.x, -0.3, at.z), pick(0xbfe6ff, 0xffffff, 0x8fd0ff), rand(0.1, 0.22) * kick, rand(0.4, 0.7),
        new THREE.Vector3(rand(-2.2, 2.2), rand(3, 5.5) * kick, rand(-2.2, 2.2)), -1);
    }
    sfx.splash();
  }

  puff(at, color, size, life, v, grow) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false });
    const m = new THREE.Mesh(unit, mat);
    m.position.copy(at).add(new THREE.Vector3(rand(-0.3, 0.3), rand(0.2, 0.8), rand(-0.3, 0.3)));
    m.scale.setScalar(size);
    m.rotation.set(rand(0, 3), rand(0, 3), 0);
    this.scene.add(m);
    this.puffs.push({ mesh: m, v, life, max: life, size, grow });
  }

  // Convert `group` into flying pieces. It is removed from its parent.
  explode(group, kick = 1) {
    const centre = new THREE.Vector3();
    group.getWorldPosition(centre);
    const leaves = [];
    group.traverse((o) => { if (o.isMesh) leaves.push(o); });
    for (const m of leaves) {
      this.scene.attach(m);          // keeps the world transform
      const away = new THREE.Vector3().subVectors(m.position, centre).setY(0);
      if (away.lengthSq() < 0.01) away.set(rand(-1, 1), 0, rand(-1, 1));
      away.normalize().multiplyScalar(rand(1.5, 3.5) * kick);
      this.pieces.push({
        mesh: m,
        v: new THREE.Vector3(away.x, rand(4, 8) * kick, away.z),
        w: new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)),
        life: LIFE,
      });
    }
    group.parent?.remove(group);
    this.burst(centre, kick);
  }

  // Launch one mesh on its own (a window shaken loose).
  shed(m, kick = 0.6) {
    this.scene.attach(m);
    this.pieces.push({
      mesh: m,
      v: new THREE.Vector3(rand(-1, 1), rand(1, 3) * kick, rand(-1, 1)),
      w: new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6)),
      life: LIFE,
    });
  }

  update(dt) {
    for (const p of this.pieces) {
      p.v.y -= GRAVITY * dt;
      p.mesh.position.addScaledVector(p.v, dt);
      p.mesh.rotation.x += p.w.x * dt;
      p.mesh.rotation.y += p.w.y * dt;
      p.mesh.rotation.z += p.w.z * dt;
      p.life -= dt;
    }
    this.pieces = this.pieces.filter((p) => {
      const gone = p.life <= 0 || p.mesh.position.y < -1.5;
      if (gone) this.scene.remove(p.mesh);
      return !gone;
    });
    for (const q of this.puffs) {
      q.life -= dt;
      const k = Math.max(0, q.life / q.max);
      q.mesh.position.addScaledVector(q.v, dt);
      q.v.y -= (q.grow < 0 ? 6 : 0.5) * dt;
      q.mesh.scale.setScalar(q.grow < 0 ? q.size * k : q.size * (1 + (1 - k) * q.grow));
      q.mesh.material.opacity = q.grow < 0 ? 0.95 : 0.7 * k;
      q.mesh.rotation.y += dt * 2;
    }
    this.puffs = this.puffs.filter((q) => { const gone = q.life <= 0; if (gone) { this.scene.remove(q.mesh); q.mesh.material.dispose(); } return !gone; });
  }

  dispose() {
    for (const p of this.pieces) this.scene.remove(p.mesh);
    for (const q of this.puffs) { this.scene.remove(q.mesh); q.mesh.material.dispose(); }
    this.pieces = [];
    this.puffs = [];
  }
}
