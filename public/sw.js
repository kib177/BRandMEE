/*const CACHE_NAME = 'warehouse-dynamic-v1'; // Можно не менять, кэш будет обновляться автоматически

// Установка: ничего не кэшируем заранее, просто активируемся
self.addEventListener('install', event => {
  console.log('Service Worker: installing');
  self.skipWaiting();
});

// Активация: удаляем старые кэши, если они есть
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Стратегия "Сеть сначала, при неудаче — кэш" для всех запросов
self.addEventListener('fetch', event => {
  // Пропускаем запросы к API и другие не-GET запросы
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Для API оставляем только сеть (можно добавить fallback, если нужно)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request).catch(() => {
      return new Response(JSON.stringify({ error: 'Нет сети' }), { status: 503 });
    }));
    return;
  }

  // Статические файлы: сеть -> кэш -> офлайн-заглушка
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Если ответ успешный, клонируем и кладём в кэш
        if (networkResponse.ok) {
          const clonedResponse = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, clonedResponse);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Сеть недоступна — пытаемся отдать из кэша
        return caches.match(event.request).then(cachedResponse => {
          return cachedResponse || new Response('Офлайн - ресурс недоступен', { status: 408 });
        });
      })
  );
});*/
