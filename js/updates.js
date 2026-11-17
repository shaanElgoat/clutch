'use strict';
// WHAT'S NEW: every time the game changes, add an entry to the TOP of this list (highest id first).
// Players see the new ones once, the next time they open the game, and can scroll back through
// them from the Me tab. Keep it short and simple: a title and a few plain-English bullet points.
const UPDATES = [
  {
    id: 8, date: '2026-11-16', icon: 'refresh', title: 'The Great Reset (tonight at midnight)',
    items: [
      'Everyone starts fresh: cards, coins, My Club, Rivals, levels and records all reset at midnight.',
      'You get starting packs based on the best team you can field right now. The best teams get 3 Icon packs!',
      "Tonight is your last chance to open packs and build your best team. Check the countdown on the Season tab.",
      'New: invite a friend and you BOTH get 2 free Pro packs (Season tab or Me tab).',
    ],
  },
  {
    id: 7, date: '2026-11-13', icon: 'users', title: 'Transfer Market is here',
    items: [
      'Buy and sell cards with real players. Find it on the Packs page or in My Club.',
      'Set any price you want, and choose to list for 1, 2 or 5 hours.',
      "If it doesn't sell, the card comes straight back to you.",
      'You need a free account to use it (Me tab, then Create account).',
    ],
  },
  {
    id: 6, date: '2026-11-13', icon: 'refresh', title: 'Fairer spins',
    items: [
      'Every team now has the same chance to come up on a spin.',
      'Opponents got a little tougher, so the ring is just as hard to win.',
    ],
  },
  {
    id: 5, date: '2026-11-11', icon: 'user', title: 'Accounts',
    items: [
      'Make a free account to back up your cards and coins.',
      'Sign in on any phone and pick up where you left off.',
      'Playing as a guest still works for everything except the Transfer Market.',
    ],
  },
  {
    id: 4, date: '2026-11-09', icon: 'dice', title: 'Trade-In',
    items: [
      'Swap 5 spare cards for a mystery pack (on the Packs page).',
      'You might drop a pack, stay the same, or hit the jackpot. The odds are shown before you spin.',
    ],
  },
  {
    id: 3, date: '2026-11-09', icon: 'star', title: 'Week 10 ratings update',
    items: [
      'Ratings updated from this season: breakout players went up, slumping players went down.',
      'Trade deadline moves are in, like Jessie Bates to the Jaguars and Jeffery Simmons to the Bears.',
      'Cards you own update automatically. Nothing gets lost.',
    ],
  },
  {
    id: 2, date: '2026-11-05', icon: 'shield', title: 'Rivals changes',
    items: [
      'Your division now lasts the whole month. Rewards still come every week.',
      'Each division up is a lot tougher, so a stronger club matters.',
      'Team OVR is now simply the average of the cards on your field.',
    ],
  },
  {
    id: 1, date: '2026-11-04', icon: 'sparkle', title: 'Connections and more',
    items: [
      'New daily puzzle: Connections. Find the 4 hidden groups of players.',
      'Sell spare cards in My Club.',
      'Duplicates of the same player now always merge and add a star.',
      'Play with friends now looks like a normal season, at 4x speed.',
    ],
  },
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
  const fresh = UPDATES.filter((u) => u.id > last).slice(0, 3);
  setTimeout(() => {
    if (document.querySelector('.coach') || document.querySelector('.modal-bg')) { setTimeout(checkUpdates, 4000); return; }
    d.seenUpdate = top; Store.save();
    modal(`<div class="center"><div class="intro-ic" style="margin:0 auto 8px;background:linear-gradient(135deg,#5b8cff,#2f5ef0)">${ico('sparkle', 26)}</div><h2 class="d" style="margin:0">What's new</h2>
      <p class="mute" style="font-weight:600;margin:4px 0 10px">Here's what changed since you last played.</p></div>
      <div class="upd-list">${fresh.map((u) => updCard(u, true)).join('')}</div>
      <button class="btn primary big" data-close style="width:100%;margin-top:10px">Let's play</button>`, null, 'sheet');
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
