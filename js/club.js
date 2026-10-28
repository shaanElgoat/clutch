'use strict';
// MY CLUB: build a lineup from cards you own (stars = +1 rating each) and climb the Rivals ladder, one season per month.
const DIV_NAMES = { 10: 'Walk-on', 9: 'Practice Squad', 8: 'Rookie', 7: 'Starter', 6: 'Veteran', 5: 'Pro Bowl', 4: 'All-Pro', 3: 'Elite', 2: 'Legend', 1: 'Hall of Fame' };
const divName = (d) => DIV_NAMES[d] || 'Walk-on';
// ---- Rivals seasons: one per calendar month. When the month ends you're paid for the best
// division you reached, and everyone starts the new season back in Division 10.
const SEASON_COINS = { 1: 5000, 2: 3500, 3: 2500, 4: 1800, 5: 1200, 6: 800, 7: 500, 8: 300, 9: 150, 10: 50 };
const monthKey = (d) => todayKey(d).slice(0, 7);
const seasonName = (k) => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
function seasonLeft() {
  const n = new Date(), end = new Date(n.getFullYear(), n.getMonth() + 1, 1), ms = end - n;
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60;
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}
function clubData() {
  if (!Store.data.club) Store.data.club = { xi: new Array(TE.SLOTS).fill(null), div: 10, pts: 0, w: 0, l: 0, top: 10 };
  const c = Store.data.club;
  // drop cards you somehow no longer own
  c.xi = c.xi.map((pid) => (pid !== null && Store.data.coll[pid] ? pid : null));
  const now = monthKey();
  if (!c.season) Object.assign(c, { season: now, sw: 0, sl: 0, sbest: c.div });
  if (c.season !== now) {
    // season over: bank the reward (only if you played), then everyone resets to Division 10
    if (c.sw + c.sl > 0) c.seasonEnd = { season: c.season, best: c.sbest, coins: SEASON_COINS[c.sbest] || 50 };
    Object.assign(c, { season: now, div: 10, pts: 0, sw: 0, sl: 0, sbest: 10, match: null });
    Store.save();
  }
  return c;
}
function claimSeasonEnd() {
  const c = clubData(), e = c.seasonEnd;
  if (!e) return;
  modal(`<div class="center"><div class="intro-ic" style="margin:0 auto 10px;background:linear-gradient(135deg,#ffcf4d,#ff9f1c)">${ico('trophy', 28)}</div>
    <h2 class="d">${esc(seasonName(e.season))} is over</h2>
    <p>You finished the season in <b>Division ${e.best}</b> (${esc(divName(e.best))}).</p>
    <div class="hero-card center" style="margin:10px 0"><b style="font-size:22px">${ico('coin', 20)} +${e.coins.toLocaleString()} coins</b></div>
    <p class="mute" style="font-weight:600;font-size:13px">A new season has started. Everyone is back in Division 10. Climb again before the month ends.</p></div>
    <button class="btn primary big" id="claim" style="margin-top:6px">Claim</button>`, (bg) => {
    $('#claim', bg).addEventListener('click', () => {
      Store.data.coins += e.coins; c.seasonEnd = null; Store.save();
      bg.remove(); Sfx.trophy(); confetti(1400); toast(`+${e.coins.toLocaleString()} coins`); ClubScreen();
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
    <div class="club-hero">
      <div class="ch-div"><small>Rivals · ${esc(seasonName(c.season))}</small><b>Division ${c.div}</b><span>${esc(divName(c.div))}</span>
        ${c.div === 1 ? '<div class="div-prog"><span>Top division</span></div>' : `<div class="div-prog"><div class="dp-bar"><i style="width:${(Math.min(c.pts, winsToPromote(c.div)) / winsToPromote(c.div)) * 100}%"></i></div><span>${c.pts}/${winsToPromote(c.div)} wins to promote</span></div>`}
        <div class="season-clock">${ico('timer', 13)} Season ends in ${seasonLeft()}</div></div>
      <div class="ch-rings"><div class="ring big" style="--p:${Math.max(0, Math.min(100, ((prof.ovr || 60) - 60) * 2.5))}%"><b>${filled ? Math.round(prof.ovr) : '–'}</b><small>OVR</small></div></div>
    </div>
    <div class="turf club-turf" id="cf">${FIELD_LINES}${fieldSlots(c.xi, { mods })}</div>
    <p class="mute center" style="font-weight:600;font-size:12.5px;margin:8px 0 0">Tap any spot to swap in a card you own. Each ★ is +1 rating.</p>
    <div class="actions">
      ${c.reward !== null && c.reward !== undefined ? `<button class="btn sun big" id="rwd">${ico('coin', 18)} Claim your ${PACKS[c.reward].cost.toLocaleString()} coin reward</button>` : ''}
      <button class="btn primary big" id="play" ${clubReady() ? '' : 'disabled'}>${ico('play', 18)} ${!clubReady() ? `Fill all 12 spots (${filled}/12)` : c.match ? 'Finish your Rivals match' : 'Play Rivals match'}</button>
      <div class="two"><button class="btn" id="auto">${ico('sparkle', 18)} Auto-build</button><button class="btn" id="gd" ${clubReady() ? '' : 'disabled'}>${ico('clipboard', 18)} Gameday</button></div>
      ${filled < 12 ? `<button class="btn" data-act="packs">${ico('pack', 18)} Get more cards</button>` : ''}
    </div>
    <div class="section-title">This season</div>
    <div class="stat-grid"><div class="stat"><div class="si mint">${ico('check', 18)}</div><b>${c.sw}</b><small>Wins</small></div><div class="stat"><div class="si pink">${ico('x', 18)}</div><b>${c.sl}</b><small>Losses</small></div><div class="stat"><div class="si violet">${ico('crown', 18)}</div><b>Div ${c.top}</b><small>All-time best</small></div></div>
    <div class="section-title">Season rewards</div>
    <div class="season-rw">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => `<div class="${d === c.sbest ? 'on' : ''}"><b>Div ${d}</b><small>${SEASON_COINS[d].toLocaleString()}</small></div>`).join('')}</div>
    <p class="mute center" style="font-weight:600;font-size:12px;margin:8px 0 0">Paid at the end of the month for the best division you reach. Then everyone resets to Division 10.</p>
    <p class="mute center" style="font-weight:600;font-size:12.5px;margin:12px 0 0">${ownedIds().length} cards owned</p>`, 'has-tabs');
  tabbar('club');
  // every slot opens your binder for that position
  TE.LINEUP.forEach((s, i) => {
    const slotEl = $(`#cf .slot[data-slot="${i}"]`, el);
    if (slotEl) { slotEl.style.cursor = 'pointer'; slotEl.addEventListener('click', () => editClubSlot(i)); }
  });
  $('#auto', el).addEventListener('click', () => { autoBuildClub(); Sfx.good(); ClubScreen(); });
  const pb = $('#play', el); if (pb) pb.addEventListener('click', rivalsMatch);
  const rw = $('#rwd', el); if (rw) rw.addEventListener('click', openClubReward);
  const gb = $('#gd', el); if (gb) gb.addEventListener('click', () => GamedayOpp(clubData().xi, levelMods(clubData().xi)));
  // a finished season waits here until you claim it
  if (c.seasonEnd) later(claimSeasonEnd, 350);
}
async function editClubSlot(i) {
  const c = clubData(), s = TE.LINEUP[i];
  const taken = (id) => c.xi.some((x, k) => k !== i && x !== null && TE.PLAYERS[x].name === TE.PLAYERS[id].name);
  const fits = (id) => TE.fitPenalty(TE.PLAYERS[id].pos, s.pos) !== null;
  const list = ownedIds().filter(fits).sort((a, b) => effRating(b, i) - effRating(a, i));
  const pid = await pickPlayer({ title: `Your ${TE.POS_NAME[s.pos].toLowerCase()}s`, sub: s.pos === 'HC' || s.pos === 'K' ? '' : 'Players out of position lose a few rating points.', initial: list.slice(0, 80), filter: (id) => !!Store.data.coll[id] && fits(id), exclude: (id) => (taken(id) ? 'already in your club' : null), stars: true, mods: levelMods(list), emptyText: `You don't own a card that can play ${s.label} yet. Open packs or draft one.` });
  if (pid === null) return;
  c.xi[i] = pid; Store.save(); Sfx.place();
  ClubScreen();
}

