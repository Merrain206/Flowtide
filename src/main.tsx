import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { isNative } from './core/device/native-notify'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA: 注册 Service Worker（v0.5）——仅 Web 环境
// APK 里资源本就在本地，SW 反而会缓存旧版 HTML 导致覆盖安装后白屏
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (isNative()) {
      // 清掉旧版 APK 遗留的 SW 与缓存，避免升级后加载到旧页面
      void navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {})
      if ('caches' in window) {
        void caches.keys()
          .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
          .catch(() => {})
      }
      return
    }
    // 跟随构建 base：根部署为 /sw.js，在线尝鲜版为 /download/flowtide/app/sw.js
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {
      // SW 注册失败时静默降级，不影响应用使用
    })
  })
}
