// The grievance report: lines appear one at a time, each value counts up with
// a tick per step and a register ding when it lands, then the total. Then the
// panel cocks on the desk, a rubber stamp comes down on it, and a ruling may
// follow. The game keeps running underneath; the crossing lets the player
// roam meanwhile.
import { sfx } from './sfx.js';
import { makeSeal, mountSign } from './logo.js';

const STEP_MS = 55;      // per count tick
const LINE_GAP = 350;    // pause after a line lands
const STAMP_MS = 190;    // per witness stamp
const COCK_AFTER = 500;  // ms after the total lands before the panel cocks
const STAMP_AFTER = 300; // ms after the cock before the stamp comes down
const RULING_AFTER = 650; // ms after the stamp before the ruling lands
const GO_AFTER = 700;    // ms after the last beat before ENTER TO CONTINUE
const SHAKE_MS = 250;
const CONFETTI = 22;
const CONFETTI_MS = 1200;
const INKS = ['#ffd23f', '#e0392e', '#4a7fc1', '#6fbf52', '#f4f2e4', '#d9702a'];

export const HEADER = 'DEPARTMENT OF PEDESTRIAN GRIEVANCES';

export class Summary {
  constructor(ui) {
    this.ui = ui;
    this.timers = [];
    this.loose = [];      // stamp and confetti elements to sweep on clear
    this.frame();
  }

  // The fixed furniture around the title: header line above, quip line below,
  // the seal in the top-right corner with the town sign small beside it.
  frame() {
    const panel = this.ui.summary;
    if (!panel || panel.querySelector('.header')) return;
    this.header = document.createElement('div');
    this.header.className = 'header';
    panel.insertBefore(this.header, this.ui.summaryTitle);
    this.quip = document.createElement('div');
    this.quip.className = 'quip';
    this.ui.summaryTitle.after(this.quip);
    const seal = document.createElement('div');
    seal.className = 'seal';
    seal.appendChild(makeSeal());
    const mark = document.createElement('div');
    mark.className = 'mark';
    mountSign(mark);
    seal.appendChild(mark);
    panel.appendChild(seal);
  }

