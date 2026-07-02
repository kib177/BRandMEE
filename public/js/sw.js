const CACHE_NAME = 'warehouse-v2'; // увеличивайте версию при изменениях

// Ресурсы, которые нужно кэшировать при установке
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

// Установка: кэшируем статические файлы
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting()) // активировать сразу
  );
});

// Активация: удаляем старые кэши
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Стратегия: для статики – кэш, для API – сеть, для HTML – кэш с fallback на сеть
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Для API-запросов всегда пытаемся сеть, при неудаче – показать ошибку
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'Нет сети' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // Для HTML-страниц (навигация) – сначала сеть, при недоступности – кэш
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/index.html') // или event.request
      )
    );
    return;
  }

  // Для всех остальных статических ресурсов – сначала кэш, потом сеть
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(fetchResponse => {
        // Кэшируем новые статические файлы (кроме API)
        if (fetchResponse.ok && !url.pathname.startsWith('/api/')) {
          const responseClone = fetchResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        }
        return fetchResponse;
      });
    })
  );
});
