'use strict';
// Online rooms over WebRTC (PeerJS). The host's browser is authoritative: it owns the draft
// state, validates every pick and broadcasts the new state. Seasons are simulated locally from
// the same seed + XIs, so every phone sees identical results.
const PEER_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.4/peerjs.min.js';
const PEER_PREFIX = 'clutch-v1-';
const PEER_OPTS = { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] } };
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MAX_ROOM = 4;

const Net = {
  peer: null, isHost: false, code: null, myId: null,
  conns: new Map(), host: null,
  members: [], blind: false, inGame: false,

  loadLib() {
    if (typeof Peer !== 'undefined') return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = PEER_LIB; s.onload = () => res(); s.onerror = () => rej(new Error('Online play needs an internet connection.'));
      document.head.appendChild(s);
    });
  },

  // ----- host -----
  async hostRoom(card) {
    await this.loadLib();
    return withRetry(() => new Promise((resolve, reject) => {
      const code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
      const peer = new Peer(PEER_PREFIX + code, PEER_OPTS);
      let opened = false;
      peer.on('open', (id) => {
        opened = true;
        Object.assign(this, { peer, isHost: true, code, myId: id, inGame: false, blind: false });
        this.members = [{ id, name: card.name, host: true }];
        resolve(code);
      });
      peer.on('connection', (conn) => this.accept(conn));
      peer.on('error', (err) => {
        if (!opened) { peer.destroy(); reject(netErr(err)); } else toast(netErrText(err));
      });
      peer.on('disconnected', () => { try { if (!peer.destroyed) peer.reconnect(); } catch (_) {} });
    }));
  },
  accept(conn) {
    conn.on('open', () => {
      if (this.members.length >= MAX_ROOM) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); return; }
      if (this.inGame) { conn.send({ t: 'busy' }); setTimeout(() => conn.close(), 300); return; }
      this.conns.set(conn.peer, conn);
    });
    conn.on('data', (m) => this.hostData(conn, m));
    const drop = () => this.drop(conn.peer);
    conn.on('close', drop); conn.on('error', drop);
  },
  hostData(conn, m) {
    if (!m || typeof m !== 'object') return;
    const idx = this.members.findIndex((x) => x.id === conn.peer);
    if (m.t === 'hello') {
      if (idx >= 0 || this.inGame) return;
      this.members.push({ id: conn.peer, name: cleanName(m.name) });
      this.broadcastLobby();
      toast(cleanName(m.name) + ' joined');
    } else if (m.t === 'pick' && idx >= 0 && this.inGame && App.g && App.g.online) {
      const st = App.g.st;
      const err = TE.pick(st, idx, +m.pid, +m.slot);
      if (err) { conn.send({ t: 'err', msg: err, st }); return; }
      App.g.lastPlaced = { mi: idx, slot: +m.slot };
      Sfx.place();
      this.broadcastState(st);
      draftUpdate();
    }
  },
  drop(peerId) {
    if (!this.conns.has(peerId)) return;
    this.conns.delete(peerId);
    const idx = this.members.findIndex((x) => x.id === peerId);
    if (idx < 0) return;
    if (this.inGame) {
      this.members[idx].gone = true;
      toast(this.members[idx].name + ' left · CPU takes over');
      if (App.g && App.g.online) maybeCpu();
    } else {
      toast(this.members[idx].name + ' left');
      this.members.splice(idx, 1);
      this.broadcastLobby();
    }
  },
  isGone(mi) { return !!(this.members[mi] && this.members[mi].gone); },
  broadcast(msg) { this.conns.forEach((c) => { if (c.open) { try { c.send(msg); } catch (_) {} } }); },
  broadcastLobby() {
    this.broadcast({ t: 'lobby', members: this.members.map(pub), blind: this.blind, code: this.code });
    if (App.screen === 'lobby') Lobby();
  },
  broadcastState(st) { this.broadcast({ t: 'st', st }); },
  startGame() {
    const seed = 'o:' + this.code + ':' + Date.now().toString(36);
    const st = TE.createDraft({ seed, blind: this.blind, managers: this.members.map((m) => ({ name: m.name })) });
    this.inGame = true;
    this.broadcast({ t: 'start', st, ids: this.members.map((m) => m.id), members: this.members.map(pub) });
    startOnline(st, 0);
  },
  backToLobby() {
    this.inGame = false;
    this.members = this.members.filter((m) => !m.gone);
    this.broadcast({ t: 'lobby', members: this.members.map(pub), blind: this.blind, code: this.code, reset: true });
    Lobby();
  },

  // ----- client -----
  async joinRoom(code, card) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    if (code.length !== 5) throw new Error('Room codes are 5 characters.');
    await this.loadLib();
    this.leave(true);
    return withRetry(() => new Promise((resolve, reject) => {
      const peer = new Peer(undefined, PEER_OPTS);
      let done = false;
      const fail = (msg, transient) => { if (done) return; done = true; this.reset(); peer.destroy(); const e = new Error(msg); e.transient = transient; reject(e); };
      const timer = setTimeout(() => fail('Could not reach that room. Check the code and try again.'), 12000);
      peer.on('open', (id) => {
        this.peer = peer; this.myId = id;
        const conn = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
        conn.on('open', () => {
          clearTimeout(timer); done = true;
          Object.assign(this, { isHost: false, code, host: conn });
          conn.send({ t: 'hello', name: card.name });
          resolve(code);
        });
        conn.on('data', (m) => this.clientData(m));
        conn.on('close', () => { if (this.host === conn) { this.reset(); toast('The host closed the room'); Home(); } });
      });
      peer.on('error', (err) => {
        if (err.type === 'peer-unavailable') { clearTimeout(timer); fail('Room not found. It may have closed.'); } else if (!done) { clearTimeout(timer); const e = netErr(err); fail(e.message, e.transient); } else toast(netErrText(err));
      });
      peer.on('disconnected', () => { try { if (!peer.destroyed) peer.reconnect(); } catch (_) {} });
    }));
  },
  clientData(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'lobby') {
      this.members = m.members; this.blind = !!m.blind; this.code = m.code; this.inGame = false;
      if (App.screen === 'lobby' || m.reset || App.screen === 'joining') Lobby();
    } else if (m.t === 'start') {
      this.members = m.members; this.inGame = true;
      startOnline(m.st, m.ids.indexOf(this.myId));
    } else if (m.t === 'st' || m.t === 'err') {
      if (m.t === 'err') toast(m.msg);
      if (!App.g || !App.g.online) return;
      const prev = App.g.st.log.length;
      App.g.st = m.st; App.g.pending = false;
      const last = m.st.log[m.st.log.length - 1];
      if (m.st.log.length > prev && last && last.t === 'pick') { App.g.lastPlaced = { mi: last.m, slot: last.slot }; if (last.m !== App.g.me) Sfx.place(); }
      draftUpdate();
    } else if (m.t === 'full') { toast('That room is full'); this.leave(); Home(); }
    else if (m.t === 'busy') { toast('That room is mid-draft. Try again after.'); this.leave(); Home(); }
  },
  send(msg) { if (this.host && this.host.open) { try { this.host.send(msg); } catch (_) {} } },
  leave(silent) {
    // reset first, so the close events fired by destroy() don't look like "the host left"
    const p = this.peer;
    this.reset();
    if (p) { try { p.destroy(); } catch (_) {} }
  },
  reset() { Object.assign(this, { peer: null, isHost: false, code: null, myId: null, conns: new Map(), host: null, members: [], blind: false, inGame: false }); },
  link() { return location.origin + location.pathname + '?room=' + this.code; },
};
const pub = (m) => ({ id: m.id, name: m.name, host: !!m.host });
const cleanName = (n) => (String(n || '').trim().slice(0, 14) || 'Player');

