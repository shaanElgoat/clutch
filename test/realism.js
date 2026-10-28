// node test/realism.js [N] -> how regular-season record turns into playoff success (1-respin bot drafts, like a decent human)
const TE = require('../js/engine.js');
if (process.env.SIMX) Object.assign(TE.SIM, JSON.parse(process.env.SIMX));
if (process.env.POX) Object.assign(TE.PO_BOOST, JSON.parse(process.env.POX));
const N = +process.argv[2] || 600;
const b = { '0-8': [], '9-10': [], '11-12': [], '13-14': [], '15-16': [], '17': [] };
let w = 0, sb = 0, po = 0, pf = 0, pa = 0, p17 = 0;
for (let i = 0; i < N; i++) {
  const d = TE.createDraft({ seed: 'z' + i, managers: [{ name: 'u' }], respins: 1 });
  while (!d.done) { const m = d.managers[0]; const p = TE.botPick(d, 0, +(process.env.NOISE || 6)); if (m.respins > 0 && p.v < 84) { TE.respin(d); continue; } TE.pick(d, 0, p.pid, p.slot); }
  const r = TE.simSeason([{ name: 'u', xi: d.managers[0].xi }], 'z' + i).results[0];
  w += r.w; sb += r.champion; po += r.stage >= 1; pf += r.pf / 17; pa += r.pa / 17; p17 += r.w === 17;
  const k = r.w <= 8 ? '0-8' : r.w <= 10 ? '9-10' : r.w <= 12 ? '11-12' : r.w <= 14 ? '13-14' : r.w <= 16 ? '15-16' : '17';
  b[k].push(r.champion);
}
console.log('avg wins', (w / N).toFixed(1), ' ppg', (pf / N).toFixed(1) + '-' + (pa / N).toFixed(1), ' playoffs', Math.round(100 * po / N) + '%', ' 17-0', (100 * p17 / N).toFixed(1) + '%', ' SB', (100 * sb / N).toFixed(1) + '%');
console.log('SB rate by regular-season wins: ' + Object.keys(b).map((k) => `${k}: ${b[k].length ? Math.round(100 * b[k].filter(Boolean).length / b[k].length) + '%' : '-'} (n=${b[k].length})`).join('  '));
