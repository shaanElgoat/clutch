// node test/arena.js [N] -> Salary Cap run odds and Draft Duel series odds (logic mirrors js/arena.js)
const TE = require('../js/engine.js');
const N = +process.argv[2] || 300;
const src = require('fs').readFileSync(__dirname + '/../js/arena.js', 'utf8');
const CAP = +/const CAP = (\d+)/.exec(src)[1];
const capPrice = (r) => Math.max(1, Math.round(1.6 * Math.pow(1.13, r - 70)));
const ROUNDS = eval('[' + /const CAP_ROUNDS = \[([\s\S]*?)\];/.exec(src)[1] + ']');
function offers(seed, slot, xi) {
  const pos = TE.LINEUP[slot].pos, r = TE.rng(seed + ':o:' + slot + ':0');
  const used = new Set(xi.filter((x) => x !== null).map((x) => TE.PLAYERS[x].name));
  const pool = TE.PLAYERS.filter((p) => TE.isCurrent(p.id) && p.pos === pos && !used.has(p.name));
  const tier = (lo, hi) => { const t = pool.filter((p) => p.r >= lo && p.r <= hi); return t.length ? t[Math.floor(r() * t.length)] : null; };
  return [tier(89, 99) || tier(86, 99), tier(80, 88), tier(0, 77) || tier(0, 80)].filter(Boolean);
}
function capRun(seed, style) {
  const xi = new Array(TE.SLOTS).fill(null); let spent = 0;
  for (let s = 0; s < TE.SLOTS; s++) {
    const left = CAP - spent, rem = TE.SLOTS - s - 1, ok = offers(seed, s, xi).filter((p) => capPrice(p.r) <= left - rem * 3);
    const pace = style === 'smart' ? (left - rem * 3) / (rem + 1) * 1.7 : 1e9;
    const c = ok.filter((p) => capPrice(p.r) <= pace).sort((a, b) => b.r - a.r)[0] || ok.sort((a, b) => capPrice(a.r) - capPrice(b.r))[0];
    xi[s] = c.id; spent += capPrice(c.r);
  }
  const sorted = TE.CUR_SQ.slice().sort((a, b) => TE.squadStrength(a) - TE.squadStrength(b));
  let w = 0;
  for (let k = 0; k < 4; k++) {
    const R = ROUNDS[k], rr = TE.rng(seed + ':opp:' + k);
    const i = Math.max(0, Math.min(sorted.length - 1, Math.round(R.q * (sorted.length - 1) + (rr() - 0.5) * 3)));
    const b = TE.squadTeam(sorted[i]);
    const opp = { name: b.name, xi: b.xi, prof: Object.assign({}, b.prof, { off: b.prof.off + R.boost, def: b.prof.def + R.boost, ovr: b.prof.ovr + R.boost }) };
    if (!TE.singleGame({ name: 'u', xi }, opp, seed + ':r' + k).result.win) break;
    w++;
  }
  return { w, ovr: TE.teamProfile(xi).ovr };
}
for (const style of ['greedy', 'smart']) {
  const h = [0, 0, 0, 0, 0]; let ovr = 0;
  for (let i = 0; i < N; i++) { const r = capRun('c' + i, style); h[r.w]++; ovr += r.ovr; }
  console.log('cap', style.padEnd(6), 'ovr', (ovr / N).toFixed(1), 'rounds won 0..4', h.map((x) => (100 * x / N).toFixed(0) + '%').join(' '));
}
for (const [nm, noise, edge] of [['rookie', 18, -1.5], ['pro', 7, 1.5], ['shark', 0, 4]]) {
  let series = 0, games = 0, gw = 0;
  for (let i = 0; i < N; i++) {
    const d = TE.createDraft({ seed: 'd' + nm + i, managers: [{ name: 'u' }, { name: 'r' }] });
    while (!d.done) { const m = TE.currentManager(d); const b = TE.botPick(d, m, m === 0 ? 4 : noise); TE.pick(d, m, b.pid, b.slot); }
    const p0 = TE.teamProfile(d.managers[1].xi), opp = { name: 'r', xi: d.managers[1].xi, prof: Object.assign({}, p0, { off: p0.off + edge, def: p0.def + edge, ovr: p0.ovr + edge }) };
    let w = 0, l = 0, g = 0;
    while (w < 2 && l < 2) { g++; if (TE.singleGame({ name: 'u', xi: d.managers[0].xi }, opp, 'd' + i + ':g' + g).result.win) w++; else l++; }
    series += w === 2; games += g; gw += w;
  }
  console.log('duel', nm.padEnd(6), 'series win', (100 * series / N).toFixed(0) + '%', 'game win', (100 * gw / games).toFixed(0) + '%');
}
