'use strict';
// CONNECTIONS: a daily puzzle. 16 names, 4 hidden groups of 4 (a team, a position, an era, a first
// name...). Pick four that belong together. Four mistakes and you're out. Every name fits exactly one
// group, so there's always a single answer, even if a few look like they could go elsewhere.

const CONN_COLORS = ['#f5c542', '#34c77b', '#4d8bff', '#a06bff'];
const CONN_EMOJI = ['🟨', '🟩', '🟦', '🟪'];
const CONN_POS = { QB: 'Quarterbacks', RB: 'Running backs', WR: 'Wide receivers', TE: 'Tight ends', DL: 'Defensive linemen', LB: 'Linebackers', CB: 'Cornerbacks', S: 'Safeties', K: 'Kickers', HC: 'Head coaches' };
const CONN_ERA = { '90s': 'Played in the 1990s', '00s': 'Played in the 2000s', '10s': 'Played in the 2010s', '26': 'On a 2026 roster' };

// one entry per person (all his cards rolled together)
let CONN_PEOPLE = null;
function connPeople() {
  if (CONN_PEOPLE) return CONN_PEOPLE;
  const by = {};
  TE.PLAYERS.forEach((p) => {
    const k = p.name;
    const x = by[k] || (by[k] = { name: p.name, first: p.name.split(' ')[0], teams: new Set(), eras: new Set(), pos: new Set(), r: 0 });
    x.teams.add(p.team); x.eras.add(p.era); x.pos.add(p.pos); x.r = Math.max(x.r, p.r);
  });
  // well-known names only, and no linemen (too obscure to be fun)
  CONN_PEOPLE = Object.values(by).filter((x) => x.r >= 84 && !x.pos.has('OL') && x.name.indexOf(' ') > 0);
  return CONN_PEOPLE;
}
const connFits = (c, p) => (c.t === 'team' ? p.teams.has(c.v) : c.t === 'pos' ? p.pos.has(c.v) : c.t === 'era' ? p.eras.has(c.v) : c.t === 'first' ? p.first === c.v : c.t === 'r' ? p.r >= c.v : false);
const connLabel = (c) => (c.t === 'team' ? 'Played for the ' + TE.DATA.TEAMS[c.v].name : c.t === 'pos' ? CONN_POS[c.v] : c.t === 'era' ? CONN_ERA[c.v] : c.t === 'first' ? `First name ${c.v}` : `Rated ${c.v}+`);

function connFor(seed) {
  const r = TE.rng('conn1:' + seed), P = connPeople();
  const pick = (a) => a[Math.floor(r() * a.length)];
  // first names shared by enough well-known players to make a group
  const firsts = {};
  P.forEach((p) => { firsts[p.first] = (firsts[p.first] || 0) + 1; });
  const FIRSTS = Object.keys(firsts).filter((k) => firsts[k] >= 6);
  for (let tries = 0; tries < 600; tries++) {
    // easiest to hardest: a position, a team, an era (or elite rating), then a first name (or a 2nd team)
    const cats = [
      { t: 'pos', v: pick(Object.keys(CONN_POS)) },
      { t: 'team', v: Math.floor(r() * TE.DATA.TEAMS.length) },
      r() < 0.8 ? { t: 'era', v: pick(Object.keys(CONN_ERA)) } : { t: 'r', v: 96 },
      FIRSTS.length && r() < 0.75 ? { t: 'first', v: pick(FIRSTS) } : { t: 'team', v: Math.floor(r() * TE.DATA.TEAMS.length) },
    ];
    if (cats[3].t === 'team' && cats[3].v === cats[1].v) continue;
    const groups = [];
    for (let k = 0; k < 4; k++) {
      const c = cats[k];
      const cand = P.filter((p) => connFits(c, p) && cats.every((o, j) => j === k || !connFits(o, p)));
      if (cand.length < 4) break;
      // lean toward the bigger names so it's guessable
      const top = cand.sort((a, b) => b.r - a.r || (a.name < b.name ? -1 : 1)).slice(0, 14);
      const names = TE.shuffle(r, top.map((p) => p.name)).slice(0, 4);
      groups.push({ label: connLabel(c), names });
    }
    if (groups.length === 4) return { groups, order: TE.shuffle(r, groups.flatMap((g) => g.names)) };
  }
  return null;
}

