import * as THREE from 'three';
import { W } from './lane.js';

// Snow accumulates. Every up-facing face of a row's static meshes becomes one
// quad, and every exposed edge of one a skirt quad hanging over the side; a
// row's whole fall is that handful of quads merged into a single mesh. How
// much of it is white is carved per fragment: world XZ is quantised to a
// SPLAT grid, each cell reads a threshold off a smooth drift field, and the
// cell whitens once world.data.snowT has pushed the fraction past it. The
// field's low points seed first and their patches widen and join, so a row
// goes from scattered flecks to one sheet over SNOW_TIME seconds.
//
// Water freezes. A river's water face is laid as one quad per playable
// column, each with its own clock: it whitens over WATER_TIME from the moment
// it was last broken, and once every cell of it is white (the carve discards
// nothing past 1 / 1.05 of the way) the tile is ice: anyone can stand on it.
// Stepping off breaks it back to water (thaw) and the clock starts again.
export const SPLAT = 0.25;
export const SNOW_TIME = 90;
export const WATER_TIME = 45;
const FULL = 1 / 1.05;         // the fraction at which the carve leaves every cell white
export const ICE_Y = -0.27;    // where feet rest on frozen water: the river's surface is at -0.3
const LIFT = 0.012;            // the sheet sits this far off its face
const DRIFT = 1.7;             // world units per period of the drift field: how wide a patch grows before it meets the next
const HANG = 0.55;             // the deepest a skirt reaches below its edge
const NEAR_TOP = 0.02;         // two tops this close in y are one roof plane
const INSET = 0.03;            // how far in off a face's boundary a probe sits, or a skirt's read of the field

const num = (n) => n.toFixed(5);   // a JS constant as a GLSL float literal

function shown(o, root) {
  for (let n = o; n && n !== root.parent; n = n.parent) if (!n.visible) return false;
  return true;
}

// Lane-local boxes of the row's static leaf meshes: not the movers, coins,
// eggs, crates or flags, which move or go. Each box comes off the mesh's own
// geometry: setFromObject would fold in the children too, and a prop built as
// a mesh with parts hanging off it would claim the volume around all of them.
function staticBoxes(lane) {
  const skip = new Set();
  const mark = (o) => o?.traverse((c) => skip.add(c));
  for (const m of lane.movers) mark(m.mesh);
  for (const c of lane.coins.values()) mark(c);
  for (const e of lane.eggs.values()) mark(e);
  for (const c of lane.crates.values()) mark(c.mesh);
  for (const fl of lane.flags.values()) mark(fl);
  lane.group.traverse((o) => { if (o.userData.sign) mark(o); });   // a district sign's face stays readable
  lane.group.updateMatrixWorld(true);
  const toLocal = lane.group.matrixWorld.clone().invert();
  const boxes = [];
  lane.group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || skip.has(o) || !shown(o, lane.group)) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const b = new THREE.Box3().copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld).applyMatrix4(toLocal);
    if (b.isEmpty()) return;
    b.water = !!o.userData.water;
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

// A top is skipped only when all of it is swallowed by something else. The
// centre alone would not do: one tuft standing at the middle of a ground slab
// would take the whole row's snow with it, and snow under a tuft is hidden
// anyway.
function buried(boxes, b, probe) {
  const y = b.max.y + LIFT / 2;
  const xs = [(b.min.x + b.max.x) / 2, b.min.x + INSET, b.max.x - INSET];
  const zs = [(b.min.z + b.max.z) / 2, b.min.z + INSET, b.max.z - INSET];
  for (const x of xs) for (const z of zs) if (!inside(boxes, b, probe.set(x, y, z))) return false;
  return true;
}

