'use strict';

const CACHE = 'md-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './sw.js',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type === 'basic' && !response.redirected) {
        await cache.put(request, response.clone());
      }
      return withManifestType(request, response);
    } catch (err) {
      const cached = await matchCached(request);
      if (cached) return withManifestType(request, cached);
      throw err;
    }
  })());
});

async function matchCached(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  if (request.mode === 'navigate') {
    return (await caches.match('./index.html')) || (await caches.match('./'));
  }
  const url = new URL(request.url);
  if (url.pathname.endsWith('/')) {
    return caches.match(new URL('index.html', url).href);
  }
  return undefined;
}

function withManifestType(request, response) {
  if (!response) return response;
  const path = new URL(request.url).pathname;
  if (!path.endsWith('.webmanifest')) return response;
  const headers = new Headers(response.headers);
  const type = headers.get('content-type') || '';
  if (type.includes('json')) return response;
  headers.set('Content-Type', 'application/manifest+json');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
