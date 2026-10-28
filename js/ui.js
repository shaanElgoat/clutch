'use strict';
// Shared UI: storage + progression, sound, icons, player cards, spin wheel, toasts.
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MGR_COLORS = ['#2f6bff', '#ff3d7f', '#14b885', '#ff7a1a'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ================= STORAGE + PROGRESSION =================
const STATS0 = { played: 0, playoffs: 0, champs: 0, perfectReg: 0, perfect: 0, clutchW: 0, clutchT: 0, best: null, gdPlayed: 0, gdWins: 0, gauntletBest: 0, hlBest: 0, dynastyRings: 0, mpWins: 0, kickBest: 0, drillWins: 0, packs: 0 };
const Store = {
  key: 'clutch_v2',
  data: null,
  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(this.key)); } catch (_) {}
    this.data = Object.assign({ name: '', sound: true, haptics: true, fastSpin: false, theme: 'day', xp: 0, coins: 600, freePack: null, sets: {}, club: null, runs: {}, stats: {}, ach: {}, coll: {}, daily: {}, puzzles: {}, dynasty: null, seenHelp: false }, d || {});
    this.data.stats = Object.assign({}, STATS0, this.data.stats);
    this.data.sets = this.data.sets || {};
    if ((this.data.dv || 2) < 3) {
      // 2026 update: last year's rosters became the '25 pack set, so move any claimed set rewards with them
      Object.keys(this.data.sets).forEach((k) => { if (/-now$/.test(k)) { this.data.sets[k.replace(/-now$/, '-25')] = 1; delete this.data.sets[k]; } });
      this.data.dv = 3;
    }
    if (this.data.dv < 4) {
      // the binder now only holds cards from packs bought with coins: wipe it once and tell the player
      const had = d && d.coll && Object.keys(d.coll).length > 0;
      this.data.coll = {}; this.data.sets = {};
      if (this.data.club) Object.assign(this.data.club, { xi: new Array(12).fill(null), match: null });
      this.data.dv = 4;
      this.data.news26 = false;
      if (had) this.data.resetNotice = true;
    }
    return this.data;
  },
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (_) {} },
};
// In-progress runs, one slot per mode, saved after every pick, play and game,
// so closing the app (or the phone killing it) never loses a run.
const Runs = {
  get: (k) => (Store.data.runs || {})[k] || null,
  set(k, v) { Store.data.runs = Store.data.runs || {}; Store.data.runs[k] = Object.assign({}, v, { at: Date.now() }); Store.save(); },
  clear(k) { if (Store.data.runs && Store.data.runs[k]) { delete Store.data.runs[k]; Store.save(); } },
};

const levelOf = (xp) => Math.floor(Math.sqrt(xp / 120)) + 1;
const xpFor = (lvl) => (lvl - 1) * (lvl - 1) * 120;
const THEMES = [
  { id: 'day', name: 'Sunday Afternoon', lvl: 1 },
  { id: 'night', name: 'Primetime Lights', lvl: 3 },
  { id: 'snow', name: 'Snow Game', lvl: 5 },
  { id: 'retro', name: 'Retro Turf', lvl: 8 },
  { id: 'gold', name: 'Golden Field', lvl: 12 },
];
function applyTheme() { document.documentElement.dataset.field = Store.data.theme || 'day'; }

function addXP(n, why) {
  if (!n) return;
  const before = levelOf(Store.data.xp);
  Store.data.xp += n;
  Store.data.coins += Math.round(n * 0.6);
  Store.save();
  floatXP(n, why);
  $$('[data-coins]').forEach((c) => { c.textContent = Store.data.coins.toLocaleString(); });
  const after = levelOf(Store.data.xp);
  if (after > before) {
    const th = THEMES.find((t) => t.lvl === after);
    setTimeout(() => banner(ico('star', 24), `Level ${after}!`, th ? `Unlocked the ${th.name} field` : 'Keep climbing'), 900);
    Sfx.levelUp();
  }
}

