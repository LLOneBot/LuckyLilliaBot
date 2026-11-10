import { build as bundle } from 'esbuild'
import { build as viteBuild } from 'vite'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire, isBuiltin } from 'node:module'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const internal = path.join(root, 'src/plugin/internal')
const fe = path.join(internal, 'service/webui/FE')
const destination = path.resolve(root, process.env.LLBOT_BUILTIN_OUTDIR || 'output/builtin-packages')
const shared = new Map()
const requireFrontend = createRequire(path.join(fe, 'package.json'))
const postcss = requireFrontend('postcss')
const tailwind = requireFrontend('@tailwindcss/postcss')
const rootPackage = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const sharedPackages = new Set(['@luckylillia/plugin-sdk', 'cordis', 'cosmokit', 'schemastery', '@standard-schema/spec', '@satorijs/element', '@satorijs/protocol'])
const isInside = (dir, file) => file === dir || file.startsWith(dir + path.sep)
const entries = []
for (const category of await readdir(internal, { withFileTypes: true })) {
  if (!category.isDirectory()) continue
  for (const entry of await readdir(path.join(internal, category.name), { withFileTypes: true })) {
    const dir = path.join(internal, category.name, entry.name)
    if (entry.isDirectory() && existsSync(path.join(dir, 'builtin.ts'))) entries.push(dir)
  }
}

for (const dir of entries) {
  const manifest = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'))
  const out = path.resolve(destination, manifest.name)
  if (out === destination || !isInside(destination, out)) throw new Error('Builtin output escaped its destination: ' + out)
  // Only this verified package output is cleared; otherwise old client chunks survive a rebuild and npm pack.
  await rm(out, { recursive: true, force: true })
  await mkdir(path.join(out, 'lib'), { recursive: true })
  const owns = file => isInside(dir, file)
    || (manifest.llbot.builtin.entry === 'builtin:commands' && file === path.join(root, 'src/universal/commands.ts'))
    || (manifest.llbot.builtin.entry === 'builtin:nt-protocol' && isInside(path.join(root, 'src/qqProtocol'), file))
  const backend = await bundle({
    absWorkingDir: root, entryPoints: [path.join(dir, 'builtin.ts')], outfile: path.join(out, 'lib/index.js'),
    bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external', metafile: true,
    tsconfig: path.join(root, 'tsconfig.json'), define: { 'import.meta.env': '{}' },
    plugins: [{
      name: 'share-bot-runtime',
      setup(build) {
        build.onResolve({ filter: /^(\.|@\/)/ }, async args => {
          if (args.pluginData?.resolved || args.kind === 'entry-point') return
          const resolved = await build.resolve(args.path, { importer: args.importer, resolveDir: args.resolveDir,
            kind: args.kind, pluginData: { resolved: true } })
          if (resolved.errors.length) return { errors: resolved.errors }
          if (!isInside(path.join(root, 'src'), resolved.path) || owns(resolved.path)) return
          const key = path.relative(path.join(root, 'src'), resolved.path).split(path.sep).join('/')
          shared.set(key, resolved.path)
          return { path: '@luckylillia/bot-runtime/' + key, external: true }
        })
      },
    }],
  })
  const dependencies = new Set(Object.values(backend.metafile.outputs).flatMap(output => output.imports)
    .map(item => item.path).filter(specifier => !isBuiltin(specifier) && !specifier.startsWith('@luckylillia/bot-runtime/'))
    .map(specifier => specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0])
    .filter(specifier => !sharedPackages.has(specifier)))
  manifest.dependencies = Object.fromEntries([...dependencies].sort().map(name => {
    const range = rootPackage.dependencies[name] ?? rootPackage.devDependencies[name]
    if (!range) throw new Error('Declare the builtin dependency in package.json: ' + name)
    return [name, range]
  }))
  const client = ['index.tsx', 'index.ts'].map(name => path.join(dir, 'client', name)).find(existsSync)
  if (client) {
    await bundle({
      absWorkingDir: root, entryPoints: [client], outfile: path.join(out, 'lib/client/module.js'), bundle: true,
      platform: 'browser', format: 'esm', target: 'es2022', jsx: 'automatic', minify: true,
      nodePaths: [path.join(fe, 'node_modules')],
      alias: { '@ntqqapi/types': path.join(internal, 'protocol/nt-protocol/ntqqapi/types') },
      external: ['react', 'react/*', 'react-dom', 'react-dom/*', '@luckylillia/plugin-sdk/webui'],
      define: { 'process.env.NODE_ENV': '"production"' },
    })
    // An independently updated client can use utility classes that the older shell never compiled.
    // Ship only its Tailwind utilities, leaving the host's reset and semantic component styles intact.
    const tailwindDir = path.join(fe, 'node_modules/tailwindcss').split(path.sep).join('/')
    const css = '@import "' + tailwindDir + '/theme.css" layer(theme);\n'
      + '@import "' + tailwindDir + '/utilities.css" layer(utilities) source(none);\n'
      + '@source "' + path.join(dir, 'client').split(path.sep).join('/') + '";\n'
      + '@custom-variant dark (&:where(.dark, .dark *));\n'
    const styled = await postcss([tailwind({ base: fe, optimize: true })]).process(css, { from: path.join(fe, 'builtin.css') })
    await writeFile(path.join(out, 'lib/client/style.css'), styled.css)
    await writeFile(path.join(out, 'lib/client/index.js'), [
      'import apply from "./module.js"',
      'export default function(ctx) {',
      '  const style = document.createElement("link")',
      '  style.rel = "stylesheet"',
      '  style.href = new URL("./style.css", import.meta.url).href',
      '  document.head.append(style)',
      '  try { const stop = apply(ctx); return () => { if (typeof stop === "function") stop(); style.remove() } }',
      '  catch (error) { style.remove(); throw error }',
      '}', '',
    ].join('\n'))
  }
  await writeFile(path.join(out, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
}

// This file is part of the host build, so every private import resolves to the host's original module objects.
const modules = [...shared].sort(([a], [b]) => a.localeCompare(b))
const imports = ['// Generated by scripts/build-builtins.mjs. Do not edit by hand.',
  ...modules.map(([name, file], index) => 'import * as m' + index + ' from ' + JSON.stringify(
    path.relative(internal, file).split(path.sep).join('/').replace(/\.tsx?$/, '').replace(/^(?!\.)/, './'))),
  "import { registerBuiltinRuntime } from '../host/builtin-runtime'",
  'registerBuiltinRuntime({', ...modules.map(([name], index) => '  ' + JSON.stringify(name) + ': m' + index + ','),
  '})', '',
].join('\n')
await writeFile(path.join(internal, 'runtime-imports.ts'), imports)

// WebUI itself is an updatable core package, including the complete shell it serves.
await viteBuild({ configFile: path.join(fe, 'vite.config.ts'), root: fe,
  build: { outDir: path.join(destination, '@luckylillia/plugin-webui/lib/webui'), emptyOutDir: true },
})
console.log('Built ' + entries.length + ' builtin npm packages in ' + destination)
