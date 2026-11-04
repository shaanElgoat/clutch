'use strict';
// OBJECTIVES: things to do that pay out packs. Three daily ones (new every midnight), three weekly ones
// (new every Monday, same week as Rivals) and a list of forever milestones you can only claim once.
// Games report what happened with Obj.hit(event, amount); forever ones read your all-time stats.

const OBJ_DAILY = [
  { id: 'd_season', ev: 'season', n: 1, t: 'Finish a Season', ic: 'ball' },
  { id: 'd_wins', ev: 'sgw', n: 12, t: 'Win 12 games in Seasons', ic: 'flame' },
  { id: 'd_daily', ev: 'daily', n: 1, t: 'Play the Daily Draft', ic: 'calendar' },
  { id: 'd_puzzle', ev: 'puzzle', n: 2, t: 'Finish 2 daily puzzles', ic: 'grid' },
  { id: 'd_gameday', ev: 'gameday', n: 1, t: 'Play a Gameday', ic: 'clipboard' },
  { id: 'd_hl', ev: 'hl', n: 6, max: true, t: "Get a streak of 6 in Who's Better?", ic: 'scale' },
  { id: 'd_kick', ev: 'kick', n: 5, max: true, t: 'Make 5 kicks in one Kick It run', ic: 'goalpost' },
  { id: 'd_rivals', ev: 'rivals', n: 2, t: 'Play 2 Rivals games', ic: 'shield' },
  { id: 'd_clutch', ev: 'clutch', n: 1, t: 'Win a Clutch Call', ic: 'clock' },
  { id: 'd_duel', ev: 'duelg', n: 2, t: 'Play 2 Draft Duel games', ic: 'users' },
];
const OBJ_WEEKLY = [
  { id: 'w_seasons', ev: 'season', n: 5, t: 'Finish 5 Seasons', ic: 'ball' },
  { id: 'w_playoffs', ev: 'playoffs', n: 3, t: 'Make the playoffs 3 times', ic: 'ticket' },
  { id: 'w_ring', ev: 'ring', n: 1, t: 'Win a Super Bowl', ic: 'ring' },
  { id: 'w_rivals', ev: 'rivalsw', n: 7, t: 'Win 7 Rivals games', ic: 'shield' },
  { id: 'w_gd', ev: 'gdwin', n: 3, t: 'Win 3 Gamedays', ic: 'clipboard' },
  { id: 'w_puzzle', ev: 'puzzle', n: 10, t: 'Finish 10 daily puzzles', ic: 'grid' },
  { id: 'w_clutch', ev: 'clutch', n: 5, t: 'Win 5 Clutch Calls', ic: 'clock' },
  { id: 'w_duel', ev: 'duelw', n: 1, t: 'Win a Draft Duel series', ic: 'sword' },
  { id: 'w_cap', ev: 'capw', n: 4, t: 'Win 4 Salary Cap playoff games', ic: 'coin' },
];
const club0 = () => Store.data.club || { top: 10 };
const OBJ_FOREVER = [
  { id: 'f_season1', t: 'Finish your first Season', ic: 'ball', n: 1, v: (s) => s.played, pack: 'std' },
  { id: 'f_gd1', t: 'Win a Gameday', ic: 'clipboard', n: 1, v: (s) => s.gdWins, pack: 'std' },
  { id: 'f_ring1', t: 'Win your first Super Bowl', ic: 'ring', n: 1, v: (s) => s.champs, pack: 'pro' },
  { id: 'f_season10', t: 'Finish 10 Seasons', ic: 'ball', n: 10, v: (s) => s.played, pack: 'pro' },
  { id: 'f_clutch10', t: 'Win 10 Clutch Calls', ic: 'clock', n: 10, v: (s) => s.clutchW, pack: 'pro' },
  { id: 'f_coll100', t: 'Collect 100 cards', ic: 'cards', n: 100, v: () => Object.keys(Store.data.coll).length, pack: 'pro' },
  { id: 'f_div5', t: 'Reach Rivals Division 5', ic: 'shield', n: 1, v: () => (club0().top <= 5 ? 1 : 0), pack: 'pro' },
  { id: 'f_lvl10', t: 'Reach level 10', ic: 'star', n: 10, v: () => levelOf(Store.data.xp), pack: 'pro' },
  { id: 'f_hl15', t: "Streak of 15 in Who's Better?", ic: 'scale', n: 15, v: (s) => s.hlBest, pack: 'pro' },
  { id: 'f_drill5', t: 'Win 5 Two-Minute Drills', ic: 'timer', n: 5, v: (s) => s.drillWins, pack: 'pro' },
  { id: 'f_gd10', t: 'Win 10 Gamedays', ic: 'clipboard', n: 10, v: (s) => s.gdWins, pack: 'pro' },
  { id: 'f_mp', t: 'Win an online or party game', ic: 'globe', n: 1, v: (s) => s.mpWins, pack: 'pro' },
  { id: 'f_ring5', t: 'Win 5 Super Bowls', ic: 'ring', n: 5, v: (s) => s.champs, pack: 'leg' },
  { id: 'f_p17', t: 'Go 17-0 in the regular season', ic: 'flame', n: 1, v: (s) => s.perfectReg, pack: 'leg' },
  { id: 'f_season50', t: 'Finish 50 Seasons', ic: 'ball', n: 50, v: (s) => s.played, pack: 'leg' },
  { id: 'f_coll300', t: 'Collect 300 cards', ic: 'cards', n: 300, v: () => Object.keys(Store.data.coll).length, pack: 'leg' },
  { id: 'f_shark', t: 'Beat The Shark in a Draft Duel', ic: 'sword', n: 1, v: (s) => s.duelShark || 0, pack: 'leg' },
  { id: 'f_cap', t: 'Win the Super Bowl in Salary Cap', ic: 'crown', n: 1, v: (s) => ((s.capBest || 0) >= 4 ? 1 : 0), pack: 'leg' },
  { id: 'f_lvl25', t: 'Reach level 25', ic: 'star', n: 25, v: () => levelOf(Store.data.xp), pack: 'leg' },
  { id: 'f_perfect', t: 'Win it all without losing a game', ic: 'crown', n: 1, v: (s) => s.perfect, pack: 'icon' },
  { id: 'f_div1', t: 'Reach Rivals Division 1', ic: 'trophy', n: 1, v: () => (club0().top <= 1 ? 1 : 0), pack: 'icon' },
];
const OBJ_PACK = { d: 'std', w: 'pro' };
const packById = (id) => PACKS.find((p) => p.id === id);

