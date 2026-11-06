'use strict';

const CACHE = 'media-shell-v4';
const LOCAL_COVERS = ["covers/126800.jpg", "covers/335152.jpg", "covers/77322.jpg", "covers/408753.jpg", "covers/484592.jpg", "covers/203681.jpg", "covers/74201.jpg"];
const SHELL = new Set([
  '',
  'index.html',
  'manifest.webmanifest',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable.png',
  ...LOCAL_COVERS,
]);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll([
        './',
        './index.html',
        './manifest.webmanifest',
        './icon.svg',
        './icon-192.png',
        './icon-512.png',
        './icon-maskable.png',
      ]).then(() => Promise.all(LOCAL_COVERS.map((p) =>
        // 封面是尽力而为：某张暂时取不到不能拖住整个 SW 升级，
        // 之后 networkFirst 会在页面访问时补进缓存。
        cache.add('./' + p).catch(() => null)
      ))))
      .then(() => self.skipWaiting())
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
  if (request.headers.get('authorization')) return;

  let url;
  try { url = new URL(request.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  const base = new URL('./', self.registration.scope).pathname;
  const rel = url.pathname.indexOf(base) === 0
    ? url.pathname.slice(base.length)
    : '';
  if (!SHELL.has(rel)) return;

  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (response && response.ok && response.type === 'basic') {
      await cache.put(request, response.clone());
    }
    return withManifestType(request, response);
  } catch (err) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return withManifestType(request, cached);
    if (request.mode === 'navigate') {
      const shell = (await caches.match('./index.html')) || (await caches.match('./'));
      if (shell) return shell;
    }
    throw err;
  }
}

function withManifestType(request, response) {
  if (!response) return response;
  const path = new URL(request.url).pathname;
  if (!path.endsWith('.webmanifest')) return response;
  const headers = new Headers(response.headers);
  const type = headers.get('content-type') || '';
  if (type.includes('json') || type.includes('manifest')) return response;
  headers.set('Content-Type', 'application/manifest+json');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
