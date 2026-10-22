'use strict';
// GAMEDAY engine: a full game where the user calls every offensive play and picks the defence
// for every opponent drive. Pure and deterministic (seed + the user's calls => same game).
(function (root) {
  const TE = typeof module !== 'undefined' ? require('./engine.js') : root.TE;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const PLAYS = {
    run: { name: 'Run it', icon: '🏃', keys: ['RB', 'OL'], vs: ['DL', 'LB'], blurb: 'Pound the rock' },
    short: { name: 'Quick pass', icon: '🎯', keys: ['QB', 'TE'], vs: ['LB', 'S'], blurb: 'Move the chains' },
    deep: { name: 'Deep shot', icon: '🚀', keys: ['QB', 'WR'], vs: ['CB', 'S'], blurb: 'Big play or bust' },
    pa: { name: 'Play-action', icon: '🎭', keys: ['QB', 'WR2', 'RB'], vs: ['LB', 'CB'], blurb: 'Sell the run' },
  };
  const DEFS = {
    blitz: { name: 'Blitz', icon: '⚡', keys: ['DL', 'LB'], blurb: 'Pressure the QB. Burned by quick throws.' },
    zone: { name: 'Zone', icon: '🧱', keys: ['S', 'LB'], blurb: 'Take away the deep ball.' },
    man: { name: 'Man press', icon: '🔒', keys: ['CB', 'S'], blurb: 'Lock up the receivers.' },
    runstop: { name: 'Run stop', icon: '🛑', keys: ['DL', 'LB'], blurb: 'Stack the box. Open to play-action.' },
  };
  // how each defensive call changes each play type
  const M = {
    run: { blitz: { y: 1.3, big: 0.05 }, zone: { y: 1.1 }, man: { y: 1.12 }, runstop: { y: 0.35, big: -0.05 } },
    short: { blitz: { c: 0.11, sack: 1.2 }, zone: { c: -0.13 }, man: { c: -0.03 }, runstop: { c: 0.09 } },
    deep: { blitz: { c: 0.1, sack: 2.6 }, zone: { c: -0.22, int: 2 }, man: { c: 0.03 }, runstop: { c: 0.16 } },
    pa: { blitz: { c: -0.08, sack: 2.2 }, zone: { c: -0.06 }, man: { c: 0.02 }, runstop: { c: 0.2, y: 1.35 } },
  };

  // key players + ratings for a team built from a lineup
  function roster(team) {
    const out = {}, wrs = [];
    TE.LINEUP.forEach((s, i) => {
      const pid = team.xi[i];
      const r = team.prof.eff[i] === null || team.prof.eff[i] === undefined ? 68 : team.prof.eff[i];
      const name = pid === null || pid === undefined ? 'Backup' : lastName(TE.PLAYERS[pid].name);
      if (s.pos === 'WR') wrs.push({ r, name, pid });
      else out[s.pos] = { r, name, pid };
    });
    wrs.sort((a, b) => b.r - a.r);
    out.WR = wrs[0] || { r: 68, name: 'Backup' };
    out.WR2 = wrs[1] || { r: 66, name: 'Backup' };
    ['QB', 'RB', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'HC'].forEach((p) => { if (!out[p]) out[p] = { r: 68, name: 'Backup' }; });
    // a small boost/penalty for the overall unit strength (depth that isn't on the card)
    out.offUnit = team.prof.off; out.defUnit = team.prof.def;
    return out;
  }
  function lastName(n) {
    const t = n.split(' ');
    let l = t[t.length - 1];
    if (/^(Jr\.|Sr\.|II|III)$/.test(l) && t.length > 2) l = t[t.length - 2];
    return l;
  }
  const avg = (R, keys) => keys.reduce((s, k) => s + R[k].r, 0) / keys.length;

  function create(user, opp, seed) {
    const g = {
      seed: String(seed), n: 0,
      us: { name: user.name, R: roster(user) }, them: { name: opp.name, R: roster(opp) },
      score: { us: 0, them: 0 }, quarter: 1, clock: 900, ot: false,
      poss: 'us', ball: 30, down: 1, togo: 10, defCall: null,
      events: [], drives: [], over: false, stats: { us: { pass: 0, rush: 0, td: {} }, them: { pass: 0, rush: 0, td: {} } },
      calls: [],
    };
    return g;
  }
  const rand = (g) => TE.rng(g.seed + ':' + (g.n++))();
  function gauss(g, m, s) { const u = Math.max(1e-9, rand(g)), v = rand(g); return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  const twoMin = (g) => (g.quarter === 2 || g.quarter >= 4) && g.clock <= 120;
  function tick(g, secs) {
    const scale = twoMin(g) ? 1 : 2.25;
    g.clock -= secs * scale;
    if (g.clock <= 0) {
      if (g.quarter < 4 || (g.quarter === 4 && g.score.us === g.score.them)) {
        g.quarter++; g.clock = g.quarter === 5 ? 600 : 900;
        if (g.quarter === 5) g.ot = true;
        if (g.quarter === 3) return 'half';
        if (g.quarter === 5) return 'ot';
      } else { g.clock = 0; g.over = true; return 'end'; }
    }
    return null;
  }

  // one snap. side = 'us' | 'them' (who has the ball). Returns an event.
  function snap(g, side, play, defCall) {
    const O = g[side].R, D = g[side === 'us' ? 'them' : 'us'].R;
    const P = PLAYS[play], mm = M[play][defCall] || {};
    const rel = avg(O, P.keys) - avg(D, P.vs) + (O.offUnit - D.defUnit) * 0.35;
    const adj = rel / 10;
    const ev = { side, play, defCall, yards: 0, kind: 'gain', clockUse: 30 };
    const st = g.stats[side];
    if (play === 'run') {
      if (rand(g) < 0.012) { ev.kind = 'fumble'; ev.clockUse = 30; return ev; }
      let y = gauss(g, 5.9 + 0.9 * adj, 3.6) * (mm.y || 1);
      if (rand(g) < clamp(0.05 + 0.02 * adj + (mm.big || 0), 0.005, 0.15)) y += 12 + rand(g) * 35;
      ev.yards = Math.round(clamp(y, -4, 99)); ev.clockUse = 38; st.rush += ev.yards;
      ev.who = O.RB.name;
      return ev;
    }
    const base = { short: { c: 0.74, sack: 0.035, int: 0.015, y: [10, 4] }, deep: { c: 0.46, sack: 0.055, int: 0.042, y: [33, 9] }, pa: { c: 0.62, sack: 0.05, int: 0.025, y: [19, 6] } }[play];
    const ol = (O.OL.r - D.DL.r) / 100;
    if (rand(g) < clamp(base.sack * (mm.sack || 1) - ol * 0.25, 0.01, 0.3)) {
      ev.kind = 'sack'; ev.yards = -Math.round(4 + rand(g) * 6); ev.clockUse = 36; ev.who = D.DL.name; return ev;
    }
    if (rand(g) < clamp(base.int * (mm.int || 1) - (O.QB.r - 85) * 0.002, 0.005, 0.15)) { ev.kind = 'int'; ev.clockUse = 12; ev.who = D.CB.name; return ev; }
    const comp = clamp(base.c + 0.045 * adj + (mm.c || 0), 0.12, 0.9);
    if (rand(g) < comp) {
      let y = gauss(g, base.y[0] + adj * (play === 'deep' ? 3 : 1.2), base.y[1]) * (mm.y || 1);
      if (play === 'short' && rand(g) < 0.09) y += 10 + rand(g) * 30;
      ev.yards = Math.round(clamp(y, 1, 99)); ev.clockUse = 32; st.pass += ev.yards;
      ev.who = play === 'deep' ? O.WR.name : play === 'short' ? (rand(g) < 0.55 ? O.TE.name : O.WR2.name) : O.WR2.name;
      ev.qb = O.QB.name;
    } else { ev.kind = 'inc'; ev.clockUse = 8; ev.qb = O.QB.name; }
    return ev;
  }

  function fgProb(R, dist) { return clamp(0.99 - (dist - 20) * 0.017 + (R.K.r - 85) * 0.01, 0.04, 0.99); }

  // apply an offensive outcome to the state. returns the event decorated with what happened
  function apply(g, ev) {
    const side = ev.side;
    const other = side === 'us' ? 'them' : 'us';
    ev.quarterBefore = g.quarter;
    if (ev.kind === 'int' || ev.kind === 'fumble') {
      changePoss(g, other, 100 - clamp(g.ball + (ev.kind === 'int' ? 12 : 0), 1, 99));
      ev.result = ev.kind === 'int' ? 'INTERCEPTED' : 'FUMBLE';
      ev.turnover = true;
    } else {
      g.ball += ev.yards;
      if (g.ball >= 100) {
        g.score[side] += 7; ev.result = 'TOUCHDOWN'; ev.td = true;
        g.stats[side].td[ev.who] = (g.stats[side].td[ev.who] || 0) + 1;
        if (g.ot) g.over = true;
        changePoss(g, other, 30);
      } else if (g.ball <= 0) {
        g.score[other] += 2; ev.result = 'SAFETY'; changePoss(g, other, 35);
      } else {
        g.togo -= ev.yards;
        if (g.togo <= 0) { g.down = 1; g.togo = Math.min(10, 100 - g.ball); ev.first = true; }
        else if (g.down === 4) { ev.result = 'TURNOVER ON DOWNS'; ev.turnover = true; changePoss(g, other, 100 - g.ball); }
        else g.down++;
      }
    }
    const t = tick(g, ev.clockUse);
    if (t === 'half') { changePoss(g, g.halfRecv || 'them', 25); ev.half = true; }
    if (t === 'ot') { ev.otStart = true; changePoss(g, rand(g) < 0.5 ? 'us' : 'them', 25); }
    ev.score = { us: g.score.us, them: g.score.them };
    ev.ballAfter = g.ball; ev.possAfter = g.poss; ev.down = g.down; ev.togo = g.togo; ev.quarter = g.quarter; ev.clock = g.clock;
    g.events.push(ev);
    return ev;
  }
  function changePoss(g, to, ball) { g.poss = to; g.ball = ball; g.down = 1; g.togo = 10; g.defCall = null; }

  function kick(g, side, type) {
    const R = g[side].R, other = side === 'us' ? 'them' : 'us';
    const ev = { side, play: type, kind: type, clockUse: type === 'punt' ? 10 : 6 };
    if (type === 'punt') {
      const land = Math.min(g.ball + 38 + Math.round(rand(g) * 10), 100);
      ev.yards = land - g.ball;
      changePoss(g, other, land >= 100 ? 20 : 100 - land);
      ev.result = 'PUNT';
    } else {
      const dist = 100 - g.ball + 17;
      ev.dist = dist; ev.who = R.K.name;
      if (rand(g) < fgProb(R, dist)) { g.score[side] += 3; ev.result = 'FIELD GOAL'; ev.good = true; if (g.ot) g.over = true; changePoss(g, other, 30); }
      else { ev.result = 'NO GOOD'; changePoss(g, other, 100 - Math.max(g.ball, 20)); }
    }
    const t = tick(g, ev.clockUse);
    if (t === 'half') { changePoss(g, g.halfRecv || 'them', 25); ev.half = true; }
    if (t === 'ot') { ev.otStart = true; changePoss(g, rand(g) < 0.5 ? 'us' : 'them', 25); }
    ev.score = { us: g.score.us, them: g.score.them };
    ev.ballAfter = g.ball; ev.possAfter = g.poss; ev.down = g.down; ev.togo = g.togo; ev.quarter = g.quarter; ev.clock = g.clock;
    g.events.push(ev);
    return ev;
  }

  // ---------- AI ----------
  // defences have readable tendencies: that's what a smart play-caller exploits
  function aiDefense(g) {
    const r = rand(g), d = g.down, t = g.togo;
    let w = { blitz: 1, zone: 1, man: 1, runstop: 1 };
    if (t <= 2) w = { blitz: 0.6, zone: 0.3, man: 0.6, runstop: 3 };
    else if (d >= 3 && t >= 7) w = { blitz: 2.4, zone: 1.8, man: 0.7, runstop: 0.1 };
    else if (d === 1) w = { blitz: 0.6, zone: 0.8, man: 0.9, runstop: 2.2 };
    else if (d === 2 && t >= 7) w = { blitz: 1.4, zone: 1.3, man: 1, runstop: 0.5 };
    if (twoMin(g) && g.score.them > g.score.us) { w.zone += 2.5; w.runstop *= 0.3; }
    return pickW(w, r);
  }
  function aiOffense(g, side) {
    const R = g[side].R, r = rand(g), d = g.down, t = g.togo;
    const lead = g.score[side] - g.score[side === 'us' ? 'them' : 'us'];
    let w = { run: 1.1 + (R.RB.r - 85) / 20, short: 1.1, deep: 0.45 + (R.WR.r - 85) / 25, pa: 0.5 };
    if (t <= 2) { w.run += 1.4; w.deep *= 0.5; }
    if (d >= 3 && t >= 7) { w.run *= 0.3; w.deep += 0.5; w.short += 0.6; }
    if (g.quarter >= 4 && lead > 0) w.run += 1.2;
    if (g.quarter >= 4 && lead < 0 && g.clock < 300) { w.run *= 0.3; w.deep += 0.6; }
    Object.keys(w).forEach((k) => { w[k] = Math.max(0.05, w[k]); });
    return pickW(w, r);
  }
  function pickW(w, r) {
    const tot = Object.values(w).reduce((a, b) => a + b, 0);
    let x = r * tot;
    for (const k in w) { x -= w[k]; if (x <= 0) return k; }
    return Object.keys(w)[0];
  }
  function aiFourth(g, side) {
    const R = g[side].R, dist = 100 - g.ball + 17;
    const lead = g.score[side] - g.score[side === 'us' ? 'them' : 'us'];
    const late = g.quarter >= 4 && g.clock < 240;
    if (late && lead < 0 && (lead < -3 || fgProb(R, dist) < 0.5)) return 'go';
    if (late && lead < 0 && lead >= -3 && fgProb(R, dist) >= 0.5) return 'fg';
    if (dist <= 55 && fgProb(R, dist) > 0.45) return g.togo <= 1 && g.ball >= 60 && !late ? 'go' : 'fg';
    if (g.togo <= 1 && g.ball >= 45) return 'go';
    return 'punt';
  }

  // ---------- public API ----------
  // what does the user need to decide right now?
  function next(g) {
    if (g.over) return { need: 'over' };
    if (g.poss === 'us') {
      const opts = Object.keys(PLAYS).map((id) => playOption(g, id));
      if (g.down === 4) {
        const dist = 100 - g.ball + 17;
        if (dist <= 62) opts.push({ id: 'fg', name: 'Field goal', icon: '🦶', who: g.us.R.K.name, odds: fgProb(g.us.R, dist), sub: `${dist}-yarder` });
        opts.push({ id: 'punt', name: 'Punt', icon: '👟', who: '', odds: null, sub: 'Flip the field' });
      }
      return { need: 'off', options: opts };
    }
    return { need: 'def', options: Object.keys(DEFS).map((id) => ({ id, name: DEFS[id].name, icon: DEFS[id].icon, who: DEFS[id].keys.map((k) => g.us.R[k].name).join(' & '), sub: DEFS[id].blurb })) };
  }
  function playOption(g, id) {
    const P = PLAYS[id], O = g.us.R, D = g.them.R;
    const rel = avg(O, P.keys) - avg(D, P.vs);
    return { id, name: P.name, icon: P.icon, who: P.keys.map((k) => O[k].name).filter((v, i, a) => a.indexOf(v) === i).join(' + '), edge: rel, sub: P.blurb };
  }

  // the user calls an offensive play (or fg/punt on 4th down)
  function callPlay(g, id) {
    if (g.over || g.poss !== 'us') return null;
    g.calls.push(id);
    if (id === 'fg' || id === 'punt') { const ev = kick(g, 'us', id); afterUs(g); return [ev]; }
    const dc = aiDefense(g);
    const ev = apply(g, snap(g, 'us', id, dc));
    afterUs(g);
    return [ev];
  }
  function afterUs(g) { if (g.quarter > 4 && !g.ot) g.over = true; endCheck(g); }
  function endCheck(g) {
    if (g.over) return;
    if (g.quarter > 4 && !g.ot) g.over = true;
    if (g.ot && (g.score.us !== g.score.them)) g.over = true;
    if (g.quarter > 5) g.over = true; // OT ran out: tie stands -> settle below
    if (g.over && g.score.us === g.score.them) { if (rand(g) < 0.5) g.score.us += 3; else g.score.them += 3; }
  }
  // the user picks a defence; the opponent's whole drive is simulated
  function callDefense(g, id) {
    if (g.over || g.poss !== 'them') return null;
    g.calls.push('D:' + id);
    const evs = [];
    let guard = 0;
    while (!g.over && g.poss === 'them' && guard++ < 30) {
      let ev;
      if (g.down === 4) {
        const ch = aiFourth(g, 'them');
        if (ch === 'punt' || ch === 'fg') { ev = kick(g, 'them', ch); evs.push(ev); break; }
      }
      // mostly the user's call, sometimes the coordinator mixes it up
      const dc = rand(g) < 0.8 ? id : pickW({ blitz: 1, zone: 1, man: 1, runstop: 1 }, rand(g));
      ev = apply(g, snap(g, 'them', aiOffense(g, 'them'), dc));
      evs.push(ev);
      if (ev.half || ev.otStart) break;
    }
    endCheck(g);
    return evs;
  }
  // let the coordinator call the rest of your drive
  function autoPlay(g) {
    if (g.poss !== 'us') return null;
    if (g.down === 4) {
      const ch = aiFourth(g, 'us');
      if (ch !== 'go') return callPlay(g, ch);
    }
    return callPlay(g, aiOffense(g, 'us'));
  }
  function result(g) {
    const s = g.stats.us;
    const mvp = Object.keys(s.td).sort((a, b) => s.td[b] - s.td[a])[0] || g.us.R.QB.name;
    return { us: g.score.us, them: g.score.them, win: g.score.us > g.score.them, ot: g.ot, pass: s.pass, rush: s.rush, oppYds: g.stats.them.pass + g.stats.them.rush, td: s.td, mvp, plays: g.calls.length };
  }
  const fmtClock = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const yardText = (ball) => (ball === 50 ? 'Midfield' : ball < 50 ? 'Own ' + ball : 'Opp ' + (100 - ball));

  const API = { PLAYS, DEFS, create, next, callPlay, callDefense, autoPlay, result, fmtClock, yardText, fgProb, roster };
  if (typeof module !== 'undefined') module.exports = API; else root.GD = API;
})(typeof window !== 'undefined' ? window : globalThis);
