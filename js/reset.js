'use strict';
// THE GREAT RESET (midnight, Nov 17 2026, each player's local time) and INVITE A FRIEND.
//
// Reset: everyone starts over (cards, coins, club, levels, records), but first we look at the best
// team each player could field from their cards and pay them packs for it: the better the team,
// the better the packs. Names, settings, accounts, used codes and today's puzzles are kept.
const GR_AT = new Date(2026, 10, 17, 0, 0, 0).getTime();
const GR_KEEP = ['name', 'sound', 'haptics', 'fastSpin', 'toured', 'tips', 'seenUpdate', 'aid', 'aFirst', 'anonId', 'noTrack', 'nudgeAt', 'redeemed', 'daily', 'puzzles', 'dv', 'seenHelp', 'refUsed', 'refClaimed', 'invCode', 'invFor', 'pendingRef', 'mkPaid'];
// the reward ladder (team OVR = average of the best 12 cards you could field, empty spots count as 60)
const GR_TIERS = [
  { min: 95, packs: ['icon', 'leg'] },
  { min: 92, packs: ['icon'] },
  { min: 90, packs: ['leg', 'leg'] },
  { min: 88, packs: ['leg', 'pro', 'pro'] },
  { min: 85, packs: ['leg', 'pro'] },
  { min: 80, packs: ['pro', 'pro', 'pro'] },
  { min: 0, packs: ['pro', 'pro'] },
];
const grReward = (ovr) => GR_TIERS.find((t) => ovr >= t.min).packs;
const grPackList = (packs) => {
  const n = {}; packs.forEach((p) => { n[p] = (n[p] || 0) + 1; });
  return Object.entries(n).map(([id, k]) => `${k} ${PACKS.find((p) => p.id === id).name} pack${k > 1 ? 's' : ''}`).join(' + ');
};
// the strongest lineup this save could put on the field (same picking as Auto-build, but read-only)
function grBestOvr(d) {
  const coll = d.coll || {}, mine = Object.keys(coll).map(Number).filter((id) => TE.PLAYERS[id]);
  if (!mine.length) return 0;
  const lvl = (pid) => {
    const p = TE.PLAYERS[pid];
    const pulls = TE.PLAYERS.filter((x) => x.name === p.name && x.pos === p.pos).reduce((a, x) => a + (coll[x.id] || 0), 0);
    return Math.max(0, Math.min(3, pulls - 1));
  };
  const order = ['QB', 'K', 'HC', 'OL', 'TE', 'RB', 'S', 'LB', 'DL', 'CB', 'WR'];
  const slots = TE.LINEUP.map((s, i) => i).sort((a, b) => order.indexOf(TE.LINEUP[a].pos) - order.indexOf(TE.LINEUP[b].pos));
  const used = new Set(), eff = [];
  slots.forEach((si) => {
    let bv = null, best = null;
    mine.forEach((pid) => {
      const p = TE.PLAYERS[pid], pen = TE.fitPenalty(p.pos, TE.LINEUP[si].pos);
      if (used.has(p.name) || pen === null) return;
      const v = p.r + lvl(pid) - pen;
      if (bv === null || v > bv) { bv = v; best = pid; }
    });
    if (best !== null) { used.add(TE.PLAYERS[best].name); eff.push(bv); } else eff.push(60);
  });
  return eff.reduce((a, b) => a + b, 0) / eff.length;
}
// runs inside Store.load(): returns true when it rewrote the save (Store then loads the fresh one)
function greatReset(d) {
  if (!d || d.gr1 || Date.now() < GR_AT) return false;
  const played = (d.stats && (d.stats.played || d.stats.packs || d.stats.gdPlayed)) || Object.keys(d.coll || {}).length;
  const fresh = {};
  GR_KEEP.forEach((k) => { if (d[k] !== undefined) fresh[k] = d[k]; });
  if (played) {
    const ovr = Math.round(grBestOvr(d) * 10) / 10, packs = grReward(ovr);
    fresh.obj = { d: {}, w: {}, f: {}, seen: {}, packs: packs.slice() };
    fresh.gr1 = { at: Date.now(), ovr, packs, show: true };
  } else fresh.gr1 = { at: Date.now(), packs: [] };
  try { localStorage.setItem(Store.key, JSON.stringify(fresh)); } catch (_) { return false; }
  return true;
}
// after the reset: tell the player what happened, once
function grNotice() {
  const g = Store.data.gr1;
  if (!g || !g.show) return;
  g.show = false; Store.save();
  Track.ev('great_reset', `OVR ${g.ovr} → ${grPackList(g.packs)}`);
  setTimeout(() => modal(`<div class="center"><div class="intro-ic" style="margin:0 auto 10px;background:linear-gradient(135deg,#ff3f7d,#7a5cff)">${ico('refresh', 26)}</div>
    <h2 class="d">The Great Reset</h2>
    <p>Everyone starts fresh today: new binder, new coins, new Rivals climb.</p>
    <div class="gr-box"><small>Your best team was</small><b>OVR ${Math.round(g.ovr)}</b><small>so you start with</small><b class="gr-packs">${grPackList(g.packs)}</b></div></div>
    <button class="btn primary big" id="open" style="width:100%">${ico('pack', 18)} Open my packs</button>`, (bg) => {
    $('#open', bg).addEventListener('click', () => { bg.remove(); App.clubSeg = 'packs'; goTab('club'); });
  }, 'sheet'), 1200);
}
// before the reset: a countdown on the Season tab showing what you're on track for
function grBanner() {
  if (Date.now() >= GR_AT) return '';
  const ms = GR_AT - Date.now(), h = Math.floor(ms / 36e5), m = Math.floor(ms / 6e4) % 60;
  const ovr = grBestOvr(Store.data);
  return `<button class="gr-banner" data-act="grinfo"><div class="grow"><b>${ico('refresh', 15)} The Great Reset in ${h ? h + 'h ' : ''}${m}m</b>
    <small>Everything resets at midnight. Your best team right now: <b>OVR ${ovr ? Math.round(ovr) : '–'}</b>, so you'd start with <b>${grPackList(grReward(ovr))}</b>.</small></div>${ico('chevron', 16)}</button>`;
}
function grInfo() {
  modal(`<h2 class="d">The Great Reset</h2>
    <p>At <b>midnight tonight</b> everyone starts over: cards, coins, My Club, Rivals, levels and records all reset. A fresh, fair start for everyone.</p>
    <p>Before it happens, we look at the <b>best team you could put on the field</b> from your cards. The better it is, the better your starting packs:</p>
    <div class="gr-tiers">${GR_TIERS.map((t, i) => `<div><span>${i === GR_TIERS.length - 1 ? 'Under 80' : `OVR ${t.min}+`}</span><b>${grPackList(t.packs)}</b></div>`).join('')}</div>
    <p class="mute" style="font-weight:600;font-size:13px">Tip: tonight is your last chance to open packs and build your best team.</p>
    <button class="btn primary" data-close style="width:100%">Got it</button>`, null, 'sheet');
}

