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

export const sfx = {
  unlock: () => ac(),
  hop: () => voice({ wave: 'square', freq: N(72), slideTo: N(79), attack: 0.002, decay: 0.03, sustain: 0.4, hold: 0.01, release: 0.05, vol: 0.06 }),
  bump: () => voice({ wave: 'square', freq: N(45), slideTo: N(40), attack: 0.002, decay: 0.05, sustain: 0.3, hold: 0.02, release: 0.06, vol: 0.07 }),
  coin: () => voice({ wave: 'square', freq: N(88), arp: [N(93), N(93), N(93)], arpStep: 0.06, attack: 0.002, decay: 0.05, sustain: 0.7, hold: 0.12, release: 0.12, vol: 0.07 }),
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
