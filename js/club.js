'use strict';
// MY CLUB: build a lineup from cards you own (stars = +1 rating each) and climb the Rivals ladder.
// Your division lasts the whole month; rewards are paid every week.
const DIV_NAMES = { 10: 'Walk-on', 9: 'Practice Squad', 8: 'Rookie', 7: 'Starter', 6: 'Veteran', 5: 'Pro Bowl', 4: 'All-Pro', 3: 'Elite', 2: 'Legend', 1: 'Hall of Fame' };
const divName = (d) => DIV_NAMES[d] || 'Walk-on';
// ---- Rivals: your division carries on all month (everyone restarts in Division 10 on the 1st), but
// you're paid every week (Monday to Sunday) for the best division you reached that week.
const SEASON_COINS = { 1: 5000, 2: 3500, 3: 2500, 4: 1800, 5: 1200, 6: 800, 7: 500, 8: 300, 9: 150, 10: 50 };
// a season is keyed by the date of its Monday, e.g. 'W2026-11-02'
function weekStart(d) { d = d ? new Date(d) : new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
const seasonKey = (d) => 'W' + todayKey(weekStart(d));
const seasonName = (k) => {
  if (k[0] !== 'W') return new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }); // older monthly seasons
  const [y, m, dd] = k.slice(1).split('-').map(Number);
  return 'Week of ' + new Date(y, m - 1, dd).toLocaleString('en-US', { month: 'short', day: 'numeric' });
};
// the ladder resets on the 1st of every month, plus any one-off resets listed here
const LADDER_RESETS = [new Date(2026, 10, 6).getTime()]; // midnight Nov 6 2026: everyone back to Division 10
function ladderKey(d) {
  d = d || new Date();
  const t = d.getTime(), m = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const extra = LADDER_RESETS.filter((x) => t >= x && todayKey(new Date(x)).slice(0, 7) === m).length;
  return 'M' + m + (extra ? 'r' + extra : '');
}
function leftText(ms) { const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60; return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; }
function ladderLeft() {
  const n = new Date(), next = new Date(n.getFullYear(), n.getMonth() + 1, 1).getTime();
  const soon = LADDER_RESETS.filter((x) => x > n.getTime()).concat(next);
  return leftText(Math.min(...soon) - n.getTime());
}
function seasonLeft() {
  const n = new Date(), end = weekStart(n); end.setDate(end.getDate() + 7);
  const ms = end - n;
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60;
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}
function clubData() {
  if (!Store.data.club) Store.data.club = { xi: new Array(TE.SLOTS).fill(null), div: 10, pts: 0, w: 0, l: 0, top: 10 };
  const c = Store.data.club;
  // drop cards you somehow no longer own
  c.xi = c.xi.map((pid) => (pid !== null && Store.data.coll[pid] ? pid : null));
  const now = seasonKey();
  if (!c.season) Object.assign(c, { season: now, sw: 0, sl: 0, sbest: c.div });
  if (c.season[0] !== 'W') { c.season = now; Store.save(); }
  if (c.season !== now) {
    // week over: bank the reward for your best division (only if you played). Your division stays.
    if (c.sw + c.sl > 0) c.seasonEnd = { season: c.season, best: c.sbest, coins: SEASON_COINS[c.sbest] || 50 };
    Object.assign(c, { season: now, sw: 0, sl: 0, sbest: c.div });
    Store.save();
  }
  // clubs from before monthly ladders belong to the ladder that was running then
  if (!c.ladder) c.ladder = 'M2026-11';
  const lk = ladderKey();
  if (c.ladder !== lk) {
    // new ladder: everyone back to Division 10 (this week's best still counts for the weekly reward)
    if (c.div < 10 || c.pts) c.notice = 'reset';
    Object.assign(c, { ladder: lk, div: 10, pts: 0, match: null, next: null, safe: 0 });
    Store.save();
  }
  return c;
}
function ladderNotice() {
  const c = clubData();
  c.notice = null; Store.save();
  modal(`<div class="center"><div class="intro-ic" style="margin:0 auto 10px;background:linear-gradient(135deg,#5b8cff,#2f5ef0)">${ico('shield', 28)}</div>
    <h2 class="d">New Rivals ladder</h2><p>Everyone is back in <b>Division 10</b>. Your division now lasts the whole month, and you still get paid every week.</p>
    <p class="mute" style="font-weight:600;font-size:13px">Heads up: every division up is a lot tougher now.</p></div>
    <button class="btn primary big" data-close style="margin-top:6px">Let's climb</button>`, null, 'sheet');
}
function claimSeasonEnd() {
  const c = clubData(), e = c.seasonEnd;
  if (!e) return;
  modal(`<div class="center"><div class="intro-ic" style="margin:0 auto 10px;background:linear-gradient(135deg,#ffcf4d,#ff9f1c)">${ico('trophy', 28)}</div>
    <h2 class="d">${esc(seasonName(e.season))} is over</h2>
    <p>Your best this week: <b>Division ${e.best}</b> (${esc(divName(e.best))}).</p>
    <div class="hero-card center" style="margin:10px 0"><b style="font-size:22px">${ico('coin', 20)} +${e.coins.toLocaleString()} coins</b></div>
    <p class="mute" style="font-weight:600;font-size:13px">A new week has started. Your division carries on: climb higher this week for a bigger reward.</p></div>
    <button class="btn primary big" id="claim" style="margin-top:6px">Claim</button>`, (bg) => {
    $('#claim', bg).addEventListener('click', () => {
      Store.data.coins += e.coins; c.seasonEnd = null; Store.save();
      bg.remove(); Sfx.trophy(); confetti(1400); toast(`+${e.coins.toLocaleString()} coins`); ClubScreen(); if (c.notice === 'reset') later(ladderNotice, 500);
    });
  }, 'sheet');
}
const clubReady = () => clubData().xi.every((x) => x !== null);
const ownedIds = () => Object.keys(Store.data.coll).map(Number);
const effRating = (pid, slot) => TE.PLAYERS[pid].r + cardLevel(pid) - (TE.fitPenalty(TE.PLAYERS[pid].pos, TE.LINEUP[slot].pos) || 0);

