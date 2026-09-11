---
name: verify-game
description: Build, smoke-test and visually verify road-crosser after a change using the headless Chrome harness (make smoke, make shots) and by reading the screenshots. Use after editing anything under src/, when asked to verify, check, test, screenshot or eyeball the game, or before committing gameplay changes.
allowed-tools: Bash, Read, Edit, Write, Grep, Glob
---

# Verify the game

The Claude-in-Chrome tab cannot reach this machine's dev server. Everything is verified through the headless harness instead. Never claim a change looks right without reading a screenshot of it.

## Loop

1. **Build**: `npx vite build 2>&1 | tail -1`. Must end in `✓ built`.
2. **Smoke** the scenarios that touch what changed: `make smoke S=<name>`. Each prints its key lines and ends with `errors: none`. Anything else is a runtime error with a stack; fix before going on.
3. **Shots**: `make shots` writes one PNG per view into `docs/screenshots/` and regenerates `docs/screenshots.md`. Then `Read` the PNGs that show the change (`select.png`, `top.png`, `iso.png`, `night-iso.png`, `battle-land.png`, `battle-air.png`, `river-iso.png`, `runway-iso.png`, `hedge-iso.png`, `tally.png`, `game-over.png`, `touch.png`, `rail-top.png`).
4. **Say what you saw.** Describe the frame in the reply: what is right, what is off. If it is off, fix and re-shoot.
5. Commit and push only when 1–4 are clean. Pushes to `main` deploy to GitHub Pages.

`make smoke` and `make shots` start a Vite server on :5173 if one is not already running.

## Scenario names

`hops` (crossing, tilt drain, coins) · `train` `occupied` (followers, swap rule) · `respawn` `lives` (deaths, economy, continue countdown) · `tally` (finish tally) · `coop` (two players, leash, battle pilots) · `battle` (kills, next level) · `river` `runway` `rail` `bounce` `cab` `wing` `hint` `traffic` `gauntlet` (scenario mechanics) · `night` `skies` (lighting) · `debug` `playtest` `touch` (tooling) · `shots`.

The list lives in `scripts/smoke.mjs`; `make` prints it.

## Timing caveat

Software-rendered Chrome runs the game clock slower than wall time. Waits in the harness are generous: 4.5 s for the coin slot at start, about 14 s for the finish tally to reach the battle, 3 s for a death to resolve. If a check reads a state "too early", lengthen the sleep before suspecting the game.

## Extending the harness

Add a branch `if (script === 'name') { await start(); ... }` in `scripts/smoke.mjs`. Tools available inside: `key(code, key)`, `evaluate(js)`, `state()`, `send(cdpMethod, params)`, and screenshots via `Page.captureScreenshot`. The page exposes `window.__game` (the Game) and `window.__meshes` (mesh factories) in dev builds; force states through them (`__game.debug.force = 'rail'; __game.restartStage()`, `__game.mode.finished = true`, `__game.mode.players[0].die('car')`). See `reference.md` for snippets.

Add the new name to the `smoke:` help line in the `Makefile` and to the list above.

## Playtest by hand

`docs/playtest.md` is generated (`make playtest-doc`) and lists deployed URLs for every level, scenario, sky, scenery, character and economy case. Point the user at the matching link when they want to try something themselves.