const Obj = {
  // the save: d/w = this day's/week's picks with progress (p) and claimed (c); f = claimed forever ids
  data() {
    const d = Store.data;
    if (!d.obj) d.obj = { d: {}, w: {}, f: {}, seen: {}, packs: [] };
    const o = d.obj, dk = todayKey(), wk = seasonKey();
    if (o.d.k !== dk) o.d = { k: dk, ids: Obj.pick(OBJ_DAILY, 'od:' + dk), p: {}, c: {} };
    if (o.w.k !== wk) o.w = { k: wk, ids: Obj.pick(OBJ_WEEKLY, 'ow:' + wk), p: {}, c: {} };
    return o;
  },
  pick(pool, seed) { return TE.shuffle(TE.rng(seed), pool.map((x) => x.id)).slice(0, 3); },
  list(kind) {
    const o = Obj.data(), s = Store.data.stats;
    if (kind === 'f') {
      return OBJ_FOREVER.filter((x) => !o.f[x.id]).map((x) => ({ ...x, kind, prog: Math.min(x.n, x.v(s) || 0) }));
    }
    const pool = kind === 'd' ? OBJ_DAILY : OBJ_WEEKLY, b = o[kind];
    return b.ids.map((id) => pool.find((x) => x.id === id)).filter(Boolean)
      .map((x) => ({ ...x, kind, pack: OBJ_PACK[kind], prog: Math.min(x.n, b.p[x.id] || 0), claimed: !!b.c[x.id] }));
  },
  all() { return [...Obj.list('d'), ...Obj.list('w'), ...Obj.list('f')]; },
  ready() { return Obj.all().filter((x) => !x.claimed && x.prog >= x.n).length; },
  // a game reports something happened (amount = how many, or the best value for "max" objectives)
  hit(ev, amt) {
    if (amt === undefined) amt = 1;
    const o = Obj.data();
    ['d', 'w'].forEach((k) => {
      const pool = k === 'd' ? OBJ_DAILY : OBJ_WEEKLY, b = o[k];
      b.ids.forEach((id) => {
        const x = pool.find((y) => y.id === id);
        if (!x || x.ev !== ev) return;
        const was = b.p[id] || 0;
        b.p[id] = x.max ? Math.max(was, amt) : was + amt;
        if (was < x.n && b.p[id] >= x.n) Obj.done(x);
      });
    });
    Store.save();
    setTimeout(Obj.checkForever, 50);
  },
  // forever milestones read your stats, so tell the player the first time one is ready
  checkForever() {
    const o = Obj.data();
    Obj.list('f').forEach((x) => { if (x.prog >= x.n && !o.seen[x.id]) { o.seen[x.id] = 1; Obj.done(x); } });
    Store.save();
  },
  done(x) { setTimeout(() => banner(ico('gift', 24), 'Objective complete', x.t), 1600); },
  claim(kind, id) {
    const o = Obj.data(), x = Obj.list(kind).find((y) => y.id === id);
    if (!x || x.claimed || x.prog < x.n) return null;
    if (kind === 'f') o.f[id] = Date.now(); else o[kind].c[id] = 1;
    o.packs.push(x.pack);
    Store.save();
    return packById(x.pack);
  },
};

