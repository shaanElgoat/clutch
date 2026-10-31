'use strict';
// Online rooms over MQTT (a real-time messaging server): every phone keeps ONE live WebSocket to the broker.
// Nothing waits on the host's phone, because the host is usually the one off in Messages texting the code:
//   CODE/m/ID    retained membership {name, j}. You add YOURSELF to the room, so joining works even when
//                the host's app is in the background, and up to 4 players can be in at once.
//   CODE/p/ID    retained presence. The broker clears it the moment a phone disconnects (last will),
//                so "who is here" is always true, and only people who are here count toward the 4 spots.
//   CODE/state   retained room state {v, host, status, blind, game:{ids, st}}. The player on the clock posts
//                their own pick straight to it (v+1), so a host checking a text never freezes the draft.
// The host only starts the draft, sets the rules and covers absent players; if the host goes, the next
// player who is here takes over automatically. Two public brokers: the code's first letter picks one.
const MQ_LIB = 'https://unpkg.com/mqtt@5.10.1/dist/mqtt.min.js';
const MQ_BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
const MQ_FIRST = ['ABCDEFGHJK', 'MNPQRSTUVW'];
const MQ_NS = 'clutch-nfl-q7x3/r/';
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MAX_ROOM = 4;
const HOST_GRACE = 6000;   // host missing this long -> the next player takes over
const COVER_MS = 15000;    // a player gone this long mid-draft gets CPU picks
const PRUNE_MS = 120000;   // gone this long in the lobby -> their spot is freed

