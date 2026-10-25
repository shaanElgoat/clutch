'use strict';
// CLUTCH app shell: navigation, home, tabs, Season + Daily + Party + Online flows, boot.
const App = { g: null, challenge: null, pendingRoom: null, timers: [] };

function go(html, cls) {
  App.timers.forEach(clearTimeout); App.timers = [];
  App.screen = null;
  if (App.g && App.g.clockT) { cancelAnimationFrame(App.g.clockT); App.g.clockT = null; }
  $$('.tabbar').forEach((t) => t.remove());
  const app = $('#app');
  app.innerHTML = `<div class="screen ${cls || ''}">${html}</div>`;
  window.scrollTo(0, 0);
  return app.firstElementChild;
}
const later = (fn, ms) => {
  const t = setTimeout(() => { const k = App.timers.indexOf(t); if (k >= 0) App.timers.splice(k, 1); fn(); }, ms);
  App.timers.push(t); return t;
};
const myName = () => (Store.data.name || '').trim() || 'You';

// five bottom tabs; every screen inside a tab returns to it via data-act="home"
const TABS = [['play', 'ball', 'Season'], ['games', 'grid', 'Games'], ['club', 'shield', 'Club'], ['trophies', 'trophy', 'Trophies'], ['me', 'user', 'Me']];
const triviaLeft = () => [!!(puzzle('grid') && puzzle('grid').done), !!(puzzle('who') && puzzle('who').done), !!puzzle('drill')].filter((x) => !x).length;
const dailyLeft = () => [!!Store.data.daily[todayKey()], !!(puzzle('grid') && puzzle('grid').done), !!(puzzle('who') && puzzle('who').done), !!puzzle('drill')].filter((x) => !x).length;
function goTab(id) {
  App.tab = id;
  ({ play: Home, games: GamesTab, daily: GamesTab, club: () => (App.clubSeg === 'packs' ? Packs : App.clubSeg === 'binder' ? Cards : ClubScreen)(), trophies: Trophies, me: Profile })[id]();
}
function tabbar(active) {
  App.tab = active;
  const dot = { games: triviaLeft() > 0, club: freePackReady() || claimable() > 0 };
  const bar = document.createElement('nav');
  bar.className = 'tabbar';
  bar.innerHTML = TABS.map(([id, ic, lbl]) => `<button class="${id === active ? 'on' : ''}" data-tab="${id}">${ico(ic, 22)}<span>${lbl}</span>${dot[id] ? '<i class="badge-dot"></i>' : ''}</button>`).join('');
  document.body.appendChild(bar);
  $$('[data-tab]', bar).forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.tab === active && window.scrollY > 40) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    Sfx.tap(); goTab(b.dataset.tab);
  }));
}
// segmented header shared by the three Club pages
function clubSeg(active) {
  App.clubSeg = active;
  const segs = [['club', 'My Club'], ['packs', 'Packs'], ['binder', 'Binder']];
  return `<div class="topbar"><h2 class="d grow">Club</h2>${coinsChip()}</div>
    <div class="seg">${segs.map(([id, l]) => `<button class="${id === active ? 'on' : ''}" data-act="${id}">${l}${(id === 'packs' && freePackReady()) || (id === 'binder' && claimable()) ? '<i class="badge-dot"></i>' : ''}</button>`).join('')}</div>`;
}
function levelChip() {
  const xp = Store.data.xp, l = levelOf(xp), a = xpFor(l), b = xpFor(l + 1);
  const p = Math.round(((xp - a) / (b - a)) * 100);
  return `<div class="lvl"><div class="badge" style="--p:${p}%"><span>${l}</span></div><div><small>Level ${l}</small><b>${esc(myName() === 'You' ? 'Rookie GM' : myName())}</b></div></div>`;
}
const coinsChip = () => `<span class="coins">${ico('coin', 18)}<b data-coins>${Store.data.coins.toLocaleString()}</b></span>`;
const greet = () => { const h = new Date().getHours(); return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

// ================= PLAY TAB =================
// one tidy list row: icon, title, subtitle, a small right-hand meta
const lrow = (o) => `<button class="lrow" ${o.attr || ''}><div class="mc-ic ${o.col}">${ico(o.ic, 20)}</div><div class="grow"><b>${o.t}</b><small>${o.sub}</small></div>${o.meta ? `<span class="lmeta ${o.hot ? 'hot' : ''}">${o.meta}</span>` : ''}${ico('chevron', 16)}</button>`;

function Home() {
  if (typeof Net !== 'undefined' && Net.peer) Net.leave();
  App.g = null;
  const d = Store.data, s = d.stats, today = d.daily[todayKey()];
  const el = go(`
    <div class="home-head">${levelChip()}<span class="grow"></span>${coinsChip()}</div>

    ${continueStrip(['season', 'daily', 'challenge', 'party', 'duel', 'cap', 'gameday', 'drill', 'kick', 'hl'])}

    <button class="feature" data-act="season"><div class="ft-glow"></div><span class="tag">${ico('star', 14)} 2026 season</span><h3>Season</h3><p>Spin a team, draft 12, chase 17-0 and the ring.</p><span class="go">${Runs.get('season') ? 'Continue' : 'Play'} ${ico('chevron', 16)}</span><div class="art">${helmet('#ffffff', '#ffc531')}</div></button>

    <div class="mini-stats"><div><b>${s.played}</b><small>Seasons</small></div><div><b>${s.champs}</b><small>Rings</small></div><div><b>${s.clutchW}/${s.clutchT}</b><small>Clutch</small></div><div><b>${s.best ? esc(s.best.rec) : '–'}</b><small>Best</small></div></div>

    <div class="group-title">More seasons</div>
    <div class="group">
      ${lrow({ attr: 'data-act="daily"', col: 'sun', ic: 'calendar', t: 'Daily Draft', sub: today ? esc(today.title + ' · ' + today.rec) : 'Same spins for everyone today', meta: today ? 'Done' : 'New', hot: !today })}
      ${lrow({ attr: 'data-act="friends"', col: 'ink', ic: 'users', t: 'Play with friends', sub: 'Online room or pass &amp; play' })}
    </div>`, 'has-tabs');
  tabbar('play');
  if (!d.seenHelp) { d.seenHelp = true; Store.save(); later(Help, 500); }
  return el;
}

// ================= GAMES TAB =================
function GamesTab() {
  App.g = null;
  const s = Store.data.stats, streak = dailyStreak();
  const g = puzzle('grid'), w = puzzle('who'), dr = puzzle('drill');
  const trivia = [
    { act: 'grid', ic: 'grid', col: 'blue', t: 'The Grid', blurb: 'Fit a player to the row and column', done: !!(g && g.done), res: g ? g.cells.filter(Boolean).length + '/9 solved' : '' },
    { act: 'who', ic: 'question', col: 'pink', t: "Who's That?", blurb: 'Guess the mystery player', done: !!(w && w.done), res: w && w.done ? (w.win ? 'Solved in ' + w.guesses.length : 'Missed it') : '' },
    { act: 'drill', ic: 'timer', col: 'violet', t: '2-Minute Drill', blurb: 'Down late. Win it.', done: !!dr, res: dr ? dr.title : '' },
  ];
  const n = trivia.filter((x) => x.done).length;
  const res = (k, txt) => (Runs.get(k) ? { meta: 'Resume', hot: true } : { meta: txt });
  go(`
    <div class="topbar"><h2 class="d grow">Games</h2>${coinsChip()}</div>

    <div class="group-title row-title"><span>Daily puzzles</span><span class="mute">${ico('flame', 12)} ${streak} day streak · ${n}/3</span></div>
    <div class="group">${trivia.map((x) => lrow({ attr: `data-act="${x.act}"`, col: x.col, ic: x.ic, t: x.t, sub: esc(x.res || x.blurb), meta: x.done ? ico('check', 14) : 'Play', hot: !x.done })).join('')}</div>

    <div class="group-title">Head to head</div>
    <div class="group">
      ${lrow(Object.assign({ attr: 'data-act="duel"', col: 'violet', ic: 'users', t: 'Draft Duel', sub: 'Out-draft a rival, then best of 3' }, res('duel', (s.duelW || 0) + ' won')))}
      ${lrow(Object.assign({ attr: 'data-act="cap"', col: 'sun', ic: 'coin', t: 'Salary Cap', sub: `$${CAP}M to build a champion` }, res('cap', (s.capBest || 0) + '/4')))}
      ${lrow(Object.assign({ attr: 'data-act="gameday"', col: 'mint', ic: 'clipboard', t: 'Gameday', sub: 'Call every play yourself' }, res('gameday', s.gdWins + '-' + (s.gdPlayed - s.gdWins))))}
    </div>

    <div class="group-title">Arcade</div>
    <div class="group">
      ${lrow(Object.assign({ attr: 'data-act="hl"', col: 'blue', ic: 'scale', t: "Who's Better?", sub: 'Career stats, head to head' }, res('hl', 'Best ' + s.hlBest)))}
      ${lrow(Object.assign({ attr: 'data-act="kick"', col: 'orange', ic: 'goalpost', t: 'Kick It', sub: 'Aim, power, wind' }, res('kick', 'Best ' + s.kickBest)))}
    </div>`, 'has-tabs');
  tabbar('games');
}

// shown once, the first time the app opens after the binder reset
function resetNotice() {
  modal(`<div class="center"><div class="intro-ic" style="margin:0 auto 10px;background:var(--brand)">${ico('cards', 28)}</div>
    <h2 class="d">Your binder was reset</h2>
    <p>Due to an update, every player's binder has been reset. From now on, cards only come from packs you buy with coins, and Wildcards use your new binder.</p>
    <p class="mute" style="font-weight:600;font-size:13px">Your coins, levels, trophies and stats are all still here.</p></div>
    <button class="btn primary" data-close style="margin-top:12px">Got it</button>`, null, 'sheet');
}

function Help() {
  modal(`<h2 class="d">How CLUTCH works</h2>
    <div class="steps">
      <div class="step"><div class="n blue">${ico('refresh', 18)}</div><div><h4>Spin the wheel</h4><p>It lands on an NFL team, and you draft from its <b>2026 roster</b>. Legends from past decades live in card packs.</p></div></div>
      <div class="step"><div class="n orange">${ico('cards', 18)}</div><div><h4>Draft 12</h4><p>QB, RB, 2 WR, TE, OL, DL, LB, CB, S, K and Head Coach.</p></div></div>
      <div class="step"><div class="n pink">${ico('timer', 18)}</div><div><h4>Make the call</h4><p>Close games stop at 2:00 for a Clutch Call. In Gameday you call every play.</p></div></div>
      <div class="step"><div class="n mint">${ico('calendar', 18)}</div><div><h4>Come back daily</h4><p>A Daily Draft on the Season tab, three daily puzzles in Games, a free pack, and a streak to protect.</p></div></div>
    </div>
    <button class="btn primary" data-close style="margin-top:14px">Let's go</button>`, null, 'sheet');
}

function FriendsMenu() {
  modal(`<h2 class="d">Play with friends</h2>
    <div class="steps">
      <button class="step" data-f="online" style="text-align:left;width:100%"><div class="n violet">${ico('globe', 18)}</div><div><h4>Online room</h4><p>2–4 phones, anywhere. Share a code and steal-draft live from the same spins.</p></div></button>
      <button class="step" data-f="party" style="text-align:left;width:100%"><div class="n pink">${ico('phone', 18)}</div><div><h4>Party (one phone)</h4><p>Pass and play with up to 4 GMs, and add CPU rivals.</p></div></button>
    </div>`, (bg) => {
    $$('[data-f]', bg).forEach((b) => b.addEventListener('click', () => { bg.remove(); b.dataset.f === 'online' ? OnlineScreen() : PartySetup(); }));
  }, 'sheet');
}

// ================= SEASON (solo / daily / challenge) =================
function SeasonSetup(mode) {
  const d = Store.data;
  let blind = mode === 'quick' ? d.blind : false, clock = mode === 'quick' ? !!d.shotClock : false;
  const ch = mode === 'challenge' ? App.challenge : null;
  if (ch) blind = !!ch.b;
  const title = mode === 'daily' ? 'Daily Draft' : mode === 'challenge' ? 'Challenge' : 'Season';
  const el = go(`
    <div class="topbar"><button class="icon-btn" data-act="home">${ico('back', 20)}</button><div class="grow"><h2 class="d">${title}</h2>${mode === 'daily' ? `<div class="mute" style="font-weight:700;font-size:12px">#${dailyNumber(todayKey())} · same spins for everyone</div>` : ''}</div></div>
    ${ch ? `<div class="challenge-card"><h3>${esc(ch.n)} challenges you</h3><div class="mute" style="font-weight:700">${esc(ch.title)} · ${esc(ch.rec)}</div><div class="mute" style="margin-top:6px;font-size:13px;font-weight:600">Same spins, same opponents. Beat their season.</div></div>` : ''}
    <div class="goal-card"><div class="gc-row"><div class="gc-big">17<small>–0</small></div><div><b>Go undefeated</b><small>No team in history has done it.</small></div></div>
      <div class="gc-row"><div class="gc-ic">${ico('trophy', 22)}</div><div><b>Win the Super Bowl</b><small>Top 7 make the playoffs. The 1 seed gets a bye.</small></div></div>
      <div class="gc-row"><div class="gc-ic pink">${ico('timer', 22)}</div><div><b>Make the Clutch Calls</b><small>Big games within one score at 2:00 stop for your call.</small></div></div></div>
    ${mode === 'quick' ? `<div class="section-title">Modifiers</div><div style="display:grid;gap:8px">
      <button class="toggle ${blind ? 'on' : ''}" id="tgBlind"><span class="ic">${ico('eyeoff', 20)}</span><div class="grow"><h4>Blind draft</h4><p>Ratings hidden. Pure football knowledge.</p></div><div class="sw"></div></button>
      <button class="toggle ${clock ? 'on' : ''}" id="tgClock"><span class="ic">${ico('timer', 20)}</span><div class="grow"><h4>Shot clock</h4><p>8 seconds per pick, or the auto-pick decides.</p></div><div class="sw"></div></button></div>` : ''}
    <div class="spacer"></div>
    <button class="btn primary big" id="go">${ico('refresh', 20)} Spin the wheel</button>`);
  const tb = $('#tgBlind', el), tc = $('#tgClock', el);
  if (tb) tb.addEventListener('click', () => { blind = !blind; d.blind = blind; Store.save(); tb.classList.toggle('on', blind); Sfx.tap(); });
  if (tc) tc.addEventListener('click', () => { clock = !clock; d.shotClock = clock; Store.save(); tc.classList.toggle('on', clock); Sfx.tap(); });
  $('#go', el).addEventListener('click', () => {
    const seed = mode === 'daily' ? 'daily:' + todayKey() : ch ? ch.s : 'q:' + rid();
    openDraft({ mode, run: SEASON_RUN[mode], ch: ch || undefined, seed, blind, shotClock: clock ? 8 : 0, respins: 1, wildcard: mode === 'quick', managers: [{ name: myName() }], title: title + ' draft', onDone: (st) => soloSeason(mode, st, blind) });
  });
}
const SEASON_RUN = { quick: 'season', daily: 'daily', challenge: 'challenge' };
function soloSeason(mode, st, blind, resume) {
  const xi = st.managers[0].xi, kind = SEASON_RUN[mode];
  const persist = (S) => Runs.set(kind, { phase: 'season', mode, seed: st.seed, xi, blind: !!blind, choices: S.choices[0], shown: S.shown, ch: mode === 'challenge' ? App.challenge : undefined });
  persist({ choices: [resume ? resume.choices : []], shown: resume ? resume.shown : 0 });
  playSeason({ users: [{ name: myName(), xi }], seed: st.seed, interactive: [true], meta: [{ color: MGR_COLORS[0] }], persist, choices: resume ? [resume.choices] : undefined, shown: resume ? resume.shown : 0, title: mode === 'daily' ? 'Daily #' + dailyNumber(todayKey()) : 'The Season', onFinish: (out, choices) => {
    const r = out.results[0];
    Runs.clear(kind);
    seasonProgress(r, { blind });
    if (mode === 'daily') {
      Store.data.daily[todayKey()] = { s: st.seed, xi, c: choices[0], title: TE.verdict(r).title, rec: rec(r), score: r.score };
      Store.save(); addXP(50);
      if (dailyStreak() >= 3) unlock('daily3');
    }
    soloResults(mode, r, st.seed, xi, choices[0], blind);
  } });
}
function soloResults(mode, r, seed, xi, choices, blind) {
  let extra = '';
  if (mode === 'challenge' && App.challenge) {
    const ch = App.challenge;
    const theirs = TE.simSeason([{ name: ch.n, xi: ch.x }], ch.s, { choices: [ch.c || []] }).results[0];
    const youWin = r.score > theirs.score, draw = r.score === theirs.score;
    if (youWin) unlock('mp_win');
    extra = `<div class="challenge-card" style="margin:12px 0 0"><h3>${draw ? 'Dead heat!' : youWin ? `You beat ${esc(ch.n)}!` : `${esc(ch.n)} wins this one`}</h3>
      <div class="standings" style="margin:8px 0 0">
        <div class="stand ${youWin || draw ? 'first' : ''}"><div class="grow"><div class="nm">${esc(myName())}</div><small>${TE.verdict(r).title} · ${rec(r)} · ${stageShort(r)}</small></div></div>
        <div class="stand ${!youWin || draw ? 'first' : ''}"><div class="grow"><div class="nm">${esc(ch.n)}</div><small>${TE.verdict(theirs).title} · ${rec(theirs)} · ${stageShort(theirs)}</small></div></div></div></div>`;
  }
  const head = mode === 'daily' ? `CLUTCH Daily #${dailyNumber(todayKey())}` : 'CLUTCH';
  const link = () => location.origin + location.pathname + '#c=' + b64urlEncode({ v: TE.DATA_VERSION, s: seed, n: myName() === 'You' ? 'A friend' : myName(), x: xi, c: choices, b: blind ? 1 : 0, title: TE.verdict(r).title, rec: rec(r) });
  SeasonResults(r, { title: mode === 'daily' ? 'Daily #' + dailyNumber(todayKey()) : mode === 'challenge' ? 'Challenge' : 'Season review', xi, extra, actions: [
    { label: ico('share', 18) + ' Share result', cls: 'primary', fn: () => shareOut(shareText(r, head, blind ? 'Blind draft 🙈' : '')) },
    { label: ico('users', 18) + ' Challenge', pair: true, fn: () => shareOut(shareText(r, head, 'Same spins as me. Beat it:'), link()) },
    { label: ico('image', 18) + ' Save image', pair: true, fn: () => shareImage(r, xi, mode === 'daily' ? 'Daily draft #' + dailyNumber(todayKey()) : blind ? 'Blind draft' : 'Season') },
    { label: mode === 'daily' ? 'Play a Season' : ico('refresh', 18) + ' Play again', fn: () => SeasonSetup('quick') },
  ] });
}
function openDaily() {
  const done = Store.data.daily[todayKey()];
  if (!done) return SeasonSetup('daily');
  const r = TE.simSeason([{ name: myName(), xi: done.xi }], done.s, { choices: [done.c || []] }).results[0];
  soloResults('daily', r, done.s, done.xi, done.c || [], false);
}

// ================= PARTY + MULTI RESULTS =================
function PartySetup() {
  const mgrs = App.partyMgrs || [{ name: myName(), cpu: false }, { name: 'CPU 2', cpu: true }];
  App.partyMgrs = mgrs;
  let blind = false;
  const el = go(`
    <div class="topbar"><button class="icon-btn" data-act="home">${ico('back', 20)}</button><h2 class="d">Party</h2></div>
    <p class="mute" style="margin:0 0 6px;font-weight:600">Everyone drafts from the same spin in snake order. If someone takes your guy, he's gone.</p>
    <div class="section-title">GMs</div><div id="mgrs"></div>
    <button class="btn small" id="add" style="margin-top:4px">+ Add GM</button>
    <div class="section-title">Modifiers</div>
    <button class="toggle" id="tgBlind"><span class="ic">${ico('eyeoff', 20)}</span><div class="grow"><h4>Blind draft</h4><p>Ratings hidden for everyone.</p></div><div class="sw"></div></button>
    <div class="spacer"></div><button class="btn primary big" id="go">${ico('refresh', 20)} Spin the wheel</button>`);
  const draw = () => {
    $('#mgrs', el).innerHTML = mgrs.map((m, i) => `<div class="mgr-row"><span class="dot" style="background:${MGR_COLORS[i]}"></span>
      <input class="field grow" data-i="${i}" maxlength="14" value="${esc(m.name)}" ${m.cpu ? 'disabled' : ''}>
      <button class="chip ${m.cpu ? 'on' : ''}" data-cpu="${i}">${m.cpu ? ico('robot', 16) + ' CPU' : ico('user', 16) + ' Human'}</button>
      ${mgrs.length > 2 ? `<button class="icon-btn" data-rm="${i}">${ico('x', 18)}</button>` : ''}</div>`).join('');
    $('#add', el).classList.toggle('hidden', mgrs.length >= 4);
    $$('input[data-i]', el).forEach((inp) => inp.addEventListener('input', () => { mgrs[+inp.dataset.i].name = inp.value.slice(0, 14); }));
    $$('[data-cpu]', el).forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.cpu, m = mgrs[i]; m.cpu = !m.cpu; m.name = m.cpu ? 'CPU ' + (i + 1) : 'Player ' + (i + 1); draw(); }));
    $$('[data-rm]', el).forEach((b) => b.addEventListener('click', () => { mgrs.splice(+b.dataset.rm, 1); draw(); }));
  };
  draw();
  $('#add', el).addEventListener('click', () => { mgrs.push({ name: 'Player ' + (mgrs.length + 1), cpu: false }); draw(); });
  const tb = $('#tgBlind', el);
  tb.addEventListener('click', () => { blind = !blind; tb.classList.toggle('on', blind); });
  $('#go', el).addEventListener('click', () => {
    if (!mgrs.some((m) => !m.cpu)) { toast('Add at least one human'); return; }
    const meta = mgrs.map((m, i) => ({ color: MGR_COLORS[i], cpu: m.cpu }));
    openDraft({ mode: 'party', run: 'party', seed: 'p:' + rid(), blind, managers: mgrs.map((m, i) => ({ name: (m.name || '').trim() || 'Player ' + (i + 1) })), meta, title: 'Party draft', onDone: (st) => multiSeason(st, meta, false) });
  });
}
function multiSeason(st, meta, online, shown) {
  const users = st.managers.map((m) => ({ name: m.name, xi: m.xi }));
  const me = online && App.g ? App.g.me : null;
  const lite = { seed: st.seed, blind: st.blind, managers: st.managers.map((m) => ({ name: m.name, xi: m.xi })) };
  const persist = online ? null : (S) => Runs.set('party', { phase: 'season', st: lite, meta, shown: S.shown });
  if (persist) persist({ shown: shown || 0 });
  playSeason({ users, seed: st.seed, interactive: users.map(() => false), meta, persist, shown: shown || 0, title: online ? 'Online season' : 'Party season', onFinish: (out) => { if (!online) Runs.clear('party'); MultiResults(out.results, users, meta, online, st, me); } });
}
function MultiResults(R, users, meta, online, st, me) {
  const order = R.map((r, i) => i).sort((a, b) => R[b].score - R[a].score);
  const win = order[0];
  if ((online && win === me) || (!online && !meta[win].cpu)) { unlock('mp_win'); Store.data.stats.mpWins++; Store.save(); addXP(100); }
  const el = go(`
    <div class="topbar"><button class="icon-btn" data-act="home">${ico('back', 20)}</button><h2 class="d">Final standings</h2></div>
    <div class="verdict"><div class="trophy ${R[win].champion ? 'on' : 'dim'}">${TROPHY_SVG}</div><h1 class="gold">${R[win].name === 'You' ? 'You win' : esc(R[win].name) + ' wins'}</h1><p>${TE.verdict(R[win]).title.toLowerCase()} · ${rec(R[win])}</p></div>
    <div class="standings">${order.map((i, k) => { const r = R[i]; return `<button class="stand ${k === 0 ? 'first' : ''}" data-v="${i}" style="text-align:left;width:100%"><span class="rk" style="color:${meta[i].color}">${k + 1}</span>
      <div class="grow"><div class="nm">${esc(r.name)}${online && i === me ? ' (you)' : ''}</div><small>${TE.verdict(r).title} · ${rec(r)} · ${stageShort(r)}</small></div>${r.champion ? ico('trophy', 18) : ''}</button>`; }).join('')}</div>
    <div class="section-title" id="xiTitle"></div><div id="xi"></div>
    <div class="actions">
      ${online ? (Net.isHost ? '<button class="btn primary" id="rematch">Back to lobby</button>' : '<div class="mute center" style="font-weight:700">Waiting for the host…</div>') : '<button class="btn primary" id="rematch">' + ico('refresh', 18) + ' Rematch</button>'}
      <button class="btn" data-act="home">Home</button></div>
    ${standingsTable(R[0], (u) => meta[u].color)}`);
  const showXI = (i) => { $('#xiTitle', el).innerHTML = `<span style="color:${meta[i].color}">${esc(R[i].name)}</span>&nbsp;· OVR ${R[i].prof.ovr.toFixed(0)}`; $('#xi', el).innerHTML = miniField(users[i].xi); };
  showXI(online && me !== null ? me : win);
  $$('[data-v]', el).forEach((b) => b.addEventListener('click', () => showXI(+b.dataset.v)));
  later(() => { confetti(); Sfx.trophy(); }, 300);
  const rb = $('#rematch', el);
  if (rb) rb.addEventListener('click', () => {
    if (online) { Net.backToLobby(); return; }
    openDraft({ mode: 'party', run: 'party', seed: 'p:' + rid(), blind: st.blind, managers: users.map((u) => ({ name: u.name })), meta, title: 'Party draft', onDone: (s2) => multiSeason(s2, meta, false) });
  });
}
// called by net.js when the host starts (or a client receives) an online draft
function startOnline(st, me) {
  const meta = st.managers.map((m, i) => ({ color: MGR_COLORS[i] }));
  App.g = { cfg: { mode: 'online', online: true, me, title: 'Online draft', onDone: (s) => multiSeason(s, meta, true) }, mode: 'online', st, meta, me, online: true, sel: null, shownSpin: null, spinning: false, view: me, lastPlaced: null };
  Draft();
}

