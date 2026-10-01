// Cache de l'application pour qu'elle s'ouvre même sans réseau (glossaire et notes hors-ligne).
const CACHE = "darija-dental-v1";
const ASSETS = [
  "./", "index.html", "css/style.css", "manifest.webmanifest", "icon.svg",
  "js/app.js", "js/claude.js", "js/speech.js", "js/storage.js", "js/glossary.js", "js/markdown.js",
  "js/vendor/anthropic-sdk-0.131.0.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(ASSETS.map((a) => c.add(a)))));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// Network first (to get updates), cache as fallback. API calls are never cached.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.hostname === "api.anthropic.com") return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
