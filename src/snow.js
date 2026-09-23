import * as THREE from 'three';
import { W } from './lane.js';
import { rand } from './util.js';

// Snow accumulates. Every up-facing face of a row's static meshes is gridded
// into SPLAT-sized cells and each cell gets one white splat, the perimeter
// cells a second one hung over the edge. All of a row's splats live in one
// InstancedMesh in the row's group; the fraction of them drawn rises with
// world.data.snowT until, after SNOW_TIME seconds, every top is white.
export const SPLAT = 0.25;
export const SNOW_TIME = 90;
const MAX_PER_LANE = 6000;
const LIFT = 0.012;            // a splat sits this far off its face
const WIDE_FACE = 20;          // faces wider than this take a 2x step far out (the ground slab)
const NEAR = W + 4;            // ...outside |x| this
const EDGE_HANG = 0.5;         // odds a perimeter cell gets more splats down the side
const NEAR_TOP = 0.02;         // two tops this close in y are one roof plane

const unit = new THREE.BoxGeometry(1, 1, 1);
const mat = new THREE.MeshLambertMaterial({ color: 0xf1f5fb, emissive: 0x3a3f48 });   // a lift so the splats read white under a grey sky
const tmp = { m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(SPLAT, 0.03, SPLAT), e: new THREE.Euler() };

function shown(o, root) {
  for (let n = o; n && n !== root.parent; n = n.parent) if (!n.visible) return false;
  return true;
}

// Lane-local boxes of the row's static leaf meshes: not the movers, coins,
// eggs, crates or flags, which move or go.
function staticBoxes(lane) {
  const skip = new Set();
  const mark = (o) => o?.traverse((c) => skip.add(c));
  for (const m of lane.movers) mark(m.mesh);
  for (const c of lane.coins.values()) mark(c);
  for (const e of lane.eggs.values()) mark(e);
  for (const c of lane.crates.values()) mark(c.mesh);
  for (const f of lane.flags.values()) mark(f);
  lane.group.traverse((o) => { if (o.userData.sign) mark(o); });   // a district sign's face stays readable
  lane.group.updateMatrixWorld(true);
  const toLocal = lane.group.matrixWorld.clone().invert();
  const boxes = [];
  lane.group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || skip.has(o) || !shown(o, lane.group)) return;
    const b = new THREE.Box3().setFromObject(o).applyMatrix4(toLocal);
    if (b.isEmpty()) return;
    boxes.push(b);
  });
  return boxes;
}

// Is the point inside some other box? Roof planes and buried tops use this.
function inside(boxes, self, p, topNear = null) {
  for (const b of boxes) {
    if (b === self || !b.containsPoint(p)) continue;
    if (topNear === null || Math.abs(b.max.y - topNear) < NEAR_TOP) return true;
  }
  return false;
}

function place(out, x, y, z, rx, rz) {
  tmp.e.set(rx, 0, rz);
  tmp.q.setFromEuler(tmp.e);
  tmp.p.set(x, y, z);
  out.push(tmp.m.compose(tmp.p, tmp.q, tmp.s).clone());
}

// One splat over the edge on a side face, and now and then more further down.
function hang(out, x, y, z, nx, nz, floor) {
  const drop = [SPLAT / 2];
  if (Math.random() < EDGE_HANG) for (let k = 0, n = Math.random() < 0.5 ? 1 : 2; k < n; k++) drop.push(rand(0.5, 1.5) * SPLAT + SPLAT / 2);
  for (const d of drop) {
    if (y - d - SPLAT / 2 < floor) continue;
    place(out, x + nx * LIFT, y - d, z + nz * LIFT, nz ? Math.PI / 2 : 0, nx ? Math.PI / 2 : 0);
  }
}

function splatsFor(boxes) {
  const out = [];
  const probe = new THREE.Vector3();
  for (const b of boxes) {
    const top = b.max.y;
    const w = b.max.x - b.min.x, d = b.max.z - b.min.z;
    if (inside(boxes, b, probe.set((b.min.x + b.max.x) / 2, top + LIFT / 2, (b.min.z + b.max.z) / 2))) continue;   // a top buried in something else
    const wide = w > WIDE_FACE;
    const nx = Math.max(1, Math.round(w / SPLAT)), nz = Math.max(1, Math.round(d / SPLAT));
    const sx = w / nx, sz = d / nz;
    const sides = top > 0.05;    // no hanging splats on the ground slabs: their sides are underground
    for (let i = 0; i < nx; i++) {
      const x = b.min.x + (i + 0.5) * sx;
      const far = wide && Math.abs(x) > NEAR;
      if (far && (i & 1)) continue;
      for (let j = 0; j < nz; j++) {
        if (far && (j & 1)) continue;
        const z = b.min.z + (j + 0.5) * sz;
        place(out, x + rand(-0.03, 0.03), top + LIFT, z + rand(-0.03, 0.03), 0, 0);
        if (!sides || far) continue;
        // Perimeter cells: a splat over each outward edge, unless a neighbouring roof continues the plane.
        const edges = [];
        if (i === 0) edges.push([-1, 0]);
        if (i === nx - 1) edges.push([1, 0]);
        if (j === 0) edges.push([0, -1]);
        if (j === nz - 1) edges.push([0, 1]);
        for (const [ex, ez] of edges) {
          const fx = ex ? (ex < 0 ? b.min.x : b.max.x) : x, fz = ez ? (ez < 0 ? b.min.z : b.max.z) : z;
          if (inside(boxes, b, probe.set(fx + ex * 0.1, top - 0.01, fz + ez * 0.1), top)) continue;
          hang(out, fx, top, fz, ex, ez, b.min.y);
        }
      }
    }
  }
  return out;
}

export function fraction(world) { return Math.max(0, Math.min(1, (world.data.snowT ?? 0) / SNOW_TIME)); }

// Build a row's snow. Instances are shuffled so the drawn prefix is an even
// scatter, and the row starts at the board's current depth.
export function snowLane(lane, world) {
  const mats = splatsFor(staticBoxes(lane));
  for (let i = mats.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [mats[i], mats[j]] = [mats[j], mats[i]]; }
  const total = Math.min(mats.length, MAX_PER_LANE);
  if (!total) return;
  const mesh = new THREE.InstancedMesh(unit, mat, total);
  for (let i = 0; i < total; i++) mesh.setMatrixAt(i, mats[i]);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;   // the geometry's bounds are one unit cube; the instances cover the row
  mesh.count = Math.round(total * fraction(world));
  lane.group.add(mesh);
  lane.data.snow = { mesh, total };
}

// Per frame while the sky is snow: deepen, and draw that much of every row.
export function snowTick(world, dt) {
  world.data.snowT = Math.min(SNOW_TIME, (world.data.snowT ?? 0) + dt);
  const f = fraction(world);
  for (const lane of world.rows.values()) {
    const s = lane.data.snow;
    if (s) s.mesh.count = Math.round(s.total * f);
  }
}
