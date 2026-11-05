'use strict';
// ACCOUNTS: email + password sign-in (Firebase Auth) with your progress backed up to the cloud, so a
// new phone or a reinstall picks up where you left off. Signing in is required once AUTH_KEY is set.
// Setup: Firebase console > Authentication > enable Email/Password, then paste the project's Web API key.
const AUTH_KEY = '';
const AUTH_DB = 'https://clutch-98557-default-rtdb.firebaseio.com';
const AUTH_ERR = {
  EMAIL_EXISTS: 'That email already has an account. Sign in instead.',
  EMAIL_NOT_FOUND: 'No account with that email.',
  INVALID_PASSWORD: 'Wrong password.',
  INVALID_LOGIN_CREDENTIALS: 'Wrong email or password.',
  INVALID_EMAIL: "That email doesn't look right.",
  WEAK_PASSWORD: 'Use at least 6 characters for your password.',
  MISSING_PASSWORD: 'Enter a password.',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many tries. Wait a minute and try again.',
  USER_DISABLED: 'This account has been disabled.',
  CREDENTIAL_TOO_OLD_LOGIN_AGAIN: 'Please sign in again first.',
};

const Account = {
  user: null, timer: null, busy: false,
  enabled: () => !!AUTH_KEY,
  load() { try { Account.user = JSON.parse(localStorage.getItem('clutch_auth')) || null; } catch (_) { Account.user = null; } return Account.user; },
  keep() { try { if (Account.user) localStorage.setItem('clutch_auth', JSON.stringify(Account.user)); else localStorage.removeItem('clutch_auth'); } catch (_) {} },
  async call(path, body) {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${path}?key=${AUTH_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const code = ((j.error && j.error.message) || 'ERROR').split(' ')[0].split(':')[0]; throw new Error(AUTH_ERR[code] || 'Something went wrong (' + code + ').'); }
    return j;
  },
  set(j, extra) {
    Account.user = Object.assign({}, Account.user || {}, { uid: j.localId || j.user_id, email: j.email || (Account.user && Account.user.email), token: j.idToken || j.id_token, refresh: j.refreshToken || j.refresh_token, exp: Date.now() + (+(j.expiresIn || j.expires_in || 3600) - 120) * 1000 }, extra || {});
    Account.keep();
  },
  // a fresh ID token (they last an hour)
  async token() {
    const u = Account.user; if (!u) return null;
    if (Date.now() < u.exp) return u.token;
    const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${AUTH_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(u.refresh) });
    if (!r.ok) return null;
    Account.set(await r.json());
    return Account.user.token;
  },
  url: (t) => `${AUTH_DB}/users/${Account.user.uid}/save.json?auth=${t}`,
  async pull() {
    const t = await Account.token(); if (!t) return null;
    const r = await fetch(Account.url(t)); if (!r.ok) return null;
    const s = await r.json(); if (!s) return null;
    try { return JSON.parse(s); } catch (_) { return null; }
  },
  async push() {
    clearTimeout(Account.timer); Account.timer = null;
    if (!Account.user) return;
    const t = await Account.token(); if (!t) return;
    await fetch(Account.url(t), { method: 'PUT', body: JSON.stringify(JSON.stringify(Store.data)) }).catch(() => {});
  },
  // every local save also backs up to the cloud, at most every 15s
  queue() { if (Account.user && !Account.timer) Account.timer = setTimeout(() => Account.push(), 15000); },
  async signUp(email, pass, name) {
    const j = await Account.call('signUp', { email, password: pass, returnSecureToken: true });
    Account.set(j);
    if (name) { Store.data.name = name.slice(0, 14); Store.save(); }
    await Account.push();
  },
  async signIn(email, pass) {
    const j = await Account.call('signInWithPassword', { email, password: pass, returnSecureToken: true });
    Account.set(j);
    // the cloud save wins unless this phone has more progress on it
    const cloud = await Account.pull();
    if (cloud && (cloud.xp || 0) >= (Store.data.xp || 0)) { localStorage.setItem(Store.key, JSON.stringify(cloud)); Store.load(); }
    else await Account.push();
  },
  reset: (email) => Account.call('sendOobCode', { requestType: 'PASSWORD_RESET', email }),
  async signOut() {
    await Account.push();
    Account.user = null; Account.keep();
    try { localStorage.removeItem(Store.key); } catch (_) {}
    location.reload();
  },
  async remove() {
    const t = await Account.token();
    if (!t) throw new Error('Please sign in again first.');
    await fetch(Account.url(t), { method: 'DELETE' }).catch(() => {});
    await Account.call('delete', { idToken: t });
    Account.user = null; Account.keep();
    try { localStorage.removeItem(Store.key); } catch (_) {}
    location.reload();
  },
};
// back up whenever the game saves, and when the app is closed or hidden
(function () {
  const save = Store.save;
  Store.save = function () { save.call(Store); Account.queue(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && Account.timer) Account.push(); });
})();

