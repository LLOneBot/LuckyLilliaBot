import cp from 'vite-plugin-cp'
import path from 'node:path'
import './scripts/gen-manifest'
import type { ElectronViteConfig } from 'electron-vite'

const external = [
  'silk-wasm',
  'ws',
  '@minatojs/sql.js',
]

function genCpModule(module: string) {
  return { src: `./node_modules/${module}`, dest: `dist/node_modules/${module}`, flatten: false }
}

const config: ElectronViteConfig = {
  main: {
    build: {
      outDir: 'dist/main',
      emptyOutDir: true,
      lib: {
        formats: ['cjs'],
        entry: { main: 'src/main/main.ts' },
      },
      rollupOptions: {
        external,
        input: 'src/main/main.ts',
      },
      minify: true,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    plugins: [
      cp({
        targets: [
          ...external.map(genCpModule),
          { src: './manifest.json', dest: 'dist' },
          { src: './icon.webp', dest: 'dist' },
          { src: './src/ntqqapi/native/napcat-protocol-packet/Moehoo/*', dest: 'dist/main/Moehoo' },
        ],
      }),
    ],
  },
  preload: {
    // vite config options
    build: {
      outDir: 'dist/preload',
      emptyOutDir: true,
      lib: {
        formats: ['cjs'],
        entry: { preload: 'src/preload.ts' },
      },
      rollupOptions: {
        // external: externalAll,
        input: 'src/preload.ts',
      },
    },
    resolve: {},
  },
  renderer: {
    // vite config options
    build: {
      outDir: 'dist/renderer',
      emptyOutDir: true,
      lib: {
        formats: ['es'],
        entry: { renderer: 'src/renderer/index.ts' },
      },
      rollupOptions: {
        // external: externalAll,
        input: 'src/renderer/index.ts',
      },
    },
    resolve: {},
  },
}

export default config
