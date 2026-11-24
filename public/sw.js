/*
 * Service worker: щоб застосунок ставився на головний екран і відкривався,
 * навіть коли зв'язок зник (оболонка), — без ризику показувати застарілу версію.
 *
 * Правила свідомо прості:
 *  - /api та /uploads НЕ кешуємо ніколи: дані завжди свіжі, а офлайн-чергу змін
 *    вже веде сам застосунок (fetchWithOfflineQueue).
 *  - Сторінка (HTML): спершу мережа, і лише без мережі — збережена копія.
 *    Тож після деплою люди одразу отримують нову версію.
 *  - /assets/* (файли з хешем у назві, незмінні): спершу кеш.
 */
const CACHE = 'pawell-shell-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  // Навігація: мережа → кеш
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/').then((r) => r || Response.error())),
    );
    return;
  }

  // Незмінні збірні файли: кеш → мережа
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        });
      }),
    );
  }
});
