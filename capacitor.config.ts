import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor 配置（v0.7 模块五）
 *
 * - webDir 指向 vite 构建产物；
 * - allowMixedContent：APK 内 WebView 以 https scheme 加载本地页面，
 *   而 NCM 音乐 API 是 http 直连，需放行混合内容（音频流播放用）；
 * - CapacitorHttp：fetch 改走原生网络层，绕开 WebView 对 http API
 *   的混合内容拦截与 CORS 限制（NCM 根路径健康检查无 CORS 头）。
 */
const config: CapacitorConfig = {
  appId: 'com.flowtide.app',
  appName: 'Flowtide',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
    // 调试版允许 chrome://inspect 远程调试 WebView
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
}

export default config
