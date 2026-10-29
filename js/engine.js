'use strict';
// CLUTCH engine: pure game logic (no DOM). Runs in the browser and in Node for tests.
(function (root) {
  const DATA = typeof module !== 'undefined' ? require('./data.js') : { ERAS, ERA_LABEL, TEAMS, SEASON25, CURRENT, CURRENT_ERA };
  const DATA_VERSION = 4;

  // ---------- seeded randomness ----------
  function hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
    return h >>> 0;
  }
  function rng(seed) {
    let a = (typeof seed === 'number' ? seed : hash(String(seed))) >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pickOne = (r, arr) => arr[Math.floor(r() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function shuffle(r, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // ---------- database ----------
  const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'HC'];
  const POS_NAME = { QB: 'Quarterback', RB: 'Running back', WR: 'Wide receiver', TE: 'Tight end', OL: 'Offensive lineman', DL: 'Defensive lineman', LB: 'Linebacker', CB: 'Cornerback', S: 'Safety', K: 'Kicker', HC: 'Head coach' };
  const PLAYERS = [];  // {id, name, pos, r, team, era, sq}
  const SQUADS = [];   // {id, team, era, key, players:[pid]}
  const POS_ORDER = { QB: 0, RB: 1, WR: 2, TE: 3, OL: 4, DL: 5, LB: 6, CB: 7, S: 8, K: 9, HC: 10 };
  // legends first (keeps every existing card id stable), then the current rosters appended after
  const addSquad = (t, ti, era, roster) => {
      const sq = { id: SQUADS.length, team: ti, era, key: t.id + '-' + era, players: [] };
      String(roster).split('|').forEach((s) => {
        const m = /^(.*) (QB|RB|WR|TE|OL|DL|LB|CB|S|K|HC) (\d+)$/.exec(s.trim());
        if (!m) { if (s.trim()) throw new Error('bad player entry: ' + s); return; }
        const p = { id: PLAYERS.length, name: m[1], pos: m[2], r: +m[3], team: ti, era, sq: sq.id };
        PLAYERS.push(p); sq.players.push(p.id);
      });
      sq.players.sort((a, b) => POS_ORDER[PLAYERS[a].pos] - POS_ORDER[PLAYERS[b].pos] || PLAYERS[b].r - PLAYERS[a].r);
      SQUADS.push(sq);
  };
  DATA.TEAMS.forEach((t, ti) => DATA.ERAS.forEach((era) => { if (t.eras[era]) addSquad(t, ti, era, t.eras[era]); }));
  DATA.TEAMS.forEach((t, ti) => { if (DATA.SEASON25[t.id]) addSquad(t, ti, '25', DATA.SEASON25[t.id]); });
  DATA.TEAMS.forEach((t, ti) => { if (DATA.CURRENT[t.id]) addSquad(t, ti, DATA.CURRENT_ERA, DATA.CURRENT[t.id]); });
  const CUR_SQ = SQUADS.filter((s) => s.era === DATA.CURRENT_ERA).map((s) => s.id);
  const isCurrent = (pid) => PLAYERS[pid].era === DATA.CURRENT_ERA;
  const teamOf = (sq) => DATA.TEAMS[SQUADS[sq].team];
  const eraTag = (era) => "'" + era.slice(0, 2);
  const squadName = (sq) => (SQUADS[sq].era === DATA.CURRENT_ERA ? teamOf(sq).short : teamOf(sq).short + ' ' + eraTag(SQUADS[sq].era));
  const squadLong = (sq) => teamOf(sq).name + ' · ' + DATA.ERA_LABEL[SQUADS[sq].era];

  // ---------- lineup ----------
  // x: 0 (left) .. 100 (right); y: 0 (defence's deep end) .. 100 (offence's backfield)
  const L = (pos, label, x, y) => ({ pos, label, x, y });
  const LINEUP = [
    L('QB', 'QB', 50, 88), L('RB', 'RB', 30, 88), L('WR', 'WR', 9, 63), L('WR', 'WR', 91, 63), L('TE', 'TE', 70, 63), L('OL', 'OL', 50, 63),
    L('DL', 'DL', 38, 37), L('LB', 'LB', 62, 37), L('CB', 'CB', 14, 12), L('S', 'S', 50, 12),
    L('K', 'K', 88, 88), L('HC', 'HC', 86, 12),
  ];
  const SLOTS = LINEUP.length;

  // rating points lost when a player lines up somewhere else; missing = not allowed
  const FIT = {
    QB: { QB: 0 }, RB: { RB: 0, WR: 8, TE: 10 }, WR: { WR: 0, TE: 5, RB: 6 }, TE: { TE: 0, WR: 5, OL: 8 },
    OL: { OL: 0, DL: 10 }, DL: { DL: 0, LB: 5, OL: 10 }, LB: { LB: 0, DL: 5, S: 6 }, CB: { CB: 0, S: 4 },
    S: { S: 0, CB: 4, LB: 7 }, K: { K: 0 }, HC: { HC: 0 },
  };
  const fitPenalty = (playerPos, slotPos) => (FIT[slotPos][playerPos] === undefined ? null : FIT[slotPos][playerPos]);

  const OFF_W = { QB: 0.34, RB: 0.12, WR: 0.14, TE: 0.1, OL: 0.16 };
  const DEF_W = { DL: 0.3, LB: 0.25, CB: 0.25, S: 0.2 };

  // xi: array (one entry per lineup slot) of player ids or null
  function teamProfile(xi, opts) {
    let offS = 0, offW = 0, defS = 0, defW = 0, sum = 0, n = 0, minO = 99, minD = 99;
    let hc = null, k = null;
    const mods = (opts && opts.mods) || null;
    const eff = xi.map((pid, i) => {
      if (pid === null || pid === undefined) return null;
      const p = PLAYERS[pid], sp = LINEUP[i].pos;
      const pen = fitPenalty(p.pos, sp);
      const e = p.r + (mods && mods[pid] ? mods[pid] : 0) - (pen === null ? 15 : pen);
      if (OFF_W[sp]) { offS += e * OFF_W[sp]; offW += OFF_W[sp]; minO = Math.min(minO, e); }
      if (DEF_W[sp]) { defS += e * DEF_W[sp]; defW += DEF_W[sp]; minD = Math.min(minD, e); }
      if (sp === 'HC') hc = e;
      if (sp === 'K') k = e;
      sum += e; n++;
      return e;
    });
    if (!n) return { ovr: 0, off: 0, def: 0, eff, hc: 0, k: 0 };
    const bonus = hc === null ? 0 : (hc - 82) * 0.22; // the head coach lifts (or drags) both units
    const off = offW ? (offS / offW) * 0.85 + minO * 0.15 + bonus : 60;
    const def = defW ? (defS / defW) * 0.85 + minD * 0.15 + bonus : 60;
    const ovr = (off + def) / 2 * 0.85 + (k === null ? 75 : k) * 0.05 + (hc === null ? 75 : hc) * 0.1;
    return { ovr, off, def, eff, hc: hc === null ? 70 : hc, k: k === null ? 70 : k };
  }

  // best real lineup for a historical squad (used for opponents)
  const SQ_CACHE = [];
  const FILL_ORDER = ['QB', 'K', 'HC', 'OL', 'TE', 'RB', 'S', 'LB', 'DL', 'CB', 'WR'];
  function squadTeam(sq) {
    if (SQ_CACHE[sq]) return SQ_CACHE[sq];
    const pool = SQUADS[sq].players.slice();
    const xi = new Array(SLOTS).fill(null);
    const order = LINEUP.map((s, i) => i).sort((a, b) => FILL_ORDER.indexOf(LINEUP[a].pos) - FILL_ORDER.indexOf(LINEUP[b].pos));
    order.forEach((si) => {
      let best = -1, bestE = -99;
      pool.forEach((pid, k) => {
        if (pid === null) return;
        const pen = fitPenalty(PLAYERS[pid].pos, LINEUP[si].pos);
        if (pen === null) return;
        const e = PLAYERS[pid].r - pen;
        if (e > bestE) { bestE = e; best = k; }
      });
      if (best >= 0) { xi[si] = pool[best]; pool[best] = null; }
    });
    const prof = teamProfile(xi);
    // empty slots (thin squads) count as replacement-level players
    const holes = xi.filter((x) => x === null).length;
    prof.off += SIM.OPP - holes * 0.8; prof.def += SIM.OPP - holes * 0.8; prof.ovr += SIM.OPP - holes * 0.8;
    SQ_CACHE[sq] = { sq, name: squadName(sq), xi, prof };
    return SQ_CACHE[sq];
  }
  const squadStrength = (sq) => squadTeam(sq).prof.ovr;
  let STR_MIN = null;
  const spinWeight = (sq) => {
    if (STR_MIN === null) STR_MIN = Math.min(...CUR_SQ.map(squadStrength));
    return SQUADS[sq].era === DATA.CURRENT_ERA ? Math.exp(-SIM.SPINW * (squadStrength(sq) - STR_MIN)) : 1;
  };

  // ---------- draft ----------
  function openSlotsFor(pid, xi, replace) {
    const out = [];
    xi.forEach((v, i) => {
      if (v !== null && !replace) return;
      const pen = fitPenalty(PLAYERS[pid].pos, LINEUP[i].pos);
      if (pen !== null) out.push({ slot: i, pen });
    });
    return out.sort((a, b) => a.pen - b.pen);
  }
  function eligible(pid, mgr, taken, replace) {
    if (taken.indexOf(pid) >= 0) return false;
    const name = PLAYERS[pid].name;
    if (mgr.xi.some((x) => x !== null && PLAYERS[x].name === name)) return false;
    return openSlotsFor(pid, mgr.xi, replace).length > 0;
  }

  function createDraft(o) {
    const n = o.managers.length;
    const st = {
      v: DATA_VERSION, seed: String(o.seed), blind: !!o.blind, multi: n > 1,
      managers: o.managers.map((m) => ({ name: m.name, xi: m.xi ? m.xi.slice() : new Array(SLOTS).fill(null), respins: n > 1 ? 0 : (o.respins === undefined ? 1 : o.respins), picks: [] })),
      replace: !!o.replace, rounds: o.rounds || SLOTS, pool: o.pool || 'current',
      round: 0, turnIdx: 0, spinNo: 0, squad: null, privateSquad: null, taken: [], seen: [], done: false, log: [],
    };
    nextSpin(st);
    return st;
  }
  function order(st) { const idx = st.managers.map((m, i) => i); return st.round % 2 === 0 ? idx : idx.reverse(); }
  const currentManager = (st) => order(st)[st.turnIdx];
  function drawSquad(st) {
    const r = rng(st.seed + ':spin:' + st.spinNo++);
    let sq;
    const list = st.pool === 'all' ? SQUADS.map((s) => s.id) : CUR_SQ;
    // weaker rosters come up more often than the elite ones, so a stacked team has to be earned
    const open = list.filter((q) => st.seen.indexOf(q) < 0);
    const pool = open.length ? open : list;
    const w = pool.map(spinWeight), tot = w.reduce((x, y) => x + y, 0);
    let x = r() * tot; sq = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) { x -= w[i]; if (x <= 0) { sq = pool[i]; break; } }
    st.seen.push(sq);
    return sq;
  }
  function nextSpin(st) { st.squad = drawSquad(st); st.taken = []; st.privateSquad = null; ensurePlayable(st); }
  // if the manager on the clock can't use anyone from this spin, give them a free private spin
  function ensurePlayable(st) {
    const m = st.managers[currentManager(st)];
    for (let guard = 0; guard < 60; guard++) {
      const sq = st.privateSquad !== null ? st.privateSquad : st.squad;
      const taken = st.privateSquad !== null ? [] : st.taken;
      if (SQUADS[sq].players.some((pid) => eligible(pid, m, taken, st.replace))) return;
      st.privateSquad = drawSquad(st);
      st.log.push({ t: 'free', m: currentManager(st) });
    }
  }
  const activeSquad = (st) => (st.privateSquad !== null ? st.privateSquad : st.squad);
  const activeTaken = (st) => (st.privateSquad !== null ? [] : st.taken);
  function respin(st) {
    const mi = currentManager(st), m = st.managers[mi];
    if (st.multi || m.respins <= 0 || st.done) return false;
    m.respins--; nextSpin(st); st.log.push({ t: 'respin', m: mi });
    return true;
  }
  function pick(st, mi, pid, slot) {
    if (st.done) return 'Draft is over';
    if (mi !== currentManager(st)) return 'Not your turn';
    const m = st.managers[mi];
    if (SQUADS[activeSquad(st)].players.indexOf(pid) < 0) return 'Player not in this squad';
    if (!eligible(pid, m, activeTaken(st), st.replace)) return 'Player not available';
    if (m.xi[slot] !== null && !st.replace) return 'Slot already filled';
    if (fitPenalty(PLAYERS[pid].pos, LINEUP[slot].pos) === null) return 'Cannot play there';
    const replaced = m.xi[slot];
    m.xi[slot] = pid;
    m.picks.push({ pid, slot, round: st.round, replaced });
    if (st.privateSquad === null) st.taken.push(pid);
    st.log.push({ t: 'pick', m: mi, pid, slot });
    advance(st);
    return null;
  }
  function advance(st) {
    st.privateSquad = null;
    st.turnIdx++;
    if (st.turnIdx >= st.managers.length) {
      st.turnIdx = 0; st.round++;
      if (st.round >= st.rounds) { st.done = true; st.squad = null; return; }
      nextSpin(st);
    } else ensurePlayable(st);
  }
  // play a card from your binder instead of this spin (once per draft)
  function wildcard(st, mi, pid, slot) {
    if (st.done || st.replace || st.multi || mi !== currentManager(st)) return 'Not allowed';
    const m = st.managers[mi];
    if (m.wild) return 'Wildcard already used';
    if (m.xi[slot] !== null) return 'Slot already filled';
    if (fitPenalty(PLAYERS[pid].pos, LINEUP[slot].pos) === null) return 'Cannot play there';
    if (m.xi.some((x) => x !== null && PLAYERS[x].name === PLAYERS[pid].name)) return 'Already on your team';
    m.xi[slot] = pid; m.wild = true;
    m.picks.push({ pid, slot, round: st.round, wild: true });
    st.log.push({ t: 'wild', m: mi, pid, slot });
    advance(st);
    return null;
  }
  // replace mode: keep your team as it is this round
  function pass(st, mi) {
    if (!st.replace || st.done || mi !== currentManager(st)) return 'Not allowed';
    st.log.push({ t: 'pass', m: mi });
    advance(st);
    return null;
  }
  function botPick(st, mi, noise) {
    const m = st.managers[mi], sq = activeSquad(st), taken = activeTaken(st);
    const r = rng(st.seed + ':bot:' + st.spinNo + ':' + mi + ':' + st.round);
    let best = null;
    SQUADS[sq].players.forEach((pid) => {
      if (!eligible(pid, m, taken, st.replace)) return;
      const p = PLAYERS[pid];
      openSlotsFor(pid, m.xi, st.replace).forEach((o) => {
        const w = { QB: 3, HC: 1, K: -2 }[LINEUP[o.slot].pos] || 0; // value the QB, not the kicker
        const v = p.r - o.pen + w + (r() - 0.5) * (noise === undefined ? 4 : noise);
        if (!best || v > best.v) best = { pid, slot: o.slot, v };
      });
    });
    return best;
  }

  // ---------- game simulation ----------
  const SIM = { TD: 0.17, TDK: 0.08, FG: 0.15, HOME: 1.5, POSS: 13, OPP: 4.5, SPINW: 0.18, POK: 0, RS: 0.4, PS: 1.5, MID: 91 };
  // playoff CPU teams play above their rating, round by round: the ring should be almost impossible
  const PO_BOOST = { 'Wild Card': 4, 'Divisional': 8, 'Conference Championship': 12, 'Super Bowl': 17 };
  function drive(r, off, def, k) {
    const d = off - def;
    const pTD = clamp(SIM.TD * Math.exp(SIM.TDK * d), 0.03, 0.62);
    const pFG = clamp(SIM.FG * Math.exp(0.02 * d) * (0.75 + 0.25 * (k - 70) / 20), 0.04, 0.32);
    const x = r();
    return x < pTD ? 7 : x < pTD + pFG ? 3 : 0;
  }
  const otWinP = (a, b) => clamp(0.5 + 0.025 * (a.ovr - b.ovr), 0.15, 0.85);

  // key players for clutch calls
  function keyPlayers(t) {
    const pick = (pos) => {
      let best = null;
      LINEUP.forEach((s, i) => { if (s.pos === pos && t.xi[i] !== null && (!best || t.prof.eff[i] > best.r)) best = { pid: t.xi[i], r: t.prof.eff[i] }; });
      return best || { pid: null, r: 65 };
    };
    const o = {}; POSITIONS.forEach((p) => { o[p] = pick(p); });
    return o;
  }
  const lastName = (pid, fallback) => {
    if (pid === null) return fallback;
    const n = PLAYERS[pid].name.split(' ');
    return n.length > 1 && /^(Jr\.|Sr\.|II|III)$/.test(n[n.length - 1]) ? n[n.length - 2] : n[n.length - 1];
  };

  // the 2:00 decision. m = margin from the user's view (-8..8)
  function clutchScenario(me, opp, m, r) {
    const kp = keyPlayers(me), N = (pos, fb) => lastName(kp[pos].pid, fb);
    const yard = 20 + Math.floor(r() * 26), fgDist = 33 + Math.floor(r() * 20);
    const pOT = otWinP(me.prof, opp.prof);
    if (m <= 0) {
      const d = opp.prof.def;
      const opts = [
        { id: 'air', title: 'Air it out', desc: `${N('QB', 'Your QB')} goes deep to ${N('WR', 'your WR')}`, td: clamp(0.3 + 0.014 * ((kp.QB.r + kp.WR.r) / 2 - d), 0.08, 0.8), fg: 0 },
        { id: 'te', title: 'Find the tight end', desc: `${N('QB', 'Your QB')} works it to ${N('TE', 'the TE')}`, td: clamp(0.27 + 0.014 * ((kp.QB.r + kp.TE.r) / 2 - d), 0.08, 0.75), fg: 0 },
        { id: 'ground', title: 'Grind it out', desc: `${N('RB', 'Your RB')} behind ${N('OL', 'the line')}, kick if it stalls`, td: clamp(0.22 + 0.012 * ((kp.RB.r + kp.OL.r) / 2 - d), 0.06, 0.65), fg: 0 },
        { id: 'kick', title: 'Play for the field goal', desc: `Short passes, then ${N('K', 'your kicker')} from ${fgDist} yards`, td: 0, fg: clamp(0.66 + 0.013 * (kp.K.r - 80) - 0.008 * (fgDist - 40), 0.3, 0.95) },
      ];
      opts[2].fg = clamp((1 - opts[2].td) * (0.4 + 0.01 * (kp.K.r - 80)), 0, 0.6);
      opts.forEach((o) => {
        // P(win) for the auto-coach: TD/FG outcomes against the margin
        const val = (pts) => (m + pts > 0 ? 1 : m + pts === 0 ? pOT : 0);
        o.win = o.td * val(7) + (o.id === 'ground' ? o.fg * val(3) : o.fg * val(3)) + (1 - o.td - o.fg) * val(0);
        o.note = m + 7 > 0 ? (m + 3 > 0 ? 'Any score wins it' : m + 3 === 0 ? 'TD wins · FG forces OT' : 'Only a TD wins it') : m + 7 === 0 ? 'TD forces overtime' : 'TD forces OT (two-point try)';
        if (o.id === 'kick') o.note = m + 3 > 0 ? 'FG wins it' : m + 3 === 0 ? 'FG forces OT' : "FG won't be enough";
      });
      return { side: 'off', m, yard, opp: opp.name, pOT, options: opts, text: m === 0 ? `Tied. 2:00 left. Your ball at your own ${yard}.` : `Down ${-m}. 2:00 left. Your ball at your own ${yard}.` };
    }
    const o2 = opp.prof.off;
    const opts = [
      { id: 'blitz', title: 'Bring the blitz', desc: `${N('DL', 'Your DL')} and ${N('LB', 'your LB')} come after the QB`, stop: clamp(0.4 + 0.014 * ((kp.DL.r + kp.LB.r) / 2 - o2), 0.1, 0.88) },
      { id: 'cover', title: 'Lock it down', desc: `${N('CB', 'Your CB')} and ${N('S', 'your safety')} take away the deep ball`, stop: clamp(0.42 + 0.014 * ((kp.CB.r + kp.S.r) / 2 - o2), 0.1, 0.88) },
      { id: 'coach', title: 'Trust the coach', desc: `${N('HC', 'Your coach')} dials up the call`, stop: clamp(0.38 + 0.016 * (kp.HC.r - 80) + 0.006 * (me.prof.def - o2), 0.1, 0.85) },
    ];
    const failM = m <= 3 ? m - 3 : m <= 6 ? m - 7 : 0;
    opts.forEach((o) => { o.win = o.stop + (1 - o.stop) * (failM > 0 ? 1 : failM === 0 ? pOT : 0); o.note = failM < 0 ? 'A stop wins it' : 'A stop wins · a TD forces OT'; });
    return { side: 'def', m, yard, opp: opp.name, pOT, options: opts, text: `Up ${m}. 2:00 left. ${opp.name} have the ball at their own ${yard}.` };
  }

  // resolve a clutch call with a fixed roll u (same roll whatever you choose: your choice changes the odds)
  function resolveClutch(sc, optId, u, u2) {
    const o = sc.options.find((x) => x.id === optId) || sc.options[0];
    let pts = 0, theirs = 0, text;
    if (sc.side === 'off') {
      if (u < o.td) {
        // down 8: the touchdown comes with a two-point try to tie (and those 2 points really go on the board)
        pts = sc.m <= -8 ? 8 : 7;
        text = (o.id === 'air' ? 'Dropped in the bucket. TOUCHDOWN!' : o.id === 'te' ? 'Over the middle and in. TOUCHDOWN!' : 'Pounds it in. TOUCHDOWN!') + (pts === 8 ? ' And the two-point try is good!' : '');
      } else if (u < o.td + o.fg) {
        pts = 3;
        text = sc.m + 3 >= 0 ? 'The kick is up… and it\'s GOOD!' : 'The kick is good… but a field goal isn\'t enough.';
      } else text = o.id === 'kick' ? 'Wide right. No good.' : o.id === 'ground' ? 'Stuffed, and the kick misses.' : 'Incomplete. Turnover on downs.';
    } else {
      if (u < o.stop) text = o.id === 'blitz' ? 'SACK! Ball game.' : o.id === 'cover' ? 'INTERCEPTED! Ball game.' : 'Fourth-down stop. Ball game.';
      else {
        // up 8: their touchdown comes with a two-point try to tie
        theirs = sc.m <= 3 ? 3 : sc.m >= 8 ? 8 : 7;
        text = theirs === 3 ? 'They drive and kick the field goal.' : theirs === 8 ? 'They find the end zone and convert the two-point try.' : 'They find the end zone.';
      }
    }
    // the final margin is exactly what went on the scoreboard; a tie goes to overtime
    let m = sc.m + pts - theirs, ot = false;
    let win;
    if (m === 0) { ot = true; win = u2 < sc.pOT; text += win ? ' Then you win it in overtime!' : ' Then they win it in overtime.'; }
    else win = m > 0;
    return { win, ot, pts, theirs, text, choice: o.id };
  }

  // a full game. hooks.clutch(scenario) -> optionId, or undefined to stop (pending)
  function playGame(r, a, b, home, hooks) {
    const ha = home === 1 ? SIM.HOME : home === -1 ? -SIM.HOME : 0;
    const A = { off: a.prof.off + ha / 2, def: a.prof.def + ha / 2, k: a.prof.k }, B = { off: b.prof.off - ha / 2, def: b.prof.def - ha / 2, k: b.prof.k };
    let sa = 0, sb = 0;
    const q = [[0, 0], [0, 0], [0, 0], [0, 0]];
    const ev = []; // {t, s: 0 = a / 1 = b, pts}
    // spread the regulation drives over the four quarters for ANY number of possessions,
    // so every regulation score lands before the 2:00 warning (the Clutch Call starts at 2:00)
    const NP = SIM.POSS - 1, qOf = (i) => Math.min(3, Math.floor((i * 4) / NP));
    const QN = [0, 0, 0, 0], QK = [-1, -1, -1, -1];
    for (let i = 0; i < NP; i++) { const qq = qOf(i); QN[qq]++; if (QK[qq] < 0) QK[qq] = i; }
    for (let i = 0; i < NP; i++) {
      const qa = qOf(i);
      const x = drive(r, A.off, B.def, A.k), y = drive(r, B.off, A.def, B.k);
      sa += x; sb += y; q[qa][0] += x; q[qa][1] += y;
      // the last regulation drives end before the 2:00 warning
      const span = (qa === 3 ? 780 : 900) / QN[qa], k = i - QK[qa], j = ((i * 37 + sa * 7 + sb * 3) % 10) / 10;
      if (x) ev.push({ t: Math.round(qa * 900 + span * (k + 0.15 + 0.3 * j)), s: 0, pts: x });
      if (y) ev.push({ t: Math.round(qa * 900 + span * (k + 0.55 + 0.35 * (1 - j))), s: 1, pts: y });
    }
    const m = sa - sb;
    const uClutch = r(), u2 = r(), r3 = r(), r4 = r();
    if (hooks && hooks.clutch && Math.abs(m) <= 8) {
      const sc = clutchScenario(a, b, m, rng(Math.floor(r3 * 4294967296)));
      sc.us = sa; sc.them = sb; sc.events = ev.slice();
      const choice = hooks.clutch(sc);
      if (choice === undefined) return { pending: sc };
      const res = resolveClutch(sc, choice, uClutch, u2);
      sa += res.pts; sb += res.theirs; q[3][0] += res.pts; q[3][1] += res.theirs;
      if (res.pts) ev.push({ t: 3594, s: 0, pts: res.pts });
      if (res.theirs) ev.push({ t: 3594, s: 1, pts: res.theirs });
      if (res.ot) { const add = r4 < 0.6 ? 3 : 6; if (res.win) sa += add; else sb += add; ev.push({ t: 3600 + 260, s: res.win ? 0 : 1, pts: add }); }
      return { a: sa, b: sb, q, ev, ot: res.ot, clutch: { text: sc.text, choice, result: res.text, win: res.win, title: sc.options.find((o) => o.id === choice).title } };
    }
    // no decision: play out the final possessions
    const x = drive(r, A.off, B.def, A.k), y = drive(r, B.off, A.def, B.k);
    sa += x; sb += y; q[3][0] += x; q[3][1] += y;
    if (x) ev.push({ t: 3522, s: 0, pts: x });
    if (y) ev.push({ t: 3588, s: 1, pts: y });
    let ot = false;
    if (sa === sb) { ot = true; const add = r4 < 0.6 ? 3 : 6; const w = u2 < otWinP(a.prof, b.prof) ? 0 : 1; if (w === 0) sa += add; else sb += add; ev.push({ t: 3600 + 300, s: w, pts: add }); }
    ev.sort((p, o) => p.t - o.t);
    return { a: sa, b: sb, q, ev, ot };
  }

  function roundRobin(ids) {
    const n = ids.length, arr = ids.slice(), rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const rd = [];
      for (let i = 0; i < n / 2; i++) { const h = arr[i], a = arr[n - 1 - i]; rd.push(r % 2 === 0 ? [h, a] : [a, h]); }
      rounds.push(rd);
      arr.splice(1, 0, arr.pop());
    }
    return rounds;
  }

  const STAGES = ['Missed playoffs', 'Wild Card', 'Divisional', 'Conference', 'Super Bowl', 'Champions'];

  // users: [{name, xi}]. opts.choices[ui] = clutch choices made so far; opts.interactive[ui] = ask the user.
  // Returns {pending:{ui, scenario}} when a user decision is needed, else per-user results.
  function simSeason(users, seed, opts) {
    opts = opts || {};
    const choices = users.map((u, i) => (opts.choices && opts.choices[i] ? opts.choices[i].slice() : []));
    const used = users.map(() => 0);
    const world = rng(seed + ':world');
    const byStrength = CUR_SQ.slice().sort((a, b) => squadStrength(a) - squadStrength(b));
    const fillers = shuffle(world, CUR_SQ).slice(0, 16 - users.length);
    const teams = users.map((u, i) => ({ key: 'U' + i, user: i, name: u.name, xi: u.xi, prof: teamProfile(u.xi, { mods: u.mods }) }))
      .concat(fillers.map((sq) => { const t = squadTeam(sq); return { key: 'S' + sq, sq, name: t.name, xi: t.xi, prof: t.prof }; }));
    const mr = rng(seed + ':m:' + users.map((u) => u.xi.join('.')).join('/'));
    const tl = users.map(() => []);
    const clutchLog = users.map(() => []);
    let pending = null;

    const game = (hi, ai, week, label, neutral, prime) => {
      if (pending) return null;
      const boost = label ? (PO_BOOST[label] || 0) * SIM.POK : 0;
      // regular season: "any given Sunday" squeezes ratings toward the middle, so upsets happen over 17 weeks;
      // playoffs use full ratings, so the better team (usually the one with the better record) wins more often
      const rs = label ? SIM.PS : SIM.RS;
      const sq = (v) => SIM.MID + (v - SIM.MID) * rs;
      const pump = (t) => (boost && t.user === undefined) || rs !== 1 ? Object.assign({}, t, { prof: Object.assign({}, t.prof, { off: sq(t.prof.off) + (t.user === undefined ? boost : 0), def: sq(t.prof.def) + (t.user === undefined ? boost : 0), ovr: sq(t.prof.ovr) + (t.user === undefined ? boost : 0) }) }) : t;
      const h = pump(teams[hi]), a = pump(teams[ai]);
      const userSide = h.user !== undefined && a.user === undefined ? 0 : a.user !== undefined && h.user === undefined ? 1 : -1;
      // ask the user only in the playoffs, only if they're interactive, and only vs a CPU team
      let hooks = null;
      if ((label !== null || prime) && userSide >= 0) {
        const ui = userSide === 0 ? h.user : a.user;
        hooks = { clutch: (sc) => {
          if (used[ui] < choices[ui].length) return choices[ui][used[ui]++];
          if (opts.interactive && opts.interactive[ui]) { sc.label = label || 'Week ' + week + ' · Primetime'; sc.home = !neutral && (userSide === 0); sc.neutral = !!neutral; pending = { ui, scenario: sc }; return undefined; }
          const best = sc.options.slice().sort((x, y) => y.win - x.win)[0].id;
          choices[ui].push(best); used[ui]++;
          return best;
        } };
      }
      // simulate from the user's perspective so clutch margins are theirs
      let res, sH, sA;
      if (userSide === 1) {
        res = playGame(mr, a, h, neutral ? 0 : -1, hooks);
        if (res.pending) return null;
        sH = res.b; sA = res.a;
      } else {
        res = playGame(mr, h, a, neutral ? 0 : 1, hooks);
        if (res.pending) return null;
        sH = res.a; sA = res.b;
      }
      const winner = sH > sA ? hi : ai;
      [[hi, ai, sH, sA, true], [ai, hi, sA, sH, false]].forEach(([me, op, pf, pa, isHome]) => {
        if (teams[me].user === undefined) return;
        const ui = teams[me].user;
        // scoring plays from this team's side (s: 0 = this team)
        const mine = userSide === 1 ? me === ai : me === hi;
        const plays = (res.ev || []).map((x) => ({ t: x.t, s: (x.s === 0) === mine ? 0 : 1, pts: x.pts }));
        const ev = { plays, comp: label === null ? 'R' : 'P', week, label: label || 'Week ' + week + (prime ? ' · Primetime' : ''), prime: !!prime, opp: teams[op].name, oppKey: teams[op].key, home: !neutral && isHome, neutral: !!neutral, pf, pa, res: pf > pa ? 'W' : 'L', ot: res.ot };
        if (res.clutch && (userSide === 0 ? hi : ai) === me) { ev.clutch = res.clutch; clutchLog[ui].push({ label: ev.label, win: res.clutch.win }); }
        tl[ui].push(ev);
      });
      return { w: winner, sH, sA };
    };
    const wrapPending = () => ({ pending, choices, partial: { timeline: tl.map((x) => x.slice()), posByWeek: posByWeekRef.map((x) => x.slice()) } });
    let posByWeekRef = users.map(() => []);

    // --- regular season: 15 round-robin weeks + 2 rematch weeks = 17 games each ---
    const table = teams.map((t, i) => ({ i, key: t.key, name: t.name, user: t.user, w: 0, l: 0, pf: 0, pa: 0 }));
    const rr = roundRobin(teams.map((t, i) => i));
    const weeks = rr.concat([rr[3].map(([h, a]) => [a, h]), rr[8].map(([h, a]) => [a, h])]);
    const posByWeek = posByWeekRef;
    const sortTable = (t) => t.slice().sort((x, y) => y.w - x.w || (y.pf - y.pa) - (x.pf - x.pa) || y.pf - x.pf || x.name.localeCompare(y.name));
    // each user's two toughest regular-season opponents are primetime games (with a clutch call)
    const prime = users.map((u, ui) => {
      const opp = [];
      weeks.forEach((wk, wi) => wk.forEach(([h, a]) => {
        const o = h === ui ? a : a === ui ? h : -1;
        if (o >= 0 && teams[o].user === undefined) opp.push({ wi, s: teams[o].prof.ovr });
      }));
      return opp.sort((x, y) => y.s - x.s).slice(0, 2).map((x) => x.wi);
    });
    weeks.forEach((wk, wi) => {
      if (pending) return;
      wk.forEach(([h, a]) => {
        const ui = teams[h].user !== undefined ? teams[h].user : teams[a].user;
        const g = game(h, a, wi + 1, null, false, ui !== undefined && prime[ui].indexOf(wi) >= 0);
        if (!g) return;
        table[h].pf += g.sH; table[h].pa += g.sA; table[a].pf += g.sA; table[a].pa += g.sH;
        if (g.w === h) { table[h].w++; table[a].l++; } else { table[a].w++; table[h].l++; }
      });
      const snap = sortTable(table);
      users.forEach((u, ui) => posByWeek[ui].push(snap.findIndex((t) => t.user === ui) + 1));
    });
    if (pending) return wrapPending();
    const standings = sortTable(table);

    // --- playoffs: 7 seeds, the 1 seed gets a bye ---
    const seeds = standings.slice(0, 7).map((t) => t.i);
    const reached = users.map(() => 0);
    seeds.forEach((ti) => { if (teams[ti].user !== undefined) reached[teams[ti].user] = 1; });
    const bye = teams[seeds[0]];
    if (bye.user !== undefined) reached[bye.user] = 2;
    let alive = [seeds[0]];
    const W = (g) => (g ? g.w : null);
    const wc = [[1, 6], [2, 5], [3, 4]].map(([x, y]) => W(game(seeds[x], seeds[y], 18, 'Wild Card', false)));
    if (pending) return wrapPending();
    wc.forEach((w) => { alive.push(w); if (teams[w].user !== undefined) reached[teams[w].user] = 2; });
    const seedOf = (ti) => seeds.indexOf(ti);
    alive.sort((x, y) => seedOf(x) - seedOf(y));
    const div = [W(game(alive[0], alive[3], 19, 'Divisional', false)), W(game(alive[1], alive[2], 19, 'Divisional', false))];
    if (pending) return wrapPending();
    div.forEach((w) => { if (teams[w].user !== undefined) reached[teams[w].user] = 3; });
    div.sort((x, y) => seedOf(x) - seedOf(y));
    const conf = W(game(div[0], div[1], 20, 'Conference Championship', false));
    if (pending) return wrapPending();
    if (teams[conf].user !== undefined) reached[teams[conf].user] = 4;
    // the other conference's champion: a strong historic team
    const sbPool = byStrength.slice(Math.floor(byStrength.length * 0.6)).filter((s) => fillers.indexOf(s) < 0);
    const sbOppSq = pickOne(rng(seed + ':sb'), sbPool.length ? sbPool : byStrength);
    const sbT = squadTeam(sbOppSq);
    teams.push({ key: 'S' + sbOppSq + 'x', sq: sbOppSq, name: sbT.name, xi: sbT.xi, prof: sbT.prof });
    const champ = W(game(conf, teams.length - 1, 21, 'Super Bowl', true));
    if (pending) return wrapPending();
    if (teams[champ].user !== undefined) reached[teams[champ].user] = 5;

    return {
      choices,
      results: users.map((u, ui) => {
        const row = table.find((t) => t.user === ui);
        const seedN = seeds.indexOf(row.i) + 1;
        const timeline = tl[ui];
        const stage = reached[ui];
        const allW = timeline.every((e) => e.res === 'W');
        return {
          name: u.name, prof: teams[ui].prof, w: row.w, l: row.l, pf: row.pf, pa: row.pa, seed: seedN || null, stage, stageName: STAGES[stage],
          champion: stage === 5, perfectReg: row.w === 17, perfect: stage === 5 && allW, totalW: timeline.filter((e) => e.res === 'W').length, totalL: timeline.filter((e) => e.res === 'L').length,
          timeline, standings: standings.map((t) => ({ name: t.name, user: t.user, w: t.w, l: t.l, pd: t.pf - t.pa })), posByWeek: posByWeek[ui],
          clutch: clutchLog[ui], score: stage * 1000 + row.w * 10 + (row.pf - row.pa) / 1000,
        };
      }),
    };
  }

  // ---------- single games (Gauntlet) ----------
  function singleGame(user, opp, seed, opts) {
    opts = opts || {};
    const me = { key: 'U0', user: 0, name: user.name, xi: user.xi, prof: teamProfile(user.xi, { mods: user.mods }) };
    const choices = (opts.choices || []).slice();
    let used = 0, pend = null;
    const hooks = { clutch: (sc) => {
      if (used < choices.length) return choices[used++];
      if (opts.interactive) { pend = sc; return undefined; }
      const best = sc.options.slice().sort((x, y) => y.win - x.win)[0].id;
      choices.push(best); used++; return best;
    } };
    const res = playGame(rng(seed), me, opp, 1, hooks);
    if (res.pending) { pend.label = opts.label || 'Gauntlet'; pend.home = true; return { pending: pend, choices }; }
    return { result: { us: res.a, them: res.b, q: res.q, plays: res.ev || [], ot: res.ot, clutch: res.clutch || null, win: res.a > res.b }, choices };
  }

  // the best player at every spot, ever (no duplicates)
  let DREAM = null;
  function dreamXI() {
    if (DREAM) return DREAM;
    const xi = [], used = new Set();
    LINEUP.forEach((s) => {
      let b = null;
      PLAYERS.forEach((p) => { if (used.has(p.name) || p.pos !== s.pos) return; if (!b || p.r > b.r) b = p; });
      xi.push(b.id); used.add(b.name);
    });
    return (DREAM = xi);
  }
  function customTeam(name, xi, targetOvr) {
    const prof = teamProfile(xi);
    if (targetOvr) { const d = targetOvr - prof.ovr; prof.off += d; prof.def += d; prof.ovr += d; }
    return { name, xi, prof };
  }
  // ten rungs of rising difficulty; the last is the all-time GOAT team
  function gauntletLadder(seed) {
    const r = rng(seed + ':ladder');
    const sorted = CUR_SQ.slice().sort((a, b) => squadStrength(a) - squadStrength(b));
    const qs = [0.1, 0.28, 0.44, 0.58, 0.7, 0.8, 0.87, 0.93, 0.975];
    const used = [];
    const rungs = qs.map((q) => {
      let k = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length + (r() - 0.5) * 2)));
      while (used.indexOf(sorted[k]) >= 0) k = (k + 1) % sorted.length;
      used.push(sorted[k]);
      return squadTeam(sorted[k]);
    });
    const top = squadStrength(sorted[sorted.length - 1]);
    rungs.push(customTeam('The GOATs', dreamXI(), top + 6));
    return rungs;
  }

  // ---------- dynasty: players age between seasons ----------
  function ageTeam(xi, mods, seed, year) {
    const r = rng(seed + ':age:' + year);
    const out = Object.assign({}, mods);
    const changes = [];
    xi.forEach((pid, i) => {
      if (pid === null) return;
      const pos = LINEUP[i].pos;
      const roll = r();
      let d = pos === 'HC' || pos === 'K' ? Math.round(roll * 2 - 1) : roll < 0.15 ? 2 : roll < 0.35 ? 1 : roll < 0.55 ? 0 : roll < 0.8 ? -1 : roll < 0.94 ? -3 : -5;
      const cur = out[pid] || 0;
      d = Math.max(d, -12 - cur);
      if (d) { out[pid] = cur + d; changes.push({ pid, slot: i, d, now: PLAYERS[pid].r + cur + d }); }
    });
    return { mods: out, changes };
  }

  function verdict(r) {
    if (r.perfect) return { title: 'PERFECT SEASON', sub: `${r.totalW}-0 and a ring. Only the '72 Dolphins can relate.` };
    if (r.champion) return { title: 'SUPER BOWL CHAMPIONS', sub: r.perfectReg ? '17-0 and the ring. Legendary.' : 'Confetti. Parade. Ring.' };
    if (r.perfectReg) return { title: '17-0', sub: 'A perfect regular season… then heartbreak.' };
    if (r.stage === 4) return { title: 'CONFERENCE CHAMPIONS', sub: 'Lost on the biggest stage.' };
    if (r.stage === 3) return { title: 'CONFERENCE FINALIST', sub: 'One win from the Super Bowl.' };
    if (r.stage >= 1) return { title: 'PLAYOFF TEAM', sub: `Out in the ${r.stage === 1 ? 'Wild Card round' : 'Divisional round'}.` };
    if (r.w >= 9) return { title: 'JUST MISSED', sub: 'Winning record, no playoffs.' };
    if (r.w <= 4) return { title: 'TANKED', sub: 'At least you get a high draft pick.' };
    return { title: 'MISSED PLAYOFFS', sub: 'Back to the drawing board.' };
  }

  const API = {
    DATA, DATA_VERSION, PLAYERS, SQUADS, CUR_SQ, isCurrent, eraTag, POSITIONS, POS_NAME, LINEUP, SLOTS, FIT, SIM, STAGES,
    hash, rng, shuffle, fitPenalty, teamProfile, squadTeam, squadStrength, squadName, squadLong, teamOf,
    createDraft, botPick, currentManager, activeSquad, activeTaken, eligible, openSlotsFor, respin, pick,
    playGame, simSeason, verdict, clutchScenario, resolveClutch, pass, wildcard, singleGame, dreamXI, customTeam, gauntletLadder, ageTeam,
  };
  if (typeof module !== 'undefined') module.exports = API; else root.TE = API;
})(typeof window !== 'undefined' ? window : globalThis);
