import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import * as path from 'node:path'

export default defineConfig({
  build: {
    outDir: path.join(__dirname, '../../../dist/webui'),
    emptyOutDir: true,
  },
  // dev 下前端走 Vite 代理访问后端 (下面 proxy.target), window.location.port 是 Vite 的 15173 而非
  // 后端端口. 把代理目标端口注入进来, 让前端能判断登录后账号配置里的 webui.port 是否真的变了.
  define: {
    __WEBUI_DEV_PORT__: JSON.stringify(process.env.WEBUI_PORT || '3080'),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@ntqqapi/types': path.resolve(__dirname, '../../ntqqapi/types'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 15173,
    open: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.WEBUI_PORT || 3080}`,
        changeOrigin: true,
      },
    },
  },
})
