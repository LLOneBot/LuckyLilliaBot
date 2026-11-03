import { defineConfig, Plugin } from 'vite'
import { builtinModules, createRequire } from 'node:module'
import { version } from './src/version.ts'
import cp from 'vite-plugin-cp'
import path from 'node:path'
import fs from 'node:fs'

function writeVersion(): Plugin {
  return {
    name: 'write-version',
    buildStart() {
      const nativeRoot = path.resolve('src/native/lucky-lillia/production')
      const loader = createRequire(import.meta.url)(path.join(nativeRoot, 'loader.cjs'))
      const bundle = loader.inspectBundle(nativeRoot, { allTargets: true })
      if (bundle.manifest.variant !== 'production') throw new Error('Production Bot build requires production native artifacts')
      const pkgJsonPath = './package-dist.json'
      const pkgJsonRaw = fs.readFileSync(pkgJsonPath, 'utf8')
      const packageJson = JSON.parse(pkgJsonRaw)
      packageJson.version = version
      fs.writeFileSync(pkgJsonPath, JSON.stringify(packageJson), 'utf8')
    }
  }
}

function getModuleDependencies(moduleName: string, basePath = path.join(import.meta.dirname, 'node_modules'), seen = new Set<string>()) {
  if (seen.has(moduleName)) {
    return []
  }
  seen.add(moduleName)

  const pkgPath = path.join(basePath, moduleName, 'package.json')
  let pkg
  try {
    const content = fs.readFileSync(pkgPath, 'utf-8')
    pkg = JSON.parse(content)
  } catch (err) {
    // 找不到 package.json 或 JSON 解析失败时，跳过
    return []
  }

  const deps = Object.keys(pkg.dependencies || {})
  for (const dep of deps) {
    getModuleDependencies(dep, basePath, seen)
  }

  const result = Array.from(seen)
  return result
}

// Plugins import these at runtime and must get the very objects the host uses (a second cordis
// means services, symbols and events no longer line up), so the host loads them from node_modules too.
const pluginShared = ['cordis', 'cosmokit', 'schemastery', '@standard-schema/spec', '@satorijs/element', '@satorijs/protocol']

const external = [...new Set([
  'ws',
  'silk-wasm',
  // Carries its HTTP parser as embedded WASM: copied as it is rather than bundled
  'undici',
  ...getModuleDependencies('reggol'),
  ...getModuleDependencies('file-type'),
  ...pluginShared.flatMap(name => getModuleDependencies(name)),
])]

function genCpModule(module: string | RegExp) {
  return { src: `./node_modules/${module}`, dest: `dist/node_modules/${module}`, flatten: false }
}

export default defineConfig({
  define: {
    __IS_BROWSER__: false, // 确保在 Node.js 环境中运行
    'process.env': 'process.env', // 防止 Vite 替换 process.env
    // 'import.meta.env.MODE': '"production"'
  },
  build: {
    sourcemap: true,
    minify: false,
    outDir: 'dist',
    target: 'node22',
    rolldownOptions: {
      platform: 'node',
      external: [...external, '@luckylillia/plugin-sdk', ...builtinModules, /^node:/],
      input: 'src/main/main.ts',
      output: {
        entryFileNames: 'llbot.js',
        format: 'es',
      },
      plugins: [
        cp({
          targets: [
            ...external.map(genCpModule),
            { src: './packages/plugin-sdk/lib', dest: 'dist/node_modules/@luckylillia/plugin-sdk/lib', flatten: false },
            { src: './packages/plugin-sdk/package.json', dest: 'dist/node_modules/@luckylillia/plugin-sdk/' },
            { src: './src/main/config/default_config.json', dest: 'dist/' },
            { src: './package-dist.json', dest: 'dist/', rename: 'package.json' },
            { src: './doc/使用说明.txt', dest: 'dist/' },
            { src: './doc/更新日志.txt', dest: 'dist/' },
            { src: './src/native/lucky-lillia/production', dest: 'dist/native/lucky-lillia/production', flatten: false },
            ...(process.env.LLBOT_BUILD_DEV_NATIVE === '1'
              ? [{ src: './src/native/lucky-lillia/development', dest: 'dist/native/lucky-lillia/development', flatten: false }]
              : []),
          ],
        }),
      ],
    },
  },
  resolve: {
    alias: {
      'qrcode': path.resolve(import.meta.dirname, 'node_modules/qrcode/lib/server.js'),
    },
    tsconfigPaths: true
  },
  plugins: [writeVersion()],
})
