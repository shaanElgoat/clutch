'use strict';
// HEAD-TO-HEAD: SPIN RACE (online rooms, 2-8 friends).
// Everyone sees the same spin at the same moment and races to tap the best player on that team:
// the first tap gets him. One player each per spin until everyone's 12 spots are full. Then the teams
// play fast live games: 2 players = one game, 3-8 = a bracket (top seeds get byes).
//
// The host's phone is the referee (it sees taps in the order they arrive, so "first tap wins" is the
// same for everyone). Over MQTT, next to the room state (net.js):
//   CODE/k/GID/SPIN/ID    a player's tap {pid}          -> only the host reads these
//   CODE/state            room state; during a race state.game holds the spin, the picks and the teams
// If the host leaves, the next player becomes host and carries on from the state.
const RACE_MS = 8000;      // time to grab a player each spin
const RACE_GAP = 1100;     // pause between spins so everyone sees who got who
const RACE_MAX_SPINS = 24; // safety stop if someone can't fill a spot
const ROUND_MS = 16000;    // how long each round's live games run before results post
const H2H_MAX = 8;

const H2H = {
  game: null, tick: null, mine: null, lastSpin: -1, spinSeen: 0, shownRound: -1, rewarded: {},
  // ---------- state from the host ----------
  onState(st) {
    const g = st.game;
    if (!this.game || this.game.gid !== g.gid) { this.lastSpin = -1; this.shownRound = -1; this.rewarded = {}; this.mine = null; }
    this.game = g;
    Net.inGame = true;
    if (!this.tick) this.tick = setInterval(() => this.loop(), 250);
    this.render();
  },
  stop() { if (this.tick) { clearInterval(this.tick); this.tick = null; } this.game = null; },
  name(id) { return (Net.recs[id] && Net.recs[id].name) || 'Player'; },
  ovr(id) { const xi = this.game.xi[id] || []; return xi.some((x) => x !== null) ? TE.teamProfile(xi).ovr : 0; },
  filled(id) { return (this.game.xi[id] || []).filter((x) => x !== null).length; },
  // can this player still use pid? (an open spot he fits, and not the same person twice)
  fits(id, pid) { return TE.eligible(pid, { xi: this.game.xi[id] }, [], false); },
  // ---------- the host runs the race ----------
  onClaim(path, raw) {
    if (!Net.isHost || !raw || !this.game || this.game.phase !== 'race') return;
    const [gid, spin, id] = path.split('/');
    const g = this.game;
    if (gid !== g.gid || +spin !== g.spin || !g.ids.includes(id) || g.got[id] !== undefined || g.spinEnd) return;
    let m; try { m = JSON.parse(raw); } catch (_) { return; }
    const pid = +m.pid;
    if (!TE.SQUADS[g.sq].players.includes(pid) || Object.values(g.got).includes(pid) || !this.fits(id, pid)) return;
    this.assign(g, id, pid);
    Net.bump({ game: g });
  },
  assign(g, id, pid) {
    const slot = TE.openSlotsFor(pid, g.xi[id], false)[0].slot;
    g.xi[id] = g.xi[id].slice(); g.xi[id][slot] = pid; g.got[id] = pid;
  },
  // the host's clock: time out slow players, start the next spin, run the rounds
  hostLoop() {
    const g = this.game; if (!g) return;
    const now = Date.now();
    if (g.phase === 'race') {
      const taken = () => Object.values(g.got);
      const waiting = g.ids.filter((id) => g.got[id] === undefined && this.filled(id) < TE.SLOTS && TE.SQUADS[g.sq].players.some((p) => !taken().includes(p) && this.fits(id, p)));
      if (!g.spinEnd) {
        if (waiting.length && now - g.spinAt <= RACE_MS) return;
        // too slow: the best player left who fits goes to you
        waiting.forEach((id) => {
          const left = TE.SQUADS[g.sq].players.filter((p) => !taken().includes(p) && this.fits(id, p));
          const best = left.sort((a, b) => TE.PLAYERS[b].r - TE.PLAYERS[a].r)[0];
          if (best !== undefined) this.assign(g, id, best);
        });
        g.spinEnd = now; Net.bump({ game: g }); return;
      }
      if (now - g.spinEnd < RACE_GAP) return;
      if (g.ids.every((id) => this.filled(id) >= TE.SLOTS) || g.spin + 1 >= RACE_MAX_SPINS) {
        Net.bump({ game: Object.assign(g, { phase: 'games', round: 0, roundAt: now, got: {} }) }); return;
      }
      this.nextSpin(g, now); Net.bump({ game: g });
    } else if (g.phase === 'games' && !g.done && now - g.roundAt > ROUND_MS) {
      const B = this.bracket();
      if (g.round < B.roundsCount - 1) Net.bump({ game: Object.assign(g, { round: g.round + 1, roundAt: now }) });
      else Net.bump({ game: Object.assign(g, { done: true }) });
    }
  },
  nextSpin(g, now) {
    const r = TE.rng(g.seed + ':spin:' + (g.spin + 1));
    // a team nobody has seen yet this race, with someone that people who still need players could use
    const pool = TE.CUR_SQ.filter((q) => !g.used.includes(q));
    const useful = pool.filter((q) => g.ids.some((id) => this.filled(id) < TE.SLOTS && TE.SQUADS[q].players.some((p) => this.fits(id, p))));
    const list = useful.length ? useful : pool.length ? pool : TE.CUR_SQ;
    const sq = list[Math.floor(r() * list.length)];
    Object.assign(g, { spin: g.spin + 1, sq, spinAt: now, spinEnd: 0, got: {}, used: g.used.concat(sq) });
  },
  // ---------- everyone ----------
  loop() {
    if (!this.game || !Net.active || !Net.state || Net.state.status !== 'h2h') return;
    if (Net.isHost) this.hostLoop();
    const t = document.getElementById('rcT');
    if (t && this.game.phase === 'race') {
      const left = this.game.spinEnd ? 0 : Math.max(0, 1 - (Date.now() - this.spinSeen) / RACE_MS);
      t.style.width = left * 100 + '%'; t.classList.toggle('low', left < 0.35);
      const s = document.getElementById('rcS'); if (s) s.textContent = this.game.spinEnd ? '✓' : Math.ceil(left * RACE_MS / 1000) + 's';
    }
  },
  claim(pid) {
    const g = this.game;
    if (!g || g.phase !== 'race' || g.got[Net.myId] !== undefined || this.mine !== null || g.spinEnd) return;
    this.mine = pid;
    Net.pub(`k/${g.gid}/${g.spin}/${Net.myId}`, { pid }, false);
    if (Net.isHost) this.onClaim(`${g.gid}/${g.spin}/${Net.myId}`, JSON.stringify({ pid }));
    this.render();
  },
  render() {
    const g = this.game; if (!g) return;
    if (g.phase === 'race') return this.raceScreen();
    return this.gamesScreen();
  },
  // ---------- the race screen (built once per spin, then just updated) ----------
  raceScreen() {
    const g = this.game, me = Net.myId, playing = g.ids.includes(me);
    if (this.lastSpin !== g.spin || !document.getElementById('rcG')) {
      if (this.lastSpin !== g.spin) { this.spinSeen = Date.now(); this.mine = null; }
      this.lastSpin = g.spin;
      const team = TE.teamOf(g.sq);
      const el = go(`<div class="topbar"><button class="icon-btn" id="lv">${ICON.back}</button><div class="grow"><h2 class="d">Spin Race</h2><div class="mute" style="font-weight:700;font-size:12px">Spin ${g.spin + 1} · first tap gets him</div></div>${netPill()}</div>
        <div class="rc-board" id="rcB"></div>
        <div class="rc-spin">${crest(team, 46)}<div class="grow"><b>${esc(team.short)}</b><small>${esc(TE.squadLong(g.sq))}</small></div><span class="rc-sec" id="rcS">8s</span></div>
        <div class="rc-timer"><i id="rcT"></i></div>
        <!-- listed by position (QB, RB, WR…), not by rating, so you have to know who's good -->
        <div class="rc-grid" id="rcG">${TE.SQUADS[g.sq].players.map((pid) => `<button class="rc-card" data-p="${pid}">${pcard(pid, {})}<span class="rc-tag"></span></button>`).join('')}</div>
        <div id="rcM"></div>`);
      App.screen = 'h2h-race';
      $('#lv', el).addEventListener('click', h2hLeave);
      el.addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b && !b.disabled) { Sfx.select(); this.claim(+b.dataset.p); } });
      Sfx.whistle();
    }
    // who's got who
    const owner = {}; Object.entries(g.got).forEach(([id, pid]) => { owner[pid] = id; });
    const iGot = g.got[me];
    $$('#rcG [data-p]').forEach((b) => {
      const pid = +b.dataset.p, who = owner[pid], tag = $('.rc-tag', b);
      const noFit = playing && iGot === undefined && who === undefined && !this.fits(me, pid);
      b.classList.toggle('taken', who !== undefined && who !== me);
      b.classList.toggle('mine', who === me);
      b.classList.toggle('pending', this.mine === pid && who === undefined);
      b.classList.toggle('nofit', noFit);
      b.disabled = !playing || who !== undefined || iGot !== undefined || noFit || this.mine !== null || !!g.spinEnd;
      tag.textContent = who === me ? 'YOURS' : who !== undefined ? this.name(who) : noFit ? 'No spot' : this.mine === pid ? 'Grabbing…' : '';
    });
    // beaten to it? pick again, fast
    if (this.mine !== null && this.mine !== -1 && owner[this.mine] !== undefined && owner[this.mine] !== me) {
      toast(`Too slow! ${this.name(owner[this.mine])} got him`); Sfx.bad(); buzz([40, 30, 40]); this.mine = null; return this.raceScreen();
    }
    if (iGot !== undefined && this.mine !== -1) { if (this.mine === iGot) { Sfx.good(); buzz(20); } this.mine = -1; }
    // the live standings
    const B = $('#rcB');
    if (B) B.innerHTML = g.ids.map((id) => `<div class="rc-p ${id === me ? 'me' : ''} ${g.got[id] !== undefined ? 'done' : ''}"><b>${esc(this.name(id))}${id === me ? ' (you)' : ''}</b><span>OVR ${this.ovr(id) ? this.ovr(id).toFixed(1) : '–'} · ${this.filled(id)}/12</span>${g.got[id] !== undefined ? `<em>${esc(shortName(TE.PLAYERS[g.got[id]].name))}</em>` : '<em class="w">picking…</em>'}</div>`).join('');
    const M = $('#rcM');
    if (M && playing) M.innerHTML = `<div class="section-title">Your team · ${this.filled(me)}/12</div>${miniField(g.xi[me])}`;
  },
  // ---------- the games ----------
  bracket() {
    const g = this.game, ids = g.ids.slice();
    const size = ids.length <= 2 ? 2 : ids.length <= 4 ? 4 : 8;
    // the best draft gets the top seed (and the bye, if there is one)
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
    const key = g.round + ':' + !!g.done;
    if (this.shownRound === key) return;
    this.shownRound = key;
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
      liveCard($('#rcLive', el), { opp: this.name(Bb), oppXI: g.xi[Bb], badge: B.size === 2 ? 'Spin Race' : 'Spin Race · ' + rn(g.round), po: true, big: true, plays, ot: show.res.ot, key: show.id },
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
  modal(`<h2 class="d">Leave the game?</h2><p>If you go, the rest of your picks are made for you.</p><div class="actions two"><button class="btn" data-close>Stay</button><button class="btn hot" id="ok">Leave</button></div>`, (bg) => {
    $('#ok', bg).addEventListener('click', () => { bg.remove(); H2H.stop(); Net.leave(); goTab('play'); });
  });
}