// ---------------- INVITE A FRIEND ----------------
// Each signed-in player gets a 6-letter code. A friend who joins with it gets 2 Pro packs, and so do you
// (up to 10 friends). The database makes sure a code belongs to one person and each account can only
// use one friend's code, ever.
const INV_URL = 'https://clutch-98557-default-rtdb.firebaseio.com';
const INV_PACKS = ['pro', 'pro'], INV_MAX = 10;
const Invite = {
  async req(path, opt) {
    const t = await Account.token(); if (!t) throw new Error('auth');
    const r = await fetch(`${INV_URL}/${path}.json?auth=${t}`, opt);
    if (r.status === 401 || r.status === 403) { const e = new Error('denied'); e.denied = true; throw e; }
    if (!r.ok) throw new Error('net');
    return r.json();
  },
  // my code (made once, then stored on the server so friends can find me)
  async code() {
    if (!Account.user) return null;
    const d = Store.data;
    if (d.invCode && d.invFor === Account.user.uid) return d.invCode;
    for (let k = 0; k < 5; k++) {
      const c = String(TE.hash('inv:' + Account.user.uid + ':' + k).toString(36)).toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(6, 'X').slice(0, 6);
      const owner = await Invite.req('invites/' + c);
      if (owner === Account.user.uid) { d.invCode = c; d.invFor = Account.user.uid; Store.save(); return c; }
      if (owner === null) {
        try { await Invite.req('invites/' + c, { method: 'PUT', body: JSON.stringify(Account.user.uid) }); d.invCode = c; d.invFor = Account.user.uid; Store.save(); return c; } catch (_) {}
      }
    }
    return null;
  },
  link: (c) => location.origin + location.pathname + '?ref=' + c,
  // a friend's code: both of you get packs
  async claim(raw) {
    const c = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length !== 6) return { ok: false, msg: 'Invite codes are 6 letters and numbers.' };
    if (Store.data.refUsed) return { ok: false, msg: "You've already used a friend's code." };
    if (c === Store.data.invCode) return { ok: false, msg: "That's your own code. Send it to a friend!" };
    try {
      const owner = await Invite.req('invites/' + c);
      if (!owner) return { ok: false, msg: "That code doesn't exist." };
      if (owner === Account.user.uid) return { ok: false, msg: "That's your own code. Send it to a friend!" };
      await Invite.req('', { method: 'PATCH', body: JSON.stringify({ [`refs/${c}/${Account.user.uid}`]: { '.sv': 'timestamp' }, [`users/${Account.user.uid}/ref`]: c }) });
    } catch (e) { return { ok: false, msg: e.denied ? "Couldn't use that code (this account may have used one already)." : "Couldn't connect. Try again." }; }
    const o = Obj.data(); INV_PACKS.forEach((p) => o.packs.push(p));
    Store.data.refUsed = c; delete Store.data.pendingRef; Store.save();
    Track.ev('invite_used', c);
    return { ok: true, msg: `+2 free Pro packs! Your friend gets 2 too.` };
  },
  // friends who joined with my code since I last looked
  async check(quiet) {
    if (!Account.user) return 0;
    const c = await Invite.code().catch(() => null); if (!c) return 0;
    let refs; try { refs = (await Invite.req('refs/' + c)) || {}; } catch (_) { return 0; }
    const d = Store.data; d.refClaimed = d.refClaimed || [];
    const fresh = Object.keys(refs).filter((u) => !d.refClaimed.includes(u)).slice(0, Math.max(0, INV_MAX - d.refClaimed.length));
    if (!fresh.length) return 0;
    const o = Obj.data();
    fresh.forEach((u) => { d.refClaimed.push(u); INV_PACKS.forEach((p) => o.packs.push(p)); });
    Store.save();
    Track.ev('invite_reward', fresh.length);
    if (!quiet) {
      modal(`<div class="center"><div class="intro-ic" style="margin:0 auto 10px;background:linear-gradient(135deg,#34d399,#10b981)">${ico('users', 26)}</div>
        <h2 class="d">${fresh.length > 1 ? fresh.length + ' friends' : 'A friend'} joined with your code!</h2>
        <p>You get <b>${fresh.length * 2} free Pro packs</b>. Keep inviting (up to ${INV_MAX} friends).</p></div>
        <button class="btn primary big" id="open" style="width:100%">${ico('pack', 18)} Open them</button>`, (bg) => { $('#open', bg).addEventListener('click', () => { bg.remove(); App.clubSeg = 'packs'; goTab('club'); }); }, 'sheet');
      Sfx.achievement(); confetti(1200);
    }
    return fresh.length;
  },
};
function InviteScreen() {
  App.g = null;
  const back = () => goTab('me');
  if (!Account.user) {
    const el = go(`<div class="topbar"><button class="icon-btn" id="back">${ico('back', 20)}</button><h2 class="d grow">Invite friends</h2></div>
      <div class="inv-hero"><div class="inv-big">${ico('users', 30)}</div><b>Invite a friend, you both get 2 Pro packs</b><small>Make a free account to get your own invite code, or to use a friend's code.</small></div>
      <div class="actions two"><button class="btn primary" id="su">Create account</button><button class="btn" id="si">Sign in</button></div>`);
    $('#back', el).addEventListener('click', back);
    const go2 = (m) => AuthScreen({ onDone: InviteScreen, onBack: InviteScreen, reason: 'Make an account to invite friends and get free packs.' }, m);
    $('#su', el).addEventListener('click', () => go2('up')); $('#si', el).addEventListener('click', () => go2('in'));
    return el;
  }
  const d = Store.data;
  const el = go(`<div class="topbar"><button class="icon-btn" id="back">${ico('back', 20)}</button><h2 class="d grow">Invite friends</h2></div>
    <div class="inv-hero"><div class="inv-big">${ico('users', 30)}</div><b>You both get 2 Pro packs</b><small>Send your code. When a friend joins with it, you each get 2 free Pro packs (up to ${INV_MAX} friends).</small>
      <div class="inv-code" id="code">······</div>
      <button class="btn primary big" id="share" style="width:100%" disabled>${ico('share', 18)} Send invite</button>
      <small class="inv-count">${(d.refClaimed || []).length}/${INV_MAX} friends joined</small></div>
    ${d.refUsed ? `<p class="mute center" style="font-weight:700">You joined with code <b>${esc(d.refUsed)}</b>.</p>` : `<div class="section-title">Got a friend's code?</div>
      <div class="code-box"><input class="field grow" id="fc" maxlength="8" placeholder="ABC123" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(d.pendingRef || '')}"><button class="btn primary small" id="use">Use code</button></div><p class="auth-msg" id="msg"></p>`}`);
  $('#back', el).addEventListener('click', back);
  Invite.code().then((c) => {
    if (!el.isConnected) return;
    const box = $('#code', el), sh = $('#share', el);
    if (!c) { box.textContent = 'Try again later'; return; }
    box.textContent = c; sh.disabled = false;
    sh.addEventListener('click', () => { Track.ev('invite_share'); shareOut(`Play CLUTCH with me 🏈 Use my code ${c} and we both get 2 free Pro packs!`, Invite.link(c)); });
  });
  Invite.check();
  const use = $('#use', el);
  if (use) use.addEventListener('click', async () => {
    use.disabled = true;
    const r = await Invite.claim($('#fc', el).value), m = $('#msg', el);
    use.disabled = false;
    if (m) { m.textContent = r.msg; m.style.color = r.ok ? 'var(--mint)' : 'var(--red)'; }
    if (r.ok) { Sfx.achievement(); confetti(1200); setTimeout(InviteScreen, 1400); } else Sfx.bad();
  });
  return el;
}
// a ?ref=CODE link: remember it, and offer the friend reward
function inviteOnOpen() {
  const q = new URLSearchParams(location.search), ref = (q.get('ref') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (ref.length === 6 && !Store.data.refUsed) { Store.data.pendingRef = ref; Store.save(); history.replaceState(null, '', location.pathname); }
  const pend = Store.data.pendingRef;
  if (pend && !Store.data.refUsed) {
    if (Account.user) { Invite.claim(pend).then((r) => { if (r.ok) { toast(r.msg); Sfx.achievement(); } else { delete Store.data.pendingRef; Store.save(); } }); return; }
    setTimeout(() => {
      if (document.querySelector('.modal-bg')) return;
      modal(`<div class="center"><div class="intro-ic" style="margin:0 auto 10px;background:linear-gradient(135deg,#34d399,#10b981)">${ico('gift', 26)}</div>
        <h2 class="d">A friend invited you!</h2><p>Make a free account and you both get <b>2 Pro packs</b>.</p></div>
        <button class="btn primary big" id="su" style="width:100%">Claim my 2 Pro packs</button><button class="btn small" data-close style="margin:8px auto 0;display:block">Later</button>`, (bg) => {
        $('#su', bg).addEventListener('click', () => { bg.remove(); AuthScreen({ onDone: () => { Invite.claim(pend).then((r) => { toast(r.msg); if (r.ok) { Sfx.achievement(); confetti(1200); } goTab('play'); }); }, onBack: () => goTab('play'), reason: 'Your friend invited you: make an account to get 2 Pro packs.' }, 'up'); });
      }, 'sheet');
    }, 2200);
  }
  if (Account.user) setTimeout(() => Invite.check(), 6000);
}