// best lineup from the binder: scarce positions first, no player twice
function autoBuildClub() {
  const c = clubData(), xi = new Array(TE.SLOTS).fill(null), used = new Set();
  const order = ['QB', 'K', 'HC', 'OL', 'TE', 'RB', 'S', 'LB', 'DL', 'CB', 'WR'];
  const slots = TE.LINEUP.map((s, i) => i).sort((a, b) => order.indexOf(TE.LINEUP[a].pos) - order.indexOf(TE.LINEUP[b].pos));
  const mine = ownedIds();
  slots.forEach((si) => {
    let best = null, bv = -99;
    mine.forEach((pid) => {
      if (used.has(TE.PLAYERS[pid].name) || TE.fitPenalty(TE.PLAYERS[pid].pos, TE.LINEUP[si].pos) === null) return;
      const v = effRating(pid, si);
      if (v > bv) { bv = v; best = pid; }
    });
    if (best !== null) { xi[si] = best; used.add(TE.PLAYERS[best].name); }
  });
  c.xi = xi; Store.save();
}

function ClubScreen() {
  App.g = null;
  const c = clubData();
  const mods = levelMods(c.xi);
  const prof = TE.teamProfile(c.xi, { mods });
  const filled = c.xi.filter((x) => x !== null).length;
  const el = go(`
    ${clubSeg('club')}
    <div class="club-hero" id="toRivals" role="button">
      <div class="ch-div"><small>Rivals</small><b>Division ${c.div}</b><span>${esc(divName(c.div))}</span>
        <div class="div-prog"><div class="dp-bar"><i style="width:${(Math.min(c.pts, divTarget(c.div)) / divTarget(c.div)) * 100}%"></i></div><span>${c.div === 1 ? `Cushion ${Math.min(c.pts, DIV1_CUSHION)}/${DIV1_CUSHION}` : `${c.pts}/${winsToPromote(c.div)} wins to promote`}${c.safe > 0 ? ` · ${ico('shield', 11)} ${c.safe} safe` : ''}</span></div>
        <div class="season-clock">${ico('coin', 13)} Reward in ${seasonLeft()} · ${ico('timer', 13)} Reset in ${ladderLeft()}</div></div>
      <div class="ch-rings"><div class="ring big" style="--p:${Math.max(0, Math.min(100, ((prof.ovr || 60) - 60) * 2.5))}%"><b>${filled ? Math.round(prof.ovr) : '–'}</b><small>OVR</small></div></div>
    </div>
    <div class="turf club-turf" id="cf">${FIELD_LINES}${fieldSlots(c.xi, { mods })}</div>
    <p class="mute center" style="font-weight:600;font-size:12.5px;margin:8px 0 0">Tap any spot to swap in a card you own. Each ★ is +1 rating.</p>
    <div class="actions">
      ${c.reward !== null && c.reward !== undefined ? `<button class="btn sun big" id="rwd">${ico('coin', 18)} Claim your ${PACKS[c.reward].cost.toLocaleString()} coin reward</button>` : ''}
      <button class="btn primary big" id="play" ${clubReady() ? '' : 'disabled'}>${ico('shield', 18)} ${!clubReady() ? `Fill all 12 spots (${filled}/12)` : c.match ? 'Rivals: finish your match' : 'Rivals'}</button>
      <div class="two"><button class="btn" id="auto">${ico('sparkle', 18)} Auto-build</button><button class="btn" id="gd" ${clubReady() ? '' : 'disabled'}>${ico('clipboard', 18)} Gameday</button></div>
      <div class="two">${filled < 12 ? `<button class="btn" data-act="packs">${ico('pack', 18)} Get cards</button>` : `<button class="btn" data-act="binder">${ico('cards', 18)} Binder</button>`}<button class="btn" id="sell">${ico('coin', 18)} Sell cards</button></div>
    </div>
    <div class="section-title">This season</div>
    <div class="stat-grid"><div class="stat"><div class="si mint">${ico('check', 18)}</div><b>${c.sw}</b><small>Wins</small></div><div class="stat"><div class="si pink">${ico('x', 18)}</div><b>${c.sl}</b><small>Losses</small></div><div class="stat"><div class="si violet">${ico('crown', 18)}</div><b>Div ${c.top}</b><small>All-time best</small></div></div>
    <div class="section-title">Weekly rewards</div>
    <div class="season-rw">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => `<div class="${d === c.sbest ? 'on' : ''}"><b>Div ${d}</b><small>${SEASON_COINS[d].toLocaleString()}</small></div>`).join('')}</div>
    <p class="mute center" style="font-weight:600;font-size:12px;margin:8px 0 0">Paid every Sunday night for the best division you reached that week. Your division only resets at the end of the month.</p>
    <p class="mute center" style="font-weight:600;font-size:12.5px;margin:12px 0 0">${ownedIds().length} cards owned</p>`, 'has-tabs');
  tipOnce('club');
  tabbar('club');
  // every slot opens your binder for that position
  TE.LINEUP.forEach((s, i) => {
    const slotEl = $(`#cf .slot[data-slot="${i}"]`, el);
    if (slotEl) { slotEl.style.cursor = 'pointer'; slotEl.addEventListener('click', () => editClubSlot(i)); }
  });
  $('#auto', el).addEventListener('click', () => { autoBuildClub(); Sfx.good(); ClubScreen(); });
  $('#sell', el).addEventListener('click', () => SellCards());
  const pb = $('#play', el); if (pb) pb.addEventListener('click', RivalsHub);
  $('#toRivals', el).addEventListener('click', () => (clubReady() ? RivalsHub() : toast('Fill all 12 spots first')));
  const rw = $('#rwd', el); if (rw) rw.addEventListener('click', openClubReward);
  const gb = $('#gd', el); if (gb) gb.addEventListener('click', () => GamedayOpp(clubData().xi, levelMods(clubData().xi)));
  // a finished season waits here until you claim it
  if (c.seasonEnd) later(claimSeasonEnd, 350);
  else if (c.notice === 'reset') later(ladderNotice, 350);
}
async function editClubSlot(i) {
  const c = clubData(), s = TE.LINEUP[i];
  const fits = (id) => TE.fitPenalty(TE.PLAYERS[id].pos, s.pos) !== null;
  // where a player (by name) already sits in the lineup, if anywhere
  const spotOf = (id) => c.xi.findIndex((x, k) => k !== i && x !== null && TE.PLAYERS[x].name === TE.PLAYERS[id].name);
  const list = ownedIds().filter(fits).sort((a, b) => effRating(b, i) - effRating(a, i));
  const cur = c.xi[i];
  const pid = await pickPlayer({
    title: `Your ${TE.POS_NAME[s.pos].toLowerCase()}s`, sub: s.pos === 'HC' || s.pos === 'K' ? '' : 'Players out of position lose a few rating points.',
    initial: list.slice(0, 80), filter: (id) => !!Store.data.coll[id] && fits(id), stars: true, mods: levelMods(list),
    exclude: (id) => (id === cur ? 'in this spot now' : null),
    note: (id) => { const k = spotOf(id); return k < 0 ? null : `swaps with your ${TE.LINEUP[k].label}`; },
    topAction: cur !== null ? { label: 'Remove from lineup', sub: `Take ${TE.PLAYERS[cur].name} out and leave the ${s.label} spot empty`, icon: 'x' } : null,
    emptyText: `You don't own a card that can play ${s.label} yet. Open packs to get one.`,
  });
  if (pid === null) return;
  if (pid === -1) { c.xi[i] = null; Store.save(); Sfx.tap(); toast(`${TE.PLAYERS[cur].name} is out of the lineup`); return ClubScreen(); }
  // moving a player who's already in the lineup: swap the two (or leave his old spot empty if this one can't play there)
  const k = spotOf(pid);
  if (k >= 0) c.xi[k] = cur !== null && TE.fitPenalty(TE.PLAYERS[cur].pos, TE.LINEUP[k].pos) !== null ? cur : null;
  c.xi[i] = pid; Store.save(); Sfx.place();
  ClubScreen();
}

