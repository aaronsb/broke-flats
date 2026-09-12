# Broke Flats

A Crossy Road style hopper with a twist: the board is a top-down Frogger view, and tilting into 3D reveals what the flat view hides. Peeking costs coins, so the less you tilt, the more you keep. Every level ends in an Air-Sea Battle.

The name is the lose condition: spend your coins looking and you end up flat and broke, stuck top-down with nothing left to spend. (The repo is still `road-crosser` — see [docs/naming.md](docs/naming.md).)

Play it: **https://aaronsb.github.io/road-crosser/**

![Isometric peek over a day board](docs/screenshots/iso.png)

## How it plays

- **Hop** with the arrows or WASD. Roads have traffic, rivers have logs, and some trucks have a flatbed you can ride.
- **Peek** with Space (or hold Shift). The camera tilts to isometric and drains one coin per second. At zero coins you are stuck top-down.
- **Hidden things** only show from the side: coins under wide canopies, carports and bus shelters, and the tunnel through each hedge wall. The tunnel roof matches the hedge exactly from above, so you have to remember where it was.
- **Eggs** hide under shelters too. Landing on one hatches a chick that follows you snake-style. Chicks ride the same logs you did, block the cell behind you, and die to traffic. Every chick that reaches the finish line is worth a bonus.
- **Finish line** ends the crossing and starts the **Air-Sea Battle**: slide along the bottom row and lob eggs at cars, boats and planes. Down or S tilts the aim between land, sea and air. Boats are slow and cheap, planes are fast and rich.
- **Levels** cycle day, sunset, night and rain with forest, residential, city and parking scenery. Night traffic runs on real headlights.
- **Attract** cycles: for an eighth of each loop a framed postcard of Broke Flats takes the screen, where the town sign slams down over the crossing sign and creaks askew.

![Night battle with headlights and lit towers](docs/screenshots/battle-air.png)

![Night board with fireflies and headlight beams](docs/screenshots/night-iso.png)

## Keys

| Key | Action |
|-----|--------|
| Arrows / WASD | Hop |
| Space | Toggle 3D peek (burns coins) |
| Shift | Hold to peek |
| S / Down (battle) | Cycle aim: land, sea, air |
| Space / W / Up (battle) | Fire an egg |
| M | Mute music |
| P | Cycle pixel size |
| ` | Debug panel: jump levels, force a scenario, cycle sky and scenery, god mode |

## Running it

```sh
npm install
make dev        # Vite dev server on :5173
make            # list all targets
```

`make smoke S=<scenario>` drives the game in headless Chrome over the DevTools Protocol and reports runtime errors. `make shots` captures one screenshot per view into `docs/screenshots/`. Both need `google-chrome-stable`.

Pushes to `main` build and deploy to GitHub Pages.

For jumping straight to a level, scenario, sky or character while playtesting, see [docs/playtest.md](docs/playtest.md).

## Layout

- `src/game.js` holds the run record and switches modes.
- `src/modes/` are the crossing board and the battle. Each builds its scene on enter and tears it down on exit.
- `src/scenarios/` are the board's band types (meadow, grass hunt, road, river, hedge, finish) behind one small contract.
- `src/scenery/` are the visual themes a level dresses its bands in, with tetromino-footprint buildings.
- `src/logo.js` draws the Broke Flats signs as one SVG asset: static in the title and the about crawl, animated inside the framed attract postcard.
- `src/music.js` is an adaptive chiptune sequencer, `src/sfx.js` a tiny ADSR synth, `src/headlights.js` a fixed spotlight pool.

Built with [three.js](https://threejs.org/) and Vite.

## License

[AGPL-3.0](LICENSE). Derivatives, including ones hosted as a service, must stay open source. The Press Start 2P font is bundled under its own [OFL](public/fonts/OFL.txt).
