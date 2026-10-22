'use strict';
// Season playback, Clutch Calls and season results. Shared by Season, Daily, Dynasty, Party and Online.
//   playSeason(ctx) with ctx = { users:[{name, xi, mods}], seed, interactive:[bool], meta:[{color}], title, choices?, onFinish(out) }
const rec = (r) => `${r.w}-${r.l}`;
const stageShort = (r) => (r.champion ? 'Won the Super Bowl' : r.stage === 4 ? 'Lost the Super Bowl' : r.stage === 3 ? 'Lost in Conf. Champ.' : r.stage === 2 ? 'Lost in Divisional' : r.stage === 1 ? 'Lost in Wild Card' : 'Missed playoffs');
const PO_SHORT = { 'Wild Card': 'WC', 'Divisional': 'DIV', 'Conference Championship': 'CONF', 'Super Bowl': 'SB' };

function playSeason(ctx) {
  ctx.S = { choices: ctx.choices ? ctx.choices.map((c) => c.slice()) : ctx.users.map(() => []), shown: 0 };
  runSeason(ctx);
}
function runSeason(ctx) {
  const S = ctx.S;
  S.out = TE.simSeason(ctx.users, ctx.seed, { choices: S.choices, interactive: ctx.interactive });
  if (!S.out.pending) S.choices = S.out.choices;
  SeasonScreen(ctx);
}
function seasonEvents(S) {
  const tls = S.out.pending ? S.out.partial.timeline : S.out.results.map((r) => r.timeline);
  const ev = [];
  tls.forEach((tl, i) => tl.forEach((e) => ev.push({ i, e })));
  ev.sort((a, b) => a.e.week - b.e.week || a.i - b.i);
  return ev;
}

