// Headless smoke test over CDP: load the game, play some hops, report errors.
const PORT = Number(process.env.CDP_PORT ?? 9333);   // a private Chrome when :9333 is taken
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
// The stage sign is dropped and switched off for the rest of the run, so the
// timings below read the board rather than the banner. The banner branch drives
// it on its own.
const start = async () => { await key('Enter', 'Enter'); await sleep(4500); await evaluate(`__game.banner.skip(); __game.debug.quickBanner = true`); console.log('start', await state()); };
// Screenshots land in shots/ unless OUT says otherwise (make shots points it at
// docs/screenshots). shots/ is gitignored, so running a scenario by hand never
// drops PNGs in the repo root.
const OUT = process.env.OUT ?? 'shots';
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
const script = process.argv[2] ?? 'hops';
// Barrier variants, each shot straight down and tilted with the player at the
// weak column two rows short of the row, in a scenery that suits it.
const BARRIERS = { hedge: 'forest', trees: 'forest', busStop: 'city', picket: 'residential', chainlink: 'parking', wall: 'city' };
const barrierShots = async (v, shot) => {
  await evaluate(`__game.debug.force = '${v}'; __game.debug.sky = 'day'; __game.debug.scenery = '${BARRIERS[v]}'; __game.run.level = 1; __game.restartStage(); __game.run.coins = 50`); await sleep(500);
  for (let i = 0; i < 4; i++) { await key('ArrowUp'); await sleep(200); }
  await evaluate(`(() => { const p = __game.mode.player; const l = __game.mode.world.laneAt(p.row + 1); const c = l.data.weak ?? 0; p.x = c; p.col = c; p.mesh.position.x = c; })()`);
  await sleep(700); await shot(`barrier-${v}-top`);
  await key('Space', ' '); await sleep(1500); await shot(`barrier-${v}-iso`);
  await key('Space', ' '); await sleep(300);
};
// The maze gauntlet at level 1 (always a road maze) in the forest by day, shot
// straight down and tilted with the player standing beside the lowest weakness.
const mazeShots = async (shot) => {
  await evaluate(`__game.debug.force = null; __game.debug.sky = 'day'; __game.debug.scenery = 'forest'; __game.debug.god = true; __game.run.level = 1; __game.run.gauntlet = 'maze'; __game.restartStage(); __game.run.coins = 50`); await sleep(900);
  await evaluate(`(() => { const m = __game.mode.world.data.maze; const put = (i, j) => { const p = __game.mode.player; const row = m.firstRow + j, x = i - 8; p.row = row; p.col = x; p.x = x; p.z = -row; p.mesh.position.set(x, 0, -row); };
    for (let j = 1; j < m.rows - 1; j++) for (let i = 1; i < m.grid[j].length - 1; i++) if (m.grid[j][i] === 2) { const below = m.grid[j - 1][i] === 1 && m.grid[j + 1][i] === 1; put(below ? i : i - 1, below ? j - 1 : j); return; }
    put(m.path[1], 1); })()`);
  await sleep(700);
  const seen = await evaluate(`(() => { const m = __game.mode.world.data.maze; return { kind: m.kind, wall: m.wall, rows: m.rows, ghosts: m.ghosts.all.filter(g => g.mesh).length }; })()`);
  await shot('maze-top');
  await key('Space', ' '); await sleep(1500); await shot('maze-iso');
  await key('Space', ' '); await sleep(300);
  await evaluate(`__game.run.gauntlet = null; __game.debug.scenery = null`);
  return seen;
};
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
  await sleep(7000);
  // The grievance report: header, quip, the FILED stamp and the ruling stamp.
  const report = await evaluate(`({ header: document.querySelector('#summary .header')?.textContent, title: document.getElementById('summary-title').textContent, quip: document.querySelector('#summary .quip')?.textContent, stamp: document.querySelector('#summary .rubber.filed')?.textContent ?? null, ruling: document.querySelector('#summary .rubber.ruling')?.textContent ?? null, seal: !!document.querySelector('#summary .seal .dpg') })`);
  console.log('report', report);
  if (report.header !== 'DEPARTMENT OF PEDESTRIAN GRIEVANCES') errors.push(`tally: header read ${JSON.stringify(report.header)}`);
  if (!report.stamp) errors.push('tally: the FILED stamp never landed');
  if (!report.ruling) errors.push('tally: no ruling stamp');
  { const fsT = await import('node:fs'); const r = await send('Page.captureScreenshot', { format: 'png' }); fsT.writeFileSync(`${OUT}/report.png`, Buffer.from(r.data, 'base64')); }
  await key('ArrowUp'); await sleep(300);
  console.log('hop kept panel', await evaluate(`[document.getElementById('summary').classList.contains('show'), __game.summary.ready]`));
  await key('Enter', 'Enter'); await sleep(800);
  console.log('after tally', await state(), await evaluate(`[__game.mode.constructor.name, __game.run.flock]`));
}
if (script === 'river') {
  await start();
  // Level 4: every kind is in play. Gators are gated to level 3 (tuning.js), so
  // a level 1 river never builds one and the gator checks below see nothing.
  await evaluate(`__game.debug.on = true; __game.debug.force = 'river'; __game.debug.god = true; __game.run.level = 4; __game.restartStage()`); await sleep(500);
  for (let i = 0; i < 8; i++) { await key('ArrowUp'); await sleep(180); }
  await sleep(2000);
  console.log('river', await evaluate(`(() => { const rows = [...__game.mode.world.rows.values()].filter(l => l.scenario.id === 'river'); const kinds = {}; for (const l of rows) for (const m of l.movers) kinds[m.kind] = (kinds[m.kind] ?? 0) + 1; return [rows.length, kinds, rows.reduce((a, l) => a + l.movers.filter(m => m.diver).length, 0), __game.mode.players[0].row, !!__game.mode.players[0].carrier] })()`));
  // Composition is a roll, so a board may hold no gator row at all. Rebuild
  // until one turns up rather than let the checks pass on an empty set.
  const gatorRows = `[...__game.mode.world.rows.values()].filter(l => l.data.turn)`;
  let rows = 0;
  for (let i = 0; i < 8 && !rows; i++) {
    rows = await evaluate(`${gatorRows}.length`);
    if (!rows) { await evaluate(`__game.restartStage()`); await sleep(400); }
  }
  // Jaws swap frames, and the row comes about. Elections are minutes apart at
  // play speed, so the clock is wound forward instead of waited out.
  await evaluate(`window.__g = { jaw: new Set(), dir: new Set(), every: ${gatorRows}[0]?.data.turn.every };
    window.__gt = setInterval(() => { for (const l of ${gatorRows}) { __g.dir.add(l.dir); for (const m of l.movers) if (m.gape) __g.jaw.add(m.mesh.frames.findIndex(f => f.visible)); l.data.turn.t = 0; } }, 100)`);
  await sleep(2500);
  await evaluate(`clearInterval(__gt)`);
  console.log('gators', await evaluate(`(() => { const l = ${gatorRows}[0]; const heads = l ? l.movers.filter(m => m.gape).length : 0;
    return [${gatorRows}.length, heads, [...__g.jaw].sort(), [...__g.dir].sort(), Math.round(__g.every), l ? l.movers.every(m => Math.abs(m.mesh.rotation.y - (l.dir < 0 ? Math.PI : 0)) < 1e-6) : null] })()`));
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
if (script === 'barrier') {
  // Every barrier variant: one weak cell, passable for all and hinted, the rest
  // blocked; a hop through it lands and a hop into a neighbour is refused.
  const fsB = await import('node:fs');
  const load = async (q) => { await send('Page.navigate', { url: BASE + q }); await sleep(3500); };
  const check = (ok, msg) => { if (!ok) errors.push(`barrier: ${msg}`); };
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fsB.writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64')); };
  for (const id of Object.keys(BARRIERS)) {
    await load(`?start&force=${id}&god&coins=50&chars=robot`);   // the robot passes nothing: a fence refuses it too
    const res = await evaluate(`(() => { const p = __game.mode.players[0]; const w = __game.mode.world;
      const lane = [...w.rows.values()].filter(l => l.scenario.id === '${id}' && l.r > p.row && l.data.weak !== undefined).sort((a, b) => a.r - b.r)[0];
      if (!lane) return { none: true };
      const weak = lane.data.weak; let blockedAll = 0;
      for (let c = -8; c <= 8; c++) if (w.isBlocked(c, lane.r, lane.r - 1)) blockedAll++;
      const park = (c) => { p.row = lane.r - 1; p.z = -p.row; p.x = c; p.col = c; p.mesh.position.set(c, 0, p.z); };
      const run = () => { for (let i = 0; i < 40 && p.moving; i++) p.update(0.02); };
      park(weak); p.hop(0, 1); run(); const through = p.row - lane.r;
      const other = weak > 0 ? weak - 1 : weak + 1;
      park(other); p.hop(0, 1); run(); const into = p.row - lane.r;
      return { r: lane.r, weak, hidden: !!lane.data.hidden, blockedAll, weakBlocked: w.isBlocked(weak, lane.r, lane.r - 1), through, into, kinds: [...new Set(lane.kinds.values())] }; })()`);
    console.log(id, res);
    check(!res.none, `${id}: no row was built`);
    if (res.none) continue;
    check(res.hidden, `${id}: the row does not hint`);
    check(Math.abs(res.weak) < 8 && !res.weakBlocked, `${id}: the weak cell ${res.weak} is blocked`);
    check(res.blockedAll === 16, `${id}: ${res.blockedAll} cells blocked, expected 16`);
    check(res.through === 0, `${id}: the hop through the weakness did not land (row ${res.through})`);
    check(res.into === -1, `${id}: a hop into a blocked cell was not refused (row ${res.into})`);
    await barrierShots(id, shot);
  }
  // Level 3: a band of three lays two rows around an open corridor, weaknesses apart.
  await load('?start&level=3&force=wall&god');
  const dbl = await evaluate(`(() => { const w = __game.mode.world; const s = [...w.rows.values()].find(l => l.scenario.id === 'wall').scenario;
    w.queue = [0, 1, 2].map(i => ({ scenario: s, index: i, count: 3 })); const r0 = w.nextRow; w.ensure(r0 + 2);
    const a = w.rows.get(r0), mid = w.rows.get(r0 + 1), b = w.rows.get(r0 + 2);
    const bands = [...w.rows.values()].filter(l => l.scenario.id === 'wall' && l.data.weak === undefined).length;
    return { a: a.data.weak, b: b.data.weak, corridor: mid.blocked.size, coins: mid.coins.size, pathCol: w.pathCol, naturalDoubles: bands }; })()`);
  console.log('double band', dbl);
  check(Math.abs(dbl.a - dbl.b) >= 4, `double band weaknesses ${dbl.a} and ${dbl.b} are too close`);
  check(dbl.corridor === 0 && dbl.coins === 1, 'the corridor row is not open with a coin');
  check(dbl.pathCol === dbl.b, 'pathCol does not follow the second row');
  // Sequencer: a barrier follows a road band well over its share of the weights.
  const seq = await evaluate(`(() => { const w = __game.mode.world; Object.assign(w, { queue: [], lastUsed: {}, done: false, dangerBands: 0 });
    // The wall's own weight is nil and its gap is off, so every wall after a road is the follow roll.
    w.config.weights = { road: 5, wall: 0.0001 }; w.config.ignoreGaps = true; w.config.bands = 1e9; w.config.level = 1;
    const specs = []; for (let r = 100; r < 900; r++) { const q = w.nextSpec(r); specs.push({ id: q.scenario.id, index: q.index }); }
    let roads = 0, followed = 0;   // a band starts at index 0; one road band may run straight into the next
    for (let i = 0; i < specs.length; i++) {
      if (specs[i].id !== 'road' || specs[i].index !== 0) continue;
      roads++; let j = i + 1; while (j < specs.length && specs[j].id === 'road' && specs[j].index !== 0) j++;
      if (specs[j]?.id === 'meadow' && specs[j + 1]?.id === 'wall') followed++;
    }
    return { roads, followed, share: +(followed / roads).toFixed(2) }; })()`);
  console.log('follows', seq);
  check(seq.share > 0.25 && seq.share < 0.55, `${seq.share} of road bands were followed by a barrier, expected about 0.4`);
}
if (script === 'skid') {
  // Wet and icy boards (sky.js `slip`): three hops landing inside the skid
  // window slide the player on, one cell on rain, two on snow. Hops are driven
  // and stepped in game time from inside the page, so the renderer's pace does
  // not decide what counts as fast.
  const load = async (q) => { await send('Page.navigate', { url: BASE + q }); await sleep(3500); };
  const check = (ok, msg) => { if (!ok) errors.push(`skid: ${msg}`); };
  // Park at row 5, column 0, with the column ahead cleared of blocks and crates.
  const PARK = `const p = __game.mode.players[0]; const w = __game.mode.world;
    for (let r = 5; r <= 12; r++) { const l = w.laneAt(r); l.blocked.delete(0); l.kinds.delete(0); l.crates.delete(0); }
    p.row = 5; p.col = 0; p.x = 0; p.z = -5; p.mesh.position.set(0, 0, -5); p.maxRow = 5; p.moving = false; p.recent = []; p.skids = 0; p.skidding = false;
    const r0 = p.row; const step = (n) => { for (let i = 0; i < n; i++) p.update(0.02); }; const run = () => { for (let i = 0; i < 200 && p.moving; i++) p.update(0.02); };`;
  const fast = `(() => { ${PARK} const puffs = __game.mode.fx.puffs.length; for (let i = 0; i < 3; i++) { p.hop(0, 1); run(); }
    return { slip: w.config.sky.slip, row: p.row - r0, alive: p.alive, spray: __game.mode.fx.puffs.length - puffs, ground: w.laneAt(5).group.children[0].material.color.getHexString() }; })()`;
  const slow = `(() => { ${PARK} for (let i = 0; i < 3; i++) { p.hop(0, 1); run(); step(30); } return { row: p.row - r0 }; })()`;
  const blocked = `(() => { ${PARK} w.laneAt(r0 + 4).block(0); for (let i = 0; i < 3; i++) { p.hop(0, 1); run(); } return { row: p.row - r0, bump: p.bump > 0, skids: p.skids, skidding: p.skidding, alive: p.alive }; })()`;
  const puddles = `[...__game.mode.world.rows.values()].reduce((a, l) => a + l.group.children.filter(o => o.userData.puddle).length, 0)`;

  await load('?start&sky=rain&force=grass&coins=30');
  const rain = await evaluate(fast);
  console.log('rain fast', rain);
  check(rain.slip === 1, `rain slip is ${rain.slip}`);
  check(rain.row === 4 && rain.alive, `three fast hops on rain landed +${rain.row}, not +4`);
  check(rain.spray > 0, 'no spray flew off the skid');
  check(rain.ground !== '9ad24a' && rain.ground !== '8fca43', `the wet grass kept its dry colour (${rain.ground})`);
  const rainSlow = await evaluate(slow);
  console.log('rain slow', rainSlow);
  check(rainSlow.row === 3, `three slow hops on rain landed +${rainSlow.row}, not +3`);
  const rainBlocked = await evaluate(blocked);
  console.log('rain blocked', rainBlocked);
  check(rainBlocked.row === 3 && rainBlocked.bump && rainBlocked.skids === 0 && !rainBlocked.skidding && rainBlocked.alive, `a skid into a block did not stop with a bump: ${JSON.stringify(rainBlocked)}`);
  const nPuddles = await evaluate(puddles);
  console.log('puddles', nPuddles);
  check(nPuddles > 0, 'no puddles on the wet board');

  await load('?start&sky=snow&force=grass&coins=30');
  const snow = await evaluate(fast);
  console.log('snow fast', snow);
  check(snow.slip === 2, `snow slip is ${snow.slip}`);
  check(snow.row === 5 && snow.alive, `three fast hops on snow landed +${snow.row}, not +5`);
  check(snow.ground === '9ad24a' || snow.ground === '8fca43', `snow tinted the grass (${snow.ground}); it should settle on top instead`);
  console.log('snow look', await evaluate(`[__game.sky.name, __game.sky.snow, !!__game.sky.flakes, !!__game.sky.rain, __game.sky.headlights]`));
  check(await evaluate(`!!__game.sky.flakes && !__game.sky.rain`), 'snow did not put up flakes (or left the rain on)');
  // Snow accumulates: the first grass row's splats are one InstancedMesh whose drawn count grows.
  const snowRow = `(() => { const l = [...__game.mode.world.rows.values()].filter(l => l.scenario.id === 'grass').sort((a, b) => a.r - b.r)[0]; const s = l.data.snow; const im = l.group.children.find(o => o.isInstancedMesh);
    return { row: l.r, has: !!s && s.mesh === im, total: s?.total ?? 0, count: im?.count ?? -1, t: +(__game.mode.world.data.snowT ?? 0).toFixed(2), movers: l.movers.length }; })()`;
  const s0 = await evaluate(snowRow); await sleep(3000); const s1 = await evaluate(snowRow);
  console.log('snow piles', s0, s1);
  check(s0.has && s0.total > 0 && s0.total <= 6000, `the grass row has no snow instances: ${JSON.stringify(s0)}`);
  check(s1.count > s0.count && s1.count <= s1.total, `the snow did not deepen over 3 s: ${s0.count} -> ${s1.count} of ${s1.total}`);
  const snowSlow = await evaluate(slow);
  console.log('snow slow', snowSlow);
  check(snowSlow.row === 3, `three slow hops on snow landed +${snowSlow.row}, not +3`);
  const snowBlocked = await evaluate(blocked);
  console.log('snow blocked', snowBlocked);
  check(snowBlocked.row === 3 && snowBlocked.bump && snowBlocked.skids === 0, `a snow skid into a block did not stop with a bump: ${JSON.stringify(snowBlocked)}`);
  const noIntro = await evaluate(`(() => { ${PARK} p.row = 0; p.z = 0; p.mesh.position.z = 0; p.maxRow = 0; const s = p.row; for (let i = 0; i < 3; i++) { p.hop(0, 1); run(); } return { row: p.row - s }; })()`);
  console.log('from the start line', noIntro);
  check(noIntro.row === 3, `a fast run from the start line skidded (+${noIntro.row})`);

  // Roads under snow: the row is snowed, the traffic is not.
  await load('?start&sky=snow&force=road&god');
  const roadSnow = await evaluate(`(() => { const l = [...__game.mode.world.rows.values()].find(l => l.scenario.id === 'road' && l.movers.length); if (!l) return null;
    return { row: l.r, movers: l.movers.length, total: l.data.snow?.total ?? 0, snowed: l.movers.some(m => { let hit = false; m.mesh.traverse(o => { if (o.isInstancedMesh) hit = true; }); return hit; }) }; })()`);
  console.log('road under snow', roadSnow);
  check(roadSnow && roadSnow.total > 0 && !roadSnow.snowed, `a snowed road row is wrong: ${JSON.stringify(roadSnow)}`);
  // Perks: the robot is heavy and skids one cell less; a frog's long jump is one hop.
  await load('?start&sky=snow&force=grass&chars=robot');
  const robot = await evaluate(fast);
  console.log('robot on snow', robot);
  check(robot.row === 4, `the robot on snow landed +${robot.row}, not +4`);
  await load('?start&sky=rain&force=grass&chars=frog');
  const frog = await evaluate(`(() => { ${PARK} p.hop(0, 1); p.update(0.02); p.hop(0, 1); const long = p.long; run(); p.hop(0, 1); run(); p.hop(0, 1); run(); return { long, row: p.row - r0 }; })()`);
  console.log('frog on rain', frog);
  check(frog.long && frog.row === 5, `a frog's long jump then two hops landed +${frog.row}, not +5`);

  // A skid onto a road with a car parked at the skid cell dies as a car death.
  await load('?start&sky=rain&force=road');
  const car = await evaluate(`(() => { ${PARK} for (let r = r0; r <= r0 + 4; r++) { const l = w.laneAt(r); l.freeze = true; for (const m of l.movers) { m.x = -30; m.mesh.position.x = -30; m.staller = null; } }
    const l = w.laneAt(r0 + 4); const m = l.movers[0]; m.x = 0; m.mesh.position.x = 0;
    for (let i = 0; i < 3; i++) { p.hop(0, 1); run(); } return { road: l.scenario.id, row: p.row - r0, alive: p.alive, by: p.deadBy }; })()`);
  console.log('into a car', car);
  check(car.road === 'road' && !car.alive && car.by === 'car', `the skid into a parked car did not die of it: ${JSON.stringify(car)}`);

  // The level table: snow is level 5, and level 6 loops back to day on the last entry's mix.
  const levels = await evaluate(`(() => { __game.debug.sky = null; __game.setLevel(5); const five = [__game.sky.name, __game.sky.slip, document.getElementById('level').textContent];
    __game.setLevel(6); const six = [__game.sky.name, __game.level.scenery, !!__game.level.weights.runway]; return { five, six }; })()`);
  console.log('levels', levels);
  check(levels.five[0] === 'snow' && levels.five[1] === 2 && levels.five[2].includes('SNOW'), `level 5 is not snow: ${JSON.stringify(levels.five)}`);
  check(levels.six[0] === 'day' && levels.six[1] === 'forest' && levels.six[2], `level 6 did not loop to day with the full mix: ${JSON.stringify(levels.six)}`);
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
  // The stage signs, caught once landed: the day, a gauntlet's danger plaque, the hearing's brass.
  await evaluate(`__game.debug.quickBanner = false; __game.setMode(new __game.mode.constructor(__game))`); await sleep(1300); await shot('banner-day');
  await evaluate(`__game.run.gauntlet = 'mines'; __game.setLevel(1); __game.setMode(new __game.mode.constructor(__game))`); await sleep(1400); await shot('banner-gauntlet');
  await evaluate(`__game.run.gauntlet = null; __game.setLevel(1); __game.stageClear()`); await sleep(1400); await shot('banner-hearing');
  await evaluate(`__game.banner.skip(); __game.debug.quickBanner = true`); await sleep(400);
  await evaluate(`__game.run.level = 2; __game.nextLevel()`); await sleep(500);
  for (let i = 0; i < 6; i++) { await key('ArrowUp'); await sleep(200); }
  await sleep(500); await shot('night-top');
  await key('Space', ' '); await sleep(1500); await shot('night-iso');
  await evaluate(`for (let i = 0; i < 3; i++) __game.mode.trains[0].hatch(true); __game.mode.finished = true`); await sleep(7500); await shot('tally');
  await sleep(4000); await key('Enter', 'Enter'); await sleep(1200); await key('Space', ' '); await sleep(300); await shot('battle-land');
  await key('ShiftLeft', 'Shift'); await sleep(1500); await shot('battle-sea');
  await key('ShiftLeft', 'Shift'); await sleep(1200); await key('Space', ' '); await sleep(350); await shot('battle-air');
  await evaluate(`__game.run.level = 1; __game.nextLevel()`); await sleep(500);
  await key('Space', ' '); await sleep(1500); await shot('sunset-iso');
  await evaluate(`__game.run.level = 3; __game.nextLevel()`); await sleep(500);
  for (let i = 0; i < 5; i++) { await key('ArrowUp'); await sleep(200); }
  await sleep(400); await shot('rain-top');
  await key('Space', ' '); await sleep(1500); await shot('rain-iso');
  await evaluate(`__game.run.level = 4; __game.nextLevel()`); await sleep(500);
  await evaluate(`__game.mode.world.data.snowT = 60`);   // two thirds settled: the splats read as a fall in progress
  for (let i = 0; i < 5; i++) { await key('ArrowUp'); await sleep(200); }
  await sleep(400); await shot('snow-top');
  await key('Space', ' '); await sleep(1500); await shot('snow-iso');
  await evaluate(`__game.debug.force = 'river'; __game.debug.sky = 'day'; __game.run.level = 4; __game.restartStage()`); await sleep(500);   // level 4: gators and subs are in play
  for (let i = 0; i < 6; i++) { await key('ArrowUp'); await sleep(200); }
  await sleep(300); await shot('river-top');
  await key('Space', ' '); await sleep(1500); await shot('river-iso');
  await key('Space', ' '); await sleep(300);
  // A powerup crate under cover: nothing to see straight down, the crate and
  // its item plain the moment the board tilts.
  await evaluate(`__game.debug.force = 'grass'; __game.debug.sky = 'day'; __game.debug.scenery = 'city'; __game.run.level = 5; __game.restartStage()`); await sleep(600);
  for (let i = 0; i < 5; i++) { await key('ArrowUp'); await sleep(200); }
  await evaluate(`(() => { const p = __game.mode.players[0]; const lane = __game.mode.world.laneAt(p.row + 1);
    for (const c of [...lane.crates.keys()]) lane.takeCrate(c);
    lane.cover(p.col); lane.crate(p.col, 'star'); })()`); await sleep(500);
  await shot('cover-top');
  await key('Space', ' '); await sleep(1500); await shot('cover-iso');
  await key('Space', ' '); await sleep(300);
  await evaluate(`__game.debug.force = null; __game.run.gauntlet = 'mines'; __game.debug.sky = 'day'; __game.debug.scenery = 'residential'; __game.run.level = 1; __game.restartStage()`); await sleep(800);
  for (let i = 0; i < 6; i++) { await key('ArrowUp'); await sleep(200); }
  await sleep(500); await shot('mines-top');
  await key('Space', ' '); await sleep(1500); await shot('mines-iso');
  await key('Space', ' '); await sleep(300);
  await mazeShots(shot);
  await evaluate(`__game.run.gauntlet = null; __game.debug.scenery = null; __game.debug.force = 'runway'; __game.debug.sky = 'sunset'; __game.run.level = 1; __game.restartStage()`); await sleep(500);
  for (let i = 0; i < 5; i++) { await key('ArrowUp'); await sleep(200); }
  await sleep(1500); await shot('runway-top');
  await key('Space', ' '); await sleep(1500); await shot('runway-iso');
  await key('Space', ' '); await sleep(300);
  for (const v of Object.keys(BARRIERS)) await barrierShots(v, shot);
  await evaluate(`__game.debug.force = 'freight'; __game.debug.sky = 'day'; __game.debug.scenery = null; __game.run.level = 1; __game.restartStage()`); await sleep(600);
  for (let i = 0; i < 3; i++) { await key('ArrowUp'); await sleep(200); }
  await sleep(600); await shot('freight-top');
  await evaluate(`__game.run.coins = 50`);
  await key('Space', ' '); await sleep(1500); await shot('freight-iso');
  await key('Space', ' '); await sleep(300);
  await evaluate(`__game.debug.scenery = null`);
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
if (script === 'cover') {
  // Crates under cover (src/powerups.js rollCrate, Lane.cover). The point of
  // the change is that a crate cannot be seen from straight above, so the check
  // is geometric rather than a look at a picture: for each crate, is there a
  // static mesh in the row whose world box spans the crate in x and z and sits
  // entirely above it? That is what "hidden from above" means on a board of
  // axis-aligned boxes, and no screenshot can tell you it holds for every crate.
  const fs = await import('node:fs');
  const shot = async (n) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${OUT}/${n}.png`, Buffer.from(r.data, 'base64')); };
  const check = (ok, msg) => { if (!ok) errors.push(`cover: ${msg}`); };

  // Rows scroll out of the world as the player climbs, so the tally is kept in
  // the page and added to as we go rather than read once at the end.
  //
  // Coverage is sampled rather than matched against one mesh: a striped awning
  // is five separate strips and no one of them spans the crate, though together
  // they roof it completely. Every point on a 5x5 grid over the crate's own
  // footprint must have some static mesh of the row above it.
  const TALLY = `(() => {
    const t = (window.__cover ??= { crates: new Map(), covers: new Map() });
    for (const lane of __game.mode.world.rows.values()) {
      for (const c of lane.data.covers ?? []) t.covers.set(lane.r + ':' + c, true);
      if (!lane.crates.size) continue;
      const skip = new Set(); for (const c of lane.crates.values()) c.mesh.traverse((o) => skip.add(o));
      lane.group.updateMatrixWorld(true);
      const roofs = [];
      lane.group.traverse((o) => { if (o.isMesh && !skip.has(o)) roofs.push(new THREE.Box3().setFromObject(o)); });
      for (const [c, crate] of lane.crates) {
        const cb = new THREE.Box3().setFromObject(crate.mesh);
        const over = roofs.filter((b) => b.min.y >= cb.max.y - 0.05);
        let open = 0, lowest = null;
        for (let i = 0; i < 5; i++) for (let k = 0; k < 5; k++) {
          const x = cb.min.x + (cb.max.x - cb.min.x) * (i + 0.5) / 5;
          const z = cb.min.z + (cb.max.z - cb.min.z) * (k + 0.5) / 5;
          const hit = over.filter((b) => b.min.x <= x && b.max.x >= x && b.min.z <= z && b.max.z >= z);
          if (!hit.length) open++;
          else { const y = Math.min(...hit.map((b) => b.min.y)); lowest = lowest === null ? y : Math.min(lowest, y); }
        }
        t.crates.set(lane.r + ':' + c, { r: lane.r, c, open, roof: open ? null : +lowest.toFixed(2) });
      }
    }
    return { crates: [...t.crates.values()], covers: t.covers.size };
  })()`;

  // Walk a long way through each scenery so the roll has rows enough to place
  // crates on, measuring the board every few hops before the rows scroll off.
  for (const theme of ['forest', 'residential', 'city', 'parking']) {
    await send('Page.navigate', { url: `${BASE}?start&force=grass&sky=day&scenery=${theme}&level=5&god&coins=60` }); await sleep(3200);
    let seen = null;
    for (let b = 0; b < 8; b++) {
      for (let i = 0; i < 8; i++) { await key('ArrowUp'); await sleep(90); }
      seen = await evaluate(TALLY);
    }
    const bare = seen.crates.filter((c) => c.roof === null);
    console.log(`cover ${theme}`, { crates: seen.crates.length, covers: seen.covers, bare: bare.length, roofs: [...new Set(seen.crates.map((c) => c.roof))].sort() });
    check(seen.crates.length > 0, `${theme}: no crate appeared in 64 rows, so nothing was checked`);
    check(bare.length === 0, `${theme}: ${bare.length} crate(s) with open sky over part of them: ${JSON.stringify(bare.slice(0, 3))} (open = sample points of 25 with nothing above)`);
    // Empty bays have to outnumber full ones or the cover is the brown box again.
    check(seen.covers >= seen.crates.length * 1.5, `${theme}: ${seen.covers} covers for ${seen.crates.length} crates — too many roofs pay out, so the roof is the tell`);
  }

  // And the pair of pictures: a crate under city cover, straight down and tilted.
  await send('Page.navigate', { url: BASE + '?start&force=grass&sky=day&scenery=city&level=5&coins=60' }); await sleep(3200);
  await evaluate(`(() => { const p = __game.mode.players[0]; const lane = __game.mode.world.laneAt(p.row + 1);
    window.__cover = null; lane.cover(p.col); lane.crate(p.col, 'star'); })()`); await sleep(500);
  await shot('cover-top');
  const planted = await evaluate(TALLY);
  console.log('planted crate', planted.crates);
  check(planted.crates.length >= 1 && planted.crates.every((c) => c.roof !== null), `the planted crate was not roofed (${JSON.stringify(planted.crates)})`);
  await key('Space', ' '); await sleep(1600); await shot('cover-iso');
}

if (script === 'powerups') {
  // Crates and the powerup registry (src/powerups.js). A crate placed in front
  // of the player is a plain box top-down and shows its item tilted; hopping
  // onto it grants the power, for 1.5x the time when the grab was a peek.
  // Then each of the first five powers is granted directly and its effect read.
  const fs = await import('node:fs');
  const shot = async (n) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${OUT}/${n}.png`, Buffer.from(r.data, 'base64')); };
  const check = (ok, msg) => { if (!ok) errors.push(`powerups: ${msg}`); };
  const crateAhead = (id) => evaluate(`(() => { const p = __game.mode.players[0]; const lane = __game.mode.world.laneAt(p.row + 1); lane.crate(p.col, ${JSON.stringify(id)}); return lane.crates.get(p.col).id; })()`);
  const crateState = () => evaluate(`(() => { const p = __game.mode.players[0]; const c = __game.mode.world.laneAt(p.row + 1).crates.get(p.col); return c ? { item: c.item.visible, tilted: __game.mode.tilted } : null; })()`);
  const power = (id) => evaluate(`(() => { const p = __game.mode.players[0]; const e = p.powers.get(${JSON.stringify(id)}); const el = document.getElementById('power');
    return { active: !!e, left: e ? +e.left.toFixed(2) : null, chip: el.textContent, hidden: el.hidden }; })()`);

  await send('Page.navigate', { url: BASE + '?start&force=grass&sky=day&coins=60' }); await sleep(3500);
  await crateAhead('star'); await sleep(400);
  const top = await crateState();
  await shot('crate-top');
  console.log('crate top-down', top);
  check(top && !top.item && !top.tilted, `the crate item showed top-down (${JSON.stringify(top)})`);
  await key('ArrowUp'); await sleep(800);
  const star = await power('star');
  console.log('hopped onto the star crate', star);
  check(star.active && star.left > 6.5 && star.left <= 8, `star not granted at its base 8 s (${JSON.stringify(star)})`);
  check(!star.hidden && star.chip.startsWith('STAR'), `HUD chip did not read STAR (${JSON.stringify(star.chip)})`);
  check(await evaluate(`__game.mode.world.laneAt(__game.mode.players[0].row).crates.size`) === 0, 'the crate stayed on the board after the grab');

  await evaluate(`__game.mode.players[0].clearPowers(); __game.mode.setTilt(true)`);
  await crateAhead('hourglass'); await sleep(1800);
  const iso = await crateState();
  await shot('crate-iso');
  console.log('crate tilted', iso);
  check(iso && iso.item && iso.tilted, `the crate item stayed hidden while tilted (${JSON.stringify(iso)})`);
  await key('ArrowUp'); await sleep(800);
  const tilted = await power('hourglass');
  console.log('hopped onto the hourglass crate, tilted', tilted);
  check(tilted.active && tilted.left > 7.5 && tilted.left <= 9, `a tilted grab was not 1.5x (6 s -> 9 s) (${JSON.stringify(tilted)})`);
  await evaluate(`__game.mode.players[0].clearPowers(); __game.mode.setTilt(false)`); await sleep(300);
  check(await evaluate(`document.getElementById('power').hidden`), 'the HUD chip stayed up with nothing active');

  // Magnet: a coin two cells to the right slides in and is taken.
  const mag = await evaluate(`(() => { const p = __game.mode.players[0]; const lane = __game.mode.world.laneAt(p.row); const c = Math.round(p.x) + 2;
    lane.takeCoin(c); lane.coin(c); const coins0 = __game.run.coins; p.grant('magnet'); window.__mag = { lane, c, coins0 };
    return { c, coins0, active: p.hasPower('magnet') }; })()`);
  let taken = false;
  for (let i = 0; i < 40 && !taken; i++) { await sleep(100); taken = await evaluate(`!__mag.lane.coins.has(__mag.c)`); }
  const coinsAfter = await evaluate(`__game.run.coins`);
  console.log('magnet', { ...mag, taken, coinsAfter: +coinsAfter.toFixed(2) });
  check(mag.active && taken && coinsAfter - mag.coins0 > 0.99, `the magnet did not pull in a coin two cells away (taken ${taken}, coins ${mag.coins0} -> ${coinsAfter})`);

  // Whistle: two waiting followers run back and join the line at once.
  const wh = await evaluate(`(() => { const p = __game.mode.players[0], t = __game.mode.trains[0]; p.clearPowers(); t.waiting = 2; const before = t.count; p.grant('whistle');
    return { waiting: t.waiting, gained: t.count - before, instant: !p.hasPower('whistle') }; })()`);
  console.log('whistle', wh);
  check(wh.waiting === 0 && wh.gained === 2 && wh.instant, `the whistle did not bring 2 waiting followers back (${JSON.stringify(wh)})`);

  // Golden egg: the tally multiplier per follower goes to 1.0 for the level.
  const ge = await evaluate(`(() => { const p = __game.mode.players[0]; p.grant('goldenEgg'); return { mul: __game.mode.followerMul, active: p.hasPower('goldenEgg') }; })()`);
  await sleep(300);
  const geChip = await evaluate(`document.getElementById('power').textContent`);
  console.log('golden egg', { ...ge, chip: geChip });
  check(ge.mul === 1 && ge.active && geChip.includes('GOLDEN EGG'), `the golden egg did not set followerMul to 1 (${JSON.stringify(ge)})`);

  // Star and hourglass need traffic: a road board.
  await send('Page.navigate', { url: BASE + '?start&force=road&coins=60' }); await sleep(3500);
  const starHit = await evaluate(`(() => { const p = __game.mode.players[0]; const w = __game.mode.world;
    const lane = [...w.rows.values()].filter(l => l.scenario.id === 'road' && l.r > p.row).sort((a, b) => a.r - b.r)[0];
    // The car nearest the centre, dragged onto the board if need be: off the
    // board a star saves nobody, so the player must be on a playable cell.
    const m = [...lane.movers].sort((a, b) => Math.abs(a.x) - Math.abs(b.x))[0]; const n0 = lane.movers.length;
    if (Math.abs(m.x) > 6) { m.x = 0; m.mesh.position.x = 0; }
    p.grant('star');
    p.row = lane.r; p.z = -lane.r; p.x = m.x; p.col = Math.round(m.x); p.mesh.position.set(p.x, 0, p.z);
    const pieces0 = __game.mode.fx.pieces.length;
    p.update(0.02);                        // the hazard check finds the car under the player
    const r = { alive: p.alive, movers: [n0, lane.movers.length], pieces: __game.mode.fx.pieces.length - pieces0, star: p.hasPower('star') };
    p.row = 0; p.z = 0; p.x = 0; p.col = 0; p.mesh.position.set(0, 0, 0);   // back to safety before the star runs out
    return r; })()`);
  console.log('star vs car', starHit);
  check(starHit.alive && starHit.star, 'the player died under a star');
  check(starHit.movers[1] === starHit.movers[0] - 1 && starHit.pieces > 0, `the car did not explode (movers ${starHit.movers.join(' -> ')}, pieces ${starHit.pieces})`);
  const flicker = await evaluate(`(() => { const p = __game.mode.players[0]; let owned = 0; p.mesh.traverse(o => { if (o.isMesh && o.userData.mat0) owned++; }); return owned; })()`);
  check(flicker > 0, 'the star did not take over the player materials for the flicker');

  const hg = await evaluate(`(() => { const p = __game.mode.players[0]; p.clearPowers(); const w = __game.mode.world;
    const lanes = [...w.rows.values()].filter(l => l.scenario.id === 'road');
    p.grant('hourglass'); window.__hg = { lanes, xs: lanes.map(l => l.movers.map(m => m.x)) };
    return { frozen: w.frozen, laneFrozen: lanes[0].frozen, lanes: lanes.length, restored: !p.hasPower('star') }; })()`);
  await sleep(1000);
  const movedFrozen = await evaluate(`__hg.lanes.some((l, i) => l.movers.some((m, k) => Math.abs(m.x - __hg.xs[i][k]) > 1e-6))`);
  console.log('hourglass', { ...hg, movedWhileFrozen: movedFrozen });
  check(hg.frozen && hg.laneFrozen && hg.lanes > 0, 'the hourglass did not freeze the world');
  check(!movedFrozen, 'a road mover moved while the hourglass ran');
  await evaluate(`__game.mode.players[0].powers.get('hourglass').left = 0.01`); await sleep(800);
  const thawed = await evaluate(`[!__game.mode.world.frozen, __hg.lanes.some((l, i) => l.movers.some((m, k) => Math.abs(m.x - __hg.xs[i][k]) > 1e-3))]`);
  console.log('after the hourglass', { unfrozen: thawed[0], moving: thawed[1] });
  check(thawed[0] && thawed[1], 'traffic did not start again when the hourglass ran out');
  console.log('crate shots written to', OUT);
}
if (script === 'powerups2') {
  // The movement powerups (src/powerups.js): mushroom, acorn, chili, tilt.
  // Roads are frozen and pushed off the centre columns so one dragged car is
  // the only traffic near the player; the tilt test thaws them again.
  const fs = await import('node:fs');
  const shot = async (n) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${OUT}/${n}.png`, Buffer.from(r.data, 'base64')); };
  const check = (ok, msg) => { if (!ok) errors.push(`powerups2: ${msg}`); };
  const chip = () => evaluate(`document.getElementById('power').textContent`);
  await send('Page.navigate', { url: BASE + '?start&force=road&sky=day&coins=60' }); await sleep(3500);
  await evaluate(`window.__p2 = {
    p: () => __game.mode.players[0],
    roads: () => [...__game.mode.world.rows.values()].filter((l) => l.scenario.id === 'road').sort((a, b) => a.r - b.r),
    put: (c, r) => { const p = __game.mode.players[0]; p.moving = false; p.buffered = null; p.carrier = null; p.airborne = null; p.bouncing = false;
      p.row = r; p.col = c; p.x = c; p.z = -r; p.y = 0; p.maxRow = Math.max(p.maxRow, r); p.facing = 0; p.mesh.position.set(c, 0, -r); },
    clear: () => { for (const l of __p2.roads()) { l.frozen = true; for (const m of l.movers) if (Math.abs(m.x) < 4) { m.x = 12 * Math.sign(m.x || 1); m.mesh.position.x = m.x; } } },
    car: (l, x) => { const m = l.movers[0]; m.x = x; m.mesh.position.x = x; return m; },
    // A column clear of blocks on every row from a to b.
    free: (a, b) => [0, 1, -1, 2, -2, 3, -3].find((c) => { for (let r = a; r <= b; r++) if (__game.mode.world.laneAt(r)?.blockKind(c)) return false; return true; }),
  }`);

  // Mushroom: double size, the camera pulls back, a forward hop strides two rows.
  const mush = await evaluate(`(() => { const p = __p2.p(); __p2.put(0, 0); p.grant('mushroom'); return { active: p.hasPower('mushroom'), giant: p.giant, zoom: __game.camera.zoomGoal }; })()`);
  await sleep(800);
  const size = await evaluate(`[+__p2.p().size.toFixed(2), +__p2.p().mesh.scale.x.toFixed(2)]`);
  console.log('mushroom', { ...mush, size });
  check(mush.active && mush.giant && Math.abs(size[0] - 2) < 0.05 && Math.abs(size[1] - 2) < 0.1, `the mushroom did not double the player (${JSON.stringify({ ...mush, size })})`);
  check(mush.zoom > 1.1, `the camera did not pull back for a giant (zoomGoal ${mush.zoom})`);
  const c0 = await evaluate(`__p2.free(0, 3) ?? 0`);
  await evaluate(`__p2.put(${c0}, 0)`); await key('ArrowUp'); await sleep(800);
  const stride = await evaluate(`[__p2.p().row, __p2.p().moving, __p2.p().stride]`);
  console.log('giant hop from row 0', stride);
  check(stride[0] === 2, `a giant's forward hop did not land two rows on (row ${stride[0]})`);
  const tunnel = await evaluate(`(() => { const w = __game.mode.world, p = __p2.p(); w.rows.set(999, { scenario: { id: 'hedge' }, data: { weak: 3 }, blockKind: () => null });
    const r = [w.isBlocked(3, 999, null, p), w.isBlocked(4, 999, null, p)]; p.giant = false; r.push(w.isBlocked(3, 999, null, p)); p.giant = true; w.rows.delete(999); return r; })()`);
  console.log('hedge tunnel while giant [tunnel, hedge cell, tunnel when not giant]', tunnel);
  check(tunnel[0] === true && tunnel[1] === false && tunnel[2] === false, `the hedge tunnel did not refuse a giant (${JSON.stringify(tunnel)})`);
  // Crush: a frozen car under the landing cell two rows up is wrecked and the player lives.
  const crush = await evaluate(`(() => { __p2.clear(); const l = __p2.roads()[0]; const m = __p2.car(l, 0); const n0 = l.movers.length; __p2.put(0, l.r - 2); window.__crushLane = l; return { r: l.r, n0, carX: m.x }; })()`);
  await key('ArrowUp'); await sleep(1000);
  const crushed = await evaluate(`(() => { const p = __p2.p(), l = __crushLane; return { row: p.row, alive: p.alive, movers: l.movers.length, giant: p.giant }; })()`);
  console.log('giant onto a car', { ...crush, ...crushed });
  check(crushed.alive && crushed.giant, 'the giant died landing on a car');
  check(crushed.row === crush.r && crushed.movers === crush.n0 - 1, `the car under the giant was not wrecked (row ${crushed.row} of ${crush.r}, movers ${crush.n0} -> ${crushed.movers})`);
  await evaluate(`__game.mode.setTilt(true)`); await sleep(1600);
  await shot('giant-iso');
  await evaluate(`__game.mode.setTilt(false)`); await sleep(300);

  // Acorn: half size, fences pass, a truck bed passes overhead, a bounce keeps the buffered hop.
  const acorn = await evaluate(`(() => { const p = __p2.p(); p.clearPowers(); __p2.put(0, 0); p.grant('acorn'); return { active: p.hasPower('acorn'), tiny: p.tiny, giant: p.giant, fence: p.passes('fence'), zoom: __game.camera.zoomGoal }; })()`);
  await sleep(800);
  const tinySize = await evaluate(`+__p2.p().size.toFixed(2)`);
  console.log('acorn', { ...acorn, size: tinySize });
  check(acorn.active && acorn.tiny && !acorn.giant && Math.abs(tinySize - 0.5) < 0.05, `the acorn did not halve the player (${JSON.stringify({ ...acorn, size: tinySize })})`);
  check(acorn.fence && acorn.zoom === 1, 'a tiny player does not pass fences, or the camera stayed pulled back');
  const tall = await evaluate(`[!!__meshes.makeTruck().tall, !!__meshes.makeFlatbed().tall, !!__meshes.makeCar().tall]`);
  check(tall[0] && tall[1] && !tall[2], `truck/flatbed/car tall flags read ${JSON.stringify(tall)}`);
  const under = await evaluate(`(() => { const p = __p2.p(); __p2.clear(); const l = __p2.roads()[0]; const m = __p2.car(l, 0); m.tall = true; __p2.put(0, l.r); p.update(0.02); p.update(0.02);
    const r = { alive: p.alive, tiny: p.tiny, lethal: l.scenario.lethalAt(l, 0, p) }; m.tall = false; __p2.put(0, 0); return r; })()`);
  console.log('tiny under a truck', under);
  check(under.alive && under.lethal === 'car', `standing under a truck killed a tiny player, or the truck was not lethal to begin with (${JSON.stringify(under)})`);
  const kept = await evaluate(`(() => { const p = __p2.p(); const l = __p2.roads()[0]; __p2.put(0, l.r); p.buffered = [0, 1]; p.bounce(l); const r = { buffered: p.buffered, bouncing: p.bouncing }; __p2.put(0, 0); return r; })()`);
  console.log('tiny bounce', kept);
  check(kept.bouncing && Array.isArray(kept.buffered), `a bounce ate a tiny player's buffered hop (${JSON.stringify(kept)})`);

  // Chili: F fires the way the player faces; the car three rows up is wrecked, 5 shots become 4.
  const chili = await evaluate(`(() => { const p = __p2.p(); p.clearPowers(); __p2.clear(); const l = __p2.roads()[0]; const c = __p2.free(l.r - 3, l.r - 1) ?? 0;
    const m = __p2.car(l, c); const n0 = l.movers.length; __p2.put(c, l.r - 3); p.grant('chili'); window.__chiliLane = l; return { c, r: l.r, n0, shots: p.powers.get('chili').ctx.shots }; })()`);
  await sleep(300);
  const chip0 = await chip();
  const cls0 = await evaluate(`document.body.classList.contains('chili')`);
  console.log('chili granted', { ...chili, chip: chip0, bodyClass: cls0 });
  check(chili.shots === 5 && chip0.includes('CHILI ×5'), `the chip did not read CHILI ×5 (${JSON.stringify(chip0)})`);
  check(cls0, 'body.chili was not set while a chili is held');
  await key('KeyF', 'f'); await sleep(1500);
  const fired = await evaluate(`(() => { const p = __p2.p(); const e = p.powers.get('chili'); return { shots: e?.ctx.shots, balls: e?.ctx.balls.length, movers: __chiliLane.movers.length, alive: p.alive }; })()`);
  const chip1 = await chip();
  console.log('after F', { ...fired, chip: chip1 });
  check(fired.shots === 4 && chip1.includes('CHILI ×4'), `shots did not go 5 -> 4 (${fired.shots}, chip ${JSON.stringify(chip1)})`);
  check(fired.movers === chili.n0 - 1 && fired.balls === 0, `the fireball did not wreck the car three rows up (movers ${chili.n0} -> ${fired.movers}, balls left ${fired.balls})`);
  const spent = await evaluate(`(() => { const p = __p2.p(); const e = p.powers.get('chili'); e.ctx.shots = 1; __p2.put(0, 0); p.facing = Math.PI; __game.mode.fire(p); return e.ctx.shots; })()`);
  await sleep(1200);
  const gone = await evaluate(`[__p2.p().hasPower('chili'), document.body.classList.contains('chili'), document.getElementById('power').hidden]`);
  console.log('last shot', { shotsAfterFire: spent, ...{ active: gone[0], bodyClass: gone[1], chipHidden: gone[2] } });
  check(spent === 0 && !gone[0] && !gone[1] && gone[2], `the chili did not end after its last shot (${JSON.stringify(gone)})`);

  // Tilt: the camera rides into the rolled iso view, every road within range slides off within 1.5 s, and traffic is back after 5 s.
  // Count wrecks over the tilt window. Road traffic crashes by design: the
  // player stands still for five seconds here, the queue halts for them, and a
  // follower now and then rear-ends a staller that stopped inside its reaction
  // time (Lane.advance, CRASH_DV) — the same mechanic the halt-crash scenario
  // exists to test. So the count coming back has to allow for wrecks rather
  // than demand the row be whole, or this reads as a tilt failure two runs in
  // ten. What it still catches is a mover that leaves a row without one.
  await evaluate(`(() => { const proto = Object.getPrototypeOf(__p2.roads()[0]);
    const snap = (m) => m && { x: +m.x.toFixed(1), v: +(m.v ?? 1).toFixed(2), len: m.len, held: !!m.held, slid: !!m.__slid, staller: m.staller?.phase ?? null, vis: m.mesh.visible };
    if (!proto.__countsWrecks) {
      const crash = proto.crash; proto.crash = function (a, b) { (window.__wrecks ??= []).push({ r: this.r, why: 'crash', gapMin: this.gapMin, a: snap(a), b: snap(b), gap: +((b.x - a.x) * this.dir - (a.len + b.len) / 2).toFixed(2) }); return crash.call(this, a, b); };
      const orig = proto.wreck; proto.wreck = function (m, k) { (window.__wrecks ??= []).push({ r: this.r, why: 'wreck', m: snap(m) }); return orig.call(this, m, k); };
      proto.__countsWrecks = true;
    }
    window.__wrecks = []; })()`);
  const tilt = await evaluate(`(() => { const p = __p2.p(); p.clearPowers(); for (const l of __p2.roads()) l.frozen = false; const l0 = __p2.roads()[0]; __p2.put(0, l0.r - 2);
    const lanes = __p2.roads().filter((l) => Math.abs(l.r - p.row) <= 14); window.__tilt = { lanes, n: lanes.map((l) => l.movers.length), row: p.row };
    p.grant('tilt'); return { lanes: lanes.length, movers: __tilt.n.reduce((a, b) => a + b, 0), goal: __game.camera.goalName, forced: __game.mode.forceTilt, tilted: __game.mode.tilted, coins: __game.run.coins }; })()`);
  await evaluate(`(() => { const e = __p2.p().powers.get('tilt'); for (const s of e?.ctx?.sliding ?? []) s.m.__slid = true; })()`);
  await sleep(600);
  await shot('tilt');
  await sleep(900);
  const mid = await evaluate(`(() => { const xs = __tilt.lanes.flatMap((l) => l.movers.map((m) => m.x)); return { row0: __tilt.row, goal: __game.camera.goalName, tilt: +__game.camera.view.tilt.toFixed(2), roll: +__game.camera.view.roll.toFixed(2),
    off: xs.every((x) => Math.abs(x) >= 35), minAbs: +Math.min(...xs.map(Math.abs)).toFixed(1), frozen: __tilt.lanes.every((l) => l.frozen), row: __p2.p().row, chip: document.getElementById('power').textContent, coins: __game.run.coins }; })()`);
  console.log('tilt at 1.5 s', { ...tilt, ...mid });
  check(tilt.goal === 'slide' && mid.goal === 'slide' && mid.tilt > 0.7, `the camera did not ride into the tilted view (goal ${tilt.goal} -> ${mid.goal}, tilt ${mid.tilt})`);
  check(tilt.forced && !tilt.tilted && Math.abs(mid.coins - tilt.coins) < 0.01, 'the tilt cost coins or set the peek flag');
  check(mid.off && mid.frozen, `road movers within range were still on the ring 1.5 s in (nearest |x| ${mid.minAbs}, frozen ${mid.frozen})`);
  check(mid.row === mid.row0, 'the player moved during the tilt');
  await sleep(3800);
  const back = await evaluate(`(() => { const lanes = __tilt.lanes; return { goal: __game.camera.goalName, forced: __game.mode.forceTilt, frozen: lanes.some((l) => l.frozen),
    counts: lanes.map((l) => l.movers.length), lost: lanes.map((l, i) => __tilt.n[i] - l.movers.length - (window.__wrecks ?? []).filter((w) => w.why === 'wreck' && w.r === l.r).length),
    showing: lanes.map((l) => l.movers.filter((m) => !m.held && m.mesh.visible && Math.abs(m.x) <= 35).length), stray: lanes.some((l) => l.movers.some((m) => m.held && m.mesh.visible)),
    wrecks: window.__wrecks ?? [] }; })()`);
  console.log('tilt after 5 s', back);
  check(back.goal === 'top' && !back.forced && !back.frozen, `the board did not come back after the tilt (${JSON.stringify(back)})`);
  check(back.lost.every((n) => n === 0) && back.showing.every((n) => n > 0) && !back.stray, `traffic did not drift back in (${JSON.stringify(back)}); lost counts a mover gone from a row with no wreck to account for it`);
  console.log('powerup shots written to', OUT);
}
if (script === 'freight') {
  await start();
  // Level 2: one-sided box cars unlock there.
  await evaluate(`__game.debug.on = true; __game.debug.force = 'freight'; __game.jumpLevel(2)`); await sleep(800);
  const check = (ok, msg) => { if (!ok) errors.push(`freight: ${msg}`); };
  // Page helpers: the nearest freight row, slide the whole train so a car sits at x, drop the player on a cell.
  await evaluate(`window.__ft = {
    lane: () => [...__game.mode.world.rows.values()].filter(l => l.scenario.id === 'freight').sort((a, b) => a.r - b.r)[0],
    slide(lane, m, x) { const d = x - m.x; for (const o of lane.movers) { o.x += d; if (o.x > 35) o.x -= 70; if (o.x < -35) o.x += 70; o.mesh.position.x = o.x; } },
    put(row, x) { const p = __game.mode.players[0]; p.row = row; p.col = x; p.x = x; p.z = -row; p.y = 0; p.moving = false; p.carrier = null; p.airborne = null; p.buffered = null; p.mesh.position.set(x, 0, -row); return p; },
    who() { const p = __game.mode.players[0]; return { row: p.row, alive: p.alive, carrier: p.carrier?.tag ?? (p.carrier ? p.carrier.kind : null), x: +p.x.toFixed(2), bounces: p.bounces ?? 0 }; },
  }`);
  const setup = await evaluate(`(() => { const l = __ft.lane(); const kinds = {}; for (const m of l.movers) kinds[m.kind] = (kinds[m.kind] ?? 0) + 1;
    return { r: l.r, dir: l.dir, speed: +l.speed.toFixed(2), gateSide: l.data.gateSide, gates: l.data.gates.length, cars: l.movers.length, kinds, hidden: !!l.data.hidden, gapMax: +Math.max(...l.movers.map((m, i, a) => { const o = a.find(o => o !== m && (o.x - m.x) * l.dir > 0 && Math.abs(o.x - m.x) < 6) ?? m; return Math.abs(o.x - m.x) - (o.len + m.len) / 2; })).toFixed(2) }; })()`);
  console.log('freight', setup);
  const r = setup.r;
  check(setup.gates === 1, `${setup.gates} gates, expected one`);
  check(setup.dir === setup.gateSide, `on level 2 the train runs toward the gate (dir ${setup.dir}, gate ${setup.gateSide})`);
  check(setup.speed > 0.9 && setup.speed < 1.6, `speed ${setup.speed}, expected a crawl`);
  for (const k of ['closed', 'box1', 'box2', 'flat']) check(setup.kinds[k] > 0, `no ${k} car in the ring`);
  check(setup.hidden, 'the row is not marked hidden: no TILT hint');
  // Through a two-sided car: board from below, ride, hop out above.
  await evaluate(`(() => { const l = __ft.lane(); const m = l.movers.find(m => m.kind === 'box2'); m.tag = 'A'; __ft.slide(l, m, -l.dir * 0.3); __ft.put(l.r - 1, 0); })()`); await sleep(120);
  await key('ArrowUp'); await sleep(700);
  const boarded = await evaluate(`__ft.who()`);
  console.log('boarded box2', boarded);
  check(boarded.carrier === 'A' && boarded.row === r && boarded.alive, 'did not board the two-sided car from below');
  await key('ArrowUp'); await sleep(700);
  const through = await evaluate(`__ft.who()`);
  console.log('out the far side', through);
  check(through.row === r + 1 && through.alive && !through.carrier, 'did not come out the far side alive');
  // A one-sided car: refused from its closed side, boarded from its open side,
  // the far wall holds, and the way back out is the way in.
  const b = await evaluate(`(() => { const l = __ft.lane(); const m = l.movers.find(m => m.kind === 'box1'); m.tag = 'B'; __ft.slide(l, m, 0); const p = __ft.put(m.side > 0 ? l.r + 1 : l.r - 1, 0); return { side: m.side, row: p.row }; })()`); await sleep(120);
  const inward = b.side > 0 ? 'ArrowDown' : 'ArrowUp', outward = b.side > 0 ? 'ArrowUp' : 'ArrowDown';
  await key(inward); await sleep(500);
  const refused = await evaluate(`__ft.who()`);
  console.log('box1 closed side', b, refused);
  check(refused.row === b.row && refused.alive && !refused.carrier, 'the closed side of a one-sided car let the player in');
  await evaluate(`(() => { const l = __ft.lane(); const m = l.movers.find(m => m.tag === 'B'); __ft.slide(l, m, -l.dir * 0.3); __ft.put(m.side > 0 ? l.r - 1 : l.r + 1, 0); })()`); await sleep(120);
  await key(outward); await sleep(700);
  const mounted = await evaluate(`__ft.who()`);
  console.log('box1 open side', mounted);
  check(mounted.carrier === 'B' && mounted.row === r && mounted.alive, 'did not board the one-sided car from its open side');
  await key(outward); await sleep(500);
  const held = await evaluate(`__ft.who()`);
  check(held.carrier === 'B' && held.row === r && held.alive, `the far wall of a one-sided car let the rider through (${JSON.stringify(held)})`);
  await key(inward); await sleep(700);
  const back = await evaluate(`__ft.who()`);
  console.log('back out', back);
  check(back.row === (b.side > 0 ? r - 1 : r + 1) && back.alive && !back.carrier, 'could not hop back out the open side');
  // A closed car is a wall from either side.
  await evaluate(`(() => { const l = __ft.lane(); const m = l.movers.find(m => m.kind === 'closed'); __ft.slide(l, m, -l.dir * 0.3); __ft.put(l.r - 1, 0); })()`); await sleep(120);
  await key('ArrowUp'); await sleep(500);
  const wall = await evaluate(`__ft.who()`);
  check(wall.row === r - 1 && wall.alive && !wall.carrier, `a closed car let the player in (${JSON.stringify(wall)})`);
  // The gate: its side's edge columns refuse entry and exit on both flank rows.
  const gate = await evaluate(`(() => { const l = __ft.lane(); const w = __game.mode.world; const s = l.data.gateSide; const r = l.r; const m = l.movers.find(m => m.tag === 'A'); __ft.slide(l, m, s * 5);
    return { side: s, gated: [8, 7, 6, 5, 0, -6, -8].map(c => l.scenario.gated(l, s * c)), exitUp: w.isBlocked(s * 6, r + 1, r), exitDown: w.isBlocked(s * 8, r - 1, r), exitInside: w.isBlocked(s * 5, r + 1, r), enterUp: w.isBlocked(s * 6, r, r - 1), enterDown: w.isBlocked(s * 7, r, r + 1), arm: l.data.gates[0].pivot.rotation.z, post: Math.sign(l.data.gates[0].position.x) }; })()`);
  console.log('gate', gate);
  check(gate.gated.join() === 'true,true,true,false,false,false,false', `gated columns read ${gate.gated.join()}`);
  check(gate.exitUp && gate.exitDown && !gate.exitInside && gate.enterUp && gate.enterDown, 'the arm does not block the right cells');
  check(gate.arm === 0 && gate.post === gate.side, 'the arm is not down on the gated side');
  // Pictures: the train from above (every box car alike) and tilted (the doors show).
  await evaluate(`(() => { const l = __ft.lane(); const m = l.movers.find(m => m.tag === 'A'); __ft.slide(l, m, -l.dir * 0.3); __ft.put(l.r - 1, 0); })()`); await sleep(1200);
  const fsF = await import('node:fs');
  const shotF = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fsF.writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64')); };
  await shotF('freight-top');
  await evaluate(`__game.run.coins = 50`);   // the peek burns coins
  await key('Space', ' '); await sleep(1500); await shotF('freight-iso');
  await key('Space', ' '); await sleep(300);
}
// District signs on the board: the welcome sign behind the start and the leaving
// sign past the finish, top-down and tilted.
if (script === 'districts') {
  const check = (ok, msg) => { if (!ok) errors.push(`districts: ${msg}`); };
  const fs = await import('node:fs');
  const shot = async (n) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${OUT}/${n}.png`, Buffer.from(r.data, 'base64')); };
  const signs = `(() => { const out = []; for (const l of __game.mode.world.rows.values()) l.group.traverse((o) => { if (o.userData.sign) out.push([l.r, l.scenario.id, ...o.userData.sign]); }); return out; })()`;
  await start();
  await evaluate(`__game.debug.god = true; __game.run.coins = 50`);
  await sleep(600); await shot('district-start-top');
  await key('Space', ' '); await sleep(1500); await shot('district-start-iso');
  await key('Space', ' '); await sleep(300);
  const atStart = await evaluate(signs);
  console.log('start signs', atStart);
  check(atStart.some(([r, , top, name]) => r === -2 && top === 'WELCOME TO' && name === 'PINE HOLLOW'), `no welcome sign behind the start: ${JSON.stringify(atStart)}`);
  await evaluate(`__game.mode.world.ensure(200)`);
  const fin = await evaluate(`[...__game.mode.world.rows.values()].find((l) => l.scenario.id === 'finish')?.r ?? null`);
  check(fin !== null, 'no finish row within 200 rows');
  await evaluate(`(() => { const p = __game.mode.player, row = ${fin} - 4; p.row = row; p.col = 0; p.x = 0; p.z = -row; p.mesh.position.set(0, 0, -row); })()`);
  await sleep(1200); await shot('district-finish-top');
  await key('Space', ' '); await sleep(1500); await shot('district-finish-iso');
  await key('Space', ' '); await sleep(300);
  const atFinish = (await evaluate(signs)).filter(([, id]) => id === 'finish');
  console.log('finish signs', atFinish);
  check(atFinish.length === 1 && atFinish[0][2] === 'NOW LEAVING' && atFinish[0][3] === 'PINE HOLLOW', `the finish has no leaving sign: ${JSON.stringify(atFinish)}`);
}
if (script === 'banner') {
  const check = (ok, msg) => { if (!ok) errors.push(`banner: ${msg}`); };
  const until = async (expr, ms) => { for (let i = 0; i < ms / 50; i++) { if (await evaluate(expr)) return true; await sleep(50); } return false; };
  const read = () => evaluate(`(() => { const b = document.getElementById('banner'); const svg = b.querySelector('svg.board'); return { hidden: b.hidden, show: b.classList.contains('show'), up: __game.banner.up, kind: b.dataset.kind ?? null, look: svg?.getAttribute('class') ?? null, text: [...b.querySelectorAll('text')].map((t) => t.textContent).join(' | ') }; })()`);
  // Start by hand: the shared helper drops the sign, and this branch is here to watch it.
  await key('Enter', 'Enter');
  check(await until(`__game.banner?.up`, 8000), 'no sign came up after the coin');
  const day = await read();
  console.log('day sign', day);
  check(day.show && !day.hidden && day.kind === 'day', `day sign not showing: ${JSON.stringify(day)}`);
  check(day.text.includes('DAY 1') && day.text.includes('PINE HOLLOW') && day.text.includes('NOW ENTERING'), `day sign reads ${JSON.stringify(day.text)}`);
  // Input during the hold goes nowhere.
  await key('ArrowUp'); await sleep(350);
  const held = await evaluate(`__game.mode.players[0].row`);
  console.log('row under the sign', held);
  check(held === 0, `a hop under the sign moved the player to row ${held}`);
  // Enter after the skip window drops it; the next hop lands.
  await sleep(500); await key('Enter', 'Enter'); await sleep(450);
  const gone = await read();
  console.log('after enter', gone);
  check(!gone.up && gone.hidden, `Enter did not drop the sign: ${JSON.stringify(gone)}`);
  await key('ArrowUp'); await sleep(500);
  const hopped = await evaluate(`__game.mode.players[0].row`);
  console.log('row after the sign', hopped);
  check(hopped === 1, `hop after the sign left the player on row ${hopped}`);
  // A retry into a minefield gauntlet: the striped board with its red plaque, short and quiet.
  await evaluate(`__game.debug.god = true; __game.run.gauntlet = 'mines'; __game.restartStage()`); await sleep(300);
  const mines = await read();
  console.log('gauntlet sign', mines);
  check(mines.up && mines.kind === 'gauntlet' && (mines.look ?? '').includes('mines'), `gauntlet sign not up: ${JSON.stringify(mines)}`);
  check(mines.text.includes('DANGER') && mines.text.includes('MINES GAUNTLET'), `gauntlet sign reads ${JSON.stringify(mines.text)}`);
  check(await until(`!__game.banner.up`, 2200), 'the retry sign did not clear within its 1400 ms');
  // Rain hangs the weather placard under the day sign.
  await evaluate(`__game.run.gauntlet = null; __game.debug.sky = 'rain'; __game.setLevel(3); __game.setMode(new __game.mode.constructor(__game))`); await sleep(300);
  const rain = await read();
  console.log('rain sign', rain);
  check(rain.kind === 'day' && rain.text.includes('RAIN') && rain.text.includes('ADVISORY: SLIPPERY'), `rain sign reads ${JSON.stringify(rain.text)}`);
  await sleep(500); await evaluate(`__game.banner.skip()`); await sleep(400);
  // The hearing: its plaque names the department in full and the day being served.
  await evaluate(`__game.debug.sky = null; __game.mode.finished = true`);
  check(await until(`__game.summary.ready`, 25000), 'the tally never offered ENTER');
  await key('Enter', 'Enter'); await sleep(400);
  const hearing = await read();
  console.log('hearing sign', hearing);
  check(await evaluate(`__game.mode.constructor.name`) === 'BattleMode', 'not at the hearing after the tally');
  check(hearing.up && hearing.kind === 'hearing', `hearing sign not up: ${JSON.stringify(hearing)}`);
  check(hearing.text.includes('DEPARTMENT OF PEDESTRIAN GRIEVANCES') && hearing.text.includes('RE: DOWNTOWN · DAY 3'), `hearing sign reads ${JSON.stringify(hearing.text)}`);
  check(hearing.text.split('GRIEVANCES').length >= 3, 'the department name is only on the seal, not engraved on the plaque');
  const clock = [await evaluate(`__game.mode.timeLeft`)]; await sleep(500); clock.push(await evaluate(`__game.mode.timeLeft`));
  console.log('office clock under the sign', clock);
  check(clock[0] === clock[1], `the hearing clock ran under the sign: ${clock}`);
  check(await until(`!__game.banner.up`, 3500), 'the hearing sign did not clear within its 2600 ms');
  await sleep(600);
  const running = await evaluate(`__game.mode.timeLeft`);
  console.log('clock after the sign', running);
  check(running < clock[1], `the hearing clock did not resume after the sign: ${running}`);
}
if (script === 'maze') {
  await start();
  const check = (ok, msg) => { if (!ok) errors.push(`maze: ${msg}`); };
  const until = async (expr, ms) => { for (let i = 0; i < ms / 100; i++) { if (await evaluate(expr)) return true; await sleep(100); } return false; };
  // Page helpers: the maze record, a BFS over its corridors, the player dropped on a cell, the ghosts' state.
  await evaluate(`window.__mz = {
    maze: () => __game.mode.world.data.maze,
    lanes: () => [...__game.mode.world.rows.values()].filter(l => l.scenario.id === 'maze'),
    reach() { const m = this.maze(); const g = m.grid, rows = m.rows, cols = g[0].length; const seen = new Set(); const q = [];
      for (let i = 0; i < cols; i++) if (g[0][i] === 1) { q.push([i, 0]); seen.add(i + ',0'); }
      while (q.length) { const [i, j] = q.shift(); if (j === rows - 1) return true;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || a >= cols || b < 0 || b >= rows || g[b][a] !== 1 || seen.has(a + ',' + b)) continue; seen.add(a + ',' + b); q.push([a, b]); } }
      return false; },
    put(i, j) { const m = this.maze(); const p = __game.mode.players[0]; const row = m.firstRow + j, x = i - 8; p.row = row; p.col = x; p.x = x; p.z = -row; p.y = 0; p.moving = false; p.carrier = null; p.airborne = null; p.buffered = null; p.mesh.position.set(x, 0, -row); return p; },
    ghosts() { return this.maze().ghosts.all.map(g => ({ name: g.name, pos: g.pos.map(v => +v.toFixed(2)), dead: +g.dead.toFixed(2), mesh: !!g.mesh })); },
    far(g, k) { const m = this.maze(); const G = m.gates[0]; const cells = []; for (let j = 1; j <= m.rows - 2; j++) for (let i = 1; i < m.grid[j].length - 1; i++) if (m.grid[j][i] === 1) cells.push([i, j, Math.hypot(i - G.i, j - G.j)]); cells.sort((a, b) => b[2] - a[2]); const c = cells[k]; m.ghosts.teleport(g, c[0], c[1]); return c[2]; },
  }`);
  // Level 2 rolls road or track; the toot and the gates need track.
  let kind = null;
  for (let n = 0; n < 14 && kind !== 'track'; n++) { await evaluate(`__game.debug.force = null; __game.debug.god = true; __game.run.level = 2; __game.run.gauntlet = 'maze'; __game.restartStage()`); await sleep(900); kind = await evaluate(`__mz.maze()?.kind`); }
  check(kind === 'track', `no track maze rolled at level 2 (last: ${kind})`);
  const board = await evaluate(`(() => { const m = __mz.maze(); const lanes = __mz.lanes(); return { kind: m.kind, wall: m.wall, rows: m.rows, lanes: lanes.length, everyRowOpen: m.grid.every(r => r.some(v => v === 1)), reach: __mz.reach(), ghosts: m.ghosts.all.length, meshes: m.ghosts.all.filter(g => g.mesh).length, coins: lanes.reduce((a, l) => a + l.coins.size, 0), crates: lanes.reduce((a, l) => a + l.crates.size, 0), weak: m.grid.flat().filter(v => v === 2).length, hidden: lanes.filter(l => l.data.hidden).length, gates: m.gates.length, pathOpen: lanes.every(l => m.grid[l.data.j][l.data.pathCol + 8] === 1), speed: +m.ghosts.speed.toFixed(2), level: document.getElementById('level').textContent, mood: __game.mode.mood.gauntlet }; })()`);
  console.log('board', board);
  check(board.lanes === board.rows && board.rows % 2 === 1, `${board.lanes} maze rows laid for a ${board.rows}-row maze`);
  check(board.everyRowOpen, 'a maze row has no open cell');
  check(board.reach, 'no corridor path from the start row to the finish row');
  check(board.pathOpen, 'pathCol points at a wall on some row');
  check(board.ghosts === 4 && board.meshes === 4, `${board.ghosts} ghosts, ${board.meshes} with meshes`);
  check(board.coins > 10, `${board.coins} coins`);
  check(board.weak > 0 && board.hidden > 0, 'no weaknesses, or no row marked hidden');
  check(board.gates >= 1 && board.gates <= 2, `${board.gates} gates on a track maze`);
  check(board.level.includes('MAZE GAUNTLET'), 'no MAZE GAUNTLET tag in the bar');
  // Standing on a ghost's cell is the kind's death (god mode keeps the player standing).
  const lethal = await evaluate(`(() => { const m = __mz.maze(); const g = m.ghosts.all[1]; const lane = __game.mode.world.laneAt(m.firstRow + Math.round(g.pos[1])); return [lane.scenario.lethalAt(lane, g.pos[0] - 8), lane.movers.length]; })()`);
  console.log('lethal', lethal);
  check(lethal[0] === 'train', `lethalAt on a train ghost's cell gave ${lethal[0]}`);
  // A train ghost toots within five cells: park the player on one for a couple of seconds.
  const parked = await evaluate(`(() => { const m = __mz.maze(); const g = m.ghosts.all[0]; m.ghosts.honks = 0; const [i, j] = g.pos.map(Math.round); __mz.put(i, j); return [i, j, __game.mode.players[0].invincible]; })()`);
  await sleep(2500);
  const honks = await evaluate(`[__mz.maze().ghosts.honks, __game.mode.players[0].alive]`);
  console.log('toots', parked, honks);
  check(honks[0] > 0, 'no toot from a train ghost within range');
  check(honks[1], 'god mode did not hold the player on the ghost');
  // The gate: a living train ghost on the cell drops it and the cell refuses entry from the row below; all far away, it lifts.
  const allUp = async () => check(await until(`__mz.ghosts().every(g => g.mesh)`, 15000), 'not every ghost came back within 15 s');
  await allUp();
  const dropped = await evaluate(`(() => { const m = __mz.maze(); const G = m.gates[0]; const g = m.ghosts.all.find(g => g.mesh); m.ghosts.teleport(g, G.i, G.j); return [G.i, G.j, g.name]; })()`);
  await sleep(400);
  const down = await evaluate(`(() => { const m = __mz.maze(); const G = m.gates[0]; const w = __game.mode.world; const r = m.firstRow + G.j; return [G.down, w.isBlocked(G.i - 8, r, r - 1), w.isBlocked(G.i - 8, r, r), G.arms.length, +G.arms[0].pivot.rotation.z.toFixed(2)]; })()`);
  console.log('gate down', dropped, down);
  check(down[0] && down[1] && !down[2] && down[3] >= 1, `gate did not drop and block: ${JSON.stringify(down)}`);
  await allUp();
  const farthest = await evaluate(`(() => { const m = __mz.maze(); return m.ghosts.all.map((g, k) => +__mz.far(g, k).toFixed(1)); })()`);
  await sleep(400);
  const up = await evaluate(`(() => { const m = __mz.maze(); const G = m.gates[0]; const w = __game.mode.world; const r = m.firstRow + G.j; return [G.down, w.isBlocked(G.i - 8, r, r - 1)]; })()`);
  console.log('gate up', farthest, up);
  check(Math.min(...farthest) > 4, `no cell more than 4 from the gate (${farthest})`);
  check(!up[0] && !up[1], `gate stayed down with every ghost far away: ${JSON.stringify(up)}`);
  // Two ghosts in one cell: both blow up and both are back within RESPAWN.
  await allUp();
  await evaluate(`(() => { const m = __mz.maze(); const G = m.ghosts; const b = G.all[1]; G.teleport(G.all[0], ...b.pos.map(Math.round)); })()`);
  const blew = await until(`(() => { const g = __mz.ghosts(); return g[0].dead > 0 && g[1].dead > 0 && !g[0].mesh && !g[1].mesh; })()`, 1500);
  console.log('crashed', blew, await evaluate(`__mz.ghosts()`));
  check(blew, 'two ghosts on one cell did not both explode');
  const back = await until(`(() => { const g = __mz.ghosts(); return g[0].dead === 0 && g[1].dead === 0 && g[0].mesh && g[1].mesh; })()`, 12000);
  console.log('respawned', back, await evaluate(`__mz.ghosts()`));
  check(back, 'crashed ghosts did not respawn');
  // Lane.wreck on a ghost's mover (what a fireball, a star or a giant calls) sends it home the same way.
  await allUp();
  await evaluate(`(() => { const m = __mz.maze(); const g = m.ghosts.all[3]; const lane = __game.mode.world.laneAt(m.firstRow + Math.round(g.pos[1])); lane.wreck(g.mover, 1.2); })()`);
  const wrecked = await until(`__mz.ghosts()[3].dead > 0`, 1500);
  const rebuilt = wrecked && await until(`(() => { const g = __mz.ghosts()[3]; return g.dead === 0 && g.mesh; })()`, 12000);
  console.log('wrecked', wrecked, 'rebuilt', rebuilt);
  check(wrecked && rebuilt, 'a wrecked ghost did not respawn');
  // The hourglass holds every living ghost still.
  await allUp();
  await evaluate(`__mz.put(__mz.maze().path[0], 0); __game.mode.players[0].grant('hourglass')`); await sleep(200);
  const before = await evaluate(`__mz.ghosts()`);
  await sleep(600);
  const after = await evaluate(`__mz.ghosts()`);
  await evaluate(`__game.mode.players[0].revoke('hourglass')`);
  const still = before.map((g, k) => (g.dead === 0 && after[k].dead === 0 ? String(g.pos) === String(after[k].pos) : null)).filter((v) => v !== null);
  console.log('frozen', still);
  check(still.length >= 3 && still.every(Boolean), `ghosts moved under the hourglass: ${JSON.stringify([before, after])}`);
  // Pictures: the level-1 road maze in the forest.
  const fsM = await import('node:fs');
  const shotBoard = await mazeShots(async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fsM.writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64')); });
  console.log('shots', shotBoard);
  check(shotBoard.kind === 'road' && shotBoard.ghosts === 4, `level-1 maze at the top shot: ${JSON.stringify(shotBoard)}`);
}
console.log('errors:', errors.length ? errors : 'none');
ws.close();
process.exit(0);
