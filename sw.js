// Service worker for Casa Garza (Quick Entry / Capture / Buying).
//
// What this does: caches the app "shell" (the HTML/CSS/JS/icons/fonts that
// make up the interface itself) so the app opens instantly even with no
// signal -- you can browse past entries, fill in fields, and queue photos
// while offline.
//
// What this deliberately does NOT do: cache calls to the Apps Script Web
// App (identifyFromPhoto / researchItem / nextSku / saving rows). Those
// need to actually reach Gemini and your Sheet, so they always go straight
// to the network, cache or no cache. An "offline AI" is not a real thing --
// this only makes the app itself available offline, not the AI calls.
//
// CACHE_VERSION: bump this string any time app.html/CSS/JS meaningfully
// changes, so returning visitors get the new version instead of a stale
// cached one. Easiest approach: change the date each time you deploy.
const CACHE_VERSION = 'casa-garza-v16';

const SHELL_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only ever intervene on GET requests -- a shell-caching service worker
  // has no business touching anything else, and the Cache API actively
  // rejects a non-GET request/response pair (cache.put() throws
  // "Request method 'POST' is unsupported"). Without this check, every
  // successful Cloudinary photo upload (a POST) reached the line below
  // that tries to cache its response and threw there -- harmlessly to the
  // upload itself (the real response had already been returned to the
  // page by then), but as a genuine unhandled error inside the service
  // worker on every single photo saved. This one check also covers any
  // future POST-based third-party call without needing to list its
  // hostname here individually, the way the Apps Script exclusion below
  // has to.
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never intercept calls to Google's Apps Script Web App or Google Fonts'
  // dynamic CSS -- those must always hit the real network. Google Fonts'
  // font FILES (fonts.gstatic.com) are safe and useful to cache since they
  // never change once fetched; only the fonts.googleapis.com stylesheet
  // (which can vary) is excluded here to be safe.
  if (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('script.googleusercontent.com') ||
    url.hostname === 'fonts.googleapis.com'
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
        });
    })
  );
});
