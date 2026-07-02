const CACHE_NAME = 'warehouse-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/writeoff.html',
  '/admin.html',
  '/admin-writeoffs.html',
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
  '/js/qrcode.min.js'
];

// Установка: кэшируем все основные файлы
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Стратегия "сначала кэш, потом сеть"
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request).then((response) => {
        // Кэшируем новые запросы (кроме API)
        if (event.request.url.includes('/api/') === false) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      });
    })
  );
});

// Очистка старых кэшей при активации
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    })
  );
});
