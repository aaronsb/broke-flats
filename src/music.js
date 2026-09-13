// Adaptive chiptune music. A lookahead scheduler walks 16th-note steps; every
// step reads the current mood and picks voices from it, so the music reacts
// within a beat. Moods: calm (safe row), danger (road or river), hearing
// (hold music while the complaints get filed), and a "peek" overlay while
// the camera is tilted. Weather (rain, snow) colours the board moods.

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
  hearing: { bpm: 96, cutoff: 1400 },
  gauntlet: { bpm: 184, cutoff: 3200 },
  attract: { bpm: 112, cutoff: 1600 },
  epilogue: { bpm: 74, cutoff: 1200 },
  tally: { bpm: 132, cutoff: 2400 },
};
// Hold music: a soft bossa loop of sevenths. Cmaj7 Am7 Dm7 G7, the elevator's own.
const HEARING_PROG = [[48, 52, 55, 59], [45, 48, 52, 55], [50, 53, 57, 60], [43, 47, 50, 53]];

// Weather colours the board moods (calm, danger, gauntlet) and nothing else.
// Rain: the calm chords with the majors swapped for their relative minors,
// slower, the lead under a lower cutoff, and soft triangle phrases that step
// down the scale, each starting from a different height, so the tune falls.
// Snow: sevenths, slower still in calm, a bell line stepping down the chord
// every two bars, a few high pings scattered per bar, the bass resting every
// other bar, a whisper of high pad.
const RAIN_PROG = [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 55, 59]];       // Am F Dm Em
const SNOW_PROG = [[53, 57, 60, 64], [48, 52, 55, 59], [57, 60, 64, 67], [52, 55, 59, 62]]; // Fmaj7 Cmaj7 Am7 Em7
const WEATHER = {
  rain: { tempo: { calm: 0.88, danger: 0.88, gauntlet: 0.88 }, cutoff: 0.6, prog: RAIN_PROG },
  snow: { tempo: { calm: 0.8, danger: 0.92, gauntlet: 0.92 }, cutoff: 1.5, prog: SNOW_PROG },
};
// Bell steps over the two-bar cycle: five on the even bar, one answer on the odd.
const SNOW_BELL = [[0, 3, 6, 10, 13], [4]];
const RAIN_SCALE = PENTA.map((n) => n + 12);
let weather = null;
// Phrase state for the weather figures: where the rain phrase is on its way
// down and how long it rests; where the bell line is on its ladder; which
// steps of this bar get a ping.
const fig = { rainIdx: 0, rainLeft: 0, rainRest: 0, snowIdx: 0, pings: [] };

let ctx, master, bus, delayBus, hiBus, stingBus, filter;
let timer = null;
let nextTime = 0, step = 0, bar = 0, bpm = 92;
const QUIET = { danger: false, tilted: false, dead: false, hearing: false, countdown: 0, attract: false, gauntlet: false, epilogue: false, tally: false, star: false };
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
  // Weather figures skip the lowpass so they stay clear under rain's low cutoff; their echoes take the dark path.
  hiBus = ctx.createGain();
  hiBus.connect(comp);
  hiBus.connect(d);
  // Bumpers skip the mood bus so they play at full voice while it ducks under them.
  stingBus = ctx.createGain();
  stingBus.connect(comp);
}

