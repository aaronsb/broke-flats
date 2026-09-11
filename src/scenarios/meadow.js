// Open grass. Interstitial between bands and the padding around hedges.
export default {
  id: 'meadow',
  danger: false,
  weight: 1,
  band: [1, 2],
  build(lane) {
    lane.terrain();
    lane.edges();
  },
};
