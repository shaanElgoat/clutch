// node test/tiers.js [N] -> how often a 1-respin greedy draft lands each OVR tier, and how that tier does
const TE = require('../js/engine.js');
if (process.env.SIMX) Object.assign(TE.SIM, JSON.parse(process.env.SIMX));
const N = +process.argv[2] || 400;
const tiers = [[0, 88, 'under 88'], [88, 91, '88-91'], [91, 94, '91-94'], [94, 200, '94+']];
const agg = tiers.map(() => ({ n: 0, w: 0, sb: 0, po: 0 }));
for (let i = 0; i < N; i++) {
  const d = TE.createDraft({ seed: 't' + i, managers: [{ name: 'u' }], respins: 1 });
  while (!d.done) { const m = d.managers[0]; const b = TE.botPick(d, 0, 4); if (m.respins > 0 && b.v < 84) { TE.respin(d); continue; } TE.pick(d, 0, b.pid, b.slot); }
  const r = TE.simSeason([{ name: 'u', xi: d.managers[0].xi }], 't' + i).results[0];
  const k = tiers.findIndex(([a, b]) => r.prof.ovr >= a && r.prof.ovr < b);
  const A = agg[k]; A.n++; A.w += r.w; A.sb += r.champion; A.po += r.stage >= 1;
}
tiers.forEach(([, , l], k) => { const A = agg[k]; console.log(l.padEnd(9), 'share', (100 * A.n / N).toFixed(0).padStart(3) + '%', ' wins', A.n ? (A.w / A.n).toFixed(1) : '-', ' playoffs', A.n ? (100 * A.po / A.n).toFixed(0) + '%' : '-', ' SB', A.n ? (100 * A.sb / A.n).toFixed(1) + '%' : '-'); });
