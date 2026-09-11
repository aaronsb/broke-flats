// Headless smoke test over CDP: load the game, play some hops, report errors.
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pages = await (await fetch(`http://localhost:${PORT}/json`)).json();
const ws = new WebSocket(pages.find((p) => p.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.value;
const key = async (code, k = code.replace('Key', '').replace('Arrow', ''), hold = 40) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k, windowsVirtualKeyCode: 0 });
  await sleep(hold);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k, windowsVirtualKeyCode: 0 });
};
const state = () => evaluate(`({score: document.getElementById('score').textContent, coins: document.getElementById('coin-count').textContent, level: document.getElementById('level').textContent, chicks: document.getElementById('chicks').textContent, card: document.getElementById('card').textContent, over: document.getElementById('over').classList.contains('show'), title: document.getElementById('over-title').textContent})`);

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: 'http://localhost:5173/' });
await sleep(2500);
const start = async () => { await key('Enter', 'Enter'); await sleep(4500); console.log('start', await state()); };
const script = process.argv[2] ?? 'hops';
if (script === 'hops') {
  await start();
  for (let i = 0; i < 8; i++) { await key('ArrowUp'); await sleep(220); }
  console.log('after 8 hops', await state());
  await key('Space', ' ');  await sleep(1500);
  console.log('tilted 1.5s', await state());
  await key('Space', ' ');  await sleep(300);
  for (let i = 0; i < 40; i++) { await key('ArrowUp'); await sleep(200); if ((await state()).over) break; }
  console.log('after run', await state());
}
if (script === 'lives') {
  console.log('title', await evaluate(`[__game.run.coins, __game.run.lives]`));
  await start();
  console.log('started', await evaluate(`[__game.run.coins, __game.run.lives]`));
  await evaluate(`__game.run.lives = 1; __game.run.coins = 30`);
  await evaluate(`__game.mode.players[0].die('car')`); await sleep(3000);
  console.log('one death', await evaluate(`[__game.run.lives, __game.over]`));
  await evaluate(`__game.mode.players[0].die('car')`); await sleep(3000);
  console.log('out of lives', await evaluate(`[__game.run.lives, __game.over, document.getElementById('over-coins').textContent]`));
  await key('KeyC', 'c'); await sleep(300); await key('KeyC', 'c'); await sleep(300);
  console.log('bought', await evaluate(`[__game.run.lives, __game.run.coins, __game.over, document.getElementById('retry').textContent]`));
  await key('Enter', 'Enter'); await sleep(600);
  console.log('resumed', await evaluate(`[__game.run.lives, __game.over]`));
  await evaluate(`__game.run.lives = 0; __game.run.coins = 3; __game.mode.players[0].die('car')`); await sleep(3000);
  console.log('broke', await evaluate(`[__game.over, document.getElementById('retry').textContent, document.getElementById('over-title').textContent, !!__game.mode.players[0].xMark]`));
  await evaluate(`__game.countdown = 0.05`); await sleep(800);
  console.log('timed out', await evaluate(`[__game.over, !document.getElementById('title').classList.contains('hide')]`));
  await key('KeyR', 'r'); await sleep(600);
  console.log('new session', await evaluate(`[__game.run.coins, __game.run.lives, !document.getElementById('title').classList.contains('hide')]`));
}
if (script === 'touch') {
  await send('Page.navigate', { url: 'http://localhost:5173/?touch=1' }); await sleep(2500);
  const tap = async (sel) => {
    const box = await evaluate(`(() => { const r = document.querySelector('${sel}').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box[0], y: box[1], button: 'left', clickCount: 1 });
    await sleep(60);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box[0], y: box[1], button: 'left', clickCount: 1 });
  };
  console.log('bar', await evaluate(`[!!document.getElementById('touchbar'), document.querySelectorAll('#touchbar button').length]`));
  await tap('#touchbar .act.s'); await sleep(4500);
  console.log('started', await evaluate(`[__game.run.lives, !!__game.mode?.players]`));
  for (let i = 0; i < 3; i++) { await tap('#touchbar .pad.u'); await sleep(250); }
  console.log('hopped', await evaluate(`__game.mode.players[0].row`));
  const fsT = await import('node:fs');
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fsT.writeFileSync(`${process.env.OUT ?? '.'}/touch.png`, Buffer.from(r.data, 'base64'));
}
if (script === 'respawn') {
  await start();
  await evaluate(`__game.mode.trains[0].hatch(); __game.mode.trains[0].hatch()`);
  for (let i = 0; i < 3; i++) { await key('ArrowUp'); await sleep(220); }
  await evaluate(`__game.mode.players[0].die('car')`); await sleep(1400);
  console.log('after death', await state(), await evaluate(`[__game.mode.players[0].row, __game.mode.players[0].alive, __game.run.flock]`));
  await evaluate(`__game.mode.finished = true`); await sleep(14000);
  console.log('finish flock', await evaluate(`__game.run.flock`));
}
if (script === 'tally') {
  await start();
  await evaluate(`__game.mode.trains[0].hatch(); __game.mode.trains[0].hatch(); __game.mode.trains[0].waiting = 2`);
  await evaluate(`__game.mode.finished = true`); await sleep(2200);
  console.log('tally', await state(), await evaluate(`[__game.mode.tally, __game.run.score, __game.mode.trains[0].waitingMeshes?.length]`));
  await sleep(12000);
  console.log('after tally', await state(), await evaluate(`[__game.mode.constructor.name, __game.run.flock]`));
}
if (script === 'river') {
  await start();
  await evaluate(`__game.debug.on = true; __game.debug.force = 'river'; __game.debug.god = true; __game.restartStage()`); await sleep(500);
  for (let i = 0; i < 8; i++) { await key('ArrowUp'); await sleep(180); }
  await sleep(2000);
  console.log('river', await evaluate(`(() => { const rows = [...__game.mode.world.rows.values()].filter(l => l.scenario.id === 'river'); const kinds = {}; for (const l of rows) for (const m of l.movers) kinds[m.kind] = (kinds[m.kind] ?? 0) + 1; return [rows.length, kinds, rows.reduce((a, l) => a + l.movers.filter(m => m.diver).length, 0), __game.mode.players[0].row, !!__game.mode.players[0].carrier] })()`));
}
if (script === 'runway') {
  await start();
  await evaluate(`__game.debug.on = true; __game.debug.force = 'runway'; __game.debug.god = true; __game.restartStage()`); await sleep(500);
  for (let i = 0; i < 8; i++) { await key('ArrowUp'); await sleep(180); }
  await sleep(3000);
  console.log('runway', await evaluate(`(() => { const rows = [...__game.mode.world.rows.values()].filter(l => l.scenario.id === 'runway'); const kinds = {}; let high = 0; for (const l of rows) for (const m of l.movers) { kinds[m.kind] = (kinds[m.kind] ?? 0) + 1; if (m.y > 1) high++; } return [rows.length, kinds, high] })()`));
}
if (script === 'train') {
  await start();
  await evaluate(`__game.mode.train.hatch(); __game.mode.train.hatch()`);
  for (let i = 0; i < 6; i++) { await key('ArrowUp'); await sleep(220); }
  await key('ArrowLeft'); await sleep(220); await key('ArrowUp'); await sleep(220);
  console.log('train', await state(), await evaluate(`__game.mode.train.chicks.map(k => [k.rec.row, Math.round(k.mesh.position.x*10)/10, Math.round(k.mesh.position.z*10)/10])`));
  await key('ArrowDown'); await sleep(220);   // snake rule: should be refused
  console.log('after back-hop', await evaluate(`[__game.mode.player.row, __game.mode.train.count]`));
}
if (script === 'occupied') {
  await start();
  await evaluate(`__game.mode.train.hatch()`);
  await key('ArrowUp'); await sleep(250);
  console.log('before swap', await evaluate(`[__game.mode.player.row, __game.mode.train.chicks[0].rec.row]`));
  await key('ArrowDown'); await sleep(400);
  console.log('after swap', await evaluate(`[__game.mode.player.row, __game.mode.train.chicks[0].rec.row]`));
}
if (script === 'night') {
  await start();
  await evaluate(`__game.run.level = 2; __game.nextLevel()`); await sleep(400);
  for (let i = 0; i < 20; i++) { await key('ArrowUp'); await sleep(120); if ((await state()).over) break; }
  console.log('night', await evaluate(`(() => { const rows = [...__game.mode.world.rows.values()]; return [__game.sky.name, __game.sky.dark, rows.filter(l => l.data.flies).length, rows.filter(l => l.scenario.id === 'road').length, rows.filter(l => l.scenario.id === 'road' && l.movers.every(m => m.mesh.children.length > 8)).length] })()`));
}
if (script === 'skies') {
  await start();
  for (const n of [3, 4]) {
    await evaluate(`__game.nextLevel()`); await sleep(400);
    for (let i = 0; i < 30; i++) { await key('ArrowUp'); await sleep(120); if ((await state()).over) break; }
    console.log('sky', await state(), await evaluate(`[__game.sky.name, __game.sky.dark, !!__game.sky.rain, [...__game.mode.world.rows.values()].filter(l => l.data.flies).length]`));
    if ((await state()).over) { await key('KeyR', 'r'); await sleep(400); await evaluate(`__game.setLevel(${n}); `); }
  }
}
if (script === 'debug') {
  await start();
  await key('Backquote', '`'); await sleep(100);
  await key('KeyQ', 'q'); await sleep(400);
  console.log('forced road', await evaluate(`[...__game.mode.world.rows.values()].map(l => l.scenario.id).slice(4, 14).join(',')`));
  await key('KeyY', 'y'); await sleep(400);
  console.log('forced hedge', await evaluate(`[...__game.mode.world.rows.values()].map(l => l.scenario.id).slice(4, 12).join(',')`));
  await key('KeyK', 'k'); await sleep(400);
  console.log('sky', await state());
  await key('KeyG', 'g'); await key('KeyC', 'c'); await sleep(100);
  console.log('god+coins', await evaluate(`[__game.mode.player.invincible, Math.floor(__game.run.coins)]`));
  await key('Digit3', '3'); await sleep(400);
  console.log('level 3', await state());
  await key('Digit5', '5'); await sleep(400);
  console.log('battle', await state());
  await key('Backquote', '`'); await sleep(100);
  console.log('panel hidden', await evaluate(`document.getElementById('debug').hidden`));
}
if (script === 'shots') {
  const fs0 = await import('node:fs');
  await sleep(800);
  { const r = await send('Page.captureScreenshot', { format: 'png' }); fs0.writeFileSync(`${process.env.OUT ?? '.'}/select.png`, Buffer.from(r.data, 'base64')); }
  await key('ArrowRight'); await sleep(400);
  { const r = await send('Page.captureScreenshot', { format: 'png' }); fs0.writeFileSync(`${process.env.OUT ?? '.'}/select-spin.png`, Buffer.from(r.data, 'base64')); }
  await start();
  // Screenshots of each view for eyeballing. Written to OUT (default: cwd).
  const fs = await import('node:fs');
  const out = process.env.OUT ?? '.';
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${out}/${name}.png`, Buffer.from(r.data, 'base64')); };
  await evaluate(`__game.debug.god = true; __game.mode.player.invincible = true`);
  for (let i = 0; i < 4; i++) { await key('ArrowUp'); await sleep(200); }
  await sleep(600); await shot('top');
  await evaluate(`__game.run.coins = 50`);
  await key('Space', ' '); await sleep(1500); await shot('iso');
  await key('Space', ' '); await sleep(300);
  await evaluate(`__game.run.level = 2; __game.nextLevel()`); await sleep(500);
  for (let i = 0; i < 6; i++) { await key('ArrowUp'); await sleep(200); }
  await sleep(500); await shot('night-top');
  await key('Space', ' '); await sleep(1500); await shot('night-iso');
  await evaluate(`__game.mode.finished = true`); await sleep(3000); await shot('tally');
  await sleep(12000); await shot('battle-land');
  await key('ShiftLeft', 'Shift'); await sleep(1500); await shot('battle-sea');
  await key('ShiftLeft', 'Shift'); await sleep(1500); await shot('battle-air');
  await evaluate(`__game.run.level = 1; __game.nextLevel()`); await sleep(500);
  await key('Space', ' '); await sleep(1500); await shot('sunset-iso');
  await evaluate(`__game.run.level = 3; __game.nextLevel()`); await sleep(500);
  for (let i = 0; i < 5; i++) { await key('ArrowUp'); await sleep(200); }
  await sleep(400); await shot('rain-top');
  await key('Space', ' '); await sleep(1500); await shot('rain-iso');
  await evaluate(`__game.debug.force = 'river'; __game.debug.sky = 'day'; __game.run.level = 1; __game.restartStage()`); await sleep(500);
  for (let i = 0; i < 6; i++) { await key('ArrowUp'); await sleep(200); }
  await sleep(300); await shot('river-top');
  await key('Space', ' '); await sleep(1500); await shot('river-iso');
  await key('Space', ' '); await sleep(300);
  await evaluate(`__game.debug.force = 'runway'; __game.debug.sky = 'sunset'; __game.run.level = 1; __game.restartStage()`); await sleep(500);
  for (let i = 0; i < 5; i++) { await key('ArrowUp'); await sleep(200); }
  await sleep(1500); await shot('runway-top');
  await key('Space', ' '); await sleep(1500); await shot('runway-iso');
  await key('Space', ' '); await sleep(300);
  await evaluate(`__game.debug.force = 'hedge'; __game.debug.sky = 'day'; __game.run.level = 1; __game.restartStage()`); await sleep(500);
  for (let i = 0; i < 4; i++) { await key('ArrowUp'); await sleep(200); }
  await sleep(400); await shot('hedge-top');
  await key('Space', ' '); await sleep(1500); await shot('hedge-iso');
  await key('Space', ' '); await sleep(300);
  await evaluate(`__game.mode.player.invincible = false; __game.mode.player.die('car')`); await sleep(1500); await shot('game-over');
}
if (script === 'coop') {
  // Second player joins on the title card; both hop; both appear in the battle.
  await evaluate(`__game.debug.god = true`);
  await key('KeyD', 'd'); await sleep(200);
  console.log('roster', await evaluate(`__game.roster.map(c => c.id)`));
  await start();
  for (let i = 0; i < 5; i++) { await key('ArrowUp'); await key('KeyW', 'w'); await sleep(220); }
  console.log('rows', await evaluate(`__game.mode.players.map(p => [p.row, Math.round(p.x), p.alive])`));
  for (let i = 0; i < 12; i++) { await key('ArrowUp'); await sleep(200); }   // leash should stop P1
  console.log('leash', await evaluate(`__game.mode.players.map(p => p.row)`));
  await evaluate(`__game.mode.finished = true`); await sleep(14000);
  await key('KeyQ', 'q'); await key('Space', ' '); await sleep(300);
  console.log('battle', await evaluate(`[__game.mode.pilots.length, __game.mode.eggs.length]`));
}
if (script === 'battle') {
  await start();
  await evaluate(`__game.mode.finished = true`);
  await sleep(14000);
  console.log('battle enter', await state());
  for (let i = 0; i < 12; i++) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', code: i % 2 ? 'ArrowLeft' : 'ArrowRight', key: i % 2 ? 'Left' : 'Right' });
    await sleep(250);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code: i % 2 ? 'ArrowLeft' : 'ArrowRight', key: i % 2 ? 'Left' : 'Right' });
    await key('Space', ' '); await sleep(150);
    if (i === 4) await key('ShiftLeft', 'Shift');
  }
  console.log('battle mid', await state(), await evaluate(`[__game.mode.targets.length, __game.mode.eggs.length, __game.mode.points]`));
  await evaluate(`__game.mode.timeLeft = 0.1`);
  await sleep(3500);
  console.log('next level', await state());
  for (let i = 0; i < 4; i++) { await key('ArrowUp'); await sleep(220); }
  console.log('level 2 hops', await state());
}
console.log('errors:', errors.length ? errors : 'none');
ws.close();
process.exit(0);
