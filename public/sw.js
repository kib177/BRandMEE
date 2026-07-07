const STATIC_CACHE = 'warehouse-static-v3';
const API_CACHE = 'warehouse-api-v1';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/css/base.css',
  '/css/layout.css',
  '/css/components.css',
  '/css/utilities.css',
  '/css/mobile.css',
  '/js/utils.js',
  '/js/api.js',
  '/js/auth.js',
  '/js/filters.js',
  '/js/ui.js',
  '/js/import.js',
  '/js/export.js',
  '/js/modals.js',
  '/js/scanner.js',
  '/js/app.js',
  '/js/xlsx.full.min.js',
  '/js/html5-qrcode.min.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Установка: кэшируем статику
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Активация: удаляем старые кэши
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== STATIC_CACHE && key !== API_CACHE).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Обработка запросов
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API инвентаря и справочников: сеть с fallback на кэш
  if (url.pathname.startsWith('/api/inventory') || url.pathname.startsWith('/api/directories')) {
    event.respondWith(networkFirstWithCache(event.request));
    return;
  }

  // Остальные API (авторизация, списания) – только сеть
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'Нет сети' }), { status: 503 })
      )
    );
    return;
  }

  // Статические файлы: кэш с fallback на сеть
 event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(fetchResponse => {
        // Кэшируем только успешные GET-запросы
        if (fetchResponse.ok &&
            event.request.method === 'GET' &&   // <-- добавляем проверку
            !url.pathname.startsWith('/api/')) {
          const responseClone = fetchResponse.clone();
          caches.open(STATIC_CACHE).then(cache => cache.put(event.request, responseClone));
        }
        return fetchResponse;
      });
    })
  );
});

// Стратегия: сначала сеть, при неудаче – кэш
async function networkFirstWithCache(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const clone = networkResponse.clone();
      const cache = await caches.open(API_CACHE);
      cache.put(request, clone);
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      // Добавляем заголовок, чтобы клиент узнал о кэше
      const headers = new Headers(cachedResponse.headers);
      headers.set('X-Cache', 'HIT');
      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers
      });
    }
    return new Response(JSON.stringify({ error: 'Нет сети и нет кэша' }), { status: 503 });
  }
}

// Немедленная активация нового воркера
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