const ACH = [
  { id: 'first_season', icon: 'ball', t: 'Kickoff', d: 'Finish your first season' },
  { id: 'playoffs', icon: 'ticket', t: 'Postseason', d: 'Make the playoffs' },
  { id: 'ring', icon: 'ring', t: 'Ring Bearer', d: 'Win a Super Bowl' },
  { id: 'p17', icon: 'flame', t: 'Seventeen and Oh', d: 'Go 17-0 in the regular season' },
  { id: 'perfect', icon: 'crown', t: 'Perfection', d: 'Win it all without losing a game' },
  { id: 'clutch1', icon: 'clock', t: 'Ice in the Veins', d: 'Win a Clutch Call' },
  { id: 'clutch10', icon: 'snow', t: 'Mr. Clutch', d: 'Win 10 Clutch Calls' },
  { id: 'gd_win', icon: 'clipboard', t: 'Play Caller', d: 'Win a Gameday' },
  { id: 'gd_40', icon: 'bolt', t: 'Air Raid', d: 'Score 40+ points in a Gameday' },
  { id: 'gd_top', icon: 'sword', t: 'Giant Killer', d: 'Win a Gameday on Legend difficulty' },
  { id: 'duel1', icon: 'users', t: 'Rivalry Week', d: 'Win a Draft Duel series' },
  { id: 'duel_sweep', icon: 'bolt', t: 'Clean Sweep', d: 'Win a Draft Duel 2-0' },
  { id: 'duel_shark', icon: 'sword', t: 'Shark Tank', d: 'Beat The Shark in a Draft Duel' },
  { id: 'cap2', icon: 'coin', t: 'Moneyball', d: 'Win 2 playoff games in Salary Cap' },
  { id: 'cap_ring', icon: 'crown', t: 'Capologist', d: 'Win the Super Bowl in Salary Cap' },
  { id: 'hl10', icon: 'scale', t: 'Stat Head', d: "Who's Better? streak of 10" },
  { id: 'hl25', icon: 'eye', t: 'Walking Almanac', d: "Who's Better? streak of 25" },
  { id: 'daily3', icon: 'calendar', t: 'Habit', d: 'Play the Daily 3 days in a row' },
  { id: 'grid9', icon: 'grid', t: 'Immaculate', d: 'Fill all 9 squares of The Grid' },
  { id: 'mystery', icon: 'question', t: 'Detective', d: "Solve Who's That? in 4 guesses or fewer" },
  { id: 'drill', icon: 'timer', t: 'Two-Minute Warning', d: 'Win a 2-Minute Drill' },
  { id: 'kick55', icon: 'goalpost', t: 'Big Leg', d: 'Make a 55+ yard kick in Kick It' },
  { id: 'kick10', icon: 'target', t: 'Automatic', d: 'Make 10 kicks in one Kick It run' },
  { id: 'pack_legend', icon: 'sparkle', t: 'Pulled a Legend', d: 'Pull a 95+ card from a pack' },
  { id: 'legends5', icon: 'star', t: 'Hall of Famers', d: 'Draft 5 players rated 95+ on one team' },
  { id: 'blind_ring', icon: 'eyeoff', t: 'Blindfolded', d: 'Win a ring in a Blind draft' },
  { id: 'mp_win', icon: 'globe', t: 'Bragging Rights', d: 'Win an online or party game' },
  { id: 'br_top10', icon: 'target', t: 'Storm Chaser', d: 'Finish top 10 in Battle Royale' },
  { id: 'br_win', icon: 'crown', t: 'Victory Royale', d: 'Win a Battle Royale' },
  { id: 'set1', icon: 'check', t: 'Set Complete', d: 'Collect every card in one team-decade set' },
  { id: 'set10', icon: 'pillar', t: 'Set Collector', d: 'Complete 10 sets' },
  { id: 'star3', icon: 'star', t: 'Maxed Out', d: 'Level a card to 3 stars' },
  { id: 'wild', icon: 'sparkle', t: 'Wildcard', d: 'Play a Wildcard from your binder in a draft' },
  { id: 'coll100', icon: 'cards', t: 'Collector', d: 'Collect 100 different cards' },
  { id: 'coll500', icon: 'trophy', t: 'Curator', d: 'Collect 500 different cards' },
];
function unlock(id) {
  if (Store.data.ach[id]) return;
  const a = ACH.find((x) => x.id === id); if (!a) return;
  Store.data.ach[id] = Date.now();
  Store.save();
  setTimeout(() => banner(ico(a.icon, 24), 'Achievement unlocked', a.t), 400);
  Sfx.achievement();
  addXP(100, a.t);
}
// card levels: every duplicate pull adds a star (max 3). Each star is +1 rating in My Club.
const cardLevel = (pid) => Math.max(0, Math.min(3, (Store.data.coll[pid] || 1) - 1));
function levelMods(xi) { const m = {}; xi.forEach((pid) => { if (pid !== null && pid !== undefined && cardLevel(pid)) m[pid] = cardLevel(pid); }); return m; }
// add drafted players to the binder and check team-building achievements
function collect(xi) {
  const c = Store.data.coll;
  xi.forEach((pid) => { if (pid !== null && pid !== undefined) c[pid] = c[pid] || 1; });
  Store.save();
  const n = Object.keys(c).length;
  if (n >= 100) unlock('coll100');
  if (n >= 500) unlock('coll500');
  if (xi.filter((pid) => pid !== null && TE.PLAYERS[pid].r >= 95).length >= 5) unlock('legends5');
}

