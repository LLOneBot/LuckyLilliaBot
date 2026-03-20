import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import * as path from 'node:path'

export default defineConfig({
  build: {
    outDir: path.join(__dirname, '../../../dist/webui'),
    emptyOutDir: true,
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@ntqqapi/types': path.resolve(__dirname, '../../ntqqapi/types'),
    },
  },
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.WEBUI_PORT || 3080}`,
        changeOrigin: true,
      },
    },
  },
})
