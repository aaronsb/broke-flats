export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (...xs) => xs[Math.floor(Math.random() * xs.length)];
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
// Frame-rate independent smoothing factor.
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
