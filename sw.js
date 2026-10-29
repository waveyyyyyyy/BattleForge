const CACHE = "battleforge-v2";
const ASSETS = ["/", "/index.html", "/styles.css", "/arena-redesign.css?v=20261029-3", "/interaction-performance.css?v=20261029-2", "/app.js?v=20261029-2", "/manifest.json"];
self.addEventListener("install", event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  await Promise.all(ASSETS.map(async asset => { try { await cache.add(asset); } catch (error) { console.warn("Precache skipped:", asset, error); } }));
  await self.skipWaiting();
})()));
self.addEventListener("activate", event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith("battleforge-") && key !== CACHE).map(key => caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener("fetch", event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname === "/" || /\.(html|js|css)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const fresh = await fetch(request, { cache: "no-cache" });
        if (fresh && fresh.ok) cache.put(request, fresh.clone()).catch(() => {});
        return fresh;
      } catch (error) {
        const cached = await cache.match(request) || await cache.match(url.pathname);
        if (cached) return cached;
        throw error;
      }
    })());
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
});
