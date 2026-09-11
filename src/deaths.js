// How each cause of death looks and sounds. Scenarios register new causes here.
export const DEATHS = {
  car:   { anim: 'squash', title: 'SPLAT', sfx: 'splat' },
  water: { anim: 'sink',   title: 'GLUB',  sfx: 'splash' },
};
export function registerDeath(cause, spec) { DEATHS[cause] = spec; }
