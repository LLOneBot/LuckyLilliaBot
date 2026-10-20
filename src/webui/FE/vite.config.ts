import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'
import * as path from 'node:path'

const require = createRequire(path.join(__dirname, 'package.json'))

// Bare specifiers plugin WebUI modules import, with the export names of what installSharedModules() hands them
const SHARED_MODULES: Record<string, { file: string; names: () => string[] }> = {
  'react': { file: 'react.js', names: () => Object.keys(require('react')) },
  'react/jsx-runtime': { file: 'react-jsx-runtime.js', names: () => Object.keys(require('react/jsx-runtime')) },
  'react-dom': { file: 'react-dom.js', names: () => Object.keys(require('react-dom')) },
  '@luckylillia/plugin-sdk/webui': { file: 'plugin-sdk-webui.js', names: () => ['usePluginContext'] },
}

function shim(specifier: string, names: string[]): string {
  const exported = names.filter(name => name !== 'default' && /^[A-Za-z_$][\w$]*$/.test(name))
  return [
    `const m = globalThis.__LLBOT_WEBUI__.modules[${JSON.stringify(specifier)}]`,
    'export default m.default ?? m',
    `export const { ${exported.join(', ')} } = m`,
    '',
  ].join('\n')
}

/** Writes plugin-shared/*.js, which the import map in index.html points plugin imports at. */
function pluginSharedShims(): Plugin {
  const files = new Map(Object.entries(SHARED_MODULES).map(([specifier, { file, names }]) => [
    `plugin-shared/${file}`,
    shim(specifier, names()),
  ]))
  return {
    name: 'llbot-plugin-shared-shims',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const source = files.get((req.url ?? '').split('?')[0].slice(1))
        if (source === undefined) return next()
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
        res.end(source)
      })
    },
    generateBundle() {
      for (const [fileName, source] of files) this.emitFile({ type: 'asset', fileName, source })
    },
  }
}

const backend = `http://127.0.0.1:${process.env.WEBUI_PORT || 3080}`

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
  plugins: [react(), pluginSharedShims()],
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
        target: backend,
        changeOrigin: true,
      },
      '/plugin-webui': {
        target: backend,
        changeOrigin: true,
      },
    },
  },
})
