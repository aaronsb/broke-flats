// Scenery themes. Each supplies: ground(lane), edge(lane, world) for the
// strip outside the playable columns, obstacle() for a blocking cell,
// shelter() for a three-wide roof whose side bays hide a coin or egg, and
// overhang(lane) for a single cell of cover that blocks nothing — a shop
// awning, a bough, a building corner on its pillar — which is what a powerup
// crate sits under (Lane.cover).
import forest from './forest.js';
import residential from './residential.js';
import city from './city.js';
import parking from './parking.js';

export const SCENERY = { forest, residential, city, parking };
