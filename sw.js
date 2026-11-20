// Bump this version number every time you update your HTML/CSS/JS!
const CACHE_NAME = 'trip-calc-cache-v58';
const REPO_NAME = new URL(self.registration.scope).pathname.replace(/\/$/, '') || '';
const ALLOWED_FONT_ORIGINS = new Set([
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com'
]);

// ONLY put guaranteed local files here. Do NOT put external CDNs here.
const localUrlsToCache = [
  `${REPO_NAME}/`,
  `${REPO_NAME}/index.html`,
  `${REPO_NAME}/manifest.json`,
  `${REPO_NAME}/icon-192.png`,
  `${REPO_NAME}/icon-512.png`,
  `${REPO_NAME}/css/styles.css`,
  `${REPO_NAME}/vendor/quill.snow.css`,
  `${REPO_NAME}/vendor/purify.min.js`,
  `${REPO_NAME}/vendor/quill.js`,
  `${REPO_NAME}/vendor/supabase.min.js`,
  `${REPO_NAME}/js/config.js`,
  `${REPO_NAME}/js/security.js`,
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

// 3. Network-First (with fast timeout) for same-origin static files; Stale-While-Revalidate ONLY for allowlisted font origins.
// All API calls (Supabase, custom-domain Supabase, live exchange rates, non-GET) bypass the cache completely.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') {
    return;
  }

  let requestUrl;
  try {
    requestUrl = new URL(event.request.url);
  } catch (e) {
    return;
  }

  if (requestUrl.protocol !== 'http:' && requestUrl.protocol !== 'https:') {
    return;
  }

  const isSameOrigin = requestUrl.origin === self.location.origin;
  if (isSameOrigin) {
    event.respondWith((async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      try {
        const networkResponse = await fetch(event.request, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (networkResponse && networkResponse.ok && networkResponse.type === 'basic') {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (err) {
        clearTimeout(timeoutId);
        const cachedResponse = await caches.match(event.request);
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

  if (!ALLOWED_FONT_ORIGINS.has(requestUrl.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.ok) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });
      if (cachedResponse) {
        fetchPromise.catch(() => {});
        return cachedResponse;
      }
      return fetchPromise;
    })
  );
});
