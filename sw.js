// Service worker:
// 1. Keeps the whole app (and the 9 MB llama.cpp WebAssembly runtime) on the device, so it opens offline.
//    The model weights themselves are cached separately by wllama, in the Origin Private File System.
// 2. Adds cross-origin isolation headers, which static hosts like GitHub Pages cannot set.
//    That unlocks SharedArrayBuffer, which lets llama.cpp use every CPU core.

const VERSION = 'ouija-v2';
const SHELL = [
  './',
  'index.html',
  'app.css',
  'manifest.webmanifest',
  'js/main.js',
  'js/engine.js',
  'js/board.js',
  'js/spirits.js',
  'js/sound.js',
  'vendor/wllama/index.js',
  'vendor/wllama/wasm/wllama.wasm',
  'fonts/fell.woff2',
  'fonts/fell-italic.woff2',
  'fonts/fell-sc.woff2',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

function isolate(res) {
  if (!res || res.status === 0 || res.type === 'opaque') return res;
  const h = new Headers(res.headers);
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Cross-Origin-Embedder-Policy', 'require-corp');
  h.set('Cross-Origin-Resource-Policy', 'same-origin');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Only the app itself. Model downloads (Hugging Face) go straight to the network and wllama's own cache.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const key = req.mode === 'navigate' ? 'index.html' : req;
    const immutable = /\/(vendor|fonts|icons)\//.test(url.pathname);
    if (immutable) {
      // The 9 MB runtime and fonts never change under the same path: answer from the device.
      const hit = await cache.match(key);
      if (hit) return isolate(hit);
    }
    // App code: network first so updates land at once, the device copy when offline.
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(key, res.clone());
      return isolate(res);
    } catch {
      const hit = await cache.match(key, { ignoreSearch: true });
      return isolate(hit || new Response('Offline, and this was never cached.', { status: 503 }));
    }
  })());
});
