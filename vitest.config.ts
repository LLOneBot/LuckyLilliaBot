import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@shared': path.resolve(import.meta.dirname, 'src/common'),
      'qrcode': path.resolve(import.meta.dirname, 'node_modules/qrcode/lib/server.js'),
    },
  },
  test: {
    include: ['test/webui/**/*.test.ts', 'test/unit/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['test/unit/setup.ts'],
    mockReset: true,
  },
})
