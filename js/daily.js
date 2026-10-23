'use strict';
// The Grid, Who's That?, 2-Minute Drill, Kick It and Card Packs.
const dayKey = () => todayKey();
const puzzle = (k) => Store.data.puzzles[k + ':' + dayKey()];
const savePuzzle = (k, v) => { Store.data.puzzles[k + ':' + dayKey()] = v; Store.save(); };
const shake = (el) => { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); };

// =====================================================================
// THE GRID: rows are teams, columns are categories. Name a player who fits both.
// =====================================================================
const GRID_COLS = [
  { id: '90s', label: '1990s', short: "'90s", t: (p) => p.era === '90s' },
  { id: '00s', label: '2000s', short: "'00s", t: (p) => p.era === '00s' },
  { id: '10s', label: '2010s', short: "'10s", t: (p) => p.era === '10s' },
  { id: '20s', label: '2020s', short: "'20s", t: (p) => p.era === '20s' },
  { id: 'now', label: '2026 roster', short: "'26", t: (p) => TE.isCurrent(p.id) },
  { id: 'QB', label: 'Quarterback', short: 'QB', t: (p) => p.pos === 'QB' },
  { id: 'RB', label: 'Running back', short: 'RB', t: (p) => p.pos === 'RB' },
  { id: 'WRTE', label: 'Receiver or TE', short: 'WR/TE', t: (p) => p.pos === 'WR' || p.pos === 'TE' },
  { id: 'LINE', label: 'Lineman', short: 'OL/DL', t: (p) => p.pos === 'OL' || p.pos === 'DL' },
  { id: 'LB', label: 'Linebacker', short: 'LB', t: (p) => p.pos === 'LB' },
  { id: 'DB', label: 'Defensive back', short: 'CB/S', t: (p) => p.pos === 'CB' || p.pos === 'S' },
  { id: 'HC', label: 'Head coach', short: 'Coach', t: (p) => p.pos === 'HC' },
  { id: '90', label: 'Rated 90+', short: '90+', t: (p) => p.r >= 90 },
  { id: '95', label: 'Rated 95+', short: '95+', t: (p) => p.r >= 95 },
];
function gridFor(seed) {
  const r = TE.rng('grid:' + seed);
  for (let tries = 0; tries < 400; tries++) {
    const teams = TE.shuffle(r, TE.DATA.TEAMS.map((t, i) => i)).slice(0, 3);
    const cols = TE.shuffle(r, GRID_COLS.map((c, i) => i)).slice(0, 3);
    if (cols.filter((c) => /^(\d\ds|now)$/.test(GRID_COLS[c].id)).length > 1) continue;
    const ok = teams.every((ti) => cols.every((ci) => gridAnswers(ti, ci).length >= 2));
    if (ok) return { teams, cols };
  }
  return { teams: [0, 1, 2], cols: [0, 4, 11] };
}
function gridAnswers(ti, ci) {
  const names = new Set();
  TE.PLAYERS.forEach((p) => { if (p.team === ti && GRID_COLS[ci].t(p)) names.add(p.name); });
  return [...names];
}
// does this person (any of his cards) fit the cell?
function gridFit(pid, ti, ci) {
  const name = TE.PLAYERS[pid].name;
  return TE.PLAYERS.find((p) => p.name === name && p.team === ti && GRID_COLS[ci].t(p)) || null;
}
function GridGame(practiceSeed) {
  const daily = !practiceSeed;
  const seed = daily ? dayKey() : practiceSeed;
  const G = gridFor(seed);
  const st = (daily && puzzle('grid')) || { cells: new Array(9).fill(null), left: 9, done: false };
  const save = () => { if (daily) savePuzzle('grid', st); };
  const el = go(`
    <div class="topbar"><button class="icon-btn" data-act="home">${ico('back', 20)}</button><div class="grow"><h2 class="d">The Grid</h2><div class="mute" style="font-weight:700;font-size:12px">${daily ? 'Daily #' + dailyNumber(dayKey()) : 'Practice'}</div></div><span class="pill blue">Guesses <b id="left">${st.left}</b></span></div>
    <p class="mute" style="font-weight:600;margin:0 0 12px;font-size:14px">Name a player who fits the row and the column. Each player can only be used once.</p>
    <div class="grid9" id="g"></div>
    <div id="after"></div>`);
  const draw = () => {
    const g = $('#g', el);
    g.innerHTML = '<div class="gcorner">' + ico('grid', 22) + '</div>' + G.cols.map((ci) => `<div class="ghead"><b>${GRID_COLS[ci].short}</b><small>${GRID_COLS[ci].label}</small></div>`).join('') +
      G.teams.map((ti, r) => `<div class="grow-h">${crest(TE.DATA.TEAMS[ti], 34)}<small>${esc(TE.DATA.TEAMS[ti].short)}</small></div>` + G.cols.map((ci, c) => {
        const k = r * 3 + c, v = st.cells[k];
        if (v) return `<div class="gcell filled">${pcard(v, {})}</div>`;
        if (st.done) { const ans = gridAnswers(ti, ci); return `<div class="gcell miss"><small>${esc(ans[0] || '')}</small></div>`; }
        return `<button class="gcell" data-k="${k}">${ico('question', 22)}</button>`;
      }).join('')).join('');
    $$('[data-k]', g).forEach((b) => b.addEventListener('click', () => guess(+b.dataset.k, b)));
    $('#left', el).textContent = st.left;
    if (st.done) after();
  };
  const used = () => st.cells.filter(Boolean).map((pid) => TE.PLAYERS[pid].name);
  const guess = async (k, btn) => {
    if (st.done || st.left <= 0) return;
    const ti = G.teams[Math.floor(k / 3)], ci = G.cols[k % 3];
    const pid = await pickPlayer({ title: `${TE.DATA.TEAMS[ti].short} × ${GRID_COLS[ci].label}`, hideRatings: true, exclude: (id) => (used().indexOf(TE.PLAYERS[id].name) >= 0 ? 'already used' : null) });
    if (pid === null || !el.isConnected) return;
    st.left--;
    const fit = gridFit(pid, ti, ci);
    if (fit) { st.cells[k] = fit.id; Sfx.good(); buzz(15); collect([fit.id]); } else { Sfx.bad(); buzz([40, 30, 40]); toast(`Nope: ${TE.PLAYERS[pid].name} doesn't fit`); shake(btn); }
    if (st.left <= 0 || st.cells.every(Boolean)) finish();
    save(); draw();
  };
  const finish = () => {
    st.done = true;
    const n = st.cells.filter(Boolean).length;
    addXP(20 + n * 10);
    if (n === 9) { unlock('grid9'); confetti(); Sfx.trophy(); }
  };
  const after = () => {
    const n = st.cells.filter(Boolean).length;
    const avg = n ? Math.round(st.cells.filter(Boolean).reduce((a, pid) => a + TE.PLAYERS[pid].r, 0) / n) : 0;
    const emoji = [0, 1, 2].map((r) => [0, 1, 2].map((c) => (st.cells[r * 3 + c] ? '🟩' : '⬜')).join('')).join('\n');
    $('#after', el).innerHTML = `<div class="hero-card center" style="margin-top:14px"><div class="d" style="font-size:34px">${n}/9</div><div class="mute" style="font-weight:700">${n === 9 ? 'Immaculate!' : n >= 6 ? 'Strong work.' : 'Tough grid.'}${n ? ` · Avg rating of your picks: ${avg} (lower = deeper cut)` : ''}</div></div>
      <div class="actions"><button class="btn primary" id="sh">${ico('share', 18)} Share</button><button class="btn" id="pr">${ico('refresh', 18)} Practice grid</button></div>`;
    $('#sh', el).addEventListener('click', () => shareOut(`CLUTCH Grid${daily ? ' #' + dailyNumber(dayKey()) : ''} 🏈\n${n}/9\n${emoji}`));
    $('#pr', el).addEventListener('click', () => GridGame('p' + rid()));
  };
  draw();
}

