// Service worker de app-shell + datos de catálogo (§4). Diseño nuevo — a
// diferencia de appgym (cuyo sw.js es solo de notificaciones y nunca
// implementó precaching de app-shell), esta app sí necesita offline total,
// pero su superficie es pequeña (~5 registros/día, sin timers).
//
// Las rutas de Next son hasheadas por build, así que no se puede precachear
// una lista fija de `/_next/static/*` — se cachean en tiempo de ejecución,
// la primera vez que se piden, con estrategia cache-first (son inmutables).

const CACHE_VERSION = "v1";
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DATA_CACHE = `data-${CACHE_VERSION}`;
const KNOWN_CACHES = [SHELL_CACHE, STATIC_CACHE, DATA_CACHE];

const SHELL_URLS = ["/hoy", "/manifest.json"];
const DATA_ROUTE_PREFIXES = ["/api/catalog", "/api/dishes", "/api/plan"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => Promise.allSettled(SHELL_URLS.map((u) => cache.add(u))))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KNOWN_CACHES.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Nunca interceptar escrituras — la durabilidad la garantiza el outbox
  // en IndexedDB (§4), no el service worker.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  } else if (DATA_ROUTE_PREFIXES.some((p) => url.pathname.startsWith(p))) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
  } else if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE));
  }
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) (await caches.open(cacheName)).put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached ?? network;
}

async function networkFirst(request, cacheName) {
  try {
    const res = await fetch(request);
    if (res.ok) (await caches.open(cacheName)).put(request, res.clone());
    return res;
  } catch {
    return (await caches.match(request)) ?? (await caches.match("/hoy"));
  }
}
