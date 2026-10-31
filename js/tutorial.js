'use strict';
// Rookie Camp: a guided tour for first-time players (spotlights the real buttons, tab by tab), plus
// one-time tips the first time someone opens each kind of screen. Both can be replayed from the Me tab.

// ---------- the spotlight ----------
// steps: [{ go?: () => void, sel?: css selector, title, text, cta? }]
function coach(steps, onDone) {
  let i = 0, done = false;
  const ov = document.createElement('div');
  ov.className = 'coach';
  ov.innerHTML = '<div class="co-hole"></div><div class="co-bubble"></div>';
  document.body.appendChild(ov);
  const hole = ov.querySelector('.co-hole'), bub = ov.querySelector('.co-bubble');
  const finish = (completed) => { if (done) return; done = true; window.removeEventListener('resize', place); ov.remove(); onDone && onDone(completed); };
  let target = null;
  function place() {
    const W = window.innerWidth, H = window.innerHeight;
    if (target && target.isConnected) {
      const r = target.getBoundingClientRect(), pad = 8;
      Object.assign(hole.style, { display: 'block', left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
      // the bubble goes wherever there's more room, above or below the spotlight
      const below = H - r.bottom > r.top;
      bub.style.left = Math.max(12, Math.min(W - bub.offsetWidth - 12, r.left + r.width / 2 - bub.offsetWidth / 2)) + 'px';
      bub.style.top = (below ? Math.min(H - bub.offsetHeight - 12, r.bottom + 18) : Math.max(12, r.top - bub.offsetHeight - 18)) + 'px';
      bub.dataset.arrow = below ? 'up' : 'down';
    } else {
      hole.style.display = 'none';
      bub.style.left = Math.max(12, W / 2 - bub.offsetWidth / 2) + 'px';
      bub.style.top = Math.max(12, H / 2 - bub.offsetHeight / 2) + 'px';
      bub.dataset.arrow = '';
    }
  }
  function show() {
    const s = steps[i];
    if (s.go) s.go();
    later2(() => {
      target = s.sel ? document.querySelector(s.sel) : null;
      if (target) target.scrollIntoView({ block: 'center', behavior: 'instant' });
      ov.classList.toggle('dim', !target);
      bub.innerHTML = `<div class="co-step">${i + 1} / ${steps.length}</div><b>${s.title}</b><p>${s.text}</p>
        <div class="co-btns">${i > 0 ? '<button class="btn small" data-c="back">Back</button>' : '<button class="btn small co-skip" data-c="skip">Skip tour</button>'}<button class="btn primary small" data-c="next">${s.cta || (i === steps.length - 1 ? 'Done' : 'Next')}</button></div>`;
      bub.classList.remove('in'); void bub.offsetWidth; bub.classList.add('in');
      place();
      later2(place, 60);
    }, s.go ? 380 : 40);
  }
  // timers that survive screen changes (the app's own later() is cleared whenever a screen redraws)
  function later2(fn, ms) { setTimeout(() => { if (!done) fn(); }, ms); }
  bub.addEventListener('click', (e) => {
    const c = e.target.closest('[data-c]');
    if (!c) return;
    Sfx.tap();
    if (c.dataset.c === 'skip') return finish(false);
    if (c.dataset.c === 'back') { i = Math.max(0, i - 1); return show(); }
    if (i === steps.length - 1) return finish(true);
    i++; show();
  });
  window.addEventListener('resize', place);
  show();
}

// ---------- the tour ----------
const TOUR_COINS = 300;
function startTour() {
  const seg = (s) => () => { App.clubSeg = s; goTab('club'); };
  const steps = [
    { go: () => goTab('play'), title: 'Welcome to CLUTCH', text: 'An NFL draft game. You spin a team, draft a squad from its <b>2026 roster</b>, then watch your season play out live. This quick tour shows you everything.' , cta: "Let's go" },
    { sel: '.feature', title: 'Season: the main event', text: 'Spin the wheel, draft <b>12 players</b> (QB to head coach), then play 17 games and the playoffs, live. Go 17-0 and you probably win the Super Bowl.' },
    { sel: '.mini-stats', title: 'Your record', text: 'Seasons played, rings, Clutch Calls won and your best record. Every season you finish counts here.' },
    { sel: '.group [data-act="daily"]', title: 'Daily Draft', text: 'Same spins for everyone, <b>once a day</b>. Finish and see how you ranked against every other player.' },
    { sel: '.tabbar [data-tab="games"]', title: 'More games', text: 'Daily puzzles, head-to-head modes and arcade games live in the <b>Games</b> tab.' },
    { go: () => goTab('games'), sel: '.group', title: 'Daily puzzles', text: '<b>The Grid</b> (name a player who fits), <b>Who\'s That?</b> (guess the mystery player) and the <b>2-Minute Drill</b>. New ones every midnight, so keep your streak alive.' },
    { sel: '[data-tour="h2h"]', title: 'Head to head', text: '<b>Draft Duel</b>: out-draft a CPU GM, then a best-of-3. <b>Salary Cap</b>: build a team on a budget. <b>Gameday</b>: call every play yourself.' },
    { sel: '.tabbar [data-tab="club"]', title: 'Your Club', text: 'The <b>Club</b> tab is where you collect cards and build your own team.' },
    { go: seg('packs'), sel: '.packs', title: 'Packs', text: 'Packs are the <b>only way to get cards</b>. You earn coins from every game you play, plus free coins every day.' },
    { go: seg('club'), sel: '.club-hero', title: 'My Club + Rivals', text: 'Build a team from your cards, then climb <b>Rivals</b>: 10 divisions against the CPU. A new season starts every month, and you\'re paid for how high you finish.' },
    { sel: '.tabbar [data-tab="trophies"]', title: 'Trophies', text: 'Achievements and all your best records.' },
    { sel: '.tabbar [data-tab="me"]', title: 'Me', text: 'Your name, field themes you unlock as you level up, sound, and <b>replay this tour</b> any time.' },
    { go: () => goTab('play'), title: 'One more thing: Clutch Calls', text: 'Close games stop at <b>2:00 left</b> and you make the call: go for it, kick it, blitz… Your players\' ratings set the odds. That\'s where seasons are won.' },
    { title: "You're ready!", text: `Here's <b>${TOUR_COINS} coins</b> to get you started. Open a pack, or jump into your first Season.`, cta: 'Play my first Season' },
  ];
  coach(steps, (completed) => {
    const d = Store.data, first = !d.toured;
    d.toured = true;
    if (completed && !d.tourPaid) { d.tourPaid = true; d.coins += TOUR_COINS; toast(`+${TOUR_COINS} coins`); Sfx.achievement(); }
    Store.save();
    if (completed && first) SeasonSetup('quick'); else goTab('play');
  });
}

// ---------- one-time tips ----------
const TIPS = {
  draft: ['How drafting works', 'Each spin lands on an NFL team. <b>Tap a player</b> and he goes straight to his spot on the field. Players can only fill their own position (a few can slide over). The dice is your <b>1 re-spin</b> per game. <b>Wild</b> drops in a card from your binder instead.'],
  season: ['Watch your season', 'Every game plays live. Tap <b>1x</b> to speed up to 2x or 4x, or <b>Skip</b> straight to the end. Close games stop at 2:00 for your Clutch Call.'],
  clutch: ['Your Clutch Call', 'Pick a play. The bar is your chance of pulling it off: <b>green is good, red is risky</b>. The note under each play says what it gets you. Your players\' ratings set the odds.'],
  gameday: ['Calling plays', 'On offense, pick a play each snap. <b>Edge</b> means it beats the defense they like in this spot, <b>Tough</b> means it doesn\'t. Watch the scouting tip. On defense, pick a coverage.'],
  club: ['Building your Club', '<b>Tap any spot</b> to put in one of your cards, or hit <b>Auto-build</b>. Once all 12 spots are filled, play Rivals: wins move you up the divisions.'],
  grid: ['The Grid', 'Tap a square. Name a player who played for <b>that row\'s team</b> and fits <b>that column</b>. Each player only once. 9 guesses to fill the board.'],
  who: ["Who's That?", 'Guess any player. Each guess shows whether the team, era, position and rating match (<b>green</b>), are close (<b>yellow</b>), or point higher or lower. 8 guesses.'],
  hl: ["Who's Better?", 'Tap the player with the <b>bigger career number</b>. The stat changes every round: yards, sacks, rings, games… Beat the timer and keep your streak going.'],
  kick: ['Kick It', 'Tap once to lock your <b>aim</b>, tap again to lock your <b>power</b> (reach the line). Watch the wind. Every make moves you back 5 yards.'],
  lobby: ['Your room', 'Share the <b>code</b> or tap Invite. Up to 4 friends join from Play with friends, on any network. The host taps Start when everyone\'s in.'],
};
function tipOnce(key) {
  const d = Store.data;
  d.tips = d.tips || {};
  if (d.tips.all || d.tips[key] || !TIPS[key] || document.querySelector('.coach')) return;
  d.tips[key] = 1; Store.save();
  setTimeout(() => {
    if (document.querySelector('.coach')) return;
    const [t, txt] = TIPS[key];
    modal(`<div class="tip-head"><div class="intro-ic" style="background:var(--brand)">${ico('sparkle', 22)}</div><div><small class="mute" style="font-weight:800">Quick tip</small><h2 class="d" style="margin:0">${t}</h2></div></div>
      <p style="margin:12px 0 4px">${txt}</p><button class="btn primary" data-close style="margin-top:10px">Got it</button>`, null, 'sheet');
  }, 650);
}