// =====================================================================
// WHO'S THAT? A daily mystery player in 8 guesses.
// =====================================================================
const SIDE = (pos) => (['QB', 'RB', 'WR', 'TE', 'OL'].indexOf(pos) >= 0 ? 'off' : ['DL', 'LB', 'CB', 'S'].indexOf(pos) >= 0 ? 'def' : 'st');
function mysteryTarget(seed) {
  const pool = TE.PLAYERS.filter((p) => p.r >= 87 && p.pos !== 'K');
  return pool[Math.floor(TE.rng('who:' + seed)() * pool.length)].id;
}
function compareGuess(gid, tid) {
  const g = TE.PLAYERS[gid], t = TE.PLAYERS[tid];
  const eraI = (e) => (e === TE.DATA.CURRENT_ERA ? TE.DATA.ERAS.length + 1 : e === '25' ? TE.DATA.ERAS.length : TE.DATA.ERAS.indexOf(e));
  const de = eraI(t.era) - eraI(g.era);
  return {
    win: g.name === t.name,
    team: g.team === t.team ? 'g' : 'x',
    era: de === 0 ? 'g' : Math.abs(de) === 1 ? 'y' : 'x', eraDir: de > 0 ? '↑' : de < 0 ? '↓' : '',
    pos: g.pos === t.pos ? 'g' : SIDE(g.pos) === SIDE(t.pos) ? 'y' : 'x',
    rt: g.r === t.r ? 'g' : Math.abs(g.r - t.r) <= 3 ? 'y' : 'x', rtDir: t.r > g.r ? '↑' : t.r < g.r ? '↓' : '',
  };
}
function MysteryGame(practiceSeed) {
  const daily = !practiceSeed;
  const tid = mysteryTarget(daily ? dayKey() : practiceSeed);
  const st = (daily && puzzle('who')) || { guesses: [], done: false, win: false };
  const save = () => { if (daily) savePuzzle('who', st); };
  const t = TE.PLAYERS[tid];
  const el = go(`
    <div class="topbar"><button class="icon-btn" data-act="home">${ico('back', 20)}</button><div class="grow"><h2 class="d">Who's That?</h2><div class="mute" style="font-weight:700;font-size:12px">${daily ? 'Daily #' + dailyNumber(dayKey()) : 'Practice'}</div></div><span class="pill pink">Guess <b id="gn">${Math.min(8, st.guesses.length + 1)}</b>/ 8</span></div>
    <div class="mystery-card" id="mc"></div>
    <div class="wtable"><div class="wh"><span>Player</span><span>Team</span><span>Era</span><span>Pos</span><span>Rtg</span></div><div id="rows"></div></div>
    <div id="act"></div>`);
  const draw = () => {
    $('#mc', el).innerHTML = st.done ? `<div class="reveal">${pcard(tid, { big: true })}</div>` : `<div class="mystery">${ico('question', 54)}<div><b>Mystery player</b><small>Rated 87+ · any team · any era, legends to today</small></div></div>`;
    $('#rows', el).innerHTML = st.guesses.map((gid) => {
      const c = compareGuess(gid, tid), g = TE.PLAYERS[gid];
      return `<div class="wr ${c.win ? 'win' : ''}"><span class="wn">${esc(shortName(g.name))}</span><span class="wt ${c.team}">${TE.DATA.TEAMS[g.team].id}</span><span class="wt ${c.era}">${TE.eraTag(g.era)}${c.eraDir}</span><span class="wt ${c.pos}">${g.pos}</span><span class="wt ${c.rt}">${g.r}${c.rtDir}</span></div>`;
    }).join('') + (st.done ? '' : new Array(Math.max(0, 8 - st.guesses.length)).fill('<div class="wr ghost"><span class="wn"></span><span class="wt"></span><span class="wt"></span><span class="wt"></span><span class="wt"></span></div>').join(''));
    $('#gn', el).textContent = Math.min(8, st.guesses.length + (st.done ? 0 : 1));
    if (!st.done) {
      $('#act', el).innerHTML = `<button class="btn primary" id="guess" style="margin-top:12px">${ico('question', 18)} Make a guess</button>
        <div class="legend"><span class="wt g">✓</span> match <span class="wt y">~</span> close (a decade off, same side of the ball, or within 3 rating) <span class="wt x">↑</span> the answer is higher or later</div>`;
      $('#guess', el).addEventListener('click', guess);
    } else after();
  };
  const guess = async () => {
    const pid = await pickPlayer({ title: 'Guess the player', hideRatings: false, exclude: (id) => (st.guesses.some((g) => TE.PLAYERS[g].name === TE.PLAYERS[id].name) ? 'already guessed' : null) });
    if (pid === null || !el.isConnected) return;
    st.guesses.push(pid);
    const c = compareGuess(pid, tid);
    if (c.win) { st.done = true; st.win = true; Sfx.trophy(); confetti(); addXP(40 + (8 - st.guesses.length) * 15); if (st.guesses.length <= 4) unlock('mystery'); collect([tid]); }
    else if (st.guesses.length >= 8) { st.done = true; Sfx.groan(); addXP(15); }
    else Sfx.tap();
    save(); draw();
  };
  const after = () => {
    const grid = st.guesses.map((gid) => { const c = compareGuess(gid, tid); return [c.team, c.era, c.pos, c.rt].map((v) => (v === 'g' ? '🟩' : v === 'y' ? '🟨' : '⬛')).join(''); }).join('\n');
    $('#act', el).innerHTML = `<div class="outcome ${st.win ? 'win' : 'loss'}" style="margin-top:12px"><h2>${st.win ? 'Got him!' : 'So close'}</h2><p>${esc(t.name)} · ${esc(TE.DATA.TEAMS[t.team].name)} · ${TE.DATA.ERA_LABEL[t.era]}</p></div>
      <div class="actions"><button class="btn primary" id="sh">${ico('share', 18)} Share</button><button class="btn" id="pr">${ico('refresh', 18)} Play a practice round</button></div>`;
    $('#sh', el).addEventListener('click', () => shareOut(`CLUTCH Who's That?${daily ? ' #' + dailyNumber(dayKey()) : ''} 🏈\n${st.win ? st.guesses.length : 'X'}/8\n${grid}`));
    $('#pr', el).addEventListener('click', () => MysteryGame('p' + rid()));
  };
  draw();
}

