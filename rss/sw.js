'use strict';
// 只缓存本工具自己的文件；订阅源、代理、图片等跨站请求直接放行，不进缓存。
// 文章内容由页面存进 IndexedDB，断网时照样能读。
const CACHE = 'rss-v9';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './sw.js', './icon.svg', './icon-192.png', './icon-512.png', './icon-maskable.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic' && !res.redirected) await cache.put(req, res.clone());
      return withManifestType(req, res);
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return withManifestType(req, hit);
      if (req.mode === 'navigate') {
        const shell = (await caches.match('./index.html')) || (await caches.match('./'));
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
function withManifestType(req, res) {
  if (!res || !new URL(req.url).pathname.endsWith('.webmanifest')) return res;
  const h = new Headers(res.headers);
  if ((h.get('content-type') || '').includes('json')) return res;
  h.set('Content-Type', 'application/manifest+json');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
