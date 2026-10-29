// node test/clutch.js [N] -> every Clutch Call's result must agree with the final score
const TE = require('../js/engine.js');
const N = +process.argv[2] || 400;
let calls = 0, bad = 0, scoreBad = 0, ot = 0, contradict = 0, otNotTied = 0, lateScores = 0, liveMismatch = 0;
const ex = [];
for (let i = 0; i < N; i++) {
  const d = TE.createDraft({ seed: 'c' + i, managers: [{ name: 'u' }] });
  while (!d.done) { const b = TE.botPick(d, 0, 6); TE.pick(d, 0, b.pid, b.slot); }
  const xi = d.managers[0].xi;
  // single games (Rivals / Duel / Salary Cap) with every possible choice
  const opp = TE.squadTeam(TE.CUR_SQ[i % TE.CUR_SQ.length]);
  const first = TE.singleGame({ name: 'u', xi }, opp, 'g' + i, { interactive: true });
  if (first.pending) for (const o of first.pending.options) {
    const r = TE.singleGame({ name: 'u', xi }, opp, 'g' + i, { choices: [o.id] }).result;
    calls++; if (r.ot) ot++;
    const sumUs = r.plays.filter((p) => p.s === 0).reduce((a, p) => a + p.pts, 0), sumThem = r.plays.filter((p) => p.s === 1).reduce((a, p) => a + p.pts, 0);
    if (r.clutch.win !== r.win || r.win !== (r.us > r.them)) { bad++; if (ex.length < 4) ex.push(`m=${first.pending.m} ${o.id}: clutch.win=${r.clutch.win} game ${r.us}-${r.them} | "${r.clutch.result}"`); }
    if (sumUs !== r.us || sumThem !== r.them) scoreBad++;
    if (r.ot) { const reg = (s) => r.plays.filter((p) => p.s === s && p.t < 3600).reduce((a, p) => a + p.pts, 0); if (reg(0) !== reg(1)) { otNotTied++; if (ex.length < 10) ex.push(`OT BUT NOT TIED m=${first.pending.m} ${o.id}: regulation ${reg(0)}-${reg(1)}, final ${r.us}-${r.them} | "${r.clutch.result}"`); } }
    // a "GOOD!"/"TOUCHDOWN!" headline that ends in a loss, or a stop that ends in a loss, reads as a contradiction
    if (!r.win && /GOOD!|TOUCHDOWN!/.test(r.clutch.result) && !/not enough|overtime/i.test(r.clutch.result)) { contradict++; if (ex.length < 8) ex.push(`CONTRADICTS m=${first.pending.m} ${o.id}: lost ${r.us}-${r.them} but text "${r.clutch.result}"`); }
  }
  // every regulation score must come before the 2:00 warning (that's when the Clutch Call starts)
  const g1 = first.pending ? TE.singleGame({ name: 'u', xi }, opp, 'g' + i, { choices: [first.pending.options[0].id] }).result : null;
  const late = g1 ? g1.plays.filter((p) => p.t >= 3480 && p.t < 3594) : [];
  // and the live view up to 2:00 must show exactly the score the Clutch Call screen shows
  if (first.pending) { const ev = first.pending.events || []; const a = ev.filter((p) => p.s === 0).reduce((x, p) => x + p.pts, 0), b = ev.filter((p) => p.s === 1).reduce((x, p) => x + p.pts, 0); if (a !== first.pending.us || b !== first.pending.them || ev.some((p) => p.t >= 3480)) { liveMismatch++; if (ex.length < 12) ex.push(`LIVE ${a}-${b} vs CLUTCH SCREEN ${first.pending.us}-${first.pending.them}`); } }
  if (late.length) { lateScores++; if (ex.length < 12) ex.push('regulation score after 2:00 at t=' + late.map((p) => p.t).join(',')); }
}
console.log({ calls, ot, resultMismatch: bad, scoreMismatch: scoreBad, contradictoryText: contradict, otButRegulationNotTied: otNotTied, clutchGamesWithScoresAfter2min: lateScores, liveVsClutchScreenMismatch: liveMismatch });
ex.forEach((e) => console.log(' ', e));
