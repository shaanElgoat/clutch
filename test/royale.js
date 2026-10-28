// node test/royale.js [N] -> Battle Royale odds (mirrors BR_ROUNDS + loot in js/royale.js)
const TE = require('../js/engine.js');
const N = +process.argv[2] || 300;
const src = require('fs').readFileSync(__dirname + '/../js/royale.js', 'utf8');
const ROUNDS = eval('[' + /const BR_ROUNDS = \[([\s\S]*?)\];/.exec(src)[1] + ']');
const sorted = TE.CUR_SQ.slice().sort((a, b) => TE.squadStrength(a) - TE.squadStrength(b));
function team(seed, noise) {
  const d = TE.createDraft({ seed, managers: [{ name: 'u' }] });
  while (!d.done) { const b = TE.botPick(d, 0, noise); TE.pick(d, 0, b.pid, b.slot); }
  return d.managers[0].xi;
}
for (const [label, noise] of [['strong club', 2], ['ok club', 14], ['weak club', 30]]) {
  const out = new Array(ROUNDS.length + 1).fill(0); let ovr = 0;
  for (let i = 0; i < N; i++) {
    const xi = team('t' + label + i, noise); ovr += TE.teamProfile(xi).ovr;
    const mods = {}; let k = 0, shield = 0;
    for (; k < ROUNDS.length; k++) {
      const R = ROUNDS[k], rr = TE.rng('br' + i + ':' + k);
      const oxi = team('opp' + i + ':' + k, R.skill), p = TE.teamProfile(oxi);
      const opp = { name: 'o', xi: oxi, prof: Object.assign({}, p, { off: p.off + R.storm, def: p.def + R.storm, ovr: p.ovr + R.storm }) };
      const res = TE.singleGame({ name: 'u', xi, mods }, opp, 'br' + i + ':' + k).result;
      if (!res.win) { if (shield) { shield--; continue; } break; }
      // average loot: +1.5 to everyone, or a shield a third of the time
      if (rr() < 0.2) shield = Math.min(1, shield + 1); else xi.forEach((pid) => { if (pid !== null) mods[pid] = (mods[pid] || 0) + 0.8; });
    }
    out[k]++;
  }
  console.log(label.padEnd(12), 'ovr', (ovr / N).toFixed(1), 'rounds survived 0..7', out.map((x) => (100 * x / N).toFixed(0) + '%').join(' '), ' VICTORY', (100 * out[ROUNDS.length] / N).toFixed(1) + '%');
}
