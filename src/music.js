// Adaptive chiptune music. A lookahead scheduler walks 16th-note steps; every
// step reads the current mood and picks voices from it, so the music reacts
// within a beat.
//
// The board plays one song, the stage song in song.js, and never stops it:
// every board mood is an arrangement of the same bars at the same tempo, so
// stepping on and off the road changes the band, not the tune. Grass is the
// stroll (triangle melody an octave down, light drums, a ripple of arpeggio);
// a road or river is the full band (pulse lead with its echo, rock beat,
// driving bass, stabs and arpeggios). A peek muffles the band and lays a
// bright arpeggio and a coin-meter tick over it. Rain and snow re-voice it.
// The title has its own theme; the hearing, the tally and the epilogue keep
// their own loops.

import { ac } from './sfx.js';
import { STEPS, STAGE, TITLE, BASS } from './song.js';

const N = (n) => 440 * Math.pow(2, (n - 69) / 12);
const LOOKAHEAD = 0.12;
const CUTOFF_MAX = 6500;   // snow's brightening stops here so the pulses do not turn brittle
const PEEK_CUTOFF = 1500;  // a peek hears the band through glass
const ECHO_STEPS = 3;      // the chip-era echo: the lead again, thinner, three sixteenths late

const PENTA = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79];  // A minor pentatonic

const MOODS = {
  calm: { bpm: 150, cutoff: 3400 },
  danger: { bpm: 150, cutoff: 5200 },
  hearing: { bpm: 96, cutoff: 1400 },
  gauntlet: { bpm: 172, cutoff: 6500 },
  attract: { bpm: 132, cutoff: 4200 },
  epilogue: { bpm: 74, cutoff: 1200 },
  tally: { bpm: 132, cutoff: 2400 },
};
// Hold music: a soft bossa loop of sevenths. Cmaj7 Am7 Dm7 G7, the elevator's own.
const HEARING_PROG = [[48, 52, 55, 59], [45, 48, 52, 55], [50, 53, 57, 60], [43, 47, 50, 53]];
const TALLY_PROG = [[48, 52, 55], [53, 57, 60], [55, 59, 62], [48, 52, 55]]; // C F G C
const EPILOGUE_PROG = [[48, 52, 55, 59], [45, 48, 52, 55], [53, 57, 60, 64], [55, 59, 62, 65]]; // Cmaj7 Am7 Fmaj7 G7

// Weather re-voices the board song and nothing else. Rain: a little slower,
// darker, the lead on the thinnest pulse with a second echo, a sixteenth
// patter for hats, and soft phrases of drops stepping down the scale. Snow:
// slower still, every held lead note doubled by a bell an octave up, the
// grass bass resting every other bar, a few high pings per bar, a whisper of
// high pad.
const WEATHER = {
  rain: { tempo: 0.9, cutoff: 0.6 },
  snow: { tempo: 0.88, cutoff: 1.2 },
};
const RAIN_SCALE = PENTA.map((n) => n + 12);
let weather = null;
// Phrase state for the weather figures: where the rain phrase is on its way
// down and how long it rests; which steps of this bar get a snow ping.
const fig = { rainIdx: 0, rainLeft: 0, rainRest: 0, pings: [] };

let ctx, master, bus, delayBus, hiBus, stingBus, filter;
// The song now sounding plays every voice through its own generation of
// gains, one per bus, so a transition can fade what it leaves ringing.
let out = null;
let timer = null;
let nextTime = 0, step = 0, bar = 0, bpm = 150;
// Where the current song is, in bars. It runs on through every board mood and
// goes back to bar one on a scene change.
let songBar = 0;
const QUIET = { danger: false, tilted: false, dead: false, hearing: false, countdown: 0, attract: false, gauntlet: false, epilogue: false, tally: false, star: false };
let mood = { ...QUIET };
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

  // Feedback delay for the tally, epilogue and hold-music leads, and for the clear bus's echoes.
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
  generation(ctx.currentTime);
}

// ---------- transitions ----------
// iMUSE-style: a scene change never cuts a song mid-beat and never lets two
// songs sound together. reset() queues the next mood; the scheduler switches
// on the next beat, the outgoing song's generation fades over FADE from that
// beat (its long pads, bells and echoes included), and the tempo glides to
// the new song's over its first bar instead of snapping. A bumper clears the
// floor: the song sounding fades as the sting starts, and the next song
// enters on the downbeat after the sting ends.
const FADE = 0.2;
const GLIDE = 0.15;        // share of the tempo gap closed per sixteenth
let pending = null;        // a mood waiting for the next beat
let holdUntil = 0;         // no song before this time: a bumper is playing
let fromSilence = false;   // the next song enters out of a bumper: nothing to glide from, so it starts at its own tempo

