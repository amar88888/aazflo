// Service worker minimal untuk Aazflo PWA.
// Tujuan: buat app "installable" + shell offline ringan.
// Data dinamik (dashboard, order) SENTIASA network-first — tak cache stale.

const CACHE = "aazflo-shell-v1";
const SHELL = ["/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Aset statik (icon/gambar) → cache-first. Selain tu → network-first.
  const isAsset = /\.(png|jpg|jpeg|svg|webp|ico|woff2?)$/.test(url.pathname);
  if (isAsset) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
    return;
  }
  e.respondWith(fetch(req).catch(() => caches.match(req)));
});
