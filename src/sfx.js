// Tiny chiptune synth. Every effect is a preset: oscillator wave, pitch,
// optional slide or arpeggio, and an ADSR envelope.

let ctx = null;
let noiseBuf = null;

export function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noiseBuffer(c) {
  if (noiseBuf) return noiseBuf;
  const n = c.sampleRate * 0.5;
  noiseBuf = c.createBuffer(1, n, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

// Piecewise-linear ADSR in seconds; sustain is a level (0..1) held for `hold`.
function envelope(c, g, { attack = 0.005, decay = 0.04, sustain = 0.6, hold = 0.04, release = 0.08, vol = 0.1 }) {
  const t0 = c.currentTime;
  const p = g.gain;
  p.cancelScheduledValues(t0);
  p.setValueAtTime(0.0001, t0);
  p.linearRampToValueAtTime(vol, t0 + attack);
  p.linearRampToValueAtTime(vol * sustain, t0 + attack + decay);
  p.setValueAtTime(vol * sustain, t0 + attack + decay + hold);
  p.linearRampToValueAtTime(0.0001, t0 + attack + decay + hold + release);
  return attack + decay + hold + release;
}

function voice(opts) {
  try {
    const c = ac();
    const g = c.createGain();
    const dur = envelope(c, g, opts);
    const t0 = c.currentTime;
    let src;
    if (opts.wave === 'noise') {
      src = c.createBufferSource();
      src.buffer = noiseBuffer(c);
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = opts.filter || 'lowpass';
      f.frequency.setValueAtTime(opts.freq, t0);
      if (opts.slideTo) f.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
      src.connect(f).connect(g);
    } else {
      src = c.createOscillator();
      src.type = opts.wave || 'square';
      src.frequency.setValueAtTime(opts.freq, t0);
      if (opts.slideTo) src.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
      if (opts.arp) {
        // Stepped pitch changes: the classic 8-bit arpeggio.
        const step = opts.arpStep || 0.04;
        opts.arp.forEach((f, i) => src.frequency.setValueAtTime(f, t0 + step * (i + 1)));
      }
      src.connect(g);
    }
    g.connect(c.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  } catch { /* audio is optional */ }
}

const N = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI note to Hz
const vary = (v, pct = 0.15) => v * (1 + (Math.random() * 2 - 1) * pct); // random variation

// Two-part 8-bit explosion: a short "ba" click, then a low "doom" with a
// pitch drop under a lowpassed noise wash. Every call varies a little.
function boom(size = 1) {
  const dur = vary(0.45, 0.2) * size;
  voice({ wave: 'noise', freq: 3000, slideTo: 800, filter: 'highpass', attack: 0.001, decay: 0.02, sustain: 0.3, hold: 0.01, release: 0.03, vol: 0.14 });
  setTimeout(() => {
    voice({ wave: pick('sawtooth', 'square'), freq: vary(95, 0.25) / Math.sqrt(size), slideTo: 28, attack: 0.003, decay: 0.08, sustain: 0.6, hold: dur * 0.3, release: dur * 0.6, vol: 0.12 * Math.min(1.4, size) });
    voice({ wave: 'noise', freq: vary(900, 0.3), slideTo: 90, filter: 'lowpass', attack: 0.002, decay: 0.1, sustain: 0.5, hold: dur * 0.25, release: dur * 0.7, vol: 0.2 });
  }, 35);
}
const pick = (...xs) => xs[Math.floor(Math.random() * xs.length)];
const rand = (a, b) => a + Math.random() * (b - a);

// Character calls. Each is a list of [delay, spec] steps; `pitch` scales
// every frequency, so followers can chirp a baby version of the same call.
const CALLS = {
  chicken: [[0, { wave: 'square', freq: 620, slideTo: 900, attack: 0.004, decay: 0.03, sustain: 0.7, hold: 0.05, release: 0.04, vol: 0.07 }],
            [110, { wave: 'square', freq: 820, slideTo: 480, attack: 0.004, decay: 0.05, sustain: 0.6, hold: 0.1, release: 0.08, vol: 0.07 }]],
  goose:   [[0, { wave: 'sawtooth', freq: 210, slideTo: 320, attack: 0.02, decay: 0.05, sustain: 0.7, hold: 0.14, release: 0.08, vol: 0.07 }],
            [180, { wave: 'sawtooth', freq: 300, slideTo: 190, attack: 0.01, decay: 0.05, sustain: 0.6, hold: 0.1, release: 0.1, vol: 0.06 }]],
  duck:    [[0, { wave: 'sawtooth', freq: 330, slideTo: 210, attack: 0.005, decay: 0.04, sustain: 0.6, hold: 0.06, release: 0.06, vol: 0.06 }],
            [140, { wave: 'sawtooth', freq: 330, slideTo: 210, attack: 0.005, decay: 0.04, sustain: 0.6, hold: 0.06, release: 0.06, vol: 0.06 }]],
  frog:    [[0, { wave: 'square', freq: 140, slideTo: 260, attack: 0.02, decay: 0.05, sustain: 0.7, hold: 0.16, release: 0.1, vol: 0.07 }]],
  pig:     [[0, { wave: 'sawtooth', freq: 260, slideTo: 170, attack: 0.01, decay: 0.05, sustain: 0.6, hold: 0.08, release: 0.06, vol: 0.06 }]],
  cat:     [[0, { wave: 'triangle', freq: 720, slideTo: 460, attack: 0.03, decay: 0.1, sustain: 0.7, hold: 0.2, release: 0.15, vol: 0.07 }]],
  robot:   [[0, { wave: 'square', freq: 880, attack: 0.002, decay: 0.02, sustain: 0.6, hold: 0.05, release: 0.02, vol: 0.05 }],
            [90, { wave: 'square', freq: 1175, attack: 0.002, decay: 0.02, sustain: 0.6, hold: 0.07, release: 0.03, vol: 0.05 }]],
};

export function call(name, pitch = 1) {
  for (const [delay, spec] of CALLS[name] ?? []) {
    const v = { ...spec, freq: vary(spec.freq, 0.1) * pitch };
    if (spec.slideTo) v.slideTo = spec.slideTo * pitch;
    if (pitch > 1) { v.hold *= 0.7; v.release *= 0.7; }
    setTimeout(() => voice(v), delay / (pitch > 1 ? 1.4 : 1));
  }
}

export const voices = Object.fromEntries(Object.keys(CALLS).map((k) => [k, (pitch = 1) => call(k, pitch)]));

export const sfx = {
  unlock: () => ac(),
  boom,
  tick: () => voice({ wave: 'square', freq: N(84), attack: 0.002, decay: 0.02, sustain: 0.3, hold: 0.02, release: 0.04, vol: 0.05 }),
  // Coin drop into the slot: two bright metallic blips.
  clink: () => { voice({ wave: 'square', freq: N(91), attack: 0.002, decay: 0.03, sustain: 0.4, hold: 0.03, release: 0.05, vol: 0.06 });
                 setTimeout(() => voice({ wave: 'square', freq: N(96), attack: 0.002, decay: 0.04, sustain: 0.5, hold: 0.06, release: 0.08, vol: 0.06 }), 70); },
  // Ascending-soul chime: a slow descending triangle arpeggio with a shimmer.
  halo: () => { [84, 79, 76, 72].forEach((n, i) => setTimeout(() => voice({ wave: 'triangle', freq: N(n), attack: 0.01, decay: 0.05, sustain: 0.7, hold: 0.18, release: 0.25, vol: 0.06 }), i * 170));
                voice({ wave: 'sine', freq: N(96), slideTo: N(100), attack: 0.2, decay: 0.2, sustain: 0.5, hold: 0.4, release: 0.4, vol: 0.03 }); },
  // Train horn: two-tone sawtooth chord, twice.
  horn: () => { for (const d of [0, 420]) setTimeout(() => { voice({ wave: 'sawtooth', freq: N(57), attack: 0.03, decay: 0.05, sustain: 0.8, hold: 0.25, release: 0.12, vol: 0.07 });
                                                              voice({ wave: 'sawtooth', freq: N(61), attack: 0.03, decay: 0.05, sustain: 0.8, hold: 0.25, release: 0.12, vol: 0.05 }); }, d); },
  // Wheels on rails: a long lowpassed noise rumble.
  rumble: () => voice({ wave: 'noise', freq: 260, slideTo: 180, filter: 'lowpass', attack: 0.2, decay: 0.3, sustain: 0.8, hold: 1.6, release: 0.8, vol: 0.1 }),
  // Jet whoosh: a bandpassed noise sweep, rising for take-off, falling for landing.
  jet: (up = true) => voice({ wave: 'noise', freq: up ? 300 : 2200, slideTo: up ? 2600 : 350, filter: 'bandpass', attack: 0.12, decay: 0.2, sustain: 0.7, hold: 0.35, release: 0.5, vol: 0.09 }),
  // Structural crack: a sharp noise snap over a low thud.
  crack: () => { voice({ wave: 'noise', freq: vary(2400, 0.2), slideTo: 400, filter: 'bandpass', attack: 0.001, decay: 0.03, sustain: 0.4, hold: 0.02, release: 0.08, vol: 0.12 });
                 voice({ wave: 'square', freq: vary(70, 0.2), slideTo: 40, attack: 0.002, decay: 0.05, sustain: 0.5, hold: 0.06, release: 0.12, vol: 0.08 }); },
  // Smoke whoosh: a lowpassed noise swell that sinks.
  puff: () => voice({ wave: 'noise', freq: vary(700, 0.2), slideTo: 160, filter: 'lowpass', attack: 0.04, decay: 0.1, sustain: 0.6, hold: 0.12, release: 0.3, vol: 0.09 }),
  // Fire crackle: a handful of tiny bright noise ticks at random times.
  crackle: () => { for (let i = 0; i < 5; i++) setTimeout(() => voice({ wave: 'noise', freq: vary(3500, 0.3), filter: 'highpass', attack: 0.001, decay: 0.01, sustain: 0.3, hold: 0.005, release: 0.02, vol: 0.05 }), rand(40, 520)); },
  // "Dee-doo" confirmation chime.
  confirm: () => { voice({ wave: 'square', freq: N(76), attack: 0.003, decay: 0.03, sustain: 0.7, hold: 0.08, release: 0.06, vol: 0.07 });
                   setTimeout(() => voice({ wave: 'square', freq: N(83), attack: 0.003, decay: 0.03, sustain: 0.7, hold: 0.16, release: 0.12, vol: 0.07 }), 130); },
  plink: () => voice({ wave: 'triangle', freq: vary(1500, 0.12), slideTo: 650, attack: 0.001, decay: 0.03, sustain: 0.3, hold: 0.01, release: 0.05, vol: 0.06 }),
  hop: () => voice({ wave: 'square', freq: vary(N(72), 0.03), slideTo: N(79), attack: 0.002, decay: 0.03, sustain: 0.4, hold: 0.01, release: 0.05, vol: 0.06 }),
  bump: () => voice({ wave: 'square', freq: N(45), slideTo: N(40), attack: 0.002, decay: 0.05, sustain: 0.3, hold: 0.02, release: 0.06, vol: 0.07 }),
  coin: () => voice({ wave: 'square', freq: N(88), arp: [N(93), N(93), N(93)], arpStep: 0.06, attack: 0.002, decay: 0.05, sustain: 0.7, hold: 0.12, release: 0.12, vol: 0.07 }),
  hatch: () => voice({ wave: 'square', freq: N(84), arp: [N(88), N(91), N(96)], arpStep: 0.05, attack: 0.002, decay: 0.03, sustain: 0.7, hold: 0.12, release: 0.1, vol: 0.07 }),
  tilt: () => voice({ wave: 'triangle', freq: N(60), arp: [N(64), N(67), N(72)], arpStep: 0.035, attack: 0.005, decay: 0.03, sustain: 0.8, hold: 0.1, release: 0.1, vol: 0.08 }),
  splat: () => {
    voice({ wave: 'noise', freq: 2500, slideTo: 200, attack: 0.002, decay: 0.08, sustain: 0.5, hold: 0.05, release: 0.2, vol: 0.18 });
    voice({ wave: 'sawtooth', freq: N(50), slideTo: N(31), attack: 0.002, decay: 0.1, sustain: 0.5, hold: 0.1, release: 0.25, vol: 0.09 });
  },
  splash: () => {
    voice({ wave: 'noise', freq: 900, slideTo: 3500, filter: 'bandpass', attack: 0.01, decay: 0.15, sustain: 0.5, hold: 0.1, release: 0.35, vol: 0.14 });
    voice({ wave: 'sine', freq: N(64), slideTo: N(45), attack: 0.01, decay: 0.1, sustain: 0.6, hold: 0.1, release: 0.3, vol: 0.08 });
  },
  over: () => voice({ wave: 'square', freq: N(64), arp: [N(60), N(57), N(52)], arpStep: 0.16, attack: 0.005, decay: 0.05, sustain: 0.7, hold: 0.55, release: 0.25, vol: 0.07 }),
  start: () => voice({ wave: 'square', freq: N(60), arp: [N(64), N(67), N(72), N(76)], arpStep: 0.07, attack: 0.005, decay: 0.03, sustain: 0.7, hold: 0.3, release: 0.15, vol: 0.07 }),
};
