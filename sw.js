// 只缓存本应用自己的静态资源；Supabase 等跨域请求一律直连，绝不进缓存
const VERSION = 'v4-2026-10-30';
const CACHE = 'tq-' + VERSION;
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // 逐个 add，单个 404 不至于让整次安装失败
    await Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('tq-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 同步请求走网络，交给页面自己处理

  if (req.mode === 'navigate') {
    // 先网络拿新版，3 秒不回来就用缓存，弱网下也能打开
    e.respondWith((async () => {
      const net = fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy));
        }
        return res;
      });
      try {
        return await Promise.race([net, timeout(3000)]);
      } catch (err) {
        const hit = await caches.match('./index.html', { ignoreSearch: true });
        return hit || net.catch(() => new Response('离线且没有缓存，请联网后重试', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } }));
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    } catch (err) {
      return new Response('', { status: 504 });
    }
  })());
});
