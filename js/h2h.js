'use strict';
// HEAD-TO-HEAD (online rooms, 2-8 friends). Everyone drafts at the same time from the same spins, then
// it's live play-by-play: the side with the ball calls a play, the other side calls a defence, at the
// same time, on their own phones. 2 players = one match; 3-8 = a bracket (top seeds get byes).
//
// Over MQTT (see net.js), next to the room state:
//   CODE/x/ID                      retained {gid, xi, name}: a finished draft
//   CODE/c/GID/MATCH/SNAP/ID       retained {c}: one player's call for one snap
// Every phone replays the same calls through the same deterministic engine (GD.pvpStep), so everyone
// sees the same game and the same bracket with no referee. If someone doesn't call in time, any phone
// posts the same stand-in call for them (GD.pvpAuto), so a game never freezes.
const H2H_PICK_MS = 20000;   // your clock to call a snap
const H2H_COVER_MS = 25000;  // after this, the other phone calls for you
const H2H_MAX = 8;
const H2H = {
  game: null, xi: {}, calls: {}, seen: {}, tick: null, view: null, rewarded: {}, leftMid: null,
  // ---- room messages ----
  onXi(id, raw) {
    if (!raw) { delete this.xi[id]; return; }
    let m; try { m = JSON.parse(raw); } catch (_) { return; }
    this.xi[id] = m;
    this.refresh();
  },
  onCall(path, raw) {
    const [gid, mid, idx, id] = path.split('/');
    if (!raw || !id) return;
    let m; try { m = JSON.parse(raw); } catch (_) { return; }
    const C = (((this.calls[gid] = this.calls[gid] || {})[mid] = this.calls[gid][mid] || {})[idx] = this.calls[gid][mid][idx] || {});
    if (C[id]) return; // first call for a snap wins
    C[id] = m.c;
    this.refresh();
  },
  onState(st) {
    const g = st.game;
    if (!this.game || this.game.gid !== g.gid) { this.game = g; this.seen = {}; this.rewarded = {}; this.view = null; this.leftMid = null; }
    else this.game = g;
    if (!this.tick) this.tick = setInterval(() => this.housekeep(), 1000);
    Net.inGame = true;
    const me = Net.myId, mine = this.xi[me] && this.xi[me].gid === g.gid;
    if (g.ids.includes(me) && !mine && !(App.g && App.g.cfg && App.g.cfg.mode === 'h2h')) return this.draft();
    this.refresh(true);
  },
  stop() { if (this.tick) { clearInterval(this.tick); this.tick = null; } this.game = null; },
  // ---- the draft ----
  draft() {
    const g = this.game;
    openDraft({ mode: 'h2h', seed: g.seed + ':draft', managers: [{ name: Net.name || myName() }], respins: 1, title: 'Head-to-Head draft',
      onDone: (st) => { Net.pub('x/' + Net.myId, { gid: g.gid, xi: st.managers[0].xi, name: Net.name || myName() }, true); this.xi[Net.myId] = { gid: g.gid, xi: st.managers[0].xi, name: Net.name }; this.view = null; this.refresh(true); } });
  },
  drafted() { const g = this.game; return g.ids.filter((id) => this.xi[id] && this.xi[id].gid === g.gid); },
  name(id) { return (this.xi[id] && this.xi[id].name) || (Net.recs[id] && Net.recs[id].name) || 'Player'; },
  team(id) { const xi = this.xi[id].xi; return { name: this.name(id), xi, prof: TE.teamProfile(xi) }; },
  // ---- the bracket (worked out the same way on every phone) ----
  bracket() {
    const g = this.game;
    const ids = g.ids.slice();
    const size = ids.length <= 2 ? 2 : ids.length <= 4 ? 4 : 8;
    const order = TE.shuffle(TE.rng(g.seed + ':seeds'), ids);
    const POS = { 2: [0, 1], 4: [0, 3, 1, 2], 8: [0, 7, 3, 4, 1, 6, 2, 5] }[size];
    const rounds = [POS.map((s) => (order[s] === undefined ? null : order[s]))];
    const matches = [];
    for (let r = 0; (1 << r) < size; r++) {
      const slots = rounds[r], next = [];
      for (let m = 0; m < slots.length / 2; m++) {
        const a = slots[2 * m], b = slots[2 * m + 1], id = 'r' + r + 'm' + m;
        const M = { id, r, m, a, b, winner: undefined };
        if (a === undefined || b === undefined) M.state = 'tbd';
        else if (a === null || b === null) { M.state = 'bye'; M.winner = a === null ? b : a; }
        else { const s = this.play(M); M.game = s; M.state = s.g.over ? 'done' : 'live'; if (s.g.over) M.winner = s.g.score.us > s.g.score.them ? a : b; }
        matches.push(M); next.push(M.winner);
      }
      rounds.push(next);
    }
    const final = matches[matches.length - 1];
    return { size, rounds, matches, champ: final.winner, roundsCount: Math.log2(size) };
  },
  // replay a match from its calls
  play(M) {
    const g = this.game, calls = ((this.calls[g.gid] || {})[M.id]) || {};
    const gm = GD.pvpCreate(this.team(M.a), this.team(M.b), g.seed + ':' + M.id);
    const evs = []; let idx = 0;
    while (!gm.over && idx < 500) {
      const off = gm.poss === 'us' ? M.a : M.b, def = gm.poss === 'us' ? M.b : M.a, c = calls[idx];
      if (!c || !c[off] || !c[def]) break;
      evs.push(GD.pvpStep(gm, c[off], c[def])); idx++;
    }
    const off = gm.poss === 'us' ? M.a : M.b, def = gm.poss === 'us' ? M.b : M.a;
    return { g: gm, idx, evs, off, def, calls: calls[idx] || {} };
  },
  myMatch(B) { return B.matches.find((M) => M.state === 'live' && (M.a === Net.myId || M.b === Net.myId)); },
  // ---- calls ----
  call(M, idx, who, c) {
    const g = this.game, C = ((this.calls[g.gid] || {})[M.id] || {})[idx] || {};
    if (C[who]) return;
    Net.pub(`c/${g.gid}/${M.id}/${idx}/${who}`, { c }, true);
    this.onCall(`${g.gid}/${M.id}/${idx}/${who}`, JSON.stringify({ c }));
  },
  // every second: stand-in calls for anyone who ran out of time
  housekeep() {
    if (!this.game || !Net.active || !Net.state || Net.state.status !== 'h2h') return;
    if (this.drafted().length < this.game.ids.length) return;
    const B = this.bracket(), now = Date.now(), me = Net.myId;
    B.matches.filter((M) => M.state === 'live').forEach((M) => {
      const s = M.game, key = M.id + ':' + s.idx;
      const first = this.seen[key] || (this.seen[key] = now);
      [['off', s.off], ['def', s.def]].forEach(([role, who]) => {
        if (s.calls[who]) return;
        const mine = who === me, mePlaying = M.a === me || M.b === me;
        // gone from the room (app closed)? cover them fast; still here but slow? give them time
        const late = now - first > (mine ? H2H_PICK_MS : !Net.here(who) ? 6000 : H2H_COVER_MS);
        // you cover yourself, your opponent covers you, and the host covers games where both left
        if (late && (mine || mePlaying || (Net.isHost && !Net.here(M.a) && !Net.here(M.b)))) this.call(M, s.idx, who, GD.pvpAuto(this.game.seed + ':' + M.id, s.idx * 2 + (role === 'def' ? 1 : 0), s.g, role));
      });
    });
    if (this.view && this.view.mid) this.timerBar(B);
  },
  // ---- screens ----
  refresh(force) {
    if (!this.game || !Net.active) return;
    if (App.g && App.g.cfg && App.g.cfg.mode === 'h2h' && !App.g.st.done) return; // still drafting
    if (this.drafted().length < this.game.ids.length) { if (force || App.screen === 'h2h-wait') this.waitScreen(); return; }
    const B = this.bracket();
    // jump into your own match when it goes live
    const mm = this.myMatch(B);
    if (mm && (!this.view || this.view.mid !== mm.id) && mm.id !== this.leftMid) this.view = { mid: mm.id };
    if (this.view && this.view.mid) { const M = B.matches.find((x) => x.id === this.view.mid); if (M) return this.matchScreen(B, M); }
    this.hub(B);
  },
  waitScreen() {
    const g = this.game, done = this.drafted();
    const el = go(`<div class="topbar"><button class="icon-btn" id="lv">${ICON.back}</button><h2 class="d grow">Head-to-Head</h2>${netPill()}</div>
      <div class="hh-wait"><div class="hh-spin">${ico('timer', 28)}</div><b>Waiting for everyone to finish drafting</b><small>${done.length}/${g.ids.length} done</small></div>
      <div class="group">${g.ids.map((id) => `<div class="lrow" style="cursor:default"><div class="grow"><b>${esc(this.name(id))}${id === Net.myId ? ' (you)' : ''}</b><small>${done.includes(id) ? 'Team locked in' : Net.here(id) ? 'Drafting…' : 'Away'}</small></div>${done.includes(id) ? `<span class="lmeta hot">${ico('check', 12)}</span>` : ''}</div>`).join('')}</div>
      ${Net.isHost && done.length >= 2 && done.length < g.ids.length ? `<button class="btn" id="go" style="width:100%;margin-top:12px">Start without the others (${done.length} players)</button>` : ''}`);
    App.screen = 'h2h-wait';
    $('#lv', el).addEventListener('click', h2hLeave);
    const b = $('#go', el); if (b) b.addEventListener('click', () => Net.bump({ game: Object.assign({}, g, { ids: done }) }));
  },
  hub(B) {
    const g = this.game, me = Net.myId;
    const champ = B.champ;
    const rn = (r) => (r === B.roundsCount - 1 ? 'Final' : r === B.roundsCount - 2 ? 'Semifinals' : 'Quarterfinals');
    const mRow = (M) => {
      const nm = (id) => (id === null ? '<i class="mute">Bye</i>' : id === undefined ? '<i class="mute">TBD</i>' : esc(this.name(id)) + (id === me ? ' <small>(you)</small>' : ''));
      const sc = M.game ? [M.game.g.score.us, M.game.g.score.them] : ['', ''];
      const win = (id) => M.winner !== undefined && M.winner === id && M.state !== 'bye';
      return `<button class="hh-match ${M.state}" data-m="${M.id}" ${M.state === 'live' || M.state === 'done' ? '' : 'disabled'}>
        <div class="${win(M.a) ? 'w' : ''}"><span>${nm(M.a)}</span><b>${sc[0]}</b></div>
        <div class="${win(M.b) ? 'w' : ''}"><span>${nm(M.b)}</span><b>${sc[1]}</b></div>
        <small>${M.state === 'live' ? `${ico('play', 11)} LIVE · Q${Math.min(4, M.game.g.quarter)} ${GD.fmtClock(M.game.g.clock)}` : M.state === 'done' ? 'Final' : M.state === 'bye' ? 'Bye' : 'Waiting'}</small></button>`;
    };
    const el = go(`<div class="topbar"><button class="icon-btn" id="lv">${ICON.back}</button><h2 class="d grow">${B.size === 2 ? '1v1 match' : 'Tournament'}</h2>${netPill()}</div>
      ${champ !== undefined ? `<div class="hh-champ">${TROPHY_SVG}<b>${champ === me ? 'You win the tournament!' : esc(this.name(champ)) + ' wins!'}</b></div>` : ''}
      ${B.size === 2 ? '' : `<p class="mute" style="font-weight:600;margin:0 0 10px">${g.ids.length} players · ${B.size - g.ids.length ? `${B.size - g.ids.length} bye${B.size - g.ids.length > 1 ? 's' : ''} for the top seeds · ` : ''}tap a live game to watch</p>`}
      <div class="hh-bracket">${Array.from({ length: B.roundsCount }, (_, r) => `<div class="hh-round"><div class="hh-rt">${rn(r)}</div>${B.matches.filter((M) => M.r === r).map(mRow).join('')}</div>`).join('')}</div>
      ${champ !== undefined ? (Net.isHost ? '<button class="btn primary big" id="again" style="width:100%;margin-top:14px">Back to the room</button>' : '<p class="mute center" style="font-weight:700;margin-top:14px">Waiting for the host…</p>') : ''}`);
    App.screen = 'h2h-hub';
    $('#lv', el).addEventListener('click', h2hLeave);
    $$('[data-m]', el).forEach((b) => b.addEventListener('click', () => { this.leftMid = null; this.view = { mid: b.dataset.m }; this.refresh(); }));
    const a = $('#again', el); if (a) a.addEventListener('click', () => Net.backToLobby());
    if (champ !== undefined && !this.rewarded.champ) { this.rewarded.champ = true; if (champ === me) { addXP(B.size === 2 ? 100 : 250); unlock('mp_win'); Store.data.stats.mpWins++; Store.save(); confetti(); Sfx.trophy(); } Track.ev('h2h_done', `${g.ids.length} players`); }
  },
  matchScreen(B, M) {
    const me = Net.myId, s = M.game, gm = s.g, playing = M.a === me || M.b === me;
    const meA = M.b !== me; // A's view unless I'm B
    const L = meA ? M.a : M.b, R = meA ? M.b : M.a;
    const sc = (id) => (id === M.a ? gm.score.us : gm.score.them);
    const offId = s.off, myRole = !playing || gm.over ? null : offId === me ? 'off' : 'def';
    const myCall = playing ? s.calls[me] : null;
    const last = s.evs[s.evs.length - 1];
    const ballFor = (id) => (gm.poss === (id === M.a ? 'us' : 'them') ? gm.ball : 100 - gm.ball); // from the left team's side
    const pos = ballFor(L);
    const dn = ['1st', '2nd', '3rd', '4th'][gm.down - 1] || '4th';
    const opts = myRole === 'off' ? GD.pvpOffense(gm) : myRole === 'def' ? GD.pvpDefense() : [];
    const sig = [M.id, s.idx, gm.over, !!myCall].join(':');
    if (this.view.sig === sig && document.querySelector('.hh-live')) return; // nothing new to draw
    const fresh = this.view.sig && this.view.sig.split(':')[1] !== String(s.idx);
    this.view.sig = sig;
    const el = go(`<div class="topbar"><button class="icon-btn" id="bk">${ICON.back}</button><h2 class="d grow">${playing ? 'Your match' : 'Watching'}</h2>${netPill()}</div>
      <div class="hh-live">
        <div class="hh-score"><div class="${gm.poss === (L === M.a ? 'us' : 'them') ? 'ball' : ''}"><small>${esc(this.name(L))}${L === me ? ' (you)' : ''}</small><b>${sc(L)}</b></div>
          <div class="hh-clock">${gm.over ? 'FINAL' : `Q${Math.min(4, gm.quarter)}${gm.ot ? ' OT' : ''}`}<small>${gm.over ? '' : GD.fmtClock(gm.clock)}</small></div>
          <div class="${gm.poss === (R === M.a ? 'us' : 'them') ? 'ball' : ''}"><small>${esc(this.name(R))}${R === me ? ' (you)' : ''}</small><b>${sc(R)}</b></div></div>
        ${gm.over ? '' : `<div class="hh-field"><i class="hh-ball" style="left:${Math.max(2, Math.min(98, pos))}%"></i><span>${dn} & ${gm.togo >= 100 - gm.ball ? 'Goal' : gm.togo} · ${esc(this.name(offId))} ball</span></div>`}
        <div class="hh-last ${fresh ? 'pop' : ''}">${last ? esc(h2hLine(last, this.name(last.side === 'us' ? M.a : M.b))) : 'Kickoff! ' + esc(this.name(offId)) + ' gets the ball first.'}</div>
      </div>
      <div id="hhc">${gm.over ? `<div class="outcome ${sc(me) > sc(me === M.a ? M.b : M.a) ? 'win' : 'loss'}" style="margin-top:12px"><h2>${esc(this.name(sc(M.a) > sc(M.b) ? M.a : M.b))} wins ${Math.max(sc(M.a), sc(M.b))}–${Math.min(sc(M.a), sc(M.b))}</h2></div><button class="btn primary big" id="hb" style="width:100%;margin-top:12px">${B.size === 2 ? 'See result' : 'Back to the bracket'}</button>`
        : !playing ? `<p class="mute center" style="font-weight:700;margin-top:16px">${esc(this.name(s.off))} on offense vs ${esc(this.name(s.def))}</p>`
        : myCall ? `<div class="hh-locked">${ico('check', 18)} Locked in: <b>${esc((GD.PLAYS[myCall] || GD.DEFS[myCall] || { name: myCall === 'fg' ? 'Field goal' : 'Punt' }).name)}</b><small>Waiting for ${esc(this.name(myRole === 'off' ? s.def : s.off))}…</small></div>`
        : `<div class="hh-role ${myRole}">${myRole === 'off' ? 'Your ball: call a play' : 'Defense: call your coverage'}</div><div class="hh-timer"><i id="hht"></i></div>
           <div class="hh-opts">${opts.map((o) => `<button class="hh-opt" data-c="${o.id}"><b>${esc(o.name)}</b><small>${esc(o.sub || '')}</small></button>`).join('')}</div>`}</div>`);
    App.screen = 'h2h-match';
    if (fresh && last) { if (last.td || last.good) Sfx.crowd(true); else if (last.kind === 'int' || last.kind === 'fumble' || last.kind === 'sack') Sfx.hit(); else Sfx.tap(); }
    const back = () => { this.leftMid = M.id; this.view = null; this.refresh(); };
    $('#bk', el).addEventListener('click', back);
    const hb = $('#hb', el); if (hb) hb.addEventListener('click', back);
    $$('[data-c]', el).forEach((b) => b.addEventListener('click', () => { Sfx.select(); this.call(M, s.idx, me, b.dataset.c); }));
    if (gm.over && playing && !this.rewarded[M.id]) { this.rewarded[M.id] = true; const won = sc(me) > sc(me === M.a ? M.b : M.a); addXP(won ? 80 : 30); if (won) { confetti(); Sfx.trophy(); } else Sfx.groan(); Track.ev('h2h_match', won ? 'won' : 'lost'); }
    this.timerBar(B);
  },
  timerBar() {
    const t = document.getElementById('hht'); if (!t || !this.view || !this.view.mid) return;
    const key = Object.keys(this.seen).filter((k) => k.startsWith(this.view.mid + ':')).sort((a, b) => +b.split(':')[1] - +a.split(':')[1])[0];
    const left = key ? Math.max(0, 1 - (Date.now() - this.seen[key]) / H2H_PICK_MS) : 1;
    t.style.width = (left * 100) + '%'; t.classList.toggle('low', left < 0.3);
  },
};
function h2hLine(ev, who) {
  const y = ev.yards;
  if (ev.kind === 'punt') return `${who} punt ${y} yards.`;
  if (ev.kind === 'fg') return ev.good ? `Field goal is good! (${ev.dist} yds)` : `Field goal no good from ${ev.dist}.`;
  if (ev.kind === 'int') return 'INTERCEPTED!';
  if (ev.kind === 'fumble') return 'FUMBLE! Turnover.';
  if (ev.kind === 'sack') return `Sacked for ${y}.`;
  if (ev.kind === 'inc') return 'Incomplete pass.';
  if (ev.result === 'SAFETY') return 'Safety!';
  if (ev.td) return `TOUCHDOWN ${who}! (${y} yds)`;
  if (ev.result === 'TURNOVER ON DOWNS') return 'Turnover on downs!';
  return `${ev.play === 'run' ? 'Run' : 'Catch'} for ${y}${ev.first ? ', first down!' : '.'}`;
}
const netPill = () => `<span class="pill net-pill ${Net.conn === false ? 'bad' : ''}" id="netPill">${ico('globe', 14)}<span>${Net.conn === false ? ' Reconnecting…' : ' Live'}</span></span>`;
function h2hLeave() {
  modal(`<h2 class="d">Leave the game?</h2><p>Your games will be auto-played if you go.</p><div class="actions two"><button class="btn" data-close>Stay</button><button class="btn hot" id="ok">Leave</button></div>`, (bg) => {
    $('#ok', bg).addEventListener('click', () => { bg.remove(); H2H.stop(); Net.leave(); goTab('play'); });
  });
}
