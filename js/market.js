'use strict';
// TRANSFER MARKET: sell your cards to real players for coins, and buy theirs. Needs an account.
// Listings live in the Firebase database; its rules make sure only the seller can list or cancel,
// a card can only be bought once, nobody buys their own card, and expired listings can't be bought.
// A listed copy leaves your binder (escrow) and comes back if it's cancelled or its time runs out.
// Sellers are paid (minus a 5% market tax) the next time they open the app.
const MK_URL = 'https://clutch-98557-default-rtdb.firebaseio.com/market/l';
// sellers pick any price and how long it's up: 1, 2 or 5 hours
const MK_TAX = 0.05, MK_MAX = 10, MK_DURS = [1, 2, 5], MK_MAXP = 1000000000;
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
    ${back.map((n) => `<div class="mk-news"><b>${esc(TE.PLAYERS[n.pid].name)}</b> didn't sell in time and is back in your binder.</div>`).join('')}
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
// one market tile: the real card, then its price tag and a small info line
const mkTile = (l, o) => `<button class="mk-tile ${o.cls || ''}" ${o.attr || ''}>${pcard(l.pid, { stars: o.stars })}
  <span class="mk-tag ${o.tagCls || ''}">${o.tag}</span>${o.sub ? `<small class="mk-sub">${o.sub}</small>` : ''}</button>`;
