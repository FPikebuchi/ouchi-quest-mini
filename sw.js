// Bump VERSION when changing published app files.
const VERSION = 'ouchi-mini-v3';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './model.js', './store.js', './icon.svg', './icon-192.png', './icon-512.png', './manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })))));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('ouchi-mini-') && k !== VERSION).map(k => caches.delete(k)))));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(VERSION).then(async cache => {
    const cached = await cache.match(event.request);
    return cached || fetch(event.request);
  }));
});
