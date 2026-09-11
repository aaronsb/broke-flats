---
name: add-scenario
description: Add a new band type (a crossing scenario such as a road, river, rail or hazard maze) to road-crosser end to end, from the scenario module through sequencer weights, debug keys, the smoke harness, the playtest doc and screenshots. Use when asked to add a lane type, crossing type, hazard, obstacle row, maze band or scenario.
allowed-tools: Bash, Read, Edit, Write, Grep, Glob
---

# Add a scenario

A scenario is one module in `src/scenarios/` exporting a plain object. The board (`src/world.js`) only knows the contract, documented at the top of `src/scenarios/index.js`.

## Checklist

1. **Module** `src/scenarios/<id>.js` exporting `{ id, danger, weight, band, build(lane, ctx) }` plus whatever hooks apply:
   - `update(lane, dt, time)` per frame (call `lane.advance(dt)` for wrap-around movers).
   - `lethalAt(lane, x, player)` returns a death cause, `'bounce'` for a bumper, or `null`.
   - `onLand(lane, player)` returns a death cause, `'bounce'`, or sets `player.carrier`.
   - `blockedFrom(lane, c, fromRow)` / `blockedExit(lane, c, toRow)` for direction-dependent blocking.
   - Sequencer hints: `pad`, `minGap`, `keepGap`, `flank` (see the contract).
   - `ctx` gives `world`, `index`, `count`, `prev`, `sky` (`sky.dark`, `sky.headlights`), `difficulty`, `gauntlet`.
2. **Lane helpers** (`src/lane.js`): `terrain()`, `edges()`, `ground(color)`, `block(c)`, `coin(c)`, `egg(c)`, `bonusDrop()`, `spawnSpaced(n, make, traffic(difficulty))`, `moverAt`, `onBed`, `rearOf`, `riding`. Movers are `{ mesh, len, x, v }` with optional `bed`/`beds`, `rideY`, `offCause`, `wing`, `diver`, `staller`.
3. **Deaths**: `registerDeath('cause', { anim: 'flat' | 'sink' | 'launch', title, sfx })` in the module (see `src/deaths.js`).
4. **Meshes** go in `src/meshes.js`, unlit lamps use `HEADLAMP`/`TAILLAMP`/`navRed`/`navGreen`, beams via `makeHeadlightCone` and an emitter in `CrossingMode.emitters()` when `sky.headlights`.
5. **Register** in `src/scenarios/index.js` and give it weights in `src/levels.js`. Danger scenarios count toward the level's band quota.
6. **Difficulty**: scale speed and spacing through `traffic(difficulty)` from `src/tuning.js`.
7. **Debug key**: add to `FORCE` in `src/debug.js` and the panel text.
8. **Sound**: presets live in `src/sfx.js`; gate distant sounds with `Math.abs(lane.r - lane.world.focusRow) <= 7`.
9. **Harness**: add a smoke scenario in `scripts/smoke.mjs` that forces the scenario and asserts its mechanic, plus a screenshot line in the `shots` branch if it has a distinct look. Add the name to the Makefile help line.
10. **Docs**: `make playtest-doc` regenerates `docs/playtest.md` (the new scenario appears automatically); `make shots` refreshes `docs/screenshots.md`.
11. **Verify** with the `verify-game` skill, then commit.

## Conventions

- Rows are one unit deep along z; row `r` sits at `z = -r`. Forward is `-z`. Movers travel along x and wrap at `±SPAN`.
- Keep hidden-from-above things behind roofs or under canopies and set `lane.data.hidden = true` so the TILT hint fires.
- Say-it-once comments: one line on what a block is for, no restating the code.
