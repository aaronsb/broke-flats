// Adaptive chiptune music. A lookahead scheduler walks 16th-note steps; every
// step reads the current mood and picks voices from it, so the music reacts
// within a beat. Moods: calm (safe row), danger (road or river), and a
// "peek" overlay while the camera is tilted.

import { ac } from './sfx.js';

const N = (n) => 440 * Math.pow(2, (n - 69) / 12);
const LOOKAHEAD = 0.12;
const STEPS = 16;

// Chords as MIDI note arrays; four bars per progression.
const CALM_PROG = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];       // Am F C G
const PEEK_PROG = [[53, 57, 60, 64], [55, 59, 62, 66], [57, 60, 64, 67], [50, 54, 57, 61]]; // Fmaj7 Gmaj7 Am7 D7
const PENTA = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79];  // A minor pentatonic
const LYDIAN = [57, 59, 61, 63, 64, 66, 68, 69, 71, 73, 75, 76]; // A lydian

const MOODS = {
  calm: { bpm: 92, cutoff: 700 },
  danger: { bpm: 150, cutoff: 1800 },
  battle: { bpm: 164, cutoff: 2600 },
  gauntlet: { bpm: 184, cutoff: 3200 },
  attract: { bpm: 112, cutoff: 1600 },
  epilogue: { bpm: 74, cutoff: 1200 },
  tally: { bpm: 132, cutoff: 2400 },
};
const BATTLE_PROG = [[48, 52, 55], [53, 57, 60], [55, 59, 62], [57, 60, 64]]; // C F G Am

let ctx, master, bus, delayBus, filter;
let timer = null;
let nextTime = 0, step = 0, bar = 0, bpm = 92;
const QUIET = { danger: false, tilted: false, dead: false, battle: false, countdown: 0, attract: false, gauntlet: false, epilogue: false, tally: false };
const TALLY_PROG = [[48, 52, 55], [53, 57, 60], [55, 59, 62], [48, 52, 55]]; // C F G C
const EPILOGUE_PROG = [[48, 52, 55, 59], [45, 48, 52, 55], [53, 57, 60, 64], [55, 59, 62, 65]]; // Cmaj7 Am7 Fmaj7 G7
let mood = { ...QUIET };
// Attract-mode hook: a fixed motif over the calm chords so the title has a tune.
const MOTIF = [0, 2, 4, 7, 4, 2, 0, -1, 0, 2, 4, 9, 7, 4, 2, 0];
let muted = false;

function setup() {
  ctx = ac();
  master = ctx.createGain();
  master.gain.value = 0.55;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 4;
  filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 700;
  filter.Q.value = 0.8;
  bus = ctx.createGain();
  bus.connect(filter).connect(comp).connect(master).connect(ctx.destination);

  // Feedback delay for the lead and sparkle voices.
  delayBus = ctx.createGain();
  const d = ctx.createDelay(1);
  d.delayTime.value = 0.28;
  const fb = ctx.createGain();
  fb.gain.value = 0.35;
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  delayBus.connect(d).connect(fb).connect(d);
  d.connect(wet).connect(bus);
  delayBus.connect(bus);
}

