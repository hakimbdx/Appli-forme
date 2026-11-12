// Service worker : fonctionnement hors ligne (réseau d'abord, cache en secours)
const CACHE = 'appli-forme-v9';
const ASSETS = ['./', 'index.html', 'styles.css', 'app.js', 'foods.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'lib/html5-qrcode.min.js',
  'bloodparser.js', 'labs.js', 'sport-data.js', 'coach.js', 'progression.js', 'progress-ui.js', 'sport.js', 'healthsync.js', 'sync.js', 'weekly.js', 'reports.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  // Uniquement les fichiers de l'appli (pas les requêtes Open Food Facts)
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
