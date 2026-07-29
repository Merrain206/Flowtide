/**
 * Flowtide Service Worker (v0.7)
 *
 * 策略：HTML 网络优先 + 静态资源 Cache First
 * - index.html 必须网络优先：否则发版后旧 HTML 引用的旧哈希 JS 已不存在 → 白屏
 * - 带哈希的 JS/CSS 可以放心 Cache First（内容变则文件名变）
 * - 专注数据走 IDB，不受 SW 缓存策略影响
 */

const CACHE_NAME = 'flowtide-v0.7'

// 安装阶段：预缓存核心资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/',
        '/index.html',
        '/manifest.json',
        '/favicon.svg',
      ])
    })
  )
  // 立即激活，不等待旧 worker 的 clients
  self.skipWaiting()
})

// 激活阶段：清理旧缓存，并刷新被旧缓存卡白屏的页面
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    }).then(() => self.clients.claim()).then(() => {
      // 旧版 SW 可能已经把页面带进白屏：接管后强制重新导航一次
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        return Promise.all(clients.map((c) => c.navigate(c.url).catch(() => {})))
      })
    })
  )
})

// 请求拦截：HTML 网络优先，其余 Cache First
self.addEventListener('fetch', (event) => {
  // 只处理同源请求，跳过跨域 API 调用（网易云代理等）
  if (!event.request.url.startsWith(self.location.origin)) return

  const isHtml = event.request.mode === 'navigate'
    || new URL(event.request.url).pathname === '/index.html'

  if (isHtml) {
    // 网络优先：拿到新页面就更新缓存，离线时才回退缓存
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      }).catch(() => caches.match(event.request).then((c) => c || caches.match('/index.html')))
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached

      return fetch(event.request).then((response) => {
        // 只缓存成功的 GET 请求
        if (
          response.ok &&
          event.request.method === 'GET' &&
          isCacheableRequest(event.request)
        ) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone)
          })
        }
        return response
      })
    }).catch(() => new Response('Offline', { status: 503 }))
  )
})

/** 判断是否为可缓存的资源类型 */
function isCacheableRequest(request) {
  const url = new URL(request.url)
  // 缓存 JS、CSS、图片、字体、SVG（HTML 已走网络优先分支）
  return /\.(js|css|png|jpg|jpeg|gif|svg|woff2?|ttf|eot)$/.test(url.pathname)
    || url.pathname === '/manifest.json'
}