function ConnectionsGame(practiceSeed) {
  tipOnce('conn');
  const daily = !practiceSeed;
  const seed = daily ? dayKey() : practiceSeed;
  const C = connFor(seed);
  if (!C) { toast('No puzzle today, try practice'); return ConnectionsGame('p' + rid()); }
  const saved = daily && puzzle('conn');
  const st = saved && saved.v === 1 ? saved : { v: 1, solved: [], guesses: [], left: 4, done: false, win: false, order: C.order };
  let sel = [];
  const save = () => { if (daily) savePuzzle('conn', st); };
  const groupOf = (n) => C.groups.findIndex((g) => g.names.includes(n));
  const el = go(`
    <div class="topbar"><button class="icon-btn" data-act="home">${ico('back', 20)}</button><div class="grow"><h2 class="d">Connections</h2><div class="mute" style="font-weight:700;font-size:12px">${daily ? 'Daily #' + dailyNumber(dayKey()) : 'Practice'}</div></div></div>
    <p class="mute" style="font-weight:600;margin:0 0 12px;font-size:14px">Find <b>four groups of four</b> players who share something: a team, a position, an era, a name… Every player fits only one group.</p>
    <div id="solved" class="conn-solved"></div>
    <div id="board" class="conn-board"></div>
    <div id="left" class="conn-left"></div>
    <div id="ctl"></div>
    <div id="after"></div>`);
  const bar = (gi) => { const g = C.groups[gi]; return `<div class="conn-group" style="background:${CONN_COLORS[gi]}"><b>${esc(g.label)}</b><span>${g.names.map(esc).join(', ')}</span></div>`; };
  const draw = () => {
    $('#left', el).innerHTML = st.done ? '' : `Mistakes left ${'<i class="conn-dot"></i>'.repeat(st.left)}${'<i class="conn-dot off"></i>'.repeat(4 - st.left)}`;
    // solved groups (in the order you got them), then everything you missed once the game's over
    const shown = st.done ? st.solved.concat([0, 1, 2, 3].filter((g) => !st.solved.includes(g))) : st.solved;
    $('#solved', el).innerHTML = shown.map(bar).join('');
    const rest = st.order.filter((n) => !shown.includes(groupOf(n)));
    $('#board', el).innerHTML = rest.map((n) => `<button class="conn-tile ${sel.includes(n) ? 'on' : ''}" data-n="${esc(n)}"><span>${esc(n)}</span></button>`).join('');
    $$('[data-n]', el).forEach((b) => b.addEventListener('click', () => {
      if (st.done) return;
      const n = b.dataset.n;
      if (sel.includes(n)) sel = sel.filter((x) => x !== n); else if (sel.length < 4) sel.push(n); else return;
      Sfx.tap(); draw();
    }));
    $('#ctl', el).innerHTML = st.done ? '' : `<div class="conn-ctl"><button class="btn small" id="shuf">${ico('refresh', 16)} Shuffle</button><button class="btn small" id="clr" ${sel.length ? '' : 'disabled'}>Deselect</button><button class="btn primary small" id="sub" ${sel.length === 4 ? '' : 'disabled'}>Submit</button></div>`;
    if (!st.done) {
      $('#shuf', el).addEventListener('click', () => { st.order = st.order.slice().sort(() => Math.random() - 0.5); save(); Sfx.tap(); draw(); });
      $('#clr', el).addEventListener('click', () => { sel = []; draw(); });
      $('#sub', el).addEventListener('click', submit);
    }
    if (st.done) after();
  };
  const submit = () => {
    if (sel.length !== 4 || st.done) return;
    const key = sel.slice().sort().join('|');
    if (st.guesses.some((g) => g.slice().sort().join('|') === key)) { toast('Already guessed'); return; }
    st.guesses.push(sel.slice());
    const gs = sel.map(groupOf), counts = [0, 1, 2, 3].map((g) => gs.filter((x) => x === g).length), best = Math.max(...counts);
    if (best === 4) {
      st.solved.push(counts.indexOf(4)); sel = [];
      Sfx.good(); buzz(20);
      if (st.solved.length === 4) { st.done = true; st.win = true; finish(); }
    } else {
      st.left--;
      Sfx.bad(); buzz([40, 30, 40]);
      $$('.conn-tile.on', el).forEach(shake);
      if (best === 3 && st.left > 0) toast('One away…');
      if (st.left <= 0) { st.done = true; finish(); }
    }
    save();
    setTimeout(draw, best === 4 ? 0 : 350);
  };
  const finish = () => {
    sel = [];
    addXP(st.win ? 40 + st.left * 20 : 15);
    Obj.hit('puzzle');
    if (st.win) { confetti(); Sfx.trophy(); if (st.left === 4) unlock('conn_perfect'); } else Sfx.groan();
  };
  const after = () => {
    const rows = st.guesses.map((g) => g.map((n) => CONN_EMOJI[groupOf(n)]).join('')).join('\n');
    $('#after', el).innerHTML = `<div class="hero-card center" style="margin-top:14px"><div class="d" style="font-size:30px">${st.win ? (st.left === 4 ? 'Perfect!' : 'Solved!') : 'So close'}</div><div class="mute" style="font-weight:700">${st.win ? `${4 - st.left} mistake${4 - st.left === 1 ? '' : 's'}` : `${st.solved.length}/4 groups found`}</div></div>
      <div class="actions"><button class="btn primary" id="sh">${ico('share', 18)} Share</button><button class="btn" id="pr">${ico('refresh', 18)} Practice puzzle</button></div>`;
    $('#sh', el).addEventListener('click', () => shareOut(`CLUTCH Connections${daily ? ' #' + dailyNumber(dayKey()) : ''} 🏈\n${rows}`));
    $('#pr', el).addEventListener('click', () => ConnectionsGame('p' + rid()));
  };
  draw();
  return el;
}