// the sign-in screen (no tab bar: you can't get past it without an account)
function AuthScreen(onDone, mode) {
  mode = mode || 'up';
  const up = mode === 'up';
  const el = go(`
    <div class="auth">
      <div class="auth-logo">${helmet('#2f5ef0', '#ffc531')}</div>
      <h1 class="d center" style="margin:6px 0 2px">CLUTCH</h1>
      <p class="mute center" style="font-weight:700;margin:0 0 18px">${up ? 'Create your account to start playing. Your progress is saved to it, on any phone.' : 'Welcome back. Sign in to pick up where you left off.'}</p>
      <div class="seg two" style="margin:0 0 14px"><button class="${up ? 'on' : ''}" data-m="up">Create account</button><button class="${up ? '' : 'on'}" data-m="in">Sign in</button></div>
      <form id="f" class="auth-form" autocomplete="on">
        ${up ? `<label>GM name<input class="field" id="nm" maxlength="14" autocomplete="nickname" value="${esc(Store.data.name || '')}" placeholder="What should we call you?"></label>` : ''}
        <label>Email<input class="field" id="em" type="email" autocomplete="email" inputmode="email" required></label>
        <label>Password<input class="field" id="pw" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" minlength="6" required placeholder="${up ? 'At least 6 characters' : ''}"></label>
        <p class="auth-msg" id="msg"></p>
        <button class="btn primary big" id="go" type="submit">${up ? 'Create account' : 'Sign in'}</button>
        ${up ? '' : '<button class="btn small" id="forgot" type="button" style="margin-top:6px">Forgot password?</button>'}
      </form>
      <p class="mute center" style="font-size:11.5px;font-weight:600;margin-top:16px">We only use your email to sign you in and reset your password.</p>
    </div>`);
  $$('[data-m]', el).forEach((b) => b.addEventListener('click', () => AuthScreen(onDone, b.dataset.m)));
  const msg = (t, ok) => { const m = $('#msg', el); m.textContent = t || ''; m.style.color = ok ? 'var(--mint)' : 'var(--red)'; };
  $('#f', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    if (Account.busy) return;
    const em = $('#em', el).value.trim(), pw = $('#pw', el).value, nm = up ? $('#nm', el).value.trim() : '';
    if (up && !nm) { msg('Pick a GM name.'); return; }
    Account.busy = true; $('#go', el).disabled = true; msg('');
    try {
      if (up) await Account.signUp(em, pw, nm); else await Account.signIn(em, pw);
      Sfx.good(); toast(up ? 'Account created' : 'Signed in');
      onDone();
    } catch (err) { msg(err.message || 'Could not connect. Check your internet.'); Sfx.bad(); }
    Account.busy = false; const g = $('#go', el); if (g) g.disabled = false;
  });
  const fg = $('#forgot', el);
  if (fg) fg.addEventListener('click', async () => {
    const em = $('#em', el).value.trim();
    if (!em) { msg('Type your email above first.'); return; }
    try { await Account.reset(em); msg('Check your email for a reset link.', true); } catch (err) { msg(err.message); }
  });
  return el;
}

// the account box on the Me tab
function accountBox() {
  if (!Account.enabled() || !Account.user) return '';
  return `<div class="section-title">Account</div>
    <div class="group"><div class="lrow" style="cursor:default"><div class="mc-ic blue">${ico('user', 20)}</div><div class="grow"><b>${esc(Account.user.email || '')}</b><small>Progress backed up to your account</small></div></div></div>
    <div class="actions two" style="margin-top:8px"><button class="btn" id="signout">Sign out</button><button class="btn" id="delacct" style="color:var(--red)">Delete account</button></div>`;
}
function wireAccountBox(el) {
  const so = $('#signout', el), da = $('#delacct', el);
  if (so) so.addEventListener('click', () => modal(`<h2 class="d">Sign out?</h2><p>Your progress is saved to your account. Sign back in any time to get it back.</p><div class="actions two"><button class="btn" data-close>Cancel</button><button class="btn primary" id="ok">Sign out</button></div>`, (bg) => { $('#ok', bg).addEventListener('click', () => Account.signOut()); }));
  if (da) da.addEventListener('click', () => modal(`<h2 class="d">Delete your account?</h2><p>This permanently deletes your account and all your progress: cards, coins, records. It can't be undone.</p><p class="auth-msg" id="dm"></p><div class="actions two"><button class="btn" data-close>Keep it</button><button class="btn hot" id="ok">Delete forever</button></div>`, (bg) => {
    $('#ok', bg).addEventListener('click', async () => { try { await Account.remove(); } catch (err) { $('#dm', bg).textContent = err.message + ' Sign out and back in, then try again.'; } });
  }));
}
