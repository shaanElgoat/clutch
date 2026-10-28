'use strict';
// BATTLE ROYALE (replaces the old Rivals ladder): your Club drops into a 100-GM lobby.
// Every round you face one CPU club; lose and you're out. The storm makes each round tougher,
// supply drops between fights give you loot, and the last GM standing gets the Victory Royale.
const BR_ROUNDS = [
  { alive: 100, skill: 34, storm: 0 }, { alive: 50, skill: 26, storm: 1 }, { alive: 25, skill: 19, storm: 2 },
  { alive: 13, skill: 13, storm: 3 }, { alive: 7, skill: 8, storm: 4.5 }, { alive: 4, skill: 4, storm: 6 }, { alive: 2, skill: 1, storm: 8 },
];
// loot: rarity colours like the real thing; boosts are added to the players in those spots
const BR_RARITY = { common: ['Common', '#8a93a8'], rare: ['Rare', '#3466ff'], epic: ['Epic', '#9b4dff'], legendary: ['Legendary', '#f5a700'] };
const BR_LOOT = [
  { id: 'shield', name: 'Shield', rar: 'rare', ic: 'shield', d: 'Survive your next loss', pos: [], amt: 0 },
  { id: 'air', name: 'Air Raid', rar: 'rare', ic: 'deep', d: '+2 to your QB, WRs and TE', pos: ['QB', 'WR', 'TE'], amt: 2 },
  { id: 'ground', name: 'Ground Pound', rar: 'common', ic: 'run', d: '+2 to your RB and OL', pos: ['RB', 'OL'], amt: 2 },
  { id: 'wall', name: 'Brick Wall', rar: 'rare', ic: 'stop', d: '+2 to your DL and LB', pos: ['DL', 'LB'], amt: 2 },
  { id: 'lock', name: 'Lockdown', rar: 'common', ic: 'lock', d: '+2 to your CB and S', pos: ['CB', 'S'], amt: 2 },
  { id: 'leg', name: 'Big Leg', rar: 'common', ic: 'goalpost', d: '+4 to your kicker', pos: ['K'], amt: 4 },
  { id: 'meal', name: 'Team Meal', rar: 'epic', ic: 'users', d: '+1 to everyone', pos: ['*'], amt: 1 },
  { id: 'gold', name: 'Golden Playbook', rar: 'legendary', ic: 'crown', d: '+2 to everyone', pos: ['*'], amt: 2 },
];
const BR_WEIGHT = { common: 45, rare: 33, epic: 16, legendary: 6 };
const BR_TAG_A = ['Blitz', 'Gridiron', 'Pigskin', 'Endzone', 'HailMary', 'RedZone', 'Turf', 'Sack', 'PickSix', 'Blindside', 'Audible', 'Snap', 'FourthDown', 'Spiral', 'Hurdle', 'Shotgun', 'Pylon', 'Huddle'];
const BR_TAG_B = ['King', 'Ghost', 'Wizard', 'Legend', 'Goat', 'Machine', 'Sniper', 'Boss', 'Savage', 'Hero', 'Tank', 'Rocket', 'Lord', 'Ninja'];
function brTag(r) {
  const a = BR_TAG_A[Math.floor(r() * BR_TAG_A.length)], b = BR_TAG_B[Math.floor(r() * BR_TAG_B.length)], n = Math.floor(r() * 99);
  const style = r();
  return style < 0.25 ? `xX_${a}${b}_Xx` : style < 0.6 ? `${a}${b}${n}` : `${a}_${b}`;
}
const brStats = () => (Store.data.br = Store.data.br || { played: 0, wins: 0, top10: 0, best: 0, elims: 0 });