function netErr(err) { const e = new Error(netErrText(err)); e.transient = ['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected', 'unavailable-id'].includes(err && err.type); return e; }
function netErrText(err) {
  const t = err && err.type;
  if (t === 'network' || t === 'server-error' || t === 'socket-error') return 'Can\'t reach the game server. Check your internet.';
  if (t === 'browser-incompatible') return 'This browser doesn\'t support online play.';
  return 'Connection problem: ' + (t || (err && err.message) || 'unknown');
}
async function withRetry(fn) {
  const waits = [800, 1600, 3200];
  for (let k = 0; ; k++) {
    try { return await fn(); } catch (e) {
      if (!e.transient || k >= waits.length) throw e;
      const s = $('#netStatus'); if (s) s.textContent = `Connecting… (retry ${k + 1})`;
      await new Promise((r) => setTimeout(r, waits[k]));
    }
  }
}

// ================= SCREENS =================
function OnlineScreen() {
  const el = go(`
    <div class="topbar"><button class="icon-btn" data-act="home">${ICON.back}</button><h2 class="display">Play Friends</h2></div>
    <p class="mute" style="margin:0">Draft live against up to 3 friends on their own phones. Everyone picks from the same spin. Steal the player they need.</p>
    <div class="section-title">Your name</div>
    <input class="field" id="nm" maxlength="14" placeholder="Manager name" value="${esc(Store.data.name)}">
    <div class="section-title">Host</div>
    <button class="btn primary" id="host">Create a room</button>
    <div class="section-title">Join</div>
    <div class="row"><input class="field grow" id="code" maxlength="5" placeholder="ROOM CODE" style="text-transform:uppercase;letter-spacing:.2em;font-weight:800" value="${esc(App.pendingRoom || '')}"><button class="btn small" id="join" style="padding:14px 18px">Join</button></div>
    <p class="mute center" id="netStatus" style="min-height:20px"></p>`);
  App.screen = 'online';
  const nm = $('#nm', el);
  nm.addEventListener('input', () => { Store.data.name = nm.value.slice(0, 14); Store.save(); });
  const card = () => ({ name: cleanName(nm.value || 'Player') });
  const status = (t) => { $('#netStatus', el).textContent = t; };
  const busy = (on) => { $('#host', el).disabled = on; $('#join', el).disabled = on; };
  $('#host', el).addEventListener('click', async () => {
    busy(true); status('Opening a room…');
    try { await Net.hostRoom(card()); Lobby(); } catch (e) { status(e.message); busy(false); }
  });
  const join = async () => {
    busy(true); status('Joining…'); App.screen = 'joining';
    try { await Net.joinRoom($('#code', el).value, card()); status('Connected. Waiting for the lobby…'); } catch (e) { App.screen = 'online'; status(e.message); busy(false); }
  };
  $('#join', el).addEventListener('click', join);
  $('#code', el).addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
  if (App.pendingRoom && Store.data.name) { App.pendingRoom = null; join(); }
  App.pendingRoom = null;
}