// ================= BINDER =================
function Cards() {
  App.g = null;
  const c = Store.data.coll, total = TE.PLAYERS.length, have = Object.keys(c).length;
  const legends = TE.PLAYERS.filter((p) => p.r >= 95), haveL = legends.filter((p) => c[p.id]).length;
  const el = go(`
    ${clubSeg('binder')}
    <div class="binder-hero"><div><small>Cards collected</small><b>${have}<span>/ ${total}</span></b></div><div class="ring big" style="--p:${(have / total) * 100}%"><b>${Math.floor((have / total) * 100)}%</b></div></div>
    <div class="row" style="gap:8px;margin:10px 0 4px;flex-wrap:wrap"><span class="pill">${ico('sparkle', 14)} Legends <b>${haveL}</b>/ ${legends.length}</span><span class="pill">${ico('check', 14)} Sets <b>${setsDone()}</b>/ ${TE.SQUADS.length}</span></div>
    ${claimable() ? `<div class="promo" style="margin-top:6px"><div class="pr-ic">${ico('gift', 22)}</div><div class="grow"><b>${claimable()} set reward${claimable() > 1 ? 's' : ''} to claim</b><small>Open a team below to collect</small></div></div>` : ''}
    <div class="section-title">Teams</div>
    <div class="teamgrid">${TE.DATA.TEAMS.map((t, ti) => {
      const ids = TE.PLAYERS.filter((p) => p.team === ti).map((p) => p.id);
      const n = ids.filter((id) => c[id]).length;
      const cl = TE.SQUADS.some((s) => s.team === ti && setComplete(s.id) && !Store.data.sets[s.key]);
      return `<button class="tg ${n === ids.length ? 'full' : ''}" data-t="${ti}">${cl ? '<i class="badge-dot"></i>' : ''}${crest(t)}<b>${esc(t.short)}</b><small>${n}/${ids.length}</small><div class="prog"><i style="width:${(n / ids.length) * 100}%"></i></div></button>`;
    }).join('')}</div>`, 'has-tabs');
  tabbar('club');
  $$('[data-t]', el).forEach((b) => b.addEventListener('click', () => teamBinder(+b.dataset.t)));
}
// ---- sets: a team's roster in one decade. Complete it for coins; complete a franchise for a bonus.
const SET_REWARD = 300, FRANCHISE_REWARD = 1500;
const setComplete = (sq) => TE.SQUADS[sq].players.every((pid) => Store.data.coll[pid]);
const setsDone = () => TE.SQUADS.filter((s) => setComplete(s.id)).length;
const franchiseDone = (ti) => TE.SQUADS.filter((s) => s.team === ti).every((s) => setComplete(s.id));
const claimable = () => TE.SQUADS.filter((s) => setComplete(s.id) && !Store.data.sets[s.key]).length + TE.DATA.TEAMS.filter((t, ti) => franchiseDone(ti) && !Store.data.sets['F' + t.id]).length;
function teamBinder(ti) {
  const t = TE.DATA.TEAMS[ti], c = Store.data.coll;
  const bg = modal(`<div class="sheet-head"><div class="row">${crest(t, 40)}<h2 class="d" style="margin:0">${esc(t.name)}</h2></div><button class="icon-btn" data-close>${ico('x', 18)}</button></div>
    ${franchiseDone(ti) ? `<div class="set-banner">${ico('crown', 18)} Franchise complete${Store.data.sets['F' + t.id] ? '' : ` <button class="chip on" data-claim="F${t.id}" data-amt="${FRANCHISE_REWARD}">Claim ${FRANCHISE_REWARD}</button>`}</div>` : `<p class="mute" style="margin:-4px 0 0;font-weight:600;font-size:13px">Complete a decade for ${SET_REWARD} coins. Complete every decade for ${FRANCHISE_REWARD}.</p>`}
    ${TE.SQUADS.filter((s) => s.team === ti).map((s) => {
      const ps = s.players.map((id) => TE.PLAYERS[id]).sort((a, b) => b.r - a.r);
      const have = ps.filter((p) => c[p.id]).length, done = have === ps.length;
      const head = done ? (Store.data.sets[s.key] ? `<span class="set-ok">${ico('check', 14)} Set complete</span>` : `<button class="chip on" data-claim="${s.key}" data-amt="${SET_REWARD}">${ico('gift', 14)} Claim ${SET_REWARD}</button>`) : `<span class="mute">${have}/${ps.length}</span>`;
      return `<div class="set-head"><b>${TE.DATA.ERA_LABEL[s.era]}</b>${head}</div><div class="prog" style="height:5px;margin-bottom:10px"><i style="width:${(have / ps.length) * 100}%"></i></div>
        <div class="cardgrid">${ps.map((p) => (c[p.id] ? `<div>${pcard(p.id, { stars: cardLevel(p.id) })}</div>` : `<div class="locked">${ico('lock', 16)}<span>${p.pos}</span></div>`)).join('')}</div>`;
    }).join('')}`, null, 'sheet');
  $$('[data-claim]', bg).forEach((b) => b.addEventListener('click', () => {
    Store.data.sets[b.dataset.claim] = 1;
    Store.data.coins += +b.dataset.amt; Store.save();
    Sfx.trophy(); confetti(1500); toast(`+${b.dataset.amt} coins`);
    if (Object.keys(Store.data.sets).length >= 1) unlock('set1');
    if (Object.keys(Store.data.sets).filter((k) => k[0] !== 'F').length >= 10) unlock('set10');
    bg.remove(); Cards(); teamBinder(ti);
  }));
}

