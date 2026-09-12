// How each cause of death looks and sounds. Scenarios register new causes here.
export const DEATHS = {
  car:   { anim: 'flat', title: 'SPLAT', sfx: 'splat', squash: 1.7 },
  water: { anim: 'sink', title: 'GLUB',  sfx: 'splash' },
};
export function registerDeath(cause, spec) { DEATHS[cause] = spec; }
