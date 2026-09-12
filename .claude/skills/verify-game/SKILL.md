---
name: verify-game
description: Build, smoke-test and visually verify broke-flats after a change using the headless Chrome harness (make smoke, make shots) and by reading the screenshots. Use after editing anything under src/, when asked to verify, check, test, screenshot or eyeball the game, or before committing gameplay changes.
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

The harness runs `google-chrome-stable`. Where that binary does not exist — a
container, a machine with only Chromium — put a path in `CHROME_BIN`:
`CHROME_BIN=/opt/pw-browsers/chromium-1194/chrome-linux/chrome make smoke S=hops`.

## Scenario names

`hops` (crossing, tilt drain, coins) · `train` `occupied` (followers, swap rule) · `respawn` `lives` (deaths, economy, continue countdown) · `tally` (finish tally) · `coop` (two players, leash, battle pilots) · `battle` (kills, next level) · `river` `runway` `rail` `bounce` `cab` `wing` `hint` `traffic` `halt` `halt-crash` `gauntlet` (scenario mechanics) · `perks` (chicken fences, pig bushes, frog long jump, robot heavy) · `perks2` (cat nine lives, goose honk) · `night` `skies` (lighting) · `debug` `playtest` `touch` (tooling) · `poses` (every death pose and the arrivals) · `logo` (the attract intro on its beats) · `phone` `tablet` (a whole run at a device shape) · `shots`.

The list lives in `scripts/smoke.mjs`; `make` prints it.

## Device shapes

`touch.png` only ever framed the crossing board, so nothing was watching the
title, the character row or the battle at a phone's proportions — and that is
where they broke. `phone` (400x720) and `tablet` (820x1180) share one branch and
play a whole run: intro, title, a pick two along, the board, a peek, the battle,
an aim cycle. They write `<shape>-intro`, `-title`, `-select`, `-play`, `-iso`,
`-battle` and `-battle-sea`.

Run them after touching anything that reads the window: CSS with a width in it,
the camera presets, `select.js`, or the touch bar. Two rules of thumb the shapes
keep proving:

- A camera preset with a fixed distance frames badly off 16:9. Derive it.
- A tall window is not a wide one with more rows. Text sized to `max-content`
  and hit targets pinned to the bottom both stop fitting.

## Timing caveat

Software-rendered Chrome runs the game clock slower than wall time. Waits in the harness are generous: 4.5 s for the coin slot at start, about 14 s for the finish tally to reach the battle, 3 s for a death to resolve. If a check reads a state "too early", lengthen the sleep before suspecting the game.

Where a frame has to land inside a game-clock window, do not sleep for it at
all — poll the clock. A second of wall time was less than half a second of
`deadFor`, so the death-pose shots were photographing the flap that runs before
the pose. `for (let i = 0; i < 300 && (await evaluate('...deadFor')) < 1.25; i++) await sleep(50)`
lands every time, whatever the renderer is doing.

## Extending the harness

Add a branch `if (script === 'name') { await start(); ... }` in `scripts/smoke.mjs`. Tools available inside: `key(code, key)`, `evaluate(js)`, `state()`, `send(cdpMethod, params)`, and screenshots via `Page.captureScreenshot`. The page exposes `window.__game` (the Game) and `window.__meshes` (mesh factories) in dev builds; force states through them (`__game.debug.force = 'rail'; __game.restartStage()`, `__game.mode.finished = true`, `__game.mode.players[0].die('car')`). See `reference.md` for snippets.

Add the new name to the `smoke:` help line in the `Makefile` and to the list above.

Two traps when a scenario takes screenshots:

- **Anchor to state, not to elapsed time.** Module load and capture latency both
  drift under swiftshader, so a chain of `sleep`s walks off the thing you meant
  to catch. Poll for the state first (`while (!(await evaluate(shown))) await
  sleep(50)`), take `Date.now()` there, and shoot at offsets from it.
- **`Page.captureScreenshot` is slow enough to matter** — hundreds of ms each.
  Deltas between shots accumulate that cost; absolute offsets from the anchor do
  not.

## Playtest by hand

`docs/playtest.md` is generated (`make playtest-doc`) and lists deployed URLs for every level, scenario, sky, scenery, character and economy case. Point the user at the matching link when they want to try something themselves.