// ---- Rivals ladder: Division 10 needs 7 wins to go up, and every division above needs one more.
// Losses never cost progress, but each division brings a tougher opponent (a better roster plus a boost).
const RIVALS_DIV = {
  10: { q: 0.4, boost: -0.7 }, 9: { q: 0.45, boost: -0.3 }, 8: { q: 0.5, boost: 0.1 }, 7: { q: 0.55, boost: 0.4 }, 6: { q: 0.6, boost: 0.7 },
  5: { q: 0.66, boost: 0.9 }, 4: { q: 0.72, boost: 1.1 }, 3: { q: 0.78, boost: 1.3 }, 2: { q: 0.84, boost: 1.5 }, 1: { q: 0.9, boost: 1.7 },
};
const winsToPromote = (div) => 17 - div; // 10 -> 7, 9 -> 8, ... 2 -> 15
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
function rivalsMatch() {
  const c = clubData();
  // the match is locked in when it starts, so leaving can't re-roll a loss
  if (!c.match) { c.match = { seed: 'rv:' + rid(), div: c.div }; Store.save(); }
  const seed = c.match.seed, opp = rivalsOpponent(c.match.div, seed);
  const user = { name: myName(), xi: c.xi, mods: levelMods(c.xi) };
  playLiveMatch({ title: 'Rivals · Division ' + c.match.div, badge: 'Rivals · Division ' + c.match.div, user, opp, seed, po: false, onDone: (r, el) => rivalsResult(r, el) });
}
function rivalsResult(r, el) {
  const c = clubData();
  if (!c.match) return; // already counted
  c.match = null;
  let promo = null;
  if (r.win) {
    c.w++; c.sw++;
    if (c.div > 1) c.pts++;
    if (c.div > 1 && c.pts >= winsToPromote(c.div)) { c.div--; c.pts = 0; promo = c.div; c.top = Math.min(c.top, c.div); c.sbest = Math.min(c.sbest, c.div); }
    addXP(45 + (10 - c.div) * 5); Sfx.crowd(true);
  } else { c.l++; c.sl++; addXP(15); Sfx.groan(); }
  if (c.div <= 5) unlock('club5');
  if (c.div <= 1) unlock('club1');
  const reward = promo ? (promo <= 1 ? 2 : promo <= 4 ? 1 : 0) : null;
  if (reward !== null) c.reward = reward; // kept until opened
  Store.save();
  $('#after', el).innerHTML = `<div class="outcome ${r.win ? 'win' : 'loss'}" style="margin-top:12px"><h2>${r.win ? 'Win' : 'Loss'} ${r.us}–${r.them}</h2><p>${promo ? `Promoted to Division ${promo}: ${esc(divName(promo))}!${promo > 1 ? ` Next up: ${winsToPromote(promo)} wins to go up again.` : ' The top division.'}` : c.div === 1 ? (r.win ? 'Holding the top division.' : 'Shake it off. You stay in Division 1.') : r.win ? `${c.pts}/${winsToPromote(c.div)} wins. ${winsToPromote(c.div) - c.pts} more to promote.` : `No progress lost. Still ${c.pts}/${winsToPromote(c.div)} wins.`}</p></div>
    ${promo ? `<div class="upgrade" style="margin-top:12px"><b>${ico('coin', 18)} Promotion reward: ${PACKS[reward].cost.toLocaleString()} coins</b><div class="mute" style="font-weight:600;font-size:13px">Enough for a ${PACKS[reward].name} pack.</div></div>` : ''}
    <div class="actions">${promo ? `<button class="btn primary" id="rw">${ico('coin', 18)} Claim ${PACKS[reward].cost.toLocaleString()} coins</button>` : `<button class="btn primary" id="again">${ico('play', 18)} Next match</button>`}<button class="btn" id="club">${ico('shield', 18)} My Club</button></div>`;
  if (promo) { confetti(); Sfx.trophy(); $('#rw', el).addEventListener('click', openClubReward); }
  const ag = $('#again', el); if (ag) ag.addEventListener('click', rivalsMatch);
  $('#club', el).addEventListener('click', ClubScreen);
}
function openClubReward() {
  const c = clubData();
  if (c.reward === null || c.reward === undefined) return;
  const amt = PACKS[c.reward].cost;
  c.reward = null; Store.data.coins += amt; Store.save();
  Sfx.achievement(); toast(`+${amt.toLocaleString()} coins`);
  App.clubSeg = 'packs'; goTab('club');
}
