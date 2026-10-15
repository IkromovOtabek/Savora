/* Savora PWA service worker — sodda, xavfsiz offline qatlam. */
const CACHE = 'savora-v3';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icon.svg', '/icon-512.svg', '/icons/icon-192.png', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  // Bitta fayl yuklanmasa ham SW o'rnatilaversin (addAll — hammasi yoki hech narsa)
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Faqat shu domen; API/POST/GraphQL keshlanmaydi
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Sahifa navigatsiyasi — network-first, offline bo'lsa fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error()))
    );
    return;
  }

  // Next.js build chunklari — faqat tarmoq (kesh deploy'dan keyin webpack xatosiga olib keladi)
  if (url.pathname.startsWith('/_next/')) {
    event.respondWith(fetch(req));
    return;
  }

  // Rasm, shrift, ikonka — cache-first (hashsiz, kam o'zgaradi)
  if (/\.(?:woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          // Faqat muvaffaqiyatli javob keshlanadi (404/500 abadiy qolib ketmasin)
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => cached || Response.error());
      })
    );
  }
});
