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
// BASE points the run at another server (a private snapshot) when :5173 is shared.
const BASE = process.env.BASE ?? 'http://localhost:5173/';
await send('Page.navigate', { url: BASE });
await sleep(2500);
const start = async () => { await key('Enter', 'Enter'); await sleep(4500); console.log('start', await state()); };
// Screenshots land in shots/ unless OUT says otherwise (make shots points it at
// docs/screenshots). shots/ is gitignored, so running a scenario by hand never
// drops PNGs in the repo root.
const OUT = process.env.OUT ?? 'shots';
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
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
  await send('Page.navigate', { url: BASE + '?touch=1' }); await sleep(2500);
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
  fsT.writeFileSync(`${OUT}/touch.png`, Buffer.from(r.data, 'base64'));
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
  console.log('parked', await evaluate(`(() => { const rows = [...__game.mode.world.rows.values()].filter(l => l.scenario.id === 'rail'); return rows.filter(l => l.data.state === 'idle').map(l => [Math.abs(l.data.train.x) > 28, l.data.train.mesh.visible]); })()`));
  console.log('gate rules', await evaluate(`(() => { const l = [...__game.mode.world.rows.values()].find(l => l.scenario.id === 'rail'); l.data.down = true; const w = __game.mode.world; const r = l.r;
    return { fromBelowLeftEnd: w.isBlocked(-6, r, r - 1), fromBelowRightEnd: w.isBlocked(6, r, r - 1), fromBelowMiddle: w.isBlocked(0, r, r - 1), fromAboveLeftEnd: w.isBlocked(-6, r, r + 1), fromAboveRightEnd: w.isBlocked(6, r, r + 1), exitUpRight: w.isBlocked(6, r + 1, r), exitUpLeft: w.isBlocked(-6, r + 1, r) }; })()`));
  console.log('gates', await evaluate(`(() => { const l = [...__game.mode.world.rows.values()].find(l => l.scenario.id === 'rail'); return l.data.gates.map(g => [Math.sign(g.position.x), g.position.z]); })()`));
  console.log('rail', await evaluate(`(() => { const rows = [...__game.mode.world.rows.values()].filter(l => l.scenario.id === 'rail'); const types = {}; for (const l of rows) types[l.data.train.type] = (types[l.data.train.type] ?? 0) + 1; return [rows.length, types, rows.filter(l => l.data.train.beds.length).length, rows.filter(l => l.blocked.size).length, rows.reduce((a, l) => a + l.data.puffs.length, 0)] })()`));
  const fsR = await import('node:fs');
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fsR.writeFileSync(`${OUT}/rail-top.png`, Buffer.from(r.data, 'base64'));
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
  // A key held through the bounce must not fire straight back into the bumper.
  console.log('held through bounce', await evaluate(`(() => { const p = __game.mode.players[0]; const lane = __game.mode.world.laneAt(p.row); const m = lane.movers[0]; m.x = p.x + lane.dir * (m.len / 2 + 0.4); m.mesh.position.x = m.x; m.v = 0; m.staller = { phase: 'stop', wait: 99 }; const before = p.bounces ?? 0; p.hop(lane.dir, 0); for (let i = 0; i < 6; i++) p.update(0.03); p.hop(lane.dir, 0); for (let i = 0; i < 12; i++) p.update(0.03); return [ (p.bounces ?? 0) - before, p.buffered ]; })()`));
  // The truck leaves; hopping the same way again must not bounce.
  await evaluate(`(() => { const lane = __game.mode.world.laneAt(__game.mode.players[0].row); lane.movers.forEach((o, i) => { o.x = -12 - i * 4; o.mesh.position.x = o.x; o.v = 0; o.staller = { phase: 'stop', wait: 99 }; }); })()`);
  await sleep(300);
  const dirKey = r[1] > 0 ? 'ArrowRight' : 'ArrowLeft';
  await key(dirKey); await sleep(400);
  console.log('after clear', await evaluate(`[__game.mode.players[0].bounces ?? 0, Math.round(__game.mode.players[0].x), __game.mode.players[0].bouncing, !!__game.mode.players[0].hopCarrier]`));
  await key(dirKey); await sleep(400);
  console.log('and again', await evaluate(`[__game.mode.players[0].bounces ?? 0, Math.round(__game.mode.players[0].x)]`));
}
if (script === 'unlock') {
  await start();
  for (const lv of [1, 3, 6]) {
    await evaluate(`__game.debug.on = true; __game.debug.god = true; __game.debug.force = null; __game.jumpLevel(${lv})`); await sleep(1500);
    console.log('level ' + lv, await evaluate(`(() => { const rows = [...__game.mode.world.rows.values()]; const kinds = {}; for (const l of rows) for (const m of l.movers) { const k = m.kind ?? m.type ?? (m.bed ? 'flatbed' : m.len > 2 ? 'truck' : 'car'); kinds[l.scenario.id + ':' + k] = (kinds[l.scenario.id + ':' + k] ?? 0) + 1; } return kinds; })()`));
  }
  await evaluate(`__game.debug.force = 'road'; __game.jumpLevel(9)`); await sleep(9000);
  console.log('overlaps', await evaluate(`(() => { const bad = []; for (const l of __game.mode.world.rows.values()) { const o = [...l.movers].sort((a, b) => a.x * l.dir - b.x * l.dir); for (let i = 0; i < o.length; i++) { const a = o[i], b = o[(i + 1) % o.length]; if (o.length < 2) continue; let g = (b.x - a.x) * l.dir - (b.len + a.len) / 2; if (i === o.length - 1) g += 26; if (g < -0.1) bad.push([l.scenario.id, l.r, +g.toFixed(2), !!a.reckless, !!b.staller, +a.x.toFixed(1), +b.x.toFixed(1)]); } } return bad; })()`));
  console.log('crashes', await evaluate(`(() => { const rows = [...__game.mode.world.rows.values()].filter(l => l.scenario.id === 'road'); return [rows.reduce((a, l) => a + l.movers.filter(m => m.reckless).length, 0), __game.mode.fx.pieces.length + __game.mode.fx.puffs.length]; })()`));
}
if (script === 'traffic') {
  await start();
  for (const lv of [1, 6]) {
    await evaluate(`__game.debug.on = true; __game.debug.force = 'road'; __game.debug.god = true; __game.jumpLevel(${lv})`); await sleep(3000);
    console.log('level ' + lv, await evaluate(`(() => { const rows = [...__game.mode.world.rows.values()].filter(l => l.scenario.id === 'road'); let minGap = 99, stallers = 0, n = 0, speed = 0; for (const l of rows) { const o = [...l.movers].sort((a, b) => a.x * l.dir - b.x * l.dir); n += o.length; speed += l.speed; for (const m of o) if (m.staller) stallers++; for (let i = 0; i + 1 < o.length; i++) { const g = (o[i+1].x - o[i].x) * l.dir - (o[i+1].len + o[i].len) / 2; minGap = Math.min(minGap, g); } } return { rows: rows.length, perLane: +(n / rows.length).toFixed(1), avgSpeed: +(speed / rows.length).toFixed(1), minGap: +minGap.toFixed(2), stallers }; })()`));
  }
}
if (script === 'halt') {
  await start();
  await evaluate(`__game.debug.on = true; __game.debug.force = 'road'; __game.restartStage()`); await sleep(500);
  // Stand before the first road row with five followers, then hop into the
  // nearest cell with braking room: traffic should brake for the procession,
  // and anything close behind a braking car may rear-end it.
  const setup = await evaluate(`(() => { const lane = [...__game.mode.world.rows.values()].filter(l => l.scenario.id === 'road').sort((a, b) => a.r - b.r)[0];
    const p = __game.mode.players[0]; const tr = __game.mode.trains[0];
    // The cell with the least clear road upstream that still leaves braking room, so a car arrives soon.
    let best = 0, room = 99;
    for (let c = -6; c <= 6; c++) { let d = 99; for (const m of lane.movers) { let g = (c - m.x) * lane.dir - m.len / 2; if (g < -1) g += 70; d = Math.min(d, g); } if (d >= 3 && d < room) { room = d; best = c; } }   // distance around the wrap
    p.row = lane.r - 1; p.z = -p.row; p.x = best; p.col = best; p.mesh.position.set(best, 0, p.z);
    tr.trail = []; for (let i = 0; i < 5; i++) tr.hatch(true);
    return { r: lane.r, dir: lane.dir, speed: +lane.speed.toFixed(1), movers: lane.movers.length, cell: best, room: +room.toFixed(1), followers: tr.count }; })()`);
  console.log('setup', setup);
  await key('ArrowUp');
  let halted = false, blocked = 0, minV = 1, alive = true;
  const polls = Math.min(150, Math.ceil((setup.room / setup.speed + 3) * 10));   // long enough for the nearest car to arrive
  for (let i = 0; i < polls && !halted; i++) {
    await sleep(100);
    const s = await evaluate(`(() => { const lane = __game.mode.world.laneAt(${setup.r}); const p = __game.mode.players[0];
      return { b: lane.blockers?.length ?? 0, v: Math.min(1, ...lane.movers.map(m => m.v)), alive: p.alive, row: p.row }; })()`);
    if (s.b) blocked++;
    minV = Math.min(minV, s.v);
    if (s.b && s.v < 0.2) halted = true;
    alive = s.alive;
  }
  { await evaluate(`__game.run.coins = 20; __game.mode.setTilt(true)`); await sleep(900);   // brake lights read from the side
    const fsH = await import('node:fs'); const r = await send('Page.captureScreenshot', { format: 'png' }); fsH.writeFileSync(`${OUT}/halt.png`, Buffer.from(r.data, 'base64')); }
  const after = await evaluate(`(() => { const lane = __game.mode.world.laneAt(${setup.r}); return { movers: lane.movers.length, v: lane.movers.map(m => +m.v.toFixed(2)) }; })()`);
  console.log('halt', { halted, framesBlocked: blocked, minV: +minV.toFixed(2), player: alive ? 'alive' : 'died', crash: after.movers < setup.movers ? `yes (${setup.movers} -> ${after.movers})` : 'no', v: after.v });
  if (!halted) errors.push('halt: no mover in the blocked lane reached v < 0.2');
}
if (script === 'halt-crash') {
  await start();
  await evaluate(`__game.debug.on = true; __game.debug.force = 'road'; __game.restartStage()`); await sleep(500);
  // A hand-built queue of four cars nose to tail, bearing down on the cell a
  // five-strong procession is about to step into. The lead car brakes hard
  // for the flock; the one behind notices too late and rear-ends it.
  const setup = await evaluate(`(() => { const lane = [...__game.mode.world.rows.values()].filter(l => l.scenario.id === 'road').sort((a, b) => a.r - b.r)[0];
    for (const o of lane.movers) lane.group.remove(o.mesh); lane.movers = [];
    lane.speed = 4.5;
    let front = -lane.dir * 5.5;   // lead bumper 5.5 units upstream of x = 0
    for (let i = 0; i < 4; i++) { const m = __meshes.makeCar(); m.x = front - lane.dir * m.len / 2; m.v = 1; if (lane.dir < 0) m.mesh.rotation.y = Math.PI; lane.add(m.mesh, m.x); lane.movers.push(m); front = m.x - lane.dir * (m.len / 2 + 1); }
    const p = __game.mode.players[0]; const tr = __game.mode.trains[0];
    p.row = lane.r - 1; p.z = -p.row; p.x = 0; p.col = 0; p.mesh.position.set(0, 0, p.z);
    tr.trail = []; for (let i = 0; i < 5; i++) tr.hatch(true);
    return { r: lane.r, dir: lane.dir, gapMin: +lane.gapMin.toFixed(1), movers: lane.movers.length, followers: tr.count }; })()`);
  console.log('setup', setup);
  await key('ArrowUp');
  let halted = false, crashed = false, alive = true;
  for (let i = 0; i < 40 && !(halted && crashed); i++) {
    await sleep(100);
    const s = await evaluate(`(() => { const lane = __game.mode.world.laneAt(${setup.r}); const p = __game.mode.players[0];
      return { b: lane.blockers?.length ?? 0, v: Math.min(1, ...lane.movers.map(m => m.v)), n: lane.movers.length, alive: p.alive }; })()`);
    if (s.b && s.v < 0.2) halted = true;
    if (s.n < setup.movers) crashed = true;
    alive = s.alive;
  }
  const after = await evaluate(`(() => { const lane = __game.mode.world.laneAt(${setup.r}); return { movers: lane.movers.length, v: lane.movers.map(m => +m.v.toFixed(2)) }; })()`);
  console.log('halt-crash', { halted, crash: crashed ? `yes (${setup.movers} -> ${after.movers})` : 'no', player: alive ? 'alive' : 'died', v: after.v });
  if (!halted) errors.push('halt-crash: the lead car never braked for the procession');
  if (!crashed) errors.push('halt-crash: nothing rear-ended the braking car');
}
if (script === 'playtest') {
  await send('Page.navigate', { url: BASE + '?start&level=3&force=rail&god&coins=42&lives=7&chars=goose,pig' }); await sleep(3500);
  console.log('playtest', await evaluate(`[__game.run.level, __game.run.coins, __game.run.lives, __game.roster.map(c => c.id).join('+'), __game.mode.players[0].invincible, [...new Set([...__game.mode.world.rows.values()].filter(l => l.r > 3 && l.r < 12).map(l => l.scenario.id))].join(','), document.getElementById('level').textContent]`));
  await send('Page.navigate', { url: BASE + '?battle&level=2' }); await sleep(3500);
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
  // Ride a take-off out: boarded low, carried up, past the hard edge and gone.
  await evaluate(`__game.restartStage()`); await sleep(700);
  console.log('boarded a take-off:', await evaluate(`(() => {
    const lane = [...__game.mode.world.rows.values()].find((l) => l.scenario.id === 'runway');
    lane.speed = 12;
    const m = lane.movers[0]; m.kind = 'takeoff'; m.x = -10 * lane.dir; m.mesh.position.x = m.x; m.y = 0;   // inside the hard edge, or the ride never happens
    for (const o of lane.movers) if (o !== m) o.x = 90 * lane.dir;   // clear the row so nothing overtakes the ride
    const p = __game.mode.players[0]; p.invincible = false;
    p.row = lane.r - 1; p.z = -p.row; p.x = m.x + lane.dir * 0.1; p.col = Math.round(p.x);
    p.mesh.position.set(p.x, 0, p.z); p.land();
    return !!p.carrier; })()`));
  for (let i = 0; i < 400 && (await evaluate(`__game.mode.players[0].alive`)); i++) await sleep(50);
  console.log('flown off:', await evaluate(`(() => { const p = __game.mode.players[0];
    return { by: p.deadBy, pose: p.deathAnim, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }; })()`));
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
  const walked = await evaluate(`(() => { const p = __game.mode.players[0]; const w = __game.mode.world; const first = [...w.rows.values()].filter(l => l.scenario.id === 'mines').map(l => l.r).sort((a, b) => a - b)[0]; p.row = first - 1; p.col = w.pathCol; p.x = p.col; p.z = -p.row; p.mesh.position.set(p.x, 0, p.z); let r = p.row; for (let i = 0; i < 6; i++) { const l = w.rows.get(r + 1); if (!l || l.scenario.id !== 'mines') break; const c = [...Array(17).keys()].map(k => k - 8).find(c => !l.data.mines.has(c) && Math.abs(c - p.col) <= 1); p.row = r + 1; p.col = c; p.x = c; p.z = -p.row; p.mesh.position.set(p.x, 0, p.z); p.land(); r++; } return [p.row, p.alive]; })()`);
  console.log('walked', walked);
  // Hop onto a mine with a real key press: it arms, the player is rooted, further hops are refused.
  console.log('placed', await evaluate(`(() => { const p = __game.mode.players[0]; const w = __game.mode.world; for (let r = p.row + 1; r < p.row + 12; r++) { const l = w.rows.get(r); if (!l?.data.mines?.size) continue; const c = [...l.data.mines.keys()][0]; p.row = r - 1; p.z = -p.row; p.x = c; p.col = c; p.mesh.position.set(c, 0, p.z); return [r, c]; } return 'none'; })()`));
  await key('ArrowUp'); await sleep(400);
  const rowAfter = await evaluate(`[__game.mode.players[0].row, __game.mode.players[0].frozen, (__game.mode.world.laneAt(__game.mode.players[0].row).data.armed ?? []).length]`);
  await key('ArrowUp'); await sleep(400);
  console.log('stepped by key', rowAfter, await evaluate(`[__game.mode.players[0].row]`));
  await sleep(6000); await key('Enter', 'Enter'); await sleep(800);
  console.log('after blast', await evaluate(`[__game.run.level, __game.mode.constructor.name]`));
  await send('Page.navigate', { url: BASE + '?start&gauntlet=mines&god' }); await sleep(3500);
  await evaluate(`(() => { const p = __game.mode.players[0]; const w = __game.mode.world; const first = [...w.rows.values()].filter(l => l.scenario.id === 'mines').map(l => l.r).sort((a, b) => a - b)[0]; p.row = first - 1; p.col = w.pathCol; p.x = p.col; p.z = -p.row; p.mesh.position.set(p.x, 0, p.z); })()`);
  console.log('any-cell flag', await evaluate(`(() => { const p = __game.mode.players[0]; p.facing = Math.PI; __game.mode.plantFlag(p); const [c, r] = p.ahead(); return [r < p.row, __game.mode.world.laneAt(r).flags.has(c)]; })()`));
  // Flag the mine ahead, then the finale: cross the line and let them all go up.
  const flagged = await evaluate(`(() => { const p = __game.mode.players[0]; const w = __game.mode.world; const l = w.rows.get(p.row + 1); const c = [...l.data.mines.keys()][0]; if (c === undefined) return 'no mine'; p.x = c; p.col = c; p.mesh.position.x = c; p.facing = 0; __game.mode.plantFlag(p); l.scenario.onFollowerLand(l, c); return [l.flags.has(c), l.data.mines.has(c), l.data.sweeps.length]; })()`);
  console.log('flagged', flagged);
  await evaluate(`__game.mode.finished = true`); await sleep(6500);
  console.log('finale', await evaluate(`(() => { const rows = [...__game.mode.world.rows.values()].filter(l => l.scenario.id === 'mines'); return [rows.reduce((a, l) => a + l.data.mines.size, 0), rows.reduce((a, l) => a + (l.data.hits ?? 0), 0), document.getElementById('card').textContent.includes('FLAGS')]; })()`));
  await sleep(6000); await key('Enter', 'Enter'); await sleep(800);
  console.log('after', await evaluate(`[__game.run.level, __game.mode.constructor.name]`));
}
if (script === 'swim') {
  await send('Page.navigate', { url: BASE + '?start&force=river&chars=duck&coins=50' }); await sleep(3500);
  const r = await evaluate(`(() => { const p = __game.mode.players[0]; const lane = [...__game.mode.world.rows.values()].find(l => l.scenario.id === 'river'); for (const m of lane.movers) { m.x = -12; m.mesh.position.x = -12; } p.row = lane.r; p.col = 3; p.x = 3; p.z = -lane.r; p.mesh.position.set(3, 0, p.z); p.land(); return [p.swims, p.alive, !!p.carrier]; })()`);
  await sleep(400);
  console.log('duck swims', r, await evaluate(`[__game.mode.players[0].alive, Math.round(__game.mode.players[0].y * 10) / 10]`));
  console.log('paddle', await evaluate(`(() => { const p = __game.mode.players[0]; const w = __game.mode.world; const next = w.laneAt(p.row + 1); if (next.scenario.id !== 'river') return 'next not river'; for (const m of next.movers) { m.x = -12; m.mesh.position.x = -12; } p.hop(0, 1); const ys = []; for (let i = 0; i < 8; i++) { p.update(0.02); ys.push(Math.round(p.y * 100) / 100); } return [p.paddling, Math.max(...ys), Math.min(...ys)]; })()`));
  console.log('young swim', await evaluate(`(() => { const p = __game.mode.players[0]; const tr = __game.mode.trains[0]; tr.hatch(true); const k = tr.chicks[0]; tr.update(0.02, 0); const y1 = Math.round(k.mesh.position.y * 100) / 100; const lane = __game.mode.world.laneAt(k.rec.row); const len = 3; const m = { mesh: __meshes.makeLog(len), len, bed: [-len / 2, len / 2], rideY: 0, kind: 'log', x: k.mesh.position.x, v: 1 }; lane.add(m.mesh, m.x); lane.movers.push(m); tr.update(0.02, 0); return [y1, !!k.rec.carrier]; })()`));
  // A log drifting onto the duck picks it up; a boat runs it down.
  console.log('log pickup', await evaluate(`(() => { const p = __game.mode.players[0]; const lane = __game.mode.world.laneAt(p.row); const len = 3; const m = { mesh: __meshes.makeLog(len), len, bed: [-len / 2, len / 2], rideY: 0, kind: 'log', x: p.x, v: 1 }; lane.add(m.mesh, m.x); lane.movers.push(m); p.update(0.016); return [!!p.carrier, p.alive]; })()`));
  console.log('boat hit', await evaluate(`(() => { const p = __game.mode.players[0]; p.carrier = null; const lane = __game.mode.world.laneAt(p.row); lane.movers.forEach(o => lane.group.remove(o.mesh)); lane.movers = []; const m = __meshes.makeRiverBoat(); m.kind = 'boat'; m.x = p.x; m.v = 1; lane.add(m.mesh, m.x); lane.movers.push(m); p.update(0.016); return [p.alive, p.deadBy]; })()`));
  await send('Page.navigate', { url: BASE + '?start&level=4&gauntlet=mines' }); await sleep(3500);
  console.log('mines url', await evaluate(`[__game.run.gauntlet, [...new Set([...__game.mode.world.rows.values()].filter(l => l.r > 3 && l.r < 12).map(l => l.scenario.id))].join(',')]`));
}
if (script === 'logedge') {
  await send('Page.navigate', { url: BASE + '?start&force=river&coins=50' }); await sleep(3500);
  console.log('log ends', await evaluate(`(() => { const p = __game.mode.players[0]; const lane = [...__game.mode.world.rows.values()].find(l => l.scenario.id === 'river'); lane.movers.forEach(o => lane.group.remove(o.mesh)); lane.movers = []; const len = 3; const m = { mesh: __meshes.makeLog(len), len, bed: [-len / 2, len / 2], rideY: 0, kind: 'log', x: 0, v: 1 }; lane.add(m.mesh, 0); lane.movers.push(m);
    const out = []; for (const x of [-1.7, -1.45, 0, 1.45, 1.7, 2.0]) { p.reset(); p.row = lane.r; p.z = -lane.r; p.x = x; p.col = Math.round(x); p.mesh.position.set(x, 0, p.z); p.land(); out.push([x, p.alive && !!p.carrier ? 'ride' : p.alive ? 'swim?' : p.deadBy]); } return out; })()`));
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
if (script === 'phone' || script === 'tablet') {
  const fs = await import('node:fs');
  const out = OUT;
  const shot = async (n) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${out}/${n}.png`, Buffer.from(r.data, 'base64')); };
  // A real device shape: the badge, the picks, the framed intro and the board
  // all have to share it. Tablet portrait is the other side of the camera cap.
  const size = script === 'tablet' ? { width: 820, height: 1180 } : { width: 400, height: 720 };
  await send('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url: BASE });
  const shown = `document.getElementById('intro')?.classList.contains('show')`;
  while (!(await evaluate(shown))) await sleep(50);
  await sleep(2400); await shot(`${script}-intro`);
  for (let i = 0; i < 200 && (await evaluate(`document.getElementById('intro')?.hidden`)) === false; i++) await sleep(100);
  await sleep(700); await shot(`${script}-title`);
  await key('ArrowRight'); await sleep(300); await key('ArrowRight'); await sleep(1200);
  await shot(`${script}-select`);   // a pick two along has to sit centred, not half off
  await key('Enter', 'Enter'); await sleep(5000);
  await shot(`${script}-play`);
  // Pan and scan: a narrow window cannot hold all 17 columns, so walking to the
  // board edge must bring the view with it rather than leave the player off it.
  await evaluate(`__game.debug.god = true`);
  for (let i = 0; i < 10; i++) { await key('ArrowLeft'); await sleep(180); }
  await sleep(900); await shot(`${script}-edge`);
  console.log('at the left edge:', await evaluate(`(() => { const p = __game.mode.players[0], c = __game.camera;
    return { x: Math.round(p.x * 10) / 10, cam: Math.round(c.rig.position.x * 10) / 10,
             halfW: Math.round(c.halfW * 10) / 10, onScreen: Math.abs(p.x - c.rig.position.x) < c.halfW }; })()`));
  for (let i = 0; i < 10; i++) { await key('ArrowRight'); await sleep(180); }
  await sleep(600);
  await evaluate(`__game.run.coins = 50`);
  await key('Space', ' '); await sleep(1800); await shot(`${script}-iso`);
  await key('Space', ' '); await sleep(400);
  await evaluate(`for (let i = 0; i < 3; i++) __game.mode.trains[0].hatch(true); __game.mode.finished = true`); await sleep(9000);
  await key('Enter', 'Enter'); await sleep(6000); await shot(`${script}-battle`);
  await key('ShiftLeft', 'Shift'); await sleep(1600);
  await shot(`${script}-battle-sea`);   // the placard is the only visible aim control on touch
  console.log('aim placard:', await evaluate(`document.getElementById('view').textContent`));
  await evaluate(`__game.debug.force = 'mines'; __game.restartStage()`); await sleep(3000);
  await shot(`${script}-mines`);   // turn and flag: reachable only from these buttons on touch
  console.log('mines controls:', await evaluate(`document.body.classList.contains('mines')`));
  // Tap the flag button for real: the handler calls setPointerCapture, which a
  // synthetic PointerEvent cannot satisfy, so the press has to come from CDP.
  const flagCount = `[...__game.mode.world.rows.values()].reduce((a, l) => a + (l.flags?.size ?? 0), 0)`;
  const box = await evaluate(`(() => { const b = document.querySelector('#touchbar .mine.f'); if (!b) return null;
    const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  const before = await evaluate(flagCount);
  for (const type of ['mousePressed', 'mouseReleased'])
    await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1, pointerType: 'touch' });
  await sleep(400);
  console.log('flags planted by the button:', before, '->', await evaluate(flagCount));
  await evaluate(`__game.debug.force = null`);
  await send('Emulation.clearDeviceMetricsOverride');
  console.log(`${script} shots written to`, out);
}
if (script === 'reach') {
  await start();
  // Where does each view actually put the ground at the screen edges? Unproject
  // the four corners onto y = 0 and take the widest |x|. Anything that wraps
  // inside that is a mover popping into existence in plain sight.
  const reach = `(() => { const c = __game.camera.camera; const v = c.position.clone();
    let max = 0;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      v.set(sx, sy, 0.5).unproject(c);
      const d = v.sub(c.position).normalize();
      if (d.y >= -1e-4) { max = Infinity; break; }         // that corner is above the horizon
      const t = -c.position.y / d.y;
      max = Math.max(max, Math.abs(c.position.x + d.x * t));
    }
    return Math.round(max * 10) / 10; })()`;
  await evaluate(`__game.run.coins = 90`);
  console.log('top-down reach  :', await evaluate(reach));
  await key('Space', ' '); await sleep(2500);
  console.log('tilted reach    :', await evaluate(reach));
  // Movers must exist out past the screen edge, or the wrap happens in view.
  console.log('movers reach out:', await evaluate(`(() => { let max = 0;
    for (const l of __game.mode.world.rows.values()) for (const m of l.movers) max = Math.max(max, Math.abs(m.x));
    return Math.round(max * 10) / 10; })()`));
  await key('Space', ' ');
}
if (script === 'burn') {
  const fs = await import('node:fs');
  const shot = async (n) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${OUT}/${n}.png`, Buffer.from(r.data, 'base64')); };
  await start();
  await evaluate(`__game.mode.finished = true`); await sleep(9000);
  await key('Enter', 'Enter'); await sleep(4000);
  // Light the tree nearest the pilot, so the camera is already looking at it.
  console.log('lit', await evaluate(`(() => { const m = __game.mode, pilot = m.pilots?.[0] ?? m.players?.[0];
    const trees = m.props.filter((q) => q.mesh.userData.burns);
    if (!trees.length) return 'no trees in this theme';
    const px = pilot?.cx ?? 0, pz = pilot?.cz ?? 0;
    const d2 = (q) => (q.x - px) ** 2 + (q.z - pz) ** 2;   // nearest in both axes, or it lights up on the horizon
    trees.sort((a, b) => d2(a) - d2(b));
    m.smash(trees[0]);
    return { burning: m.burning.length, canopyHidden: trees[0].mesh.children.filter((c) => !c.visible).length,
             dx: Math.round((trees[0].x - px) * 10) / 10, dz: Math.round((trees[0].z - pz) * 10) / 10 }; })()`));
  const burnT = `__game.mode.burning[0]?.t ?? 9`;
  for (let i = 0; i < 200 && (await evaluate(burnT)) < 0.12; i++) await sleep(30);
  await shot('burn-fire');
  for (let i = 0; i < 200 && (await evaluate(burnT)) < 0.55; i++) await sleep(30);
  await shot('burn-stick');
  for (let i = 0; i < 300 && (await evaluate(`__game.mode.burning.length`)) > 0; i++) await sleep(50);
  console.log('after it crumbles, burning left:', await evaluate(`__game.mode.burning.length`));
  await shot('burn-gone');
}
if (script === 'poses') {
  const fs = await import('node:fs');
  const shot = async (n) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${OUT}/${n}.png`, Buffer.from(r.data, 'base64')); };
  await start();
  // Poses are drawn at random, so force each one in turn. A train does the
  // killing: it has the longest squash, which makes the pancake obvious.
  await evaluate(`__game.run.lives = 99; __game.mode.players[0].invincible = false`);
  for (const pose of ['flat', 'pancake', 'halo', 'pieces', 'hole', 'beam', 'roulette', 'fade', 'sink', 'launch']) {
    // `gone` holds the death open: without it the stage restarts 1.7s in and a
    // slow capture photographs the fresh player instead of the pose.
    await evaluate(`(() => { const p = __game.mode.players[0]; p.invincible = false; p.die('train'); p.deathAnim = '${pose}'; p.gone = true; })()`);
    // Wall time is no guide here: the software renderer runs the game clock at a
    // fraction of it, so wait on deadFor itself.
    for (let i = 0; i < 300 && (await evaluate(`__game.mode.players[0].deadFor`)) < 1.25; i++) await sleep(50);
    console.log(pose, await evaluate(`(() => { const p = __game.mode.players[0], m = p.mesh, s = m.scale;
      return { anim: p.deathAnim, t: Math.round((p.deadFor - 0.8) * 100) / 100, vis: m.visible,
               scale: [s.x, s.y, s.z].map((v) => Math.round(v * 100) / 100).join(','),
               y: Math.round(m.position.y * 100) / 100 }; })()`));
    await shot(`pose-${pose}`);
    await evaluate(`__game.run.lives = 99; __game.restartStage()`);
    await sleep(900);
  }
  // Arrivals are short, so drive them directly rather than trying to catch one.
  // Every pose must have one: a character that just vanishes is the thing this
  // is all meant to avoid. Each has to finish and leave a sane transform.
  for (const pose of ['flat', 'pancake', 'halo', 'pieces', 'hole', 'beam', 'roulette', 'fade', 'sink', 'launch']) {
    await evaluate(`__game.mode.players[0].arrive('${pose}')`);
    // Wait on the arrival's own clock for the same reason the poses do; 0.2s of
    // game time is about a second of wall time here, a far easier frame to hit.
    if (pose === 'pancake') {
      for (let i = 0; i < 100 && (await evaluate(`__game.mode.players[0].arriving?.t ?? 1`)) < 0.18; i++) await sleep(20);
      await shot('arrive-pancake');
    }
    for (let i = 0; i < 200 && (await evaluate(`!!__game.mode.players[0].arriving`)); i++) await sleep(40);
    console.log('arrive', pose, await evaluate(`(() => { const m = __game.mode.players[0].mesh, s = m.scale;
      const fin = [s.x, s.y, s.z].every(Number.isFinite);
      return { vis: m.visible, scale: [s.x, s.y, s.z].map((v) => Math.round(v * 100) / 100).join(','), finite: fin }; })()`));
  }
  console.log('pose shots written to', OUT);
}
if (script === 'logo') {
  const fs = await import('node:fs');
  const out = OUT;
  const shot = async (n) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${out}/${n}.png`, Buffer.from(r.data, 'base64')); };
  // Reload so the attract intro runs from the top. Module load time varies, so
  // anchor to the frame actually appearing, then shoot at offsets from there.
  await send('Page.navigate', { url: BASE });
  const shown = `document.getElementById('intro')?.classList.contains('show')`;
  while (!(await evaluate(shown))) await sleep(50);
  const t0 = Date.now();
  const at = async (ms, n) => { await sleep(Math.max(0, ms - (Date.now() - t0))); await shot(n); };
  await at(500, 'logo-fall');    // crossing sign planted, town sign still falling
  await at(1150, 'logo-slam');   // landed, still straight
  await at(2300, 'logo-creak');  // leaning on the post that gave
  await at(4600, 'logo-title');  // frame gone, insert-coin screen with the static sign
  await key('KeyI', 'i'); await sleep(6000); await shot('logo-about');
  await key('Escape', 'Escape'); await sleep(500);
  // Browsing the roster must not be interrupted: a pick keypress drops the
  // sign at once and starts the idle count again.
  await send('Page.navigate', { url: BASE });
  while (!(await evaluate(shown))) await sleep(50);
  await sleep(1200);
  const up = await evaluate(shown);
  await key('ArrowRight'); await sleep(600);
  console.log('sign up, then a pick keypress:', up, '->', await evaluate(shown));
  await sleep(3000);
  console.log('still held off 3s later:', (await evaluate(shown)) === false);
  console.log('logo shots written to', out);
}
if (script === 'shots') {
  const fs0 = await import('node:fs');
  // The attract intro takes the screen for a stretch of every loop; wait it out
  // so select.png shows the character select rather than the framed sign.
  for (let i = 0; i < 200 && !(await evaluate(`document.getElementById('intro')?.hidden !== false`)); i++) await sleep(100);
  await sleep(600);
  { const r = await send('Page.captureScreenshot', { format: 'png' }); fs0.writeFileSync(`${OUT}/select.png`, Buffer.from(r.data, 'base64')); }
  await key('KeyI', 'i'); await sleep(6000);
  { const r = await send('Page.captureScreenshot', { format: 'png' }); fs0.writeFileSync(`${OUT}/about.png`, Buffer.from(r.data, 'base64')); }
  await key('Escape', 'Escape'); await sleep(300);
  await key('ArrowRight'); await sleep(400);
  { const r = await send('Page.captureScreenshot', { format: 'png' }); fs0.writeFileSync(`${OUT}/select-spin.png`, Buffer.from(r.data, 'base64')); }
  await start();
  // Screenshots of each view for eyeballing. Written to OUT (default: cwd).
  const fs = await import('node:fs');
  const out = OUT;
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
  await evaluate(`for (let i = 0; i < 3; i++) __game.mode.trains[0].hatch(true); __game.mode.finished = true`); await sleep(7500); await shot('tally');
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
  console.log('plow', await evaluate(`(() => { const m = __game.mode; const dir = m.rowDir.land; const car = __meshes.makeCar(); car.kind = 'land'; car.points = 10; car.dir = dir; car.speed = 3; car.z = 4; car.x = 0; car.mesh.position.set(0, 0, -4); m.group.add(car.mesh); m.targets.push(car);
    const train = __meshes.makeTrain('bullet', ['closed', 'closed']); train.kind = 'land'; train.points = 60; train.dir = dir; train.speed = 7; train.z = 4; train.x = 0.3; train.mesh.position.set(0.3, 0, -4); m.group.add(train.mesh); m.targets.push(train);
    m.plow(); return [m.targets.includes(train), m.targets.includes(car)]; })()`));
  console.log('one way', await evaluate(`(() => { const m = __game.mode; const dirs = {}; for (const t of m.targets) (dirs[t.kind] ??= new Set()).add(t.dir); return Object.fromEntries(Object.entries(dirs).map(([k, v]) => [k, v.size])); })()`));
  await evaluate(`__game.mode.timeLeft = 0.1`);
  await sleep(4000);
  console.log('battle summary', await evaluate(`[...document.querySelectorAll('#summary .row')].map(r => r.textContent).join(' | ')`));
  await sleep(5000); await key('Enter', 'Enter'); await sleep(800);
  console.log('next level', await state());
  for (let i = 0; i < 4; i++) { await key('ArrowUp'); await sleep(220); }
  console.log('level 2 hops', await state());
}
if (script === 'perks') {
  // Movement perks: the chicken over fences, the pig through bushes, the frog's
  // long jump, the robot that never bounces and never swims. Each run lays its
  // own obstacle so the board's dice do not decide the test.
  const load = async (q) => {
    await send('Page.navigate', { url: BASE + q }); await sleep(3500);
  };
  const check = (ok, msg) => { if (!ok) errors.push(`perks: ${msg}`); };

  await load('?start&force=meadow&scenery=residential&chars=chicken');
  const chicken = await evaluate(`(() => { const p = __game.mode.players[0]; const w = __game.mode.world; const r = p.row + 1; const lane = w.laneAt(r);
    lane.add(__meshes.makeFence(), 0); lane.block(0, 'fence'); lane.add(__meshes.makeShrub(), 2); lane.block(2, 'bush');
    const before = [w.isBlocked(0, r, r - 1), w.isBlocked(0, r, r - 1, p), w.isBlocked(2, r, r - 1, p)];
    p.hop(0, 1); for (let i = 0; i < 12 && p.moving; i++) p.update(0.02);
    const perch = +p.y.toFixed(2); const tr = __game.mode.trains[0]; tr.hatch(true); const y = tr.chicks[0] ? +tr.restY(tr.chicks[0].rec).toFixed(2) : null;
    p.hop(0, 1); for (let i = 0; i < 12 && p.moving; i++) p.update(0.02);
    return { fences: p.fences, blockedForAll: before[0], fenceForChicken: before[1], bushForChicken: before[2], row: p.row - r, perch, youngY: y, off: +p.y.toFixed(2) }; })()`);
  console.log('chicken', chicken);
  check(chicken.fences && chicken.blockedForAll && !chicken.fenceForChicken, 'a fence cell is not passable for the chicken alone');
  check(chicken.bushForChicken, 'the chicken walked through a shrub');
  check(chicken.row === 1 && chicken.perch > 0.5, `the chicken did not perch on the fence (row +${chicken.row}, y ${chicken.perch})`);
  check(chicken.youngY === chicken.perch, `a hatched chick did not share the perch (${chicken.youngY})`);
  check(chicken.off === 0, `the chicken did not come back down off the fence (y ${chicken.off})`);

  await load('?start&force=hedge&chars=pig');
  const pig = await evaluate(`(() => { const p = __game.mode.players[0]; const w = __game.mode.world; const lane = [...w.rows.values()].filter(l => l.scenario.id === 'hedge' && l.r > p.row).sort((a, b) => a.r - b.r)[0];
    if (!lane) return { none: true };
    const c = [...lane.blocked].find(k => lane.blockKind(k) === 'bush' && Math.abs(k) < 8);
    p.row = lane.r - 1; p.z = -p.row; p.x = c; p.col = c; p.mesh.position.set(c, 0, p.z);
    const puffs = __game.mode.fx.puffs.length;
    const before = [w.isBlocked(c, lane.r, lane.r - 1), w.isBlocked(c, lane.r, lane.r - 1, p)];
    p.hop(0, 1); for (let i = 0; i < 12 && p.moving; i++) p.update(0.02);
    return { bushes: p.bushes, cell: c, blockedForAll: before[0], forPig: before[1], row: p.row - lane.r, puffs: __game.mode.fx.puffs.length - puffs }; })()`);
  console.log('pig', pig);
  check(!pig.none, 'no hedge row was built');
  check(pig.bushes && pig.blockedForAll && !pig.forPig, 'a hedge cell is not passable for the pig alone');
  check(pig.row === 0, `the pig did not push into the hedge (row ${pig.row})`);
  check(pig.puffs > 0, 'no leaves flew when the pig pushed through');

  await load('?start&force=meadow&chars=frog');
  const frog = await evaluate(`(() => { const p = __game.mode.players[0]; const w = __game.mode.world; const r0 = p.row;
    const run = () => { for (let i = 0; i < 40 && p.moving; i++) p.update(0.02); };
    p.hop(0, 1); p.update(0.02); const top = []; p.hop(0, 1); const long = p.long; for (let i = 0; i < 40 && p.moving; i++) { p.update(0.02); top.push(p.y); }
    const twoRows = p.row - r0;
    p.hop(0, 1); run(); p.hop(0, 1); run();   // two taps a whole hop apart are two hops
    const single = p.row - r0 - twoRows;
    const lane = w.laneAt(p.row + 2); lane.add(__meshes.makeHedge(), p.col); lane.block(p.col, 'bush');
    const r1 = p.row; p.hop(0, 1); p.update(0.02); const refused = !p.extend(0, 1); run();
    return { longJump: p.longJump, long, twoRows, peak: +Math.max(...top).toFixed(2), single, refused, intoBlock: p.row - r1 }; })()`);
  console.log('frog', frog);
  check(frog.longJump && frog.long && frog.twoRows === 2, `the double-tap did not land two rows up (+${frog.twoRows})`);
  check(frog.peak > 0.6, `the long jump arc stayed low (${frog.peak})`);
  check(frog.single === 2, `two spaced taps did not make two single hops (+${frog.single})`);
  check(frog.refused && frog.intoBlock === 1, 'a long jump was allowed into a blocked row');

  await load('?start&force=road&chars=robot');
  const robot = await evaluate(`(() => { const p = __game.mode.players[0]; const w = __game.mode.world; const lane = [...w.rows.values()].filter(l => l.scenario.id === 'road' && l.r > p.row).sort((a, b) => a.r - b.r)[0];
    const m = lane.movers[0]; lane.movers.forEach((o, i) => { o.x = i === 0 ? 2 : -12 - i * 4; o.mesh.position.x = o.x; o.v = 1; o.staller = null; });
    const park = (x) => { p.row = lane.r; p.z = -lane.r; p.x = x; p.col = Math.round(x); p.mesh.position.set(x, 0, p.z); };
    park(m.x - lane.dir * (m.len / 2 + 0.3)); const x0 = p.x;
    for (let i = 0; i < 10; i++) { p.update(0.02); m.x += lane.dir * 0.02; m.mesh.position.x = m.x; }
    const rear = { alive: p.alive, bounces: p.bounces ?? 0, moved: +Math.abs(p.x - x0).toFixed(2) };
    park(m.x); p.update(0.02);
    const under = { alive: p.alive, by: p.deadBy };
    return { heavy: p.heavy, swims: p.swims, rear, under }; })()`);
  console.log('robot road', robot);
  check(robot.heavy && !robot.swims, 'the robot is not heavy or still swims');
  check(robot.rear.alive && robot.rear.bounces === 0 && robot.rear.moved === 0, 'the robot bounced or died at a rear bumper');
  check(!robot.under.alive && robot.under.by === 'car', `the robot under a car did not die of it (${robot.under.by})`);
  await evaluate(`__game.debug.on = true; __game.debug.force = 'river'; __game.restartStage()`); await sleep(500);
  const sink = await evaluate(`(() => { const p = __game.mode.players[0]; const lane = [...__game.mode.world.rows.values()].filter(l => l.scenario.id === 'river' && l.r > p.row).sort((a, b) => a.r - b.r)[0];
    for (const o of lane.movers) { o.x = -20; o.mesh.position.x = -20; }
    p.row = lane.r; p.z = -lane.r; p.x = 0; p.col = 0; p.mesh.position.set(0, 0, p.z); p.land();
    return { alive: p.alive, by: p.deadBy }; })()`);
  console.log('robot river', sink);
  check(!sink.alive && sink.by === 'water', `the robot on open water did not sink (${sink.by})`);
}
if (script === 'perks2') {
  // Cat: the first death on each level is free and the card says so; the second costs a life.
  await send('Page.navigate', { url: BASE + '?start&chars=cat' }); await sleep(3500);
  console.log('cat', await evaluate(`[__game.roster[0].id, __game.mode.players[0].nineLives, __game.run.freeDeathUsed]`));
  const dieAndWatch = async () => {
    await evaluate(`__game.run.lives = __game.run.lives; __game.mode.players[0].die('car')`);
    let card = '';
    for (let i = 0; i < 30; i++) { await sleep(100); const c = await evaluate(`document.getElementById('card').textContent`); if (c.includes('NINE')) card = c; }
    return card;
  };
  await evaluate(`__game.run.lives = 2`);
  const card1 = await dieAndWatch();
  const free = await evaluate(`[__game.run.lives, __game.run.freeDeathUsed, __game.over]`);
  console.log('free death', { card: card1, lives: free[0], used: free[1], over: free[2] });
  if (free[0] !== 2) errors.push(`perks2: the cat's first death spent a life (lives ${free[0]})`);
  if (!card1.includes('NINE LIVES')) errors.push('perks2: the death card never said NINE LIVES');
  const card2 = await dieAndWatch();
  const paid = await evaluate(`[__game.run.lives, __game.run.freeDeathUsed]`);
  console.log('second death', { card: card2, lives: paid[0], used: paid[1] });
  if (paid[0] !== 1) errors.push(`perks2: the cat's second death did not cost a life (lives ${paid[0]})`);
  if (card2) errors.push('perks2: the second death was called free');
  await evaluate(`__game.nextLevel()`); await sleep(300);
  console.log('next level resets', await evaluate(`[__game.run.level, __game.run.freeDeathUsed]`));
  if (await evaluate(`__game.run.freeDeathUsed`)) errors.push('perks2: a new level did not give the free death back');

  // Goose: H moves a stalled car on; a car halted for a blocker stays; the button shows on touch.
  await send('Page.navigate', { url: BASE + '?touch=1&start&force=road&chars=goose&god' }); await sleep(3500);
  const setup = await evaluate(`(() => { const lane = [...__game.mode.world.rows.values()].filter(l => l.scenario.id === 'road' && l.r > 0).sort((a, b) => a.r - b.r)[0];
    const p = __game.mode.players[0];
    // A mover parked in a clear cell near the middle as a stopped staller; the goose one row short of it.
    const park = (m) => { for (let c = 0; c <= 8; c = c > 0 ? -c : -c + 1) { if (lane.movers.every(o => o === m || Math.abs(o.x - c) > (o.len + m.len) / 2 + 1)) { m.x = c; m.mesh.position.x = c; return c; } } return null; };
    const stall = (m) => { m.staller ??= { phase: 'go', wait: 5 }; m.staller.phase = 'stop'; m.staller.wait = 99; m.v = 0; m.braking = 1; return park(m); };
    const m = [...lane.movers].sort((a, b) => Math.abs(a.x) - Math.abs(b.x))[0];
    const x = stall(m);
    window.__honk = { lane, m, stall };
    p.row = lane.r - 1; p.z = -p.row; p.x = x; p.col = x; p.mesh.position.set(x, 0, p.z);
    return { r: lane.r, moverX: +m.x.toFixed(1), player: x, honk: p.honk, hint: __game.mode.hint, body: document.body.classList.contains('honk'),
      button: getComputedStyle(document.querySelector('#touchbar .perk.honk')).display }; })()`);
  console.log('goose setup', setup);
  if (!setup.hint.includes('H honk')) errors.push('perks2: the hint does not mention the honk');
  if (!setup.body || setup.button !== 'block') errors.push('perks2: the honk button is not shown for a goose');
  await sleep(300);
  console.log('before honk', await evaluate(`[+__honk.m.v.toFixed(2), __honk.m.staller.phase]`));
  await key('KeyH', 'h');
  let v = 0, phase = '';
  for (let i = 0; i < 20 && v <= 0.5; i++) { await sleep(100); [v, phase] = await evaluate(`[__honk.m.v, __honk.m.staller.phase]`); }
  console.log('after honk', { v: +v.toFixed(2), phase, again: await evaluate(`__game.mode.honk(__game.mode.players[0])`) });
  if (v <= 0.5) errors.push(`perks2: the stalled car did not pull away after the honk (v ${v.toFixed(2)})`);
  if (phase !== 'go') errors.push('perks2: the honked staller is still in its stop phase');
  await sleep(1600);   // past the cooldown
  const held = await evaluate(`(() => { const { lane, stall } = __honk; const m = __honk.m;
    const x = stall(m);   // stopped again, this time behind a blocker
    lane.blockers = [{ x: m.x + lane.dir * (m.len / 2 + 0.5), n: 1 }];
    const p = __game.mode.players[0]; p.x = x; p.col = x; p.mesh.position.x = x;
    const n = __game.mode.honk(p); const v = m.v; lane.blockers = null; return { x, scattered: n, v: +v.toFixed(2), phase: m.staller.phase }; })()`);
  console.log('blocked car', held);
  if (held.scattered !== 0 || held.v > 0.2) errors.push('perks2: a honk moved a car that was halted for a blocker');
  const chickenHonk = await evaluate(`(() => { const p = __game.mode.players[0]; p.honk = false; return __game.mode.honk(p); })()`);
  if (chickenHonk !== 0) errors.push('perks2: a non-goose honked');
}
console.log('errors:', errors.length ? errors : 'none');
ws.close();
process.exit(0);
