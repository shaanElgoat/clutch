// CLUTCH service worker: app shell cached for offline play (online rooms still need a connection).
const CACHE = 'clutch-v27';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/data.js', 'js/engine.js', 'js/gameday.js', 'js/ui.js', 'js/draft.js', 'js/season.js', 'js/stats.js', 'js/modes.js', 'js/arena.js', 'js/daily.js', 'js/club.js', 'js/net.js', 'js/board.js', 'js/fun.js', 'js/app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !fonts) return;
  // network first for our own files (so updates land), cache fallback offline
  e.respondWith(fetch(req).then((res) => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((r) => r || caches.match('index.html'))));
});
