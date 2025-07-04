import { defineConfig } from 'vite'
import { builtinModules } from 'module'
import cp from 'vite-plugin-cp'
import { writeVersion } from './src/version'
import path from 'node:path'
import fs from 'node:fs'

writeVersion()

function getModuleDependencies(moduleName: string, basePath = path.join(__dirname, 'node_modules'), seen = new Set<string>()) {
  if (seen.has(moduleName)) {
    return [];
  }
  seen.add(moduleName);

  const pkgPath = path.join(basePath, moduleName, 'package.json');
  let pkg;
  try {
    const content = fs.readFileSync(pkgPath, 'utf-8');
    pkg = JSON.parse(content);
  } catch (err) {
    // 找不到 package.json 或 JSON 解析失败时，跳过
    return [];
  }

  const deps = Object.keys(pkg.dependencies || {});
  for (const dep of deps) {
    getModuleDependencies(dep, basePath, seen);
  }

  const result = Array.from(seen);
  return result
}

const external = [
  'ws',
  'silk-wasm',
  '@minatojs/sql.js',
  ...getModuleDependencies('file-type'),
]
// console.log(external)

function genCpModule(module: string | RegExp) {
  return { src: `./node_modules/${module}`, dest: `dist/node_modules/${module}`, flatten: false }
}


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
      external: [...external, ...builtinModules, /^node:/,],
      input: 'src/main/main.ts',
      output: {
        entryFileNames: 'llonebot.js',
        format: 'es',
      },
      plugins: [
        cp({
          targets: [
            ...external.map(genCpModule),
            { src: './src/common/default_config.json', dest: 'dist/' },
            { src: './package-dist.json', dest: 'dist/', rename: 'package.json' },
            { src: './doc/使用说明.txt', dest: 'dist/' },
            { src: './doc/更新日志.txt', dest: 'dist/' }
          ],
        }),
      ],
    },
  },
  resolve: {
    alias: {
      '@': '/src', // 可选：配置路径别名
      'supports-color': 'node_modules/supports-color/index.js',
    },
  },
})
