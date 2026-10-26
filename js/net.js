'use strict';
// Online rooms, backed by the Firebase Realtime Database (same project as the Daily rankings).
// The room lives on the server, so it works on any network, survives switching apps or locking
// the phone, and you can rejoin after closing the app.
//   rooms/CODE/meta            { host, status: 'lobby' | 'draft', blind, created }
//   rooms/CODE/members/ID      { name, j: joined, seen: heartbeat }
//   rooms/CODE/game            { ver, ids: [member ids in draft order], st: JSON string of the draft }
// Whoever is on the clock applies their own pick and writes the new board with ver + 1; the database
// rules reject a write whose ver isn't exactly one more, so two phones can never overwrite each other.
const NET_DB = BOARD_URL;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MAX_ROOM = 4;
const GONE_MS = 35000;

const Net = {
  active: false, code: null, room: {}, es: null, hb: null, ver: 0, inGame: false, seen: {},
  get myId() { return Board.id(); },
  get peer() { return this.active; }, // older callers check Net.peer
  // members in join order; anyone not heard from for 35s counts as gone
  list() {
    const m = this.room.members || {};
    return Object.keys(m).filter((id) => m[id] && m[id].name).map((id) => ({ id, name: m[id].name, j: m[id].j || 0, gone: this.isIdGone(id) })).sort((a, b) => a.j - b.j || (a.id < b.id ? -1 : 1));
  },
  isIdGone(id) {
    if (id === this.myId) return false;
    const s = this.seen[id];
    return !s || Date.now() - s.at > GONE_MS;
  },
  // the host is the earliest-joined member who is still here (so a room never gets stuck without one)
  get hostId() { const l = this.list().filter((m) => !m.gone); return l.length ? l[0].id : null; },
  get isHost() { return this.hostId === this.myId; },
  get blind() { return !!(this.room.meta && this.room.meta.blind); },
  get members() { return this.list(); },

  url: (p) => `${NET_DB}/rooms/${p}.json`,
  async req(method, path, body) {
    const res = await fetch(this.url(path), { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) { const e = new Error('net ' + res.status); e.status = res.status; throw e; }
    return res.status === 204 ? null : res.json();
  },

  // ----- create / join / leave -----
  async hostRoom(name) {
    for (let k = 0; k < 6; k++) {
      const code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
      const exists = await this.req('GET', code + '/meta');
      if (exists) continue;
      await this.req('PUT', code, {
        meta: { host: this.myId, status: 'lobby', blind: false, created: { '.sv': 'timestamp' } },
        members: { [this.myId]: { name, j: { '.sv': 'timestamp' }, seen: { '.sv': 'timestamp' } } },
      });
      this.start(code);
      return code;
    }
    throw new Error('Could not make a room. Try again.');
  },
  async joinRoom(code, name) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    if (code.length !== 5) throw new Error('Room codes are 5 characters.');
    const room = await this.req('GET', code);
    if (!room || !room.meta) throw new Error('Room not found. Check the code.');
    const mem = room.members || {};
    const inDraft = room.meta.status === 'draft' && room.game && (room.game.ids || []).includes(this.myId);
    if (!mem[this.myId]) {
      if (room.meta.status === 'draft' && !inDraft) throw new Error('That room is mid-draft. Try again after.');
      if (Object.keys(mem).length >= MAX_ROOM) throw new Error('That room is full.');
    }
    await this.req('PATCH', code + '/members/' + this.myId, { name, j: mem[this.myId] ? mem[this.myId].j : { '.sv': 'timestamp' }, seen: { '.sv': 'timestamp' } });
    this.start(code);
    return code;
  },
  start(code) {
    this.stop();
    Object.assign(this, { active: true, code, room: {}, ver: 0, inGame: false, seen: {} });
    Store.data.room = { code }; Store.save();
    this.listen();
    this.hb = setInterval(() => this.beat(), 10000);
  },
  beat() {
    if (!this.active) return;
    this.req('PUT', this.code + '/members/' + this.myId + '/seen', { '.sv': 'timestamp' }).catch((e) => {
      // we were removed from the room (pruned while away): drop back out
      if (e.status === 401 || e.status === 403) { this.leave(true); toast('You were removed from the room'); goTab('play'); }
    });
  },
  stop() {
    if (this.es) { try { this.es.close(); } catch (_) {} this.es = null; }
    if (this.hb) { clearInterval(this.hb); this.hb = null; }
  },
  leave(silent) {
    const code = this.code, id = this.myId, wasActive = this.active;
    const others = Object.keys((this.room && this.room.members) || {}).filter((m) => m !== id).length;
    this.stop();
    // the last one out deletes the room so empty rooms don't pile up
    if (wasActive && code && !others) { this.req('DELETE', code).catch(() => {}); Object.assign(this, { active: false, code: null, room: {}, ver: 0, inGame: false, seen: {} }); Store.data.room = null; Store.save(); return; }
    Object.assign(this, { active: false, code: null, room: {}, ver: 0, inGame: false, seen: {} });
    Store.data.room = null; Store.save();
    if (wasActive && code) this.req('DELETE', code + '/members/' + id).catch(() => {});
  },
  reset() { this.leave(true); },

  // ----- live updates (server-sent events from the database) -----
  listen() {
    const es = new EventSource(this.url(this.code));
    this.es = es;
    const apply = (ev, patch) => {
      let msg; try { msg = JSON.parse(ev.data); } catch (_) { return; }
      if (!msg) return;
      const segs = msg.path.split('/').filter(Boolean);
      if (!segs.length) { if (patch) Object.assign(this.room, msg.data || {}); else this.room = msg.data || {}; }
      else {
        let o = this.room;
        for (let i = 0; i < segs.length - 1; i++) { if (typeof o[segs[i]] !== 'object' || o[segs[i]] === null) o[segs[i]] = {}; o = o[segs[i]]; }
        const last = segs[segs.length - 1];
        if (patch) { o[last] = Object.assign(typeof o[last] === 'object' && o[last] ? o[last] : {}, msg.data); Object.keys(msg.data || {}).forEach((k) => { if (msg.data[k] === null) delete o[last][k]; }); }
        else if (msg.data === null) delete o[last]; else o[last] = msg.data;
      }
      this.onRoom();
    };
    es.addEventListener('put', (ev) => apply(ev, false));
    es.addEventListener('patch', (ev) => apply(ev, true));
    es.addEventListener('cancel', () => { toast('Lost the room. Rejoin from Play with friends.'); this.leave(true); goTab('play'); });
  },
  onRoom() {
    if (!this.active) return;
    if (!this.room || !this.room.meta) { toast('The room closed'); this.leave(true); goTab('play'); return; }
    // presence: remember when each member's heartbeat last moved
    const m = this.room.members || {};
    Object.keys(m).forEach((id) => { const v = m[id] && m[id].seen; const s = this.seen[id]; if (!s || s.v !== v) this.seen[id] = { v, at: Date.now() }; });
    const meta = this.room.meta, game = this.room.game;
    if (meta.status === 'draft' && game && game.st) {
      const ids = game.ids || [], me = ids.indexOf(this.myId);
      if (me < 0) return;
      if (!this.inGame) {
        this.inGame = true; this.ver = game.ver;
        startOnline(JSON.parse(game.st), me);
        return;
      }
      if (game.ver > this.ver && App.g && App.g.online) {
        this.ver = game.ver;
        const st = JSON.parse(game.st), g = App.g;
        const last = st.log[st.log.length - 1];
        if (last && last.t === 'pick') { g.lastPlaced = { mi: last.m, slot: last.slot }; if (last.m !== g.me) Sfx.place(); }
        g.st = st; g.pending = false;
        if (!g.finished) draftUpdate();
      }
      // heartbeats keep arriving, so this is where we notice that the player on the clock has gone
      if (App.g && App.g.online && !App.g.finished) maybeCpu();
      return;
    }
    if (meta.status === 'lobby') {
      if (this.inGame) { this.inGame = false; Lobby(); return; }
      if (App.screen === 'lobby' || App.screen === 'joining') Lobby();
      // the host tidies up anyone who has been gone a while
      if (this.isHost) this.list().filter((x) => x.gone && x.id !== this.myId).forEach((x) => this.req('DELETE', this.code + '/members/' + x.id).catch(() => {}));
    }
  },

  // ----- game -----
  async startGame() {
    const present = this.list().filter((x) => !x.gone);
    if (present.length < 2) { toast('Need at least 2 players'); return; }
    const seed = 'o:' + this.code + ':' + Date.now().toString(36);
    const st = TE.createDraft({ seed, blind: this.blind, managers: present.map((x) => ({ name: x.name })) });
    const ver = ((this.room.game && this.room.game.ver) || 0) + 1;
    try {
      await this.req('PUT', this.code + '/game', { ver, ids: present.map((x) => x.id), st: JSON.stringify(st) });
      await this.req('PATCH', this.code + '/meta', { status: 'draft' });
    } catch (_) { toast("Couldn't start. Try again."); }
  },
  // write the board after a pick; if someone else got there first, take their version instead
  broadcastState(st) {
    const ver = this.ver + 1;
    this.ver = ver;
    const ids = (this.room.game && this.room.game.ids) || [];
    this.req('PUT', this.code + '/game', { ver, ids, st: JSON.stringify(st) }).catch(async () => {
      try {
        const game = await this.req('GET', this.code + '/game');
        if (game && App.g && App.g.online) { this.ver = game.ver; App.g.st = JSON.parse(game.st); App.g.pending = false; draftUpdate(); toast('Board updated'); }
      } catch (_) {}
    });
  },
  // a gone player's picks are covered by the CPU, run by the first player still here (so only one phone does it)
  coverFor(mi) {
    const ids = (this.room.game && this.room.game.ids) || [];
    if (!ids[mi] || !this.isIdGone(ids[mi])) return false;
    const firstHere = ids.find((id) => !this.isIdGone(id));
    return firstHere === this.myId;
  },
  isGone(mi) { const ids = (this.room.game && this.room.game.ids) || []; return !!ids[mi] && this.isIdGone(ids[mi]); },
  backToLobby() { this.req('PATCH', this.code + '/meta', { status: 'lobby' }).catch(() => toast("Couldn't reach the room")); },
  setBlind(on) { this.req('PATCH', this.code + '/meta', { blind: !!on }).catch(() => {}); },
  link() { return location.origin + location.pathname + '?room=' + this.code; },
};
const cleanName = (n) => (String(n || '').trim().slice(0, 14) || 'Player');

