'use strict';
// Gameday (call every play) and Who's Better (arcade). Head-to-head modes live in arena.js.
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const helmOf = (team) => { const p = team.xi.find((x) => x !== null); const t = p !== undefined && p !== null ? TE.DATA.TEAMS[TE.PLAYERS[p].team] : { c1: '#0f1631', c2: '#ffc531' }; return helmet(t.c1, t.c2); };
const teamColors = (team) => { const p = team.xi.find((x) => x !== null); return p !== undefined && p !== null ? TE.DATA.TEAMS[TE.PLAYERS[p].team] : { c1: '#0f1631', c2: '#ffc531' }; };
const myTeamHelm = () => helmet('#2f6bff', '#ffc531');
const PLAY_ICO = { run: 'run', short: 'quick', deep: 'deep', pa: 'pa', fg: 'goalpost', punt: 'punt', blitz: 'bolt', zone: 'shield', man: 'lock', runstop: 'stop' };

function introScreen(o) {
  const el = go(`
    <div class="topbar"><button class="icon-btn" data-act="home">${ICON.back}</button><h2 class="d">${o.title}</h2></div>
    <div class="hero-card intro-hero" style="background:${o.bg || 'var(--card)'}"><div class="intro-ic">${ico(o.icon, 34)}</div>
      <div class="d" style="font-size:24px;margin-top:4px">${o.headline}</div><p class="mute" style="font-weight:700;margin:8px 0 0">${o.sub}</p></div>
    <div class="section-title">How it works</div>
    <div class="steps">${o.steps.map((s, i) => `<div class="step"><div class="n" style="background:${['var(--blue)', 'var(--orange)', 'var(--mint)', 'var(--pink)'][i % 4]}">${i + 1}</div><div><h4>${s[0]}</h4><p>${s[1]}</p></div></div>`).join('')}</div>
    ${o.extra || ''}
    <div class="spacer"></div>
    <div class="actions">${o.buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-b="${i}">${b.label}</button>`).join('')}</div>`);
  $$('[data-b]', el).forEach((b) => b.addEventListener('click', () => o.buttons[+b.dataset.b].fn()));
  return el;
}

// =====================================================================
// GAMEDAY
// =====================================================================
function GamedayStart() {
  const last = Store.data.gdTeam;
  introScreen({
    title: 'Gameday', icon: 'clipboard', bg: 'linear-gradient(160deg,#e7fbf2,#c6f1de)',
    headline: 'You call every play', sub: 'Draft a team, pick an opponent, then out-think their defense snap by snap.',
    steps: [['Draft 12', 'A quick draft with 3 re-spins.'], ['Pick your opponent', 'Rookie, Pro or Legend difficulty.'], ['Call it', 'Run, quick pass, deep shot or play-action. Every play shows the defense they were in, so read the tendencies.'], ['Defend', 'Pick a coverage for each of their drives.']],
    buttons: [
      ...(last ? [{ label: 'Play with my last team', cls: 'primary', fn: () => GamedayOpp(last) }] : []),
      { label: last ? 'Draft a new team' : 'Draft my team', cls: last ? '' : 'primary', fn: () => openDraft({ mode: 'gameday', seed: 'gd:' + rid(), respins: 3, wildcard: true, managers: [{ name: myName() }], title: 'Gameday draft', onDone: (st) => { Store.data.gdTeam = st.managers[0].xi; Store.save(); GamedayOpp(st.managers[0].xi); } }) },
    ],
  });
}
function GamedayOpp(xi, mods) {
  const sorted = TE.CUR_SQ.slice().sort((a, b) => TE.squadStrength(a) - TE.squadStrength(b));
  const r = TE.rng('opp:' + rid());
  const pickQ = (lo, hi) => sorted[Math.floor((lo + r() * (hi - lo)) * (sorted.length - 1))];
  const opps = [
    { diff: 'Rookie', col: 'var(--mint)', bg: 'var(--mint-soft)', team: TE.squadTeam(pickQ(0.06, 0.3)) },
    { diff: 'Pro', col: 'var(--orange)', bg: 'var(--orange-soft)', team: TE.squadTeam(pickQ(0.55, 0.8)) },
    { diff: 'Legend', col: 'var(--red)', bg: '#ffe8ec', team: TE.squadTeam(pickQ(0.92, 1)) },
  ];
  const me = TE.teamProfile(xi, { mods });
  const el = go(`
    <div class="topbar"><button class="icon-btn" data-act="home">${ICON.back}</button><h2 class="d">Pick your opponent</h2></div>
    <div class="hero-card row" style="margin-bottom:12px"><div style="width:64px">${myTeamHelm()}</div><div class="grow"><b>${esc(myName() === 'You' ? 'Your team' : myName())}</b><div class="mute" style="font-weight:800">OVR ${me.ovr.toFixed(0)} · Chem ${me.chem}</div></div><button class="chip" id="edit">New draft</button></div>
    <div class="opp-picker">${opps.map((o, i) => { const t = teamColors(o.team); return `<button class="opp" data-o="${i}"><div class="hh">${helmet(t.c1, t.c2)}</div><div><b>${esc(o.team.name)}</b><small>OVR ${o.team.prof.ovr.toFixed(0)} · ${TE.DATA.ERA_LABEL[TE.SQUADS[o.team.sq].era]}</small></div><span class="diff" style="background:${o.bg};color:${o.col}">${o.diff}</span></button>`; }).join('')}</div>
    <div class="spacer"></div>
    ${miniField(xi, mods)}`);
  $$('[data-o]', el).forEach((b) => b.addEventListener('click', () => { const o = opps[+b.dataset.o]; GamedayGame(xi, o.team, o.diff, { mods }); }));
  $('#edit', el).addEventListener('click', () => { Store.data.gdTeam = null; GamedayStart(); });
}

function GamedayGame(xi, opp, diff, opts) {
  opts = opts || {};
  const me = { name: myName() === 'You' ? 'You' : myName(), xi, prof: TE.teamProfile(xi, { mods: opts.mods }) };
  const g = GD.create(me, opp, 'gdg:' + rid());
  g.halfRecv = 'them';
  if (opts.drill) { g.quarter = 4; g.clock = opts.drill.clock; g.score = { us: 17, them: 17 + opts.drill.deficit }; g.ball = opts.drill.ball; }
  const oc = teamColors(opp);
  const st = { last: null, busy: false, log: [] };
  const el = go(`
    <div class="night-head">
      <div class="row" style="position:relative"><button class="icon-btn" id="quit">${ICON.closeW}</button><div class="grow topline">${opts.drill ? '2-Minute Drill' : 'Gameday · ' + diff}</div><span style="width:44px"></span></div>
      <div class="scoreboard"><div class="teams">
        <div class="tm" id="tUs"><div class="n">${esc(me.name === 'You' ? 'Your team' : me.name)}</div><div class="s" id="sUs">${g.score.us}</div></div>
        <div class="clock" id="clk">15:00<small>Q1</small></div>
        <div class="tm" id="tThem"><div class="n">${esc(opp.name)}</div><div class="s" id="sThem">${g.score.them}</div></div></div></div>
      <div class="dd" id="dd"></div></div>
    <div class="strip" id="strip"></div>
    <div class="playres" id="pres"></div>
    <div id="deck"></div>
    <div class="drive-log" id="dlog"></div>`, 'gd');
  $('#quit', el).addEventListener('click', () => modal(`<h2 class="d">Forfeit?</h2><p>Leaving now counts as a loss.</p><div class="actions two"><button class="btn" data-close>Keep playing</button><button class="btn hot" id="ff">Forfeit</button></div>`, (bg) => { $('#ff', bg).addEventListener('click', () => { bg.remove(); goTab(App.tab || 'play'); }); }));
  // field strip, always from your end zone (left) to theirs (right)
  const strip = $('#strip', el);
  strip.innerHTML = `<div class="ez l" style="background:#2f6bff">YOU</div><div class="ez r" style="background:${oc.c1};color:${lightColor(oc.c1) ? '#111' : '#fff'}">THEM</div>` +
    [10, 20, 30, 40, 50, 60, 70, 80, 90].map((y) => `<div class="yl" style="left:${8 + y * 0.84}%"></div><div class="yn" style="left:${8 + y * 0.84}%">${y <= 50 ? y : 100 - y}</div>`).join('') +
    `<div class="losl" id="los"></div><div class="fdl" id="fdl"></div><div class="ballm" id="ballm">${FOOTBALL}</div>`;
  const X = (yard) => `${8 + Math.max(0, Math.min(100, yard)) * 0.84}%`;
  function drawField() {
    const ours = g.poss === 'us';
    const b = ours ? g.ball : 100 - g.ball;
    const fd = ours ? Math.min(100, g.ball + g.togo) : 100 - Math.min(100, g.ball + g.togo);
    $('#los', el).style.left = X(b); $('#fdl', el).style.left = X(fd); $('#ballm', el).style.left = X(b);
  }
  function drawBoard(bump) {
    const su = $('#sUs', el), sh = $('#sThem', el);
    if (+su.textContent !== g.score.us) { su.textContent = g.score.us; if (bump) su.classList.add('bump'); }
    if (+sh.textContent !== g.score.them) { sh.textContent = g.score.them; if (bump) sh.classList.add('bump'); }
    setTimeout(() => { su.classList.remove('bump'); sh.classList.remove('bump'); }, 600);
    $('#clk', el).innerHTML = `${GD.fmtClock(g.clock)}<small>${g.ot ? 'OT' : 'Q' + Math.min(4, g.quarter)}</small>`;
    $('#tUs', el).classList.toggle('has', g.poss === 'us'); $('#tThem', el).classList.toggle('has', g.poss === 'them');
    const dn = ['1st', '2nd', '3rd', '4th'][g.down - 1] || '4th';
    $('#dd', el).innerHTML = `<span><b>${dn} & ${g.togo >= 100 - g.ball ? 'Goal' : g.togo}</b></span><span>${g.poss === 'us' ? 'Your ball · ' + GD.yardText(g.ball) : 'Their ball · ' + (g.ball < 50 ? 'their ' + g.ball : g.ball === 50 ? 'midfield' : 'your ' + (100 - g.ball))}</span>`;
  }
  function evLine(ev) {
    const ours = ev.side === 'us';
    const def = ev.defCall ? GD.DEFS[ev.defCall] : null;
    let head = '', cls = '', sub = '';
    if (ev.kind === 'punt') { head = 'Punt'; sub = `${ev.yards} yards`; }
    else if (ev.kind === 'fg') { head = ev.good ? 'Field goal!' : 'No good'; cls = ev.good === ours ? 'good' : 'bad'; sub = `${ev.who} from ${ev.dist}`; }
    else if (ev.kind === 'int') { head = 'Intercepted!'; cls = ours ? 'bad' : 'good'; sub = `Picked off by ${ev.who}`; }
    else if (ev.kind === 'fumble') { head = 'Fumble!'; cls = ours ? 'bad' : 'good'; sub = 'Turnover'; }
    else if (ev.kind === 'sack') { head = 'Sacked!'; cls = ours ? 'bad' : 'good'; sub = `${ev.who} for ${ev.yards}`; }
    else if (ev.kind === 'inc') { head = 'Incomplete'; cls = ours ? 'bad' : 'good'; sub = `${ev.qb}'s pass falls incomplete`; }
    else {
      const y = ev.yards;
      head = ev.td ? 'TOUCHDOWN!' : y >= 20 ? `+${y} BIG PLAY` : y <= 0 ? `${y} yards` : ev.first ? 'First down!' : `+${y} yards`;
      cls = ev.td || y >= 20 ? (ours ? 'bigp' : 'bad') : y <= 0 ? (ours ? 'bad' : 'good') : ours ? 'good' : '';
      sub = ev.play === 'run' ? `${ev.who} runs for ${y}` : `${ev.qb} → ${ev.who} for ${y}`;
    }
    if (ev.result === 'TURNOVER ON DOWNS') { head = 'Turnover on downs'; cls = ours ? 'bad' : 'good'; }
    if (ev.result === 'SAFETY') { head = 'Safety!'; cls = ours ? 'bad' : 'good'; }
    return { head, cls, sub, def };
  }
  function showPlay(ev) {
    const L = evLine(ev);
    $('#pres', el).innerHTML = `<h3 class="${L.cls}">${esc(L.head)}</h3><p>${esc(L.sub)}</p>${L.def && ev.side === 'us' ? `<span class="tag">Defense was in: ${L.def.name}</span>` : L.def && ev.side === 'them' ? `<span class="tag">Your call: ${L.def.name}</span>` : ''}`;
    const d = document.createElement('div');
    d.innerHTML = `<i class="dl-dot ${ev.side}"></i>Q${Math.min(4, ev.quarterBefore || g.quarter)} · ${L.head}${L.sub ? ' · ' + L.sub : ''}`;
    const log = $('#dlog', el); log.insertBefore(d, log.firstChild);
    while (log.children.length > 6) log.lastChild.remove();
    if (ev.td || ev.good) { if (ev.side === 'us') { Sfx.crowd(true); buzz([40, 50, 40]); confetti(900); } else Sfx.groan(); }
    else if (ev.kind === 'int' || ev.kind === 'fumble' || ev.kind === 'sack') { Sfx.hit(); buzz(40); }
    else if (ev.first) Sfx.good();
    else Sfx.tap();
    if (ev.half) toast('Halftime');
    if (ev.otStart) toast('Overtime! Next score wins');
  }
  function scoutTip() {
    if (g.down >= 3 && g.togo >= 7) return 'Scouting: on 3rd & long they love to <b>blitz</b> or drop into <b>zone</b>. Quick passes beat the blitz.';
    if (g.togo <= 2) return 'Scouting: short yardage, so expect a <b>run stop</b>. Play-action can catch them cheating.';
    if (g.down === 1) return 'Scouting: on 1st down they often <b>stack the box</b> against the run.';
    if (g.quarter >= 4 && g.clock <= 120 && g.score.them > g.score.us) return 'Two-minute drill: they will sit back in zone. Take what they give.';
    return 'Scouting: on 2nd down they mix it up.';
  }
  function deck() {
    const n = GD.next(g);
    const box = $('#deck', el);
    if (n.need === 'over') return finish();
    if (n.need === 'off') {
      const plays = n.options.filter((o) => o.edge !== undefined), kicks = n.options.filter((o) => o.edge === undefined);
      box.innerHTML = `<div class="playgrid">${plays.map((o) => { const e = o.edge >= 2 ? ['g', 'Edge'] : o.edge <= -2 ? ['b', 'Tough'] : ['e', 'Even']; return `<button class="pc" data-p="${o.id}"><span class="edge ${e[0]}">${e[1]}</span><div class="ic">${ico(PLAY_ICO[o.id], 22)}</div><h4>${o.name}</h4><p>${esc(o.who)}</p></button>`; }).join('')}
        ${kicks.map((o) => `<button class="pc kick" data-p="${o.id}"><div class="ic">${ico(PLAY_ICO[o.id], 22)}</div><h4>${o.name}${o.odds !== null && o.odds !== undefined ? ` <span class="mute" style="font-size:12px">${Math.round(o.odds * 100)}%</span>` : ''}</h4><p>${esc(o.sub)}</p></button>`).join('')}</div>
        <div class="scout">${ico('sparkle', 18)}<span>${scoutTip()}</span></div>
        <div class="gd-actions"><button class="btn small" id="auto" style="flex:1">${ico('robot', 18)} Let the coordinator call it</button></div>`;
      $$('[data-p]', box).forEach((b) => b.addEventListener('click', () => act(() => GD.callPlay(g, b.dataset.p))));
      $('#auto', box).addEventListener('click', () => act(() => GD.autoPlay(g)));
    } else {
      box.innerHTML = `<div class="section-title" style="margin-top:0">Their ball: call your defense</div><div class="playgrid">${n.options.map((o) => `<button class="pc" data-d="${o.id}"><div class="ic">${ico(PLAY_ICO[o.id], 22)}</div><h4>${o.name}</h4><p>${esc(o.sub)}</p></button>`).join('')}</div>`;
      $$('[data-d]', box).forEach((b) => b.addEventListener('click', () => act(() => GD.callDefense(g, b.dataset.d), true)));
    }
  }
  async function act(fn, isDef) {
    if (st.busy) return; st.busy = true;
    Sfx.whistle();
    const evs = fn() || [];
    $('#deck', el).style.opacity = .4;
    for (const ev of evs) {
      showPlay(ev); drawField(); drawBoard(true);
      await sleep(isDef ? 750 : 450);
      if (!el.isConnected) return;
    }
    $('#deck', el).style.opacity = 1;
    st.busy = false;
    drawField(); drawBoard(false);
    if (opts.drill && (g.poss !== 'us' || g.over || g.quarter > 4)) { drillFinish(g, opts, el); return; }
    deck();
  }
  function finish() {
    const r = GD.result(g);
    Store.data.stats.gdPlayed++; if (r.win) Store.data.stats.gdWins++; Store.save();
    addXP(60 + (r.win ? 100 : 0) + (r.win && diff === 'Legend' ? 100 : 0));
    if (r.win) { unlock('gd_win'); if (diff === 'Legend') unlock('gd_top'); }
    if (r.us >= 40) unlock('gd_40');
    const tdList = Object.keys(r.td).map((k) => `${k} ×${r.td[k]}`).join(', ') || 'None';
    $('#deck', el).innerHTML = `<div class="outcome ${r.win ? 'win' : 'loss'}"><h2>${r.win ? 'VICTORY' : 'DEFEAT'}</h2><p>${r.us}–${r.them}${r.ot ? ' (OT)' : ''} vs ${esc(opp.name)}</p></div>
      <div class="facts"><div class="fact"><div class="k">Passing</div><div class="v">${r.pass} yds</div></div><div class="fact"><div class="k">Rushing</div><div class="v">${r.rush} yds</div></div>
      <div class="fact hi"><div class="k">MVP</div><div class="v">${esc(r.mvp)}</div></div><div class="fact"><div class="k">Touchdowns</div><div class="v" style="font-size:13px">${esc(tdList)}</div></div></div>
      <div class="actions"><button class="btn primary" id="again">Rematch</button><div class="two"><button class="btn" id="opp">New opponent</button><button class="btn" id="share">Share</button></div><button class="btn" data-act="home">Home</button></div>`;
    $('#dlog', el).innerHTML = '';
    if (r.win) { confetti(); Sfx.trophy(); } else Sfx.groan();
    $('#again', el).addEventListener('click', () => GamedayGame(xi, opp, diff));
    $('#opp', el).addEventListener('click', () => GamedayOpp(xi, opts.mods));
    $('#share', el).addEventListener('click', () => shareOut(`CLUTCH Gameday 🏈📋\n${r.win ? 'W' : 'L'} ${r.us}-${r.them} vs ${opp.name} (${diff})\nI called every play. MVP: ${r.mvp}`));
  }
  drawField(); drawBoard(false);
  $('#pres', el).innerHTML = opts.drill ? `<h3>2:00 left</h3><p>Down ${opts.drill.deficit}. Go win it.</p>` : `<h3>Kickoff!</h3><p>You receive. Call your first play.</p>`;
  deck();
}