// ================= TROPHIES =================
function Trophies() {
  App.g = null;
  const a = Store.data.ach, s = Store.data.stats, got = ACH.filter((x) => a[x.id]).length;
  go(`
    <div class="topbar"><h2 class="d grow">Trophies</h2><span class="pill"><b>${got}</b>/ ${ACH.length}</span></div>
    <div class="stat-grid">
      <div class="stat"><div class="si sun">${ico('trophy', 18)}</div><b>${s.champs}</b><small>Super Bowls</small></div>
      <div class="stat"><div class="si violet">${ico('crown', 18)}</div><b>${s.perfect}</b><small>Perfect</small></div>
      <div class="stat"><div class="si pink">${ico('timer', 18)}</div><b>${s.clutchW}</b><small>Clutch wins</small></div>
      <div class="stat"><div class="si mint">${ico('clipboard', 18)}</div><b>${s.gdWins}-${s.gdPlayed - s.gdWins}</b><small>Gameday</small></div>
      <div class="stat"><div class="si pink">${ico('users', 18)}</div><b>${s.duelW || 0}</b><small>Duels won</small></div>
      <div class="stat"><div class="si sun">${ico('coin', 18)}</div><b>${s.capBest || 0}/4</b><small>Cap run</small></div>
      <div class="stat"><div class="si orange">${ico('goalpost', 18)}</div><b>${s.kickBest}</b><small>Kick It</small></div>
    </div>
    <div class="section-title">Achievements</div>
    <div class="achgrid">${ACH.map((x) => `<div class="ach ${a[x.id] ? '' : 'off'}"><div class="ai">${ico(x.icon, 24)}</div><b>${esc(x.t)}</b><small>${esc(x.d)}</small></div>`).join('')}</div>`, 'has-tabs');
  tabbar('trophies');
}