function SeasonScreen(ctx) {
  const S = ctx.S, multi = ctx.users.length > 1;
  const prof = TE.teamProfile(ctx.users[0].xi, { mods: ctx.users[0].mods });
  const el = go(`
    <div class="season-head"><div class="d">${esc(ctx.title || 'The Season')}</div><div class="mute" style="font-weight:800">${multi ? ctx.users.length + ' GMs · one conference' : 'OVR ' + prof.ovr.toFixed(0) + ' · Chem ' + prof.chem}</div></div>
    ${multi ? '<div class="mgr-cards" id="mc"></div>' : `
      <div class="scorebar"><div class="sb w"><div class="v" id="sW">0</div><div class="k">WINS</div></div><div class="sb l"><div class="v" id="sL">0</div><div class="k">LOSSES</div></div><div class="sb"><div class="v" id="sP">–</div><div class="k">SEED</div></div><div class="sb c"><div class="v" id="sC">0/0</div><div class="k">CLUTCH</div></div></div>
      <div class="form" id="form">${'<i></i>'.repeat(17)}</div>
      <div class="path" id="path"><div>Wild Card</div><div>Divisional</div><div>Conf.</div><div>Super Bowl</div></div>
      <div class="live" id="live"></div>`}
    <div class="ticker" id="tick"></div>
    <div class="live-ctl">${multi ? '' : `<button class="btn" id="spd">${ico('bolt', 16)} <span>1x</span></button>`}<button class="btn skip" id="skip">Skip to the end ▸▸</button></div>`);
  const tick = $('#tick', el);
  const live = ctx.users.map(() => ({ w: 0, l: 0, pos: null, cw: 0, ct: 0, stage: '' }));
  const addRow = (html, cls) => { const d = document.createElement('div'); d.className = 'mrow ' + (cls || ''); d.innerHTML = html; tick.insertBefore(d, tick.firstChild); };
  const shows = (i, e) => { const h2h = e.oppKey && e.oppKey[0] === 'U'; return !multi || e.comp === 'P' || e.clutch || (h2h && i < +e.oppKey.slice(1)); };
  const matchRow = (i, e) => {
    const who = multi ? `<span style="color:${ctx.meta[i].color}">${esc(ctx.users[i].name)}</span> ${e.home ? 'vs' : '@'} ` : (e.neutral || e.home ? 'vs ' : '@ ');
    const badge = e.comp === 'P' ? PO_SHORT[e.label] : e.prime ? 'PRIME' : 'W' + e.week;
    const sub = e.clutch ? `Clutch call: ${esc(e.clutch.title)} · ${e.clutch.win ? '<b style="color:var(--mint)">made it</b>' : '<b style="color:var(--red)">missed</b>'}` : esc(e.label) + (e.ot ? ' · OT' : '');
    addRow(`<span class="cb ${e.comp === 'P' ? 'P' : e.prime ? 'X' : 'R'}">${badge}</span><span class="mt"><b>${who}${esc(e.opp)}</b><small>${sub}</small></span><span class="sc">${e.pf}-${e.pa}</span><span class="res ${e.res}">${e.res}</span>`, e.comp === 'P' ? 'big' : '');
  };
  const renderLive = () => {
    if (multi) {
      $('#mc', el).innerHTML = ctx.users.map((u, i) => { const L = live[i]; return `<div class="mgr-card"><span class="dot" style="background:${ctx.meta[i].color}"></span><span class="nm">${esc(u.name)}</span><span class="st">${L.stage || (L.pos ? ordinal(L.pos) : '')}</span><span class="rec">${L.w}-${L.l}</span></div>`; }).join('');
      return;
    }
    const L = live[0];
    $('#sW', el).textContent = L.w; $('#sL', el).textContent = L.l;
    $('#sP', el).textContent = L.pos ? (L.pos <= 7 ? '#' + L.pos : ordinal(L.pos)) : '–';
    $('#sC', el).textContent = L.cw + '/' + L.ct;
  };
  const apply = (x, quiet) => {
    const { i, e } = x, L = live[i];
    if (e.res === 'W') L.w++; else L.l++;
    if (e.clutch) { L.ct++; if (e.clutch.win) L.cw++; }
    if (e.comp === 'R') {
      const pb = (S.out.pending ? S.out.partial.posByWeek : S.out.results.map((r) => r.posByWeek))[i];
      L.pos = pb[e.week - 1] || L.pos;
      if (!multi) { const f = $('#form', el).children[e.week - 1]; if (f) f.className = e.res; }
    } else {
      L.stage = e.res === 'W' ? (e.label === 'Super Bowl' ? 'CHAMPS' : 'Won ' + PO_SHORT[e.label]) : 'Out ' + PO_SHORT[e.label];
      if (!multi) {
        const idx = ['Wild Card', 'Divisional', 'Conference Championship', 'Super Bowl'].indexOf(e.label);
        const box = $('#path', el).children[idx]; if (box) box.className = e.res;
        if (idx === 1) { const wc = $('#path', el).children[0]; if (!wc.className) { wc.className = 'bye'; wc.textContent = 'Bye'; } }
      }
    }
    if (!quiet && shows(i, e)) matchRow(i, e);
    if (!quiet && !multi) { if (e.res === 'W') Sfx.win(); else Sfx.loss(); }
    if (!quiet && e.label === 'Super Bowl' && e.res === 'W') { addRow(`<span style="width:34px">${TROPHY_SVG.replace('<svg', '<svg width="30" height="30"')}</span><span class="mt"><b>${multi ? esc(ctx.users[i].name) + ' win' : 'You win'} the Super Bowl!</b></span>`, 'trophy'); Sfx.trophy(); buzz([30, 40, 80]); }
  };
  const events = seasonEvents(S);
  events.slice(0, S.shown).forEach((x) => apply(x, true));
  if (S.shown) events.slice(0, S.shown).forEach(({ i, e }) => { if (shows(i, e)) matchRow(i, e); });
  renderLive();
  let finished = false, skipping = false;
  const toClutch = () => later(() => seasonClutch(ctx), skipping ? 60 : 700);
  const finish = () => {
    if (finished) return; finished = true;
    const lb = $('#live', el); if (lb && (skipping || !S.out.pending)) lb.className = 'live';
    for (; S.shown < events.length; S.shown++) apply(events[S.shown], true);
    renderLive();
    tick.innerHTML = '';
    events.forEach(({ i, e }) => { if (shows(i, e)) matchRow(i, e); });
    if (S.out.pending) { toClutch(); return; }
    S.out.results.forEach((r) => { if (r.champion) addRow(`<span style="width:34px">${TROPHY_SVG.replace('<svg', '<svg width="30" height="30"')}</span><span class="mt"><b>${multi ? esc(r.name) : 'You'}: Super Bowl champions</b></span>`, 'trophy'); });
    const b = $('#skip', el); b.textContent = 'See results'; b.classList.add('primary');
    b.onclick = () => ctx.onFinish(S.out, S.choices);
    if (S.out.results.some((r) => r.champion)) { confetti(); Sfx.trophy(); }
  };
  const step = () => {
    if (finished || !el.isConnected) return;
    if (S.shown >= events.length) {
      if (!S.out.pending) { finish(); return; }
      // watch the clutch game live up to the 2:00 warning, then hand over the call
      if (!multi && !skipping) {
        const sc = S.out.pending.scenario;
        liveGame({ opp: sc.opp, oppKey: null, label: sc.label, plays: sc.events || [], stopAt: 3480 }, () => { finished = true; toClutch(); });
        return;
      }
      finished = true; toClutch(); return;
    }
    if (!multi && !skipping) {
      const x = events[S.shown];
      if (S.skipLive) { S.skipLive = false; S.shown++; apply(x); renderLive(); later(step, 700); return; }
      liveGame(x.e, () => { S.shown++; apply(x); renderLive(); later(step, x.e.comp === 'P' ? 1300 : 650 / S.speed); });
      return;
    }
    const wk = events[S.shown].e.week;
    let big = false;
    while (S.shown < events.length && events[S.shown].e.week === wk) { const x = events[S.shown++]; apply(x); if (x.e.comp === 'P') big = true; }
    renderLive();
    later(step, big ? 1100 : 230);
  };
  // ---- live game card: the clock runs, scores tick up, plays scroll in ----
  S.speed = S.speed || 1;
  const sp = $('#spd', el);
  const drawSpd = () => { if (sp) $('span', sp).textContent = S.speed + 'x'; };
  drawSpd();
  if (sp) sp.onclick = () => { S.speed = S.speed === 1 ? 2 : S.speed === 2 ? 4 : 1; drawSpd(); Sfx.tap(); };
  const meXI = ctx.users[0].xi;
  const liveGame = (e, done) => {
    const box = $('#live', el);
    if (!box) { done(); return; }
    const oppSq = e.oppKey && e.oppKey[0] === 'S' ? parseInt(e.oppKey.slice(1), 10) : null;
    const oppTeam = oppSq !== null ? TE.squadTeam(oppSq) : null;
    const oc = oppTeam ? teamColors(oppTeam) : { c1: '#0f1631', c2: '#ffc531' };
    const stopAt = e.stopAt || null;
    const plays = e.plays || [];
    const lastT = plays.length ? plays[plays.length - 1].t : 0;
    const endT = stopAt || (e.ot ? Math.max(3660, lastT + 60) : 3600);
    const big = e.comp === 'P' || e.prime || stopAt;
    const dur = (e.comp === 'P' ? 7000 : big ? 5200 : 3400) / S.speed;
    const badge = stopAt ? 'Primetime' : e.comp === 'P' ? (e.label === 'Conference Championship' ? 'Conf. Championship' : e.label) : e.prime ? 'Week ' + e.week + ' · Primetime' : 'Week ' + e.week;
    box.className = 'live on' + (e.comp === 'P' ? ' po' : '') + (big ? ' big' : '');
    box.innerHTML = `<div class="lv-top"><span class="lv-badge">${esc(stopAt ? e.label : badge)}</span><span class="lv-clock" id="lvClk">Q1 15:00</span></div>
      <div class="lv-teams"><div class="lv-tm"><div class="lv-h">${myTeamHelm()}</div><b>You</b></div><div class="lv-score"><span id="lvA">0</span><i>–</i><span id="lvB">0</span></div><div class="lv-tm"><div class="lv-h">${helmet(oc.c1, oc.c2, true)}</div><b>${esc(e.opp)}</b></div></div>
      <div class="lv-bar"><i id="lvP"></i></div><div class="lv-feed" id="lvF"><div class="lv-pl mute">Kickoff</div></div>`;
    const R = TE.rng(ctx.seed + ':pbp:' + (e.week || 0) + ':' + plays.length);
    const name = (xi, pos, k) => { const ids = TE.LINEUP.map((s, i) => (s.pos === pos && xi && xi[i] !== null ? xi[i] : null)).filter((v) => v !== null); const pid = ids[(k || 0) % Math.max(1, ids.length)]; return pid === undefined || pid === null ? null : shortName(TE.PLAYERS[pid].name); };
    const text = (p) => {
      const xi = p.s === 0 ? meXI : oppTeam && oppTeam.xi;
      const yd = 3 + Math.floor(R() * 42), fg = 24 + Math.floor(R() * 30), u = R();
      const qb = name(xi, 'QB'), rb = name(xi, 'RB'), wr = name(xi, 'WR', Math.floor(R() * 2)), te = name(xi, 'TE'), k = name(xi, 'K');
      if (p.pts === 3) return `${k || 'The kicker'} drills a ${fg}-yd field goal`;
      if (p.pts !== 7 && p.pts !== 6) return 'Score';
      if (u < 0.45 && qb && wr) return `${qb} finds ${wr} for a ${yd}-yd TD`;
      if (u < 0.65 && qb && te) return `${qb} hits ${te}, ${Math.min(yd, 25)}-yd TD`;
      if (u < 0.9 && rb) return `${rb} punches it in from ${Math.max(1, Math.round(yd / 6))}`;
      return `Pick-six! ${p.s === 0 ? 'Your' : 'Their'} defense takes it back`;
    };
    const clock = (t) => { if (t >= 3600) return 'OT'; const q = Math.floor(t / 900) + 1, rem = 900 - (t % 900); return `Q${q} ${Math.floor(rem / 60)}:${String(rem % 60).padStart(2, '0')}`; };
    let a = 0, b = 0, k = 0;
    const t0 = performance.now();
    const feed = $('#lvF', box);
    const tickLive = () => {
      if (!el.isConnected || skipping) return;
      const f = Math.min(1, (performance.now() - t0) / (dur * (endT / 3600)));
      const t = Math.round(f * endT);
      while (k < plays.length && plays[k].t <= t && (!stopAt || plays[k].t < stopAt)) {
        const p = plays[k++];
        if (p.s === 0) a += p.pts; else b += p.pts;
        const sEl = $(p.s === 0 ? '#lvA' : '#lvB', box);
        sEl.textContent = p.s === 0 ? a : b; sEl.classList.remove('bump'); void sEl.offsetWidth; sEl.classList.add('bump');
        const row = document.createElement('div');
        row.className = 'lv-pl ' + (p.s === 0 ? 'us' : 'them');
        row.innerHTML = `<span class="lv-t">${clock(p.t).replace(' ', '&nbsp;')}</span><span class="lv-k">${p.pts === 3 ? 'FG' : 'TD'}</span><span class="grow">${esc(text(p))}</span>`;
        feed.insertBefore(row, feed.firstChild);
        while (feed.children.length > 3) feed.lastChild.remove();
        if (p.s === 0) { Sfx.good(); buzz(15); } else Sfx.bad();
      }
      $('#lvClk', box).textContent = f >= 1 ? (stopAt ? '2:00 · Q4' : e.ot ? 'FINAL/OT' : 'FINAL') : clock(t);
      $('#lvP', box).style.width = f * 100 + '%';
      if (f < 1) { later(tickLive, 40); return; }
      if (stopAt) {
        box.classList.add('clutch');
        $('#lvClk', box).innerHTML = `${ico('timer', 14)} Clutch call`;
        Sfx.heartbeat(); buzz([60, 80, 60]);
        later(done, 1200);
        return;
      }
      const win = a > b;
      box.classList.add(win ? 'won' : 'lost');
      $('#lvClk', box).innerHTML = `${e.ot ? 'FINAL/OT' : 'FINAL'} <b class="${win ? 'W' : 'L'}">${win ? 'W' : 'L'}</b>`;
      done();
    };
    later(tickLive, 250 / S.speed);
  };
  $('#skip', el).onclick = () => { skipping = true; finish(); };
  if (!S.shown) Sfx.whistle();
  later(step, S.shown ? 300 : 500);
}

