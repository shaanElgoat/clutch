'use strict';
// ADS: optional "watch an ad" rewards plus short ads between games. Everything here stays switched OFF
// (and invisible to players) until ADS_PROVIDER is set after the ad account is approved.
//
//   ADS_PROVIDER = 'h5'  -> Google H5 Games Ads (AdSense for web games); set ADS_CLIENT to 'ca-pub-…'
//   ADS_PROVIDER = ''    -> off
//
// For testing on one phone without a real ad account, put  clutch_adtest=1  in localStorage:
// that shows a fake 5-second "ad" instead of a real one.
const ADS_PROVIDER = '';
const ADS_CLIENT = 'ca-pub-9444873763818491';
const AD_RULES = {
  freeGames: 3,          // new players see no between-game ads for their first few games
  gapMs: 5 * 60 * 1000,  // at most one between-game ad every 5 minutes
  packsPerDay: 3,        // "watch an ad, get a free Standard pack" limit
};

const Ads = {
  loaded: false,
  test: () => { try { return localStorage.getItem('clutch_adtest') === '1'; } catch (_) { return false; } },
  on: () => !!ADS_PROVIDER || Ads.test(),
  kid: () => Store.data.ageBand === 'u13',
  // load the provider's script once (only when ads are on)
  init() {
    if (!Ads.on() || Ads.loaded) return;
    Ads.loaded = true;
    if (ADS_PROVIDER === 'h5' && ADS_CLIENT) {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adBreak = window.adConfig = function (o) { window.adsbygoogle.push(o); };
      // under-13 players only ever get non-personalised ads
      if (Ads.kid()) window.adsbygoogle.requestNonPersonalizedAds = 1;
      if (document.querySelector('script[src*="adsbygoogle.js"]')) { window.adConfig({ preloadAdBreaks: 'on', sound: Store.data.sound ? 'on' : 'off' }); return; }
      const s = document.createElement('script');
      s.async = true; s.crossOrigin = 'anonymous';
      s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(ADS_CLIENT);
      s.setAttribute('data-ad-frequency-hint', Math.round(AD_RULES.gapMs / 1000) + 's');
      document.head.appendChild(s);
      window.adConfig({ preloadAdBreaks: 'on', sound: Store.data.sound ? 'on' : 'off' });
    }
  },
  // a "watch an ad for a reward" ad. Resolves true only if the player watched it to the end.
  rewarded(name) {
    if (!Ads.on()) return Promise.resolve(false);
    Ads.init();
    Track.ev('ad_reward_ask', name);
    if (!ADS_PROVIDER) return Ads.fake(name, true);
    return new Promise((resolve) => {
      let got = false, done = false;
      const end = (v) => { if (done) return; done = true; resolve(v); };
      window.adBreak({
        type: 'reward', name,
        beforeAd: () => Sfx.ctx && Sfx.ctx.suspend && Sfx.ctx.suspend(),
        afterAd: () => Sfx.ctx && Sfx.ctx.resume && Sfx.ctx.resume(),
        beforeReward: (showAdFn) => showAdFn(),
        adViewed: () => { got = true; },
        adDismissed: () => { got = false; },
        adBreakDone: (info) => { if (!got && info && info.breakStatus !== 'viewed') toast('No ad available right now. Try again later.'); end(got); },
      });
      setTimeout(() => end(got), 90000);
    }).then((v) => { if (v) Track.ev('ad_reward', name); return v; });
  },
  // a short ad at a natural break (after a game). Respects the rules above; never blocks the game.
  between(name) {
    if (!Ads.on()) return;
    const d = Store.data;
    d.adGames = (d.adGames || 0) + 1; Store.save();
    if (d.adGames <= AD_RULES.freeGames) return;
    if (Date.now() - (d.adLast || 0) < AD_RULES.gapMs) return;
    d.adLast = Date.now(); Store.save();
    Ads.init();
    Track.ev('ad_break', name);
    if (!ADS_PROVIDER) { Ads.fake(name, false); return; }
    window.adBreak({ type: 'next', name, beforeAd: () => Sfx.ctx && Sfx.ctx.suspend && Sfx.ctx.suspend(), afterAd: () => Sfx.ctx && Sfx.ctx.resume && Sfx.ctx.resume() });
  },
  // test mode: a fake ad overlay with a countdown (rewarded ones can be skipped = no reward)
  fake(name, reward) {
    return new Promise((resolve) => {
      const ov = document.createElement('div');
      ov.className = 'ad-fake';
      ov.innerHTML = `<div class="ad-box"><small>TEST AD · ${esc(name)}</small><b id="adn">5</b><span>${reward ? 'Watch to the end for your reward' : 'Your game continues after this'}</span><button class="btn small" id="adx">${reward ? 'Close (no reward)' : 'Skip'}</button></div>`;
      document.body.appendChild(ov);
      let n = 5;
      const t = setInterval(() => { n--; const b = ov.querySelector('#adn'); if (b) b.textContent = n; if (n <= 0) { clearInterval(t); ov.remove(); resolve(true); } }, 1000);
      ov.querySelector('#adx').addEventListener('click', () => { clearInterval(t); ov.remove(); resolve(false); });
    });
  },
  // free Standard packs from ads: how many are left today
  packsLeft() { const a = Store.data.adPacks || {}; return a.day === todayKey() ? Math.max(0, AD_RULES.packsPerDay - a.n) : AD_RULES.packsPerDay; },
  async freePack(after) {
    if (!Ads.packsLeft()) return;
    if (!(await Ads.rewarded('free_pack'))) return;
    const d = Store.data, a = d.adPacks && d.adPacks.day === todayKey() ? d.adPacks : { day: todayKey(), n: 0 };
    a.n++; d.adPacks = a;
    Obj.data().packs.push('std'); Store.save();
    Sfx.achievement(); toast('Free Standard pack added!');
    if (after) after();
  },
};

// the one-time age question (only once ads are switched on), so under-13s get kid-safe ads
function adsAgeCheck() {
  if (!Ads.on() || Store.data.ageBand) { Ads.init(); return; }
  setTimeout(() => {
    if (document.querySelector('.modal-bg') || document.querySelector('.coach')) { setTimeout(adsAgeCheck, 5000); return; }
    modal(`<div class="center"><div class="intro-ic" style="margin:0 auto 10px;background:linear-gradient(135deg,#5b8cff,#2f5ef0)">${ico('user', 26)}</div>
      <h2 class="d">How old are you?</h2><p class="mute" style="font-weight:600">So we can show the right kind of ads. We only ask once.</p></div>
      <div class="age-opts">${[['u13', 'Under 13'], ['13', '13–17'], ['18', '18 or older']].map(([k, l]) => `<button class="btn" data-age="${k}">${l}</button>`).join('')}</div>`, (bg) => {
      $$('[data-age]', bg).forEach((b) => b.addEventListener('click', () => { Store.data.ageBand = b.dataset.age; Store.save(); Track.ev('age_band', b.dataset.age); bg.remove(); Ads.init(); }));
    }, 'sheet');
  }, 2500);
}
