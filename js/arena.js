'use strict';
// Head-to-head modes that replace Gauntlet and Dynasty. Every game plays live (playLiveMatch).
//   Draft Duel: you vs a CPU GM drafting from the same spins, then a best-of-3 series between the two teams.
//   Salary Cap: build 12 under a budget from 3 offers per spot, then a 4-round knockout playoff run.

// =====================================================================
// DRAFT DUEL
// =====================================================================
const RIVALS = [
  { id: 'rookie', name: 'Coach Clipboard', tag: 'Rookie', noise: 18, edge: -1.5, col: 'var(--mint)', bg: 'var(--mint-soft)', blurb: 'Drafts on vibes. Often takes the kicker early.' },
  { id: 'pro', name: 'The Analyst', tag: 'Pro', noise: 7, edge: 1.5, col: 'var(--orange)', bg: 'var(--orange-soft)', blurb: 'Knows the ratings. Will steal your QB.' },
  { id: 'shark', name: 'The Shark', tag: 'Legend', noise: 0, edge: 4, col: 'var(--red)', bg: '#ffe8ec', blurb: 'Never wastes a pick. Beat him and brag.' },
];
function DuelStart() {
  const s = Store.data.stats;
  introScreen({
    title: 'Draft Duel', icon: 'users', bg: 'linear-gradient(160deg,#eef2ff,#dfe6ff)',
    headline: 'Out-draft a rival GM', sub: 'Same spins, snake order. If they take your guy, he is gone. Then settle it on the field: best of 3.',
    steps: [['Pick a rival', 'Three GMs, three levels of ruthless.'], ['Steal draft', 'You both pick from every spin. Grab the stars first.'], ['Best of 3', 'Watch each game live. Close ones stop for your Clutch Call.']],
    extra: `<div class="section-title">Choose your rival</div><div class="opp-picker">${RIVALS.map((r, i) => `<button class="opp" data-r="${i}"><div class="hh mc-ic" style="--tint:${r.col}">${ico(i === 2 ? 'crown' : i === 1 ? 'target' : 'clipboard', 20)}</div><div class="grow"><b>${r.name}</b><small>${r.blurb}</small></div><span class="diff" style="background:${r.bg};color:${r.col}">${r.tag}</span></button>`).join('')}</div>
      <div class="mute center" style="font-weight:700;font-size:13px;margin-top:10px">Series won: ${s.duelW || 0} · Shark beaten: ${s.duelShark || 0}</div>`,
    buttons: [],
  });
  $$('[data-r]').forEach((b) => b.addEventListener('click', () => duelDraft(RIVALS[+b.dataset.r])));
}
function duelDraft(rival) {
  const seed = 'duel:' + rid();
  const meta = [{ color: MGR_COLORS[0] }, { color: MGR_COLORS[1], cpu: true }];
  openDraft({ mode: 'duel', run: 'duel', rivalId: rival.id, seed, cpuNoise: rival.noise, managers: [{ name: myName() }, { name: rival.name }], meta, title: 'Draft duel', onDone: (st) => duelDrafted(rival.id, seed, st) });
}
function duelDrafted(rivalId, seed, st) {
  const rival = RIVALS.find((r) => r.id === rivalId) || RIVALS[0];
  DuelHub({ seed, rival, me: st.managers[0].xi, them: st.managers[1].xi, games: [] });
}
// the rival's edge: better coaching, home cooking, whatever. Keeps The Shark scary.
function duelProf(d) { const p = TE.teamProfile(d.them), e = d.rival.edge || 0; return Object.assign({}, p, { off: p.off + e, def: p.def + e, ovr: p.ovr + e }); }
function duelScore(d) { return [d.games.filter((g) => g.win).length, d.games.filter((g) => !g.win).length]; }
function DuelHub(d) {
  Runs.set('duel', { phase: 'hub', d });
  const [w, l] = duelScore(d);
  const pm = TE.teamProfile(d.me), pt = duelProf(d);
  const el = go(`
    <div class="topbar"><button class="icon-btn" id="q">${ICON.close}</button><h2 class="d grow">Draft Duel</h2><span class="pill">vs <b>${esc(d.rival.tag)}</b></span></div>
    <div class="series"><div class="sr-side"><div class="helmbig">${myTeamHelm()}</div><b>You</b><span>OVR ${pm.ovr.toFixed(0)}</span></div>
      <div class="sr-mid"><div class="sr-score">${w}<i>–</i>${l}</div><small>Best of 3</small></div>
      <div class="sr-side"><div class="helmbig">${helmet('#ff3d7f', '#0f1631', true)}</div><b>${esc(d.rival.name)}</b><span>OVR ${pt.ovr.toFixed(0)}</span></div></div>
    <div class="sr-games">${[0, 1, 2].map((i) => { const g = d.games[i]; return `<div class="sr-g ${g ? (g.win ? 'W' : 'L') : i === d.games.length ? 'next' : ''}"><small>Game ${i + 1}</small><b>${g ? g.us + '–' + g.them : i === d.games.length ? 'Up next' : '–'}</b></div>`; }).join('')}</div>
    <button class="btn primary big" id="play">${ico('play', 18)} Play game ${d.games.length + 1}</button>
    <div class="seg two" id="xiSeg"><button class="on" data-v="me">Your team</button><button data-v="them">${esc(d.rival.name)}</button></div>
    <div id="xi">${miniField(d.me)}</div>`);
  $$('#xiSeg button', el).forEach((b) => b.addEventListener('click', () => { $$('#xiSeg button', el).forEach((x) => x.classList.toggle('on', x === b)); $('#xi', el).innerHTML = miniField(b.dataset.v === 'me' ? d.me : d.them); }));
  $('#q', el).addEventListener('click', () => { toast('Series saved. Continue it any time.'); goTab(App.tab || 'games'); });
  $('#play', el).addEventListener('click', () => {
    const n = d.games.length + 1;
    playLiveMatch({ title: `Game ${n}`, badge: `Draft Duel · Game ${n}`, user: { name: myName(), xi: d.me }, opp: { name: d.rival.name, xi: d.them, prof: duelProf(d) }, seed: d.seed + ':g' + n, po: n === 3,
      onDone: (r, el2) => {
        d.games.push({ win: r.win, us: r.us, them: r.them });
        const [w2, l2] = duelScore(d), over = w2 === 2 || l2 === 2;
        Runs.set('duel', { phase: 'hub', d });
        addXP(25 + (r.win ? 25 : 0));
        if (r.win) Sfx.crowd(true); else Sfx.groan();
        $('#after', el2).innerHTML = `<div class="outcome ${r.win ? 'win' : 'loss'}" style="margin-top:12px"><h2>${r.win ? 'You win game ' + n : esc(d.rival.name) + ' takes game ' + n}</h2><p>Series: ${w2}–${l2}${over ? '' : ' · ' + (w2 === 1 && l2 === 1 ? 'Game 3 decides it' : '')}</p></div>
          <div class="actions"><button class="btn primary" id="nx">${over ? 'See the result' : 'Next game'}</button></div>`;
        $('#nx', el2).addEventListener('click', () => (over ? DuelEnd(d) : DuelHub(d)));
      } });
  });
}
function DuelEnd(d) {
  Runs.clear('duel');
  const [w, l] = duelScore(d), won = w > l;
  const s = Store.data.stats;
  if (won) {
    s.duelW = (s.duelW || 0) + 1; unlock('duel1');
    if (d.rival.id === 'shark') { s.duelShark = (s.duelShark || 0) + 1; unlock('duel_shark'); }
    if (l === 0) unlock('duel_sweep');
    addXP(d.rival.id === 'shark' ? 250 : d.rival.id === 'pro' ? 150 : 80);
  }
  Store.save();
  const el = go(`
    <div class="topbar"><button class="icon-btn" data-act="home">${ICON.back}</button><h2 class="d">Series final</h2></div>
    <div class="verdict"><div class="trophy ${won ? 'on' : 'dim'}">${TROPHY_SVG}</div><h1 class="gold">${won ? 'You win the series' : esc(d.rival.name) + ' wins'}</h1><p>${w}–${l} vs ${esc(d.rival.name)} (${esc(d.rival.tag)})</p></div>
    <div class="sr-games">${d.games.map((g, i) => `<div class="sr-g ${g.win ? 'W' : 'L'}"><small>Game ${i + 1}</small><b>${g.us}–${g.them}</b></div>`).join('')}</div>
    <div class="actions"><button class="btn primary" id="re">${ico('refresh', 18)} New duel</button><div class="two"><button class="btn" id="sh">${ico('share', 18)} Share</button><button class="btn" data-act="home">Done</button></div></div>`);
  if (won) { confetti(); Sfx.trophy(); }
  $('#re', el).addEventListener('click', DuelStart);
  $('#sh', el).addEventListener('click', () => shareOut(`CLUTCH Draft Duel 🏈\n${won ? 'Beat' : 'Lost to'} ${d.rival.name} ${w}-${l}\n${d.games.map((g) => (g.win ? '🟩' : '🟥')).join('')}`));
}

