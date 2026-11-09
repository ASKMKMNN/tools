'use strict';

// 书影游助手网页版已下线。这个 Service Worker 只负责把旧版干净收掉：
// 注销自身、清掉本工具的离线缓存，之后所有请求直接走网络。
// 不触碰浏览器里存的数据。

self.addEventListener('install', function () {
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys()
            .then(function (keys) {
                return Promise.all(keys.filter(function (key) {
                    return key.indexOf('media-shell') === 0;
                }).map(function (key) {
                    return caches.delete(key);
                }));
            })
            .then(function () { return self.clients.claim(); })
            .then(function () { return self.registration.unregister(); })
    );
});

// 不注册 fetch 处理：旧页面不会再被从缓存里翻出来。
