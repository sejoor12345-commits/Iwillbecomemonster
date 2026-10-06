// 서비스 워커: 앱 파일을 폰에 보관해서 인터넷 없이도 열리게 함
//   방식: 보관된 파일을 바로 보여 주고(빠름), 인터넷이 되면 뒤에서 새 버전으로 갈아 둠
//   → 코드를 고쳐 배포하면 "한 번 더 열 때" 새 버전이 보여요
const CACHE = "iwbm-v0.4b-2";
const FILES = ["./", "index.html", "style.css", "exercises.js", "app.js", "manifest.webmanifest",
               "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(event.request);
    const fresh = fetch(event.request).then(response => {
      if (response.ok) cache.put(event.request, response.clone());
      return response;
    }).catch(() => cached);
    return cached || fresh;
  }));
});