// A fresh generation for the next song from time t; the old one fades out and is let go.
function generation(t) {
  const old = out;
  out = { main: ctx.createGain(), hi: ctx.createGain(), delay: ctx.createGain() };
  out.main.connect(bus); out.hi.connect(hiBus); out.delay.connect(delayBus);
  if (!old) return;
  for (const g of Object.values(old)) {
    g.gain.setValueAtTime(1, t);
    g.gain.linearRampToValueAtTime(0.0001, t + FADE);
  }
  setTimeout(() => { for (const g of Object.values(old)) g.disconnect(); }, (t - ctx.currentTime + FADE + 1) * 1000);
}

// The queued mood takes over at time t, on a beat: the song restarts from its downbeat.
function switchTo(m, t) {
  mood = m;
  if (fromSilence) { bpm = tempoFor(moodName(mood)); fromSilence = false; }
  step = 0; bar = 0; songBar = 0;
  fig.rainLeft = 0; fig.rainRest = 0; fig.pings = [];
  generation(t);
}

// ---------- bumpers ----------
// Stage stings: a race-start figure for the board (three beats on one pitch,
// the fourth longer and a fifth up), the gauntlet's a semitone darker with a
// snare on each beat, the hearing's a two-note office chime. Each entry:
// [offset, note, length, voice] beats; the next song enters as the last one ends.
const BUMPERS = {
  day:      { beats: [[0, 69, 0.14, 'lead'], [0.5, 69, 0.14, 'lead'], [1.0, 69, 0.14, 'lead'], [1.5, 76, 0.75, 'lead']] },
  gauntlet: { beats: [[0, 68, 0.14, 'lead'], [0.5, 68, 0.14, 'lead'], [1.0, 68, 0.14, 'lead'], [1.5, 75, 0.75, 'lead']], snare: true },
  hearing:  { beats: [[0, 76, 0.9, 'chime'], [0.45, 72, 1.1, 'chime']] },
};
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
function osc(type, freq, t, dur, vol, dest = out.main, { attack = 0.005, slideTo = null, detune = 0 } = {}) {
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
function noise(t, dur, vol, type, freq, q = 1, dest = out.main) {
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
  s.connect(f).connect(g).connect(dest);
  s.start(t);
  s.stop(t + dur + 0.02);
}

const kick = (t, vol = 0.5, dest = out.main) => osc('triangle', 150, t, 0.22, vol, dest, { slideTo: 45, attack: 0.002 });
const snare = (t, vol = 0.25, dest = out.main) => { noise(t, 0.12, vol, 'bandpass', 1800, 1, dest); osc('triangle', 220, t, 0.08, vol * 0.5, dest, { slideTo: 120 }); };
const hat = (t, open = false, vol = 0.12) => noise(t, open ? 0.16 : 0.04, vol, 'highpass', open ? 5000 : 7000);
const shaker = (t, vol = 0.06) => noise(t, 0.09, vol, 'bandpass', 6000, 2);

function bass(note, t, dur, driving) {
  osc(driving ? 'sawtooth' : 'square', N(note - 12), t, dur, driving ? 0.22 : 0.18, out.main, { attack: 0.004 });
}
function pad(chord, t, dur, vol = 0.05) {
  for (const n of chord) {
    osc('triangle', N(n), t, dur, vol, out.main, { attack: 0.35, detune: 6 });
    osc('triangle', N(n), t, dur, vol, out.main, { attack: 0.35, detune: -6 });
  }
}
const lead = (note, t, dur, vol = 0.09) => osc('square', N(note), t, dur, vol, out.delay, { attack: 0.004 });
// Snow bell: a sine with a detuned twin for shimmer and a short triangle strike an octave up.
function bell(note, t, dur, vol = 0.07) {
  osc('sine', N(note), t, dur, vol, out.hi, { attack: 0.004 });
  osc('sine', N(note), t, dur * 0.8, vol * 0.5, out.hi, { attack: 0.004, detune: 9 });
  osc('triangle', N(note + 12), t, dur * 0.3, vol * 0.25, out.hi, { attack: 0.002, detune: -5 });
}
// Rain drop: a soft triangle with a short release, nudged late by a random slice of the step.
const drop = (note, t, sixteenth, vol = 0.03) => osc('triangle', N(note), t + Math.random() * sixteenth * 0.25, sixteenth * 1.3, vol, out.hi, { attack: 0.003 });
// Snow ping: a tiny high sine with a detuned twin, light catching a flake.
function ping(note, t, dur, vol = 0.028) {
  const detune = (Math.random() - 0.5) * 24;
  osc('sine', N(note), t, dur, vol, out.hi, { attack: 0.002, detune });
  osc('sine', N(note), t, dur * 0.8, vol * 0.6, out.hi, { attack: 0.002, detune: detune + 11 });
}


// ---------- chip voices ----------
// Pulse waves at NES duty cycles, built once per duty.
const pulseWaves = {};
function pulseWave(duty) {
  if (pulseWaves[duty]) return pulseWaves[duty];
  const H = 48, real = new Float32Array(H), imag = new Float32Array(H);
  for (let n = 1; n < H; n++) real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  return (pulseWaves[duty] = ctx.createPeriodicWave(real, imag));
}
// A chip voice: quick attack, a small decay to a held level, a short release.
// `vib` (cents) wobbles held notes once they have sounded for a moment.
// `wave` is a duty cycle, or 'triangle' for the NES bass channel's tone.
function pulse(wave, note, t, dur, vol, { vib = 0, dest = out.main } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  if (wave === 'triangle') o.type = 'triangle';
  else o.setPeriodicWave(pulseWave(wave));
  o.frequency.value = N(note);
  const rel = Math.min(0.05, dur * 0.3), hold = Math.max(0.006, dur - rel), dec = Math.min(0.06, hold);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + Math.min(0.004, dec));
  g.gain.linearRampToValueAtTime(vol * 0.7, t + dec);
  g.gain.setValueAtTime(vol * 0.7, t + hold);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  if (vib && dur > 0.3) {
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = 5.5;
    depth.gain.setValueAtTime(0, t);
    depth.gain.setValueAtTime(0, t + 0.16);
    depth.gain.linearRampToValueAtTime(vib, t + 0.32);
    lfo.connect(depth).connect(o.detune);
    lfo.start(t); lfo.stop(t + dur + 0.02);
  }
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}
const rim = (t, vol = 0.07) => noise(t, 0.025, vol, 'highpass', 3200);
const meter = (note, t) => pulse(0.125, note, t, 0.018, 0.02, { dest: out.hi });   // the peek's coin meter, on the chord's root

