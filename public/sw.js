// Minimal service worker: enables PWA installation and provides a small
// offline fallback for navigation requests. All data requests go to the
// network — this is an online-first internal application.
const CACHE = "lb-tasks-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Cache static assets (icons, Next.js build files) as they are fetched.
  const url = new URL(req.url);
  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".ico");

  if (isStatic) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              cache.put(req, res.clone());
              return res;
            })
        )
      )
    );
  }
});
