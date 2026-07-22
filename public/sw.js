const CACHE = 'crusher-psd-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      try {
        const res = await fetch(e.request);
        c.put(e.request, res.clone());
        return res;
      } catch {
        return (await c.match(e.request)) || Response.error();
      }
    })
  );
});
