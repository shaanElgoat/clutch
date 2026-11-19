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
const H2H_PICK_MS = 12000;   // your clock to call a snap
const H2H_COVER_MS = 16000;  // after this, the other phone calls for you
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
        const late = now - first > (mine ? H2H_PICK_MS : !Net.here(who) ? 5000 : H2H_COVER_MS);
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
  // The match screen is built ONCE and then only its parts change (score, ball, banner, buttons),
  // so nothing flashes or jumps between snaps.
  matchScreen(B, M) {
    let root = document.getElementById('hhRoot');
    if (!root || root.dataset.mid !== M.id) root = this.mountMatch(B, M);
    this.updateMatch(B, M, root);
  },
  mountMatch(B, M) {
    const me = Net.myId, playing = M.a === me || M.b === me;
    const L = M.b === me ? M.b : M.a, R = L === M.a ? M.b : M.a;
    const el = go(`<div class="topbar"><button class="icon-btn" id="bk">${ICON.back}</button><h2 class="d grow">${playing ? 'Your match' : 'Watching'}</h2>${netPill()}</div>
      <div id="hhRoot" class="hh-live" data-mid="${M.id}" data-idx="-1">
        <div class="hh-score">
          <div class="hh-side l" id="hhL"><small>${esc(this.name(L))}${L === me ? ' (you)' : ''}</small><b>0</b><i class="hh-pos"></i></div>
          <div class="hh-clock" id="hhClk">Q1<small>7:00</small></div>
          <div class="hh-side r" id="hhR"><small>${esc(this.name(R))}${R === me ? ' (you)' : ''}</small><b>0</b><i class="hh-pos"></i></div>
        </div>
        <div class="hh-field" id="hhField"><div class="hh-ez l"></div><div class="hh-ez r"></div>
          ${[10, 20, 30, 40, 50, 60, 70, 80, 90].map((y) => `<i class="hh-yl" style="left:${8 + y * 0.84}%"></i>`).join('')}
          <i class="hh-fd" id="hhFd"></i><i class="hh-ball" id="hhBall">${FOOTBALL}</i></div>
        <div class="hh-dd" id="hhDd"></div>
        <div class="hh-banner" id="hhBan"><b>Kickoff!</b><small></small></div>
      </div>
      <div class="hh-oppline" id="hhOpp"></div>
      <div id="hhCtl"></div>
      <div class="hh-tend" id="hhTend"></div>
      <div class="hh-log" id="hhLog"></div>`);
    App.screen = 'h2h-match';
    const back = () => { this.leftMid = M.id; this.view = null; this.refresh(); };
    $('#bk', el).addEventListener('click', back);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-c]');
      if (b && !b.disabled) { Sfx.select(); b.classList.add('picked'); this.call(M, +b.dataset.idx, Net.myId, b.dataset.c); }
      if (e.target.closest('#hb')) back();
    });
    return $('#hhRoot', el);
  },
  updateMatch(B, M, root) {
    const me = Net.myId, s = M.game, gm = s.g, playing = M.a === me || M.b === me;
    const L = M.b === me ? M.b : M.a, R = L === M.a ? M.b : M.a, opp = playing ? (me === M.a ? M.b : M.a) : null;
    const sc = (id) => (id === M.a ? gm.score.us : gm.score.them);
    const sideOf = (id) => (id === M.a ? 'us' : 'them');
    const idOf = (side) => (side === 'us' ? M.a : M.b);
    // scoreboard
    [['#hhL', L], ['#hhR', R]].forEach(([sel, id]) => {
      const box = $(sel), b = $('b', box), v = String(sc(id));
      if (b.textContent !== v) { b.textContent = v; box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump'); }
      box.classList.toggle('has', !gm.over && gm.poss === sideOf(id));
    });
    $('#hhClk').innerHTML = gm.over ? 'FINAL' : `${gm.ot ? 'OT' : 'Q' + Math.min(4, gm.quarter)}<small>${GD.fmtClock(gm.clock)}</small>`;
    // the field, always drawn from the left team's end zone
    const ballL = gm.poss === sideOf(L) ? gm.ball : 100 - gm.ball;
    const fdL = gm.poss === sideOf(L) ? Math.min(100, gm.ball + gm.togo) : 100 - Math.min(100, gm.ball + gm.togo);
    const X = (y) => `${8 + Math.max(0, Math.min(100, y)) * 0.84}%`;
    $('#hhBall').style.left = X(ballL); $('#hhFd').style.left = X(fdL);
    $('#hhField').classList.toggle('off', gm.over);
    const dn = ['1st', '2nd', '3rd', '4th'][gm.down - 1] || '4th';
    $('#hhDd').innerHTML = gm.over ? '' : `<b>${dn} & ${gm.togo >= 100 - gm.ball ? 'Goal' : gm.togo}</b><span>${esc(this.name(s.off))} ball · ${gm.ball === 50 ? 'midfield' : gm.ball < 50 ? 'own ' + gm.ball : 'opp ' + (100 - gm.ball)}</span>`;
    // a new snap happened: the big result banner, with both calls revealed
    const prev = +root.dataset.idx;
    if (s.idx !== prev) {
      root.dataset.idx = s.idx;
      const ev = s.evs[s.evs.length - 1];
      if (ev && prev >= 0) {
        const offId = idOf(ev.side), defId = offId === M.a ? M.b : M.a, c = ((this.calls[this.game.gid] || {})[M.id] || {})[s.idx - 1] || {};
        const t = h2hBanner(ev), mine = playing && offId === me, theirs = playing && offId !== me;
        const good = t.kind === 'good' ? (mine ? 'good' : theirs ? 'bad' : 'neutral') : t.kind === 'bad' ? (mine ? 'bad' : theirs ? 'good' : 'neutral') : t.kind;
        const ban = $('#hhBan');
        ban.className = 'hh-banner ' + good;
        // the mind game: did someone call the perfect counter?
        const oc = c[offId], dc = c[defId];
        // (only when the result backs it up: a read that still gave up a first down isn't a read)
        const stopped = t.kind === 'bad' || (ev.kind === 'gain' && ev.yards < 4), gashed = ev.td || ev.first || ev.yards >= 12;
        const read = H2H_COUNTER[dc] && H2H_COUNTER[dc].includes(oc) && stopped ? `🧠 ${this.name(defId)} read it!` : H2H_BEATS[oc] && H2H_BEATS[oc].includes(dc) && gashed ? `🎯 ${this.name(offId)} called it perfectly!` : '';
        // hot streak: first downs or scores in a row by the same team
        let streak = 0;
        for (let k = s.evs.length - 1; k >= 0 && s.evs[k].side === ev.side && (s.evs[k].first || s.evs[k].td || (s.evs[k].yards >= 10 && s.evs[k].kind === 'gain')); k--) streak++;
        ban.innerHTML = `<b>${esc(t.big)}</b>${read ? `<em class="hh-read">${esc(read)}</em>` : ''}${streak >= 3 && !ev.td ? `<em class="hh-fire">🔥 ${esc(this.name(offId))} is on fire · ${streak} in a row</em>` : ''}<small>${esc(this.name(offId))}: ${esc(callName(oc))} · ${esc(this.name(defId))}: ${esc(callName(dc))}</small>`;
        void ban.offsetWidth; ban.classList.add('pop');
        // big moments shake the screen or light up the field
        const live = $('#hhRoot');
        live.classList.remove('shake', 'tdflash'); void live.offsetWidth;
        if (ev.td || ev.good) live.classList.add('tdflash');
        else if (ev.kind === 'int' || ev.kind === 'fumble' || ev.kind === 'sack' || ev.result === 'TURNOVER ON DOWNS') live.classList.add('shake');
        // clutch time: the 2-minute warning, halftime and overtime get their own moment
        const late = gm.quarter >= 4 && !gm.over && gm.clock <= 120 && Math.abs(gm.score.us - gm.score.them) <= 8;
        if (late && root.dataset.clutch !== '1') { root.dataset.clutch = '1'; setTimeout(() => this.moment('⏱ 2:00 left', 'CLUTCH TIME', 'clutch'), 1100); }
        if (ev.half) setTimeout(() => this.moment('Halftime', `${this.name(M.a)} ${gm.score.us} – ${gm.score.them} ${this.name(M.b)}`, 'half'), 1100);
        if (ev.otStart) setTimeout(() => this.moment('Overtime', 'Next score wins!', 'clutch'), 1100);
        live.classList.toggle('clutch', late || gm.ot);
        if (ev.td) { Sfx.crowd(true); if (offId === me) { confetti(1200); buzz([40, 50, 40]); } }
        else if (ev.good) Sfx.good();
        else if (ev.kind === 'int' || ev.kind === 'fumble' || ev.result === 'TURNOVER ON DOWNS') { Sfx.hit(); buzz(40); }
        else if (ev.kind === 'sack') Sfx.hit();
        else if (ev.first) Sfx.good();
        else Sfx.tap();
        root.dataset.hold = Date.now() + 1100; // a beat to read the result before the next call
        // recent plays
        $('#hhLog').innerHTML = s.evs.slice(-4).reverse().map((e) => `<div><i class="${idOf(e.side) === me ? 'me' : ''}"></i>${esc(h2hLine(e, this.name(idOf(e.side))))}</div>`).join('');
      } else if (prev < 0) $('#hhBan').innerHTML = `<b>Kickoff!</b><small>${esc(this.name(s.off))} gets the ball first</small>`;
    }
    // what your opponent likes to call in this spot
    if (playing && !gm.over) {
      const want = s.off === me ? 'def' : 'off', C = (this.calls[this.game.gid] || {})[M.id] || {}, seen = [];
      s.evs.forEach((e, i) => { const oppOff = idOf(e.side) === opp; if ((want === 'off') === oppOff && C[i] && C[i][opp]) seen.push(C[i][opp]); });
      $('#hhTend').innerHTML = seen.length ? `<span>${esc(this.name(opp))}'s last ${want === 'off' ? 'plays' : 'defenses'}:</span>${seen.slice(-4).map((c) => `<b>${esc(callName(c))}</b>`).join('')}` : '';
    } else $('#hhTend').innerHTML = '';
    // the controls
    const ctl = $('#hhCtl'), myCall = playing ? s.calls[me] : null, role = !playing || gm.over ? null : s.off === me ? 'off' : 'def';
    const key = [gm.over, role, s.idx, !!myCall].join(':');
    if (ctl.dataset.key !== key) {
      ctl.dataset.key = key;
      if (gm.over) {
        const w = sc(M.a) > sc(M.b) ? M.a : M.b;
        ctl.innerHTML = `<div class="outcome ${!playing ? '' : w === me ? 'win' : 'loss'}" style="margin-top:12px"><h2>${w === me ? 'You win!' : esc(this.name(w)) + ' wins'}</h2><p>${Math.max(sc(M.a), sc(M.b))}–${Math.min(sc(M.a), sc(M.b))}${gm.ot ? ' in overtime' : ''}</p></div><button class="btn primary big" id="hb" style="width:100%;margin-top:10px">${B.size === 2 ? 'See result' : 'Back to the bracket'}</button>`;
        if (playing && !this.rewarded[M.id]) { this.rewarded[M.id] = true; const won = w === me; addXP(won ? 80 : 30); if (won) { confetti(); Sfx.trophy(); } else Sfx.groan(); Track.ev('h2h_match', won ? 'won' : 'lost'); }
      } else if (!role) ctl.innerHTML = `<p class="mute center" style="font-weight:700;margin-top:14px">${esc(this.name(s.off))} has the ball</p>`;
      else if (myCall) ctl.innerHTML = `<div class="hh-locked">${ico('check', 18)} You called <b>${esc(callName(myCall))}</b></div>`;
      else {
        const opts = role === 'off' ? GD.pvpOffense(gm) : GD.pvpDefense();
        const hold = Math.max(0, (+root.dataset.hold || 0) - Date.now());
        ctl.innerHTML = `<div class="hh-role ${role}">${role === 'off' ? 'Your ball · call a play' : 'Their ball · call a defense'}</div><div class="hh-timer"><i id="hht"></i></div>
          <div class="hh-opts">${opts.map((o) => `<button class="hh-opt ${role}" data-c="${o.id}" data-idx="${s.idx}" ${hold ? 'disabled' : ''}><b>${esc(o.name)}</b><small class="hh-hint">${esc(H2H_HINT[o.id] || o.sub || '')}</small>${role === 'off' && GD.PLAYS[o.id] ? `<small>${esc(o.sub)}</small>` : ''}</button>`).join('')}</div>`;
        if (hold) setTimeout(() => $$('#hhCtl [data-c]').forEach((b) => { b.disabled = false; }), hold);
      }
    }
    // is the other player done picking?
    $('#hhOpp').innerHTML = playing && !gm.over ? (s.calls[opp] ? `<span class="ok">${ico('check', 13)} ${esc(this.name(opp))} has called</span>` : `<span>${esc(this.name(opp))} is thinking…</span>`) : '';
    this.timerBar();
  },
  // a full-width splash for the big moments
  moment(big, small, cls) {
    const m = document.createElement('div');
    m.className = 'hh-moment ' + (cls || '');
    m.innerHTML = `<b>${esc(big)}</b><span>${esc(small)}</span>`;
    document.body.appendChild(m);
    if (cls === 'clutch') { Sfx.heartbeat(); buzz([60, 80, 60]); } else Sfx.whistle();
    setTimeout(() => m.classList.add('out'), 1500);
    setTimeout(() => m.remove(), 1900);
  },
  timerBar() {
    const t = document.getElementById('hht'); if (!t || !this.view || !this.view.mid) return;
    const key = Object.keys(this.seen).filter((k) => k.startsWith(this.view.mid + ':')).sort((a, b) => +b.split(':')[1] - +a.split(':')[1])[0];
    const left = key ? Math.max(0, 1 - (Date.now() - this.seen[key]) / H2H_PICK_MS) : 1;
    t.style.width = (left * 100) + '%'; t.classList.toggle('low', left < 0.3);
    if (left > 0 && left < 0.3 && document.querySelector('#hhCtl [data-c]')) Sfx.tick();
  },
};
// what each call is good and bad against (so it's a mind game, not a guess)
const H2H_HINT = {
  run: 'Beats Blitz · stuffed by Run stop', short: 'Beats Blitz · weak vs Zone', deep: 'Beats Run stop · picked off vs Zone', pa: 'Beats Run stop · sacked vs Blitz',
  blitz: 'Stops Play-action · beaten by quick throws', zone: 'Stops deep & quick passes · weak vs Run', man: 'Solid against everything', runstop: 'Stops the Run · burned by Deep & Play-action',
  fg: '', punt: 'Pin them deep',
};
// which defense shuts down which play, and which play beats which defense
const H2H_COUNTER = { runstop: ['run'], zone: ['short', 'deep'], blitz: ['pa'] };
const H2H_BEATS = { run: ['blitz'], short: ['blitz'], deep: ['runstop'], pa: ['runstop'] };
const callName = (c) => (!c ? '…' : GD.PLAYS[c] ? GD.PLAYS[c].name : GD.DEFS[c] ? GD.DEFS[c].name : c === 'fg' ? 'Field goal' : c === 'punt' ? 'Punt' : c);
function h2hBanner(ev) {
  const y = ev.yards;
  if (ev.td) return { big: 'TOUCHDOWN!', kind: 'good' };
  if (ev.result === 'SAFETY') return { big: 'SAFETY!', kind: 'bad' };
  if (ev.kind === 'fg') return ev.good ? { big: 'FIELD GOAL!', kind: 'good' } : { big: 'NO GOOD!', kind: 'bad' };
  if (ev.kind === 'punt') return { big: `PUNT · ${y} YDS`, kind: 'neutral' };
  if (ev.kind === 'int') return { big: 'INTERCEPTED!', kind: 'bad' };
  if (ev.kind === 'fumble') return { big: 'FUMBLE!', kind: 'bad' };
  if (ev.result === 'TURNOVER ON DOWNS') return { big: 'STOPPED ON 4TH!', kind: 'bad' };
  if (ev.kind === 'sack') return { big: `SACKED! ${y}`, kind: 'bad' };
  if (ev.kind === 'inc') return { big: 'INCOMPLETE', kind: 'bad' };
  if (y >= 20) return { big: `+${y} YDS! BIG PLAY`, kind: 'good' };
  if (y <= 0) return { big: `${y} YDS`, kind: 'bad' };
  return { big: `+${y} YDS${ev.first ? ' · 1ST DOWN' : ''}`, kind: 'good' };
}
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