function seasonClutch(ctx) {
  const S = ctx.S, { scenario, ui } = S.out.pending;
  showClutch(scenario, ctx.users[ui].name, (choice) => {
    S.choices[ui].push(choice);
    const out = TE.simSeason(ctx.users, ctx.seed, { choices: S.choices, interactive: ctx.interactive });
    const tl = out.pending ? out.partial.timeline[ui] : out.results[ui].timeline;
    const ev = tl.filter((e) => e.clutch).pop();
    return ev ? { win: ev.clutch.win, text: ev.clutch.result, pf: ev.pf, pa: ev.pa, ot: ev.ot } : null;
  }, () => { S.skipLive = true; runSeason(ctx); });
}

// ================= CLUTCH CALL =================
// resolve(choice) -> {win, text, pf, pa, ot}; onContinue() after the result
function showClutch(sc, meName, resolve, onContinue) {
  const oddsLabel = (p) => (p >= 0.75 ? ['Great odds', 'var(--mint)'] : p >= 0.55 ? ['Good odds', 'var(--mint)'] : p >= 0.4 ? ['Coin flip', 'var(--orange)'] : p >= 0.25 ? ['Risky', 'var(--red)'] : ['Long shot', 'var(--red)']);
  const el = go(`
    <div class="night-head">
      <div class="topline">${ico('timer', 14)} Clutch call · ${esc(sc.label || '')}</div>
      <div class="scoreboard"><div class="teams">
        <div class="tm ${sc.side === 'off' ? 'has' : ''}"><div class="n">${esc(meName === 'You' ? 'Your team' : meName)}</div><div class="s" id="sUs">${sc.us}</div></div>
        <div class="clock" id="clk">2:00<small>Q4</small></div>
        <div class="tm ${sc.side === 'def' ? 'has' : ''}"><div class="n">${esc(sc.opp)}</div><div class="s" id="sThem">${sc.them}</div></div></div></div>
      <div class="situation">${esc(sc.text).replace(/(Down \d+|Up \d+|Tied)/, '<b>$1</b>')}</div></div>
    <div class="calls" id="calls">${sc.options.map((o) => {
      const p = sc.side === 'off' ? (o.id === 'kick' ? o.fg : o.td) : o.stop;
      const [lbl, col] = oddsLabel(p);
      return `<button class="call" data-o="${o.id}"><h4>${esc(o.title)}</h4><p>${esc(o.desc)}</p>
        <div class="odds"><div class="bar"><i style="width:${Math.round(p * 100)}%;background:${col}"></i></div><span style="color:${col}">${lbl}</span></div>
        <div class="note">${esc(o.note)}${o.id === 'ground' ? ' · falls back to a FG try' : ''}</div></button>`;
    }).join('')}</div>`);
  Sfx.heartbeat(); buzz([60, 80, 60]);
  $$('.call', el).forEach((b) => b.addEventListener('click', () => {
    if (el.dataset.busy) return; el.dataset.busy = 1;
    const choice = b.dataset.o;
    Sfx.whistle(); buzz(30);
    $('#calls', el).innerHTML = `<div class="play-anim"><div class="fb">${FOOTBALL}</div><div class="mute" style="font-weight:900;margin-top:14px;letter-spacing:.1em">SNAP…</div></div>`;
    const res = resolve(choice);
    later(() => {
      if (!res) { onContinue(); return; }
      const us = $('#sUs', el), them = $('#sThem', el);
      if (+us.textContent !== res.pf) { us.textContent = res.pf; us.classList.add('bump'); }
      if (+them.textContent !== res.pa) { them.textContent = res.pa; them.classList.add('bump'); }
      $('#clk', el).innerHTML = (res.ot ? 'OT' : 'FINAL') + '<small>' + (res.win ? 'WIN' : 'LOSS') + '</small>';
      $('#calls', el).innerHTML = `<div class="outcome ${res.win ? 'win' : 'loss'}"><h2>${res.win ? 'CLUTCH!' : 'NO GOOD'}</h2><p>${esc(res.text)}</p></div>
        <button class="btn primary" id="cont" style="margin-top:12px">Continue</button>`;
      if (res.win) { Sfx.crowd(true); confetti(1600); buzz([40, 60, 40]); } else Sfx.groan();
      Store.data.stats.clutchT++; if (res.win) Store.data.stats.clutchW++; Store.save();
      if (res.win) { unlock('clutch1'); if (Store.data.stats.clutchW >= 10) unlock('clutch10'); addXP(20); }
      $('#cont', el).addEventListener('click', onContinue);
    }, 1400);
  }));
}

