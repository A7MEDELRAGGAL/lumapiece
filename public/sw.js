const CACHE = 'lumapiece-v1';
const IMAGE_HOSTS = new Set(['images.unsplash.com']);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  if (url.origin === self.location.origin || IMAGE_HOSTS.has(url.hostname)) {
    event.respondWith(cacheFirst(request));
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok || response.type === 'opaque') {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const shell = await caches.match('/index.html');
    if (shell) return shell;
    throw error;
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const shell = await caches.match('/index.html');
    if (shell) return shell;
    throw error;
  }
}
