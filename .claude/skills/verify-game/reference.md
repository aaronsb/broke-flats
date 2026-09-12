# Harness reference

## Skeleton of a scenario

```js
if (script === 'thing') {
  await start();                                   // insert coin, wait for the run
  await evaluate(`__game.debug.on = true; __game.debug.force = 'road'; __game.debug.god = true; __game.restartStage()`);
  await sleep(500);
  for (let i = 0; i < 6; i++) { await key('ArrowUp'); await sleep(200); }
  console.log('thing', await evaluate(`[__game.mode.players[0].row, __game.run.coins]`));
}
```

## Useful handles

| Need | Snippet |
|------|---------|
| Rows on the board | `[...__game.mode.world.rows.values()]` (each has `r`, `scenario.id`, `movers`, `coins`, `eggs`, `blocked`, `data`) |
| First lane of a kind | `[...__game.mode.world.rows.values()].find(l => l.scenario.id === 'river')` |
| Player | `__game.mode.players[0]` (`row`, `x`, `alive`, `carrier`, `airborne`, `bounces`) |
| Followers | `__game.mode.trains[0]` (`chicks`, `waiting`, `hatch()`) |
| Force a finish | `__game.mode.finished = true` then wait ~14 s for the battle |
| Force a death | `__game.mode.players[0].die('car')` |
| Jump levels | `__game.run.level = 2; __game.nextLevel()` or `__game.jumpLevel(3)` |
| Build a mesh | `__meshes.makeFlatbed()` then `lane.add(m.mesh, x); lane.movers.push(m)` |
| Screenshot | `const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path, Buffer.from(r.data, 'base64'))` |
| Held key (battle slide) | `send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'ArrowLeft', key: 'Left' })` … `keyUp` |
| Tap a DOM element | measure `getBoundingClientRect()` via evaluate, then `Input.dispatchMouseEvent` pressed/released |
| Navigate with playtest params | `send('Page.navigate', { url: 'http://localhost:5173/?start&level=3&force=rail&god' })` |

## Driving a device shape

```js
await send('Emulation.setDeviceMetricsOverride', { width: 400, height: 720, deviceScaleFactor: 1, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: 'http://localhost:5173/' });
// ... shots ...
await send('Emulation.clearDeviceMetricsOverride');
```

`mobile: true` plus touch emulation is what makes `touch.js` build the on-screen
pad and put `touch` on `<body>`; without it the CSS under `body.touch` never
applies and the shape proves nothing.

## Catching a moment in an animation

```js
const shown = `document.getElementById('intro')?.classList.contains('show')`;
while (!(await evaluate(shown))) await sleep(50);      // anchor on the state
const t0 = Date.now();
const at = async (ms, n) => { await sleep(Math.max(0, ms - (Date.now() - t0))); await shot(n); };
await at(500, 'logo-fall'); await at(1150, 'logo-slam');
```

Waiting to absolute offsets from an anchor survives slow module loads and slow
captures. Chained `sleep`s do not: each screenshot costs hundreds of ms and the
error accumulates until the shots land after the animation is over.

## Reading a screenshot

Look for: the status bar across the top in the arcade font, whole and unclipped; the character fully in frame and near mid-screen in tilted views; hazards moving in the expected rows; night lamps and beams; the horizon in battle views; nothing clipped at the window edges; no leftover marks from a previous stage.

At a device shape also look for: text running off either edge (a flex child
sized to `max-content` overflows a narrow window even when centred); controls
overlapping the touch pad along the bottom; the picked card whole rather than
half past the edge; and, in battle, the aim placard visible, since on touch it
is the only way to shift aim.
