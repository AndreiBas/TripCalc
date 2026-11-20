// Bump this version number every time you update your HTML/CSS/JS!
const CACHE_NAME = 'trip-calc-cache-v56'; 
const REPO_NAME = new URL(self.registration.scope).pathname.replace(/\/$/, '') || '';

// ONLY put guaranteed local files here. Do NOT put external CDNs here.
const localUrlsToCache = [
  `${REPO_NAME}/`,
  `${REPO_NAME}/index.html`,
  `${REPO_NAME}/manifest.json`,
  `${REPO_NAME}/icon-192.png`,
  `${REPO_NAME}/icon-512.png`,
  `${REPO_NAME}/css/styles.css`,
  `${REPO_NAME}/js/config.js`,
  `${REPO_NAME}/js/state.js`,
  `${REPO_NAME}/js/history.js`,
  `${REPO_NAME}/js/db.js`,
  `${REPO_NAME}/js/currency.js`,
  `${REPO_NAME}/js/calculator.js`,
  `${REPO_NAME}/js/calendar.js`,
  `${REPO_NAME}/js/export.js`,
  `${REPO_NAME}/js/notes.js`,
  `${REPO_NAME}/js/ui.js`,
  `${REPO_NAME}/js/app.js`
];

// 1. Install & Cache Local Files Immediately
self.addEventListener('install', event => {
  self.skipWaiting(); // Force the waiting service worker to become the active service worker.
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.all(
        localUrlsToCache.map(url =>
          fetch(url, { cache: 'reload' }).then(res => {
            if (!res || !res.ok) throw new Error(`Failed to precache ${url}`);
            return cache.put(url, res);
          })
        )
      );
    })
  );
});

// 2. Clean Up Old Caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim(); // Take control of all pages immediately.
});

// 3. Network-First (with fast timeout) for local app files; Stale-While-Revalidate for external CDNs
self.addEventListener('fetch', event => {
  // Never try to cache Supabase database calls or live exchange rate API responses
  if (event.request.url.includes('supabase.co') || event.request.url.includes('currency-api')) {
    return;
  }

  let requestUrl;
  try {
    requestUrl = new URL(event.request.url);
  } catch (e) {
    return;
  }

  const isSameOriginGet = requestUrl.origin === self.location.origin && event.request.method === 'GET';
  if (isSameOriginGet) {
    event.respondWith((async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      try {
        const networkResponse = await fetch(event.request, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (networkResponse && networkResponse.status === 200) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (err) {
        clearTimeout(timeoutId);
        const cachedResponse = await caches.match(event.request, { ignoreSearch: true });
        if (cachedResponse) {
          return cachedResponse;
        }
        if (event.request.mode === 'navigate') {
          return caches.match(`${REPO_NAME}/index.html`);
        }
        throw err;
      }
    })());
    return;
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(cachedResponse => {
      if (cachedResponse) {
        fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, networkResponse.clone());
            });
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });
    })
  );
});