// time left until midnight, for the daily list
function dayLeft() {
  const n = new Date(), e = new Date(n); e.setHours(24, 0, 0, 0);
  const ms = e - n, h = Math.floor(ms / 36e5), m = Math.floor(ms / 6e4) % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function Objectives() {
  App.g = null;
  const o = Obj.data();
  const row = (x) => {
    const done = x.prog >= x.n, P = packById(x.pack);
    return `<div class="obj ${x.claimed ? 'claimed' : done ? 'done' : ''}">
      <div class="mc-ic ${done ? 'mint' : x.kind === 'f' ? 'violet' : x.kind === 'w' ? 'orange' : 'blue'}">${ico(x.claimed ? 'check' : x.ic, 20)}</div>
      <div class="grow"><b>${esc(x.t)}</b>
        <div class="obj-bar"><i style="width:${Math.round((x.prog / x.n) * 100)}%"></i></div>
        <small>${x.claimed ? 'Claimed' : `${x.prog}/${x.n}`}</small></div>
      ${x.claimed ? '' : done ? `<button class="btn primary small" data-claim="${x.kind}:${x.id}">Claim</button>` : `<span class="obj-pack" style="background:${P.grad}" title="${P.name} pack">${P.name}</span>`}
    </div>`;
  };
  const inv = o.packs.length;
  const forever = Obj.list('f').sort((a, b) => (b.prog >= b.n) - (a.prog >= a.n) || b.prog / b.n - a.prog / a.n);
  const el = go(`
    ${clubSeg('goals')}
    ${inv ? `<button class="free-pack" data-act="packs"><div class="fp-ic">${ico('pack', 28)}</div><div class="grow"><b>${inv} pack${inv > 1 ? 's' : ''} to open</b><small>Your rewards are waiting in Packs.</small></div><span class="chip on">Open</span></button>` : ''}
    <div class="group-title row-title"><span>Daily · ${packById('std').name} pack each</span><span class="mute">${ico('clock', 12)} ${dayLeft()}</span></div>
    <div class="objs">${Obj.list('d').map(row).join('')}</div>
    <div class="group-title row-title"><span>Weekly · ${packById('pro').name} pack each</span><span class="mute">${ico('clock', 12)} ${seasonLeft()}</span></div>
    <div class="objs">${Obj.list('w').map(row).join('')}</div>
    <div class="group-title row-title"><span>Forever</span><span class="mute">${OBJ_FOREVER.length - forever.length}/${OBJ_FOREVER.length} done</span></div>
    <div class="objs">${forever.length ? forever.map(row).join('') : '<p class="mute center" style="font-weight:700">Every milestone claimed. Legend.</p>'}</div>
    <p class="mute center" style="font-weight:600;font-size:12.5px;margin:14px 8px 0;line-height:1.5">Forever objectives can only be claimed once. Daily ones change at midnight, weekly ones every Monday.</p>`, 'has-tabs');
  tabbar('club');
  $$('[data-claim]', el).forEach((b) => b.addEventListener('click', () => {
    const [k, id] = b.dataset.claim.split(':');
    const P = Obj.claim(k, id);
    if (!P) return;
    Sfx.achievement(); const r = b.getBoundingClientRect(); if (typeof burst === 'function') burst(r.left + r.width / 2, r.top + r.height / 2, 18); toast(`${P.name} pack added. Open it in Packs`);
    Objectives();
  }));
  return el;
}