// ---- Rivals ladder: Division 10 needs 7 wins to go up, and every division above needs one more.
// Losses never cost progress, but each division brings a tougher opponent (a better roster plus a boost).
const RIVALS_DIV = {
  10: { q: 0.35, boost: -1 }, 9: { q: 0.42, boost: -0.2 }, 8: { q: 0.5, boost: 0.6 }, 7: { q: 0.6, boost: 1.5 }, 6: { q: 0.7, boost: 2.4 },
  5: { q: 0.78, boost: 3.3 }, 4: { q: 0.85, boost: 4.2 }, 3: { q: 0.9, boost: 5.1 }, 2: { q: 0.95, boost: 6 }, 1: { q: 0.99, boost: 6.9 },
};
const winsToPromote = (div) => 17 - div; // 10 -> 7, 9 -> 8, ... 2 -> 15
// a win is +1, a loss is -1; a loss at 0 drops you a division (Division 10 is the floor).
// Checkpoint: after every promotion you can't drop for a few games (more in the lower divisions).
const SAFE_GAMES = { 9: 5, 8: 5, 7: 4, 6: 4, 5: 3, 4: 3, 3: 2, 2: 2, 1: 2 };
const DIV1_CUSHION = 5; // Division 1 has no promotion: your points are a cushion against dropping
const divTarget = (div) => (div === 1 ? DIV1_CUSHION : winsToPromote(div));
// what the next game means, in plain words
function rivalsOutlook(c) {
  const need = divTarget(c.div), p = Math.min(c.pts, need);
  const win = c.div === 1 ? (p + 1 >= need ? 'Your cushion is full. You hold the top division.' : `Cushion goes up to ${p + 1}/${need}.`)
    : p + 1 >= need ? `You're promoted to Division ${c.div - 1}!` : `${p + 1}/${need} wins. ${need - p - 1} more to move up.`;
  let lose, tone;
  if (c.div === 10) { lose = "Division 10 is the floor. You can't drop."; tone = 'safe'; }
  else if (c.safe > 0) { lose = `Checkpoint: ${c.safe} protected game${c.safe === 1 ? '' : 's'} left, so you can't drop.${p > 0 ? ` Progress goes to ${p - 1}/${need}.` : ''}`; tone = 'safe'; }
  else if (p > 0) { lose = `You lose 1 ${c.div === 1 ? 'point of cushion' : 'win of progress'} (${p - 1}/${need}). You won't drop.`; tone = 'warn'; }
  else { lose = `You drop to Division ${c.div + 1}.`; tone = 'danger'; }
  return { win, lose, tone, need, p };
}
function rivalsOpponent(div, seed) {
  const sorted = TE.CUR_SQ.slice().sort((a, b) => TE.squadStrength(a) - TE.squadStrength(b));
  const r = TE.rng(seed);
  const D = RIVALS_DIV[div] || RIVALS_DIV[10];
  const k = Math.max(0, Math.min(sorted.length - 1, Math.floor(D.q * sorted.length + (r() - 0.5) * 3)));
  const base = TE.squadTeam(sorted[k]);
  const boost = D.boost; // higher divisions bring better rosters, souped up
  if (!boost) return base; // (negative boosts soften the lower divisions)
  const prof = Object.assign({}, base.prof, { off: base.prof.off + boost, def: base.prof.def + boost, ovr: base.prof.ovr + boost });
  return Object.assign({}, base, { prof, name: base.name + '+' });
}
function RivalsHub() {
  App.g = null;
  const c = clubData();
  if (!clubReady()) { toast('Fill all 12 spots in My Club first'); return ClubScreen(); }
  // the next opponent is picked now so you can see who you'll face (it doesn't count until you play)
  if (!c.match && (!c.next || c.next.div !== c.div)) { c.next = { seed: 'rv:' + rid(), div: c.div }; Store.save(); }
  const nx = c.match || c.next, opp = rivalsOpponent(nx.div, nx.seed), oc = teamColors(opp);
  const me = TE.teamProfile(c.xi, { mods: levelMods(c.xi) });
  const o = rivalsOutlook(c);
  const el = go(`
    <div class="topbar"><button class="icon-btn" id="back">${ICON.back}</button><div class="grow"><h2 class="d">Rivals</h2><div class="mute" style="font-weight:700;font-size:12px">Reward in ${seasonLeft()} · Reset in ${ladderLeft()}</div></div><span class="pill">${c.sw}-${c.sl}</span></div>
    <div class="rv-hero">
      <div class="rv-badge"><small>Division</small><b>${c.div}</b></div>
      <div class="grow"><b class="rv-name">${esc(divName(c.div))}</b>
        <span class="rv-sub">${c.div === 1 ? 'The top division. Keep your cushion up.' : `${o.need - o.p} win${o.need - o.p === 1 ? '' : 's'} to reach Division ${c.div - 1}`}</span>
        ${c.safe > 0 ? `<span class="rv-safe">${ico('shield', 13)} Checkpoint · ${c.safe} safe game${c.safe === 1 ? '' : 's'}</span>` : ''}</div>
    </div>
    <div class="rv-track">${Array.from({ length: o.need }, (_, i) => `<i class="${i < o.p ? 'on' : ''} ${i === o.p ? 'next' : ''}"></i>`).join('')}</div>
    <div class="rv-track-l"><span>${c.div === 1 ? 'Cushion' : 'Progress'} ${o.p}/${o.need}</span><span>${c.div === 1 ? 'Top division' : 'Division ' + (c.div - 1)}</span></div>

    <div class="rv-if">
      <div class="rv-card win"><small>${ico('check', 13)} If you win</small><b>${esc(o.win)}</b></div>
      <div class="rv-card ${o.tone}"><small>${ico(o.tone === 'danger' ? 'bolt' : o.tone === 'safe' ? 'shield' : 'x', 13)} If you lose</small><b>${esc(o.lose)}</b></div>
    </div>

    <div class="group-title">Next opponent</div>
    <div class="vs"><div class="side"><div class="helmbig">${myTeamHelm()}</div><b>My Club</b><span>OVR ${Math.round(me.ovr)}</span></div><div class="x">VS</div>
      <div class="side"><div class="helmbig">${helmet(oc.c1, oc.c2, true)}</div><b>${esc(opp.name)}</b><span>OVR ${Math.round(opp.prof.ovr)}</span></div></div>
    <button class="btn hot big" id="play">${ico('play', 18)} ${c.match ? 'Finish your match' : 'Play match'}</button>

    <div class="group-title">The ladder</div>
    <div class="rv-ladder">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => `<div class="rv-rung ${d === c.div ? 'me' : d > c.div ? 'past' : ''}"><b>${d}</b><span class="grow">${esc(divName(d))}${d === c.div ? ' <em>you</em>' : ''}</span><small>${d === 1 ? 'Top' : winsToPromote(d) + ' wins'}</small><small class="c">${ico('coin', 12)} ${SEASON_COINS[d].toLocaleString()}</small></div>`).join('')}</div>

    <div class="group-title">How it works</div>
    <div class="hero-card rv-rules">
      <p><b>Win</b> +1, <b>lose</b> −1. Fill the bar to move up a division.</p>
      <p>Lose with an empty bar and you <b>drop a division</b>. Division 10 is the floor.</p>
      <p><b>Checkpoints:</b> after a promotion you can't drop for 2–5 games (more in the lower divisions).</p>
      <p><b>Every week</b> (Sunday night) you're paid for the <b>best division</b> you reached that week.</p>
      <p>Your division <b>carries on all month</b>. On the 1st, everyone restarts in Division 10.</p>
      <p>Every division up is <b>much tougher</b>: you'll need a stronger club (better cards, more ★) to keep climbing.</p>
    </div>`);
  $('#back', el).addEventListener('click', () => { App.clubSeg = 'club'; goTab('club'); });
  $('#play', el).addEventListener('click', rivalsMatch);
}
function rivalsMatch() {
  const c = clubData();
  // the match is locked in when it starts, so leaving can't re-roll a loss
  if (!c.match) { c.match = c.next && c.next.div === c.div ? c.next : { seed: 'rv:' + rid(), div: c.div }; c.next = null; Store.save(); }
  const seed = c.match.seed, opp = rivalsOpponent(c.match.div, seed);
  const user = { name: myName(), xi: c.xi, mods: levelMods(c.xi) };
  playLiveMatch({ title: 'Rivals · Division ' + c.match.div, badge: 'Rivals · Division ' + c.match.div, user, opp, seed, po: false, onDone: (r, el) => rivalsResult(r, el) });
}
function rivalsResult(r, el) {
  const c = clubData();
  if (!c.match) return; // already counted
  c.match = null;
  let promo = null, drop = null;
  const before = { div: c.div, pts: c.pts };
  const shielded = (c.safe || 0) > 0;
  c.safe = Math.max(0, (c.safe || 0) - 1); // every game uses up a protected game
  const need = divTarget(c.div);
  if (r.win) {
    c.w++; c.sw++;
    c.pts = Math.min(need, c.pts + 1);
    if (c.div > 1 && c.pts >= need) { c.div--; c.pts = 0; promo = c.div; c.safe = SAFE_GAMES[c.div] || 2; c.top = Math.min(c.top, c.div); c.sbest = Math.min(c.sbest, c.div); }
    addXP(45 + (10 - c.div) * 5); Sfx.crowd(true); Obj.hit('rivalsw');
  } else {
    c.l++; c.sl++;
    if (c.pts > 0) c.pts--;
    else if (!shielded && c.div < 10) { c.div++; drop = c.div; c.pts = Math.max(0, winsToPromote(c.div) - 2); }
    addXP(15); Sfx.groan();
  }
  Obj.hit('rivals');
  if (promo) Track.ev('promo', 'Div ' + promo);
  if (c.div <= 5) unlock('club5');
  if (c.div <= 1) unlock('club1');
  const reward = promo ? (promo <= 1 ? 2 : promo <= 4 ? 1 : 0) : null;
  if (reward !== null) c.reward = reward; // kept until opened
  Store.save();
  const t = divTarget(c.div);
  const line = promo ? `Promoted to Division ${promo}: ${esc(divName(promo))}! You're safe from dropping for ${c.safe} games.`
    : drop ? `Dropped to Division ${drop}. You start ${c.pts}/${t}, so a couple of wins gets you back up.`
    : r.win ? (c.div === 1 ? `Cushion ${c.pts}/${t}.` : `${before.pts} → ${c.pts}/${t} wins. ${t - c.pts} more to move up.`)
    : shielded && before.pts === 0 ? `Checkpoint saved you: no drop.${c.safe ? ` ${c.safe} safe game${c.safe === 1 ? '' : 's'} left.` : ' Your protection has run out.'}`
    : before.pts > 0 ? `${before.pts} → ${c.pts}/${t}. ${c.pts === 0 && c.div < 10 && !c.safe ? 'Careful: lose the next one and you drop.' : "You didn't drop."}`
    : `Still in Division ${c.div}.`;
  $('#after', el).innerHTML = `<div class="outcome ${r.win ? 'win' : 'loss'}" style="margin-top:12px"><h2>${r.win ? 'Win' : 'Loss'} ${r.us}–${r.them}</h2><p>${line}</p></div>
    ${promo ? `<div class="upgrade" style="margin-top:12px"><b>${ico('coin', 18)} Promotion reward: ${PACKS[reward].cost.toLocaleString()} coins</b><div class="mute" style="font-weight:600;font-size:13px">Enough for a ${PACKS[reward].name} pack.</div></div>` : ''}
    <div class="actions">${promo ? `<button class="btn primary" id="rw">${ico('coin', 18)} Claim ${PACKS[reward].cost.toLocaleString()} coins</button>` : `<button class="btn primary" id="hub">${ico('shield', 18)} Back to Rivals</button>`}<button class="btn" id="club">${ico('users', 18)} My Club</button></div>`;
  if (promo) { confetti(); Sfx.trophy(); $('#rw', el).addEventListener('click', () => { openClubReward(); RivalsHub(); }); }
  const hb = $('#hub', el); if (hb) hb.addEventListener('click', RivalsHub);
  $('#club', el).addEventListener('click', () => { App.clubSeg = 'club'; goTab('club'); });
}
function openClubReward() {
  const c = clubData();
  if (c.reward === null || c.reward === undefined) return;
  const amt = PACKS[c.reward].cost;
  c.reward = null; Store.data.coins += amt; Store.save();
  Sfx.coin(); toast(`+${amt.toLocaleString()} coins`);
  App.clubSeg = 'packs'; goTab('club');
}