const Net = {
  active: false, client: null, code: null, state: null, recs: {}, pres: {}, goneSince: {}, inGame: false, conn: true,
  get myId() { return Board.id(); },
  get peer() { return this.active; }, // older callers check Net.peer
  get isHost() { return !!(this.state && this.state.host === this.myId); },
  get blind() { return !!(this.state && this.state.blind); },
  get hostId() { return this.state && this.state.host; },
  here(id) { return id === this.myId ? this.active : !!this.pres[id]; },
  isIdGone(id) { return !this.here(id); },
  // everyone with a membership record, in join order
  list() {
    return Object.keys(this.recs).map((id) => ({ id, name: this.recs[id].name, j: this.recs[id].j || 0, gone: !this.here(id) }))
      .sort((a, b) => a.j - b.j || (a.id < b.id ? -1 : 1));
  },
  get members() { return this.list(); },
  t: (code, k) => MQ_NS + code + '/' + k,

  loadLib() {
    if (typeof mqtt !== 'undefined') return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = MQ_LIB; s.onload = () => res(); s.onerror = () => rej(new Error("Can't reach the game server. Check your internet."));
      document.head.appendChild(s);
    });
  },
  brokerFor: (code) => (MQ_FIRST[1].includes(code[0]) ? 1 : 0),
  async connect(code, name) {
    await this.loadLib();
    this.stop();
    Object.assign(this, { state: null, recs: {}, pres: {}, goneSince: {} });
    const b = this.brokerFor(code), me = this.myId;
    const presT = this.t(code, 'p/' + me);
    return new Promise((resolve, reject) => {
      const client = mqtt.connect(MQ_BROKERS[b], {
        clientId: 'cl_' + me + '_' + Math.random().toString(36).slice(2, 6), keepalive: 10, reconnectPeriod: 1500, connectTimeout: 8000, clean: true,
        will: { topic: presT, payload: '', retain: true, qos: 1 }, // the broker clears our presence if we vanish
      });
      this.client = client; this.code = code; this.name = name;
      let first = true;
      const fail = setTimeout(() => { if (first) { first = false; client.end(true); reject(new Error("Can't reach the game server. Check your internet.")); } }, 9000);
      client.on('connect', () => {
        this.setConn(true);
        client.subscribe([this.t(code, 'state'), this.t(code, 'p/+'), this.t(code, 'm/+')], { qos: 1 });
        client.publish(presT, JSON.stringify({ name, t: Date.now() }), { retain: true, qos: 1 });
        if (first) { first = false; clearTimeout(fail); resolve(); }
      });
      client.on('reconnect', () => this.setConn(false));
      client.on('offline', () => this.setConn(false));
      client.on('message', (topic, buf) => this.onMsg(topic, buf.toString()));
    });
  },
  stop() {
    if (this.client) { try { this.client.end(true); } catch (_) {} this.client = null; }
    if (this.tick) { clearInterval(this.tick); this.tick = null; }
  },
  pub(k, obj, retain) { if (this.client) this.client.publish(this.t(this.code, k), obj === null ? '' : JSON.stringify(obj), { retain: !!retain, qos: 1 }); },
  addMe(name) { this.recs[this.myId] = { name, j: (this.recs[this.myId] && this.recs[this.myId].j) || Date.now() }; this.pub('m/' + this.myId, this.recs[this.myId], true); },

  // ----- create / join / leave -----
  async hostRoom(name) {
    for (let k = 0; k < 4; k++) {
      const b = k % 2;
      const code = MQ_FIRST[b][Math.floor(Math.random() * MQ_FIRST[b].length)] + Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
      try { await this.connect(code, name); } catch (e) { if (k === 3) throw e; continue; }
      await sleep(900); // a room with this code already? (its retained state would have arrived)
      if (this.state) { this.stop(); continue; }
      this.begin(code);
      this.addMe(name);
      this.setState({ v: 1, host: this.myId, status: 'lobby', blind: false, game: null });
      return code;
    }
    throw new Error("Can't reach the game server. Check your internet.");
  },
  async joinRoom(code, name) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    if (code.length !== 5) throw new Error('Room codes are 5 characters.');
    await this.connect(code, name);
    for (let i = 0; i < 25 && !this.state; i++) await sleep(200);
    await sleep(300); // let the member and presence records arrive too
    if (!this.state) { this.stop(); throw new Error('Room not found. Check the code.'); }
    const st = this.state, mine = !!this.recs[this.myId];
    if (!mine) {
      const inDraft = st.status === 'draft' && st.game && st.game.ids.includes(this.myId);
      if (st.status === 'draft' && !inDraft) { this.stop(); throw new Error('That room is mid-draft. Try again after.'); }
      if (this.list().filter((m) => !m.gone).length >= MAX_ROOM) { this.stop(); throw new Error('That room is full.'); }
    }
    this.begin(code);
    this.addMe(name);
    // nobody else is here (everyone closed the app)? then this phone picks the room up
    if (!this.list().some((m) => m.id !== this.myId && !m.gone)) this.takeOver();
    return code;
  },
  begin(code) {
    Object.assign(this, { active: true, code, inGame: false });
    Store.data.room = { code }; Store.save();
    this.tick = setInterval(() => this.housekeep(), 2000);
  },
  leave() {
    const wasHost = this.isHost, st = this.state;
    if (this.client && this.code) {
      this.pub('p/' + this.myId, null, true);
      const others = this.list().filter((m) => m.id !== this.myId && !m.gone);
      if (!others.length) { this.pub('state', null, true); this.list().forEach((m) => this.pub('m/' + m.id, null, true)); } // last one out clears the room
      else {
        if (!st || st.status === 'lobby') this.pub('m/' + this.myId, null, true);
        if (wasHost && st) this.setState(Object.assign({}, st, { host: others[0].id, v: st.v + 1 }));
      }
    }
    const c = this.client;
    this.client = null;
    if (this.tick) { clearInterval(this.tick); this.tick = null; }
    if (c) setTimeout(() => { try { c.end(); } catch (_) {} }, 400);
    Object.assign(this, { active: false, code: null, state: null, recs: {}, pres: {}, inGame: false });
    Store.data.room = null; Store.save();
  },
  reset() { this.leave(); },

  // ----- messages -----
  onMsg(topic, raw) {
    const k = topic.slice((MQ_NS + this.code + '/').length);
    if (k === 'state') {
      if (!raw) { if (this.active) { toast('The room closed'); this.leave(); goTab('play'); } else this.state = null; return; }
      let s; try { s = JSON.parse(raw); } catch (_) { return; }
      if (this.state && s.v < this.state.v) return; // stale
      this.state = s;
      if (this.active) this.onState();
    } else if (k.startsWith('p/')) {
      const id = k.slice(2);
      if (raw) { this.pres[id] = true; delete this.goneSince[id]; } else { delete this.pres[id]; this.goneSince[id] = Date.now(); }
      if (this.active) this.onPresence();
    } else if (k.startsWith('m/')) {
      const id = k.slice(2);
      if (raw) { try { this.recs[id] = JSON.parse(raw); } catch (_) { return; } }
      else if (id === this.myId && this.active) { this.addMe(this.name); return; } // tidied out while away: put ourselves back
      else delete this.recs[id];
      if (this.active) this.onPresence();
    }
  },
  setState(s) { this.state = s; this.pub('state', s, true); this.onState(); },
  bump(changes) { this.setState(Object.assign({}, this.state, changes, { v: this.state.v + 1 })); },
  onPresence() {
    if (!this.state) return;
    if (App.screen === 'lobby' && this.lobbySig() !== this.sig) Lobby();
    this.housekeep();
  },
  // every couple of seconds: elect a host if needed, tidy the lobby, cover absent drafters
  housekeep() {
    const st = this.state;
    if (!this.active || !st) return;
    const host = st.host;
    if (!this.here(host)) {
      const since = this.goneSince[host] || (this.goneSince[host] = Date.now());
      const next = this.list().find((m) => !m.gone);
      if (next && next.id === this.myId && Date.now() - since > HOST_GRACE) this.takeOver();
    }
    if (!this.isHost) return;
    if (st.status === 'lobby') this.list().forEach((m) => { if (m.gone && this.goneSince[m.id] && Date.now() - this.goneSince[m.id] > PRUNE_MS) { this.pub('m/' + m.id, null, true); delete this.recs[m.id]; } });
    if (st.status === 'draft' && App.g && App.g.online && !App.g.finished) maybeCpu();
  },
  takeOver() {
    if (!this.state || this.isHost) return;
    this.bump({ host: this.myId });
    toast("You're the host now");
  },
  onState() {
    const st = this.state;
    if (st.status === 'draft' && st.game) {
      const me = st.game.ids.indexOf(this.myId);
      if (me < 0) return;
      if (!this.inGame || !App.g || !App.g.online) { this.inGame = true; startOnline(JSON.parse(JSON.stringify(st.game.st)), me); return; }
      const g = App.g, dst = st.game.st;
      if (dst.log.length > g.st.log.length || (dst.log.length === g.st.log.length && JSON.stringify(dst.log) !== JSON.stringify(g.st.log))) {
        const last = dst.log[dst.log.length - 1];
        if (last && last.t === 'pick') { g.lastPlaced = { mi: last.m, slot: last.slot }; if (last.m !== g.me) Sfx.place(); }
        g.st = JSON.parse(JSON.stringify(dst)); g.pending = false;
        if (!g.finished) draftUpdate();
      }
      return;
    }
    if (st.status === 'lobby') {
      if (this.inGame) { this.inGame = false; Lobby(); return; }
      if (App.screen === 'joining' && this.recs[this.myId]) { Lobby(); return; }
      if (App.screen === 'lobby' && this.lobbySig() !== this.sig) Lobby();
    }
  },
  lobbySig() { return JSON.stringify([this.list().map((x) => [x.id, x.name, x.gone]), this.hostId, this.blind]); },
  setConn(ok) {
    this.conn = ok;
    const p = document.getElementById('netPill');
    if (p) { p.classList.toggle('bad', !ok); p.lastChild.textContent = ok ? ' Live' : ' Reconnecting…'; }
  },

  // ----- game -----
  startGame() {
    const present = this.list().filter((x) => !x.gone).slice(0, MAX_ROOM);
    if (present.length < 2) { toast('Need at least 2 players'); return; }
    const seed = 'o:' + this.code + ':' + Date.now().toString(36);
    const dst = TE.createDraft({ seed, blind: this.blind, managers: present.map((x) => ({ name: x.name })) });
    this.bump({ status: 'draft', game: { ids: present.map((x) => x.id), st: dst } });
  },
  // after a local pick (yours, or a CPU pick the host made for someone absent): post the new board
  broadcastState(st) {
    if (!this.state || !this.state.game) return;
    this.bump({ game: { ids: this.state.game.ids, st: JSON.parse(JSON.stringify(st)) } });
  },
  // the host covers anyone who has been gone a while mid-draft
  coverFor(mi) {
    const ids = (this.state && this.state.game && this.state.game.ids) || [];
    const id = ids[mi];
    return !!id && this.isHost && !this.here(id) && Date.now() - (this.goneSince[id] || Date.now()) > COVER_MS;
  },
  isGone(mi) { const ids = (this.state && this.state.game && this.state.game.ids) || []; return !!ids[mi] && !this.here(ids[mi]); },
  backToLobby() { if (this.isHost) this.bump({ status: 'lobby', game: null }); },
  setBlind(on) { if (this.isHost) this.bump({ blind: !!on }); },
  link() { return location.origin + location.pathname + '?room=' + this.code; },
};
const cleanName = (n) => (String(n || '').trim().slice(0, 14) || 'Player');

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
  const nm = $('#nm', el);
  nm.addEventListener('input', () => { Store.data.name = nm.value.slice(0, 14); Store.save(); });
  const name = () => cleanName(nm.value || 'Player');
  const status = (t) => { const s = $('#netStatus', el); if (s) s.textContent = t; };
  const busy = (on) => $$('#host, #join, #rejoin', el).forEach((b) => { b.disabled = on; });
  $('#host', el).addEventListener('click', async () => {
    busy(true); status('Making a room…');
    try { await Net.hostRoom(name()); App.screen = 'lobby'; Lobby(); } catch (e) { status(e.message); busy(false); }
  });
  const join = async (code) => {
    busy(true); status('Joining…'); App.screen = 'joining';
    try { await Net.joinRoom(code, name()); if (App.screen === 'joining' && Net.state && Net.state.status === 'lobby') Lobby(); else if (App.screen === 'joining') Net.onState(); }
    catch (e) { App.screen = 'online'; status(e.message); busy(false); }
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
  Net.sig = Net.lobbySig();
  const mem = Net.list();
  const here = mem.filter((m) => !m.gone);
  const el = go(`
    <div class="topbar"><button class="icon-btn" id="leave">${ICON.back}</button><h2 class="d grow">Room</h2><span class="pill net-pill ${Net.conn === false ? 'bad' : ''}" id="netPill">${ico('globe', 14)}<span>${Net.conn === false ? ' Reconnecting…' : ' Live'}</span></span></div>
    <div class="room-code"><small>Room code</small><b>${esc(Net.code || '')}</b><span>Friends join from Play with friends, on any network</span></div>
    <div class="two" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px"><button class="btn small" id="copy" style="width:100%">${ico('share', 16)} Copy link</button><button class="btn small" id="shr" style="width:100%">${ico('users', 16)} Invite</button></div>
    <div class="group-title">Players (${here.length}/${MAX_ROOM})</div>
    <div class="group">${mem.map((m, i) => `<div class="lrow" style="cursor:default"><span class="dot" style="background:${MGR_COLORS[i % 4]};width:14px;height:14px"></span><div class="grow"><b>${esc(m.name)}${m.id === Net.myId ? ' (you)' : ''}</b><small>${m.gone ? 'Away' : m.id === Net.hostId ? 'Host' : 'Ready'}</small></div>${m.id === Net.hostId ? '<span class="lmeta hot">Host</span>' : ''}</div>`).join('')}</div>
    ${Net.isHost ? `<div class="group-title">Rules</div><button class="toggle ${Net.blind ? 'on' : ''}" id="tgBlind"><div class="grow"><h4>Blind draft</h4><p>Hide all ratings for everyone.</p></div><div class="sw"></div></button>` : `<p class="mute center" style="font-weight:600">${Net.blind ? 'Blind draft: ratings hidden.' : 'Classic draft: ratings shown.'}</p>`}
    <div class="spacer"></div>
    ${Net.isHost ? `<button class="btn primary big" id="start" ${here.length < 2 ? 'disabled' : ''}>${here.length < 2 ? 'Waiting for friends…' : ico('play', 18) + ' Start draft'}</button>` : '<div class="mute center" style="padding:14px;font-weight:700">Waiting for the host to start…</div>'}
    <p class="mute center" style="font-size:12px;font-weight:600;margin:10px 0 0">You can switch apps or lock your phone. You'll stay in the room.</p>`);
  App.screen = 'lobby';
  tipOnce('lobby');
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
