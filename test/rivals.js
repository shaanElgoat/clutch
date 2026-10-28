// node test/rivals.js [N] -> Rivals win chance per division for clubs of different strength (mirrors RIVALS_DIV in js/club.js)
const TE = require('../js/engine.js');
const N = +process.argv[2] || 200;
const src = require('fs').readFileSync(__dirname + '/../js/club.js', 'utf8');
const DIVS = eval('(' + /const RIVALS_DIV = (\{[\s\S]*?\});/.exec(src)[1] + ')');
const sorted = TE.CUR_SQ.slice().sort((a, b) => TE.squadStrength(a) - TE.squadStrength(b));
function club(seed, noise) { const d = TE.createDraft({ seed, managers: [{ name: 'u' }] }); while (!d.done) { const b = TE.botPick(d, 0, noise); TE.pick(d, 0, b.pid, b.slot); } return d.managers[0].xi; }
for (const [label, noise] of [['strong club', 2], ['ok club', 14], ['weak club', 30]]) {
  const xis = Array.from({ length: 40 }, (_, i) => club(label + i, noise));
  const ovr = xis.reduce((a, x) => a + TE.teamProfile(x).ovr, 0) / xis.length;
  const row = [];
  for (let div = 10; div >= 1; div--) {
    const D = DIVS[div]; let w = 0;
    for (let i = 0; i < N; i++) {
      const r = TE.rng('rv' + div + ':' + i);
      const k = Math.max(0, Math.min(sorted.length - 1, Math.floor(D.q * sorted.length + (r() - 0.5) * 3)));
      const b = TE.squadTeam(sorted[k]);
      const opp = { name: 'o', xi: b.xi, prof: Object.assign({}, b.prof, { off: b.prof.off + D.boost, def: b.prof.def + D.boost, ovr: b.prof.ovr + D.boost }) };
      w += TE.singleGame({ name: 'u', xi: xis[i % xis.length] }, opp, 'rv' + div + ':' + i).result.win;
    }
    row.push('D' + div + ' ' + Math.round(100 * w / N) + '%');
  }
  console.log(label.padEnd(12), 'ovr', ovr.toFixed(1), row.join('  '));
}
