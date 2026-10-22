// node test/gameday.js [N] -> play Gameday games with bot play-callers vs strong legendary teams
const TE = require('../js/engine.js');
const GD = require('../js/gameday.js');
const N = +process.argv[2] || 200;
const sorted = TE.SQUADS.map((s) => s.id).sort((a, b) => TE.squadStrength(b) - TE.squadStrength(a));
function draft(seed) { const d = TE.createDraft({ seed, managers: [{ name: 'Me' }] }); while (!d.done) { const b = TE.botPick(d, 0, 0); TE.pick(d, 0, b.pid, b.slot); } return d.managers[0].xi; }
function play(style, oppRank) {
  let w = 0, pts = 0, opp = 0, plays = 0, ot = 0;
  for (let i = 0; i < N; i++) {
    const xi = draft('g' + i);
    const me = { name: 'Me', xi, prof: TE.teamProfile(xi) };
    const op = TE.squadTeam(sorted[oppRank]);
    const g = GD.create(me, op, 'gd' + i + style);
    for (let k = 0; k < 400; k++) {
      const n = GD.next(g);
      if (n.need === 'over') break;
      if (n.need === 'off') {
        if (style === 'auto') GD.autoPlay(g);
        else if (style === 'random') GD.callPlay(g, n.options[Math.floor(Math.random() * n.options.length)].id);
        else {
          const best = n.options.filter((o) => o.edge !== undefined).sort((a, b) => b.edge - a.edge)[0];
          GD.callPlay(g, g.down === 4 && g.togo > 2 ? (n.options.find((o) => o.id === 'fg') ? 'fg' : 'punt') : best.id);
        }
      } else GD.callDefense(g, style === 'random' ? ['blitz', 'zone', 'man', 'runstop'][Math.floor(Math.random() * 4)] : 'zone');
    }
    const r = GD.result(g); w += r.win; pts += r.us; opp += r.them; plays += r.plays; ot += r.ot;
  }
  console.log(style.padEnd(7), 'vs #' + (oppRank + 1), TE.squadTeam(sorted[oppRank]).name.padEnd(14), 'win', (100 * w / N).toFixed(0) + '%', 'score', (pts / N).toFixed(1) + '-' + (opp / N).toFixed(1), 'calls/game', (plays / N).toFixed(1), 'OT', ot);
}
['auto', 'random', 'edge'].forEach((s) => { play(s, 0); play(s, 15); });