// ---------- voices ----------
function osc(type, freq, t, dur, vol, dest = bus, { attack = 0.005, slideTo = null, detune = 0 } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.detune.value = detune;
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

let noiseBuf = null;
function noise(t, dur, vol, type, freq, q = 1) {
  if (!noiseBuf) {
    const n = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(bus);
  s.start(t);
  s.stop(t + dur + 0.02);
}

const kick = (t, vol = 0.5) => osc('triangle', 150, t, 0.22, vol, bus, { slideTo: 45, attack: 0.002 });
const snare = (t, vol = 0.25) => { noise(t, 0.12, vol, 'bandpass', 1800, 1); osc('triangle', 220, t, 0.08, vol * 0.5, bus, { slideTo: 120 }); };
const hat = (t, open = false, vol = 0.12) => noise(t, open ? 0.16 : 0.04, vol, 'highpass', open ? 5000 : 7000);
const shaker = (t, vol = 0.06) => noise(t, 0.09, vol, 'bandpass', 6000, 2);

function bass(note, t, dur, driving) {
  if (mood.tilted) { osc('sine', N(note - 12), t, dur, 0.35, bus, { attack: 0.02 }); return; }
  osc(driving ? 'sawtooth' : 'square', N(note - 12), t, dur, driving ? 0.22 : 0.18, bus, { attack: 0.004 });
}
function pad(chord, t, dur) {
  for (const n of chord) {
    osc('triangle', N(n), t, dur, 0.05, bus, { attack: 0.35, detune: 6 });
    osc('triangle', N(n), t, dur, 0.05, bus, { attack: 0.35, detune: -6 });
  }
}
const lead = (note, t, dur, vol = 0.09) => osc('square', N(note), t, dur, vol, delayBus, { attack: 0.004 });
const sparkle = (note, t, dur) => osc('sine', N(note), t, dur, 0.07, delayBus, { attack: 0.003 });

// ---------- step sequencer ----------
function scheduleStep(s, t) {
  const target = MOODS[mood.tally ? 'tally' : mood.epilogue ? 'epilogue' : mood.attract ? 'attract' : mood.dead ? 'calm' : mood.battle ? 'battle' : mood.gauntlet ? 'gauntlet' : mood.danger ? 'danger' : 'calm'];
  // A running continue countdown pushes the tempo up toward the end.
  const goalBpm = mood.countdown ? 110 + mood.countdown * 90 : target.bpm;
  bpm += (goalBpm - bpm) * 0.12;
  const beat = 60 / bpm, sixteenth = beat / 4;
  const prog = mood.tally ? TALLY_PROG : mood.epilogue ? EPILOGUE_PROG : mood.battle ? BATTLE_PROG : mood.tilted ? PEEK_PROG : CALM_PROG;
  const chord = prog[bar % prog.length];
  const root = chord[0];
  const scale = mood.tilted ? LYDIAN : PENTA;
  const danger = (mood.danger || mood.battle || mood.gauntlet) && !mood.dead;

  filter.frequency.setTargetAtTime(mood.tilted ? 4000 : mood.countdown ? 800 + mood.countdown * 3000 : target.cutoff, t, 0.2);

  if (mood.dead) {
    if (s === 0) pad(chord, t, beat * 4);
    return;
  }

  if (mood.tally) {
    // Cash-in: bouncing octave bass, off-beat chord stabs, a bright climbing arp.
    if (s % 2 === 0) bass(root + (s % 4 === 0 ? 0 : 12), t, sixteenth * 1.6, false);
    if (s % 4 === 2) for (const n of chord) lead(n + 12, t, sixteenth * 1.2, 0.035);
    if (s % 2 === 1) lead(chord[(s >> 1) % chord.length] + 24, t, sixteenth * 1.4, 0.05);
    if (s % 4 === 0) hat(t, false, 0.08);
    return;
  }

  if (mood.epilogue) {
    // End-credits feel: slow pad, a sine bass every two beats, a sparse lead drifting up the chord.
    if (s === 0) pad(chord, t, beat * 4);
    if (s === 0 || s === 8) osc('sine', N(root - 12), t, beat * 1.9, 0.3, bus, { attack: 0.05 });
    if (s % 4 === 2 && Math.random() < 0.75) lead(chord[((s / 4) | 0 + bar) % chord.length] + 12, t, sixteenth * 5, 0.05);
    return;
  }

  if (mood.attract) {
    // Title tune: pad, walking bass, the motif on square lead, a soft hat.
    if (s === 0) pad(chord, t, beat * 4);
    if (s % 4 === 0) bass(root + [0, 7, 12, 7][(s / 4) | 0], t, beat * 0.9, false);
    const step = MOTIF[(s + bar * 4) % MOTIF.length];
    if (step >= 0 && s % 2 === 0) lead(scale[(step + bar) % scale.length], t, sixteenth * 2.5, 0.07);
    if (s % 4 === 2) hat(t, false, 0.06);
    return;
  }

  if (danger) {
    // Driving: four-on-the-floor, backbeat snare, 8th-note hats, syncopated bass, arp lead.
    if (s % 4 === 0 || (s === 10 && bar % 2 === 1)) kick(t);
    if (s === 4 || s === 12) snare(t);
    if (s % 2 === 0) hat(t, s === 14);
    if (s % 2 === 0) {
      const seq = [0, 0, 12, 0, 7, 0, 12, 7];
      bass(root + seq[(s / 2) | 0], t, sixteenth * 1.8, true);
    }
    const arpPat = [0, 1, 2, 1, 0, 2, 1, 2];
    if (s % 2 === 0 || s === 7 || s === 15) {
      const tone = chord[arpPat[((s / 2) | 0) % arpPat.length] % chord.length] + 12;
      lead(tone, t, sixteenth * 1.5, 0.07);
    }
  } else {
    // Calm: pad, slow bass, sparse pentatonic wandering.
    if (s === 0) pad(chord, t, beat * 4);
    if (s === 0 || s === 8) bass(root, t, beat * 1.8, false);
    if (s === 12 && bar % 2 === 1) bass(root + 7, t, beat * 0.9, false);
    if (s % 2 === 0 && Math.random() < 0.3) {
      const i = Math.floor(Math.random() * scale.length);
      lead(scale[i], t, sixteenth * 3, 0.06);
    }
    if (s % 4 === 2 && Math.random() < 0.5) shaker(t);
  }

  if (mood.tilted) {
    // Peek overlay: high sparkle arp cycling the chord two octaves up.
    const tone = chord[(s + bar) % chord.length] + 24;
    if (s % 2 === 0 || danger) sparkle(tone, t, sixteenth * 2.5);
    if (s % 4 === 0) shaker(t, 0.05);
  }
}

function tick() {
  const now = ctx.currentTime;
  while (nextTime < now + LOOKAHEAD) {
    const t = Math.max(nextTime, now + 0.002);
    scheduleStep(step, t);
    nextTime += 60 / bpm / 4;
    step = (step + 1) % STEPS;
    if (step === 0) bar++;
  }
}

export const music = {
  start() {
    if (timer) return;
    if (!ctx) setup();
    nextTime = ctx.currentTime + 0.05;
    step = 0; bar = 0;
    timer = setInterval(tick, 25);
  },
  setMood(m) { mood = { ...mood, ...m }; },
  // Scene change: drop every flag, snap the tempo to the new mood, restart on the downbeat.
  reset(m = {}) {
    mood = { ...QUIET, ...m };
    const name = mood.tally ? 'tally' : mood.epilogue ? 'epilogue' : mood.attract ? 'attract' : mood.dead ? 'calm' : mood.battle ? 'battle' : mood.gauntlet ? 'gauntlet' : mood.danger ? 'danger' : 'calm';
    bpm = MOODS[name].bpm;
    step = 0; bar = 0;
    if (ctx) nextTime = Math.max(nextTime, ctx.currentTime + 0.05);
  },
  toggleMute() {
    muted = !muted;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.05);
    return muted;
  },
};
