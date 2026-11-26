/**
 * sw.js — 오프라인용 서비스 워커
 *
 * ▶ 앱 파일을 고쳤다면 아래 CACHE_VERSION 숫자를 올려 주세요 (v1 → v2 …).
 *   그래야 아이폰에서 새 버전을 받아요.
 */
const CACHE_VERSION = 'v1';
const CACHE_NAME = `gym-tracker-${CACHE_VERSION}`;

const APP_FILES = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/progression.js',
  './js/storage.js',
  './js/defaults.js',
  './js/chart.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(APP_FILES.map((url) => new Request(url, { cache: 'reload' })))
    )
  );
  // 첫 설치일 때는 바로 활성화, 업데이트일 때는 앱에서 "업데이트" 버튼을 누르면 활성화
  if (!self.registration.active) self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('gym-tracker-') && k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch {
      if (req.mode === 'navigate') {
        const index = await cache.match('./index.html');
        if (index) return index;
      }
      return Response.error();
    }
  })());
});
