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

## Reading a screenshot

Look for: the status bar across the top in the arcade font; the character fully in frame and near mid-screen in tilted views; hazards moving in the expected rows; night lamps and beams; the horizon in battle views; nothing clipped at the window edges; no leftover marks from a previous stage.