// ================= PROFILE =================
function Profile() {
  App.g = null;
  const d = Store.data, xp = d.xp, l = levelOf(xp), a = xpFor(l), b = xpFor(l + 1);
  const sw = { day: 'linear-gradient(#3cbc55,#34ad4b)', night: 'linear-gradient(#155a3a,#0b2a1c)', snow: 'linear-gradient(#f3f8fc,#d6e4ef)', retro: 'linear-gradient(#d9822b,#b9661a)', gold: 'linear-gradient(#ffe48a,#e9b82a)' };
  const el = go(`
    <div class="topbar"><h2 class="d grow">Me</h2>${coinsChip()}</div>
    <div class="hero-card"><div class="row">${levelChip()}<div class="grow"></div><div class="mute" style="font-weight:700;font-size:12px">${xp - a} / ${b - a} XP</div></div>
      <div class="prog" style="margin-top:12px"><i style="width:${((xp - a) / (b - a)) * 100}%"></i></div></div>
    <div class="section-title">GM name</div>
    <input class="field" id="nm" maxlength="14" placeholder="Your name" value="${esc(d.name)}">
    <div class="section-title">Field</div>
    <div class="themes">${THEMES.map((t) => `<button class="theme ${d.theme === t.id ? 'on' : ''} ${l < t.lvl ? 'lock' : ''}" data-th="${t.id}" style="background:${sw[t.id]}" title="${t.name}">${l < t.lvl ? ico('lock', 16) : d.theme === t.id ? ico('check', 18) : ''}<small>${l < t.lvl ? 'Lv ' + t.lvl : t.name.split(' ')[0]}</small></button>`).join('')}</div>
    <div class="section-title">Settings</div>
    <div class="settings">
      <button class="toggle ${d.sound ? 'on' : ''}" data-tg="sound"><span class="ic">${ico('sound', 20)}</span><div class="grow"><h4>Sound</h4></div><div class="sw"></div></button>
      <button class="toggle ${d.haptics ? 'on' : ''}" data-tg="haptics"><span class="ic">${ico('phone', 20)}</span><div class="grow"><h4>Vibration</h4></div><div class="sw"></div></button>
      <button class="toggle ${d.fastSpin ? 'on' : ''}" data-tg="fastSpin"><span class="ic">${ico('bolt', 20)}</span><div class="grow"><h4>Fast spins</h4><p>Shorter wheel animation</p></div><div class="sw"></div></button>
    </div>
    <div class="actions"><button class="btn" data-act="help">How to play</button><button class="btn" id="reset" style="color:var(--red)">Reset all progress</button></div>`, 'has-tabs');
  tabbar('me');
  $('#nm', el).addEventListener('input', (e) => { d.name = e.target.value.slice(0, 14); Store.save(); });
  $$('[data-tg]', el).forEach((b2) => b2.addEventListener('click', () => { const k = b2.dataset.tg; d[k] = !d[k]; b2.classList.toggle('on', d[k]); Store.save(); Sfx.tap(); }));
  $$('[data-th]', el).forEach((b2) => b2.addEventListener('click', () => {
    const t = THEMES.find((x) => x.id === b2.dataset.th);
    if (l < t.lvl) { toast(`Reach level ${t.lvl} to unlock ${t.name}`); return; }
    d.theme = t.id; Store.save(); applyTheme(); Sfx.select(); Profile();
  }));
  $('#reset', el).addEventListener('click', () => modal(`<h2 class="d">Reset everything?</h2><p>XP, coins, cards, trophies and stats will be wiped.</p><div class="actions two"><button class="btn" data-close>Cancel</button><button class="btn danger" id="rs">Reset</button></div>`, (bg) => {
    $('#rs', bg).addEventListener('click', () => { localStorage.removeItem(Store.key); Store.load(); applyTheme(); bg.remove(); Home(); });
  }, 'sheet'));
}

