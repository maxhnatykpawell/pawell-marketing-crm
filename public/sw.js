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

/*
 * Пуш-сповіщення (Web Push).
 *
 * Якщо застосунок зараз відкритий і людина його бачить, системне сповіщення
 * зайве: повідомлення вже з'явилось у самому чаті. Показуємо його, лише коли
 * жодне вікно не видно (згорнуто, інша вкладка, екран заблоковано, застосунок закрито).
 * tag замінює попереднє сповіщення з тим самим tag, тож серія повідомлень з одного
 * чату не перетворюється на стос.
 */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : '' }; }

  const title = data.title || 'PAWELL';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag,
    renotify: !!data.tag,
    data: { url: data.url || '/' },
  };

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const seen = wins.some((w) => w.visibilityState === 'visible');
      if (seen) return;
      return self.registration.showNotification(title, options);
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (wins) => {
      const existing = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        // Перехід на потрібний розділ: застосунок читає його з адреси
        if ('navigate' in existing) { try { await existing.navigate(target); } catch { /* лишаємось де були */ } }
        return;
      }
      return self.clients.openWindow(target);
    }),
  );
});
