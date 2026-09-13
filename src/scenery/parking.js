// Asphalt lot: painted bays, a fence line, and parked cars on both sides.
import { makeFence, makeParkedCar, makeParkingStripe, makeCanopy, makePlanter, makeCarport } from '../meshes.js';
import { W, DETAIL_W } from '../lane.js';

export default {
  id: 'parking',
  ground(lane) {
    lane.ground(0x5a5a62);
    for (let x = -DETAIL_W / 2 + 0.5; x < DETAIL_W / 2; x += 1) lane.add(makeParkingStripe(), x);
  },
  edge(lane) {
    for (const s of [-1, 1]) {
      lane.add(makeFence(), s * (W + 1));
      for (let c = W + 2; c <= W + 7; c++) if (Math.random() < 0.6) lane.add(makeParkedCar(), s * c);
    }
  },
  obstacle: () => (Math.random() < 0.8 ? makeParkedCar() : makePlanter()),
  shelter: () => makeCanopy(makeParkedCar(), 0x2f3f6a),
  overhang: () => makeCarport(0x2f3f6a),
};
