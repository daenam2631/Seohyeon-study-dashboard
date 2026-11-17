/* ══════════════════════════════════════════════════════════════
   서현’s 공부 대시보드 · 오프라인 PWA Service Worker
   - 같은 주소(html·manifest·icon)는 캐시해서 인터넷이 없어도 열리게
   - 구글 시트(CSV)·GAS·폰트 같은 외부 요청은 손대지 않고 네트워크로만
   ══════════════════════════════════════════════════════════════ */
const CACHE_NAME = 'seohyeon-study-v3-pwa-1';

/* 설치할 때 미리 담아 둘 파일들 (모두 이 앱 폴더 기준 상대 경로) */
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

/* 설치: 프리캐시 → 바로 새 버전으로 교체(skipWaiting) */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(PRECACHE_URLS.map(async (url) => {
      try {
        /* cache: 'reload' 로 예전 HTTP 캐시가 아닌 새 파일을 받아 둔다 */
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (res && (res.ok || res.type === 'opaque')) await cache.put(url, res);
      } catch (e) {
        /* 한 파일이 실패해도 나머지는 담는다 */
      }
    }));
    await self.skipWaiting();
  })());
});

/* 활성화: 이전 버전 캐시 정리 → 새 페이지를 바로 제어(clients.claim) */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* 페이지에서 새 버전 적용을 요청할 때 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* 네트워크 우선 → 실패하면 캐시 (페이지 이동/새로고침용) */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const cached = (await cache.match(request)) ||
                   (await cache.match('./index.html')) ||
                   (await cache.match('./'));
    if (cached) return cached;
    throw e;
  }
}

/* 캐시 먼저 보여 주고, 뒤에서 최신 파일로 조용히 갱신 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request).then((res) => {
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  /* POST 등은 건드리지 않는다 (GAS 기록 전송 포함) */
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  /* 구글 시트 CSV·GAS·폰트 등 외부 주소는 네트워크로만 보낸다.
     오프라인이면 브라우저가 알아서 실패하고, 앱은 기기 저장 기록으로 보여 준다. */
  if (url.origin !== self.location.origin) return;

  /* 페이지 이동(새로고침·앱 실행)은 네트워크 우선, 오프라인이면 캐시 */
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }

  /* manifest·아이콘·sw.js 등은 캐시 우선 + 뒤에서 갱신 */
  event.respondWith(staleWhileRevalidate(req));
});
