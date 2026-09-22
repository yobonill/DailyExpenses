const CACHE_PREFIX = "daily-expenses-budget-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v15`;
const APP_ROOT = self.registration.scope;
const INDEX_URL = new URL("index.html", APP_ROOT).toString();
const STATIC_SHELL_URLS = [
  APP_ROOT,
  new URL("manifest.webmanifest", APP_ROOT).toString(),
  new URL("icons/icon-192.png", APP_ROOT).toString(),
  new URL("icons/icon-512.png", APP_ROOT).toString(),
  new URL("icons/icon-maskable-512.png", APP_ROOT).toString(),
  new URL("templates/Presupuesto-2026.xlsx", APP_ROOT).toString(),
];

const cacheResponse = async (cache, url, response) => {
  if (response && response.ok) await cache.put(url, response.clone());
};

const discoverBuildAssets = (html) => {
  const urls = new Set();
  const pattern = /(?:src|href)=["']([^"']+)["']/g;
  for (const match of html.matchAll(pattern)) {
    try {
      const url = new URL(match[1], INDEX_URL);
      if (url.origin === self.location.origin) urls.add(url.toString());
    } catch {
      // Ignore malformed/non-URL attributes.
    }
  }
  return [...urls];
};

const installOfflineShell = async () => {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(STATIC_SHELL_URLS.map(async (url) => {
    const response = await fetch(url, { cache: "reload" });
    if (!response.ok) throw new Error(`No se pudo preparar ${url} para uso sin conexión.`);
    await cacheResponse(cache, url, response);
  }));

  const indexResponse = await fetch(INDEX_URL, { cache: "reload" });
  if (!indexResponse.ok) throw new Error("No se pudo preparar index.html para uso sin conexión.");
  await cache.put(INDEX_URL, indexResponse.clone());
  const html = await indexResponse.text();
  const buildAssets = discoverBuildAssets(html);
  await Promise.all(buildAssets.map(async (url) => {
    const response = await fetch(url, { cache: "reload" });
    if (!response.ok) throw new Error(`No se pudo preparar ${url} para uso sin conexión.`);
    await cacheResponse(cache, url, response);
  }));
};

self.addEventListener("install", (event) => {
  event.waitUntil(installOfflineShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () =>
          (await caches.match(request))
          || (await caches.match(INDEX_URL))
          || (await caches.match(APP_ROOT))
          || Response.error(),
        ),
    );
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) {
      event.waitUntil(fetch(request).then(async (response) => {
        if (response.ok) await cacheResponse(await caches.open(CACHE_NAME), request, response);
      }).catch(() => undefined));
      return cached;
    }
    try {
      const response = await fetch(request);
      if (response.ok) await cacheResponse(await caches.open(CACHE_NAME), request, response);
      return response;
    } catch {
      return Response.error();
    }
  })());
});
