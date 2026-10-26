'use strict';
// Daily Draft rankings: anonymous results in a Firebase Realtime Database, read and written over plain REST.
// No names and no accounts: each device just has a random id. Set BOARD_URL to switch it on.
const BOARD_URL = ''; // e.g. 'https://clutch-12345-default-rtdb.firebaseio.com'

const Board = {
  on: () => !!BOARD_URL,
  cache: {},
  // a random, anonymous id for this device (never tied to a name)
  id() {
    if (!Store.data.anonId) { Store.data.anonId = Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => (b % 36).toString(36)).join(''); Store.save(); }
    return Store.data.anonId;
  },
  entry: (r) => ({ s: Math.round(r.score), w: r.w, l: r.l, st: r.stage, o: Math.round(r.prof.ovr), t: { '.sv': 'timestamp' } }),
  async submit(day, entry) {
    if (!this.on()) return false;
    try {
      const res = await fetch(`${BOARD_URL}/daily/${day}/${this.id()}.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
      // already submitted counts as success (the rules only allow one result per device per day)
      if (res.ok || res.status === 401 || res.status === 403) { const d = Store.data.daily[day]; if (d) { d.sent = true; Store.save(); } delete this.cache[day]; return true; }
    } catch (_) {}
    return false;
  },
  async load(day) {
    const c = this.cache[day];
    if (c && Date.now() - c.at < 60000) return c.list;
    const res = await fetch(`${BOARD_URL}/daily/${day}.json`);
    if (!res.ok) throw new Error('board ' + res.status);
    const obj = (await res.json()) || {};
    const list = Object.keys(obj).map((k) => Object.assign({ me: k === this.id() }, obj[k])).filter((e) => typeof e.s === 'number');
    this.cache[day] = { at: Date.now(), list };
    return list;
  },
};

// "How everyone did today": your rank, a win histogram with your bar lit up, and a few headline numbers
async function renderBoard(box, day) {
  if (!box || !Board.on()) return;
  const mine = Store.data.daily[day];
  if (mine && !mine.sent && mine.w !== undefined) await Board.submit(day, { s: Math.round(mine.score), w: mine.w, l: mine.l, st: mine.st, o: mine.o, t: { '.sv': 'timestamp' } });
  box.innerHTML = `<div class="board"><div class="bd-head"><b>How everyone did today</b><small>Loading…</small></div></div>`;
  let list;
  try { list = await Board.load(day); } catch (_) { box.innerHTML = `<div class="board"><div class="bd-head"><b>How everyone did today</b><small>Couldn't load rankings. Check your connection.</small></div></div>`; return; }
  if (!box.isConnected) return;
  const n = list.length;
  if (!n) { box.innerHTML = `<div class="board"><div class="bd-head"><b>How everyone did today</b><small>You're the first one in today. Check back later.</small></div></div>`; return; }
  const me = list.find((e) => e.me) || (mine ? { s: Math.round(mine.score), w: mine.w } : null);
  const better = me ? list.filter((e) => e.s > me.s).length : 0;
  const rank = better + 1, top = Math.max(1, Math.ceil((rank / n) * 100));
  const hist = new Array(18).fill(0);
  list.forEach((e) => { hist[Math.max(0, Math.min(17, e.w | 0))]++; });
  const max = Math.max(...hist);
  const avgW = list.reduce((a, e) => a + e.w, 0) / n;
  const po = list.filter((e) => e.st >= 1).length, sb = list.filter((e) => e.st >= 5).length;
  box.innerHTML = `<div class="board">
    <div class="bd-head"><b>How everyone did today</b><small>${n.toLocaleString()} GM${n === 1 ? '' : 's'} played · anonymous</small></div>
    ${me ? `<div class="bd-rank"><div class="bd-big">#${rank.toLocaleString()}<span>of ${n.toLocaleString()}</span></div><div class="bd-top ${top <= 10 ? 'hot' : ''}">Top ${top}%</div></div>` : ''}
    <div class="bd-hist">${hist.map((c, w) => `<div class="bd-col ${me && me.w === w ? 'me' : ''}" title="${w} wins: ${c}"><i style="height:${c ? Math.max(6, (c / max) * 100) : 0}%"></i><small>${w % 3 === 0 || (me && me.w === w) ? w : ''}</small></div>`).join('')}</div>
    <div class="bd-axis">Regular-season wins${me ? ' · your bar is lit' : ''}</div>
    <div class="bd-stats"><div><b>${avgW.toFixed(1)}</b><small>Avg wins</small></div><div><b>${Math.round((po / n) * 100)}%</b><small>Made playoffs</small></div><div><b>${sb}</b><small>Won the ring</small></div></div>
  </div>`;
  if (me && mine) { mine.rank = rank; mine.of = n; Store.save(); }
}