// the CPU club you meet in a round: drafted by a GM who gets sharper as the lobby shrinks, plus the storm
function brOpponent(b, k) {
  const R = BR_ROUNDS[k], r = TE.rng(b.seed + ':tag:' + k);
  const d = TE.createDraft({ seed: b.seed + ':opp:' + k, managers: [{ name: 'cpu' }] });
  while (!d.done) { const p = TE.botPick(d, 0, R.skill); TE.pick(d, 0, p.pid, p.slot); }
  const xi = d.managers[0].xi, p = TE.teamProfile(xi);
  return { name: brTag(r), xi, prof: Object.assign({}, p, { off: p.off + R.storm, def: p.def + R.storm, ovr: p.ovr + R.storm }) };
}
// your club's rating mods: card stars plus everything you've looted
function brMods(b) {
  const mods = Object.assign({}, b.mods);
  b.items.forEach((id) => {
    const it = BR_LOOT.find((x) => x.id === id);
    if (!it || !it.amt) return;
    b.xi.forEach((pid, i) => { if (pid !== null && (it.pos[0] === '*' || it.pos.includes(TE.LINEUP[i].pos))) mods[pid] = (mods[pid] || 0) + it.amt; });
  });
  return mods;
}
function brOffer(b) {
  const r = TE.rng(b.seed + ':loot:' + b.round);
  const pool = BR_LOOT.filter((x) => !(x.id === 'shield' && b.shield));
  const out = [];
  while (out.length < 3) {
    const tot = pool.reduce((a, x) => a + (out.includes(x.id) ? 0 : BR_WEIGHT[x.rar]), 0);
    let roll = r() * tot;
    for (const x of pool) { if (out.includes(x.id)) continue; roll -= BR_WEIGHT[x.rar]; if (roll <= 0) { out.push(x.id); break; } }
  }
  return out;
}
// a little elimination feed between fights
function brFeed(b) {
  const r = TE.rng(b.seed + ':feed:' + b.round), R = BR_ROUNDS[b.round];
  const lines = [0, 1, 2].map(() => `<div class="br-kill"><b>${esc(brTag(r))}</b> eliminated <b>${esc(brTag(r))}</b></div>`);
  const prev = b.round ? BR_ROUNDS[b.round - 1].alive : 100;
  return (b.round ? `<div class="br-kill storm">${prev - R.alive - 1} GMs were eliminated last round</div>` : '<div class="br-kill storm">100 GMs dropped in</div>') + lines.join('');
}