function Lobby() {
  App.g = null;
  const el = go(`
    <div class="topbar"><button class="icon-btn" id="leave">${ICON.back}</button><h2 class="display">Room</h2></div>
    <div class="center mute" style="font-weight:700">ROOM CODE</div>
    <div class="code">${esc(Net.code || '')}</div>
    <div class="two" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><button class="btn small" id="copy" style="width:100%">Copy invite link</button><button class="btn small" id="shr" style="width:100%">Share</button></div>
    <div class="section-title">Managers (${Net.members.length}/${MAX_ROOM})</div>
    <div class="lobby-list">${Net.members.map((m, i) => `<div class="mgr-card"><span class="dot" style="background:${MGR_COLORS[i]}"></span><span class="nm">${esc(m.name)}${m.id === Net.myId ? ' (you)' : ''}</span>${m.host ? '<span class="pill">HOST</span>' : ''}</div>`).join('')}</div>
    ${Net.isHost ? `<div class="section-title">Rules</div><button class="toggle ${Net.blind ? 'on' : ''}" id="tgBlind"><div class="grow"><h4>Blind draft</h4><p>Hide all ratings for everyone.</p></div><div class="sw"></div></button>` : `<p class="mute">${Net.blind ? 'Blind draft: ratings hidden.' : 'Classic draft: ratings shown.'}</p>`}
    <div class="spacer"></div>
    ${Net.isHost ? `<button class="btn primary" id="start" ${Net.members.length < 2 ? 'disabled' : ''}>${Net.members.length < 2 ? 'Waiting for friends…' : 'Start draft'}</button>` : '<div class="mute center" style="padding:14px">Waiting for the host to start…</div>'}`);
  App.screen = 'lobby';
  $('#leave', el).addEventListener('click', () => { Net.leave(); Home(); });
  $('#copy', el).addEventListener('click', async () => { try { await navigator.clipboard.writeText(Net.link()); toast('Invite link copied'); } catch (_) { toast(Net.link()); } });
  $('#shr', el).addEventListener('click', async () => {
    if (navigator.share) { try { await navigator.share({ title: 'CLUTCH', text: `Join my CLUTCH draft. Room ${Net.code}`, url: Net.link() }); } catch (_) {} } else { try { await navigator.clipboard.writeText(Net.link()); toast('Invite link copied'); } catch (_) {} }
  });
  const tb = $('#tgBlind', el);
  if (tb) tb.addEventListener('click', () => { Net.blind = !Net.blind; Net.broadcastLobby(); });
  const sb = $('#start', el);
  if (sb) sb.addEventListener('click', () => Net.startGame());
}

// startOnline() lives in app.js
