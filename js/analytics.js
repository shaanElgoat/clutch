'use strict';
// ANALYTICS (owner only). Every device sends what it does to the Firebase database: when it plays, for how
// long, which buttons and modes it uses, what happens (seasons, rings, packs, codes...), plus a snapshot of
// its progress and any errors. The database rules make all of it write-only, so players can't read it.
// The owner reads it on the hidden dashboard with the database secret, which is only stored on their phone.
const TRACK_URL = 'https://clutch-98557-default-rtdb.firebaseio.com/analytics';
const BUILD = 'v44';
// the events worth a line in the live feed (everything is still counted)
const FEED = { season_end: 1, ring: 1, gdwin: 1, duelw: 1, daily: 1, rivalsw: 1, promo: 1, open_std: 1, open_pro: 1, open_leg: 1, open_icon: 1, code: 1, claim: 1, tour_done: 1, tour_skip: 1, first_open: 1, conn: 1, signup: 1 };
const safeKey = (s) => String(s).replace(/[.#$/[\]\s]/g, '_').slice(0, 60) || '_';

const Track = {
  p: { secs: 0, acts: {}, evs: {}, feed: [], start: false },
  since: null, timer: null,
  on: () => !!TRACK_URL && !Store.data.noTrack,
  id() {
    if (!Store.data.aid) { Store.data.aid = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => (b % 36).toString(36)).join(''); Store.data.aFirst = Date.now(); Store.save(); Track.ev('first_open'); }
    return Store.data.aid;
  },
  day: (d) => todayKey(d),
  plat() {
    const u = navigator.userAgent;
    return /iPhone|iPod/.test(u) ? 'iPhone' : /iPad|Macintosh/.test(u) && navigator.maxTouchPoints > 1 ? 'iPad' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Win/.test(u) ? 'Windows' : 'Other';
  },
  app: () => !!((window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone),
  start() {
    if (!Track.on()) return;
    Track.id();
    Track.p.start = true;
    Track.since = document.visibilityState === 'visible' ? Date.now() : null;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { Track.since = Date.now(); Track.p.start = true; }
      else { Track.tick(); Track.flush(true); }
    });
    window.addEventListener('pagehide', () => { Track.tick(); Track.flush(true); });
    Track.timer = setInterval(() => { Track.tick(); Track.flush(); }, 30000);
    setTimeout(() => Track.flush(), 4000);
  },
  tick() { if (Track.since) { const n = Date.now(); Track.p.secs += Math.round((n - Track.since) / 1000); Track.since = document.visibilityState === 'visible' ? n : null; } },
  tap(act) { if (Track.on()) { const k = safeKey(act); Track.p.acts[k] = (Track.p.acts[k] || 0) + 1; } },
  ev(name, info) {
    if (!Track.on()) return;
    const k = safeKey(name);
    Track.p.evs[k] = (Track.p.evs[k] || 0) + 1;
    if (FEED[name] && Track.p.feed.length < 40) Track.p.feed.push({ e: k, i: info === undefined ? '' : String(info).slice(0, 80), t: Date.now() });
  },
  err(msg) {
    if (!Track.on() || !msg) return;
    const m = String(msg).slice(0, 200);
    Track.p.errs = Track.p.errs || {};
    Track.p.errs[safeKey(TE.hash(m))] = m;
  },
  // one small multi-path PATCH: counters use server-side increments, so many sessions add up correctly
  flush(beacon) {
    if (!Track.on()) return;
    const P = Track.p, aid = Track.id(), d = Store.data, s = d.stats, day = Track.day(), hr = new Date().getHours();
    const inc = (n) => ({ '.sv': { increment: n } });
    const up = {};
    const base = `d/${day}/${aid}`;
    if (P.start) { up[base + '/s'] = inc(1); up[`u/${aid}/s`] = inc(1); up[base + '/hs/' + hr] = inc(1); }
    if (P.secs) { up[base + '/t'] = inc(P.secs); up[`u/${aid}/t`] = inc(P.secs); up[base + '/h/' + hr] = inc(P.secs); }
    Object.keys(P.acts).forEach((k) => { up[`${base}/a/${k}`] = inc(P.acts[k]); });
    Object.keys(P.evs).forEach((k) => { up[`${base}/e/${k}`] = inc(P.evs[k]); });
    P.feed.forEach((f, i) => { up[`f/${day}/${f.t.toString(36)}${i}${aid.slice(0, 4)}`] = { u: aid, n: (d.name || '').slice(0, 14), e: f.e, i: f.i, t: f.t }; });
    Object.keys(P.errs || {}).forEach((k) => { up[`err/${day}/${k}/m`] = P.errs[k]; up[`err/${day}/${k}/n`] = inc(1); up[`err/${day}/${k}/u`] = aid; });
    const nothing = !P.start && !P.secs && !Object.keys(up).length;
    if (nothing) return;
    // who this player is right now: a snapshot of their progress
    const c = d.club || {};
    Object.assign(up, {
      [`u/${aid}/n`]: (d.name || '').slice(0, 14), [`u/${aid}/l`]: { '.sv': 'timestamp' }, [`u/${aid}/f`]: d.aFirst || Date.now(),
      [`u/${aid}/p`]: Track.plat(), [`u/${aid}/a`]: Track.app(), [`u/${aid}/v`]: BUILD, [`u/${aid}/w`]: window.innerWidth,
      [`u/${aid}/tz`]: -new Date().getTimezoneOffset() / 60, [`u/${aid}/lg`]: (navigator.language || '').slice(0, 8),
      [`u/${aid}/lv`]: levelOf(d.xp), [`u/${aid}/xp`]: d.xp, [`u/${aid}/c`]: d.coins, [`u/${aid}/cd`]: Object.keys(d.coll || {}).length,
      [`u/${aid}/ach`]: Object.keys(d.ach || {}).length, [`u/${aid}/rd`]: c.div || 10, [`u/${aid}/rt`]: c.top || 10, [`u/${aid}/ds`]: dailyStreak(),
      [`u/${aid}/tour`]: !!d.toured, [`u/${aid}/st`]: { pl: s.played, po: s.playoffs, ch: s.champs, p17: s.perfectReg, pf: s.perfect, cw: s.clutchW, ct: s.clutchT, gp: s.gdPlayed, gw: s.gdWins, hl: s.hlBest, kb: s.kickBest, dw: s.drillWins, pk: s.packs, mp: s.mpWins, du: s.duelW || 0, cap: s.capBest || 0 },
      [`u/${aid}/best`]: s.best ? String(s.best.rec) : '',
    });
    Track.p = { secs: 0, acts: {}, evs: {}, feed: [], start: false };
    fetch(TRACK_URL + '.json', { method: 'PATCH', body: JSON.stringify(up), keepalive: !!beacon }).catch(() => {});
  },
};
window.addEventListener('error', (e) => Track.err((e.message || 'error') + (e.filename ? ' @' + e.filename.split('/').pop() + ':' + e.lineno : '')));
window.addEventListener('unhandledrejection', (e) => Track.err('promise: ' + ((e.reason && (e.reason.message || e.reason)) || '?')));

