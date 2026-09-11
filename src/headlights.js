import * as THREE from 'three';

// A fixed pool of spotlights handed out each frame to the nearest vehicles.
// The count never changes, so three.js compiles the lighting shaders once.
// Anything inside a beam is lit in daytime colours by the normal shading path.
const POOL = 12;
const RANGE = 11;      // rows from the focus point worth lighting
export const CONE = 0.66;   // beam length as a fraction of vehicle length

export class Headlights {
  constructor(scene) {
    this.lights = [];
    for (let i = 0; i < POOL; i++) {
      const l = new THREE.SpotLight(0xffe9b0, 0, 6, 0.55, 0.6, 1.2);
      l.castShadow = false;
      scene.add(l, l.target);
      this.lights.push(l);
    }
    this.enabled = false;
  }

  // emitters: [{ x, z, dir, len, y?, front?, lateral? }] in world units.
  // dir = +1 or -1 along x. front: lamp offset ahead of x (default: the nose).
  // lateral: z offsets, one beam each (a plane lights from both wingtips).
  update(emitters, focusZ) {
    let n = 0;
    if (this.enabled) {
      const near = emitters
        .filter((e) => Math.abs(e.z - focusZ) < RANGE)
        .sort((a, b) => Math.abs(a.z - focusZ) - Math.abs(b.z - focusZ));
      for (const e of near) {
        const reach = e.len * CONE;                 // beam length scales with the vehicle
        const front = e.x + e.dir * (e.front ?? e.len / 2 + 0.2);
        for (const dz of e.lateral ?? [0]) {
          if (n >= POOL) break;
          const l = this.lights[n++];
          l.position.set(front, e.y ?? 0.55, e.z + dz);
          l.target.position.set(front + e.dir * reach, (e.y ?? 0.55) - 0.85, e.z + dz);
          l.distance = reach * 2.4;
          l.intensity = 30;
        }
      }
    }
    for (; n < POOL; n++) this.lights[n].intensity = 0;
  }
}
