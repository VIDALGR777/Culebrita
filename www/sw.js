/*
  Culebra: modo sin conexión.
  Con internet siempre carga la versión más nueva; sin internet usa la copia guardada.
  Si algún día cambias los archivos del juego, sube también este y cambia VERSION.
*/
const VERSION = 'culebra-v1';
const CORE = ['./', 'index.html', 'style.css', 'game.js', 'manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then(
          (hit) =>
            hit ||
            (req.mode === 'navigate' ? caches.match('./') : undefined) ||
            new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
        )
      )
  );
});