// ================= SOUND =================
const Sfx = {
  ctx: null,
  ensure() {
    if (!Store.data.sound) return null;
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; } }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  tone(freq, dur, type, vol, slide, delay) {
    const c = this.ensure(); if (!c) return;
    const t = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol, freq, q) {
    const c = this.ensure(); if (!c) return;
    const b = c.createBuffer(1, Math.max(1, c.sampleRate * dur), c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / d.length);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.frequency.value = freq || 1200; f.Q.value = q || 0.6;
    g.gain.value = vol || 0.15; s.buffer = b; s.connect(f).connect(g).connect(c.destination); s.start();
  },
  tick() { this.tone(1800, 0.025, 'square', 0.02); },
  land() { this.tone(523, 0.1, 'triangle', 0.14); this.tone(784, 0.18, 'triangle', 0.12, null, 0.08); },
  place() { this.tone(180, 0.12, 'sine', 0.25, 90); this.noise(0.08, 0.06, 2600); },
  select() { this.tone(880, 0.05, 'sine', 0.07); },
  tap() { this.tone(660, 0.04, 'sine', 0.05); },
  win() { this.tone(660, 0.07, 'triangle', 0.05); },
  loss() { this.tone(180, 0.12, 'sawtooth', 0.03, 130); },
  crowd(big) { this.noise(big ? 2.4 : 1.2, big ? 0.24 : 0.12, 850, 0.5); },
  groan() { this.noise(1.3, 0.1, 300); this.tone(220, 0.6, 'sine', 0.05, 140); },
  trophy() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.12, null, i * 0.11)); setTimeout(() => this.crowd(true), 300); },
  whistle() { this.tone(2350, 0.3, 'sine', 0.05, 2150); },
  heartbeat() { this.tone(62, 0.13, 'sine', 0.32, 40); this.tone(58, 0.13, 'sine', 0.28, 38, 0.17); },
  achievement() { [784, 988, 1175].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.1, null, i * 0.09)); },
  levelUp() { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.3, 'square', 0.05, null, i * 0.08)); },
  hit() { this.noise(0.18, 0.2, 180, 1.2); this.tone(90, 0.15, 'sine', 0.25, 50); },
  good() { this.tone(988, 0.12, 'triangle', 0.1); this.tone(1318, 0.18, 'triangle', 0.08, null, 0.1); },
  bad() { this.tone(240, 0.25, 'square', 0.05, 160); },
};
const buzz = (ms) => { if (Store.data.haptics && navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) try { navigator.vibrate(ms); } catch (_) {} };