// ================= SEASON PROGRESS + RESULTS =================
// XP, stats and achievements for one finished season of a local player
function seasonProgress(r, flags) {
  const s = Store.data.stats;
  s.played++;
  if (r.stage >= 1) s.playoffs++;
  if (r.champion) s.champs++;
  if (r.perfectReg) s.perfectReg++;
  if (r.perfect) s.perfect++;
  if (!s.best || r.score > s.best.score) s.best = { score: r.score, title: TE.verdict(r).title, rec: rec(r) };
  Store.save();
  unlock('first_season');
  if (r.stage >= 1) unlock('playoffs');
  if (r.champion) unlock('ring');
  if (r.perfectReg) unlock('p17');
  if (r.perfect) unlock('perfect');
  if (r.champion && flags && flags.blind) unlock('blind_ring');
  const poW = r.timeline.filter((e) => e.comp === 'P' && e.res === 'W').length;
  addXP(50 + r.w * 4 + poW * 25 + (r.champion ? 200 : 0) + (r.perfectReg ? 150 : 0) + (r.perfect ? 300 : 0));
}

function playoffPath(r) {
  const po = r.timeline.filter((e) => e.comp === 'P');
  if (!po.length) return '<div class="mute center" style="font-weight:800">Missed the playoffs</div>';
  return `<div class="path">${['Wild Card', 'Divisional', 'Conference Championship', 'Super Bowl'].map((lbl, k) => {
    const e = po.find((x) => x.label === lbl);
    if (!e) return k === 0 && r.seed === 1 ? '<div class="bye">Bye</div>' : `<div>${['WC', 'DIV', 'CONF', 'SB'][k]}</div>`;
    return `<div class="${e.res}">${['WC', 'DIV', 'CONF', 'SB'][k]} ${e.pf}-${e.pa}</div>`;
  }).join('')}</div>`;
}
function standingsTable(r, colorOf) {
  return `<details class="table"><summary>Conference standings</summary><table><tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>Diff</th></tr>
    ${r.standings.map((t, i) => `<tr class="${t.user !== undefined ? 'me' : ''} ${i < 7 ? 'po' : ''}"><td>${i + 1}</td><td style="${t.user !== undefined && colorOf ? 'color:' + colorOf(t.user) : ''}">${esc(t.name)}</td><td>${t.w}</td><td>${t.l}</td><td>${t.pd > 0 ? '+' : ''}${t.pd}</td></tr>`).join('')}</table></details>`;
}
// opts: {title, xi, mods, extra (html), actions:[{id,label,cls,fn}]}
function SeasonResults(r, opts) {
  const v = TE.verdict(r);
  const cw = r.clutch.filter((c) => c.win).length;
  const el = go(`
    <div class="topbar"><button class="icon-btn" data-act="home">${ICON.back}</button><h2 class="d">${esc(opts.title || 'Season review')}</h2></div>
    <div class="verdict"><div class="trophy ${r.champion ? 'on' : 'dim'}">${TROPHY_SVG}</div><h1 class="${r.champion || r.perfectReg ? 'gold' : ''}">${v.title}</h1><p>${v.sub}</p></div>
    <div class="recbig"><span class="w">${r.w}</span>–<span class="l">${r.l}</span></div>
    <div class="center mute" style="font-weight:800;margin-bottom:10px">${r.seed ? '#' + r.seed + ' seed' : 'No playoffs'} · ${(r.pf / 17).toFixed(1)} pts/game · ${stageShort(r)}</div>
    ${playoffPath(r)}
    ${opts.extra || ''}
    <div class="facts">
      <div class="fact ${r.champion ? 'hi' : ''}"><div class="k">Playoffs</div><div class="v">${stageShort(r)}</div></div>
      <div class="fact"><div class="k">Clutch calls</div><div class="v">${cw} / ${r.clutch.length} won</div></div>
      <div class="fact"><div class="k">Team rating</div><div class="v">${r.prof.ovr.toFixed(1)} OVR</div></div>
      <div class="fact"><div class="k">Chemistry</div><div class="v">${r.prof.chem} / 100</div></div>
    </div>
    <div class="actions">${(opts.actions || []).map((a, i) => (a.pair ? '' : `<button class="btn ${a.cls || ''}" data-a="${i}">${a.label}</button>`)).join('')}
      <div class="two">${(opts.actions || []).map((a, i) => (a.pair ? `<button class="btn ${a.cls || ''}" data-a="${i}">${a.label}</button>` : '')).join('')}</div></div>
    ${miniField(opts.xi, opts.mods)}
    ${standingsTable(r)}`);
  $$('[data-a]', el).forEach((b) => b.addEventListener('click', () => opts.actions[+b.dataset.a].fn()));
  if (r.champion) later(() => { confetti(); Sfx.trophy(); }, 300);
  return el;
}

