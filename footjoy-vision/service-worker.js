// service-worker.js — offline shell for FootJoy Vision.
// Caches the app files so it opens offline. Never caches Supabase API/auth
// responses or any cross-origin request (those always hit the network).
const CACHE = 'fjv-shell-v1';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './db.js', './supabaseClient.js',
  './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // never cache writes
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;       // let Supabase + CDN hit the network
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