function RoyaleStart() {
  const s = brStats();
  if (!clubReady()) { toast('Fill all 12 spots in My Club first'); return; }
  introScreen({
    title: 'Battle Royale', icon: 'target', bg: 'linear-gradient(160deg,#efe7ff,#d9caff)',
    headline: '100 GMs drop in. One wins.', sub: 'Take your Club into the lobby. Win and you move on. Lose once and you are eliminated.',
    steps: [['Drop in', 'Your Club from My Club, locked in for the whole match.'], ['Survive', 'Seven fights against CPU clubs. The storm makes every round tougher.'], ['Loot', 'Win a fight and pick from a supply drop: boosts, or a Shield that survives a loss.'], ['Victory Royale', 'Be the last GM standing for the big coin prize.']],
    extra: `<div class="stat-grid" style="margin-top:12px"><div class="stat"><div class="si sun">${ico('crown', 18)}</div><b>${s.wins}</b><small>Victories</small></div><div class="stat"><div class="si violet">${ico('target', 18)}</div><b>${s.best ? '#' + s.best : '–'}</b><small>Best finish</small></div><div class="stat"><div class="si pink">${ico('bolt', 18)}</div><b>${s.top10}</b><small>Top 10s</small></div></div>`,
    buttons: [{ label: `${ico('play', 18)} Drop in`, cls: 'hot big', fn: brDrop }],
  });
}
function brDrop() {
  const c = clubData();
  const b = { seed: 'br:' + rid(), xi: c.xi.slice(), mods: levelMods(c.xi), round: 0, items: [], shield: 0, elims: 0, phase: 'fight' };
  Runs.set('br', { b });
  // the drop: the lobby fills, the bus doors open
  const el = go(`<div class="br-drop"><div class="br-ring big"><i></i></div><b id="brn">0</b><small>GMs in the lobby</small><p>Dropping in…</p></div>`);
  let n = 0;
  const tick = () => { if (!el.isConnected) return; n = Math.min(100, n + 7); $('#brn', el).textContent = n; if (n < 100) later(tick, 40); else { Sfx.whistle(); later(() => RoyaleHub(b), 700); } };
  tick();
}
function RoyaleHub(b) {
  if (b.phase === 'loot') return RoyaleLoot(b);
  Runs.set('br', { b });
  const R = BR_ROUNDS[b.round], opp = brOpponent(b, b.round), oc = teamColors(opp);
  const me = TE.teamProfile(b.xi, { mods: brMods(b) });
  const zone = [100, 82, 66, 52, 40, 30, 22][b.round];
  const el = go(`
    <div class="topbar"><button class="icon-btn" id="q">${ICON.close}</button><h2 class="d grow">Battle Royale</h2><span class="pill">${ico('bolt', 14)} <b>${b.elims}</b> elims</span></div>
    <div class="br-hud"><div class="br-ring" style="--z:${zone}%"><i></i></div><div class="grow"><b>${R.alive}</b><small>GMs left</small><span>Round ${b.round + 1} of 7${R.storm ? ' · storm +' + R.storm : ''}</span></div></div>
    <div class="vs"><div class="side"><div class="helmbig">${myTeamHelm()}</div><b>You</b><span>OVR ${me.ovr.toFixed(0)}</span></div><div class="x">VS</div>
      <div class="side"><div class="helmbig">${helmet(oc.c1, oc.c2, true)}</div><b>${esc(opp.name)}</b><span>OVR ${opp.prof.ovr.toFixed(0)}</span></div></div>
    <button class="btn hot big" id="fight">${ico('play', 18)} Fight</button>
    <div class="group-title">Your loot</div>
    <div class="br-loadout">${b.shield ? `<span class="br-item" style="--rc:${BR_RARITY.rare[1]}">${ico('shield', 14)} Shield ready</span>` : ''}${b.items.filter((id) => id !== 'shield').map((id) => { const it = BR_LOOT.find((x) => x.id === id); return `<span class="br-item" style="--rc:${BR_RARITY[it.rar][1]}">${ico(it.ic, 14)} ${esc(it.name)}</span>`; }).join('') || (b.shield ? '' : '<span class="mute" style="font-weight:600;font-size:13px">Nothing yet. Win a fight for a supply drop.</span>')}</div>
    <div class="group-title">Feed</div>
    <div class="br-feed">${brFeed(b)}</div>`);
  $('#q', el).addEventListener('click', () => { toast('Match saved. Continue it any time.'); goTab(App.tab || 'club'); });
  $('#fight', el).addEventListener('click', () => {
    playLiveMatch({ title: `Round ${b.round + 1}`, badge: `Battle Royale · ${R.alive} left`, user: { name: myName(), xi: b.xi, mods: brMods(b) }, opp, seed: b.seed + ':r' + b.round + ':' + (b.retry || 0), po: b.round >= 5,
      onDone: (r, el2) => brAfter(b, r, el2) });
  });
}
function brAfter(b, r, el) {
  if (b.phase !== 'fight') return;
  const R = BR_ROUNDS[b.round];
  if (r.win) {
    b.elims++;
    if (b.round === BR_ROUNDS.length - 1) return brEnd(b, 1, el);
    b.round++; b.phase = 'loot';
    Runs.set('br', { b });
    Sfx.crowd(true);
    $('#after', el).innerHTML = `<div class="outcome win" style="margin-top:12px"><h2>Eliminated ${esc(brOpponent(b, b.round - 1).name)}</h2><p>${BR_ROUNDS[b.round].alive} GMs left. A supply drop is landing.</p></div>
      <div class="actions"><button class="btn sun big" id="nx">${ico('gift', 18)} Open supply drop</button></div>`;
    $('#nx', el).addEventListener('click', () => RoyaleLoot(b));
    return;
  }
  if (b.shield) {
    b.shield = 0; b.items = b.items.filter((x) => x !== 'shield'); b.retry = (b.retry || 0) + 1;
    Runs.set('br', { b });
    Sfx.achievement();
    $('#after', el).innerHTML = `<div class="outcome win" style="margin-top:12px"><h2>Shield broke!</h2><p>You survive the hit. Same opponent, one more shot.</p></div>
      <div class="actions"><button class="btn hot big" id="nx">Run it back</button></div>`;
    $('#nx', el).addEventListener('click', () => RoyaleHub(b));
    return;
  }
  const next = BR_ROUNDS[b.round + 1] ? BR_ROUNDS[b.round + 1].alive : 1;
  const place = next + 1 + Math.floor(TE.rng(b.seed + ':place')() * (R.alive - next));
  brEnd(b, place, el);
}
function RoyaleLoot(b) {
  b.phase = 'loot'; b.offer = b.offer || brOffer(b);
  Runs.set('br', { b });
  const el = go(`
    <div class="br-loot-head"><div class="br-crate">${ico('gift', 40)}</div><h2 class="d">Supply drop</h2><p class="mute">Pick one. It lasts the rest of the match.</p></div>
    <div class="br-loot">${b.offer.map((id) => { const it = BR_LOOT.find((x) => x.id === id), rc = BR_RARITY[it.rar]; return `<button class="br-card" data-id="${id}" style="--rc:${rc[1]}"><span class="br-rar">${rc[0]}</span><div class="br-ic">${ico(it.ic, 28)}</div><b>${esc(it.name)}</b><small>${esc(it.d)}</small></button>`; }).join('')}</div>`);
  $$('.br-card', el).forEach((c) => c.addEventListener('click', () => {
    const id = c.dataset.id;
    if (id === 'shield') b.shield = 1;
    b.items.push(id); b.offer = null; b.phase = 'fight';
    const it = BR_LOOT.find((x) => x.id === id);
    if (it.rar === 'legendary' || it.rar === 'epic') { confetti(1200); Sfx.trophy(); } else Sfx.achievement();
    const r = c.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, 12);
    later(() => RoyaleHub(b), 450);
  }));
}
function brEnd(b, place, el) {
  if (b.phase === 'over') return;
  b.phase = 'over'; Runs.clear('br');
  const s = brStats(), won = place === 1;
  s.played++; s.elims += b.elims;
  if (won) s.wins++;
  if (place <= 10) s.top10++;
  s.best = s.best ? Math.min(s.best, place) : place;
  const coins = won ? 1500 : place <= 3 ? 600 : place <= 10 ? 300 : place <= 25 ? 120 : 50;
  Store.data.coins += coins; Store.save();
  addXP(30 + b.elims * 15 + (won ? 200 : 0));
  if (won) unlock('br_win');
  if (place <= 10) unlock('br_top10');
  if (won) { confetti(); Sfx.trophy(); buzz([40, 60, 40, 60, 120]); } else Sfx.groan();
  $('#after', el).innerHTML = won
    ? `<div class="br-victory"><small>#1 of 100</small><b>VICTORY ROYALE</b><span>${b.elims} eliminations · last GM standing</span></div>`
    : `<div class="br-out"><b>#${place}</b><span>Eliminated. ${b.elims} elimination${b.elims === 1 ? '' : 's'}.</span></div>`;
  $('#after', el).innerHTML += `<div class="hero-card center" style="margin-top:10px"><b>${ico('coin', 18)} +${coins.toLocaleString()} coins</b></div>
    <div class="actions"><button class="btn hot big" id="again">${ico('play', 18)} Drop in again</button><div class="two"><button class="btn" id="sh">${ico('share', 18)} Share</button><button class="btn" id="club">${ico('shield', 18)} My Club</button></div></div>`;
  $('#again', el).addEventListener('click', () => (clubReady() ? brDrop() : ClubScreen()));
  $('#club', el).addEventListener('click', () => { App.clubSeg = 'club'; goTab('club'); });
  $('#sh', el).addEventListener('click', () => shareOut(won ? `CLUTCH Battle Royale 👑\nVICTORY ROYALE · ${b.elims} elims\n100 GMs dropped. I was the last one standing.` : `CLUTCH Battle Royale\n#${place} of 100 · ${b.elims} elims\nCan your club go further?`));
}