// One quad, wound either way: the mesh is double-sided, so only the normal has
// to be right. `samples` gives each corner the point it reads the drift field
// at, so a top reads across itself and a skirt reads the tops it hangs from.
function quad(out, corners, samples, skirt, time = SNOW_TIME) {
  const [a, b, c] = corners;
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
  for (const [p, q, r] of [[0, 1, 2], [0, 2, 3]]) {
    for (const i of [p, q, r]) {
      const v = corners[i], s = samples[i];
      out.pos.push(v.x, v.y, v.z);
      out.nrm.push(n.x, n.y, n.z);
      out.snow.push(s.x, s.y, s.z, skirt);
      out.ice.push(0, time);
    }
  }
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Walk one edge of a top in SPLAT steps and return the stretches where nothing
// continues the roof plane just outside: those are the ones that get a skirt.
function edgeRuns(boxes, b, ex, ez, probe) {
  const top = b.max.y;
  const a0 = ex ? b.min.z : b.min.x, a1 = ex ? b.max.z : b.max.x;
  const n = Math.max(1, Math.round((a1 - a0) / SPLAT));
  const step = (a1 - a0) / n;
  const runs = [];
  let start = null;
  for (let i = 0; i < n; i++) {
    const t = a0 + (i + 0.5) * step;
    const px = ex ? (ex < 0 ? b.min.x : b.max.x) + ex * 0.1 : t;
    const pz = ex ? t : (ez < 0 ? b.min.z : b.max.z) + ez * 0.1;
    const open = !inside(boxes, b, probe.set(px, top - 0.01, pz), top);
    if (open && start === null) start = a0 + i * step;
    if (!open && start !== null) { runs.push([start, a0 + i * step]); start = null; }
  }
  if (start !== null) runs.push([start, a1]);
  return runs;
}

// A water face: one quad per playable column, each on the water clock and
// remembered by column so it can be broken alone; the reach beyond the board
// on either side as one quad each.
function waterTiles(out, b, y) {
  const top = b.max.y;
  const span = (x0, x1, c = null) => {
    if (x1 <= x0) return;
    if (c !== null) out.tiles.set(c, out.pos.length / 3);
    const corners = [V(x0, y, b.min.z), V(x0, y, b.max.z), V(x1, y, b.max.z), V(x1, y, b.min.z)];
    quad(out, corners, corners.map((p) => V(p.x, top, p.z)), 0, WATER_TIME);
  };
  span(b.min.x, -W - 0.5);
  for (let c = -W; c <= W; c++) span(c - 0.5, c + 0.5, c);
  span(W + 0.5, b.max.x);
}

// Tops and skirts for a row's boxes, as one soup of triangles.
function surfaceFor(boxes) {
  const out = { pos: [], nrm: [], snow: [], ice: [], tiles: new Map() };
  const probe = new THREE.Vector3();
  for (const b of boxes) {
    const top = b.max.y, y = top + LIFT;
    if (buried(boxes, b, probe)) continue;
    if (b.water) { waterTiles(out, b, y); continue; }
    const corners = [V(b.min.x, y, b.min.z), V(b.min.x, y, b.max.z), V(b.max.x, y, b.max.z), V(b.max.x, y, b.min.z)];
    quad(out, corners, corners.map((c) => V(c.x, top, c.z)), 0);
    if (top <= 0.05) continue;    // no skirts on the ground slabs: their sides are underground
    const foot = Math.max(b.min.y, top - HANG);
    for (const [ex, ez] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const fixed = ex ? (ex < 0 ? b.min.x : b.max.x) : (ez < 0 ? b.min.z : b.max.z);
      const face = fixed + (ex + ez) * LIFT;
      for (const [s, e] of edgeRuns(boxes, b, ex, ez, probe)) {
        const p0 = ex ? V(face, top, s) : V(s, top, face);
        const p1 = ex ? V(face, top, e) : V(e, top, face);
        const s0 = V(p0.x - ex * INSET, top, p0.z - ez * INSET);
        const s1 = V(p1.x - ex * INSET, top, p1.z - ez * INSET);
        quad(out, [p0, p1, V(p1.x, foot, p1.z), V(p0.x, foot, p0.z)], [s0, s1, s1, s0], 1);
      }
    }
  }
  return out;
}

const uniforms = { uSnowF: { value: 0 }, uSnowT: { value: 0 } };
const mat = new THREE.MeshLambertMaterial({ color: 0xf1f5fb, emissive: 0x3a3f48, side: THREE.DoubleSide });   // a lift on the emissive so the sheet reads white under a grey sky
mat.userData.uSnowF = uniforms.uSnowF;   // the depth the shader is drawing to, for the smoke test
mat.onBeforeCompile = (shader) => {
  shader.uniforms.uSnowF = uniforms.uSnowF;
  shader.uniforms.uSnowT = uniforms.uSnowT;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
      attribute vec4 aSnow;
      attribute vec2 aIce;
      uniform float uSnowT;
      varying vec4 vSnow;
      varying float vSnowY;
      varying float vSnowF;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vSnow = vec4((modelMatrix * vec4(aSnow.xyz, 1.0)).xyz, aSnow.w);
      vSnowY = (modelMatrix * vec4(transformed, 1.0)).y;
      vSnowF = clamp((uSnowT - aIce.x) / aIce.y, 0.0, 1.0);   // this face's own fraction: seconds since it was last broken, over its fill time`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
      varying vec4 vSnow;
      varying float vSnowY;
      varying float vSnowF;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), g = fract(p);
        g = g * g * (3.0 - 2.0 * g);
        return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), g.x),
                   mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), g.x), g.y);
      }`)
    .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      vec2 cell = floor(vSnow.xz / ${num(SPLAT)}) + 0.5;
      // The face's own height shifts the field, so two roofs at different
      // heights do not wear the same patches stacked one over the other.
      vec2 drift = cell * ${num(SPLAT / DRIFT)} + h21(vec2(floor(vSnow.y * 20.0), 3.0)) * 31.0;
      float n = 0.66 * vnoise(drift) + 0.34 * vnoise(drift * 2.3 + 11.0);
      n = smoothstep(0.16, 0.84, n) * 0.9 + h21(cell) * 0.1;
      if (n >= vSnowF * 1.05) discard;
      float r = h21(cell + 7.3);
      if (vSnow.w > 0.5 && vSnow.y - vSnowY > ${num(SPLAT / 2)} + step(0.5, r) * (r - 0.5) * ${num(2.0 * (HANG - SPLAT / 2))}) discard;`);
};