// =====================================================================
// 2-MINUTE DRILL: down late with the ball. Drive and score.
// =====================================================================
function drillSetup(seed) {
  const r = TE.rng('drill:' + seed);
  const d = TE.createDraft({ seed: 'drillteam:' + seed, managers: [{ name: 'You' }], respins: 0 });
  while (!d.done) { const b = TE.botPick(d, 0, 10); TE.pick(d, 0, b.pid, b.slot); }
  const sorted = TE.CUR_SQ.slice().sort((a, b) => TE.squadStrength(b) - TE.squadStrength(a));
  const opp = TE.squadTeam(sorted[Math.floor(r() * 8)]);
  const deficit = [3, 4, 5, 6, 7][Math.floor(r() * 5)];
  const ball = 18 + Math.floor(r() * 14);
  return { xi: d.managers[0].xi, opp, deficit, ball, clock: 120 };
}
function DrillStart(practice) {
  const daily = !practice;
  const seed = daily ? dayKey() : 'p' + rid();
  const done = daily && puzzle('drill');
  const S = drillSetup(seed);
  const el = go(`
    <div class="topbar"><button class="icon-btn" data-act="home">${ico('back', 20)}</button><div class="grow"><h2 class="d">2-Minute Drill</h2><div class="mute" style="font-weight:700;font-size:12px">${daily ? 'Daily #' + dailyNumber(dayKey()) : 'Practice'}</div></div></div>
    <div class="night-card">
      <div class="nc-top">${ico('timer', 18)} Fourth quarter</div>
      <div class="nc-score"><div><small>You</small><b>17</b></div><div class="nc-clock">2:00</div><div><small>${esc(S.opp.name)}</small><b>${17 + S.deficit}</b></div></div>
      <div class="nc-sit">Down <b>${S.deficit}</b>. Your ball at your own <b>${S.ball}</b>. No timeouts. ${S.deficit > 3 ? 'You need a touchdown.' : 'A field goal ties it, a touchdown wins it.'}</div>
    </div>
    <div class="section-title">Your offense today</div>
    ${miniField(S.xi)}
    <div class="spacer"></div>
    ${done ? `<div class="hero-card center"><b>Today's result: ${esc(done.title)}</b><div class="mute" style="font-weight:700">${esc(done.line)}</div></div><div class="actions"><button class="btn primary" id="pr">${ico('refresh', 18)} Practice drill</button></div>` : `<button class="btn primary" id="go" style="margin-top:12px">${ico('play', 18)} Take the field</button>`}`);
  const go1 = $('#go', el);
  if (go1) go1.addEventListener('click', () => GamedayGame(S.xi, S.opp, '2-Minute Drill', { drill: S, daily, seed }));
  const pr = $('#pr', el);
  if (pr) pr.addEventListener('click', () => DrillStart(true));
}
function drillFinish(g, opts, el) {
  const us = g.score.us, them = g.score.them;
  const res = us > them ? 'win' : us === them ? 'tie' : 'loss';
  const plays = g.calls.length, left = GD.fmtClock(Math.max(0, g.clock));
  const title = res === 'win' ? 'Game-winning drive!' : res === 'tie' ? 'Sent it to overtime' : 'Came up short';
  const line = `${us}-${them} · ${plays} plays${res === 'win' ? ' · ' + left + ' left' : ''}`;
  if (res === 'win') { unlock('drill'); Store.data.stats.drillWins++; addXP(120); confetti(); Sfx.trophy(); } else if (res === 'tie') { addXP(50); Sfx.good(); } else { addXP(25); Sfx.groan(); }
  if (opts.daily) savePuzzle('drill', { res, title, line });
  Runs.clear('drill');
  Store.save();
  $('#deck', el).innerHTML = `<div class="outcome ${res === 'loss' ? 'loss' : 'win'}"><h2>${res === 'win' ? 'Clutch!' : res === 'tie' ? 'Tied' : 'Stopped'}</h2><p>${title}</p><p class="mute" style="font-size:14px">${line}</p></div>
    <div class="actions"><button class="btn primary" id="sh">${ico('share', 18)} Share</button><div class="two"><button class="btn" id="again">${ico('refresh', 18)} Practice</button><button class="btn" data-act="home">Home</button></div></div>`;
  $('#dlog', el).innerHTML = '';
  $('#sh', el).addEventListener('click', () => shareOut(`CLUTCH 2-Minute Drill${opts.daily ? ' #' + dailyNumber(dayKey()) : ''} ⏱️\n${res === 'win' ? '✅' : res === 'tie' ? '🟨' : '❌'} ${title}\n${line}`));
  $('#again', el).addEventListener('click', () => DrillStart(true));
}

// =====================================================================
// KICK IT: time your aim and power. Each make moves you back 5 yards.
// =====================================================================
function KickIt(resume) {
  const best = Store.data.stats.kickBest;
  const el = go(`
    <div class="topbar"><button class="icon-btn" data-act="home">${ico('back', 20)}</button><div class="grow"><h2 class="d">Kick It</h2><div class="mute" style="font-weight:700;font-size:12px">Best: ${best} kicks</div></div>
      <span class="pill">Made <b id="km">0</b></span><span class="pill pink" id="lives"></span></div>
    <div class="kick-wrap"><canvas id="kc"></canvas><div class="kick-hud" id="hud"></div></div>
    <div class="kick-tip" id="tip">Tap to lock your aim</div>
    <div id="kover"></div>`);
  const cv = $('#kc', el), ctx = cv.getContext('2d');
  const S = { dist: 20, made: 0, lives: 3, longest: 0, phase: 'aim', aim: 0, power: 0, t0: performance.now(), wind: 0, fly: null, msg: '', msgCol: '#fff' };
  S.prevBest = Store.data.stats.kickBest;
  if (resume && resume.dist) Object.assign(S, { dist: resume.dist, made: resume.made, lives: resume.lives, longest: resume.longest });
  const saveKick = () => Runs.set('kick', { S: { dist: S.dist, made: S.made, lives: S.lives, longest: S.longest } });
  const newKick = () => { S.wind = Math.round((Math.random() * 2 - 1) * Math.min(18, 4 + (S.dist - 20) * 0.35)); S.phase = 'aim'; S.t0 = performance.now(); S.fly = null; tip('Tap to lock your aim'); hud(); };
  const tip = (t) => { $('#tip', el).textContent = t; };
  const hud = () => {
    $('#km', el).textContent = S.made;
    $('#lives', el).innerHTML = [0, 1, 2].map((i) => `<span style="opacity:${i < S.lives ? 1 : 0.2}">${ico('ball', 16)}</span>`).join('');
    $('#hud', el).innerHTML = `<div class="kh"><small>DISTANCE</small><b>${S.dist} yd</b></div><div class="kh"><small>WIND</small><b>${S.wind === 0 ? 'Calm' : Math.abs(S.wind) + ' mph ' + (S.wind > 0 ? '→' : '←')}</b></div>`;
  };
  const size = () => { const dpr = Math.min(2, devicePixelRatio || 1); const w = cv.clientWidth, h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return { w, h }; };
  let dims = size();
  window.addEventListener('resize', () => { if (el.isConnected) dims = size(); });
  const aimPeriod = () => Math.max(0.95, 2.0 - (S.dist - 20) * 0.02);
  const need = () => 0.32 + (S.dist - 20) / 45 * 0.58;
  function frame(t) {
    if (!el.isConnected) return;
    const { w, h } = dims;
    const hor = h * 0.36, cx = w / 2;
    // sky + stands
    let g = ctx.createLinearGradient(0, 0, 0, hor);
    g.addColorStop(0, '#cfe0ff'); g.addColorStop(1, '#f3f7ff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, hor);
    ctx.fillStyle = '#e3e9f6'; ctx.fillRect(0, hor - 34, w, 34);
    for (let i = 0; i < 70; i++) { ctx.fillStyle = ['#2f6bff', '#ff3d7f', '#ffc531', '#14b885', '#7b5cff'][i % 5]; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc((i * 37) % w, hor - 26 + ((i * 13) % 20), 2.4, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    // field in perspective
    const bot = h, topW = w * 0.22, botW = w * 1.5;
    for (let i = 0; i < 12; i++) {
      const y0 = hor + (bot - hor) * Math.pow(i / 12, 1.6), y1 = hor + (bot - hor) * Math.pow((i + 1) / 12, 1.6);
      const w0 = topW + (botW - topW) * ((y0 - hor) / (bot - hor)), w1 = topW + (botW - topW) * ((y1 - hor) / (bot - hor));
      ctx.fillStyle = i % 2 ? '#3cbc55' : '#36ad4b';
      ctx.beginPath(); ctx.moveTo(cx - w0 / 2, y0); ctx.lineTo(cx + w0 / 2, y0); ctx.lineTo(cx + w1 / 2, y1); ctx.lineTo(cx - w1 / 2, y1); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - w0 / 2, y0); ctx.lineTo(cx + w0 / 2, y0); ctx.stroke();
    }
    // goalpost: narrower when further away
    const postHalf = Math.max(9, 52 * 25 / (S.dist + 5)), postY = hor + 6, postTop = postY - 70;
    ctx.strokeStyle = '#ffc531'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, postY + 18); ctx.lineTo(cx, postY); ctx.moveTo(cx - postHalf, postY); ctx.lineTo(cx + postHalf, postY); ctx.moveTo(cx - postHalf, postY); ctx.lineTo(cx - postHalf, postTop); ctx.moveTo(cx + postHalf, postY); ctx.lineTo(cx + postHalf, postTop); ctx.stroke();
    // wind sock
    if (S.wind) { ctx.fillStyle = 'rgba(15,22,49,.55)'; ctx.font = '700 12px "Plus Jakarta Sans"'; ctx.textAlign = 'center'; const dx = S.wind > 0 ? 1 : -1; ctx.fillText('wind', cx + dx * (postHalf + 34), postTop + 12); ctx.beginPath(); ctx.moveTo(cx + dx * (postHalf + 18), postTop + 22); ctx.lineTo(cx + dx * (postHalf + 50), postTop + 22); ctx.lineTo(cx + dx * (postHalf + 44), postTop + 17); ctx.moveTo(cx + dx * (postHalf + 50), postTop + 22); ctx.lineTo(cx + dx * (postHalf + 44), postTop + 27); ctx.strokeStyle = 'rgba(15,22,49,.55)'; ctx.lineWidth = 2; ctx.stroke(); }
    const bx = cx, by = h - 46;
    const el2 = (t - S.t0) / 1000;
    if (S.phase === 'aim') S.aim = Math.sin(el2 * Math.PI * 2 / aimPeriod());
    if (S.phase === 'power') S.power = 1 - Math.abs(((el2 / 1.1) % 2) - 1);
    // aim line
    if (S.phase === 'aim' || S.phase === 'power') {
      const tx = cx + S.aim * w * 0.42;
      ctx.setLineDash([6, 8]); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, postY - 30); ctx.stroke(); ctx.setLineDash([]);
    }
    // power meter
    if (S.phase === 'power') {
      const mx = w - 30, my = h * 0.42, mh = h * 0.48;
      ctx.fillStyle = 'rgba(255,255,255,.85)'; roundR(ctx, mx - 9, my, 18, mh, 9); ctx.fill();
      const pg = ctx.createLinearGradient(0, my + mh, 0, my); pg.addColorStop(0, '#14b885'); pg.addColorStop(0.6, '#ffc531'); pg.addColorStop(1, '#ff4058');
      ctx.fillStyle = pg; roundR(ctx, mx - 6, my + mh * (1 - S.power) + 3, 12, mh * S.power - 6 > 0 ? mh * S.power - 6 : 0, 6); ctx.fill();
      ctx.fillStyle = '#0f1631'; ctx.fillRect(mx - 14, my + mh * (1 - need()), 28, 3);
    }
    // ball
    let ballX = bx, ballY = by, scale = 1;
    if (S.fly) {
      const k = Math.min(1, (t - S.fly.t0) / 1100);
      const f = S.fly;
      const endY = f.short ? postY + (by - postY) * (1 - f.reach) : postY - 32;
      ballX = bx + (f.x - bx) * k; ballY = by + (endY - by) * k - Math.sin(k * Math.PI) * (f.short ? 70 : 120);
      scale = 1 - 0.75 * k * (f.short ? f.reach : 1);
      if (k >= 1 && !f.done) { f.done = true; resolve(f); }
    }
    ctx.save(); ctx.translate(ballX, ballY); ctx.rotate(S.fly ? (t / 80) : -0.6); ctx.scale(scale, scale);
    ctx.fillStyle = '#8a4a1f'; ctx.beginPath(); ctx.ellipse(0, 0, 18, 11, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); for (let i = -4; i <= 4; i += 4) { ctx.moveTo(i, -3); ctx.lineTo(i, 3); } ctx.stroke();
    ctx.restore();
    if (S.msg) { ctx.font = '800 34px "Plus Jakarta Sans"'; ctx.textAlign = 'center'; ctx.fillStyle = S.msgCol; ctx.strokeStyle = 'rgba(15,22,49,.35)'; ctx.lineWidth = 6; ctx.strokeText(S.msg, cx, h * 0.6); ctx.fillText(S.msg, cx, h * 0.6); }
    requestAnimationFrame(frame);
  }
  function roundR(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function kick() {
    const { w } = dims, cx = w / 2;
    // lateral miss distance in "half-post widths": your aim + the wind, amplified by distance
    const amp = 0.9 + (S.dist - 20) / 30;
    const lateral = S.aim * 1.7 * amp + S.wind * 0.035 * (S.dist / 30);
    const short = S.power < need();
    const reach = short ? Math.max(0.3, S.power / need()) : 1;
    const postHalf = Math.max(9, 52 * 25 / (S.dist + 5));
    S.fly = { t0: performance.now(), x: cx + lateral * postHalf, short, reach, good: !short && Math.abs(lateral) <= 1.15, lateral };
    S.phase = 'fly';
    Sfx.hit(); buzz(20);
  }
  function resolve(f) {
    if (f.good) {
      S.made++; S.longest = Math.max(S.longest, S.dist); S.msg = 'GOOD!'; S.msgCol = '#14b885';
      Sfx.crowd(); buzz([20, 40, 20]);
      if (S.dist >= 55) unlock('kick55');
      if (S.made >= 10) unlock('kick10');
      S.dist = Math.min(70, S.dist + 5);
      if (S.made > Store.data.stats.kickBest) Store.data.stats.kickBest = S.made;
    } else {
      S.lives--; S.msg = f.short ? 'SHORT' : f.lateral < 0 ? 'WIDE LEFT' : 'WIDE RIGHT'; S.msgCol = '#ff4058';
      Sfx.groan(); buzz([50, 40, 50]);
    }
    hud();
    if (S.lives > 0) saveKick(); else Runs.clear('kick');
    setTimeout(() => {
      if (!el.isConnected) return;
      S.msg = '';
      if (S.lives <= 0) return over();
      newKick();
    }, 1100);
  }
  function over() {
    S.phase = 'over';
    const prev = S.prevBest;
    if (S.made > prev) { Store.data.stats.kickBest = S.made; Store.save(); }
    addXP(10 + S.made * 12);
    $('#tip', el).textContent = '';
    $('#kover', el).innerHTML = `<div class="outcome ${S.made > prev ? 'win' : 'loss'}"><h2>${S.made} made</h2><p>Longest: ${S.longest || '-'} yards${S.made > prev ? ' · New best!' : ' · Best: ' + prev}</p></div>
      <div class="actions"><button class="btn primary" id="re">${ico('refresh', 18)} Kick again</button><div class="two"><button class="btn" id="sh">${ico('share', 18)} Share</button><button class="btn" data-act="home">Home</button></div></div>`;
    $('#re', el).addEventListener('click', KickIt);
    $('#sh', el).addEventListener('click', () => shareOut(`CLUTCH Kick It 🦶\n${S.made} straight · longest ${S.longest} yards\nCan you beat it?`));
  }
  const tap = () => {
    if (S.phase === 'aim') { S.phase = 'power'; S.t0 = performance.now(); tip('Tap to lock your power. Reach the black line.'); Sfx.tap(); }
    else if (S.phase === 'power') { kick(); tip(''); }
  };
  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); tap(); });
  newKick();
  requestAnimationFrame(frame);
}