  // lines: [{ label, count, each }] — value = count × each. The total is scaled by
  // `mul` (shown as its own line when it is not 1) and by the witness stamps,
  // then handed to onTotal once, bonus included. stamps: { count, image(i) →
  // data URL or null, each } — every stamp adds `each` to a multiplier that
  // starts at 1. stamp: text for the red stamp that lands after the total.
  // ruling: { text, bonus } — a second stamp a beat later; a bonus counts onto
  // the total with a fanfare and confetti.
  show(title, lines, { header = HEADER, quip = null, stamp = null, ruling = null, mul = 1, stamps = null, onTotal = () => {}, done = () => {} } = {}) {
    this.clear();
    const panel = this.ui.summary;
    panel.classList.add('show');
    if (this.header) this.header.textContent = header;
    this.ui.summaryTitle.textContent = title;
    if (this.quip) { this.quip.textContent = quip ?? ''; this.quip.hidden = !quip; }
    const body = this.ui.summaryBody;
    body.innerHTML = '';
    let total = 0;
    let at = 0;
    const later = (ms, fn) => this.timers.push(setTimeout(fn, ms));

    lines.forEach((ln) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<span class="label">${ln.label}${ln.count !== undefined ? ` ×${ln.count}` : ''}</span><span class="value">0</span>`;
      const value = row.querySelector('.value');
      const target = (ln.count ?? 1) * (ln.each ?? 0);
      const steps = Math.min(24, Math.max(1, Math.abs(target)));
      later(at, () => { body.appendChild(row); });
      for (let i = 1; i <= steps; i++) {
        const v = Math.round((target * i) / steps);
        later(at + i * STEP_MS, () => { value.textContent = v; if (target) sfx.tick(); });
      }
      later(at + steps * STEP_MS + 40, () => { if (target) sfx.register(); total += target; });
      at += steps * STEP_MS + LINE_GAP;
    });

    let fmul = 1;
    if (stamps?.count) {
      const { count, image = () => null, each = 0.5 } = stamps;
      const row = document.createElement('div');
      row.className = 'row stamps';
      row.innerHTML = '<span class="label">WITNESSES <span class="strip"></span></span><span class="value">×1.0</span>';
      const strip = row.querySelector('.strip');
      const value = row.querySelector('.value');
      later(at, () => { body.appendChild(row); });
      for (let i = 0; i < count; i++) {
        later(at + LINE_GAP + i * STAMP_MS, () => {
          const url = image(i);
          const el = document.createElement(url ? 'img' : 'span');
          el.className = 'stamp';
          el.style.setProperty('--i', i);
          if (url) el.src = url; else el.textContent = '●';
          strip.appendChild(el);
          fmul = 1 + (i + 1) * each;
          value.textContent = `×${fmul.toFixed(1)}`;
          sfx.tick(); sfx.doot(Math.min(i, 14));
        });
      }
      later(at + LINE_GAP + count * STAMP_MS + 40, () => { sfx.register(); });
      at += LINE_GAP + count * STAMP_MS + LINE_GAP;
    }

    if (mul !== 1) {
      const row = document.createElement('div');
      row.className = 'row';
      later(at, () => {
        row.innerHTML = `<span class="label">${mul < 1 ? 'PROCESSING FEE' : 'HARDSHIP ALLOWANCE'}</span><span class="value">×${mul.toFixed(2)}</span>`;
        body.appendChild(row);
        sfx.tick();
      });
      at += LINE_GAP;
    }

    const totalRow = document.createElement('div');
    totalRow.className = 'row total';
    this.ready = false;
    this.done = done;
    let scaled = 0;
    let totalValue = null;
    at += 200;
    later(at, () => {
      scaled = Math.round(total * mul * fmul);
      totalRow.innerHTML = `<span class="label">TOTAL</span><span class="value">${scaled}</span>`;
      totalValue = totalRow.querySelector('.value');
      body.appendChild(totalRow);
      sfx.register();
    });

    // The stamp: the panel cocks with a kathunk, then the red stamp comes down.
    if (stamp) {
      at += COCK_AFTER;
      later(at, () => { panel.classList.add('cocked'); sfx.kathunk(); });
      at += STAMP_AFTER;
      later(at, () => { this.slam(stamp, 'filed'); });
    }

    // The ruling: a second stamp a beat later, with a bonus counted onto the total.
    const bonus = ruling?.bonus > 0 ? Math.round(ruling.bonus) : 0;
    if (ruling?.text) {
      at += RULING_AFTER;
      later(at, () => { this.slam(ruling.text, 'ruling', !bonus); });
      if (bonus) {
        at += 250;
        const row = document.createElement('div');
        row.className = 'row bonus';
        row.innerHTML = `<span class="label">${ruling.text} BONUS</span><span class="value">0</span>`;
        const value = row.querySelector('.value');
        later(at, () => { body.insertBefore(row, totalRow); sfx.fanfare(); this.celebrate(); });
        const steps = 12;
        for (let i = 1; i <= steps; i++) {
          const v = Math.round((bonus * i) / steps);
          later(at + i * STEP_MS, () => { value.textContent = v; if (totalValue) totalValue.textContent = scaled + v; sfx.tick(); });
        }
        at += steps * STEP_MS + 40;
        later(at, () => { sfx.register(); });
      }
    }

    at += GO_AFTER;
    later(at, () => {
      onTotal(scaled + bonus);
      const go = document.createElement('div');
      go.className = 'go';
      go.textContent = 'ENTER TO CONTINUE';
      body.appendChild(go);
      this.ready = true;
    });
    return at;
  }

  // A rubber stamp comes down on the panel and the desk thumps under it.
  slam(text, kind, quiet = false) {
    const panel = this.ui.summary;
    const el = document.createElement('div');
    el.className = `rubber ${kind}`;
    el.textContent = text;
    panel.appendChild(el);
    this.loose.push(el);
    if (quiet) sfx.tick(); else sfx.kerchunk();
    panel.classList.remove('shake');
    void panel.offsetWidth;   // restart the animation if one just ran
    panel.classList.add('shake');
    this.timers.push(setTimeout(() => panel.classList.remove('shake'), SHAKE_MS));
  }

  // Confetti puffs from both edges and the witness stamps bounce.
  celebrate() {
    const panel = this.ui.summary;
    panel.classList.add('cheer');
    const bits = [];
    for (let i = 0; i < CONFETTI; i++) {
      const b = document.createElement('i');
      b.className = 'confetti';
      const left = i % 2 === 0;
      b.style.left = left ? '-6px' : 'auto';
      b.style.right = left ? 'auto' : '-6px';
      b.style.top = `${10 + Math.random() * 80}%`;
      b.style.background = INKS[i % INKS.length];
      b.style.setProperty('--dx', `${(left ? 1 : -1) * (40 + Math.random() * 120)}px`);
      b.style.setProperty('--dy', `${60 + Math.random() * 140}px`);
      b.style.animationDelay = `${Math.random() * 120}ms`;
      panel.appendChild(b);
      bits.push(b);
    }
    this.loose.push(...bits);
    this.timers.push(setTimeout(() => { for (const b of bits) b.remove(); panel.classList.remove('cheer'); }, CONFETTI_MS));
  }

  // The player dismisses the panel once the total is up.
  confirm() {
    if (!this.ready) return false;
    const d = this.done;
    this.clear();
    sfx.confirm();
    d?.();
    return true;
  }

  clear() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    for (const el of this.loose) el.remove();
    this.loose = [];
    this.ready = false;
    this.done = null;
    this.ui.summary.classList.remove('show', 'cocked', 'shake', 'cheer');
  }
}