// =====================================================================
// SALARY CAP
// =====================================================================
const CAP = 170;
const capPrice = (r) => Math.max(1, Math.round(1.6 * Math.pow(1.13, r - 70)));
const CAP_ROUNDS = [
  { label: 'Wild Card', q: 0.35, boost: -1 }, { label: 'Divisional', q: 0.6, boost: 0 },
  { label: 'Conference Championship', q: 0.82, boost: 1.5 }, { label: 'Super Bowl', q: 0.96, boost: 3 },
];
function capOffers(c) {
  const slot = c.round, pos = TE.LINEUP[slot].pos;
  const r = TE.rng(c.seed + ':o:' + slot + ':' + c.rerolls);
  const used = new Set(c.xi.filter((x) => x !== null).map((x) => TE.PLAYERS[x].name));
  const pool = TE.PLAYERS.filter((p) => TE.isCurrent(p.id) && p.pos === pos && !used.has(p.name));
  const tier = (lo, hi) => { const t = pool.filter((p) => p.r >= lo && p.r <= hi); return t.length ? t[Math.floor(r() * t.length)] : null; };
  const out = [tier(89, 99) || tier(86, 99), tier(80, 88), tier(0, 77) || tier(0, 80)].filter(Boolean);
  const ids = [...new Set(out.map((p) => p.id))];
  return ids.sort((a, b) => TE.PLAYERS[b].r - TE.PLAYERS[a].r);
}
// best playoff run in words: how many of the 4 knockout games you've won in one run
const CAP_BEST = ['No playoff wins yet', 'Won the Wild Card', 'Won the Divisional round', 'Won the Conference', 'Super Bowl champion'];
// Salary Cap titles won (older saves that reached 4/4 already count one)
const capTitles = (s) => (s.capTitles !== undefined ? s.capTitles : s.capBest >= 4 ? 1 : 0);
function CapStart() {
  const s = Store.data.stats;
  introScreen({
    title: 'Salary Cap', icon: 'coin', bg: 'linear-gradient(160deg,#fff4dc,#ffe3a6)',
    headline: `Build a champion for $${CAP}M`, sub: 'Every spot offers a star, a starter and a bargain. You cannot afford all the stars.',
    steps: [['12 picks', 'Three offers per position. Stars cost a fortune, bargains keep you flexible.'], ['Spend smart', 'Balance stars and bargains. One re-roll if you hate the offers.'], ['Playoff run', 'Four knockout games, live. Lose once and you are out.']],
    extra: `<div class="hero-card row" style="margin-top:12px"><div class="intro-ic sm">${ico('trophy', 22)}</div><div class="grow"><b>Titles won</b><div class="mute" style="font-weight:800">${capTitles(s)}</div></div></div>`,
    buttons: [{ label: `${ico('coin', 18)} Start building`, cls: 'primary', fn: () => CapBuild({ seed: 'cap:' + rid(), xi: new Array(TE.SLOTS).fill(null), spent: 0, round: 0, rerolls: 0, rerollsLeft: 1 }) }],
  });
}
function CapBuild(c) {
  if (c.round >= TE.SLOTS) return CapHub(Object.assign(c, { wins: 0, done: false }));
  Runs.set('cap', { phase: 'build', c });
  const left = CAP - c.spent, remaining = TE.SLOTS - c.round - 1;
  const reserve = remaining * 3; // always leave room for bargains
  const offers = capOffers(c);
  const prof = TE.teamProfile(c.xi);
  const filled = c.xi.filter((x) => x !== null).length;
  const pos = TE.LINEUP[c.round].pos;
  const el = go(`
    <div class="topbar"><button class="icon-btn" id="q">${ICON.close}</button><div class="grow"><h2 class="d">Salary Cap</h2><div class="mute" style="font-weight:700;font-size:12px">Pick ${c.round + 1} of ${TE.SLOTS}</div></div><div class="ring" style="--p:${filled ? Math.max(0, Math.min(100, (prof.ovr - 60) * 2.5)) : 0}%"><b>${filled ? Math.round(prof.ovr) : '–'}</b></div></div>
    <div class="cap-bar"><div class="cb-top"><b>$${left}M</b><span>left of $${CAP}M</span></div><div class="prog"><i style="width:${(left / CAP) * 100}%"></i></div></div>
    <div class="section-title">Choose your ${TE.POS_NAME[pos].toLowerCase()}</div>
    <div class="offers">${offers.map((pid) => { const p = TE.PLAYERS[pid], price = capPrice(p.r), ok = price <= left - reserve; return `<button class="offer ${ok ? '' : 'off'}" data-pid="${pid}" ${ok ? '' : 'disabled'}><div class="of-card">${pcard(pid)}</div><span class="price">$${price}M</span></button>`; }).join('')}</div>
    <button class="btn small" id="rr" ${c.rerollsLeft ? '' : 'disabled'} style="margin:10px auto 0;display:flex">${ico('refresh', 16)} New offers (${c.rerollsLeft})</button>
    ${miniField(c.xi)}`);
  $$('.offer:not(.off)', el).forEach((b) => b.addEventListener('click', () => {
    const pid = +b.dataset.pid;
    c.xi[c.round] = pid; c.spent += capPrice(TE.PLAYERS[pid].r); c.round++;
    Sfx.place(); buzz(10);
    CapBuild(c);
  }));
  $('#rr', el).addEventListener('click', () => { if (!c.rerollsLeft) return; c.rerollsLeft--; c.rerolls++; Sfx.tap(); CapBuild(c); });
  $('#q', el).addEventListener('click', () => { toast('Team saved. Continue it any time.'); goTab(App.tab || 'games'); });
}
function capOpponent(c, k) {
  const R = CAP_ROUNDS[k];
  const sorted = TE.CUR_SQ.slice().sort((a, b) => TE.squadStrength(a) - TE.squadStrength(b));
  const r = TE.rng(c.seed + ':opp:' + k);
  const i = Math.max(0, Math.min(sorted.length - 1, Math.round(R.q * (sorted.length - 1) + (r() - 0.5) * 3)));
  const base = TE.squadTeam(sorted[i]);
  return { name: base.name, xi: base.xi, prof: Object.assign({}, base.prof, { off: base.prof.off + R.boost, def: base.prof.def + R.boost, ovr: base.prof.ovr + R.boost }) };
}
function CapHub(c) {
  if (!c.xi.every((x) => x !== null)) return;
  if (c.done || c.wins >= 4) Runs.clear('cap'); else Runs.set('cap', { phase: 'hub', c });
  const prof = TE.teamProfile(c.xi);
  const next = c.done ? null : capOpponent(c, c.wins);
  const nc = next ? teamColors(next) : null;
  const el = go(`
    <div class="topbar"><button class="icon-btn" id="q">${ICON.close}</button><h2 class="d grow">Playoff run</h2><span class="pill">$${c.spent}M</span></div>
    <div class="cap-steps">${CAP_ROUNDS.map((R, k) => { const cls = k < c.wins ? 'W' : c.done && k === c.wins ? 'L' : k === c.wins ? 'next' : ''; return `<div class="cs ${cls}"><b>${PO_SHORT[R.label]}</b><small>${cls === 'W' ? 'Won' : cls === 'L' ? 'Lost' : cls === 'next' ? 'Up next' : 'Game ' + (k + 1)}</small></div>`; }).join('')}</div>
    <p class="mute center" style="font-weight:700;font-size:13px;margin:8px 0 14px">${c.done ? `Run over: ${CAP_BEST[c.wins].toLowerCase()}.` : c.wins >= 4 ? 'Champions!' : `Game ${c.wins + 1} of 4. Win all four to be champion. Lose once and the run is over.`}</p>
    ${next ? `<div class="vs"><div class="side"><div class="helmbig">${myTeamHelm()}</div><b>You</b><span>OVR ${prof.ovr.toFixed(0)}</span></div><div class="x">VS</div>
      <div class="side"><div class="helmbig">${helmet(nc.c1, nc.c2, true)}</div><b>${esc(next.name)}</b><span>OVR ${next.prof.ovr.toFixed(0)}</span></div></div>
      <button class="btn hot big" id="play">${ico('play', 18)} ${esc(CAP_ROUNDS[c.wins].label)}</button>` : ''}
    ${miniField(c.xi)}`);
  $('#q', el).addEventListener('click', () => { toast('Run saved. Continue it any time.'); goTab(App.tab || 'games'); });
  if (next) $('#play', el).addEventListener('click', () => {
    const R = CAP_ROUNDS[c.wins];
    playLiveMatch({ title: R.label === 'Conference Championship' ? 'Conf. Championship' : R.label, badge: 'Salary Cap · ' + R.label, user: { name: myName(), xi: c.xi }, opp: next, seed: c.seed + ':r' + c.wins, po: true,
      onDone: (r, el2) => {
        const s = Store.data.stats;
        if (r.win) { c.wins++; addXP(40 + (c.wins === 4 ? 300 : 0)); Sfx.crowd(true); } else { c.done = true; Sfx.groan(); }
        s.capBest = Math.max(s.capBest || 0, c.wins);
        if (c.done || c.wins >= 4) s.capRuns = (s.capRuns || 0) + 1;
        Store.save();
        if (c.done || c.wins >= 4) Runs.clear('cap'); else Runs.set('cap', { phase: 'hub', c });
        if (c.wins >= 2) unlock('cap2');
        const champ = c.wins === 4;
        if (champ) { unlock('cap_ring'); confetti(); Sfx.trophy(); s.capTitles = capTitles(s) + 1; Store.save(); }
        $('#after', el2).innerHTML = `<div class="outcome ${r.win ? 'win' : 'loss'}" style="margin-top:12px"><h2>${champ ? 'Super Bowl champions!' : r.win ? 'Moving on' : 'Season over'}</h2><p>${champ ? `Built for $${c.spent}M. Front office of the year.` : r.win ? `${CAP_ROUNDS[c.wins].label} is next.` : `Out in the ${R.label}.`}</p></div>
          <div class="actions">${r.win && !champ ? '<button class="btn hot" id="nx">Next round</button>' : `<button class="btn primary" id="re">${ico('refresh', 18)} Build again</button><div class="two"><button class="btn" id="sh">${ico('share', 18)} Share</button><button class="btn" data-act="home">Done</button></div>`}</div>`;
        const nx = $('#nx', el2); if (nx) nx.addEventListener('click', () => CapHub(c));
        const re = $('#re', el2); if (re) re.addEventListener('click', CapStart);
        const sh = $('#sh', el2); if (sh) sh.addEventListener('click', () => shareOut(`CLUTCH Salary Cap 💰\n$${c.spent}M team · OVR ${prof.ovr.toFixed(0)}\n${CAP_ROUNDS.map((x, k) => (k < c.wins ? '🟩' : k === c.wins && !champ ? '🟥' : '⬜')).join('')} ${champ ? 'Champions 🏆' : 'Out in the ' + CAP_ROUNDS[Math.min(c.wins, 3)].label}`));
      } });
  });
}
