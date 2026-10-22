// node test/calib.js [N] -> bot drafts + seasons, report outcome rates (clutch calls auto-chosen)
const TE = require('../js/engine.js');
if (process.env.SIMX) Object.assign(TE.SIM, JSON.parse(process.env.SIMX));
const N = +process.argv[2] || 300;
const st = TE.SQUADS.map(s => TE.squadStrength(s.id)).sort((a, b) => a - b);
console.log('squads', TE.SQUADS.length, 'players', TE.PLAYERS.length, 'opp ovr min/med/max', st[0].toFixed(1), st[st.length >> 1].toFixed(1), st[st.length - 1].toFixed(1));
function botDraft(seed, style) {
  const d = TE.createDraft({ seed, managers: [{ name: 'Bot' }] });
  while (!d.done) {
    const m = d.managers[0];
    const b = style === 'random' ? (() => { const sq = TE.activeSquad(d); const c = []; TE.SQUADS[sq].players.forEach(pid => { if (TE.eligible(pid, m, TE.activeTaken(d))) TE.openSlotsFor(pid, m.xi).forEach(o => c.push({ pid, slot: o.slot })); }); return c[Math.floor(Math.random() * c.length)]; })() : TE.botPick(d, 0, 0);
    if (style === 'good' && m.respins > 0 && b.v < 84) { TE.respin(d); continue; }
    const e = TE.pick(d, 0, b.pid, b.slot); if (e) throw new Error(e);
  }
  return d.managers[0];
}
function run(style, xiFixed) {
  const a = { ovr: 0, w: 0, po: 0, sb: 0, p17: 0, perfect: 0, stages: [0, 0, 0, 0, 0, 0], pf: 0, pa: 0, clutch: 0, cw: 0 };
  for (let i = 0; i < N; i++) {
    const seed = 's' + i;
    const xi = xiFixed || botDraft(seed, style).xi;
    const out = TE.simSeason([{ name: 'Bot', xi }], seed);
    const r = out.results[0];
    a.ovr += r.prof.ovr; a.w += r.w; a.po += r.stage >= 1; a.sb += r.champion; a.p17 += r.perfectReg; a.perfect += r.perfect; a.stages[r.stage]++; a.pf += r.pf / 17; a.pa += r.pa / 17;
    a.clutch += r.clutch.length; a.cw += r.clutch.filter(c => c.win).length;
  }
  const pc = v => (100 * v / N).toFixed(1) + '%';
  console.log((style).padEnd(7), 'ovr', (a.ovr / N).toFixed(1), 'wins', (a.w / N).toFixed(1), 'ppg', (a.pf / N).toFixed(1) + '-' + (a.pa / N).toFixed(1), 'playoffs', pc(a.po), 'SB', pc(a.sb), '17-0', pc(a.p17), 'perfect', pc(a.perfect), 'stages', a.stages.join('/'), 'clutch', (a.clutch / N).toFixed(2), 'won', a.clutch ? (100 * a.cw / a.clutch).toFixed(0) + '%' : '-');
}
run('random'); run('greedy'); run('good');
const xi = []; const used = new Set();
TE.LINEUP.forEach((s) => { let b = null; TE.PLAYERS.forEach(p => { if (used.has(p.name)) return; const pen = TE.fitPenalty(p.pos, s.pos); if (pen === null) return; const v = p.r - pen; if (!b || v > b.v) b = { p, v }; }); xi.push(b.p.id); used.add(b.p.name); });
console.log('dream XI:', xi.map(id => TE.PLAYERS[id].name).join(', '));
run('dream', xi);
