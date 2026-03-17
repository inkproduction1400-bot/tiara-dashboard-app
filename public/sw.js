// 白画面と旧 bundle 再利用を止めるため、Service Worker を停止して自己解除する。
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      await Promise.all(
        windowClients.map((client) => ("navigate" in client ? client.navigate(client.url) : null)),
      );
    })(),
  );
});