// ================= ICONS + ART =================
// a small line-icon set (24x24, stroke-based)
const ICONS = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  pack: '<rect x="5" y="2.5" width="14" height="19" rx="3"/><path d="M5 8h14M9 13l3-2 3 2-1 4h-4z"/>',
  cards: '<rect x="3" y="6" width="12" height="15" rx="2.5"/><path d="M8 3h10a3 3 0 0 1 3 3v12"/>',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.6 2.6 0 1 1 3.7 2.4c-.8.4-1.2 1-1.2 1.8v.4M12 17.2v.3"/>',
  clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2.5h6"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 13l3-3M9 2.5h6M19 6l1.5-1.5"/>',
  clipboard: '<rect x="5" y="4" width="14" height="18" rx="2.5"/><path d="M9 2.5h6v3H9zM9 11h6M9 15h4"/>',
  ladder: 'M7 3v18M17 3v18M7 7h10M7 12h10M7 17h10',
  crown: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  goalpost: 'M6 3v7a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V3M12 13v8M9 21h6',
  sparkle: 'M12 3l2 5.5L19.5 10.5 14 12.5 12 18l-2-5.5L4.5 10.5 10 8.5zM19 3v4M17 5h4',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.6a3 3 0 0 1 0 6M18 14.6c2 .6 3.3 2.6 3.5 5.4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.3 3 14.7 0 18M12 3c-3 3.3-3 14.7 0 18"/>',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  gift: '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M3 12.5h18M12 8v13M12 8C10 4 6.5 4 6.5 6.2S9.5 8 12 8c2.5 0 5.5-.6 5.5-1.8S14 4 12 8"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M14.6 9.2c-.4-1-1.4-1.6-2.6-1.6-1.6 0-2.6.8-2.6 2s1 1.7 2.6 2.1 2.7 1 2.7 2.3-1.1 2.1-2.7 2.1c-1.3 0-2.3-.6-2.7-1.7M12 6v1.6M12 16.1v1.9"/>',
  flame: 'M12 22c4 0 7-3 7-7 0-4-3-6-4-10-1 3-3 4-4 5 0-2-1-4-2-5-1 4-4 6-4 10 0 4 3 7 7 7z',
  star: 'M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.3L12 17.5l-5.5 2.9 1-6.3L3 9.7l6.2-.9z',
  ring: '<circle cx="12" cy="15" r="6"/><path d="M9 4h6l-1.5 3.5h-3z"/>',
  ticket: 'M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4zM14 6v12',
  snow: 'M12 2v20M4.5 6.5l15 11M19.5 6.5l-15 11M9 4l3 2.5L15 4M9 20l3-2.5 3 2.5',
  sword: 'M14.5 4H20v5.5L10 19.5 7.5 17zM4 20l3-3M6 14l4 4M4.5 17.5l2 2',
  pillar: 'M3 9l9-5 9 5M5 9v9M10 9v9M14 9v9M19 9v9M3 21h18',
  scale: 'M12 3v18M7 21h10M4 7h16M4 7l-2.5 6a3 3 0 0 0 5 0zM20 7l-2.5 6a3 3 0 0 0 5 0z',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: 'M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.8M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.6 0 3-.4 4.3-1.1',
  flask: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M7 15h10',
  ball: '<ellipse cx="12" cy="12" rx="10" ry="6.5" transform="rotate(-35 12 12)"/><path d="M9 15l6-6M10.5 10.5l1.5 1.5M12 9l1.5 1.5M9 12l1.5 1.5"/>',
  check: 'M5 12.5l4.5 4.5L19 7',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  chevron: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  x: 'M6 6l12 12M18 6 6 18',
  heart: 'M12 20s-7.5-4.6-9.2-9.4C1.7 7.4 3.9 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.1 0 5.3 2.9 4.2 6.1C19.5 15.4 12 20 12 20z',
  share: 'M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5-9 9"/>',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  sound: 'M4 9v6h4l5 4V5L8 9zM16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.2"/><circle cx="15" cy="15" r="1.2"/><circle cx="15" cy="9" r="1.2"/><circle cx="9" cy="15" r="1.2"/>',
  run: '<circle cx="15" cy="4.5" r="2"/><path d="M6 21l3.5-6 3 2.5V22M13 17.5l-1-5.5 4-2.5 2 3.5h3M8.5 11.5l3.5-4 3.5 1"/>',
  quick: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 3v3M21 12h-3"/>',
  deep: 'M4 20 20 4M10 4h10v10',
  pa: 'M4 7h3c5 0 5 10 10 10h3M17 14l3 3-3 3M4 17h3c1.5 0 2.5-1 3.3-2.2M17 4l3 3-3 3M13.7 9.2C14.5 8 15.5 7 17 7h3',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  stop: 'M8 3h8l5 5v8l-5 5H8l-5-5V8z',
  punt: 'M5 19l14-14M8 5h11v11',
  robot: '<rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M9 12v1M15 12v1M9 16h6"/>',
  versus: 'M4 5l4 14 4-14M20 6.5C19 5.5 17.8 5 16.5 5c-1.9 0-3 1-3 2.5s1.2 2.1 3 2.6 3 1.2 3 2.9-1.3 2.9-3.2 2.9c-1.5 0-2.8-.6-3.6-1.7',
  bag: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  play: 'M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z',
};
function ico(name, size, cls) {
  const d = ICONS[name] || ICONS.star;
  const inner = d.trim().startsWith('<') ? d : `<path d="${d}"/>`;
  return `<svg class="ico ${cls || ''}" viewBox="0 0 24 24" width="${size || 22}" height="${size || 22}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}
const DEFS = '<svg width="0" height="0" style="position:absolute"><defs>' +
  '<linearGradient id="gBall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8692f"/><stop offset="1" stop-color="#7a3d16"/></linearGradient>' +
  '<linearGradient id="gSilver" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#c9d1e3"/><stop offset="1" stop-color="#8d98b5"/></linearGradient>' +
  '<linearGradient id="gGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset=".5" stop-color="#ffc531"/><stop offset="1" stop-color="#e08a00"/></linearGradient>' +
  '</defs></svg>';
const FOOTBALL = '<svg viewBox="0 0 64 64"><g transform="rotate(-35 32 32)"><ellipse cx="32" cy="32" rx="28" ry="17" fill="url(#gBall)"/><path d="M10 26c4-3 4 15 0 12M54 26c-4-3-4 15 0 12" stroke="#fff" stroke-width="2.4" fill="none"/><path d="M20 32h24" stroke="#fff" stroke-width="2.6"/><path d="M24 28v8M28 28v8M32 28v8M36 28v8M40 28v8" stroke="#fff" stroke-width="2.2"/></g></svg>';
const TROPHY_SVG = '<svg viewBox="0 0 64 64"><g transform="rotate(-20 32 16)"><ellipse cx="32" cy="16" rx="11" ry="7" fill="url(#gSilver)"/></g><path d="M30 22l-4 22h12l-4-22z" fill="url(#gSilver)"/><path d="M22 44h20l3 8H19z" fill="url(#gSilver)"/><rect x="17" y="52" width="30" height="7" rx="2" fill="#1b2650"/></svg>';
const RING_SVG = '<svg viewBox="0 0 64 64"><ellipse cx="32" cy="40" rx="18" ry="15" fill="none" stroke="url(#gGold)" stroke-width="7"/><rect x="18" y="8" width="28" height="22" rx="6" fill="url(#gGold)"/><path d="M24 19l4-6 4 6 4-6 4 6" stroke="#fff" stroke-width="2" fill="none" opacity=".8"/></svg>';

// a side-on helmet in team colours
function helmet(c1, c2, flip) {
  const mask = '#cfd5e2';
  return `<svg class="helm" viewBox="0 0 120 100" ${flip ? 'style="transform:scaleX(-1)"' : ''}>
    <path d="M14 58 C12 26 40 6 70 8 C98 10 114 32 112 56 L112 66 L86 70 L80 86 L40 88 C24 86 15 74 14 58Z" fill="${c1}"/>
    <path d="M30 18 C50 8 80 6 100 22" stroke="${c2}" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M14 58 C12 26 40 6 70 8 C98 10 114 32 112 56" stroke="rgba(255,255,255,.35)" stroke-width="3" fill="none"/>
    <circle cx="62" cy="56" r="9" fill="rgba(0,0,0,.25)"/><circle cx="62" cy="56" r="5" fill="${c2}"/>
    <path d="M86 52 L118 52 M88 64 L118 64 M96 46 L96 74 M108 48 L108 72" stroke="${mask}" stroke-width="4" stroke-linecap="round" fill="none"/>
    <path d="M40 88 C46 94 74 94 80 86" stroke="rgba(0,0,0,.25)" stroke-width="3" fill="none"/></svg>`;
}

function lightColor(hex) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}
function crest(team, size) {
  const tc = lightColor(team.c1) ? '#111' : '#fff';
  return `<svg class="crest" viewBox="0 0 46 46" ${size ? `style="width:${size}px;height:${size}px"` : ''}>
    <circle cx="23" cy="23" r="21.5" fill="${team.c1}" stroke="${team.c2}" stroke-width="3"/>
    <text x="23" y="${team.id.length > 2 ? 27.5 : 28.5}" text-anchor="middle" font-family="Plus Jakarta Sans, Arial, sans-serif" font-weight="800" font-size="${team.id.length > 2 ? 12.5 : 15}" fill="${tc}">${team.id}</text></svg>`;
}
const tierOf = (r) => (r >= 95 ? 'legend' : r >= 90 ? 'elite' : r >= 85 ? 'gold' : r >= 80 ? 'silver' : 'bronze');
const TIER_NAME = { legend: 'Legend', elite: 'Elite', gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };

function shortName(n) {
  const t = n.split(' ');
  if (t.length === 1) return n;
  let last = t[t.length - 1];
  if (/^(Jr\.|Sr\.|II|III)$/.test(last) && t.length > 2) last = t[t.length - 2];
  return last;
}

// player card. opts: {slotPos, blind, mods, big, hideRating, cls}
function pcard(pid, opts) {
  opts = opts || {};
  const p = TE.PLAYERS[pid], team = TE.DATA.TEAMS[p.team];
  const pen = opts.slotPos ? TE.fitPenalty(p.pos, opts.slotPos) || 0 : 0;
  const mod = opts.mods && opts.mods[pid] ? opts.mods[pid] : 0;
  const r = p.r - pen + mod;
  const hide = opts.blind || opts.hideRating;
  const tier = hide ? 'hidden' : tierOf(r);
  const light = lightColor(team.c1);
  return `<div class="pcard t-${tier} ${pen ? 'oop' : ''} ${light ? 'lightbg' : ''} ${opts.cls || ''}" style="--c1:${team.c1};--c2:${team.c2}">
    <div class="pc-bg"></div><div class="pc-mono">${team.id}</div><div class="pc-stripe"></div>
    <div class="pc-top"><div class="pc-rt">${hide ? '?' : r}</div><div class="pc-pos">${p.pos}</div></div>
    ${opts.stars ? `<div class="pc-stars">${'★'.repeat(opts.stars)}</div>` : mod ? `<div class="pc-mod ${mod > 0 ? 'up' : 'down'}">${mod > 0 ? '+' : '−'}${Math.abs(mod)}</div>` : ''}
    <div class="pc-plate"><div class="pc-name">${esc(opts.big ? p.name : shortName(p.name))}</div><div class="pc-era">${team.id} · ${TE.eraTag(p.era)}</div></div>
  </div>`;
}

// bottom-sheet player search. opts: {title, sub, hideRatings, exclude(pid) -> reason|null, filter(pid) -> bool, initial:[pid], stars, mods}.
// Resolves to a pid or null.
function pickPlayer(opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    let done = false;
    const bg = modal(`<div class="sheet-head"><h2 class="d" style="margin:0">${esc(opts.title || 'Find a player')}</h2><button class="icon-btn" data-close>${ico('x', 18)}</button></div>
      ${opts.sub ? `<p class="mute" style="margin:-6px 0 10px;font-weight:600;font-size:13px">${opts.sub}</p>` : ''}
      <input class="field" id="q" placeholder="${opts.initial ? 'Search your cards…' : 'Type a name…'}" autocomplete="off" autocapitalize="off" spellcheck="false">
      <div class="results" id="res"><div class="mute center" style="padding:20px;font-weight:600">Start typing. Every player from every decade is in here.</div></div>`, (el) => {
      const q = $('#q', el), res = $('#res', el);
      if (!opts.initial) setTimeout(() => q.focus(), 50);
      const norm = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const show = (list, empty) => {
        res.innerHTML = list.length ? list.map((p) => { const why = opts.exclude ? opts.exclude(p.id) : null; const t2 = TE.DATA.TEAMS[p.team];
          const st = opts.stars ? cardLevel(p.id) : 0;
          // trivia mode: just the name, so the list never gives away a team, position or decade
          if (opts.namesOnly) return `<button class="srow name-only ${why ? 'off' : ''}" data-pid="${p.id}"><span class="grow"><b>${esc(p.name)}</b>${why ? `<small>${esc(why)}</small>` : ''}</span>${ico('chevron', 18)}</button>`;
          return `<button class="srow ${why ? 'off' : ''}" data-pid="${p.id}"><span class="mc">${pcard(p.id, { hideRating: opts.hideRatings, mods: opts.mods })}</span><span class="grow"><b>${esc(p.name)}${st ? ` <span class="stars-inline">${'★'.repeat(st)}</span>` : ''}</b><small>${esc(t2.name)} · ${TE.DATA.ERA_LABEL[p.era]} · ${p.pos}${why ? ' · ' + esc(why) : ''}</small></span>${ico('chevron', 18)}</button>`; }).join('') : `<div class="mute center" style="padding:20px;font-weight:600">${empty}</div>`;
        $$('.srow', res).forEach((b) => b.addEventListener('click', () => { if (b.classList.contains('off')) return; done = true; bg.remove(); resolve(+b.dataset.pid); }));
      };
      if (opts.initial) show(opts.initial.map((id) => TE.PLAYERS[id]), opts.emptyText || 'No cards yet. Draft or open packs to collect some.');
      q.addEventListener('input', () => {
        const t = norm(q.value.trim());
        if (t.length < 2) { if (opts.initial) show(opts.initial.map((id) => TE.PLAYERS[id]), opts.emptyText || 'No cards'); else res.innerHTML = '<div class="mute center" style="padding:20px;font-weight:600">Keep typing…</div>'; return; }
        let hits = TE.PLAYERS.filter((p) => (!opts.filter || opts.filter(p.id)) && norm(p.name).includes(t)).sort((a, b) => (norm(a.name).startsWith(t) ? -1 : 0) - (norm(b.name).startsWith(t) ? -1 : 0) || b.r - a.r);
        // one row per name (a player who spans teams or decades shows once, alphabetically)
        if (opts.namesOnly) { const seen = new Set(); hits = hits.filter((p) => !seen.has(p.name) && seen.add(p.name)).sort((a, b) => (norm(a.name).startsWith(t) ? -1 : 0) - (norm(b.name).startsWith(t) ? -1 : 0) || a.name.localeCompare(b.name)); }
        hits = hits.slice(0, 40);
        show(hits, 'No players found');
      });
    }, 'sheet');
    const obs = new MutationObserver(() => { if (!bg.isConnected) { obs.disconnect(); if (!done) resolve(null); } });
    obs.observe(document.body, { childList: true });
  });
}

// ================= PACKS =================
const PACKS = [
  { id: 'std', name: 'Standard', cost: 500, n: 5, min: 0, grad: 'linear-gradient(150deg,#5b8cff,#2f5ef0)', blurb: '5 cards' },
  { id: 'pro', name: 'Pro', cost: 1500, n: 5, min: 90, grad: 'linear-gradient(150deg,#ffcf4d,#ff8a1a)', blurb: '5 cards · one 90+ guaranteed' },
  { id: 'leg', name: 'Legend', cost: 4000, n: 3, min: 95, grad: 'linear-gradient(150deg,#a78bff,#ff3d7f)', blurb: '3 cards · one 95+ guaranteed' },
];
function rollPack(pack) {
  const w = (r) => (r >= 95 ? 0.12 : r >= 90 ? 0.6 : r >= 85 ? 2 : r >= 80 ? 4 : 6);
  const pool = TE.PLAYERS;
  const tot = pool.reduce((a, p) => a + w(p.r), 0);
  const draw = (filter) => {
    if (filter) { const f = pool.filter(filter); return f[Math.floor(Math.random() * f.length)].id; }
    let x = Math.random() * tot;
    for (const p of pool) { x -= w(p.r); if (x <= 0) return p.id; }
    return pool[0].id;
  };
  const out = [];
  if (pack.min) out.push(draw((p) => p.r >= pack.min));
  while (out.length < pack.n) { const id = draw(); if (out.indexOf(id) < 0) out.push(id); }
  return out.sort(() => Math.random() - 0.5).sort((a, b) => TE.PLAYERS[a].r - TE.PLAYERS[b].r);
}
const dupeValue = (r) => (r >= 95 ? 400 : r >= 90 ? 150 : r >= 85 ? 60 : 25);

// ================= FEEDBACK =================
function toast(msg) {
  $$('.toast').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}
function banner(icon, title, sub) {
  const b = document.createElement('div');
  b.className = 'banner';
  b.innerHTML = `<div class="bi">${icon}</div><div><b>${esc(title)}</b><span>${esc(sub || '')}</span></div>`;
  document.body.appendChild(b);
  setTimeout(() => b.classList.add('out'), 2800);
  setTimeout(() => b.remove(), 3300);
}
function floatXP(n) {
  const f = document.createElement('div');
  f.className = 'xpfloat'; f.innerHTML = `+${n} XP <span>+${Math.round(n * 0.6)} ${ico('coin', 16)}</span>`;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1600);
}
function modal(html, onMount, cls) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${cls || ''}">${html}</div>`;
  bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) bg.remove(); });
  document.body.appendChild(bg);
  if (onMount) onMount(bg);
  return bg;
}
function confetti(ms) {
  const c = document.createElement('canvas');
  c.className = 'confetti';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  document.body.appendChild(c);
  const g = c.getContext('2d');
  const cols = ['#2f6bff', '#ff3d7f', '#ffc531', '#14b885', '#7b5cff', '#ff7a1a'];
  const P = Array.from({ length: 180 }, () => ({ x: Math.random() * c.width, y: -Math.random() * c.height * 0.6, vx: (Math.random() - 0.5) * 3 * dpr, vy: (2 + Math.random() * 4) * dpr, r: Math.random() * 6, s: (5 + Math.random() * 7) * dpr, c: cols[Math.floor(Math.random() * cols.length)] }));
  const t0 = performance.now();
  (function f(t) {
    g.clearRect(0, 0, c.width, c.height);
    P.forEach((p) => { p.x += p.vx; p.y += p.vy; p.vy += 0.04 * dpr; p.r += 0.1; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore(); });
    if (t - t0 < (ms || 3500)) requestAnimationFrame(f); else c.remove();
  })(t0);
}
// count a number up inside an element
function countUp(el, to, ms) {
  const from = +el.textContent || 0, t0 = performance.now();
  (function f(t) {
    const k = Math.min(1, (t - t0) / (ms || 600));
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(f);
  })(t0);
}