// phones pause background pages: say hello again the moment the app comes back
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !Net.active) return;
  Net.beat();
  if (!Net.es || Net.es.readyState === 2) Net.listen();
});

// ================= SCREENS =================
function OnlineScreen() {
  const saved = Store.data.room && Store.data.room.code;
  const el = go(`
    <div class="topbar"><button class="icon-btn" data-act="home">${ICON.back}</button><h2 class="d grow">Play friends</h2></div>
    <p class="mute" style="margin:0;font-weight:600;line-height:1.5">Draft live against up to 3 friends on their own phones, on any network. Everyone picks from the same spin, so steal the player they need.</p>
    ${saved ? `<button class="cont" id="rejoin" style="margin-top:14px"><div class="mc-ic violet">${ico('users', 20)}</div><div class="grow"><b>Rejoin room ${esc(saved)}</b><small>Pick up where you left off</small></div><span class="dl-go">${ico('play', 14)}</span></button>` : ''}
    <div class="section-title">Your name</div>
    <input class="field" id="nm" maxlength="14" placeholder="Your name" value="${esc(Store.data.name)}">
    <div class="section-title">Host</div>
    <button class="btn primary" id="host">${ico('users', 18)} Create a room</button>
    <div class="section-title">Join</div>
    <div class="row"><input class="field grow" id="code" maxlength="5" placeholder="ROOM CODE" autocomplete="off" style="text-transform:uppercase;letter-spacing:.2em;font-weight:800" value="${esc(App.pendingRoom || '')}"><button class="btn small" id="join" style="padding:14px 18px">Join</button></div>
    <p class="mute center" id="netStatus" style="min-height:20px;font-weight:600"></p>`);
  App.screen = 'online';
  if (!Board.on()) { $('#netStatus', el).textContent = 'Online play is not set up.'; return; }
  const nm = $('#nm', el);
  nm.addEventListener('input', () => { Store.data.name = nm.value.slice(0, 14); Store.save(); });
  const name = () => cleanName(nm.value || 'Player');
  const status = (t) => { $('#netStatus', el).textContent = t; };
  const busy = (on) => $$('#host, #join, #rejoin', el).forEach((b) => { b.disabled = on; });
  $('#host', el).addEventListener('click', async () => {
    busy(true); status('Making a room…');
    try { await Net.hostRoom(name()); App.screen = 'lobby'; Lobby(); } catch (e) { status(e.message.startsWith('net') ? "Can't reach the game server. Check your internet." : e.message); busy(false); }
  });
  const join = async (code) => {
    busy(true); status('Joining…'); App.screen = 'joining';
    try { await Net.joinRoom(code, name()); status('Connected. Loading the room…'); }
    catch (e) { App.screen = 'online'; status(e.message.startsWith('net') ? "Can't reach the game server. Check your internet." : e.message); busy(false); }
  };
  $('#join', el).addEventListener('click', () => join($('#code', el).value));
  $('#code', el).addEventListener('keydown', (e) => { if (e.key === 'Enter') join($('#code', el).value); });
  const rj = $('#rejoin', el);
  if (rj) rj.addEventListener('click', () => join(saved));
  if (App.pendingRoom && Store.data.name) { const c = App.pendingRoom; App.pendingRoom = null; join(c); }
  App.pendingRoom = null;
}

