'use strict';
// Draft screen. One component for every mode:
//   cfg = { mode, seed, blind, shotClock, respins, managers:[{name, xi?}], meta:[{color, cpu}], me, online,
//           replace, rounds, title, onDone(st) }
const ICON = {
  back: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#0f1631" stroke-width="2.6" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg>',
  backW: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#0f1631" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  closeW: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  dice: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.3" fill="currentColor"/><circle cx="15" cy="15" r="1.3" fill="currentColor"/><circle cx="15" cy="9" r="1.3" fill="currentColor"/><circle cx="9" cy="15" r="1.3" fill="currentColor"/></svg>',
};
const FIELD_LINES = '<svg class="lines" viewBox="0 0 100 90" preserveAspectRatio="none"><g fill="none">' +
  [5, 15, 25, 35, 55, 65, 75, 85].map((y) => `<line x1="2" y1="${y}" x2="98" y2="${y}" stroke-width=".35"/>`).join('') +
  [10, 20, 30, 40, 50, 60, 70, 80].map((y) => `<line x1="36" y1="${y}" x2="38" y2="${y}" stroke-width=".5"/><line x1="62" y1="${y}" x2="64" y2="${y}" stroke-width=".5"/>`).join('') +
  '<line class="los" x1="2" y1="45" x2="98" y2="45" stroke-width=".9"/><rect x="2" y="1.5" width="96" height="87" rx="1.5" stroke-width=".8"/></g></svg>';

function fieldSlots(xi, opts) {
  opts = opts || {};
  return TE.LINEUP.map((s, i) => {
    const pid = xi[i], t = opts.targets && opts.targets[i];
    const inner = pid !== null && pid !== undefined ? pcard(pid, { slotPos: s.pos, blind: opts.blind, mods: opts.mods }) : `<div class="empty">${s.label}</div>`;
    return `<div class="slot ${t ? 'target' : ''} ${t && t.best ? 'best' : ''} ${opts.placed === i ? 'placed' : ''}" data-slot="${i}" style="left:${s.x}%;top:${s.y}%">${inner}${t ? `<span class="pen ${t.pen ? '' : 'ok'}">${t.pen ? '−' + t.pen : '✓'}</span>` : ''}</div>`;
  }).join('');
}
const miniField = (xi, mods) => `<div class="turf mini-turf">${FIELD_LINES}${fieldSlots(xi, { mods })}</div>`;

function openDraft(cfg) {
  const st = cfg.st || TE.createDraft({ seed: cfg.seed, blind: cfg.blind, managers: cfg.managers, respins: cfg.respins, replace: cfg.replace, rounds: cfg.rounds });
  App.g = { cfg, mode: cfg.mode, st, meta: cfg.meta || cfg.managers.map((m, i) => ({ color: MGR_COLORS[i] })), me: cfg.me || 0, online: !!cfg.online, sel: null, shownSpin: null, spinning: false, view: cfg.me || 0, lastPlaced: null };
  Draft();
}
const spinKey = (st) => st.spinNo + ':' + TE.activeSquad(st);
const localControl = (g, mi) => (g.online ? mi === g.me : !g.meta[mi].cpu);
const canAct = () => { const g = App.g, st = g.st; return !st.done && !g.spinning && !g.pending && localControl(g, TE.currentManager(st)); };

function Draft() {
  const g = App.g;
  go(`<div class="topbar">
      <button class="icon-btn" data-act="quit" aria-label="Quit">${ICON.close}</button>
      <div class="grow"><div class="round" id="dRound"></div><div class="mute" style="font-size:11px;font-weight:800;letter-spacing:.06em">${esc((g.cfg.title || 'DRAFT').toUpperCase())}</div></div>
      <div class="ring" id="dOvr"></div><div class="ring chem" id="dChem"></div></div>
    <div id="dTurn"></div>
    <div class="turf" id="dField"></div>
    <div class="panel"><div class="spinbox" id="dSpin"></div><div class="squad" id="dSquad"></div></div>`, 'draft');
  draftUpdate();
}