// =====================================================================
// CARD PACKS
// =====================================================================
function freePackReady() { return Store.data.freePack !== dayKey(); }
function Packs() {
  App.g = null;
  const d = Store.data;
  const el = go(`
    ${clubSeg('packs')}
    ${freePackReady() ? `<button class="free-pack" id="free"><div class="fp-ic">${ico('gift', 28)}</div><div class="grow"><b>Free daily pack</b><small>3 cards, on the house. Come back tomorrow for another.</small></div><span class="chip on">Open</span></button>` : ''}
    <div class="packs">${PACKS.map((p, i) => `<div class="packcard"><div class="pack-art" style="background:${p.grad}"><div class="pa-shine"></div><span>CLUTCH</span><b>${p.name}</b></div>
      <div class="pk-info"><b>${p.name} pack</b><small>${p.blurb}</small><button class="btn ${d.coins >= p.cost ? 'primary' : ''} small" data-pack="${i}" ${d.coins >= p.cost ? '' : 'disabled'}>${ico('coin', 16)} ${p.cost.toLocaleString()}</button></div></div>`).join('')}</div>
    <div class="hero-card" style="margin-top:14px"><b>Why collect?</b><div class="mute" style="font-weight:600;font-size:13px;line-height:1.5;margin-top:4px">Your cards build <b>My Club</b> for the Rivals ladder. Duplicates level a card up to ★★★, +1 rating each. Play any card as a <b>Wildcard</b> in drafts. Complete team sets for coin rewards.</div></div>`, 'has-tabs');
  tabbar('club');
  const fp = $('#free', el);
  if (fp) fp.addEventListener('click', () => { d.freePack = dayKey(); Store.save(); PackOpen({ id: 'free', name: 'Daily', n: 3, min: 0, grad: 'linear-gradient(150deg,#14b885,#2f6bff)' }); });
  $$('[data-pack]', el).forEach((b) => b.addEventListener('click', () => {
    const p = PACKS[+b.dataset.pack];
    if (d.coins < p.cost) return;
    d.coins -= p.cost; Store.save();
    PackOpen(p);
  }));
}
function PackOpen(pack) {
  const cards = rollPack(pack);
  const coll = Store.data.coll;
  const fresh = cards.map((pid) => !coll[pid]);
  // a duplicate levels the card up (max 3 stars); past that it turns into coins
  let dupeCoins = 0;
  const tags = cards.map((pid, i) => {
    if (fresh[i]) return '<span class="newtag">NEW</span>';
    if ((coll[pid] || 1) < 4) { coll[pid] = (coll[pid] || 1) + 1; if (coll[pid] >= 4) unlock('star3'); return `<span class="lvltag">${'★'.repeat(coll[pid] - 1)} LEVEL UP</span>`; }
    dupeCoins += dupeValue(TE.PLAYERS[pid].r); return `<span class="dupetag">+${dupeValue(TE.PLAYERS[pid].r)}</span>`;
  });
  collect(cards);
  Store.data.coins += dupeCoins;
  Store.data.stats.packs++;
  Store.save();
  const el = go(`
    <div class="topbar"><h2 class="d">${esc(pack.name)} pack</h2></div>
    <div class="pack-stage" id="stage"><button class="pack-big" id="pk" style="background:${pack.grad}"><div class="pa-shine"></div><span>CLUTCH</span><b>${esc(pack.name)}</b><small>Tap to open</small></button></div>
    <div id="after"></div>`);
  $('#pk', el).addEventListener('click', async () => {
    const pk = $('#pk', el);
    if (pk.dataset.busy) return; pk.dataset.busy = 1;
    pk.classList.add('rip'); Sfx.whistle(); buzz([30, 30, 60]);
    await sleep(700);
    const best = Math.max(...cards.map((pid) => TE.PLAYERS[pid].r));
    $('#stage', el).innerHTML = `<div class="flash ${tierOf(best)}"></div><div class="reveal-grid n${cards.length}">${cards.map((pid, i) => `<div class="flip" data-i="${i}"><div class="flip-in"><div class="pback"><span>CLUTCH</span></div><div class="pfront">${pcard(pid, { big: false, stars: cardLevel(pid) })}${tags[i]}</div></div></div>`).join('')}</div>`;
    for (let i = 0; i < cards.length; i++) {
      await sleep(i === cards.length - 1 && TE.PLAYERS[cards[i]].r >= 90 ? 900 : 420);
      if (!el.isConnected) return;
      const f = $(`.flip[data-i="${i}"]`, el); f.classList.add('on');
      const r = TE.PLAYERS[cards[i]].r;
      if (r >= 95) { Sfx.trophy(); confetti(2000); buzz([40, 60, 40]); unlock('pack_legend'); } else if (r >= 90) { Sfx.achievement(); buzz(30); } else Sfx.select();
    }
    $('#after', el).innerHTML = `${dupeCoins ? `<div class="hero-card center" style="margin-top:14px"><b>${ico('coin', 18)} +${dupeCoins} coins</b> <span class="mute" style="font-weight:700">from maxed-out duplicates</span></div>` : ''}
      <div class="actions"><button class="btn primary" id="more">${ico('pack', 18)} Back to packs</button><button class="btn" id="bind">${ico('cards', 18)} View binder</button></div>`;
    $('#more', el).addEventListener('click', Packs);
    $('#bind', el).addEventListener('click', Cards);
  });
}
