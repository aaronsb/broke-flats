// On-screen controls for touch devices. Buttons synthesize the same key
// events the keyboard handlers listen for, so every mode works unchanged.
// Shown only when the pointer is coarse (or ?touch=1 for testing).

const BUTTONS = [
  { code: 'ArrowLeft', key: 'ArrowLeft', label: '◀', cls: 'pad l' },
  { code: 'ArrowUp', key: 'ArrowUp', label: '▲', cls: 'pad u' },
  { code: 'ArrowDown', key: 'ArrowDown', label: '▼', cls: 'pad d' },
  { code: 'ArrowRight', key: 'ArrowRight', label: '▶', cls: 'pad r' },
  { code: 'Space', key: ' ', label: 'A', cls: 'act a', title: 'peek / fire / start' },
  { code: 'ShiftLeft', key: 'Shift', label: 'B', cls: 'act b', title: 'aim' },
  { code: 'KeyC', key: 'c', label: '¢', cls: 'act c', title: 'coin' },
  { code: 'Enter', key: 'Enter', label: '⏎', cls: 'act s', title: 'start / resume' },
  // Minefield only: hopping already sets your facing, but turning in place is
  // the whole point there — stepping somewhere to look at it is how you die.
  { code: 'KeyQ', key: 'q', label: '↺', cls: 'mine q', title: 'turn left' },
  { code: 'KeyF', key: 'f', label: '⚑', cls: 'mine f', title: 'flag the cell you face' },
  { code: 'KeyE', key: 'e', label: '↻', cls: 'mine e', title: 'turn right' },
  // Goose only: the honk that moves stalled traffic on.
  { code: 'KeyH', key: 'h', label: 'H', cls: 'perk honk', title: 'honk' },
];

export function wantsTouch() {
  return new URLSearchParams(location.search).has('touch')
    || matchMedia('(pointer: coarse)').matches
    || matchMedia('(any-pointer: coarse)').matches
    || navigator.maxTouchPoints > 0
    || 'ontouchstart' in window;
}

let installed = false;

// Build the bar now if the device looks touch-driven; otherwise wait for the
// first real touch and build it then (device emulation and hybrids).
export function installTouch(root) {
  if (wantsTouch()) return build(root);
  const onTouch = (e) => { if (e.pointerType && e.pointerType !== 'touch') return; build(root); };
  addEventListener('touchstart', onTouch, { once: true, passive: true });
  addEventListener('pointerdown', onTouch, { once: true });
  return false;
}

function build(root) {
  if (installed) return true;
  installed = true;
  document.body.classList.add('touch');
  const bar = document.createElement('div');
  bar.id = 'touchbar';
  for (const b of BUTTONS) {
    const el = document.createElement('button');
    el.className = b.cls;
    el.textContent = b.label;
    if (b.title) el.title = b.title;
    const send = (type) => window.dispatchEvent(new KeyboardEvent(type, { code: b.code, key: b.key, bubbles: true }));
    let down = false;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); down = true; el.classList.add('down'); send('keydown'); });
    const up = (e) => { if (!down) return; down = false; el.classList.remove('down'); send('keyup'); e?.preventDefault?.(); };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    bar.appendChild(el);
  }
  root.appendChild(bar);
  return true;
}
