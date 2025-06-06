import { defineConfig } from 'vite'
import commonjs from '@rollup/plugin-commonjs'
import { builtinModules } from 'module'
import path from 'node:path'
import cp from 'vite-plugin-cp'
import { writeVersion } from './src/version'

writeVersion()

const external = [
  'silk-wasm',
  '@minatojs/sql.js',
  'ws',
  'supports-color',
  'has-flag',
  'file-type',
  'strtok3',
  'token-types',
  '@tokenizer/inflate',
  'uint8array-extras',
  'peek-readable',
  'ieee754',
  'fflate',
  'debug',
  'ms',
  /^node:/,
]

function genCpModule(module: string | RegExp) {
  return { src: `./node_modules/${module}`, dest: `dist/node_modules/${module}`, flatten: false }
}

// vite.config.ts

export default defineConfig({
  define: {
    __IS_BROWSER__: false, // 确保在 Node.js 环境中运行
  },
  build: {
    sourcemap: true,
    minify: false,
    outDir: 'dist',
    target: 'node18',
    rollupOptions: {
      external: [...external, ...builtinModules],
      input: 'src/main/main.ts',
      output: {
        entryFileNames: 'llonebot.js',
        format: 'es',
      },
      plugins: [
        // 也可以在这里添加 commonjs 插件，但注意顺序
        cp({
          targets: [
            ...external.map(genCpModule),
            { src: './package-dist.json', dest: 'dist/', rename: 'package.json' },
            { src: './doc/使用说明.txt', dest: 'dist/'}
          ],
        }),
        commonjs({
          include: /node_modules\/file-type/,
        }),
      ],
    },
  },
  resolve: {
    alias: {
      '@': '/src', // 可选：配置路径别名
    },
  },
})
