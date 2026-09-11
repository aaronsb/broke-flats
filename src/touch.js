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
];

export function wantsTouch() {
  return new URLSearchParams(location.search).has('touch') || matchMedia('(pointer: coarse)').matches;
}

export function installTouch(root) {
  if (!wantsTouch()) return false;
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