// ---------- the board band ----------
// One step of a song. full: the whole band (a road, a river, the gauntlet, a
// star, the continue countdown). Otherwise the stroll. `chord` is this bar's.
function songStep(song, s, t, sixteenth, chord, full, wx) {
  const at = songBar % song.lead.length;
  const half = song.lead.length / 2;
  const bSection = at >= half;
  const turn = at % half === half - 1;
  const rain = wx === WEATHER.rain, snow = wx === WEATHER.snow;
  const peek = mood.tilted && !mood.attract;

  // Drums. Full: rock beat, a crash into each section, a snare roll on the
  // turnaround. Stroll: kick on one and three, a rim on the backbeat.
  if (full) {
    if (s === 0 || s === 8 || s === 10 || (s === 7 && at % 2)) kick(t, 0.45);
    if (s === 4 || s === 12) snare(t, 0.26);
    if (turn && s > 12) snare(t, 0.12 + (s - 12) * 0.05);
    if (s === 0 && at % half === 0) noise(t, 0.6, 0.1, 'highpass', 4000);
    else if (rain) shaker(t, s % 4 === 2 ? 0.05 : 0.025);
    else if (s % 2 === 0) hat(t, false, s % 4 === 2 ? 0.1 : 0.06);
  } else {
    if (s === 0 || s === 8 || (s === 14 && at % 2)) kick(t, 0.3);
    if (s === 4 || s === 12) rim(t);
    if (rain) { if (s % 2 === 1) shaker(t, 0.025); } else if (s % 4 === 2) hat(t, false, 0.05);
  }

  // Triangle bass: drives on the road, strolls on the grass. Snow rests the stroll every other bar.
  const b = (full ? BASS.drive : BASS.stroll)[s];
  if (b !== undefined && (full || !snow || at % 2 === 0)) {
    const short = s === 11 || s === 15;
    pulse('triangle', chord[0] - 12 + b, t, sixteenth * (short ? 0.9 : full ? 1.7 : 3), full ? 0.3 : 0.26);
  }

  // Harmony: stabs on the off-beats in A and arpeggios in B on the road (the
  // gauntlet arpeggiates throughout); on the grass an eighth-note ripple.
  if (full && (bSection || mood.gauntlet)) {
    for (let h = 0; h < 2; h++) {
      const i = s * 2 + h;
      pulse(0.125, chord[i % chord.length] + 12 * (1 + ((i / chord.length) | 0) % 2), t + h * sixteenth / 2, sixteenth / 2, 0.022);
    }
  } else if (full) {
    if (s % 4 === 2) for (const n of chord) pulse(0.5, n, t, sixteenth * 0.9, 0.022);
  } else if (s % 2 === 0) {
    pulse(0.125, chord[(s / 2) % chord.length] + 12, t, sixteenth * 1.5, 0.016);
  }

  // The melody. Full: a pulse lead with vibrato and its echo (rain thins the
  // lead and adds a second echo). Stroll: the triangle an octave down. Snow
  // doubles held notes with a bell an octave up.
  const n = song.lead[at][s];
  if (n) {
    const dur = n[1] * sixteenth * 0.95;
    // An echo stops at the bar line when the next bar changes chord, and is
    // dropped if it would start there.
    const same = song.chords[(at + 1) % song.chords.length] === chord;
    const echo = (k, vol, vib) => {
      const steps = same ? n[1] : Math.min(n[1], STEPS - s - k);
      if (steps > 0) pulse(0.125, n[0], t + k * sixteenth, steps * sixteenth * 0.95, vol, { vib });
    };
    if (full) {
      pulse(rain ? 0.125 : 0.25, n[0], t, dur, rain ? 0.075 : 0.085, { vib: 18 });
      echo(ECHO_STEPS, 0.03, 18);
      if (rain) echo(ECHO_STEPS * 2, 0.016, 0);
    } else {
      pulse('triangle', n[0] - 12, t, dur, 0.1, { vib: 12 });
    }
    if (snow && n[1] >= 3) bell(n[0] + 12, t, Math.min(dur * 1.5, 1.2), full ? 0.03 : 0.04);
  }

  // A peek: the band goes behind glass (the filter, set by the scheduler)
  // while a bright arpeggio climbs the chord two octaves up and the coin
  // meter ticks each beat, both on the clear bus. A star gets a quicker,
  // sparkling version of the arpeggio and no meter.
  if (peek || mood.star) {
    const tone = chord[(s + at) % chord.length] + 24 + (s % 8 >= 4 ? 12 : 0);
    if (peek ? s % 2 === 0 : true) pulse(0.125, tone, t, sixteenth * 1.2, peek ? 0.03 : 0.022, { dest: out.hi });
    if (peek && s % 4 === 0) meter(chord[0] + 36, t);
  }

  if (s === STEPS - 1) songBar++;
}

