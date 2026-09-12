// Cash-in panel: lines appear one at a time, each value counts up with a
// tick per step and a register ding when it lands, then the total. The game
// keeps running underneath; the crossing lets the player roam meanwhile.
import { sfx } from './sfx.js';

const STEP_MS = 55;      // per count tick
const LINE_GAP = 350;    // pause after a line lands
const STAMP_MS = 190;    // per follower stamp

export class Summary {
  constructor(ui) {
    this.ui = ui;
    this.timers = [];
  }

  // lines: [{ label, count, each }] — value = count × each. The total is scaled by
  // `mul` (shown as its own line when it is not 1) and by the follower stamps,
  // then handed to onTotal once. stamps: { count, image(i) → data URL or null,
  // each } — every stamp adds `each` to a multiplier that starts at 1.
  show(title, lines, { mul = 1, stamps = null, onTotal = () => {}, done = () => {} } = {}) {
    this.clear();
    this.ui.summary.classList.add('show');
    this.ui.summaryTitle.textContent = title;
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
      row.innerHTML = '<span class="label">FLOCK <span class="strip"></span></span><span class="value">×1.0</span>';
      const strip = row.querySelector('.strip');
      const value = row.querySelector('.value');
      later(at, () => { body.appendChild(row); });
      for (let i = 0; i < count; i++) {
        later(at + LINE_GAP + i * STAMP_MS, () => {
          const url = image(i);
          const el = document.createElement(url ? 'img' : 'span');
          el.className = 'stamp';
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
        row.innerHTML = `<span class="label">${mul < 1 ? 'PERK HANDICAP' : 'BONUS'}</span><span class="value">×${mul.toFixed(2)}</span>`;
        body.appendChild(row);
        sfx.tick();
      });
      at += LINE_GAP;
    }

    const totalRow = document.createElement('div');
    totalRow.className = 'row total';
    this.ready = false;
    this.done = done;
    later(at + 200, () => {
      const scaled = Math.round(total * mul * fmul);
      totalRow.innerHTML = `<span class="label">TOTAL</span><span class="value">${scaled}</span>`;
      body.appendChild(totalRow);
      sfx.register();
      onTotal(scaled);
    });
    later(at + 900, () => {
      const go = document.createElement('div');
      go.className = 'go';
      go.textContent = 'ENTER TO CONTINUE';
      body.appendChild(go);
      this.ready = true;
    });
    return at + 900;
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
    this.ready = false;
    this.done = null;
    this.ui.summary.classList.remove('show');
  }
}
