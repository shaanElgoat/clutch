'use strict';
// MY CLUB: build a lineup from cards you own (stars = +1 rating each), then take it into Battle Royale (royale.js).
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
      <div class="ch-div"><small>Battle Royale</small><b>${brStats().wins} Victor${brStats().wins === 1 ? 'y' : 'ies'}</b><span>Best finish ${brStats().best ? '#' + brStats().best : '–'} · ${brStats().top10} top 10s</span></div>
      <div class="ch-rings"><div class="ring big" style="--p:${Math.max(0, Math.min(100, ((prof.ovr || 60) - 60) * 2.5))}%"><b>${filled ? Math.round(prof.ovr) : '–'}</b><small>OVR</small></div></div>
    </div>
    <div class="turf club-turf" id="cf">${FIELD_LINES}${fieldSlots(c.xi, { mods })}</div>
    <p class="mute center" style="font-weight:600;font-size:12.5px;margin:8px 0 0">Tap any spot to swap in a card you own. Each ★ is +1 rating.</p>
    <div class="actions">
      ${c.reward !== null && c.reward !== undefined ? `<button class="btn sun big" id="rwd">${ico('coin', 18)} Claim your ${PACKS[c.reward].cost.toLocaleString()} coin reward</button>` : ''}
      <button class="btn hot big" id="play" ${clubReady() ? '' : 'disabled'}>${ico('target', 18)} ${!clubReady() ? `Fill all 12 spots (${filled}/12)` : Runs.get('br') ? 'Continue Battle Royale' : 'Battle Royale: drop in'}</button>
      <div class="two"><button class="btn" id="auto">${ico('sparkle', 18)} Auto-build</button><button class="btn" id="gd" ${clubReady() ? '' : 'disabled'}>${ico('clipboard', 18)} Gameday</button></div>
      ${filled < 12 ? `<button class="btn" data-act="packs">${ico('pack', 18)} Get more cards</button>` : ''}
    </div>
    <p class="mute center" style="font-weight:600;font-size:12.5px;margin:12px 0 0">${ownedIds().length} cards owned</p>`, 'has-tabs');
  tabbar('club');
  // every slot opens your binder for that position
  TE.LINEUP.forEach((s, i) => {
    const slotEl = $(`#cf .slot[data-slot="${i}"]`, el);
    if (slotEl) { slotEl.style.cursor = 'pointer'; slotEl.addEventListener('click', () => editClubSlot(i)); }
  });
  $('#auto', el).addEventListener('click', () => { autoBuildClub(); Sfx.good(); ClubScreen(); });
  const pb = $('#play', el); if (pb) pb.addEventListener('click', () => (Runs.get('br') ? resumeRun('br') : RoyaleStart()));
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

function openClubReward() {
  const c = clubData();
  if (c.reward === null || c.reward === undefined) return;
  const amt = PACKS[c.reward].cost;
  c.reward = null; Store.data.coins += amt; Store.save();
  Sfx.achievement(); toast(`+${amt.toLocaleString()} coins`);
  App.clubSeg = 'packs'; goTab('club');
}