// ---------- step sequencer ----------
const BOARD = { calm: true, danger: true, gauntlet: true };
function moodName(m) {
  return m.tally ? 'tally' : m.epilogue ? 'epilogue' : m.attract ? 'attract' : m.dead ? 'calm' : m.hearing ? 'hearing' : m.gauntlet ? 'gauntlet' : m.danger || m.star ? 'danger' : 'calm';
}
// The weather in force: set only on the live board.
const boardWeather = (name = moodName(mood)) => (weather && BOARD[name] && !mood.dead ? WEATHER[weather] : null);
function tempoFor(name) {
  const wx = boardWeather(name);
  return MOODS[name].bpm * (wx ? wx.tempo : 1);
}

function scheduleStep(s, t) {
  const name = moodName(mood);
  const target = MOODS[name];
  const wx = boardWeather(name);
  // A running continue countdown pushes the tempo up toward the end.
  const goalBpm = mood.countdown ? 110 + mood.countdown * 90 : tempoFor(name);
  bpm += (goalBpm - bpm) * GLIDE;
  const beat = 60 / bpm, sixteenth = beat / 4;
  const song = mood.attract ? TITLE : STAGE;
  const own = mood.tally ? TALLY_PROG : mood.epilogue ? EPILOGUE_PROG : mood.hearing ? HEARING_PROG : null;
  const chord = own ? own[bar % own.length] : song.chords[songBar % song.chords.length];
  const root = chord[0];
  const full = (mood.danger || mood.gauntlet || mood.star) && !mood.dead;   // a star drives like danger

  const cutoff = mood.countdown ? 800 + mood.countdown * 3000
    : mood.tilted && BOARD[name] ? PEEK_CUTOFF
    : Math.min(CUTOFF_MAX, target.cutoff * (wx ? wx.cutoff : 1));
  filter.frequency.setTargetAtTime(cutoff, t, 0.2);

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
    if (s === 0 || s === 8) osc('sine', N(root - 12), t, beat * 1.9, 0.3, out.main, { attack: 0.05 });
    if (s % 4 === 2 && Math.random() < 0.75) lead(chord[(((s / 4) | 0) + bar) % chord.length] + 12, t, sixteenth * 5, 0.05);
    return;
  }

  if (mood.hearing) {
    // Hold music: pad, a lazy two-beat bass, chord tones on the off-beats, a
    // sine lead ambling down the chord, shaker on the eights. Under the booms.
    if (s === 0) pad(chord, t, beat * 4);
    if (s === 0 || s === 6) bass(root, t, beat * 1.4, false);
    if (s === 10) bass(root + 7, t, beat * 1.2, false);
    if (s === 3 || s === 11) for (const n of chord.slice(1)) osc('triangle', N(n + 12), t, sixteenth * 1.8, 0.035, out.main, { attack: 0.01 });
    if (s % 4 === 1 && Math.random() < 0.7) osc('sine', N(chord[chord.length - 1 - (((s >> 2) + bar) % chord.length)] + 24), t, sixteenth * 3.5, 0.06, out.delay, { attack: 0.01 });
    if (s % 2 === 0) shaker(t, s % 4 === 0 ? 0.06 : 0.03);
    return;
  }

  // The title plays its theme on the full band; the board plays the stage song.
  songStep(song, s, t, sixteenth, chord, full || mood.attract, wx);

  if (wx === WEATHER.rain) {
    // Falling phrases: four to six drops stepping down the scale one per sixteenth,
    // each phrase starting from a random height, then a rest of a few steps.
    // Over the song's E major bars a G drop is sharpened to G# and a C drop
    // falls to B.
    if (fig.rainLeft > 0 && fig.rainIdx >= 0) {
      const d = RAIN_SCALE[fig.rainIdx % RAIN_SCALE.length];
      const major = chord.some((n) => n % 12 === 8);
      drop(major && d % 12 === 7 ? d + 1 : major && d % 12 === 0 ? d - 1 : d, t, sixteenth, full ? 0.022 : 0.03);
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
    // Two to four pings scattered through the bar, and a whisper of the top
    // two chord tones two octaves up.
    if (s === 0) {
      const count = 2 + Math.floor(Math.random() * 3);
      fig.pings = [];
      while (fig.pings.length < count) { const at = Math.floor(Math.random() * STEPS); if (!fig.pings.includes(at)) fig.pings.push(at); }
      for (const n of chord.slice(-2)) osc('sine', N(n + 24), t, beat * 4.2, 0.016, out.main, { attack: 0.9, detune: 4 });
    }
    if (fig.pings.includes(s)) ping(chord[Math.floor(Math.random() * chord.length) % chord.length] + 36, t + Math.random() * sixteenth * 0.5, sixteenth * 0.7);
  }
}

