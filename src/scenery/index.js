// Scenery themes. Each supplies: ground(lane), edge(lane, world) for the
// strip outside the playable columns, obstacle() for a blocking cell, and
// shelter() for a three-wide roof whose side bays hide a coin or egg.
import forest from './forest.js';
import residential from './residential.js';
import city from './city.js';
import parking from './parking.js';

export const SCENERY = { forest, residential, city, parking };
