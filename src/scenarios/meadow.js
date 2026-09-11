// Open grass. Interstitial between bands and the padding around hedges.
import { W } from '../lane.js';
import { randInt } from '../util.js';

export default {
  id: 'meadow',
  danger: false,
  weight: 1,
  band: [1, 2],
  build(lane, { index, count }) {
    lane.terrain();
    lane.edges();
    // The opening rows of every level carry a couple of coins to get started.
    if (count === 4 && (index === 1 || index === 2)) lane.coin(randInt(-W + 2, W - 2));
  },
};
