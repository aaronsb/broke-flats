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
  console.log('stray marks', await evaluate(`__game.scene.children.filter(o => o.children?.length === 2 && o.children.every(c => c.scale.x === 1.5)).length`));
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
  await evaluate(`__game.mode.finished = true`); await sleep(10000); await key('Enter', 'Enter'); await sleep(800);
  console.log('finish flock', await evaluate(`__game.run.flock`));
}
if (script === 'tally') {
  await start();
  await evaluate(`__game.mode.trains[0].hatch(); __game.mode.trains[0].hatch(); __game.mode.trains[0].waiting = 2`);
  await evaluate(`__game.mode.finished = true`); await sleep(4000);
  console.log('tally', await evaluate(`[document.getElementById('summary').classList.contains('show'), [...document.querySelectorAll('#summary .row')].map(r => r.textContent).join(' | ')]`));
  await sleep(6000);
  await key('ArrowUp'); await sleep(300);
  console.log('hop kept panel', await evaluate(`[document.getElementById('summary').classList.contains('show'), __game.summary.ready]`));
  await key('Enter', 'Enter'); await sleep(800);
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
  console.log('flanks', await evaluate(`(() => { const rows = [...__game.mode.world.rows.values()]; const bad = []; for (const l of rows) if (l.scenario.id === 'runway') for (const r of [l.r - 1, l.r + 1]) { const n = rows.find(o => o.r === r); if (n && !['meadow', 'road', 'river'].includes(n.scenario.id)) bad.push([l.r, n.scenario.id]); } return bad; })()`));
  console.log('runway', await evaluate(`(() => { const rows = [...__game.mode.world.rows.values()].filter(l => l.scenario.id === 'runway'); const kinds = {}; let high = 0; for (const l of rows) for (const m of l.movers) { kinds[m.kind] = (kinds[m.kind] ?? 0) + 1; if (m.y > 1) high++; } return [rows.length, kinds, high] })()`));
}
if (script === 'rail') {
  await start();
  await evaluate(`__game.debug.on = true; __game.debug.force = 'rail'; __game.debug.god = true; __game.restartStage()`); await sleep(500);
  for (let i = 0; i < 6; i++) { await key('ArrowUp'); await sleep(180); }
  await sleep(9000);
  console.log('gate rules', await evaluate(`(() => { const l = [...__game.mode.world.rows.values()].find(l => l.scenario.id === 'rail'); l.data.down = true; const w = __game.mode.world; const r = l.r;
    return { fromBelowLeftEnd: w.isBlocked(-6, r, r - 1), fromBelowRightEnd: w.isBlocked(6, r, r - 1), fromBelowMiddle: w.isBlocked(0, r, r - 1), fromAboveLeftEnd: w.isBlocked(-6, r, r + 1), fromAboveRightEnd: w.isBlocked(6, r, r + 1), exitUpRight: w.isBlocked(6, r + 1, r), exitUpLeft: w.isBlocked(-6, r + 1, r) }; })()`));
  console.log('gates', await evaluate(`(() => { const l = [...__game.mode.world.rows.values()].find(l => l.scenario.id === 'rail'); return l.data.gates.map(g => [Math.sign(g.position.x), g.position.z]); })()`));
  console.log('rail', await evaluate(`(() => { const rows = [...__game.mode.world.rows.values()].filter(l => l.scenario.id === 'rail'); const types = {}; for (const l of rows) types[l.data.train.type] = (types[l.data.train.type] ?? 0) + 1; return [rows.length, types, rows.filter(l => l.data.train.beds.length).length, rows.filter(l => l.blocked.size).length, rows.reduce((a, l) => a + l.data.puffs.length, 0)] })()`));
  const fsR = await import('node:fs');
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fsR.writeFileSync(`${process.env.OUT ?? '.'}/rail-top.png`, Buffer.from(r.data, 'base64'));
}
if (script === 'gauntlet') {
  await start();
  await evaluate(`__game.debug.god = true; __game.run.gauntlet = 'river'; __game.restartStage()`); await sleep(2500);
  console.log('gauntlet', await evaluate(`[document.getElementById('level').textContent, [...new Set([...__game.mode.world.rows.values()].filter(l => l.r > 3 && l.r < 20).map(l => l.scenario.id))].join(','), [...__game.mode.world.rows.values()].filter(l => l.scenario.id === 'river').reduce((a, l) => a + l.coins.size + l.eggs.size, 0)]`));
  await evaluate(`__game.mode.finished = true`); await sleep(9000); await key('Enter', 'Enter'); await sleep(500);
  console.log('phew', await evaluate(`[document.getElementById('card').textContent.includes('PHEW'), __game.run.score >= 500, __game.run.gauntlet]`));
}
if (script === 'bounce') {
  await start();
  await evaluate(`__game.debug.on = true; __game.debug.force = 'road'; __game.restartStage()`); await sleep(500);
  // Park the player right behind a car's rear bumper on the first road row and watch.
  const r = await evaluate(`(() => { const lane = [...__game.mode.world.rows.values()].find(l => l.scenario.id === 'road'); const m = lane.movers[0]; const p = __game.mode.players[0];
    lane.movers.forEach((o, i) => { o.x = i === 0 ? 2 : -12 - i * 4; o.mesh.position.x = o.x; });
    p.row = lane.r; p.z = -lane.r; p.x = m.x - lane.dir * (m.len / 2 + 0.3); p.col = Math.round(p.x); p.mesh.position.set(p.x, 0, p.z); return [lane.r, lane.dir, Math.round(p.x * 10) / 10]; })()`);
  await sleep(250);
  console.log('bounce', r, await evaluate(`[__game.mode.players[0].alive, __game.mode.players[0].bounces ?? 0, Math.round(__game.mode.players[0].x)]`));
}
if (script === 'unlock') {
  await start();
  for (const lv of [1, 3, 6]) {
    await evaluate(`__game.debug.on = true; __game.debug.god = true; __game.debug.force = null; __game.jumpLevel(${lv})`); await sleep(1500);
    console.log('level ' + lv, await evaluate(`(() => { const rows = [...__game.mode.world.rows.values()]; const kinds = {}; for (const l of rows) for (const m of l.movers) { const k = m.kind ?? m.type ?? (m.bed ? 'flatbed' : m.len > 2 ? 'truck' : 'car'); kinds[l.scenario.id + ':' + k] = (kinds[l.scenario.id + ':' + k] ?? 0) + 1; } return kinds; })()`));
  }
  await evaluate(`__game.debug.force = 'road'; __game.jumpLevel(9)`); await sleep(9000);
  console.log('crashes', await evaluate(`(() => { const rows = [...__game.mode.world.rows.values()].filter(l => l.scenario.id === 'road'); return [rows.reduce((a, l) => a + l.movers.filter(m => m.reckless).length, 0), __game.mode.fx.pieces.length + __game.mode.fx.puffs.length]; })()`));
}
if (script === 'traffic') {
  await start();
  for (const lv of [1, 6]) {
    await evaluate(`__game.debug.on = true; __game.debug.force = 'road'; __game.debug.god = true; __game.jumpLevel(${lv})`); await sleep(3000);
    console.log('level ' + lv, await evaluate(`(() => { const rows = [...__game.mode.world.rows.values()].filter(l => l.scenario.id === 'road'); let minGap = 99, stallers = 0, n = 0, speed = 0; for (const l of rows) { const o = [...l.movers].sort((a, b) => a.x * l.dir - b.x * l.dir); n += o.length; speed += l.speed; for (const m of o) if (m.staller) stallers++; for (let i = 0; i + 1 < o.length; i++) { const g = (o[i+1].x - o[i].x) * l.dir - (o[i+1].len + o[i].len) / 2; minGap = Math.min(minGap, g); } } return { rows: rows.length, perLane: +(n / rows.length).toFixed(1), avgSpeed: +(speed / rows.length).toFixed(1), minGap: +minGap.toFixed(2), stallers }; })()`));
  }
}
if (script === 'playtest') {
  await send('Page.navigate', { url: 'http://localhost:5173/?start&level=3&force=rail&god&coins=42&lives=7&chars=goose,pig' }); await sleep(3500);
  console.log('playtest', await evaluate(`[__game.run.level, __game.run.coins, __game.run.lives, __game.roster.map(c => c.id).join('+'), __game.mode.players[0].invincible, [...new Set([...__game.mode.world.rows.values()].filter(l => l.r > 3 && l.r < 12).map(l => l.scenario.id))].join(','), document.getElementById('level').textContent]`));
  await send('Page.navigate', { url: 'http://localhost:5173/?battle&level=2' }); await sleep(3500);
  console.log('battle url', await evaluate(`[__game.mode.constructor.name, __game.run.level]`));
}
if (script === 'wing') {
  await start();
  await evaluate(`__game.debug.on = true; __game.debug.force = 'runway'; __game.restartStage()`); await sleep(500);
  // Stand the player under a taxiing plane's wing on the row before the runway and see it get picked up.
  const r = await evaluate(`(() => { const lane = [...__game.mode.world.rows.values()].find(l => l.scenario.id === 'runway'); const m = lane.movers[0]; m.kind = 'taxi'; m.x = 0; m.mesh.position.x = 0; const p = __game.mode.players[0];
    p.row = lane.r - 1; p.z = -p.row; p.x = 0.1 * lane.dir; p.col = 0; p.mesh.position.set(p.x, 0, p.z); p.land(); return [lane.r, lane.dir, !!p.carrier, !!p.carrier?.wing]; })()`);
  await sleep(700);
  console.log('mounted', r, await evaluate(`[__game.mode.players[0].alive, Math.round(__game.mode.players[0].x * 10) / 10, Math.round(__game.mode.players[0].y * 100) / 100]`));
  await evaluate(`(() => { const p = __game.mode.players[0]; p.y = 3; p.carrier.y = 2.6; })()`);   // pretend the plane climbed
  await key('ArrowDown'); await sleep(200);
  console.log('hover', await evaluate(`[!!__game.mode.players[0].airborne, Math.round(__game.mode.players[0].y * 10) / 10]`));
  await sleep(2500);
  console.log('landed', await evaluate(`[!!__game.mode.players[0].airborne, Math.round(__game.mode.players[0].y * 10) / 10, __game.mode.players[0].row]`));
  console.log('spacing', await evaluate(`(() => { const rs = [...__game.mode.world.rows.values()].filter(l => l.scenario.id === 'runway').map(l => l.r).sort((a, b) => a - b); let min = 99; for (let i = 1; i < rs.length; i++) min = Math.min(min, rs[i] - rs[i - 1]); return [rs.length, min]; })()`));
}
if (script === 'hint') {
  await start();
  await evaluate(`__game.debug.on = true; __game.debug.force = 'hedge'; __game.debug.god = true; __game.restartStage()`); await sleep(500);
  for (let i = 0; i < 4; i++) { await key('ArrowUp'); await sleep(220); }
  console.log('hint', await evaluate(`[[...__game.mode.hinted], document.getElementById('view').classList.contains('hint')]`));
}
if (script === 'cab') {
  await start();
  await evaluate(`__game.debug.on = true; __game.debug.force = 'road'; __game.restartStage()`); await sleep(500);
  // Ride a flatbed's bed, then hop toward the cab: expect a bounce back onto the bed, still alive.
  const r = await evaluate(`(() => { const lane = [...__game.mode.world.rows.values()].find(l => l.scenario.id === 'road');
    for (const o of lane.movers) lane.group.remove(o.mesh); lane.movers = [];
    const m = __meshes.makeFlatbed(); m.x = 0; m.v = 1; if (lane.dir < 0) m.mesh.rotation.y = Math.PI; lane.add(m.mesh, 0); lane.movers.push(m);
    const p = __game.mode.players[0]; p.row = lane.r; p.z = -lane.r; p.x = m.x + lane.dir * (m.bed[0] + m.bed[1]) / 2; p.col = Math.round(p.x); p.mesh.position.set(p.x, 0, p.z); p.land(); return [!!p.carrier, lane.dir]; })()`);
  if (r !== 'no flatbed') for (let i = 0; i < 2; i++) { await key(r[1] > 0 ? 'ArrowRight' : 'ArrowLeft'); await sleep(450); }
  console.log('cab', r, await evaluate(`[__game.mode.players[0].alive, __game.mode.players[0].bounces ?? 0, !!__game.mode.players[0].carrier]`));
}
if (script === 'about') {
  await key('KeyI', 'i'); await sleep(400);
  console.log('about open', await evaluate(`[document.getElementById('about').classList.contains('show'), getComputedStyle(document.querySelector('#about .crawl p')).fontSize, getComputedStyle(document.getElementById('bar')).fontSize, getComputedStyle(document.getElementById('hint')).fontSize, getComputedStyle(document.getElementById('view')).fontSize]`));
  await key('Escape', 'Escape'); await sleep(200);
  console.log('about closed', await evaluate(`document.getElementById('about').classList.contains('show')`));
}
if (script === 'mines') {
  await start();
  await evaluate(`__game.run.gauntlet = 'mines'; __game.restartStage()`); await sleep(1500);
  const info = await evaluate(`(() => { const rows = [...__game.mode.world.rows.values()].filter(l => l.scenario.id === 'mines'); let mines = 0, coinsOnMines = 0, coins = 0; for (const l of rows) { mines += l.data.mines.size; for (const c of l.coins.keys()) { coins++; if (l.data.mines.has(c)) coinsOnMines++; } } return [rows.length, mines, coins, coinsOnMines, __game.mode.world.rows.size]; })()`);
  console.log('field', info);
  // Walk the safe path (path cells never carry mines), then step onto a mine deliberately.
  const walked = await evaluate(`(() => { const p = __game.mode.players[0]; const w = __game.mode.world; const first = [...w.rows.values()].filter(l => l.scenario.id === 'mines').map(l => l.r).sort((a, b) => a - b)[0]; p.row = first - 1; p.col = w.pathCol; p.x = p.col; p.z = -p.row; p.mesh.position.set(p.x, 0, p.z); let r = p.row; for (let i = 0; i < 6; i++) { const l = w.rows.get(r + 1); if (!l || l.scenario.id !== 'mines') break; const c = [...Array(17).keys()].map(k => k - 8).find(c => !l.data.mines.has(c) && Math.abs(c - p.col) <= 1); p.row = r + 1; p.col = c; p.x = c; p.z = -p.row; p.mesh.position.set(p.x, 0, p.z); p.land(); r++; } return [p.row, p.alive, [...(w.rows.get(p.row).data.revealed)].length]; })()`);
  console.log('walked', walked);
  // Flag the mine ahead, then the finale: cross the line and let them all go up.
  const flagged = await evaluate(`(() => { const p = __game.mode.players[0]; const w = __game.mode.world; const l = w.rows.get(p.row + 1); const c = [...l.data.mines.keys()][0]; if (c === undefined) return 'no mine'; p.x = c; p.col = c; p.mesh.position.x = c; p.facing = 0; __game.mode.plantFlag(p); return [l.data.flags.has(c), l.data.mines.has(c)]; })()`);
  console.log('flagged', flagged);
  await evaluate(`__game.mode.finished = true`); await sleep(6500);
  console.log('finale', await evaluate(`(() => { const rows = [...__game.mode.world.rows.values()].filter(l => l.scenario.id === 'mines'); return [rows.reduce((a, l) => a + l.data.mines.size, 0), rows.reduce((a, l) => a + (l.data.hits ?? 0), 0), document.getElementById('card').textContent.includes('FLAGS')]; })()`));
  await sleep(6000); await key('Enter', 'Enter'); await sleep(800);
  console.log('after', await evaluate(`[__game.run.level, __game.mode.constructor.name]`));
}
if (script === 'swim') {
  await send('Page.navigate', { url: 'http://localhost:5173/?start&force=river&chars=duck&coins=50' }); await sleep(3500);
  const r = await evaluate(`(() => { const p = __game.mode.players[0]; const lane = [...__game.mode.world.rows.values()].find(l => l.scenario.id === 'river'); for (const m of lane.movers) { m.x = -12; m.mesh.position.x = -12; } p.row = lane.r; p.col = 3; p.x = 3; p.z = -lane.r; p.mesh.position.set(3, 0, p.z); p.land(); return [p.swims, p.alive, !!p.carrier]; })()`);
  await sleep(400);
  console.log('duck swims', r, await evaluate(`[__game.mode.players[0].alive, Math.round(__game.mode.players[0].y * 10) / 10]`));
  console.log('paddle', await evaluate(`(() => { const p = __game.mode.players[0]; const w = __game.mode.world; const next = w.laneAt(p.row + 1); if (next.scenario.id !== 'river') return 'next not river'; for (const m of next.movers) { m.x = -12; m.mesh.position.x = -12; } p.hop(0, 1); const ys = []; for (let i = 0; i < 8; i++) { p.update(0.02); ys.push(Math.round(p.y * 100) / 100); } return [p.paddling, Math.max(...ys), Math.min(...ys)]; })()`));
  console.log('young swim', await evaluate(`(() => { const p = __game.mode.players[0]; const tr = __game.mode.trains[0]; tr.hatch(true); const k = tr.chicks[0]; tr.update(0.02, 0); const y1 = Math.round(k.mesh.position.y * 100) / 100; const lane = __game.mode.world.laneAt(k.rec.row); const len = 3; const m = { mesh: __meshes.makeLog(len), len, bed: [-len / 2, len / 2], rideY: 0, kind: 'log', x: k.mesh.position.x, v: 1 }; lane.add(m.mesh, m.x); lane.movers.push(m); tr.update(0.02, 0); return [y1, !!k.rec.carrier]; })()`));
  // A log drifting onto the duck picks it up; a boat runs it down.
  console.log('log pickup', await evaluate(`(() => { const p = __game.mode.players[0]; const lane = __game.mode.world.laneAt(p.row); const len = 3; const m = { mesh: __meshes.makeLog(len), len, bed: [-len / 2, len / 2], rideY: 0, kind: 'log', x: p.x, v: 1 }; lane.add(m.mesh, m.x); lane.movers.push(m); p.update(0.016); return [!!p.carrier, p.alive]; })()`));
  console.log('boat hit', await evaluate(`(() => { const p = __game.mode.players[0]; p.carrier = null; const lane = __game.mode.world.laneAt(p.row); lane.movers.forEach(o => lane.group.remove(o.mesh)); lane.movers = []; const m = __meshes.makeRiverBoat(); m.kind = 'boat'; m.x = p.x; m.v = 1; lane.add(m.mesh, m.x); lane.movers.push(m); p.update(0.016); return [p.alive, p.deadBy]; })()`));
  await send('Page.navigate', { url: 'http://localhost:5173/?start&level=4&gauntlet=mines' }); await sleep(3500);
  console.log('mines url', await evaluate(`[__game.run.gauntlet, [...new Set([...__game.mode.world.rows.values()].filter(l => l.r > 3 && l.r < 12).map(l => l.scenario.id))].join(',')]`));
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
  await key('KeyI', 'i'); await sleep(6000);
  { const r = await send('Page.captureScreenshot', { format: 'png' }); fs0.writeFileSync(`${process.env.OUT ?? '.'}/about.png`, Buffer.from(r.data, 'base64')); }
  await key('Escape', 'Escape'); await sleep(300);
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
  await evaluate(`__game.mode.finished = true`); await sleep(5000); await shot('tally');
  await sleep(4000); await key('Enter', 'Enter'); await sleep(1500); await shot('battle-land');
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
  await evaluate(`__game.debug.force = null; __game.run.gauntlet = 'mines'; __game.debug.sky = 'day'; __game.debug.scenery = 'residential'; __game.run.level = 1; __game.restartStage()`); await sleep(800);
  for (let i = 0; i < 6; i++) { await key('ArrowUp'); await sleep(200); }
  await sleep(500); await shot('mines-top');
  await key('Space', ' '); await sleep(1500); await shot('mines-iso');
  await key('Space', ' '); await sleep(300);
  await evaluate(`__game.run.gauntlet = null; __game.debug.scenery = null; __game.debug.force = 'runway'; __game.debug.sky = 'sunset'; __game.run.level = 1; __game.restartStage()`); await sleep(500);
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
  await evaluate(`__game.mode.trains[0].hatch(); __game.mode.trains[0].hatch(); __game.mode.finished = true`); await sleep(10000); await key('Enter', 'Enter'); await sleep(800);
  await key('KeyQ', 'q'); await key('Space', ' '); await sleep(300);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'ArrowRight', key: 'Right' }); await sleep(600);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'ArrowRight', key: 'Right' }); await sleep(200);
  console.log('battle', await evaluate(`[__game.mode.pilots.length, __game.mode.eggs.length, __game.mode.pilots[0].young.length, __game.mode.pilots[0].young.map(m => Math.round(m.position.x * 10) / 10).join(',') , Math.round(__game.mode.pilots[0].cx * 10) / 10]`));
}
if (script === 'battle') {
  await start();
  await evaluate(`__game.mode.finished = true`);
  await sleep(10000); await key('Enter', 'Enter'); await sleep(800);
  console.log('battle enter', await state());
  for (let i = 0; i < 12; i++) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', code: i % 2 ? 'ArrowLeft' : 'ArrowRight', key: i % 2 ? 'Left' : 'Right' });
    await sleep(250);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code: i % 2 ? 'ArrowLeft' : 'ArrowRight', key: i % 2 ? 'Left' : 'Right' });
    await key('Space', ' '); await sleep(150);
    if (i === 4) await key('ShiftLeft', 'Shift');
  }
  console.log('battle mid', await state(), await evaluate(`[__game.mode.targets.length, __game.mode.eggs.length, __game.mode.points]`));
  console.log('one way', await evaluate(`(() => { const m = __game.mode; const dirs = {}; for (const t of m.targets) (dirs[t.kind] ??= new Set()).add(t.dir); return Object.fromEntries(Object.entries(dirs).map(([k, v]) => [k, v.size])); })()`));
  await evaluate(`__game.mode.timeLeft = 0.1`);
  await sleep(4000);
  console.log('battle summary', await evaluate(`[...document.querySelectorAll('#summary .row')].map(r => r.textContent).join(' | ')`));
  await sleep(5000); await key('Enter', 'Enter'); await sleep(800);
  console.log('next level', await state());
  for (let i = 0; i < 4; i++) { await key('ArrowUp'); await sleep(220); }
  console.log('level 2 hops', await state());
}
console.log('errors:', errors.length ? errors : 'none');
ws.close();
process.exit(0);
