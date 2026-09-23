// The tunes, as data. Each bar is sixteen tokens: a note name starts a note,
// '-' holds it, '.' rests. Chords are MIDI note arrays, lowest first; the
// band in music.js arranges both, so nothing here makes a sound.

export const STEPS = 16;

export function parseBar(src) {
  const tokens = src.trim().split(/\s+/);
  if (tokens.length !== STEPS) throw new Error(`song bar needs ${STEPS} steps: ${src}`);
  const out = new Array(STEPS).fill(null);
  let open = null;
  tokens.forEach((tok, i) => {
    if (tok === '-') {
      if (!open) throw new Error(`song hold with no note before it: ${src}`);
      open[1]++;
      return;
    }
    open = null;
    if (tok === '.') return;
    const m = /^([A-G])(#?)(\d)$/.exec(tok);
    if (!m) throw new Error(`bad song token '${tok}' in: ${src}`);
    const pc = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0);
    out[i] = open = [12 * (+m[3] + 1) + pc, 1];
  });
  return out;
}

const CHORD = { C: [60, 64, 67], Am: [57, 60, 64], G: [55, 59, 62], F: [53, 57, 60], E: [52, 56, 59] };
const song = (chords, lead) => ({ chords: chords.split(' ').map((c) => CHORD[c]), lead: lead.map(parseBar) });

// The stage song: sixteen bars in A minor that run under the whole board.
// A: a figure sequenced down a step, a run up, then the answer in dotted
// eighths. B: stabbed repeats, a climb, and a turnaround on E.
export const STAGE = song('Am G F G Am G F E F G Am Am F G E E', [
  'E5 - - A5 - - B5 - C6 - B5 - A5 - E5 -',
  'D5 - - G5 - - A5 - B5 - A5 - G5 - D5 -',
  'C5 - - F5 - - G5 - A5 - - - C6 - A5 -',
  'B5 - - - - - - - G5 - A5 - B5 - D6 -',
  'E6 - - D6 - - C6 - B5 - C6 - - A5 - -',
  'D6 - - C6 - - B5 - A5 - B5 - - G5 - -',
  'C6 - - B5 - - A5 - G5 - A5 - C6 - F6 -',
  'E6 - - - - - - - D6 C6 B5 A5 G#5 A5 B5 G#5',
  'A5 - . A5 - . A5 - G5 - A5 - C6 - . .',
  'B5 - . B5 - . B5 - A5 - B5 - D6 - . .',
  'C6 - - - B5 - - - A5 - - - E5 - - -',
  'E5 - A5 - C6 - E6 - D6 C6 B5 A5 G5 A5 B5 C6',
  'D6 - - C6 - - A5 - - - - - C6 - D6 -',
  'D6 - - B5 - - G5 - - - - - B5 - D6 -',
  'E6 - - - D6 - - - B5 - - - G#5 - - -',
  'B5 - - - - - - - E5 - G#5 - B5 - D6 -',
]);

// The title theme: eight bars in C, bright where the stage song is urgent.
// A rising call, its answer falling back through A minor, and a held G
// that sets up the loop.
export const TITLE = song('C Am F G C Am F G', [
  'G5 - - C6 - - E6 - D6 - C6 - D6 - E6 -',
  'C6 - - A5 - - E5 - A5 - B5 - C6 - - -',
  'A5 - - C6 - - F6 - E6 - D6 - C6 - A5 -',
  'B5 - - - D6 - - - G5 - A5 - B5 - D6 -',
  'E6 - - - G6 - - - E6 - D6 - C6 - - -',
  'A5 - - C6 - - E6 - D6 - C6 - B5 - A5 -',
  'F5 - A5 - C6 - F6 - E6 - - D6 - - C6 -',
  'D6 - - - B5 - - - G5 - - - - - . .',
]);

// Triangle bass figures, step -> semitones above the root an octave down.
// drive: octave bounce on the eighths with a gallop into the last beat.
// stroll: root and octave on the beats with a fifth picking up the third.
export const BASS = {
  drive: { 0: 0, 2: 12, 4: 0, 6: 12, 8: 0, 10: 12, 11: 0, 12: 12, 14: 0, 15: 12 },
  stroll: { 0: 0, 4: 12, 8: 0, 11: 7, 12: 12 },
};
