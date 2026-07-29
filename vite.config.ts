import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // 暴露到局域网，方便手机访问调试（震动反馈等）
    proxy: {
      // dev 代理走域名反代（保留 /ncm 前缀，命中 nginx 同名 location）
      '/ncm': {
        target: 'https://merrain.cn',
        changeOrigin: true,
      },
    },
  },
})