// ---- selling: turn cards you don't need into a few coins. Prices are low on purpose (a card sells for
// a fraction of what a pack costs), and cards in your Club lineup are protected.
function SellCards(filt, q) {
  App.g = null;
  filt = filt || 'all'; q = q || '';
  const c = clubData(), inXI = new Set(c.xi.filter((x) => x !== null));
  const FILTS = [['all', 'All'], ['u80', 'Under 80'], ['80', '80–89'], ['90', '90+']];
  const ok = (p) => (filt === 'u80' ? p.r < 80 : filt === '80' ? p.r >= 80 && p.r < 90 : filt === '90' ? p.r >= 90 : true);
  const all = ownedIds().map((id) => TE.PLAYERS[id]).sort((a, b) => a.r - b.r || a.name.localeCompare(b.name));
  const list = all.filter((p) => ok(p) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
  const bulk = all.filter((p) => p.r < 80 && !inXI.has(p.id));
  const bulkCoins = bulk.reduce((a, p) => a + sellValue(p.id), 0);
  const el = go(`
    <div class="topbar"><button class="icon-btn" id="back">${ico('back', 20)}</button><h2 class="d grow">Sell cards</h2>${coinsChip()}</div>
    <p class="mute" style="font-weight:600;font-size:13px;margin:-4px 0 12px">Cards in your Club lineup can't be sold. Selling a card removes it (and its stars) from your binder.</p>
    ${bulk.length ? `<button class="free-pack" id="bulk"><div class="fp-ic">${ico('coin', 26)}</div><div class="grow"><b>Quick sell: everything under 80</b><small>${bulk.length} card${bulk.length > 1 ? 's' : ''} for ${bulkCoins.toLocaleString()} coins</small></div><span class="chip on">Sell</span></button>` : ''}
    <input class="field" id="q" placeholder="Search your cards" value="${esc(q)}" style="width:100%;margin-bottom:10px">
    <div class="chips" style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">${FILTS.map(([id, l]) => `<button class="chip ${id === filt ? 'on' : ''}" data-f="${id}">${l}</button>`).join('')}</div>
    <div class="sell-list">${list.length ? list.slice(0, 150).map((p) => {
      const lock = inXI.has(p.id), lv = cardLevel(p.id);
      return `<div class="sell-row"><span class="sr-ovr ${tierOf(p.r)}">${p.r}</span><div class="grow"><b>${esc(p.name)}${lv ? ` <span class="sr-st">${'★'.repeat(lv)}</span>` : ''}</b><small>${p.pos} · ${esc(TE.DATA.TEAMS[p.team].short)} · ${TE.eraTag(p.era)}</small></div>
        ${lock ? `<span class="lmeta">${ico('lock', 12)} Lineup</span>` : `<button class="btn small" data-sell="${p.id}">${ico('coin', 14)} ${sellValue(p.id)}</button>`}</div>`;
    }).join('') : '<p class="mute center" style="font-weight:700">No cards here.</p>'}</div>`);
  $('#back', el).addEventListener('click', () => { App.clubSeg = 'club'; goTab('club'); });
  $$('[data-f]', el).forEach((b) => b.addEventListener('click', () => SellCards(b.dataset.f, $('#q', el).value)));
  let t = null;
  $('#q', el).addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { SellCards(filt, e.target.value); const i = $('#q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); });
  const sell = (ids) => {
    const coins = ids.reduce((a, id) => a + sellValue(id), 0);
    ids.forEach((id) => { delete Store.data.coll[id]; });
    Store.data.coins += coins; Store.save();
    Sfx.coin(); toast(`Sold for ${coins.toLocaleString()} coins`);
    SellCards(filt, q);
  };
  $$('[data-sell]', el).forEach((b) => b.addEventListener('click', () => {
    const id = +b.dataset.sell, p = TE.PLAYERS[id];
    modal(`<div class="center">${pcard(id, { stars: cardLevel(id) })}</div><h2 class="d center" style="margin-top:12px">Sell ${esc(p.name)}?</h2>
      <p class="center mute" style="font-weight:600">You get <b>${sellValue(id)} coins</b>. The card leaves your binder.</p>
      <div class="actions two"><button class="btn" data-close>Keep</button><button class="btn hot" id="ok">Sell</button></div>`, (bg) => { $('#ok', bg).addEventListener('click', () => { bg.remove(); sell([id]); }); });
  }));
  const bb = $('#bulk', el);
  if (bb) bb.addEventListener('click', () => modal(`<h2 class="d">Sell ${bulk.length} cards?</h2><p>Every card under 80 that isn't in your lineup goes, for <b>${bulkCoins.toLocaleString()} coins</b>.</p>
    <div class="actions two"><button class="btn" data-close>Cancel</button><button class="btn hot" id="ok">Sell all</button></div>`, (bg) => { $('#ok', bg).addEventListener('click', () => { bg.remove(); sell(bulk.map((p) => p.id)); }); }));
  return el;
}
