'use strict';

const CACHE = 'apps-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './sw.js',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable.png',
  './data.json',
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
  const url = new URL(request.url);
  const isData = url.pathname.endsWith('/data.json') || url.pathname.endsWith('data.json');

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (isData) {
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response && response.ok) await cache.put(request, response.clone());
        return response;
      } catch (err) {
        const cached = await cache.match(request, { ignoreSearch: true });
        if (cached) return cached;
        throw err;
      }
    }
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
