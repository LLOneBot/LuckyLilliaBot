import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@shared': path.resolve(import.meta.dirname, 'src/common'),
      'qrcode': path.resolve(import.meta.dirname, 'node_modules/qrcode/lib/server.js'),
      // Builtin plugins' WebUI (src/plugin/internal/*/*/client) gets its packages from the WebUI's node_modules, as in that Vite build
      'zustand': path.resolve(import.meta.dirname, 'src/plugin/internal/service/webui/FE/node_modules/zustand'),
    },
  },
  test: {
    include: ['test/webui/**/*.test.ts', 'test/unit/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['test/unit/setup.ts'],
    mockReset: true,
  },
})
