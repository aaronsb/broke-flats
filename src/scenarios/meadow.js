// Open grass. Interstitial between bands and the padding around hedges.
export default {
  id: 'meadow',
  danger: false,
  weight: 1,
  band: [1, 2],
  build(lane) {
    lane.ground(lane.r % 2 ? 0x9ad24a : 0x8fca43);
    lane.forestEdges();
  },
};
