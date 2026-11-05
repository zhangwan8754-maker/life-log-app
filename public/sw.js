// 只缓存 app 外壳；GitHub API 请求一律走网络（数据的离线能力由 app 自己的队列负责）
const CACHE = 'life-log-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './icon.svg'])))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  // 页面：网络优先，离线回退缓存；带 hash 的静态资源：缓存优先
  const isAsset = url.pathname.includes('/assets/')
  e.respondWith(
    (isAsset ? caches.match(e.request) : Promise.resolve(undefined)).then(
      (hit) =>
        hit ||
        fetch(e.request)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(e.request, copy))
            }
            return res
          })
          .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))),
    ),
  )
})