// ================= RESUME =================
// Every mode with a run in progress picks up exactly where it was left.
const RUN_INFO = {
  season: { t: 'Season', ic: 'ball', col: 'blue', start: () => SeasonSetup('quick') },
  daily: { t: 'Daily Draft', ic: 'calendar', col: 'sun', start: () => SeasonSetup('daily') },
  challenge: { t: 'Challenge', ic: 'users', col: 'pink', start: null },
  party: { t: 'Party season', ic: 'users', col: 'ink', start: PartySetup },
  duel: { t: 'Draft Duel', ic: 'users', col: 'violet', start: () => DuelStart() },
  cap: { t: 'Salary Cap', ic: 'coin', col: 'sun', start: () => CapStart() },
  gameday: { t: 'Gameday', ic: 'clipboard', col: 'mint', start: () => GamedayStart() },
  drill: { t: '2-Minute Drill', ic: 'timer', col: 'violet', start: null },
  kick: { t: 'Kick It', ic: 'goalpost', col: 'orange', start: () => KickIt() },
  hl: { t: "Who's Better?", ic: 'scale', col: 'blue', start: () => WhosBetter() },
};
function runSummary(k, r) {
  if (r.phase === 'draft') { const st = r.st; return `Drafting · pick ${Math.min(st.rounds, st.round + 1)} of ${st.rounds}`; }
  if (r.phase === 'season') { const n = r.shown || 0; return n >= 17 ? 'Playoffs' : n ? `After week ${n}` : 'Kickoff'; }
  if (k === 'duel') { const w = r.d.games.filter((g) => g.win).length; return `Series ${w}–${r.d.games.length - w} vs ${r.d.rival.name}`; }
  if (k === 'cap') return r.phase === 'build' ? `Building · pick ${r.c.round + 1} of 12 · $${CAP - r.c.spent}M left` : `Playoff run · ${r.c.wins} win${r.c.wins === 1 ? '' : 's'}`;
  if (k === 'gameday' || k === 'drill') { const g = r.g; return `${g.ot ? 'OT' : 'Q' + Math.min(4, g.quarter)} ${GD.fmtClock(g.clock)} · ${g.score.us}–${g.score.them}`; }
  if (k === 'kick') return `${r.S.made} made · ${r.S.lives} ${r.S.lives === 1 ? 'life' : 'lives'} left`;
  if (k === 'hl') return `Streak of ${r.streak}`;
  return 'In progress';
}
function resumeRun(k) {
  const r = Runs.get(k);
  if (!r) return false;
  try {
    if (r.phase === 'draft') {
      const c = r.cfg;
      const done = {
        season: (st) => soloSeason('quick', st, c.blind), daily: (st) => soloSeason('daily', st, c.blind),
        challenge: (st) => { App.challenge = c.ch; soloSeason('challenge', st, c.blind); },
        party: (st) => multiSeason(st, c.meta, false), duel: (st) => duelDrafted(c.rivalId, c.seed, st), gameday: gamedayDrafted,
      }[k];
      if (k === 'challenge') App.challenge = c.ch;
      openDraft(Object.assign({}, c, { st: r.st, onDone: done }));
    } else if (r.phase === 'season') {
      if (k === 'party') multiSeason(r.st, r.meta, false, r.shown);
      else { if (r.ch) App.challenge = r.ch; soloSeason(r.mode, { seed: r.seed, managers: [{ xi: r.xi }] }, r.blind, { choices: r.choices || [], shown: r.shown || 0 }); }
    } else if (k === 'duel') DuelHub(r.d);
    else if (k === 'cap') (r.phase === 'build' ? CapBuild : CapHub)(r.c);
    else if (k === 'gameday') GamedayGame(r.xi, r.opp, r.diff, { mods: r.mods, resumeG: r.g });
    else if (k === 'drill') { const S = drillSetup(r.seed); GamedayGame(S.xi, S.opp, '2-Minute Drill', { drill: S, daily: r.daily, seed: r.seed, resumeG: r.g }); }
    else if (k === 'kick') KickIt(r.S);
    else if (k === 'hl') WhosBetter(r.streak);
    else return false;
  } catch (e) {
    console.error(e); Runs.clear(k); toast("Couldn't restore that run, sorry"); return false;
  }
  return true;
}
// open a mode: if a run is in progress, offer to continue it or start over
function runOr(k, start) {
  const r = Runs.get(k);
  if (!r) return start();
  const info = RUN_INFO[k];
  modal(`<div class="resume-head"><div class="mc-ic ${info.col}">${ico(info.ic, 22)}</div><div><h2 class="d" style="margin:0">${info.t}</h2><div class="mute" style="font-weight:700;font-size:13px">${esc(runSummary(k, r))}</div></div></div>
    <p style="margin:12px 0 0">You have a game in progress. Pick up where you left off?</p>
    <div class="actions"><button class="btn primary" id="cont">${ico('play', 18)} Continue</button>${start ? '<button class="btn" id="new">Start over</button>' : ''}</div>`, (bg) => {
    $('#cont', bg).addEventListener('click', () => { bg.remove(); resumeRun(k); });
    const n = $('#new', bg);
    if (n) n.addEventListener('click', () => modal(`<h2 class="d">Start over?</h2><p>Your ${info.t} in progress will be deleted.</p><div class="actions two"><button class="btn" data-close>Keep it</button><button class="btn hot" id="del">Start over</button></div>`, (bg2) => {
      $('#del', bg2).addEventListener('click', () => { bg2.remove(); bg.remove(); Runs.clear(k); start(); });
    }, 'sheet'));
  }, 'sheet');
}
// "Pick up where you left off" strip
function continueStrip(kinds) {
  const list = kinds.map((k) => [k, Runs.get(k)]).filter(([, r]) => r).sort((a, b) => b[1].at - a[1].at);
  if (!list.length) return '';
  return `<div class="sec-row"><h3>Continue</h3></div><div class="cont-list">${list.map(([k, r]) => { const i = RUN_INFO[k]; return `<button class="cont" data-resume="${k}"><div class="mc-ic ${i.col}">${ico(i.ic, 20)}</div><div class="grow"><b>${i.t}</b><small>${esc(runSummary(k, r))}</small></div><span class="dl-go">${ico('play', 14)}</span></button>`; }).join('')}</div>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-resume]');
  if (b) { Sfx.tap(); resumeRun(b.dataset.resume); }
});

// ================= BOOT =================
const ACTIONS = {
  home: () => goTab(App.tab || 'play'), dailytab: () => goTab('games'), duel: () => runOr('duel', DuelStart), cap: () => runOr('cap', CapStart), binder: Cards, help: Help, quit: () => quitDraft(), season: () => runOr('season', () => SeasonSetup('quick')), daily: () => (Runs.get('daily') ? resumeRun('daily') : openDaily()), gameday: () => runOr('gameday', GamedayStart),
  hl: () => runOr('hl', WhosBetter), friends: FriendsMenu, party: () => runOr('party', PartySetup), online: () => OnlineScreen(),
  club: () => ClubScreen(), grid: () => GridGame(), who: () => MysteryGame(), drill: () => (Runs.get('drill') ? resumeRun('drill') : DrillStart()), kick: () => runOr('kick', KickIt), packs: Packs,
};
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (b && ACTIONS[b.dataset.act]) { Sfx.ensure(); Sfx.tap(); ACTIONS[b.dataset.act](b); }
});
function boot() {
  Store.load();
  applyTheme();
  document.body.insertAdjacentHTML('afterbegin', DEFS + '<div class="blobs"><i></i><i></i><i></i></div>');
  const h = location.hash, q = new URLSearchParams(location.search);
  if (h.startsWith('#c=')) {
    const ch = b64urlDecode(h.slice(3));
    history.replaceState(null, '', location.pathname);
    const ok = ch && ch.v === TE.DATA_VERSION && Array.isArray(ch.x) && ch.x.length === TE.SLOTS && ch.x.every((v) => v === null || (Number.isInteger(v) && v >= 0 && v < TE.PLAYERS.length));
    if (ok) {
      ch.n = String(ch.n || 'A friend').slice(0, 14); ch.title = String(ch.title || '').slice(0, 26); ch.rec = String(ch.rec || '').slice(0, 7);
      ch.c = Array.isArray(ch.c) ? ch.c.filter((v) => typeof v === 'string').slice(0, 12) : [];
      App.challenge = ch; SeasonSetup('challenge'); if (window.__ldReady) window.__ldReady(); return;
    }
    toast('That challenge link is broken');
  }
  if (q.get('room')) { App.pendingRoom = q.get('room').toUpperCase().slice(0, 5); history.replaceState(null, '', location.pathname); OnlineScreen(); if (window.__ldReady) window.__ldReady(); return; }
  goTab('play');
  if (window.__ldReady) window.__ldReady();
  if (Store.data.resetNotice) { Store.data.resetNotice = false; Store.save(); later(resetNotice, 1300); }
}
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
boot();
