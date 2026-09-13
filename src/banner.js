// The stage banner: a sign drops over the board, holds a few seconds with a
// bumper tune, then clears into play. Invoked from a mode's enter() the way
// the summary is; input is swallowed while it is up, and Enter, Space or a
// tap after SKIP_AFTER dismisses it early. The game runs on underneath.
import { sfx } from './sfx.js';
import { music } from './music.js';
import { makeBanner } from './logo.js';

const SKIP_AFTER = 600;   // ms before a key or tap may dismiss the sign
const OUT_MS = 320;       // the exit fade
// Hit sounds at the entrance's landing beats, ms from mount, per sign look.
const HITS = {
  day: [[430, 'slam']],
  gauntlet: [[380, 'kathunk']],
  mines: [[380, 'kathunk'], [900, 'kerchunk']],
  maze: [[380, 'kathunk']],
  hearing: [[420, 'kathunk'], [900, 'kerchunk']],
};
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Banner {
  constructor(ui) {
    this.ui = ui;
    this.timers = [];
    this.kind = null;
    this.done = null;
    this.since = 0;
  }

  get up() { return this.kind !== null; }

  // kind: day | gauntlet | hearing. variant picks the gauntlet's board (mines,
  // maze); advisory hangs the weather placard under the day sign. tune: false
  // drops the bumper (a retry after a death). done() fires when the exit starts.
  show(kind, { title, sub, variant = null, advisory = null, ms = 2600, tune = true, done = null } = {}) {
    this.clear();
    const layer = this.ui.banner;
    if (!layer) { done?.(); return; }
    this.kind = kind;
    this.done = done;
    this.since = performance.now();
    layer.innerHTML = '';
    layer.dataset.kind = kind;
    layer.appendChild(makeBanner(kind, { title, sub, variant, advisory }));
    layer.hidden = false;
    requestAnimationFrame(() => { if (this.kind === kind) layer.classList.add('show'); });
    if (!still()) for (const [at, hit] of HITS[variant ?? kind] ?? HITS.day) this.later(() => sfx[hit]?.(), at);
    if (tune) music.bumper(kind);
    this.later(() => this.finish(), ms);
  }

  // Early dismissal, once the sign has had a moment to land.
  skip() {
    if (!this.up || performance.now() - this.since < SKIP_AFTER) return false;
    this.finish();
    return true;
  }

  // The exit: the layer fades, input flows again at once, done() fires.
  finish() {
    const d = this.done;
    const layer = this.ui.banner;
    this.stop();
    layer.classList.remove('show');
    layer.classList.add('out');
    this.later(() => { layer.hidden = true; layer.classList.remove('out'); layer.innerHTML = ''; }, OUT_MS);
    d?.();
  }

  // Cancel everything and drop the layer at once (a mode change).
  clear() {
    this.stop();
    const layer = this.ui.banner;
    if (!layer) return;
    layer.classList.remove('show', 'out');
    layer.hidden = true;
    layer.innerHTML = '';
  }

  stop() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.kind = null;
    this.done = null;
  }

  later(fn, ms) { this.timers.push(setTimeout(fn, ms)); }
}
