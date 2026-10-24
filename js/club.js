'use strict';
// MY CLUB: build a lineup from cards you own (stars = +1 rating each) and climb the Rivals ladder.
const DIV_NAMES = { 10: 'Walk-on', 9: 'Practice Squad', 8: 'Rookie', 7: 'Starter', 6: 'Veteran', 5: 'Pro Bowl', 4: 'All-Pro', 3: 'Elite', 2: 'Legend', 1: 'Hall of Fame' };
const divName = (d) => DIV_NAMES[d] || 'Walk-on';
function clubData() {
  if (!Store.data.club) Store.data.club = { xi: new Array(TE.SLOTS).fill(null), div: 10, pts: 0, w: 0, l: 0, top: 10 };
  const c = Store.data.club;
  // drop cards you somehow no longer own
  c.xi = c.xi.map((pid) => (pid !== null && Store.data.coll[pid] ? pid : null));
  return c;
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
      <div class="ch-div"><small>Rivals</small><b>Division ${c.div}</b><span>${esc(divName(c.div))}</span>
        <div class="cc-pips">${[0, 1, 2].map((i) => `<i class="${i < c.pts ? 'on' : ''}"></i>`).join('')}<span>${3 - c.pts} win${3 - c.pts === 1 ? '' : 's'} to promote</span></div></div>
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
    <div class="section-title">Rivals record</div>
    <div class="stat-grid"><div class="stat"><div class="si mint">${ico('check', 18)}</div><b>${c.w}</b><small>Wins</small></div><div class="stat"><div class="si pink">${ico('x', 18)}</div><b>${c.l}</b><small>Losses</small></div><div class="stat"><div class="si violet">${ico('crown', 18)}</div><b>Div ${c.top}</b><small>Best</small></div></div>
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

// ---- Rivals ladder: win 3 to promote. A loss costs a point (you never drop a division).
function rivalsOpponent(div, seed) {
  const sorted = TE.CUR_SQ.slice().sort((a, b) => TE.squadStrength(a) - TE.squadStrength(b));
  const r = TE.rng(seed);
  const q = Math.min(0.99, 0.03 + (10 - div) * 0.095);
  const k = Math.max(0, Math.min(sorted.length - 1, Math.floor(q * sorted.length + (r() - 0.5) * 3)));
  const base = TE.squadTeam(sorted[k]);
  const boost = Math.max(0, (4 - div)) * 0.6; // the top divisions bring souped-up rosters
  if (!boost) return base;
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
    c.w++; c.pts++;
    if (c.pts >= 3 && c.div > 1) { c.div--; c.pts = 0; promo = c.div; c.top = Math.min(c.top, c.div); }
    else if (c.pts >= 3) c.pts = 3;
    addXP(45); Sfx.crowd(true);
  } else { c.l++; c.pts = Math.max(0, c.pts - 1); addXP(15); Sfx.groan(); }
  if (c.div <= 5) unlock('club5');
  if (c.div <= 1) unlock('club1');
  const reward = promo ? (promo <= 1 ? 2 : promo <= 4 ? 1 : 0) : null;
  if (reward !== null) c.reward = reward; // kept until opened
  Store.save();
  $('#after', el).innerHTML = `<div class="outcome ${r.win ? 'win' : 'loss'}" style="margin-top:12px"><h2>${r.win ? 'Win' : 'Loss'} ${r.us}–${r.them}</h2><p>${promo ? `Promoted to Division ${promo}: ${esc(divName(promo))}!` : r.win ? `${3 - c.pts} more win${3 - c.pts === 1 ? '' : 's'} to promote` : 'Lost a point. Bounce back.'}</p></div>
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
