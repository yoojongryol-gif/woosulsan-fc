/* 웃을산 FC 서비스워커
 * 원칙: network-first + 버전 스탬프 캐시명.
 * (cache-first + 고정 캐시명 = "옛 화면 고착" 사고 전례 → 금지)
 */
const VERSION = 'v0.4.2';
const CACHE = `woosulsan-fc-${VERSION}`;
const PRECACHE = [
  './', './index.html', './styles.css', './app.js', './store.js', './balance.js',
  './tactics.js', './ai.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(PRECACHE.map((u) => c.add(new Request(u, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    await sweepOldCaches();
    await self.clients.claim();
  })());
});

async function sweepOldCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k !== CACHE && k.startsWith('woosulsan-fc-')).map((k) => caches.delete(k)));
}

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data?.type === 'VERSION') {
    e.source?.postMessage({ type: 'VERSION', version: VERSION });
    e.waitUntil?.(sweepOldCaches()); // 재적재 경합으로 남은 옛 캐시 정리
  }
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    try {
      const fresh = await fetch(req, { cache: 'no-store' });
      if (fresh && fresh.status === 200 && fresh.type === 'basic') {
        const c = await caches.open(CACHE);
        c.put(req, fresh.clone());
      }
      return fresh;
    } catch (err) {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      return new Response('오프라인입니다. 네트워크 연결 후 다시 열어 주세요.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  })());
});
