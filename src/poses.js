// What dying looks like.
//
// The cause picks the pose where the cause means something — you sink in
// water, a plane throws you clear — and otherwise one is drawn from the comic
// set, so the same truck can kill you differently twice running. Each pose is
// enter/update/exit over `t`, the seconds since the death flap ended.
//
// Poses that read from directly overhead are the ones worth having: the board
// is top-down by default, so a change of silhouette carries and a change of
// direction mostly does not.
import * as THREE from 'three';
import { makeHalo, makeRedX, makeHole } from './meshes.js';
import { CHARACTERS, rollVariant, setFrame } from './characters.js';
import { sfx } from './sfx.js';

const mark = (p) => {
  if (p.xMark) return;
  p.xMark = makeRedX();
  p.xMark.position.set(p.x, p.y + 0.9, p.z);
  p.scene.add(p.xMark);
};

export const POSES = {
  // Knocked over in one of four directions, then a red X over it.
  flat: {
    update(p, t) {
      const k = Math.min(1, t / 0.15);
      p.mesh.position.y = p.y + 0.05;
      p.mesh.rotation[p.fall[0]] = p.fall[1] * k * (Math.PI / 2);
      if (k >= 1) mark(p);
    },
  },

  // Pressed into the road and drawn out along it. How far is the cause's
  // business: a car leaves a smear, a train leaves a streak.
  pancake: {
    cue: ['squelch', 120],
    update(p, t) {
      const k = Math.min(1, t / 0.14);
      const wob = 1 + Math.sin(Math.max(0, t - 0.14) * 22) * 0.1 * Math.max(0, 1 - t * 1.6);
      // No facing on a pancake, so clearing the yaw makes local x world x and
      // the stretch always runs along the lane.
      p.mesh.rotation.set(0, 0, 0);
      p.mesh.scale.set((1 + (p.squash - 1) * k) * wob, Math.max(0.06, 1 - k * 0.94), (1 + 0.35 * k) * wob);
      p.mesh.position.y = p.y + 0.05;   // clear of the ground, or it z-fights into it
      if (k >= 1) mark(p);
    },
    // Rehydrated: still a smear, then the air goes in and it boinks out.
    spawnSfx: ['boink', 0],
    spawn(p, t) {
      const k = Math.min(1, t / 0.42);
      const over = 1 + Math.sin(Math.min(1, k) * Math.PI) * 0.22;
      p.mesh.scale.set((p.squash + (1 - p.squash) * k) * (k > 0.6 ? over : 1), Math.max(0.06, k * k) * over, 1 + 0.35 * (1 - k));
      return k >= 1;
    },
  },

  // The 80s way out: quarter-turn steps, a slow rise, a halo above the head.
  halo: {
    cue: ['halo', 450],
    update(p, t) {
      const m = p.mesh;
      m.rotation.y = p.facing + Math.floor(t / 0.16) * (Math.PI / 2);
      m.position.y = p.y + t * 0.5;
      if (!p.halo) { p.halo = makeHalo(); m.add(p.halo); }
      p.halo.position.y = 1.35 + Math.min(0.6, t * 0.8);
      p.halo.rotation.y = t * 2;
    },
    // Sent back down again, halo first.
    spawn(p, t) {
      const k = Math.min(1, t / 0.5);
      p.mesh.position.y = p.y + (1 - k) * 2.2;
      return k >= 1;
    },
  },

  // Comes apart into its own blocks. The blocks belong to the mode's debris,
  // so a copy is thrown and the real mesh just stops being drawn.
  pieces: {
    enter(p) {
      const ghost = p.mesh.clone();
      p.scene.add(ghost);
      p.fx?.scatter(ghost, 0.8);
      p.mesh.visible = false;
    },
    update() {},
  },

  // A hole opens underneath, they drop through it, it closes after them.
  hole: {
    cue: ['swoop', 60],
    enter(p) {
      p.hole = makeHole();
      p.hole.position.set(p.x, 0.03, p.z);
      p.scene.add(p.hole);
    },
    update(p, t) {
      const open = Math.min(1, t / 0.22), shut = Math.max(0, 1 - Math.max(0, t - 0.85) / 0.25);
      p.hole?.scale.setScalar(Math.max(0.001, 1.15 * open * shut));
      const drop = Math.max(0, t - 0.18);
      p.mesh.position.y = p.y - Math.min(1.6, drop * 3.2);
      p.mesh.rotation.y = p.facing + drop * 6;
      p.mesh.scale.setScalar(Math.max(0.001, 1 - drop * 1.1));
    },
    exit(p) { if (p.hole) { p.scene.remove(p.hole); p.hole = null; } },
    // Back up through a hole of their own.
    spawnSfx: ['swoop', 0],
    spawn(p, t) {
      if (t === 0) { p.hole = makeHole(); p.hole.position.set(p.x, 0.03, p.z); p.scene.add(p.hole); }
      const k = Math.min(1, t / 0.55);
      p.hole?.position.set(p.x, 0.03, p.z);
      p.hole?.scale.setScalar(Math.max(0.001, 1.15 * Math.min(1, k / 0.2) * Math.max(0, 1 - Math.max(0, k - 0.7) / 0.3)));
      p.mesh.position.y = p.y - Math.max(0, 1 - k / 0.75) * 1.6;
      p.mesh.scale.setScalar(Math.min(1, 0.2 + k * 1.1));
      if (k >= 1) { POSES.hole.exit(p); return true; }
      return false;
    },
  },

  // Beamed out: the body shimmers away while sparkles climb out of it.
  beam: {
    cue: ['beam', 80],
    enter(p) {
      p.own();
      p.fx?.sparkles(new THREE.Vector3(p.x, p.y, p.z), 16);
    },
    update(p, t) {
      const k = Math.min(1, t / 0.85);
      const flicker = 0.5 + 0.5 * Math.sin(t * 42);
      p.mesh.position.y = p.y + t * 0.5;
      p.mesh.traverse((o) => { if (o.isMesh) o.material.opacity = (1 - k) * (0.35 + 0.65 * flicker); });
      if (k >= 1) p.mesh.visible = false;
    },
    // Rematerialised: the shimmer running the other way.
    spawnSfx: ['beam', 0],
    spawn(p, t) {
      const k = Math.min(1, t / 0.6);
      if (t === 0) p.own();
      const flicker = 0.5 + 0.5 * Math.sin(t * 42);
      p.mesh.traverse((o) => { if (o.isMesh) o.material.opacity = k * (0.4 + 0.6 * flicker); });
      if (k >= 1) { p.restore(); return true; }
      return false;
    },
  },

  // Runs through the whole roster looking for a body that survives, finds
  // none, and gives up. One blunt note per candidate.
  roulette: {
    enter(p) {
      p.standins = CHARACTERS.map((c) => {
        const m = c.make(rollVariant(c));
        m.position.set(p.x, p.y, p.z);
        m.rotation.y = p.facing;
        m.visible = false;
        p.scene.add(m);
        return m;
      });
      p.mesh.visible = false;
      p.rouletteStep = -1;
    },
    update(p, t) {
      if (!p.standins) return;
      const step = Math.floor(t / 0.085);
      if (step !== p.rouletteStep) {
        p.rouletteStep = step;
        for (const m of p.standins) m.visible = false;
        if (step < 12) {
          const m = p.standins[step % p.standins.length];
          m.visible = true;
          m.position.y = p.y + Math.sin(step) * 0.05;
          sfx.doot(step);
        }
      }
    },
    exit(p) {
      if (!p.standins) return;
      for (const m of p.standins) p.scene.remove(m);
      p.standins = null;
    },
  },

  // The colour drains out and so does the rest of it.
  fade: {
    cue: ['sigh', 120],
    enter(p) { p.own(); },
    update(p, t) {
      const grey = Math.min(1, t / 0.35), k = Math.max(0, (t - 0.25) / 0.8);
      p.mesh.position.y = p.y - Math.min(0.12, t * 0.2);
      p.mesh.traverse((o) => {
        if (!o.isMesh) return;
        const c = o.material.color, l = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
        c.copy(o.userData.col0).lerp(new THREE.Color(l, l, l), grey);
        o.material.opacity = Math.max(0, 1 - k);
      });
      if (k >= 1) p.mesh.visible = false;
    },
  },

  // Water closes over the top.
  sink: {
    update(p, t) {
      p.mesh.position.y = -Math.min(1.2, t * 2.5);
      p.mesh.rotation.z = t * 3;
    },
  },

  // Carried off by something with wings.
  launch: {
    update(p, t) {
      p.mesh.position.y = t * 12 - t * t * 9;
      p.mesh.rotation.x = t * 8;
    },
  },
};

// Poses that may stand in for an ordinary squashing, and how often. Weighted
// so the plain ones still carry most deaths and the absurd ones stay a treat.
const COMIC = [['flat', 6], ['pancake', 5], ['halo', 3], ['pieces', 2], ['hole', 2], ['beam', 2], ['roulette', 1], ['fade', 1]];
const TOTAL = COMIC.reduce((a, [, w]) => a + w, 0);

export function pickPose(anim) {
  if (anim !== 'flat') return anim;        // sinking and being flown off mean something; leave them
  let r = Math.random() * TOTAL;
  for (const [name, w] of COMIC) if ((r -= w) < 0) return name;
  return 'flat';
}
