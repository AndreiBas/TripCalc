// Bump this version number every time you update your HTML/CSS/JS!
const CACHE_NAME = 'trip-calc-cache-v46'; 
const REPO_NAME = '/TripCalc';

// ONLY put guaranteed local files here. Do NOT put external CDNs here.
const localUrlsToCache = [
  `${REPO_NAME}/`,
  `${REPO_NAME}/index.html`,
  `${REPO_NAME}/manifest.json`,
  `${REPO_NAME}/css/styles.css`,
  `${REPO_NAME}/js/config.js`,
  `${REPO_NAME}/js/state.js`,
  `${REPO_NAME}/js/history.js`,
  `${REPO_NAME}/js/db.js`,
  `${REPO_NAME}/js/currency.js`,
  `${REPO_NAME}/js/calculator.js`,
  `${REPO_NAME}/js/notes.js`,
  `${REPO_NAME}/js/pdf.js`,
  `${REPO_NAME}/js/ui.js`,
  `${REPO_NAME}/js/app.js`
];

// 1. Install & Cache Local Files Immediately
self.addEventListener('install', event => {
  self.skipWaiting(); // Force the waiting service worker to become the active service worker.
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(localUrlsToCache);
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

// 3. Stale-While-Revalidate Fetch Strategy
self.addEventListener('fetch', event => {
  // Never try to cache Supabase database calls
  if (event.request.url.includes('supabase.co')) {
    return;
  }

  event.respondWith(
    // ignoreSearch: true is critical. It ensures /TripCalc/?standalone=true still matches the cache
    caches.match(event.request, { ignoreSearch: true }).then(cachedResponse => {
      
      // IF IN CACHE: Return it instantly (bypassing Airplane WiFi lag).
      if (cachedResponse) {
        // Silently try to fetch a newer version in the background
        fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, networkResponse.clone());
            });
          }
        }).catch(() => {
           // Ignore background fetch errors (e.g., when actually offline)
        });
        
        return cachedResponse;
      }

      // IF NOT IN CACHE: (e.g., external CDNs loading for the first time)
      return fetch(event.request).then(networkResponse => {
        // Cache the external file dynamically so it's available offline next time
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(error => {
        // FINAL FALLBACK: If the network fails entirely, ensure the main page loads
        if (event.request.mode === 'navigate') {
          return caches.match(`${REPO_NAME}/index.html`);
        }
        throw error;
      });
    })
  );
});
