import { makeTree, makeUmbrellaTree, makeBoughTree } from '../meshes.js';
import { W } from '../lane.js';
import { rand } from '../util.js';

export default {
  id: 'forest',
  ground(lane) { lane.ground(lane.r % 2 ? 0x9ad24a : 0x8fca43); },
  edge(lane) {
    // The first column out is always filled: that one is the wall you can see,
    // and a gap in it is an invisible fence again. The rest thins out behind.
    for (const s of [-1, 1]) lane.add(makeTree(true), s * (W + 1) + rand(-0.15, 0.15));
    for (let c = W + 2; c <= W + 7; c++) {
      for (const s of [-1, 1]) if (Math.random() < 0.75) lane.add(makeTree(true), s * c + rand(-0.15, 0.15));
    }
  },
  obstacle: () => makeTree(),
  shelter: () => makeUmbrellaTree(),
  overhang: () => makeBoughTree(),
};
