// 오프라인에서도 앱이 열리도록 화면 파일을 저장하고, 공고 데이터는 항상 최신을 먼저 받아옵니다.
const CACHE = 'woorizip-v2';
const SHELL = ['./', 'index.html', 'app.js', 'engine.js', 'style.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // 네트워크 우선 → 실패 시 저장본
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        const key = url.pathname.endsWith('data.enc.json') ? 'data.enc.json' : e.request;
        caches.open(CACHE).then((c) => c.put(key, copy));
      }
      return res;
    }).catch(() => caches.match(url.pathname.endsWith('data.enc.json') ? 'data.enc.json' : e.request, { ignoreSearch: true }))
  );
});