function Lobby() {
  App.g = null;
  const mem = Net.list();
  const here = mem.filter((m) => !m.gone);
  const el = go(`
    <div class="topbar"><button class="icon-btn" id="leave">${ICON.back}</button><h2 class="d grow">Room</h2><span class="pill">${ico('globe', 14)} Live</span></div>
    <div class="room-code"><small>Room code</small><b>${esc(Net.code || '')}</b><span>Friends join from Play with friends, on any network</span></div>
    <div class="two" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px"><button class="btn small" id="copy" style="width:100%">${ico('share', 16)} Copy link</button><button class="btn small" id="shr" style="width:100%">${ico('users', 16)} Invite</button></div>
    <div class="group-title">Players (${here.length}/${MAX_ROOM})</div>
    <div class="group">${mem.map((m, i) => `<div class="lrow" style="cursor:default"><span class="dot" style="background:${MGR_COLORS[i % 4]};width:14px;height:14px"></span><div class="grow"><b>${esc(m.name)}${m.id === Net.myId ? ' (you)' : ''}</b><small>${m.gone ? 'Away' : m.id === Net.hostId ? 'Host' : 'Ready'}</small></div>${m.id === Net.hostId ? '<span class="lmeta hot">Host</span>' : ''}</div>`).join('')}</div>
    ${Net.isHost ? `<div class="group-title">Rules</div><button class="toggle ${Net.blind ? 'on' : ''}" id="tgBlind"><div class="grow"><h4>Blind draft</h4><p>Hide all ratings for everyone.</p></div><div class="sw"></div></button>` : `<p class="mute center" style="font-weight:600">${Net.blind ? 'Blind draft: ratings hidden.' : 'Classic draft: ratings shown.'}</p>`}
    <div class="spacer"></div>
    ${Net.isHost ? `<button class="btn primary big" id="start" ${here.length < 2 ? 'disabled' : ''}>${here.length < 2 ? 'Waiting for friends…' : ico('play', 18) + ' Start draft'}</button>` : '<div class="mute center" style="padding:14px;font-weight:700">Waiting for the host to start…</div>'}
    <p class="mute center" style="font-size:12px;font-weight:600;margin:10px 0 0">You can switch apps or lock your phone. You'll stay in the room.</p>`);
  App.screen = 'lobby';
  $('#leave', el).addEventListener('click', () => { Net.leave(); goTab('play'); });
  $('#copy', el).addEventListener('click', async () => { try { await navigator.clipboard.writeText(Net.link()); toast('Invite link copied'); } catch (_) { toast(Net.link()); } });
  $('#shr', el).addEventListener('click', async () => {
    if (navigator.share) { try { await navigator.share({ title: 'CLUTCH', text: `Join my CLUTCH draft. Room ${Net.code}`, url: Net.link() }); } catch (_) {} } else { try { await navigator.clipboard.writeText(Net.link()); toast('Invite link copied'); } catch (_) {} }
  });
  const tb = $('#tgBlind', el);
  if (tb) tb.addEventListener('click', () => { Net.setBlind(!Net.blind); });
  const sb = $('#start', el);
  if (sb) sb.addEventListener('click', () => { sb.disabled = true; Net.startGame(); });
}
// startOnline() lives in app.js
