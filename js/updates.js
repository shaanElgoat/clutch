'use strict';
// WHAT'S NEW: every time the game changes, add an entry to the TOP of this list (highest id first).
// Players see the new ones once, the next time they open the game, and can scroll back through
// them from the Me tab. Keep it SHORT: a 2-4 word title and 1-3 lines of under 10 words each.
const UPDATES = [
  { id: 11, date: '2026-11-18', icon: 'bolt', title: 'Spin Race', items: [
    'New way to play friends: everyone sees the same spin.',
    'First tap gets the player. Be quick!',
    'Then your teams play it out live. 2 to 8 players.',
  ] },
  { id: 9, date: '2026-11-16', icon: 'refresh', title: 'The Great Reset', items: [
    'Everyone starts fresh at midnight.',
    'Better team now = better starting packs.',
    'You keep 5% of what you own as coins.',
  ] },
  { id: 7, date: '2026-11-13', icon: 'users', title: 'Transfer Market', items: [
    'Buy and sell cards with real players.',
    'Pick any price. List for 1, 2 or 5 hours.',
    'Needs a free account.',
  ] },
  { id: 6, date: '2026-11-13', icon: 'refresh', title: 'Fairer spins', items: [
    'Every team has the same chance to come up.',
  ] },
  { id: 5, date: '2026-11-11', icon: 'user', title: 'Accounts', items: [
    'Make a free account to save your progress.',
    'Play on any phone.',
  ] },
  { id: 4, date: '2026-11-09', icon: 'dice', title: 'Trade-In', items: [
    'Swap 5 cards for a mystery pack.',
    'Win big, stay even, or drop a pack.',
  ] },
  { id: 3, date: '2026-11-09', icon: 'star', title: 'New ratings', items: [
    'Ratings updated from this season.',
    'Traded players are on their new teams.',
  ] },
  { id: 2, date: '2026-11-05', icon: 'shield', title: 'Rivals changes', items: [
    'Divisions now last the whole month.',
    'Rewards still come every week.',
  ] },
  { id: 1, date: '2026-11-04', icon: 'sparkle', title: 'Connections', items: [
    'New daily puzzle: find 4 groups of players.',
    'Sell spare cards in My Club.',
  ] },
];
const latestUpdate = () => (UPDATES[0] ? UPDATES[0].id : 0);
const fmtUpdDate = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).toLocaleString('en-US', { month: 'short', day: 'numeric' }); };
const updCard = (u, fresh) => `<div class="upd ${fresh ? 'fresh' : ''}"><div class="upd-head"><div class="mc-ic ${fresh ? 'blue' : 'violet'}">${ico(u.icon || 'sparkle', 18)}</div><div class="grow"><b>${esc(u.title)}</b><small>${fmtUpdDate(u.date)}</small></div>${fresh ? '<span class="upd-new">NEW</span>' : ''}</div>
  <ul>${u.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`;

// on open: show what changed since this player last looked (brand-new players skip the history)
function checkUpdates() {
  const d = Store.data, last = d.seenUpdate || 0, top = latestUpdate();
  if (!last && !d.toured && !(d.stats && d.stats.played)) { d.seenUpdate = top; Store.save(); return; }
  if (last >= top) return;
  const fresh = UPDATES.filter((u) => u.id > last).slice(0, 2);
  setTimeout(() => {
    if (document.querySelector('.coach') || document.querySelector('.modal-bg')) { setTimeout(checkUpdates, 4000); return; }
    d.seenUpdate = top; Store.save();
    modal(`<div class="center"><div class="intro-ic" style="margin:0 auto 8px;background:linear-gradient(135deg,#5b8cff,#2f5ef0)">${ico('sparkle', 26)}</div><h2 class="d" style="margin:0 0 10px">What's new</h2></div>
      <div class="upd-list">${fresh.map((u) => updCard(u, true)).join('')}</div>
      <button class="btn primary big" data-close style="width:100%;margin-top:12px">Got it</button>`, null, 'sheet');
    Sfx.select();
  }, 1600);
}
// the full history (Me tab)
function UpdatesScreen() {
  App.g = null;
  const el = go(`<div class="topbar"><button class="icon-btn" id="back">${ico('back', 20)}</button><h2 class="d grow">What's new</h2></div>
    <div class="upd-list">${UPDATES.map((u) => updCard(u, false)).join('')}</div>`);
  $('#back', el).addEventListener('click', () => goTab('me'));
  return el;
}
