import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'
import * as path from 'node:path'
import { SDK_EXPORTS } from './plugin-host/sdkExports'

const require = createRequire(path.join(__dirname, 'package.json'))

// Bare specifiers plugin WebUI modules import, with the export names of what installSharedModules() hands them
const SHARED_MODULES: Record<string, { file: string; names: () => string[] }> = {
  'react': { file: 'react.js', names: () => Object.keys(require('react')) },
  'react/jsx-runtime': { file: 'react-jsx-runtime.js', names: () => Object.keys(require('react/jsx-runtime')) },
  'react-dom': { file: 'react-dom.js', names: () => Object.keys(require('react-dom')) },
  '@luckylillia/plugin-sdk/webui': { file: 'plugin-sdk-webui.js', names: () => SDK_EXPORTS },
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
    outDir: path.join(__dirname, '../../../../../../dist/webui'),
    emptyOutDir: true,
  },
  plugins: [react(), pluginSharedShims()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../../../../../common'),
      '@ntqqapi/types': path.resolve(__dirname, '../../../protocol/nt-protocol/ntqqapi/types'),
      // Builtin plugins' WebUI (`client/` next to their code, see plugin-host/builtins.ts) is bundled, so its SDK
      // imports go straight to the runtime instead of through the import map
      '@luckylillia/plugin-sdk/webui': path.resolve(__dirname, 'plugin-host/sdk.tsx'),
    },
    // Those clients live outside this package and must get its React, not one found next to them
    dedupe: ['react', 'react-dom', 'lucide-react', 'zustand', '@tanstack/react-virtual'],
  },
  server: {
    host: '127.0.0.1',
    port: 15173,
    open: true,
    fs: {
      allow: [path.resolve(__dirname, '../../../../../..')],
    },
    proxy: {
      '/api': {
        target: backend,
        changeOrigin: true,
      },
      // These check the login cookie, named after the port in the Host header: the browser's, so it stays
      '/plugin-webui': {
        target: backend,
        changeOrigin: false,
      },
      '/plugin-assets': {
        target: backend,
        changeOrigin: false,
      },
    },
  },
})