// ======================= the owner's dashboard =======================
const DASH = { secret: () => { try { return localStorage.getItem('clutch_dash') || ''; } catch (_) { return ''; } } };
const ago = (t) => { const s = (Date.now() - t) / 1000; return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + 'm ago' : s < 86400 ? Math.round(s / 3600) + 'h ago' : Math.round(s / 86400) + 'd ago'; };
const dur = (s) => { s = Math.round(s || 0); return s < 60 ? s + 's' : s < 3600 ? Math.round(s / 60) + 'm' : (s / 3600).toFixed(1) + 'h'; };
const dayAdd = (k, n) => { const [y, m, d] = k.split('-').map(Number); return todayKey(new Date(y, m - 1, d + n)); };
// friendlier names for button and event keys
const ACT_NAME = { season: 'Season', daily: 'Daily Draft', friends: 'Play with friends', party: 'Pass & play', online: 'Online room', duel: 'Draft Duel', cap: 'Salary Cap', gameday: 'Gameday', hl: "Who's Better?", kick: 'Kick It', grid: 'The Grid', who: "Who's That?", drill: '2-Minute Drill', conn: 'Connections', club: 'My Club', packs: 'Packs', binder: 'Binder', goals: 'Objectives', tour: 'Tutorial', help: 'How to play', tab_play: 'Season tab', tab_games: 'Games tab', tab_club: 'Club tab', tab_trophies: 'Trophies tab', tab_me: 'Me tab' };
const EV_NAME = { season: 'Seasons finished', season_end: 'Seasons finished', sgw: 'Season games won', playoffs: 'Playoff trips', ring: 'Super Bowls won', clutch: 'Clutch Calls won', gameday: 'Gamedays played', gdwin: 'Gamedays won', daily: 'Daily Drafts', puzzle: 'Daily puzzles finished', hl: "Who's Better? runs", kick: 'Kick It runs', rivals: 'Rivals games', rivalsw: 'Rivals wins', duelg: 'Draft Duel games', duelw: 'Draft Duel series won', capw: 'Salary Cap wins', pack: 'Packs opened', code: 'Codes redeemed', claim: 'Objectives claimed', tour_done: 'Tutorial finished', tour_skip: 'Tutorial skipped', first_open: 'New installs', conn: 'Connections finished', promo: 'Rivals promotions' };