function tick() {
  const now = ctx.currentTime;
  while (nextTime < now + LOOKAHEAD) {
    // A bumper holds the floor: the clock jumps to its end and the next song starts there on a downbeat.
    if (nextTime < holdUntil) { nextTime = holdUntil; step = 0; continue; }
    const t = Math.max(nextTime, now + 0.002);
    if (pending && step % 4 === 0) { switchTo(pending, t); pending = null; }
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
  // Flags for the song sounding; a queued song picks them up too, since the
  // board sets them every frame and the switch may be a beat away.
  setMood(m) {
    mood = { ...mood, ...m };
    if (pending) pending = { ...pending, ...m };
  },
  // Scene change: drop every flag and queue the new mood for the next beat.
  // Before the music has started there is nothing to transition from.
  reset(m = {}) {
    const next = { ...QUIET, ...m };
    if (!ctx) { mood = next; bpm = tempoFor(moodName(mood)); return; }
    pending = next;
  },
  // Weather is a property of the level, so it survives reset(). A sky id:
  // 'rain' or 'snow' colours the board moods; anything else clears it.
  setWeather(name) { weather = Object.hasOwn(WEATHER, name) ? name : null; },
  get weather() { return weather; },
  // One stage sting, now, alone: the song sounding fades as it starts, and
  // the queued song (or the same one, from the top) enters on the downbeat
  // after it.
  bumper(kind) {
    if (!ctx) return;
    const fig = BUMPERS[kind] ?? BUMPERS.day;
    const t0 = ctx.currentTime + 0.03;
    generation(t0);
    pending ??= { ...mood };
    holdUntil = t0 + Math.max(...fig.beats.map(([at, , len]) => at + len));   // the song comes in as the sting's last note ends
    fromSilence = true;
    for (const [at, note, len, voice] of fig.beats ?? []) {
      stingVoice(voice, note, t0 + at, len);
      if (fig.snare) snare(t0 + at, 0.3, stingBus);
      else kick(t0 + at, 0.35, stingBus);
    }
  },
  toggleMute() {
    muted = !muted;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.05);
    return muted;
  },
};