// ================= SHARING =================
function shareText(r, head, extra) {
  const po = r.timeline.filter((e) => e.comp === 'P').map((e) => (e.res === 'W' ? '🟩' : '🟥')).join('');
  const lines = [head + ' 🏈', `${TE.verdict(r).title} ${r.champion ? '🏆' : ''}`.trim(), `${rec(r)}${r.seed ? ' · #' + r.seed + ' seed' : ''}${po ? ' · ' + po : ''}`];
  if (r.clutch.length) lines.push('Clutch calls: ' + r.clutch.map((c) => (c.win ? '✅' : '❌')).join(''));
  if (extra) lines.push(extra);
  return lines.join('\n');
}
async function shareOut(text, url) {
  url = url || location.origin + location.pathname;
  if (navigator.share) { try { await navigator.share({ title: 'CLUTCH', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text + '\n' + url); toast('Copied. Paste it anywhere'); } catch (_) {
    modal(`<h2 class="d">Copy this</h2><textarea class="field" rows="7" style="width:100%">${esc(text + '\n' + url)}</textarea><div class="actions"><button class="btn" data-close>Done</button></div>`);
  }
}
async function shareImage(r, xi, label) {
  const W = 1080, H = 1350, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  try { await document.fonts.ready; } catch (_) {}
  const bg = x.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#eef3ff'); bg.addColorStop(1, '#fff0f6');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  x.textAlign = 'center';
  x.fillStyle = '#0f1631'; x.font = '800 96px "Plus Jakarta Sans"'; x.fillText('CLUTCH', W / 2, 150);
  x.fillStyle = '#6c7593'; x.font = '800 30px Inter'; x.fillText(label.toUpperCase(), W / 2, 205);
  const v = TE.verdict(r);
  x.fillStyle = r.champion || r.perfectReg ? '#ff7a00' : '#0f1631'; x.font = `800 ${v.title.length > 16 ? 60 : 76}px "Plus Jakarta Sans"`; x.fillText(v.title, W / 2, 310);
  x.font = '800 70px "Plus Jakarta Sans"'; x.fillStyle = '#14b885'; x.textAlign = 'right'; x.fillText(String(r.w), W / 2 - 24, 410);
  x.fillStyle = '#0f1631'; x.textAlign = 'center'; x.fillText('–', W / 2, 410);
  x.fillStyle = '#ff4058'; x.textAlign = 'left'; x.fillText(String(r.l), W / 2 + 24, 410);
  x.textAlign = 'center'; x.fillStyle = '#2b3556'; x.font = '800 30px Inter';
  x.fillText(`${r.seed ? '#' + r.seed + ' seed · ' : ''}${stageShort(r)} · Clutch ${r.clutch.filter((k) => k.win).length}/${r.clutch.length}`, W / 2, 465);
  const px = 70, py = 510, pw = 940, ph = 760;
  x.save(); rr(x, px, py, pw, ph, 36); x.clip();
  for (let i = 0; i < 10; i++) { x.fillStyle = i % 2 ? '#34ad4b' : '#3cbc55'; x.fillRect(px, py + (ph / 10) * i, pw, ph / 10 + 1); }
  x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 3;
  for (let i = 1; i < 9; i++) { x.beginPath(); x.moveTo(px, py + i * ph / 9); x.lineTo(px + pw, py + i * ph / 9); x.stroke(); }
  x.strokeStyle = '#ffe066'; x.lineWidth = 6; x.beginPath(); x.moveTo(px, py + ph * 0.5); x.lineTo(px + pw, py + ph * 0.5); x.stroke();
  x.restore();
  TE.LINEUP.forEach((s, i) => {
    const pid = xi[i]; if (pid === null) return;
    const p = TE.PLAYERS[pid], team = TE.DATA.TEAMS[p.team];
    const rt = p.r - (TE.fitPenalty(p.pos, s.pos) || 0);
    const X = px + (s.x / 100) * pw, Y = py + (s.y / 100) * ph, cw = 124, chh = 168;
    x.save(); x.shadowColor = 'rgba(0,0,0,.28)'; x.shadowBlur = 18; x.shadowOffsetY = 8;
    x.fillStyle = '#fff'; rr(x, X - cw / 2, Y - chh / 2, cw, chh, 16); x.fill(); x.restore();
    x.save(); rr(x, X - cw / 2, Y - chh / 2, cw, chh, 16); x.clip();
    const g2 = x.createLinearGradient(X - cw / 2, Y - chh / 2, X + cw / 2, Y + chh / 6); g2.addColorStop(0, team.c1); g2.addColorStop(1, '#00000080');
    x.fillStyle = team.c1; x.fillRect(X - cw / 2, Y - chh / 2, cw, chh * 0.68); x.fillStyle = g2; x.fillRect(X - cw / 2, Y - chh / 2, cw, chh * 0.68);
    x.restore();
    const tierCol = rt >= 95 ? '#7b5cff' : rt >= 90 ? '#ffc531' : rt >= 85 ? '#aab4c8' : null;
    if (tierCol) { x.strokeStyle = tierCol; x.lineWidth = 6; rr(x, X - cw / 2, Y - chh / 2, cw, chh, 16); x.stroke(); }
    x.fillStyle = '#fff'; x.textAlign = 'left'; x.font = '800 44px "Plus Jakarta Sans"'; x.fillText(String(rt), X - cw / 2 + 10, Y - chh / 2 + 50);
    x.font = '900 16px Inter'; x.fillText(p.pos, X - cw / 2 + 12, Y - chh / 2 + 72);
    x.textAlign = 'center'; x.fillStyle = '#0f1631'; x.font = '900 19px Inter'; x.fillText(fitText(x, shortName(p.name), cw - 10), X, Y + chh / 2 - 30);
    x.fillStyle = '#6c7593'; x.font = '800 13px Inter'; x.fillText(team.id + ' · ' + TE.DATA.ERA_LABEL[p.era], X, Y + chh / 2 - 11);
  });
  x.fillStyle = '#6c7593'; x.font = '800 30px Inter'; x.textAlign = 'center'; x.fillText('Can you go perfect?', W / 2, 1318);
  c.toBlob(async (blob) => {
    const file = new File([blob], 'clutch.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'CLUTCH' }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'clutch.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}
function rr(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
function fitText(x, t, w) { while (t.length > 3 && x.measureText(t).width > w) t = t.slice(0, -2) + '…'; return t; }