// =====================================================================
// WHO'S BETTER?
// =====================================================================
function WhosBetter() {
  const s = { streak: 0, pair: null, busy: false, timer: null };
  const el = go(`
    <div class="hl-head"><button class="icon-btn" data-act="home">${ICON.back}</button>
      <div class="streak" id="stk">0<small>STREAK</small></div>
      <div class="pill">BEST <b>${Store.data.stats.hlBest}</b></div></div>
    <div class="hl-body"><div class="hl-q d" style="font-size:22px">Who's rated higher?</div>
    <div class="hl-pair" id="pair"></div>
    <div class="timer"><i id="tbar"></i></div>
    <div class="hl-sub" id="hsub">Tap the better player · ratings at their peak with that team</div>
    <div id="over"></div></div>`);
  const pick = () => {
    const r = Math.random;
    const maxGap = Math.max(1, 12 - Math.floor(s.streak / 2));
    for (let k = 0; k < 400; k++) {
      const a = TE.PLAYERS[Math.floor(r() * TE.PLAYERS.length)], b = TE.PLAYERS[Math.floor(r() * TE.PLAYERS.length)];
      if (a.name === b.name || a.r === b.r) continue;
      if (Math.abs(a.r - b.r) > maxGap) continue;
      if (s.streak >= 6 && a.pos !== b.pos && k < 300) continue;
      return [a.id, b.id];
    }
    return [0, 1];
  };
  const draw = (reveal, chosen) => {
    const [a, b] = s.pair, ra = TE.PLAYERS[a].r, rb = TE.PLAYERS[b].r;
    const right = ra > rb ? 0 : 1;
    $('#pair', el).innerHTML = [a, b].map((pid, i) => `<button class="opt ${reveal ? (i === right ? 'right' : i === chosen ? 'wrong' : '') : ''}" data-i="${i}">${pcard(pid, { hideRating: !reveal, big: true })}</button>`).join('') + '<div class="hl-vs">VS</div>';
    if (!reveal) $$('.opt', el).forEach((o) => o.addEventListener('click', () => answer(+o.dataset.i)));
  };
  const next = () => {
    s.pair = pick(); s.busy = false;
    draw(false);
    startTimer();
  };
  const startTimer = () => {
    cancelAnimationFrame(s.timer);
    const total = Math.max(5000, 10000 - s.streak * 120), t0 = performance.now();
    const loop = () => {
      if (!el.isConnected || s.busy) return;
      const k = (performance.now() - t0) / total;
      $('#tbar', el).style.transform = `scaleX(${Math.max(0, 1 - k)})`;
      if (k >= 1) { answer(-1); return; }
      s.timer = requestAnimationFrame(loop);
    };
    s.timer = requestAnimationFrame(loop);
  };
  const answer = (i) => {
    if (s.busy) return; s.busy = true;
    cancelAnimationFrame(s.timer);
    const [a, b] = s.pair, right = TE.PLAYERS[a].r > TE.PLAYERS[b].r ? 0 : 1;
    draw(true, i);
    if (i === right) {
      s.streak++; Sfx.good(); buzz(15);
      const st = $('#stk', el); st.innerHTML = `${s.streak}<small>STREAK</small>`;
      setTimeout(() => { if (el.isConnected) next(); }, 1000);
    } else {
      Sfx.bad(); buzz([60, 40, 60]);
      const best = Store.data.stats.hlBest;
      if (s.streak > best) { Store.data.stats.hlBest = s.streak; Store.save(); }
      if (s.streak >= 10) unlock('hl10');
      if (s.streak >= 25) unlock('hl25');
      addXP(s.streak * 5);
      $('#hsub', el).textContent = i < 0 ? "Time's up!" : 'Wrong call!';
      $('#over', el).innerHTML = `<div class="outcome loss" style="margin-top:14px"><h2>${s.streak}</h2><p>${s.streak > best ? 'New best!' : 'Best: ' + Math.max(best, s.streak)}</p></div>
        <div class="actions"><button class="btn primary" id="re">Play again</button><div class="two"><button class="btn" id="sh">Share</button><button class="btn" data-act="home">Home</button></div></div>`;
      $('#re', el).addEventListener('click', WhosBetter);
      $('#sh', el).addEventListener('click', () => shareOut(`CLUTCH · Who's Better? 🧠\nStreak: ${s.streak} 🔥\nThink you know football?`));
    }
  };
  next();
}