// ================= SPIN WHEEL =================
// spins the 32-team wheel onto the team of `sq`, then drops the decade. Resolves when done.
let wheelAngle = 0;
function spinWheel(sq, label) {
  return new Promise((resolve) => {
    const teams = TE.DATA.TEAMS, n = teams.length, seg = 360 / n;
    const target = TE.SQUADS[sq].team, era = TE.SQUADS[sq].era;
    const fast = Store.data.fastSpin;
    const R = 150, cx = 160, cy = 160;
    const segs = teams.map((t, i) => {
      const a0 = (i * seg - 90 - seg / 2) * Math.PI / 180, a1 = ((i + 1) * seg - 90 - seg / 2) * Math.PI / 180;
      const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0), x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
      const mid = i * seg;
      const tc = lightColor(t.c1) ? '#111' : '#fff';
      return `<path d="M${cx} ${cy} L${x0.toFixed(1)} ${y0.toFixed(1)} A${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}Z" fill="${t.c1}" stroke="#fff" stroke-width="1.5"/>
        <text x="${cx}" y="${cy - R + 22}" transform="rotate(${mid} ${cx} ${cy})" text-anchor="middle" font-family="Plus Jakarta Sans, Arial" font-weight="800" font-size="11" fill="${tc}">${t.id}</text>`;
    }).join('');
    const ov = document.createElement('div');
    ov.className = 'wheel-ov';
    ov.innerHTML = `<div class="wheel-box"><div class="wheel-label">${esc(label || 'Spin!')}</div>
      <div class="wheel-wrap"><div class="wheel-pointer"></div>
        <svg class="wheel" viewBox="0 0 320 320" style="transform:rotate(${wheelAngle}deg)"><circle cx="160" cy="160" r="156" fill="#fff"/>${segs}<circle cx="160" cy="160" r="34" fill="#fff" stroke="#e8ecf5" stroke-width="3"/></svg>
        <div class="wheel-hub">${FOOTBALL}</div></div>
      ${era === TE.DATA.CURRENT_ERA ? '<div class="era-reel"><span class="on">2026 roster</span></div>' : `<div class="era-reel">${TE.DATA.ERAS.map((e) => `<span data-e="${e}">${TE.DATA.ERA_LABEL[e]}</span>`).join('')}</div>`}
      <div class="wheel-result"></div><div class="wheel-skip">Tap to skip</div></div>`;
    document.body.appendChild(ov);
    const wheel = $('.wheel', ov);
    // land with the target segment under the top pointer, a little off-centre so it feels physical
    const jitter = (Math.random() - 0.5) * seg * 0.6;
    const turns = fast ? 3 : 5 + Math.floor(Math.random() * 2);
    const base = Math.ceil(wheelAngle / 360) * 360;
    const final = base + turns * 360 + (360 - target * seg) + jitter;
    const dur = fast ? 1100 : 2600;
    let done = false, lastSeg = null;
    const t0 = performance.now();
    const ease = (k) => 1 - Math.pow(1 - k, 4);
    const start = wheelAngle;
    function frame(t) {
      if (done) return;
      const k = Math.min(1, (t - t0) / dur);
      const a = start + (final - start) * ease(k);
      wheel.style.transform = `rotate(${a}deg)`;
      const cur = Math.floor((a + seg / 2) / seg);
      if (cur !== lastSeg) { lastSeg = cur; Sfx.tick(); }
      if (k < 1) requestAnimationFrame(frame); else afterWheel();
    }
    requestAnimationFrame(frame);
    // safety net for throttled tabs
    const fallback = setTimeout(() => { if (!done) afterWheel(); }, dur + 400);
    let eraStarted = false;
    function afterWheel() {
      if (eraStarted) return; eraStarted = true;
      clearTimeout(fallback);
      wheelAngle = final % 360;
      wheel.style.transform = `rotate(${final}deg)`;
      Sfx.land(); buzz(15);
      if (era === TE.DATA.CURRENT_ERA) { finish(); return; }
      const chips = $$('.era-reel span', ov);
      let i = 0;
      const steps = fast ? 4 : 9 + TE.DATA.ERAS.indexOf(era);
      const roll = () => {
        chips.forEach((c) => c.classList.remove('on'));
        const e = TE.DATA.ERAS[i % 4];
        chips[i % 4].classList.add('on');
        Sfx.tick();
        if (i >= steps && e === era) { finish(); return; }
        i++;
        setTimeout(roll, fast ? 70 : 60 + i * 12);
      };
      roll();
    }
    function finish() {
      if (done) return; done = true;
      const t = TE.teamOf(sq);
      $('.wheel-result', ov).innerHTML = `<b>${esc(t.name)}</b><span>${era === TE.DATA.CURRENT_ERA ? '2026 roster' : TE.DATA.ERA_LABEL[era]}</span>`;
      ov.classList.add('landed');
      Sfx.land(); buzz([15, 30, 15]);
      setTimeout(() => { ov.classList.add('out'); setTimeout(() => { ov.remove(); resolve(); }, 250); }, fast ? 450 : 900);
    }
    ov.addEventListener('click', () => { if (!eraStarted) afterWheel(); else if (!done) finish(); });
  });
}

// ================= MISC =================
function todayKey(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const LAUNCH = Date.UTC(2026, 9, 19);
function dailyNumber(key) { const [y, m, d] = key.split('-').map(Number); return Math.floor((Date.UTC(y, m - 1, d) - LAUNCH) / 864e5) + 1; }
function dailyStreak() {
  let n = 0;
  const d = new Date();
  if (!Store.data.daily[todayKey(d)]) d.setDate(d.getDate() - 1);
  while (Store.data.daily[todayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function b64urlEncode(obj) { return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64urlDecode(str) { try { return JSON.parse(decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/'))))); } catch (_) { return null; } }
const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