const MK_POS = ['All', 'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'HC'];
async function mkBuy(box, f) {
  const all = await Market.all(), now = Date.now(), me = Account.user.uid;
  const live = Object.entries(all).map(([id, l]) => ({ id, ...l })).filter((l) => !l.b && l.x > now && TE.PLAYERS[l.pid]);
  box.innerHTML = `
    <div class="mk-filters">
      <input class="field" id="q" placeholder="Search players" value="${esc(f.q)}">
      <select class="field" id="pos">${MK_POS.map((p) => `<option ${p === f.pos ? 'selected' : ''}>${p}</option>`).join('')}</select>
      <select class="field" id="sort">${[['new', 'Newest'], ['cheap', 'Cheapest'], ['best', 'Best']].map(([k, l]) => `<option value="${k}" ${k === f.sort ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div class="mk-count" id="cnt"></div>
    <div class="mk-grid" id="grid"></div>`;
  // filtering happens on this phone, no reload needed
  const render = () => {
    let list = live.slice();
    if (f.pos !== 'All') list = list.filter((l) => TE.PLAYERS[l.pid].pos === f.pos);
    if (f.q) list = list.filter((l) => TE.PLAYERS[l.pid].name.toLowerCase().includes(f.q.toLowerCase()));
    list.sort(f.sort === 'cheap' ? (a, b) => a.price - b.price : f.sort === 'best' ? (a, b) => TE.PLAYERS[b.pid].r - TE.PLAYERS[a.pid].r : (a, b) => b.t - a.t);
    $('#cnt', box).textContent = `${list.length} card${list.length === 1 ? '' : 's'} for sale`;
    $('#grid', box).innerHTML = list.length ? list.slice(0, 150).map((l) => mkTile(l, {
      attr: `data-buy="${esc(l.id)}"`, cls: l.s === me ? 'mine' : '',
      tag: `${ico('coin', 13)} ${l.price.toLocaleString()}`, tagCls: l.s === me ? 'own' : '',
      sub: l.s === me ? 'Your listing' : `${esc(l.sn || 'Player')} · ${mkLeft(l.x)}`,
    })).join('') : '<p class="mute center mk-empty">Nothing for sale here yet. Be the first to list a card!</p>';
    $$('[data-buy]', box).forEach((b) => b.addEventListener('click', () => buy(live.find((x) => x.id === b.dataset.buy))));
  };
  let t = null;
  $('#q', box).addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value; render(); }, 200); });
  $('#pos', box).addEventListener('change', (e) => { f.pos = e.target.value; render(); });
  $('#sort', box).addEventListener('change', (e) => { f.sort = e.target.value; render(); });
  const buy = (l) => {
    if (!l) return;
    const p = TE.PLAYERS[l.pid];
    if (l.s === me) { toast('That one is yours. Cancel it in My listings.'); return; }
    const can = Store.data.coins >= l.price;
    modal(`<div class="mk-sheet-card">${pcard(l.pid, { big: true })}</div><h2 class="d center" style="margin-top:12px">Buy ${esc(p.name)}?</h2>
      <p class="center mute" style="font-weight:600;margin:4px 0 0">Sold by ${esc(l.sn || 'a player')} · ${mkLeft(l.x)} left</p>
      <div class="mk-price-big">${ico('coin', 20)} ${l.price.toLocaleString()}</div>
      ${can ? '' : `<p class="center" style="color:var(--red);font-weight:700;margin:0">You need ${(l.price - Store.data.coins).toLocaleString()} more coins.</p>`}
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
  };
  render();
}
// a starting price to edit (players can set anything)
const mkSuggest = (r) => (r >= 97 ? 25000 : r >= 95 ? 15000 : r >= 90 ? 6000 : r >= 85 ? 2000 : r >= 80 ? 800 : 250);
async function mkSell(box) {
  const mine = await Market.mine(), active = Object.values(mine).filter((l) => !l.b && l.x > Date.now()).length;
  const c = clubData(), inXI = new Set(c.xi.filter((x) => x !== null));
  const cards = ownedIds().filter((id) => !inXI.has(id)).sort((a, b) => TE.PLAYERS[b].r - TE.PLAYERS[a].r);
  box.innerHTML = `<div class="mk-info">${ico('coin', 16)}<span>Tap a card to sell it. You pick the price and how long it's up (1, 2 or 5 hours). <b>5% market tax</b> on sales. <b>${active}/${MK_MAX}</b> listings used.</span></div>
    <div class="mk-grid">${cards.length ? cards.slice(0, 150).map((id) => mkTile({ pid: id }, { attr: `data-sell="${id}"`, stars: cardLevel(id), tag: 'Sell', tagCls: 'sell' })).join('') : '<p class="mute center mk-empty">No spare cards to sell. Lineup cards are locked.</p>'}</div>`;
  $$('[data-sell]', box).forEach((b) => b.addEventListener('click', () => {
    if (active >= MK_MAX) { toast(`You can have ${MK_MAX} listings at once`); return; }
    const pid = +b.dataset.sell, p = TE.PLAYERS[pid];
    let hrs = 2;
    modal(`<div class="mk-sheet-card">${pcard(pid, { big: true, stars: cardLevel(pid) })}</div><h2 class="d center" style="margin-top:12px">Sell ${esc(p.name)}</h2>
      <label class="mk-price">Your price<input class="field" id="pr" type="number" inputmode="numeric" min="1" step="1" value="${mkSuggest(p.r)}"></label>
      <div class="mk-lbl">How long</div>
      <div class="seg mk-dur">${MK_DURS.map((h) => `<button class="${h === hrs ? 'on' : ''}" data-h="${h}">${h} hour${h > 1 ? 's' : ''}</button>`).join('')}</div>
      <p class="center mute" id="net" style="font-weight:700;margin:10px 0 4px"></p>
      <div class="actions two"><button class="btn" data-close>Cancel</button><button class="btn primary" id="ok">List it</button></div>`, (bg) => {
      const pr = $('#pr', bg), net = $('#net', bg);
      const val = () => Math.floor(+pr.value || 0);
      const upd = () => { const v = val(); net.textContent = v >= 1 && v <= MK_MAXP ? `You get ${mkPayout(v).toLocaleString()} coins if it sells` : 'Enter a price'; };
      pr.addEventListener('input', upd); upd();
      $$('[data-h]', bg).forEach((h) => h.addEventListener('click', () => { hrs = +h.dataset.h; $$('[data-h]', bg).forEach((x) => x.classList.toggle('on', x === h)); Sfx.tap(); }));
      $('#ok', bg).addEventListener('click', async () => {
        const v = val();
        if (v < 1 || v > MK_MAXP) { Sfx.bad(); pr.focus(); return; }
        const ok = $('#ok', bg); ok.disabled = true; ok.textContent = 'Listing…';
        const lid = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        try {
          await Market.one(lid, { method: 'PUT', body: JSON.stringify({ s: Account.user.uid, sn: (Store.data.name || 'A player').slice(0, 14), pid, price: v, t: { '.sv': 'timestamp' } }) });
          // the end time comes from the server's own clock
          const got = await Market.one(lid);
          await Market.one(lid, { method: 'PATCH', body: JSON.stringify({ x: got.t + hrs * 36e5 }) });
          // one copy goes into escrow
          const d = Store.data; d.coll[pid] = (d.coll[pid] || 1) - 1; if (d.coll[pid] <= 0) delete d.coll[pid];
          Store.save();
          Track.ev('mk_list', `${p.name} for ${v} (${hrs}h)`);
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
  box.innerHTML = list.length ? `<div class="mk-grid">${list.map((l) => mkTile(l, { tag: `${ico('coin', 13)} ${l.price.toLocaleString()}`, sub: l.x > now ? `${mkLeft(l.x)} left · <a data-cancel="${esc(l.id)}">Cancel</a>` : 'Ended, returning…' })).join('')}</div>
    <p class="mute center" style="font-weight:600;font-size:12.5px;margin-top:14px">Sold cards pay out automatically (minus 5% tax). Unsold cards come back when their time runs out.</p>`
    : `<p class="mute center mk-empty">You have no cards listed.</p><button class="btn primary" id="go" style="display:block;margin:10px auto">Sell a card</button>`;
  const g = $('#go', box); if (g) g.addEventListener('click', () => mkScreen('sell'));
  $$('[data-cancel]', box).forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    const l = list.find((x) => x.id === b.dataset.cancel);
    try {
      await Market.one(l.id, { method: 'DELETE' });
      Store.data.coll[l.pid] = (Store.data.coll[l.pid] || 0) + 1; Store.save();
      toast(`${TE.PLAYERS[l.pid].name} is back in your binder`);
    } catch (err) { toast(err.denied ? 'Too late: it just sold!' : "Couldn't cancel. Try again."); await Market.sync(); }
    mkScreen('mine');
  }));
}
