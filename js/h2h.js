'use strict';
// TOURNAMENT (online rooms, 2-8 friends).
// Everyone drafts their own team at the same time from the same spins (nobody waits on anyone), then
// the teams play live games in a bracket: 2 players = one game, 3-8 = a bracket where the best drafted
// team is the top seed and the top seeds get byes.
//
// Over MQTT, next to the room state (net.js):
//   CODE/x/ID     retained {gid, xi}: a finished draft
//   CODE/state    room state; the host copies finished teams into state.game.xi and runs the rounds
// Game results come from the deterministic engine (TE.singleGame), so every phone shows the same games.
const ROUND_MS = 16000;    // how long each round's live games run before results post
const H2H_MAX = 8;

const H2H = {
  game: null, tick: null, drafts: {}, shownKey: null, rewarded: {},
  onState(st) {
    const g = st.game;
    if (!this.game || this.game.gid !== g.gid) { this.shownKey = null; this.rewarded = {}; }
    this.game = g;
    Net.inGame = true;
    if (!this.tick) this.tick = setInterval(() => this.loop(), 500);
    const me = Net.myId;
    if (g.phase === 'draft' && g.ids.includes(me) && !this.drafted(me)) {
      if (!(App.g && App.g.cfg && App.g.cfg.mode === 'tourney')) this.draft();
      return;
    }
    this.render();
  },
  stop() { if (this.tick) { clearInterval(this.tick); this.tick = null; } this.game = null; },
  name(id) { return (Net.recs[id] && Net.recs[id].name) || 'Player'; },
  xi(id) { return (this.game.xi && this.game.xi[id]) || (this.drafts[id] && this.drafts[id].gid === this.game.gid ? this.drafts[id].xi : null); },
  drafted(id) { return !!this.xi(id); },
  ovr(id) { const xi = this.xi(id); return xi ? TE.teamProfile(xi).ovr : 0; },
  // ---------- drafting ----------
  draft() {
    const g = this.game;
    openDraft({ mode: 'tourney', seed: g.seed + ':draft', managers: [{ name: Net.name || myName() }], respins: 1, title: 'Tournament draft',
      onDone: (st) => {
        const xi = st.managers[0].xi;
        this.drafts[Net.myId] = { gid: g.gid, xi };
        Net.pub('x/' + Net.myId, { gid: g.gid, xi }, true);
        this.shownKey = null; this.render();
      } });
  },
  onXi(id, raw) {
    if (!raw) return;
    let m; try { m = JSON.parse(raw); } catch (_) { return; }
    this.drafts[id] = m;
    if (this.game) this.render();
  },
  // ---------- the host runs the event ----------
  loop() {
    const g = this.game;
    if (!g || !Net.active || !Net.state || Net.state.status !== 'h2h' || !Net.isHost) return;
    const now = Date.now();
    if (g.phase === 'draft' && g.ids.every((id) => this.drafted(id))) this.startGames(g.ids);
    else if (g.phase === 'games' && !g.done && now - g.roundAt > ROUND_MS) {
      const B = this.bracket();
      if (g.round < B.roundsCount - 1) Net.bump({ game: Object.assign({}, g, { round: g.round + 1, roundAt: now }) });
      else Net.bump({ game: Object.assign({}, g, { done: true }) });
    }
  },
  startGames(ids) {
    const g = this.game, xi = {};
    ids.forEach((id) => { xi[id] = this.xi(id); });
    Net.bump({ game: Object.assign({}, g, { ids, xi, phase: 'games', round: 0, roundAt: Date.now() }) });
  },
  // ---------- screens ----------
  render() {
    const g = this.game; if (!g) return;
    if (App.g && App.g.cfg && App.g.cfg.mode === 'tourney' && !App.g.st.done) return; // still drafting
    if (g.phase === 'draft') return this.waitScreen();
    return this.gamesScreen();
  },
  waitScreen() {
    const g = this.game, done = g.ids.filter((id) => this.drafted(id));
    const key = 'w:' + done.join(',');
    if (this.shownKey === key) return;
    this.shownKey = key;
    const el = go(`<div class="topbar"><button class="icon-btn" id="lv">${ICON.back}</button><h2 class="d grow">Tournament</h2>${netPill()}</div>
      <div class="hh-wait"><div class="hh-spin">${ico('timer', 28)}</div><b>Waiting for everyone to finish drafting</b><small>${done.length}/${g.ids.length} done</small></div>
      <div class="group">${g.ids.map((id) => `<div class="lrow" style="cursor:default"><div class="grow"><b>${esc(this.name(id))}${id === Net.myId ? ' (you)' : ''}</b><small>${this.drafted(id) ? `Team locked in · OVR ${this.ovr(id).toFixed(1)}` : Net.here(id) ? 'Drafting…' : 'Away'}</small></div>${this.drafted(id) ? `<span class="lmeta hot">${ico('check', 12)}</span>` : ''}</div>`).join('')}</div>
      ${Net.isHost && done.length >= 2 && done.length < g.ids.length ? `<button class="btn" id="go" style="width:100%;margin-top:12px">Start without the others (${done.length} players)</button>` : ''}`);
    App.screen = 'h2h-wait';
    $('#lv', el).addEventListener('click', h2hLeave);
    const b = $('#go', el); if (b) b.addEventListener('click', () => this.startGames(done));
  },
  bracket() {
    const g = this.game, ids = g.ids.slice();
    const size = ids.length <= 2 ? 2 : ids.length <= 4 ? 4 : 8;
    // the best drafted team gets the top seed (and the bye, if there is one)
    const order = ids.slice().sort((a, b) => this.ovr(b) - this.ovr(a) || (a < b ? -1 : 1));
    const POS = { 2: [0, 1], 4: [0, 3, 1, 2], 8: [0, 7, 3, 4, 1, 6, 2, 5] }[size];
    let slots = POS.map((s) => (order[s] === undefined ? null : order[s]));
    const matches = [];
    for (let r = 0; (1 << r) < size; r++) {
      const next = [];
      for (let m = 0; m < slots.length / 2; m++) {
        const a = slots[2 * m], b = slots[2 * m + 1], id = 'r' + r + 'm' + m;
        const M = { id, r, a, b };
        if (a === undefined || b === undefined) M.state = 'tbd';
        else if (a === null || b === null) { M.state = 'bye'; M.winner = a === null ? b : a; }
        else {
          M.res = TE.singleGame({ name: this.name(a), xi: g.xi[a] }, { name: this.name(b), xi: g.xi[b], prof: TE.teamProfile(g.xi[b]) }, g.seed + ':' + id).result;
          M.winner = M.res.win ? a : b;
          M.state = g.round > r || g.done ? 'done' : g.round === r ? 'live' : 'tbd';
        }
        next.push(M.state === 'bye' || M.state === 'done' ? M.winner : undefined);
        matches.push(M);
      }
      slots = next;
    }
    return { size, matches, roundsCount: Math.log2(size), champ: g.done ? matches[matches.length - 1].winner : undefined };
  },
  gamesScreen() {
    const g = this.game, me = Net.myId, B = this.bracket();
    const key = 'g:' + g.round + ':' + !!g.done;
    if (this.shownKey === key) return;
    this.shownKey = key;
    const rn = (r) => (r === B.roundsCount - 1 ? 'Final' : r === B.roundsCount - 2 ? 'Semifinals' : 'Quarterfinals');
    const live = B.matches.filter((M) => M.state === 'live');
    const myM = live.find((M) => M.a === me || M.b === me) || null, show = g.done ? null : myM || live[0];
    const nm = (id) => (id === null ? '<i class="mute">Bye</i>' : id === undefined ? '<i class="mute">TBD</i>' : esc(this.name(id)) + (id === me ? ' <small>(you)</small>' : ''));
    const row = (M) => {
      const done = M.state === 'done', sc = M.res && done ? [M.res.us, M.res.them] : ['', ''];
      return `<div class="hh-match ${M.state}"><div class="${done && M.winner === M.a ? 'w' : ''}"><span>${nm(M.a)}</span><b>${sc[0]}</b></div><div class="${done && M.winner === M.b ? 'w' : ''}"><span>${nm(M.b)}</span><b>${sc[1]}</b></div><small>${M.state === 'live' ? `${ico('play', 11)} LIVE` : done ? 'Final' : M.state === 'bye' ? 'Bye' : 'Waiting'}</small></div>`;
    };
    const el = go(`<div class="topbar"><button class="icon-btn" id="lv">${ICON.back}</button><h2 class="d grow">${B.size === 2 ? 'The game' : g.done ? 'Tournament' : rn(g.round)}</h2>${netPill()}</div>
      ${B.champ !== undefined ? `<div class="hh-champ">${TROPHY_SVG}<b>${B.champ === me ? (B.size === 2 ? 'You win!' : 'You win the tournament!') : esc(this.name(B.champ)) + ' wins!'}</b></div>` : ''}
      ${show ? `<div class="live solo" id="rcLive"></div><p class="mute center" style="font-weight:700;margin:6px 0 0">${show === myM ? 'Your game' : 'Watching'}: ${esc(this.name(show.a))} vs ${esc(this.name(show.b))}</p>` : ''}
      ${B.size > 2 ? `<div class="hh-bracket" style="margin-top:14px">${Array.from({ length: B.roundsCount }, (_, r) => `<div class="hh-round"><div class="hh-rt">${rn(r)}</div>${B.matches.filter((M) => M.r === r).map(row).join('')}</div>`).join('')}</div>` : B.champ !== undefined ? row(B.matches[0]) : ''}
      ${g.done ? (Net.isHost ? '<button class="btn primary big" id="again" style="width:100%;margin-top:14px">Back to the room</button>' : '<p class="mute center" style="font-weight:700;margin-top:14px">Waiting for the host…</p>') : ''}`);
    App.screen = 'h2h-games';
    $('#lv', el).addEventListener('click', h2hLeave);
    const ag = $('#again', el); if (ag) ag.addEventListener('click', () => Net.backToLobby());
    if (show) {
      // watch from your own side (or the first team's side if it's not your game)
      const flip = show.b === me, A = flip ? show.b : show.a, Bb = flip ? show.a : show.b;
      const plays = flip ? show.res.plays.map((p) => Object.assign({}, p, { s: 1 - p.s })) : show.res.plays;
      const left = Math.max(1500, ROUND_MS - 2500 - (Date.now() - g.roundAt));
      liveCard($('#rcLive', el), { opp: this.name(Bb), oppXI: g.xi[Bb], badge: B.size === 2 ? 'Tournament' : 'Tournament · ' + rn(g.round), po: true, big: true, plays, ot: show.res.ot, key: show.id },
        { myXI: g.xi[A], myName: this.name(A), seed: g.seed + ':' + show.id, speed: 7000 / left }, () => {
          if (show === myM && !this.rewarded[show.id]) { this.rewarded[show.id] = true; const won = show.winner === me; addXP(won ? 80 : 30); Track.ev('h2h_match', won ? 'won' : 'lost'); if (won) { Sfx.crowd(true); confetti(900); } else Sfx.groan(); }
        });
    }
    if (B.champ !== undefined && !this.rewarded.champ) {
      this.rewarded.champ = true;
      if (B.champ === me) { addXP(B.size === 2 ? 100 : 250); unlock('mp_win'); Store.data.stats.mpWins++; Store.save(); confetti(); Sfx.trophy(); }
      Track.ev('h2h_done', `${g.ids.length} players`);
    }
  },
};
const netPill = () => `<span class="pill net-pill ${Net.conn === false ? 'bad' : ''}" id="netPill">${ico('globe', 14)}<span>${Net.conn === false ? ' Reconnecting…' : ' Live'}</span></span>`;
function h2hLeave() {
  modal(`<h2 class="d">Leave the tournament?</h2><p>Your team keeps playing without you.</p><div class="actions two"><button class="btn" data-close>Stay</button><button class="btn hot" id="ok">Leave</button></div>`, (bg) => {
    $('#ok', bg).addEventListener('click', () => { bg.remove(); H2H.stop(); Net.leave(); goTab('play'); });
  });
}
