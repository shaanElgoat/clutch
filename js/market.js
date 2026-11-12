'use strict';
// TRANSFER MARKET: sell your cards to real players for coins, and buy theirs. Needs an account.
// Listings live in the Firebase database; its rules make sure only the seller can list or cancel,
// a card can only be bought once, nobody buys their own card, and expired listings can't be bought.
// A listed copy leaves your binder (escrow) and comes back if it's cancelled or expires unsold.
// Sellers are paid (minus a 5% market tax) the next time they open the app.
const MK_URL = 'https://clutch-98557-default-rtdb.firebaseio.com/market/l';
const MK_TAX = 0.05, MK_HOURS = 48, MK_MAX = 10;
// price limits by rating, so nobody can dump cards for 1 coin or list a 50 for a fortune
const mkBand = (r) => (r >= 98 ? [10000, 150000] : r >= 95 ? [4000, 60000] : r >= 90 ? [1000, 20000] : r >= 85 ? [300, 6000] : r >= 80 ? [100, 2500] : [50, 1000]);
const mkSuggest = (r) => { const [a, b] = mkBand(r); return Math.round(Math.sqrt(a * b) / 50) * 50; };
const mkLeft = (x) => { const ms = x - Date.now(); if (ms <= 0) return 'expired'; const h = Math.floor(ms / 36e5), m = Math.floor(ms / 6e4) % 60; return h ? `${h}h ${m}m` : `${m}m`; };
const mkPayout = (price) => Math.floor(price * (1 - MK_TAX));

