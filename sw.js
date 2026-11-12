// MEO Notes service worker: lets the app open offline.
// Only the app's own files are cached here. Notes are never sent anywhere.
const VERSION = 'meo-app-v3';
const CORE = ['./', 'index.html', 'app.css', 'js/app.js', 'js/crypto.js', 'js/db.js', 'js/text.js', 'js/tts.js', 'js/sync.js', 'voices.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'fonts/jetbrains-mono-latin-400-normal.woff2', 'fonts/jetbrains-mono-latin-ext-400-normal.woff2',
  'workers/piper-worker.js', 'workers/gz-fetch.js', 'vendor/ort/ort.wasm.min.js', 'vendor/ort/ort-wasm-simd-threaded.mjs', 'vendor/ort/ort-wasm-simd-threaded.wasm.gz',
  'vendor/piper/piper_phonemize.js', 'vendor/piper/piper_phonemize.wasm.gz', 'vendor/piper/piper_phonemize.data.gz'];
// Big, rarely-changing files: serve from cache first.
const HEAVY = /\/(vendor|workers|fonts|icons)\//;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('meo-app-') && k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (HEAVY.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  // App code: network first so updates show up, cache when offline.
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || caches.match('index.html'))));
});
