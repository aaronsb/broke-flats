# Broke Flats

A road-crossing arcade game where looking costs you.

The board is top-down and the flat view lies. Coins sit under canopies, eggs under bus shelters, and every hedge wall has exactly one tunnel through it — whose roof, from above, matches the hedge perfectly. Tilt into 3D and you can see all of it. But tilting drains a coin a second, and coins are lives: twenty-five buys one. Spend them looking and you end up flat broke, stuck top-down, crossing the rest from memory.

That is the name, and it is the lose condition. The long way round to it is in [docs/naming.md](docs/naming.md).

Every day ends in a hearing at the Department of Pedestrian Grievances.

Play it: **https://aaronsb.github.io/broke-flats/**

![Isometric peek over a day board](docs/screenshots/iso.png)

## How it plays

- **Hop** with the arrows or WASD. Roads have traffic, rivers have logs, and some trucks have a flatbed you can ride.
- **Peek** with Space (or hold Shift). The camera tilts to isometric and drains one coin per second. At zero coins you are stuck top-down.
- **Hidden things** only show from the side: coins under wide canopies, carports and bus shelters, and the tunnel through each hedge wall. The tunnel roof matches the hedge exactly from above, so you have to remember where it was.
- **Eggs** hide under shelters too. Landing on one hatches a chick that follows you snake-style. Chicks ride the same logs you did, block the cell behind you, and die to traffic. Every chick that reaches the finish line is worth a bonus, and each one multiplies the day's tally by another half.
- **A flock halts traffic.** Road vehicles brake for a leader with followers, harder the more there are. Car following has a reaction delay, so a hard stop in front of a tight queue puts the car behind into the one in front. The faster car is the one that goes.
- **Characters carry a perk**, priced into the tally. Goose and duck swim. Chicken hops fences. Pig pushes through hedges and shrubs. Frog double-taps for a two-row jump. Cat's first death each level is free. Robot never bounces off a bumper and sinks on contact with water, and earns a little extra for it. The goose also honks (H): stalled traffic nearby pulls away.
- **Finish line** ends the crossing and calls your case at the **Department of Pedestrian Grievances**: slide along the bottom row and file complaint forms at the cars, boats and planes that nearly ran you over. Down or S tilts the aim between the ROADS, HARBOR and AVIATION windows. Boats are slow and cheap, planes are fast and rich. Your followers file with you at half weight. A form that misses its row skips on to the next, and one that flies off the back bursts. Every hit is damages awarded; the office closes on a timer and the case closes with it.
- **Levels** cycle day, sunset, night and rain with forest, residential, city and parking scenery. Night traffic runs on real headlights.
- **Attract** cycles: for an eighth of each loop a framed postcard of Broke Flats takes the screen, where the town sign slams down over the crossing sign and creaks askew.

![A night hearing with headlights and lit towers](docs/screenshots/battle-air.png)

![Night board with fireflies and headlight beams](docs/screenshots/night-iso.png)

## Keys

| Key | Action |
|-----|--------|
| Arrows / WASD | Hop |
| Space | Toggle 3D peek (burns coins) |
| Shift | Hold to peek |
| Q / E | Turn in place (minefield) |
| F | Flag the cell you face (minefield) |
| H / G | Honk (goose): player 1 / player 2 |
| S / Down (hearing) | Cycle aim: roads, harbor, aviation |
| Space / W / Up (hearing) | File a complaint |
| M | Mute music |
| P | Cycle pixel size |
| ` | Debug panel: jump levels, force a scenario, cycle sky and scenery, god mode |

On a phone or tablet the controls come up on screen: a d-pad, **A** to peek and
file, **B** to hold the peek on the board and cycle the aim in the hearing, **¢**
to feed the slot and **⏎** to start. The hearing's corner placard reads the window
your forms are going to — ROADS, HARBOR or AVIATION — and tapping it cycles. On a
minefield board three more appear above the d-pad: **↺** and **↻** turn you in
place, **⚑** flags the cell you face. Hopping already turns you, but stepping
somewhere to look at it is how you die down there.

## Running it

```sh
npm install
make dev        # Vite dev server on :5173
make            # list all targets
```

`make smoke S=<scenario>` drives the game in headless Chrome over the DevTools Protocol and reports runtime errors; `make` lists the scenarios. `make smoke S=phone` and `S=tablet` replay a whole run at a device shape — intro, title, character pick, board, peek, hearing — which is where the window-shape bugs live. `make shots` captures one screenshot per view into `docs/screenshots/`; everything else writes to the gitignored `shots/`.

Both need a Chrome binary: `google-chrome-stable`, or a path in `CHROME_BIN`. See [the verify-game skill](.claude/skills/verify-game/SKILL.md) for the loop and [its reference](.claude/skills/verify-game/reference.md) for the handles a scenario can reach inside the running game.

Pushes to `main` build and deploy to GitHub Pages.

For jumping straight to a level, scenario, sky or character while playtesting, see [docs/playtest.md](docs/playtest.md).

## Layout

- `src/game.js` holds the run record and switches modes.
- `src/modes/` are the crossing board and the hearing. Each builds its scene on enter and tears it down on exit.
- `src/scenarios/` are the board's band types (meadow, grass hunt, road, river, hedge, finish) behind one small contract.
- `src/scenery/` are the visual themes a level dresses its bands in, with tetromino-footprint buildings.
- `src/logo.js` draws the Broke Flats signs as one SVG asset: static in the title and the about crawl, animated inside the framed attract postcard.
- `src/music.js` is an adaptive chiptune sequencer, `src/sfx.js` a tiny ADSR synth, `src/headlights.js` a fixed spotlight pool.

Built with [three.js](https://threejs.org/) and Vite. It started as one evening's dare after the kids found a Crossy Road cabinet at a roller rink, and then the kids had ideas — the whole story is the ABOUT crawl in the game.

## License

[AGPL-3.0](LICENSE). Derivatives, including ones hosted as a service, must stay open source. The Press Start 2P font is bundled under its own [OFL](public/fonts/OFL.txt).
