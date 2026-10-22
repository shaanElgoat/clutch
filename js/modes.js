'use strict';
// New modes: Gameday (call every play), Gauntlet (survival ladder), Dynasty (5 seasons), Who's Better (arcade).
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
// GAUNTLET
// =====================================================================
function GauntletStart() {
  introScreen({
    title: 'Gauntlet', icon: 'ladder', bg: 'linear-gradient(160deg,#ffe9f1,#ffcadc)',
    headline: 'Survive ten games', sub: 'You get two lives. Lose twice and the run is over. The GOATs are waiting at the top.',
    steps: [['Draft 12', 'Three re-spins to build your team.'], ['Climb the ladder', 'Each opponent is tougher than the last.'], ['Upgrade', 'Every 2 wins you get a spin to swap in a better player.'], ['Clutch Calls', 'Close games stop at 2:00 for your call.']],
    extra: `<div class="hero-card row" style="margin-top:12px"><div class="intro-ic sm">${ico('trophy', 22)}</div><div class="grow"><b>Best run</b><div class="mute" style="font-weight:800">${Store.data.stats.gauntletBest} / 10 wins</div></div></div>`,
    buttons: [{ label: 'Start a run', cls: 'hot', fn: () => {
      const seed = 'gt:' + rid();
      openDraft({ mode: 'gauntlet', seed, respins: 3, wildcard: true, managers: [{ name: myName() }], title: 'Gauntlet draft', onDone: (st) => GauntletHub({ seed, xi: st.managers[0].xi, ladder: TE.gauntletLadder(seed), wins: 0, lives: 2 }) });
    } }],
  });
}
function GauntletHub(run) {
  const me = TE.teamProfile(run.xi);
  const next = run.ladder[run.wins];
  const nc = teamColors(next);
  const el = go(`
    <div class="topbar"><button class="icon-btn" id="q">${ICON.close}</button><h2 class="d">Gauntlet</h2><span class="pill">${ico('heart', 14)} <b>${run.lives}</b></span><span class="pill pink">Wins <b>${run.wins}</b></span></div>
    <div class="vs"><div class="side"><div class="helmbig">${myTeamHelm()}</div><b>You</b><span>OVR ${me.ovr.toFixed(0)}</span></div><div class="x">VS</div>
      <div class="side"><div class="helmbig">${helmet(nc.c1, nc.c2, true)}</div><b>${esc(next.name)}</b><span>OVR ${next.prof.ovr.toFixed(0)}</span></div></div>
    <button class="btn hot" id="play"><span class="d">Play game ${run.wins + 1}</span></button>
    <div class="section-title">The ladder</div>
    <div class="ladder">${run.ladder.map((t, i) => { const c = teamColors(t); return `<div class="rung ${i < run.wins ? 'done' : i === run.wins ? 'next' : ''} ${i === 9 ? 'boss' : ''}"><div class="no">${i < run.wins ? '✓' : i + 1}</div><div class="hh">${helmet(c.c1, c.c2)}</div><div class="grow"><div class="nm">${esc(t.name)}${i === 9 ? ' ' + ico('crown', 14) : ''}</div><small>OVR ${t.prof.ovr.toFixed(0)}</small></div></div>`; }).reverse().join('')}</div>
    ${miniField(run.xi)}`);
  $('#play', el).addEventListener('click', () => gauntletGame(run, []));
  $('#q', el).addEventListener('click', () => modal(`<h2 class="d">End this run?</h2><p>You'll keep your best of ${Store.data.stats.gauntletBest}.</p><div class="actions two"><button class="btn" data-close>Keep going</button><button class="btn hot" id="end">End run</button></div>`, (bg) => { $('#end', bg).addEventListener('click', () => { bg.remove(); goTab(App.tab || 'play'); }); }));
}
function gauntletGame(run, choices) {
  const opp = run.ladder[run.wins];
  const seed = run.seed + ':r' + run.wins + (run.lives < 2 ? ':L' : '');
  const out = TE.singleGame({ name: myName(), xi: run.xi }, opp, seed, { interactive: true, choices, label: `Gauntlet · Game ${run.wins + 1}` });
  if (out.pending) {
    let chosen = null;
    showClutch(out.pending, myName(), (choice) => {
      chosen = choice;
      const r = TE.singleGame({ name: myName(), xi: run.xi }, opp, seed, { choices: choices.concat([choice]) }).result;
      return { win: r.win, text: r.clutch ? r.clutch.result : '', pf: r.us, pa: r.them, ot: r.ot };
    }, () => gauntletResult(run, TE.singleGame({ name: myName(), xi: run.xi }, opp, seed, { choices: choices.concat([chosen]) }).result, true));
    return;
  }
  gauntletResult(run, out.result, false);
}
function gauntletResult(run, r, hadClutch) {
  const opp = run.ladder[run.wins], oc = teamColors(opp);
  const qa = r.q.map((x) => x[0]), qb = r.q.map((x) => x[1]);
  // OT points aren't in the quarter split
  const otA = r.us - qa.reduce((a, b) => a + b, 0), otB = r.them - qb.reduce((a, b) => a + b, 0);
  const el = go(`
    <div class="topbar"><h2 class="d">Game ${run.wins + 1}</h2></div>
    <div class="vs"><div class="side"><div class="helmbig">${myTeamHelm()}</div><b>You</b></div><div class="x">VS</div><div class="side"><div class="helmbig">${helmet(oc.c1, oc.c2, true)}</div><b>${esc(opp.name)}</b></div></div>
    <div class="qboard" id="qb"><div class="h t">TEAM</div><div class="h">1</div><div class="h">2</div><div class="h">3</div><div class="h">4${otA || otB ? '+' : ''}</div><div class="h">F</div>
      <div class="t">You</div>${[0, 1, 2, 3].map((i) => `<div data-a="${i}">·</div>`).join('')}<div class="f" id="fa">0</div>
      <div class="t">${esc(opp.name)}</div>${[0, 1, 2, 3].map((i) => `<div data-b="${i}">·</div>`).join('')}<div class="f" id="fb">0</div></div>
    <div id="after" style="margin-top:14px"></div>`);
  let sa = 0, sb = 0;
  const reveal = async () => {
    for (let i = 0; i < 4; i++) {
      if (!hadClutch) await sleep(650);
      if (!el.isConnected) return;
      const a = qa[i] + (i === 3 ? otA : 0), b = qb[i] + (i === 3 ? otB : 0);
      sa += a; sb += b;
      const ca = $(`[data-a="${i}"]`, el), cb = $(`[data-b="${i}"]`, el);
      ca.textContent = a; cb.textContent = b; ca.classList.add('lit'); cb.classList.add('lit');
      $('#fa', el).textContent = sa; $('#fb', el).textContent = sb;
      Sfx.tick();
    }
    after();
  };
  const after = () => {
    const box = $('#after', el);
    if (r.win) {
      run.wins++;
      Store.data.stats.gauntletBest = Math.max(Store.data.stats.gauntletBest, run.wins); Store.save();
      addXP(30 + (run.wins === 10 ? 300 : 0));
      if (run.wins >= 5) unlock('g5');
      Sfx.crowd(true);
      if (run.wins >= 10) {
        unlock('g10'); confetti(); Sfx.trophy();
        box.innerHTML = `<div class="outcome win"><h2>GOAT SLAYER</h2><p>Ten straight. You beat the all-time team. Legendary.</p></div><div class="actions"><button class="btn primary" id="sh">Share</button><button class="btn" data-act="home">Home</button></div>`;
        $('#sh', box).addEventListener('click', () => shareOut('CLUTCH Gauntlet 🪜\n10/10 · I beat The GOATs 🐐'));
        return;
      }
      const upg = run.wins % 2 === 0;
      box.innerHTML = `<div class="outcome win"><h2>WIN ${r.us}–${r.them}</h2><p>${run.wins} down, ${10 - run.wins} to go.</p></div>
        ${upg ? `<div class="upgrade" style="margin-top:12px"><b>${ico('gift', 18)} Upgrade earned!</b><div class="mute" style="font-weight:700;font-size:13px">Spin and swap in a better player.</div></div>` : ''}
        <div class="actions"><button class="btn ${upg ? 'primary' : 'hot'}" id="nx">${upg ? 'Spin for an upgrade' : 'Next game'}</button></div>`;
      $('#nx', box).addEventListener('click', () => {
        if (!upg) return GauntletHub(run);
        openDraft({ mode: 'upgrade', seed: run.seed + ':up' + run.wins, respins: 1, replace: true, rounds: 1, managers: [{ name: myName(), xi: run.xi }], title: 'Upgrade spin', onDone: (st) => { run.xi = st.managers[0].xi; GauntletHub(run); } });
      });
    } else if (run.lives > 1) {
      run.lives--;
      Sfx.groan();
      box.innerHTML = `<div class="outcome loss"><h2>Life lost</h2><p>Lost ${r.us}–${r.them}. You have one life left, so take another shot at game ${run.wins + 1}.</p></div>
        <div class="actions"><button class="btn hot" id="nx">Try again</button></div>`;
      $('#nx', box).addEventListener('click', () => GauntletHub(run));
    } else {
      Sfx.groan();
      Store.data.stats.gauntletBest = Math.max(Store.data.stats.gauntletBest, run.wins); Store.save();
      box.innerHTML = `<div class="outcome loss"><h2>RUN OVER</h2><p>Lost ${r.us}–${r.them}. You won ${run.wins} game${run.wins === 1 ? '' : 's'}.</p><p class="mute" style="font-size:13px">Best: ${Store.data.stats.gauntletBest} / 10</p></div>
        <div class="actions"><button class="btn hot" id="re">New run</button><div class="two"><button class="btn" id="sh">Share</button><button class="btn" data-act="home">Home</button></div></div>`;
      $('#re', box).addEventListener('click', GauntletStart);
      $('#sh', box).addEventListener('click', () => shareOut(`CLUTCH Gauntlet 🪜\n${run.wins}/10 wins${run.wins ? ' ' + '🟩'.repeat(run.wins) : ''}🟥\nCan you reach the GOATs?`));
    }
  };
  reveal();
}