export function fraction(world) { return Math.max(0, Math.min(1, (world.data.snowT ?? 0) / SNOW_TIME)); }

// Build a row's snow: one mesh, however many surfaces the row has.
export function snowLane(lane, world) {
  const { pos, nrm, snow, ice, tiles } = surfaceFor(staticBoxes(lane));
  if (!pos.length) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('aSnow', new THREE.Float32BufferAttribute(snow, 4));
  geo.setAttribute('aIce', new THREE.Float32BufferAttribute(ice, 2));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  lane.group.add(mesh);
  lane.data.snow = { mesh, quads: pos.length / 18 };
  if (tiles.size) lane.data.ice = { tiles, attr: geo.getAttribute('aIce'), broken: new Map() };
  uniforms.uSnowF.value = fraction(world);   // a new board's first frame, before any tick
  uniforms.uSnowT.value = world.data.snowT ?? 0;
}

// Is column c of this row's water frozen solid? Only a snowy board's river has ice.
export function iced(lane, c) {
  const ice = lane?.data.ice;
  if (!ice?.tiles.has(c)) return false;
  return (lane.world.data.snowT ?? 0) - (ice.broken.get(c) ?? 0) >= WATER_TIME * FULL;
}

// Break column c's ice back to open water; it starts freezing again from now.
export function thaw(lane, c) {
  const ice = lane?.data.ice;
  const start = ice?.tiles.get(c);
  if (start === undefined) return;
  const t = lane.world.data.snowT ?? 0;
  ice.broken.set(c, t);
  for (let v = start; v < start + 6; v++) ice.attr.setX(v, t);
  ice.attr.needsUpdate = true;
}

// Per frame while the sky is snow: deepen. Every row reads the one uniform.
export function snowTick(world, dt) {
  world.data.snowT = (world.data.snowT ?? 0) + dt;   // runs on past SNOW_TIME: broken ice keeps its own clock
  uniforms.uSnowF.value = fraction(world);
  uniforms.uSnowT.value = world.data.snowT;
}