function draftUpdate() {
  const g = App.g; if (!g || !g.st) return;
  const st = g.st;
  // save the draft after every change (functions and the live state object are dropped from the config)
  if (g.cfg.run && !g.online && !st.done) { const cfg = Object.assign({}, g.cfg); delete cfg.st; delete cfg.onDone; Runs.set(g.cfg.run, { phase: 'draft', cfg: JSON.parse(JSON.stringify(cfg)), st }); }
  if (st.done) { stopClock(); draftRenderAll(); later(() => finishDraft(), 700); return; }
  const cm = TE.currentManager(st);
  if (!g.online && localControl(g, cm)) g.view = cm;
  if (g.online && !g.viewLock) g.view = g.me;
  if (g.shownSpin !== spinKey(st)) { runSpin(); return; }
  draftRenderAll();
  maybeCpu();
  startClock();
}
function finishDraft() {
  const g = App.g; if (!g || g.finished) return;
  g.finished = true;
  g.st.managers.forEach((m, i) => { if (localControl(g, i) || (g.online && i === g.me)) collect(m.xi); });
  g.cfg.onDone(g.st);
}
function draftRenderAll() { renderDraftTop(); renderTurn(); renderField(); renderSpinBox(); renderSquad(); }

function renderDraftTop() {
  const g = App.g, st = g.st, m = st.managers[g.view];
  const prof = TE.teamProfile(m.xi, { mods: g.cfg.mods });
  $('#dRound').innerHTML = st.done ? 'DONE' : `${st.replace ? 'MOVE' : 'PICK'} ${st.round + 1}<small>/ ${st.rounds}</small>`;
  const o = $('#dOvr'), c = $('#dChem');
  const ovr = prof.ovr ? Math.round(prof.ovr) : 0;
  o.style.setProperty('--p', Math.max(0, Math.min(100, (ovr - 60) * 2.5)) + '%');
  o.innerHTML = `<b>${st.blind ? '?' : ovr || '–'}</b><small>OVR</small>`;
  c.style.setProperty('--p', prof.chem + '%');
  c.innerHTML = `<b>${prof.chem}</b><small>CHEM</small>`;
}
function renderTurn() {
  const g = App.g, st = g.st, box = $('#dTurn');
  if (!st.multi) { box.innerHTML = ''; return; }
  const cm = st.done ? -1 : TE.currentManager(st);
  const who = cm < 0 ? 'Draft complete' : localControl(g, cm) ? (g.online || st.managers[cm].name === 'You' || st.managers.filter((m, i) => localControl(g, i)).length === 1 ? 'Your pick!' : `${esc(st.managers[cm].name)}'s pick`) : g.meta[cm] && g.meta[cm].cpu ? `${esc(st.managers[cm].name)} is thinking…` : `Waiting for ${esc(st.managers[cm].name)}…`;
  box.innerHTML = `<div class="turn">${cm >= 0 ? `<span class="dot" style="background:${g.meta[cm].color}"></span>` : ''}<span>${who}</span>
    <div class="tabs">${st.managers.map((m, i) => `<button data-view="${i}" class="${i === g.view ? 'on' : ''}" style="${i === g.view ? 'color:' + g.meta[i].color : ''}">${esc((m.name.length <= 9 ? m.name : m.name.replace(/^The /, '').split(' ').pop()).slice(0, 9))}</button>`).join('')}</div></div>`;
  $$('[data-view]', box).forEach((b) => b.addEventListener('click', () => { g.view = +b.dataset.view; g.viewLock = true; Sfx.tap(); renderDraftTop(); renderTurn(); renderField(); }));
}
function renderField() {
  const g = App.g, st = g.st, m = st.managers[g.view];
  const cm = st.done ? -1 : TE.currentManager(st);
  const targets = {};
  if (g.sel !== null && g.view === cm && canAct()) TE.openSlotsFor(g.sel, m.xi, st.replace).forEach((o, k) => { targets[o.slot] = { pen: o.pen, best: k === 0 }; });
  $('#dField').innerHTML = FIELD_LINES + fieldSlots(m.xi, { blind: st.blind, targets, mods: g.cfg.mods, placed: g.lastPlaced && g.lastPlaced.mi === g.view ? g.lastPlaced.slot : -1 });
  g.lastPlaced = null;
  $$('#dField .slot.target').forEach((el) => el.addEventListener('click', () => doPick(g.sel, +el.dataset.slot)));
}
function renderSpinBox() {
  const g = App.g, st = g.st, box = $('#dSpin');
  if (st.done) { box.innerHTML = '<div class="spin-txt"><div class="club">Draft complete</div><div class="era">Let\'s play…</div></div>'; return; }
  const sq = TE.activeSquad(st), team = TE.teamOf(sq), era = TE.SQUADS[sq].era === TE.DATA.CURRENT_ERA ? '2026' : TE.DATA.ERA_LABEL[TE.SQUADS[sq].era];
  const m = st.managers[TE.currentManager(st)];
  const mine = localControl(g, TE.currentManager(st));
  box.innerHTML = `<div class="mini-helm">${helmet(team.c1, team.c2)}</div>
    <div class="spin-txt"><div class="club">${esc(team.short)}</div><div class="era">${esc(team.name.slice(0, team.name.length - team.short.length).trim())} · ${era}${st.privateSquad !== null ? ' · <span style="color:var(--violet)">free spin</span>' : ''}</div></div>
    ${st.replace && mine ? '<button class="respin" id="keep" style="background:var(--mint-soft);color:var(--mint)">Keep team</button>' : ''}
    ${g.cfg.wildcard && mine && !st.replace && !st.multi && !m.wild ? `<button class="respin wildbtn" id="wild" title="Play a card from your binder">${ico('sparkle', 15)} Wild</button>` : ''}
    ${!st.multi ? `<button class="respin" id="respin" title="Re-spin" ${m.respins > 0 && !g.spinning ? '' : 'disabled'}>${ICON.dice} ${m.respins}</button>` : ''}
    ${g.cfg.shotClock && mine ? '<div class="shotclock"><i id="clockBar"></i></div>' : ''}`;
  const rb = $('#respin', box);
  if (rb) rb.addEventListener('click', () => { if (canAct() && TE.respin(st)) { g.sel = null; stopClock(); buzz(10); draftUpdate(); } });
  const wb = $('#wild', box);
  if (wb) wb.addEventListener('click', playWildcard);
  const kb = $('#keep', box);
  if (kb) kb.addEventListener('click', () => { if (!canAct()) return; stopClock(); TE.pass(st, TE.currentManager(st)); Sfx.tap(); draftUpdate(); });
}
// Wildcard: skip this spin and play any card you own
async function playWildcard() {
  const g = App.g, st = g.st;
  if (!canAct()) return;
  const mi = TE.currentManager(st), m = st.managers[mi];
  const fits = (id) => TE.openSlotsFor(id, m.xi).length > 0 && !m.xi.some((x) => x !== null && TE.PLAYERS[x].name === TE.PLAYERS[id].name);
  const mine = Object.keys(Store.data.coll).map(Number).filter(fits).sort((a, b) => TE.PLAYERS[b].r - TE.PLAYERS[a].r);
  stopClock();
  const pid = await pickPlayer({ title: 'Play a Wildcard', sub: 'Once per draft: skip this spin and drop in any card from your binder.', initial: mine.slice(0, 60), filter: (id) => !!Store.data.coll[id], exclude: (id) => (fits(id) ? null : 'no open spot'), stars: true, emptyText: 'None of your cards fit an open spot yet.' });
  if (pid === null || App.g !== g) { startClock(); return; }
  const slot = TE.openSlotsFor(pid, m.xi)[0].slot;
  const err = TE.wildcard(st, mi, pid, slot);
  if (err) { toast(err); return; }
  g.sel = null; g.lastPlaced = { mi, slot };
  Sfx.achievement(); buzz([20, 30, 20]);
  toast('Wildcard: ' + TE.PLAYERS[pid].name);
  unlock('wild');
  draftUpdate();
}
async function runSpin() {
  const g = App.g, st = g.st, key = spinKey(st);
  g.spinning = true; g.sel = null; stopClock();
  renderDraftTop(); renderTurn(); renderField();
  $('#dSquad').innerHTML = '<div class="wait"><div class="big">Spinning…</div>Team incoming</div>';
  const cm = TE.currentManager(st);
  const label = st.multi ? (localControl(g, cm) ? `${st.managers[cm].name}'s spin` : `Spin for ${st.managers[cm].name}`) : `${st.replace ? 'Upgrade' : 'Pick'} ${st.round + 1} of ${st.rounds}`;
  await spinWheel(TE.activeSquad(st), label);
  if (App.g !== g) return;
  g.spinning = false; g.shownSpin = key;
  draftUpdate();
}
function rowStatus(pid) {
  const g = App.g, st = g.st, m = st.managers[TE.currentManager(st)], p = TE.PLAYERS[pid];
  if (TE.activeTaken(st).indexOf(pid) >= 0) {
    const by = st.managers.findIndex((mm) => mm.xi.indexOf(pid) >= 0);
    return { off: true, note: `Taken by ${by >= 0 ? st.managers[by].name : 'someone'}`, cls: 'taken' };
  }
  if (m.xi.some((x) => x !== null && TE.PLAYERS[x].name === p.name)) return { off: true, note: 'Already on your team', cls: 'taken' };
  const open = TE.openSlotsFor(pid, m.xi, st.replace);
  if (!open.length) return { off: true, note: 'No open spot for a ' + TE.POS_NAME[p.pos].toLowerCase(), cls: '' };
  let best = open[0];
  if (st.replace) best = open.slice().sort((x, y) => slotGain(m, p, y) - slotGain(m, p, x))[0];
  const lbl = TE.LINEUP[best.slot].label;
  let note = `→ ${lbl}${best.pen ? ' (−' + best.pen + ')' : ''}`, cls = '';
  if (st.replace && m.xi[best.slot] !== null) {
    const d = slotGain(m, p, best);
    note = `Replaces ${shortName(TE.PLAYERS[m.xi[best.slot]].name)} at ${lbl} (${d >= 0 ? '+' : ''}${d})`;
    cls = d > 0 ? 'link' : 'taken';
  } else {
    const links = m.xi.filter((x) => x !== null && TE.PLAYERS[x].team === p.team).length;
    const eraL = m.xi.filter((x) => x !== null && TE.PLAYERS[x].era === p.era).length;
    if (links) { note += ` · +chem ${links} ${TE.DATA.TEAMS[p.team].short}`; cls = 'link'; } else if (eraL >= 2) { note += ' · +era link'; cls = 'link'; }
  }
  return { off: false, note, cls, best };
}
// rating gained by putting player p into slot o (replace mode)
function slotGain(m, p, o) {
  const cur = m.xi[o.slot];
  if (cur === null) return 99;
  const c = TE.PLAYERS[cur], mods = App.g.cfg.mods || {};
  return (p.r - o.pen) - (c.r + (mods[cur] || 0) - (TE.fitPenalty(c.pos, TE.LINEUP[o.slot].pos) || 0));
}
function renderSquad() {
  const g = App.g, st = g.st, box = $('#dSquad');
  if (st.done || g.spinning) return;
  const cm = TE.currentManager(st), sq = TE.activeSquad(st), mine = localControl(g, cm);
  const head = mine ? `<div class="hint">${g.sel === null ? (st.replace ? 'Swap someone in, or keep your team.' : 'Tap a player to pick him.') : 'Tap Place, or tap a glowing spot on the field.'}</div>` : `<div class="hint">${esc(st.managers[cm].name)} is picking from this roster…</div>`;
  const list = TE.SQUADS[sq].players.map((pid) => ({ pid, s: rowStatus(pid) })).sort((x, y) => (x.s.off - y.s.off) || (st.blind ? 0 : TE.PLAYERS[y.pid].r - TE.PLAYERS[x.pid].r));
  box.innerHTML = head + list.map(({ pid, s }, i) => {
    const p = TE.PLAYERS[pid];
    const sel = g.sel === pid;
    return `<button class="prow ${s.off ? 'off' : ''} ${sel ? 'sel' : ''}" data-pid="${pid}" style="animation-delay:${i * 18}ms">
      <span class="mc">${pcard(pid, { blind: st.blind })}</span>
      <span class="name">${esc(p.name)}<span class="note ${s.cls}">${esc(s.note)}</span></span>
      ${sel ? `<span class="place" data-place="${pid}">Place ✓</span>` : `<span class="pos ${p.pos}">${p.pos}</span>`}</button>`;
  }).join('');
  $$('.prow', box).forEach((b) => b.addEventListener('click', (e) => {
    const pid = +b.dataset.pid;
    if (e.target.closest('[data-place]')) { placeBest(pid); return; }
    onRow(pid);
  }));
}
function placeBest(pid) {
  const g = App.g, st = g.st, m = st.managers[TE.currentManager(st)];
  const o = TE.openSlotsFor(pid, m.xi, st.replace);
  if (!o.length) return;
  // in replace mode, best = biggest upgrade
  let slot = o[0].slot;
  if (st.replace) slot = o.slice().sort((a, b) => slotGain(m, TE.PLAYERS[pid], b) - slotGain(m, TE.PLAYERS[pid], a))[0].slot;
  doPick(pid, slot);
}
function onRow(pid) {
  const g = App.g, st = g.st;
  if (!canAct()) { toast(g.spinning ? 'Spinning…' : `It's ${st.managers[TE.currentManager(st)].name}'s pick`); return; }
  const s = rowStatus(pid);
  if (s.off) { toast(s.note); Sfx.bad(); return; }
  if (g.sel === pid) { placeBest(pid); return; }
  g.sel = pid; g.view = TE.currentManager(st);
  Sfx.select(); buzz(6);
  renderSquad(); renderDraftTop(); renderTurn(); renderField();
}
function doPick(pid, slot) {
  const g = App.g, st = g.st, mi = TE.currentManager(st);
  stopClock();
  if (g.online && !Net.isHost) {
    g.pending = true; g.sel = null;
    Net.send({ t: 'pick', pid, slot });
    later(() => { g.pending = false; }, 4000);
    Sfx.place(); buzz(20); renderField(); renderSquad();
    return;
  }
  const err = TE.pick(st, mi, pid, slot);
  if (err) { toast(err); return; }
  g.sel = null; g.lastPlaced = { mi, slot };
  Sfx.place(); buzz(20);
  const r = TE.PLAYERS[pid].r;
  if (r >= 95 && !st.blind) setTimeout(() => { Sfx.good(); toast('Legend pulled: ' + TE.PLAYERS[pid].name); }, 150);
  if (g.online) Net.broadcastState(st);
  draftUpdate();
}
function maybeCpu() {
  const g = App.g, st = g.st;
  if (st.done || g.spinning || g.cpuTimer) return;
  const cm = TE.currentManager(st);
  const isCpu = g.online ? (Net.isHost && Net.isGone(cm)) : g.meta[cm].cpu;
  if (!isCpu) return;
  g.cpuTimer = later(() => {
    g.cpuTimer = null;
    if (App.g !== g || st.done || TE.currentManager(st) !== cm) return;
    const b = TE.botPick(st, cm, g.cfg.cpuNoise === undefined ? 5 : g.cfg.cpuNoise);
    if (!b) return;
    TE.pick(st, cm, b.pid, b.slot);
    g.lastPlaced = { mi: cm, slot: b.slot };
    if (!g.online) g.view = cm;
    Sfx.place();
    if (g.online) Net.broadcastState(st);
    draftUpdate();
  }, 900);
}
// shot clock (speed drafts): run out of time and the auto-pick takes whoever's left
function startClock() {
  const g = App.g;
  if (!g.cfg.shotClock || !canAct() || g.clockT) return;
  const total = g.cfg.shotClock * 1000, t0 = performance.now();
  const bar = () => $('#clockBar');
  const loop = () => {
    if (App.g !== g || !g.clockT) return;
    const k = (performance.now() - t0) / total;
    const b = bar(); if (b) b.style.transform = `scaleX(${Math.max(0, 1 - k)})`;
    if (k >= 1) {
      g.clockT = null;
      const st = g.st;
      if (st.replace) { TE.pass(st, TE.currentManager(st)); toast('Time! Team kept'); draftUpdate(); return; }
      const b2 = TE.botPick(st, TE.currentManager(st), 40);
      if (b2) { toast('Shot clock! Auto-pick'); Sfx.bad(); doPick(b2.pid, b2.slot); }
      return;
    }
    if (k > 0.7 && Math.floor(k * 20) !== g.lastBeep) { g.lastBeep = Math.floor(k * 20); Sfx.tick(); }
    g.clockT = requestAnimationFrame(loop);
  };
  g.clockT = requestAnimationFrame(loop);
}
function stopClock() { const g = App.g; if (g && g.clockT) { cancelAnimationFrame(g.clockT); g.clockT = null; } }

function quitDraft() {
  modal(`<h2 class="d">Leave?</h2><p>${App.g && App.g.online ? 'You will leave the room.' : App.g && App.g.cfg.run ? 'Your draft is saved. Pick it up any time.' : 'Progress in this run will be lost.'}</p>
    <div class="actions two"><button class="btn" data-close>Stay</button><button class="btn hot" id="leave">Leave</button></div>`, (bg) => {
    $('#leave', bg).addEventListener('click', () => { bg.remove(); stopClock(); if (App.g && App.g.online) Net.leave(); goTab(App.tab || 'play'); });
  });
}