// =====================================================================
// DYNASTY
// =====================================================================
function DynastyStart() {
  const d = Store.data.dynasty;
  if (d) return DynastyHub();
  introScreen({
    title: 'Dynasty', icon: 'pillar', bg: 'linear-gradient(160deg,#efeaff,#dcd2ff)',
    headline: 'Build a five-year dynasty', sub: 'Your players age. Free agency spins keep you young. How many rings can you stack?',
    steps: [['Draft 12', 'Your core for the next five years.'], ['Play a season', 'Full season with Clutch Calls.'], ['Offseason', 'Players gain or lose rating as they age.'], ['Free agency', '3 spins each offseason to swap in new talent.']],
    buttons: [{ label: 'Start my dynasty', cls: 'primary', fn: () => {
      const seed = 'dy:' + rid();
      openDraft({ mode: 'dynasty', seed, respins: 2, wildcard: true, managers: [{ name: myName() }], title: 'Dynasty draft', onDone: (st) => { Store.data.dynasty = { seed, year: 1, xi: st.managers[0].xi, mods: {}, rings: 0, history: [] }; Store.save(); DynastyHub(); } });
    } }],
  });
}
function DynastyHub() {
  const d = Store.data.dynasty;
  const prof = TE.teamProfile(d.xi, { mods: d.mods });
  const el = go(`
    <div class="topbar"><button class="icon-btn" data-act="home">${ICON.back}</button><h2 class="d">Dynasty</h2><span class="pill"><b>${d.year}</b>/ 5</span></div>
    <div class="hero-card" style="background:linear-gradient(160deg,#efeaff,#fff)"><div class="row"><div class="grow"><div class="d" style="font-size:22px">Year ${d.year}</div><div class="mute" style="font-weight:800">OVR ${prof.ovr.toFixed(0)} · Chem ${prof.chem}</div></div>
      <div style="display:flex;gap:2px">${[0, 1, 2, 3, 4].map((i) => `<div style="width:30px;opacity:${i < d.rings ? 1 : 0.15};filter:${i < d.rings ? 'none' : 'grayscale(1)'}">${RING_SVG}</div>`).join('')}</div></div></div>
    <button class="btn primary" id="play" style="margin-top:12px"><span class="d">Play season ${d.year}</span></button>
    ${d.history.length ? `<div class="section-title">History</div><div class="ladder">${d.history.map((h) => `<div class="rung ${h.champion ? 'boss' : ''}"><div class="no">${h.year}</div><div class="grow"><div class="nm">${esc(h.title)}</div><small>${h.rec} · ${esc(h.stage)}</small></div>${h.champion ? ico('ring', 18) : ''}</div>`).join('')}</div>` : ''}
    <div class="section-title">Your roster</div>
    ${miniField(d.xi, d.mods)}
    <button class="btn small" id="abandon" style="margin:14px auto 0;color:var(--red)">Abandon dynasty</button>`);
  $('#play', el).addEventListener('click', () => {
    playSeason({ users: [{ name: myName(), xi: d.xi, mods: d.mods }], seed: d.seed + ':y' + d.year, interactive: [true], meta: [{ color: MGR_COLORS[0] }], title: `Year ${d.year}`, onFinish: (out) => {
      const r = out.results[0];
      seasonProgress(r, {});
      if (r.champion) { d.rings++; Store.data.stats.dynastyRings++; }
      d.history.push({ year: d.year, rec: rec(r), title: TE.verdict(r).title, stage: stageShort(r), champion: r.champion });
      if (d.rings >= 2) unlock('dyn2');
      const last = d.year >= 5;
      Store.save();
      SeasonResults(r, { title: `Dynasty · Year ${d.year}`, xi: d.xi, mods: d.mods, actions: [
        { label: last ? 'Dynasty complete →' : 'Go to the offseason →', cls: 'primary', fn: () => (last ? DynastyEnd() : DynastyOffseason()) },
      ] });
    } });
  });
  $('#abandon', el).addEventListener('click', () => modal(`<h2 class="d">Abandon?</h2><p>This dynasty will be deleted.</p><div class="actions two"><button class="btn" data-close>Keep it</button><button class="btn hot" id="ab">Abandon</button></div>`, (bg) => { $('#ab', bg).addEventListener('click', () => { bg.remove(); Store.data.dynasty = null; Store.save(); goTab(App.tab || 'play'); }); }));
}
function DynastyOffseason() {
  const d = Store.data.dynasty;
  const aged = TE.ageTeam(d.xi, d.mods, d.seed, d.year);
  d.mods = aged.mods; Store.save();
  const el = go(`
    <div class="topbar"><h2 class="d">Offseason ${d.year} → ${d.year + 1}</h2></div>
    <p class="mute" style="font-weight:700;margin:0 0 10px">Another year older. Here's how your roster changed:</p>
    <div class="cardgrid">${aged.changes.map((c) => `<div>${pcard(c.pid, { mods: d.mods, slotPos: TE.LINEUP[c.slot].pos })}</div>`).join('') || '<div class="mute">Nobody changed. Lucky!</div>'}</div>
    <div class="upgrade" style="margin-top:14px"><b>${ico('sparkle', 18)} Free agency</b><div class="mute" style="font-weight:700;font-size:13px">3 spins. Swap in fresh talent, or keep your guys.</div></div>
    <div class="spacer"></div>
    <button class="btn primary" id="fa">Open free agency</button>`);
  $('#fa', el).addEventListener('click', () => openDraft({ mode: 'fa', seed: d.seed + ':fa' + d.year, respins: 0, replace: true, rounds: 3, managers: [{ name: myName(), xi: d.xi }], mods: d.mods, title: 'Free agency', onDone: (st) => {
    d.xi = st.managers[0].xi; d.year++; Store.save(); DynastyHub();
  } }));
}
function DynastyEnd() {
  const d = Store.data.dynasty;
  unlock('dyn5');
  addXP(150 + d.rings * 100);
  const el = go(`
    <div class="verdict"><div style="display:flex;justify-content:center;gap:4px">${[0, 1, 2, 3, 4].map((i) => `<div style="width:46px;opacity:${i < d.rings ? 1 : 0.15};filter:${i < d.rings ? 'none' : 'grayscale(1)'}">${RING_SVG}</div>`).join('')}</div>
      <h1 class="${d.rings ? 'gold' : ''}">${d.rings >= 3 ? 'DYNASTY' : d.rings ? d.rings + ' RING' + (d.rings > 1 ? 'S' : '') : 'NO RINGS'}</h1><p>Five years in the books.</p></div>
    <div class="ladder" style="margin-top:12px">${d.history.map((h) => `<div class="rung ${h.champion ? 'boss' : ''}"><div class="no">${h.year}</div><div class="grow"><div class="nm">${esc(h.title)}</div><small>${h.rec} · ${esc(h.stage)}</small></div>${h.champion ? ico('ring', 18) : ''}</div>`).join('')}</div>
    <div class="actions"><button class="btn primary" id="sh">Share</button><button class="btn" id="new">New dynasty</button><button class="btn" data-act="home">Home</button></div>`);
  if (d.rings) { confetti(); Sfx.trophy(); }
  const text = `CLUTCH Dynasty 🏛️\n${d.rings} ring${d.rings === 1 ? '' : 's'} in 5 years ${'💍'.repeat(d.rings)}\n` + d.history.map((h) => `Y${h.year}: ${h.rec}${h.champion ? ' 🏆' : ''}`).join(' · ');
  $('#sh', el).addEventListener('click', () => shareOut(text));
  $('#new', el).addEventListener('click', () => { Store.data.dynasty = null; Store.save(); DynastyStart(); });
  Store.data.dynasty = null; Store.save();
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