function bars(rows, o) {
  o = o || {};
  const max = Math.max(1, ...rows.map((r) => r.v));
  return `<div class="dz-bars ${o.cls || ''}" style="--n:${rows.length}">${rows.map((r) => `<div class="dz-col" data-tip="${esc(r.tip || r.label + ': ' + r.v)}"><i style="height:${Math.max(r.v ? 3 : 0, (r.v / max) * 100)}%"></i><small>${r.short === undefined ? '' : esc(r.short)}</small></div>`).join('')}</div>`;
}
function hbars(rows, fmt) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  return `<div class="dz-h">${rows.map((r) => `<div class="dz-hr" data-tip="${esc(r.label)}: ${fmt ? fmt(r.v) : r.v}"><span class="dz-hl">${esc(r.label)}</span><span class="dz-hb"><i style="width:${(r.v / max) * 100}%"></i></span><b>${fmt ? fmt(r.v) : r.v.toLocaleString()}</b></div>`).join('') || '<p class="mute">Nothing yet.</p>'}</div>`;
}
const tile = (v, k, sub) => `<div class="dz-tile"><b>${v}</b><span>${k}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;

async function StatsDash(range) {
  App.g = null;
  range = range || 7;
  const sec = DASH.secret();
  if (!sec) return dashLogin();
  const el = go(`<div class="topbar"><button class="icon-btn" data-act="home">${ico('back', 20)}</button><h2 class="d grow">Analytics</h2></div><p class="mute center" style="font-weight:700;margin-top:40px">Loading…</p>`);
  const today = todayKey(), from = dayAdd(today, -29);
  const get = (p, q) => fetch(`${TRACK_URL}/${p}.json?auth=${encodeURIComponent(sec)}${q || ''}`).then((r) => { if (r.status === 401 || r.status === 403) throw new Error('auth'); return r.json(); });
  let U, D, F, E;
  try {
    [U, D, F, E] = await Promise.all([get('u'), get('d', `&orderBy="$key"&startAt="${from}"`), get('f', `&orderBy="$key"&startAt="${dayAdd(today, -2)}"`), get('err', `&orderBy="$key"&startAt="${dayAdd(today, -6)}"`)]);
  } catch (err) {
    if (err.message === 'auth') { try { localStorage.removeItem('clutch_dash'); } catch (_) {} toast('That secret was rejected'); return dashLogin(); }
    el.querySelector('p').textContent = "Couldn't load. Check your internet."; return;
  }
  if (!el.isConnected) return;
  U = U || {}; D = D || {}; F = F || {}; E = E || {};
  // the dashboard's own setup check leaves an empty entry: it isn't a real visit
  Object.values(D).forEach((day) => Object.keys(day || {}).forEach((id) => { const x = day[id]; if (!x || (!x.s && !x.t && !x.a && !x.e)) delete day[id]; }));
  const days = []; for (let i = 29; i >= 0; i--) days.push(dayAdd(today, -i));
  const win = days.slice(-range);
  const users = Object.entries(U).map(([id, u]) => ({ id, ...u }));
  const act = (k) => Object.keys(D[k] || {});
  const inWin = new Set(win.flatMap(act));
  const firstDay = (u) => todayKey(new Date(u.f || u.l || 0));
  const newIn = (ks) => users.filter((u) => ks.includes(firstDay(u))).length;
  const sum = (ks, f) => ks.reduce((a, k) => a + Object.values(D[k] || {}).reduce((b, x) => b + (f(x) || 0), 0), 0);
  const playSecs = sum(win, (x) => x.t), sessions = sum(win, (x) => x.s);
  const now = Date.now(), live = users.filter((u) => now - (u.l || 0) < 5 * 60e3).length;
  // retention: of the players who started on a day, how many came back 1 day / 7 days later
  const ret = (n) => { let c = 0, b = 0; days.forEach((k) => { const back = dayAdd(k, n); if (back > today) return; users.filter((u) => firstDay(u) === k).forEach((u) => { c++; if (D[back] && D[back][u.id]) b++; }); }); return c ? Math.round((b / c) * 100) + '%' : '–'; };
  // what they did
  const tally = (key) => { const t = {}; win.forEach((k) => Object.values(D[k] || {}).forEach((x) => Object.entries(x[key] || {}).forEach(([a, n]) => { t[a] = (t[a] || 0) + n; }))); return Object.entries(t).sort((a, b) => b[1] - a[1]); };
  const taps = tally('a'), evs = tally('e');
  const hours = new Array(24).fill(0); win.forEach((k) => Object.values(D[k] || {}).forEach((x) => Object.entries(x.h || {}).forEach(([h, s]) => { hours[+h] += s; })));
  const wd = new Array(7).fill(0); win.forEach((k) => { const [y, m, d] = k.split('-').map(Number); wd[(new Date(y, m - 1, d).getDay() + 6) % 7] += Object.keys(D[k] || {}).length; });
  const plats = {}; users.forEach((u) => { plats[u.p || '?'] = (plats[u.p || '?'] || 0) + 1; });
  const asApp = users.filter((u) => u.a).length;
  const lv = {}; users.forEach((u) => { const b = u.lv >= 20 ? '20+' : u.lv >= 10 ? '10–19' : u.lv >= 5 ? '5–9' : '1–4'; lv[b] = (lv[b] || 0) + 1; });
  const divs = new Array(10).fill(0); users.forEach((u) => { if (u.rt) divs[u.rt - 1]++; });
  const feed = Object.entries(F).flatMap(([, v]) => Object.values(v || {})).sort((a, b) => b.t - a.t).slice(0, 60);
  const errs = Object.entries(E).flatMap(([k, v]) => Object.values(v || {}).map((x) => ({ ...x, day: k }))).sort((a, b) => (b.n || 0) - (a.n || 0)).slice(0, 15);
  const sorted = users.slice().sort((a, b) => (b.l || 0) - (a.l || 0));
  const name = (u) => (u.n ? esc(u.n) : `<span class="mute">Player ${u.id.slice(0, 4)}</span>`);
  const actDays = (id) => days.filter((k) => D[k] && D[k][id]).length;
  el.innerHTML = `
    <div class="topbar"><button class="icon-btn" data-act="home">${ico('back', 20)}</button><h2 class="d grow">Analytics</h2><button class="icon-btn" id="rf">${ico('refresh', 18)}</button></div>
    <div class="seg dz-range">${[1, 7, 30].map((r) => `<button class="${r === range ? 'on' : ''}" data-r="${r}">${r === 1 ? 'Today' : r + ' days'}</button>`).join('')}</div>
    <div class="dz-tiles">
      ${tile(users.length.toLocaleString(), 'Total players', `${newIn([today])} new today`)}
      ${tile(live, 'Playing now', 'active in the last 5 min')}
      ${tile(inWin.size, range === 1 ? 'Played today' : `Played (${range}d)`, `${newIn(win)} new`)}
      ${tile(dur(playSecs), 'Time played', inWin.size ? dur(playSecs / inWin.size) + ' per player' : '')}
      ${tile(sessions.toLocaleString(), 'Sessions', inWin.size ? (sessions / inWin.size).toFixed(1) + ' per player' : '')}
      ${tile(ret(1), 'Came back next day', `7-day: ${ret(7)}`)}
    </div>
    <div class="dz-card"><h4>Players per day <small>last 30 days</small></h4>${bars(days.map((k) => ({ v: act(k).length, short: k.slice(8) === '01' || k === today ? k.slice(5) : '', tip: `${k}: ${act(k).length} players · ${newIn([k])} new` })))}</div>
    <div class="dz-card"><h4>New players per day <small>last 30 days</small></h4>${bars(days.map((k) => ({ v: newIn([k]), short: k === today ? 'today' : '', tip: `${k}: ${newIn([k])} new` })), { cls: 'alt' })}</div>
    <div class="dz-card"><h4>When they play <small>minutes by hour, ${range === 1 ? 'today' : range + ' days'}</small></h4>${bars(hours.map((s, h) => ({ v: Math.round(s / 60), short: h % 6 === 0 ? (h === 0 ? '12a' : h === 12 ? '12p' : h > 12 ? h - 12 + 'p' : h + 'a') : '', tip: `${h}:00: ${Math.round(s / 60)} min` })))}</div>
    <div class="dz-card"><h4>Busiest days <small>players by weekday</small></h4>${bars(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => ({ v: wd[i], short: d, tip: `${d}: ${wd[i]}` })), { cls: 'wide' })}</div>
    <div class="dz-card"><h4>What they tap <small>${range === 1 ? 'today' : range + ' days'}</small></h4>${hbars(taps.slice(0, 16).map(([k, v]) => ({ label: ACT_NAME[k] || k, v })))}</div>
    <div class="dz-card"><h4>What happens <small>${range === 1 ? 'today' : range + ' days'}</small></h4>${hbars(evs.filter(([k]) => !/^open_/.test(k)).slice(0, 20).map(([k, v]) => ({ label: EV_NAME[k] || k, v })))}</div>
    <div class="dz-card"><h4>Packs opened <small>${range === 1 ? 'today' : range + ' days'}</small></h4>${hbars(evs.filter(([k]) => /^open_/.test(k)).map(([k, v]) => ({ label: ({ open_std: 'Standard', open_pro: 'Pro', open_leg: 'Legend', open_icon: 'Icon' })[k] || k, v })))}</div>
    <div class="dz-two">
      <div class="dz-card"><h4>Devices</h4>${hbars(Object.entries(plats).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, v })))}<p class="dz-note">${users.length ? Math.round((asApp / users.length) * 100) : 0}% installed it to their home screen</p></div>
      <div class="dz-card"><h4>Player levels</h4>${hbars(['1–4', '5–9', '10–19', '20+'].map((k) => ({ label: 'Level ' + k, v: lv[k] || 0 })))}</div>
    </div>
    <div class="dz-card"><h4>Best Rivals division reached</h4>${bars(divs.map((v, i) => ({ v, short: 'D' + (i + 1), tip: `Division ${i + 1}: ${v} players` })), { cls: 'wide' })}</div>
    <div class="dz-card"><h4>Live feed <small>last 3 days</small></h4><div class="dz-feed">${feed.map((f) => `<div><span class="mute">${ago(f.t)}</span> <b>${f.n ? esc(f.n) : 'Player ' + esc(String(f.u).slice(0, 4))}</b> ${esc(feedLine(f))}</div>`).join('') || '<p class="mute">Nothing yet.</p>'}</div></div>
    <div class="dz-card"><h4>Players <small>tap one for everything</small></h4>
      <div class="dz-table"><div class="dz-th"><span>Player</span><span>Lvl</span><span>Seen</span><span>Days</span><span>Time</span></div>
      ${sorted.slice(0, 200).map((u) => `<button class="dz-tr" data-u="${esc(u.id)}"><span>${name(u)}<small>${esc(u.p || '')}${u.a ? ' · app' : ''}</small></span><span>${u.lv || 1}</span><span>${u.l ? ago(u.l) : '–'}</span><span>${actDays(u.id)}</span><span>${dur(u.t)}</span></button>`).join('') || '<p class="mute">No players yet.</p>'}</div></div>
    <div class="dz-card"><h4>Errors <small>last 7 days</small></h4>${errs.map((x) => `<div class="dz-err"><b>${x.n || 1}×</b> ${esc(x.m || '')}<small>${x.day}</small></div>`).join('') || '<p class="mute">No errors. Nice.</p>'}</div>
    <div class="dz-card"><h4>This phone</h4><button class="toggle ${Store.data.noTrack ? '' : 'on'}" id="me"><div class="grow"><h4>Count my own plays</h4><p>Turn off so your testing doesn't mix into the numbers.</p></div><div class="sw"></div></button>
      <button class="btn small" id="lock" style="margin-top:10px">Lock dashboard on this phone</button></div>`;
  $('#rf', el).addEventListener('click', () => StatsDash(range));
  $$('[data-r]', el).forEach((b) => b.addEventListener('click', () => StatsDash(+b.dataset.r)));
  $('#me', el).addEventListener('click', () => { Store.data.noTrack = !Store.data.noTrack; Store.save(); StatsDash(range); });
  $('#lock', el).addEventListener('click', () => { try { localStorage.removeItem('clutch_dash'); } catch (_) {} goTab('me'); });
  $$('[data-u]', el).forEach((b) => b.addEventListener('click', () => dashPlayer(U[b.dataset.u], b.dataset.u, D, days)));
  dashTips(el);
  dashRulesOk().then((ok) => { if (ok === false && el.isConnected) el.querySelector('.dz-range').insertAdjacentHTML('afterend', `<button class="dz-warn" id="fix"><b>No stats are being saved yet</b><span>The database rules aren't published. Tap to fix.</span></button>`); const f = $('#fix', el); if (f) f.addEventListener('click', () => dashLogin()); });
}
function feedLine(f) {
  const i = f.i ? ` (${f.i})` : '';
  if (/^open_/.test(f.e)) return `opened a ${({ open_std: 'Standard', open_pro: 'Pro', open_leg: 'Legend', open_icon: 'Icon' })[f.e] || ''} pack${i}`;
  return (({ season_end: 'finished a season', ring: 'won the Super Bowl', gdwin: 'won a Gameday', duelw: 'won a Draft Duel series', daily: 'played the Daily Draft', puzzle: 'finished a daily puzzle', rivalsw: 'won a Rivals game', promo: 'got promoted in Rivals', pack: 'opened a pack', code: 'redeemed a code', claim: 'claimed an objective', tour_done: 'finished the tutorial', tour_skip: 'skipped the tutorial', first_open: 'opened CLUTCH for the first time', conn: 'finished Connections', signup: 'created an account' })[f.e] || f.e) + i;
}
function dashPlayer(u, id, D, days) {
  if (!u) return;
  const s = u.st || {};
  const per = days.filter((k) => D[k] && D[k][id]).map((k) => ({ k, x: D[k][id] }));
  const acts = {}; per.forEach(({ x }) => Object.entries(x.a || {}).forEach(([a, n]) => { acts[a] = (acts[a] || 0) + n; }));
  const row = (k, v) => `<div class="dz-kv"><span>${k}</span><b>${v}</b></div>`;
  modal(`<div class="sheet-head"><h2 class="d" style="margin:0">${u.n ? esc(u.n) : 'Player ' + esc(id.slice(0, 4))}</h2><button class="icon-btn" data-close>${ico('x', 18)}</button></div>
    <div class="dz-kvs">
      ${row('First seen', u.f ? new Date(u.f).toLocaleString() : '–')}${row('Last seen', u.l ? ago(u.l) : '–')}${row('Sessions', u.s || 0)}${row('Total time', dur(u.t))}
      ${row('Device', esc((u.p || '?') + (u.a ? ' · home-screen app' : ' · browser')))}${row('Language / timezone', esc(`${u.lg || '?'} · UTC${u.tz >= 0 ? '+' : ''}${u.tz}`))}${row('Build', esc(u.v || '?'))}
      ${row('Level / XP', `${u.lv || 1} · ${(u.xp || 0).toLocaleString()}`)}${row('Coins', (u.c || 0).toLocaleString())}${row('Cards', u.cd || 0)}${row('Achievements', u.ach || 0)}
      ${row('Seasons / playoffs / rings', `${s.pl || 0} / ${s.po || 0} / ${s.ch || 0}`)}${row('Best record', esc(u.best || '–'))}${row('17-0 / perfect', `${s.p17 || 0} / ${s.pf || 0}`)}
      ${row('Clutch Calls', `${s.cw || 0}/${s.ct || 0}`)}${row('Gameday', `${s.gw || 0}-${(s.gp || 0) - (s.gw || 0)}`)}${row('Rivals now / best', `Div ${u.rd || 10} / Div ${u.rt || 10}`)}
      ${row('Draft Duels won', s.du || 0)}${row('Salary Cap best', `${s.cap || 0} wins`)}${row("Who's Better? best", s.hl || 0)}${row('Kick It best', s.kb || 0)}${row('Drills won', s.dw || 0)}
      ${row('Packs opened', s.pk || 0)}${row('Daily streak', u.ds || 0)}${row('Did the tutorial', u.tour ? 'Yes' : 'No')}
    </div>
    <div class="section-title">Days played</div>${per.length ? per.slice().reverse().map(({ k, x }) => row(k, `${dur(x.t)} · ${x.s || 0} session${x.s === 1 ? '' : 's'}`)).join('') : '<p class="mute">No activity in the last 30 days.</p>'}
    <div class="section-title">Most used</div>${hbars(Object.entries(acts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ label: ACT_NAME[k] || k, v })))}`, null, 'sheet');
}
// tap-to-show tooltips (phones can't hover)
function dashTips(el) {
  let tip = null;
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tip]');
    if (tip) { tip.remove(); tip = null; }
    if (!t) return;
    const r = t.getBoundingClientRect();
    tip = document.createElement('div'); tip.className = 'dz-tip'; tip.textContent = t.dataset.tip;
    document.body.appendChild(tip);
    tip.style.left = Math.max(8, Math.min(innerWidth - tip.offsetWidth - 8, r.left + r.width / 2 - tip.offsetWidth / 2)) + 'px';
    tip.style.top = Math.max(8, r.top - tip.offsetHeight - 8) + 'px';
  });
}
// can this phone write stats? (no = the database rules haven't been published yet)
async function dashRulesOk() {
  try { const r = await fetch(TRACK_URL + '.json', { method: 'PATCH', body: JSON.stringify({ [`d/${todayKey()}/${Track.id()}/s`]: { '.sv': { increment: 0 } } }) }); return r.ok; } catch (_) { return null; }
}
async function dashLogin(err) {
  const el = go(`<div class="topbar"><button class="icon-btn" data-act="home">${ico('back', 20)}</button><h2 class="d grow">Analytics</h2></div>
    <div class="dz-card" id="s1"><h4>Step 1 · Database rules</h4><p class="mute" style="font-weight:600;margin:0">Checking…</p></div>
    <div class="dz-card"><h4>Step 2 · Your database secret</h4>
      <p class="mute" style="font-weight:600;font-size:13.5px;margin:0 0 10px">Firebase console → your project → gear icon → <b>Project settings</b> → <b>Service accounts</b> tab → <b>Database secrets</b> → <b>Show</b>. Copy it and paste it here. It's saved on this phone only.</p>
      <input class="field" id="sec" type="password" autocomplete="off" placeholder="Paste the secret" value="${esc(DASH.secret())}" style="width:100%">
      <p class="auth-msg" id="msg">${err ? esc(err) : ''}</p>
      <button class="btn primary" id="go" style="width:100%">Open analytics</button></div>`);
  $('#go', el).addEventListener('click', async () => {
    const v = $('#sec', el).value.trim(), m = $('#msg', el);
    if (!v) { m.textContent = 'Paste the secret first.'; return; }
    m.style.color = 'var(--ink2)'; m.textContent = 'Checking…';
    try {
      const r = await fetch(`${TRACK_URL}.json?shallow=true&auth=${encodeURIComponent(v)}`);
      if (r.status === 401 || r.status === 403) { m.style.color = 'var(--red)'; m.textContent = "That secret didn't work. Copy it again from Database secrets (the whole thing, no spaces)."; return; }
      if (!r.ok) throw new Error();
    } catch (_) { m.style.color = 'var(--red)'; m.textContent = "Couldn't reach the database. Check your internet."; return; }
    try { localStorage.setItem('clutch_dash', v); } catch (_) {}
    StatsDash();
  });
  const ok = await dashRulesOk();
  const s1 = $('#s1', el); if (!s1 || !s1.isConnected) return;
  if (ok) { s1.innerHTML = `<h4>Step 1 · Database rules</h4><p style="margin:0;font-weight:700;color:var(--mint)">${ico('check', 16)} Done. Stats are being recorded.</p>`; return; }
  s1.innerHTML = `<h4>Step 1 · Database rules</h4>
    <p class="mute" style="font-weight:600;font-size:13.5px;margin:0 0 10px">${ok === null ? "Couldn't check (offline?)." : '<b style="color:var(--red)">Not done yet</b>, so no stats are being saved.'} Tap <b>Copy rules</b>, then in the Firebase console open <b>Realtime Database</b> → <b>Rules</b> tab, delete everything in the box, paste, and tap <b>Publish</b>.</p>
    <div class="two"><button class="btn primary" id="cp">Copy rules</button><button class="btn" id="re">Check again</button></div>`;
  $('#cp', s1).addEventListener('click', async () => {
    try { const t = await (await fetch('firebase-rules.json', { cache: 'no-store' })).text(); await navigator.clipboard.writeText(t); toast('Rules copied. Paste them in Firebase'); }
    catch (_) { toast("Couldn't copy. Open firebase-rules.json on GitHub instead"); }
  });
  $('#re', s1).addEventListener('click', () => dashLogin());
}