// ---------- bumpers ----------
// Stage stings: a race-start figure for the board (three beats on one pitch,
// the fourth longer and a fifth up), the gauntlet's a semitone darker with a
// snare on each beat, the hearing's a two-note office chime. Each entry:
// duration, then [offset, note, length, voice] beats.
const BUMPERS = {
  day:      { dur: 2.4, beats: [[0, 69, 0.14, 'lead'], [0.5, 69, 0.14, 'lead'], [1.0, 69, 0.14, 'lead'], [1.5, 76, 0.75, 'lead']] },
  gauntlet: { dur: 2.4, beats: [[0, 68, 0.14, 'lead'], [0.5, 68, 0.14, 'lead'], [1.0, 68, 0.14, 'lead'], [1.5, 75, 0.75, 'lead']], snare: true },
  hearing:  { dur: 1.8, beats: [[0, 76, 0.9, 'chime'], [0.45, 72, 1.1, 'chime']] },
};
const DUCK = 0.18;   // mood gain under a bumper
function stingVoice(kind, note, t, dur) {
  if (kind === 'chime') {
    osc('sine', N(note), t, dur, 0.16, stingBus, { attack: 0.004 });
    osc('sine', N(note), t, dur * 0.8, 0.07, stingBus, { attack: 0.004, detune: 7 });
    osc('triangle', N(note + 12), t, dur * 0.25, 0.04, stingBus, { attack: 0.002 });
    return;
  }
  osc('square', N(note), t, dur, 0.11, stingBus, { attack: 0.003 });
  osc('square', N(note - 12), t, dur, 0.05, stingBus, { attack: 0.003 });
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
function pad(chord, t, dur, vol = 0.05) {
  for (const n of chord) {
    osc('triangle', N(n), t, dur, vol, bus, { attack: 0.35, detune: 6 });
    osc('triangle', N(n), t, dur, vol, bus, { attack: 0.35, detune: -6 });
  }
}
const lead = (note, t, dur, vol = 0.09) => osc('square', N(note), t, dur, vol, delayBus, { attack: 0.004 });
const sparkle = (note, t, dur) => osc('sine', N(note), t, dur, 0.07, delayBus, { attack: 0.003 });
// Snow bell: a sine with a detuned twin for shimmer and a short triangle strike an octave up.
function bell(note, t, dur, vol = 0.07) {
  osc('sine', N(note), t, dur, vol, hiBus, { attack: 0.004 });
  osc('sine', N(note), t, dur * 0.8, vol * 0.5, hiBus, { attack: 0.004, detune: 9 });
  osc('triangle', N(note + 12), t, dur * 0.3, vol * 0.25, hiBus, { attack: 0.002, detune: -5 });
}
// Rain drop: a soft triangle with a short release, nudged late by a random slice of the step.
const drop = (note, t, sixteenth, vol = 0.03) => osc('triangle', N(note), t + Math.random() * sixteenth * 0.25, sixteenth * 1.3, vol, hiBus, { attack: 0.003 });
// Snow ping: a tiny high sine with a detuned twin, light catching a flake.
function ping(note, t, dur, vol = 0.028) {
  const detune = (Math.random() - 0.5) * 24;
  osc('sine', N(note), t, dur, vol, hiBus, { attack: 0.002, detune });
  osc('sine', N(note), t, dur * 0.8, vol * 0.6, hiBus, { attack: 0.002, detune: detune + 11 });
}

// ---------- step sequencer ----------
const BOARD = { calm: true, danger: true, gauntlet: true };
function moodName(m) {
  return m.tally ? 'tally' : m.epilogue ? 'epilogue' : m.attract ? 'attract' : m.dead ? 'calm' : m.hearing ? 'hearing' : m.gauntlet ? 'gauntlet' : m.danger || m.star ? 'danger' : 'calm';
}
// The weather in force for this mood: set only on the live board.
const boardWeather = (name) => (weather && BOARD[name] && !mood.dead ? WEATHER[weather] : null);
function tempoFor(name) {
  const wx = boardWeather(name);
  return MOODS[name].bpm * (wx ? wx.tempo[name] : 1);
}

function scheduleStep(s, t) {
  const name = moodName(mood);
  const target = MOODS[name];
  const wx = boardWeather(name);
  // A running continue countdown pushes the tempo up toward the end.
  const goalBpm = mood.countdown ? 110 + mood.countdown * 90 : tempoFor(name);
  bpm += (goalBpm - bpm) * 0.12;
  const beat = 60 / bpm, sixteenth = beat / 4;
  const prog = mood.tally ? TALLY_PROG : mood.epilogue ? EPILOGUE_PROG : mood.hearing ? HEARING_PROG : mood.tilted ? PEEK_PROG : wx ? wx.prog : CALM_PROG;
  const chord = prog[bar % prog.length];
  const root = chord[0];
  const scale = mood.tilted ? LYDIAN : PENTA;
  const danger = (mood.danger || mood.gauntlet || mood.star) && !mood.dead;   // a star drives like danger

  filter.frequency.setTargetAtTime(mood.tilted ? 4000 : mood.countdown ? 800 + mood.countdown * 3000 : target.cutoff * (wx ? wx.cutoff : 1), t, 0.2);

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

  if (mood.hearing) {
    // Hold music: pad, a lazy two-beat bass, chord tones on the off-beats, a
    // sine lead ambling down the chord, shaker on the eights. Under the booms.
    if (s === 0) pad(chord, t, beat * 4);
    if (s === 0 || s === 6) bass(root, t, beat * 1.4, false);
    if (s === 10) bass(root + 7, t, beat * 1.2, false);
    if (s === 3 || s === 11) for (const n of chord.slice(1)) osc('triangle', N(n + 12), t, sixteenth * 1.8, 0.035, bus, { attack: 0.01 });
    if (s % 4 === 1 && Math.random() < 0.7) osc('sine', N(chord[chord.length - 1 - (((s >> 2) + bar) % chord.length)] + 24), t, sixteenth * 3.5, 0.06, delayBus, { attack: 0.01 });
    if (s % 2 === 0) shaker(t, s % 4 === 0 ? 0.06 : 0.03);
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
    // Calm: pad, slow bass, sparse pentatonic wandering. Snow rests the bass
    // every other bar and thins the lead so the bells carry the tune.
    const snow = wx === WEATHER.snow;
    if (s === 0) pad(chord, t, beat * 4);
    if (!snow || bar % 2 === 0) {
      if (s === 0 || s === 8) bass(root, t, beat * 1.8, false);
      if (s === 12 && bar % 2 === 1) bass(root + 7, t, beat * 0.9, false);
    }
    if (s % 2 === 0 && Math.random() < (wx ? 0.15 : 0.3)) {
      const i = Math.floor(Math.random() * scale.length) % scale.length;
      lead(scale[i], t, sixteenth * 3, 0.06);
    }
    if (s % 4 === 2 && Math.random() < 0.5) shaker(t);
  }

  if (wx === WEATHER.rain) {
    // Falling phrases: four to six drops stepping down the scale one per sixteenth,
    // each phrase starting from a random height, then a rest of a few steps.
    if (fig.rainLeft > 0 && fig.rainIdx >= 0) {
      drop(RAIN_SCALE[fig.rainIdx % RAIN_SCALE.length], t, sixteenth, danger ? 0.022 : 0.03);
      fig.rainIdx--; fig.rainLeft--;
      if (fig.rainLeft === 0 || fig.rainIdx < 0) { fig.rainLeft = 0; fig.rainRest = 2 + Math.floor(Math.random() * 6); }
    } else if (fig.rainRest > 0) {
      fig.rainRest--;
    } else {
      fig.rainLeft = 4 + Math.floor(Math.random() * 3);
      fig.rainIdx = Math.min(RAIN_SCALE.length - 1, fig.rainLeft - 1 + Math.floor(Math.random() * (RAIN_SCALE.length - fig.rainLeft + 1)));
    }
  }
  if (wx === WEATHER.snow) {
    // A bell line stepping down a two-octave ladder of chord tones over two bars,
    // starting from a random rung each cycle; two to four pings scattered through
    // the bar; a whisper of the top two chord tones two octaves up.
    const ladder = [...chord.map((n) => n + 24), ...chord.map((n) => n + 12)].sort((a, b) => b - a);
    if (s === 0) {
      if (bar % 2 === 0) fig.snowIdx = Math.floor(Math.random() * 2);
      const count = 2 + Math.floor(Math.random() * 3);
      fig.pings = [];
      while (fig.pings.length < count) { const at = Math.floor(Math.random() * STEPS); if (!fig.pings.includes(at)) fig.pings.push(at); }
      for (const n of chord.slice(-2)) osc('sine', N(n + 24), t, beat * 4.2, 0.016, bus, { attack: 0.9, detune: 4 });
    }
    if (SNOW_BELL[bar % 2].includes(s)) {
      bell(ladder[fig.snowIdx % ladder.length], t, beat * (danger ? 1.2 : 2), danger ? 0.055 : 0.07);
      fig.snowIdx++;
    }
    if (fig.pings.includes(s)) ping(chord[Math.floor(Math.random() * chord.length) % chord.length] + 36, t + Math.random() * sixteenth * 0.5, sixteenth * 0.7);
  }

  if (mood.tilted || mood.star) {
    // Peek overlay: high sparkle arp cycling the chord two octaves up. A star gets it too.
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
    bpm = tempoFor(moodName(mood));
    step = 0; bar = 0;
    fig.rainLeft = 0; fig.rainRest = 0; fig.snowIdx = 0; fig.pings = [];
    if (ctx) nextTime = Math.max(nextTime, ctx.currentTime + 0.05);
  },
  // Weather is a property of the level, so it survives reset(). A sky id:
  // 'rain' or 'snow' colours the board moods; anything else clears it.
  setWeather(name) { weather = Object.hasOwn(WEATHER, name) ? name : null; },
  get weather() { return weather; },
  // One stage sting, now. The mood bus ducks for its length and comes back at the end.
  bumper(kind) {
    if (!ctx) return;
    const fig = BUMPERS[kind] ?? BUMPERS.day;
    const t0 = ctx.currentTime + 0.03;
    const g = bus.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(g.value, t0);
    g.linearRampToValueAtTime(DUCK, t0 + 0.08);
    g.setValueAtTime(DUCK, t0 + fig.dur - 0.35);
    g.linearRampToValueAtTime(1, t0 + fig.dur);
    for (const [at, note, len, voice] of fig.beats ?? []) {
      stingVoice(voice, note, t0 + at, len);
      if (fig.snare) snare(t0 + at, 0.3);
      else kick(t0 + at, 0.35);
    }
  },
  toggleMute() {
    muted = !muted;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.05);
    return muted;
  },
};
