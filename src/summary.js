// Cash-in panel: lines appear one at a time, each value counts up with a
// tick per step and a register ding when it lands, then the total. The game
// keeps running underneath; the crossing lets the player roam meanwhile.
import { sfx } from './sfx.js';

const STEP_MS = 55;      // per count tick
const LINE_GAP = 350;    // pause after a line lands

export class Summary {
  constructor(ui) {
    this.ui = ui;
    this.timers = [];
  }

  // lines: [{ label, count, each }] — value = count × each. onLine(value) fires as each lands.
  show(title, lines, { onLine = () => {}, done = () => {} } = {}) {
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
      later(at + steps * STEP_MS + 40, () => { if (target) sfx.register(); total += target; onLine(target); });
      at += steps * STEP_MS + LINE_GAP;
    });

    const totalRow = document.createElement('div');
    totalRow.className = 'row total';
    this.ready = false;
    this.done = done;
    later(at + 200, () => {
      totalRow.innerHTML = `<span class="label">TOTAL</span><span class="value">${total}</span>`;
      body.appendChild(totalRow);
      sfx.register();
    });
    later(at + 900, () => {
      const go = document.createElement('div');
      go.className = 'go';
      go.textContent = 'PRESS ANY KEY';
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