const Market = {
  url: async (q) => { const t = await Account.token(); if (!t) throw new Error('auth'); return `${MK_URL}.json?auth=${t}${q || ''}`; },
  async get(q) {
    const r = await fetch(await Market.url(q));
    if (r.status === 401 || r.status === 403) { const e = new Error('denied'); e.denied = true; throw e; }
    if (!r.ok) throw new Error('net');
    return (await r.json()) || {};
  },
  async one(lid, opt) {
    const t = await Account.token(); if (!t) throw new Error('auth');
    const r = await fetch(`${MK_URL}/${lid}.json?auth=${t}`, opt);
    if (r.status === 401 || r.status === 403) { const e = new Error('denied'); e.denied = true; throw e; }
    if (!r.ok) throw new Error('net');
    return r.json();
  },
  all: () => Market.get('&orderBy="t"&limitToLast=300'),
  mine: () => Market.get(`&orderBy="s"&equalTo="${Account.user.uid}"`),
  // collect what's happened to my listings: pay out sales, take back expired cards
  async sync(quiet) {
    if (!Account.user) return [];
    const d = Store.data; d.mkPaid = d.mkPaid || {};
    let mine;
    try { mine = await Market.mine(); } catch (_) { return []; }
    const news = [];
    for (const [lid, l] of Object.entries(mine)) {
      if (l.b) {
        if (!d.mkPaid[lid]) {
          const got = mkPayout(l.price);
          d.coins += got; d.mkPaid[lid] = Date.now(); Store.save();
          news.push({ pid: l.pid, price: l.price, got, buyer: l.bn || 'a player' });
          Track.ev('mk_sold', `${TE.PLAYERS[l.pid] ? TE.PLAYERS[l.pid].name : '?'} for ${l.price}`);
        }
        try { await Market.one(lid, { method: 'PATCH', body: JSON.stringify({ p: true }) }); await Market.one(lid, { method: 'DELETE' }); } catch (_) {}
      } else if (Date.now() > l.x) {
        // expired unsold: the card comes home
        try { await Market.one(lid, { method: 'DELETE' }); d.coll[l.pid] = (d.coll[l.pid] || 0) + 1; Store.save(); news.push({ pid: l.pid, back: true }); } catch (_) {}
      }
    }
    // forget old paid markers
    Object.keys(d.mkPaid).forEach((k) => { if (Date.now() - d.mkPaid[k] > 14 * 864e5) delete d.mkPaid[k]; });
    Store.save();
    if (!quiet && news.length) mkNews(news);
    return news;
  },
};
function mkNews(news) {
  const sold = news.filter((n) => !n.back), back = news.filter((n) => n.back);
  const total = sold.reduce((a, n) => a + n.got, 0);
  modal(`<div class="center"><div class="intro-ic" style="margin:0 auto 10px;background:linear-gradient(135deg,#34d399,#10b981)">${ico('coin', 26)}</div>
    <h2 class="d">${sold.length ? `You sold ${sold.length} card${sold.length > 1 ? 's' : ''}!` : 'Market update'}</h2></div>
    ${sold.map((n) => `<div class="mk-news"><b>${esc(TE.PLAYERS[n.pid].name)}</b> sold to ${esc(n.buyer)} for ${n.price.toLocaleString()} <span class="mute">(+${n.got.toLocaleString()} after tax)</span></div>`).join('')}
    ${back.map((n) => `<div class="mk-news"><b>${esc(TE.PLAYERS[n.pid].name)}</b> didn't sell in ${MK_HOURS}h and is back in your binder.</div>`).join('')}
    ${total ? `<div class="hero-card center" style="margin:10px 0"><b style="font-size:20px">${ico('coin', 18)} +${total.toLocaleString()} coins</b></div>` : ''}
    <button class="btn primary big" data-close style="width:100%">Nice</button>`, null, 'sheet');
  if (total) { Sfx.coin(); confetti(1000); }
}
// check for sales whenever the app opens
setTimeout(() => { if (typeof Account !== 'undefined' && Account.user) Market.sync(); }, 5000);

function TransferMarket(tab, f) {
  requireAccount('Transfer Market', () => mkScreen(tab, f));
}
async function mkScreen(tab, f) {
  App.g = null;
  tab = tab || 'buy';
  f = Object.assign({ pos: 'All', sort: 'new', q: '' }, f || {});
  const el = go(`
    <div class="topbar"><button class="icon-btn" id="back">${ico('back', 20)}</button><h2 class="d grow">Transfer Market</h2>${coinsChip()}</div>
    <div class="seg mk-tabs">${[['buy', 'Buy'], ['sell', 'Sell'], ['mine', 'My listings']].map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-t="${k}">${l}</button>`).join('')}</div>
    <div id="mkb"><p class="mute center" style="font-weight:700;margin-top:30px">Loading the market…</p></div>`);
  $('#back', el).addEventListener('click', () => { App.clubSeg = 'packs'; goTab('club'); });
  $$('[data-t]', el).forEach((b) => b.addEventListener('click', () => mkScreen(b.dataset.t, f)));
  const box = $('#mkb', el);
  try {
    await Market.sync();
    if (!el.isConnected) return;
    if (tab === 'buy') await mkBuy(box, f);
    else if (tab === 'sell') await mkSell(box, f);
    else await mkMine(box);
  } catch (e) {
    if (!el.isConnected) return;
    box.innerHTML = `<p class="mute center" style="font-weight:700;margin-top:30px">${e.denied ? "The market isn't switched on yet." : "Couldn't reach the market. Check your internet."}</p><button class="btn" id="retry" style="display:block;margin:10px auto">Try again</button>`;
    $('#retry', box).addEventListener('click', () => mkScreen(tab, f));
  }
}
const mkRow = (l, right) => {
  const p = TE.PLAYERS[l.pid];
  return `<div class="sell-row mk-row" data-lid="${esc(l.id || '')}"><span class="sr-ovr ${tierOf(p.r)}">${p.r}</span><div class="grow"><b>${esc(p.name)}</b><small>${p.pos} · ${esc(TE.DATA.TEAMS[p.team].short)} · ${TE.eraTag(p.era)}${l.sn ? ` · by ${esc(l.sn)}` : ''}${l.x ? ` · ${mkLeft(l.x)}` : ''}</small></div>${right}</div>`;
};
async function mkBuy(box, f) {
  const all = await Market.all(), now = Date.now(), me = Account.user.uid;
  let list = Object.entries(all).map(([id, l]) => ({ id, ...l })).filter((l) => !l.b && l.x > now && TE.PLAYERS[l.pid]);
  if (f.pos !== 'All') list = list.filter((l) => TE.PLAYERS[l.pid].pos === f.pos);
  if (f.q) list = list.filter((l) => TE.PLAYERS[l.pid].name.toLowerCase().includes(f.q.toLowerCase()));
  list.sort(f.sort === 'cheap' ? (a, b) => a.price - b.price : f.sort === 'best' ? (a, b) => TE.PLAYERS[b.pid].r - TE.PLAYERS[a.pid].r : (a, b) => b.t - a.t);
  box.innerHTML = `
    <input class="field" id="q" placeholder="Search players" value="${esc(f.q)}" style="width:100%;margin-bottom:8px">
    <div class="mk-chips">${['All', 'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'HC'].map((p) => `<button class="chip ${p === f.pos ? 'on' : ''}" data-p="${p}">${p}</button>`).join('')}</div>
    <div class="mk-chips">${[['new', 'Newest'], ['cheap', 'Cheapest'], ['best', 'Best rated']].map(([k, l]) => `<button class="chip ${k === f.sort ? 'on' : ''}" data-s="${k}">${l}</button>`).join('')}</div>
    <div class="sell-list">${list.length ? list.slice(0, 120).map((l) => mkRow(l, l.s === me ? '<span class="lmeta">Yours</span>' : `<button class="btn small primary" data-buy="${esc(l.id)}">${ico('coin', 14)} ${l.price.toLocaleString()}</button>`)).join('') : '<p class="mute center" style="font-weight:700;margin-top:20px">No cards for sale here yet. Be the first to list one!</p>'}</div>`;
  $$('[data-p]', box).forEach((b) => b.addEventListener('click', () => mkScreen('buy', Object.assign(f, { pos: b.dataset.p }))));
  $$('[data-s]', box).forEach((b) => b.addEventListener('click', () => mkScreen('buy', Object.assign(f, { sort: b.dataset.s }))));
  let t = null;
  $('#q', box).addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { mkScreen('buy', Object.assign(f, { q: e.target.value })); }, 450); });
  $$('[data-buy]', box).forEach((b) => b.addEventListener('click', () => {
    const l = list.find((x) => x.id === b.dataset.buy), p = TE.PLAYERS[l.pid];
    const can = Store.data.coins >= l.price;
    modal(`<div class="center">${pcard(l.pid, { big: true })}</div><h2 class="d center" style="margin-top:12px">Buy ${esc(p.name)}?</h2>
      <p class="center mute" style="font-weight:600">From ${esc(l.sn || 'a player')} for <b>${l.price.toLocaleString()} coins</b>.${can ? '' : `<br><b style="color:var(--red)">You need ${(l.price - Store.data.coins).toLocaleString()} more coins.</b>`}</p>
      <div class="actions two"><button class="btn" data-close>Cancel</button><button class="btn primary" id="ok" ${can ? '' : 'disabled'}>Buy it</button></div>`, (bg) => {
      $('#ok', bg).addEventListener('click', async () => {
        const ok = $('#ok', bg); ok.disabled = true; ok.textContent = 'Buying…';
        try {
          if (Store.data.coins < l.price) throw new Error('coins');
          await Market.one(l.id, { method: 'PATCH', body: JSON.stringify({ b: Account.user.uid, bn: (Store.data.name || 'A player').slice(0, 14), bt: { '.sv': 'timestamp' } }) });
          Store.data.coins -= l.price;
          collect([l.pid]);
          Store.data.coll[l.pid] = Math.max(1, Store.data.coll[l.pid] || 0);
          Store.save();
          Track.ev('mk_buy', `${p.name} for ${l.price}`);
          bg.remove(); Sfx.achievement(); confetti(1200); toast(`${p.name} is yours!`);
          mkScreen('buy', f);
        } catch (e) {
          bg.remove();
          toast(e.denied ? 'Too slow: someone else just bought it' : e.message === 'coins' ? 'Not enough coins' : "Couldn't buy. Check your internet.");
          mkScreen('buy', f);
        }
      });
    }, 'sheet');
  }));
}
async function mkSell(box) {
  const mine = await Market.mine(), active = Object.values(mine).filter((l) => !l.b && l.x > Date.now()).length;
  const c = clubData(), inXI = new Set(c.xi.filter((x) => x !== null));
  const cards = ownedIds().filter((id) => !inXI.has(id)).sort((a, b) => TE.PLAYERS[b].r - TE.PLAYERS[a].r);
  box.innerHTML = `<div class="mk-info">${ico('coin', 16)} <span>Pick a card and set a price. It's held while listed (${MK_HOURS}h), then comes back if nobody buys it. <b>5% market tax</b> on sales. ${active}/${MK_MAX} listings used.</span></div>
    <div class="sell-list">${cards.length ? cards.slice(0, 150).map((id) => mkRow({ pid: id }, `<button class="btn small" data-sell="${id}">Sell</button>`)).join('') : '<p class="mute center" style="font-weight:700">No spare cards to sell. Lineup cards are locked.</p>'}</div>`;
  $$('[data-sell]', box).forEach((b) => b.addEventListener('click', () => {
    if (active >= MK_MAX) { toast(`You can have ${MK_MAX} listings at once`); return; }
    const pid = +b.dataset.sell, p = TE.PLAYERS[pid], [lo, hi] = mkBand(p.r);
    modal(`<div class="center">${pcard(pid, { big: true, stars: cardLevel(pid) })}</div><h2 class="d center" style="margin-top:12px">Sell ${esc(p.name)}</h2>
      <label class="mk-price">Price (${lo.toLocaleString()}–${hi.toLocaleString()})<input class="field" id="pr" type="number" inputmode="numeric" min="${lo}" max="${hi}" step="50" value="${mkSuggest(p.r)}"></label>
      <p class="center mute" id="net" style="font-weight:700;margin:6px 0"></p>
      <div class="actions two"><button class="btn" data-close>Cancel</button><button class="btn primary" id="ok">List it</button></div>`, (bg) => {
      const pr = $('#pr', bg), net = $('#net', bg);
      const upd = () => { const v = Math.round(+pr.value || 0); net.textContent = v >= lo && v <= hi ? `You get ${mkPayout(v).toLocaleString()} coins if it sells` : `Price must be between ${lo.toLocaleString()} and ${hi.toLocaleString()}`; };
      pr.addEventListener('input', upd); upd();
      $('#ok', bg).addEventListener('click', async () => {
        const v = Math.round(+pr.value || 0);
        if (v < lo || v > hi) { Sfx.bad(); return; }
        const ok = $('#ok', bg); ok.disabled = true; ok.textContent = 'Listing…';
        const lid = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        try {
          await Market.one(lid, { method: 'PUT', body: JSON.stringify({ s: Account.user.uid, sn: (Store.data.name || 'A player').slice(0, 14), pid, price: v, t: { '.sv': 'timestamp' } }) });
          // the expiry is set from the server's own clock
          const got = await Market.one(lid);
          await Market.one(lid, { method: 'PATCH', body: JSON.stringify({ x: got.t + MK_HOURS * 36e5 }) });
          // one copy goes into escrow
          const d = Store.data; d.coll[pid] = (d.coll[pid] || 1) - 1; if (d.coll[pid] <= 0) delete d.coll[pid];
          Store.save();
          Track.ev('mk_list', `${p.name} for ${v}`);
          bg.remove(); Sfx.coin(); toast(`${p.name} listed for ${v.toLocaleString()}`);
          mkScreen('mine');
        } catch (e) {
          try { await Market.one(lid, { method: 'DELETE' }); } catch (_) {}
          bg.remove(); toast("Couldn't list it. Try again.");
        }
      });
    }, 'sheet');
  }));
}
async function mkMine(box) {
  const mine = await Market.mine(), now = Date.now();
  const list = Object.entries(mine).map(([id, l]) => ({ id, ...l })).filter((l) => !l.b && TE.PLAYERS[l.pid]).sort((a, b) => b.t - a.t);
  box.innerHTML = list.length ? `<div class="sell-list">${list.map((l) => mkRow(Object.assign({}, l, { sn: '' }), `<div class="mk-mine"><b>${ico('coin', 13)} ${l.price.toLocaleString()}</b>${l.x > now ? `<button class="btn small" data-cancel="${esc(l.id)}">Cancel</button>` : '<small>expired</small>'}</div>`)).join('')}</div>
    <p class="mute center" style="font-weight:600;font-size:12.5px;margin-top:12px">Sold cards pay out automatically (minus 5% tax). Unsold cards come back after ${MK_HOURS} hours.</p>`
    : `<p class="mute center" style="font-weight:700;margin-top:24px">You have no cards listed.</p><button class="btn primary" id="go" style="display:block;margin:10px auto">Sell a card</button>`;
  const g = $('#go', box); if (g) g.addEventListener('click', () => mkScreen('sell'));
  $$('[data-cancel]', box).forEach((b) => b.addEventListener('click', async () => {
    const l = list.find((x) => x.id === b.dataset.cancel);
    b.disabled = true;
    try {
      await Market.one(l.id, { method: 'DELETE' });
      Store.data.coll[l.pid] = (Store.data.coll[l.pid] || 0) + 1; Store.save();
      toast(`${TE.PLAYERS[l.pid].name} is back in your binder`);
    } catch (e) { toast(e.denied ? 'Too late: it just sold!' : "Couldn't cancel. Try again."); await Market.sync(); }
    mkScreen('mine');
  }));
}
