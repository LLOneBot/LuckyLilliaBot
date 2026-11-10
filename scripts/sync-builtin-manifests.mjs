import JSON5 from 'json5'
import { existsSync } from 'node:fs'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const internal = path.join(root, 'src/plugin/internal')
for (const category of await readdir(internal, { withFileTypes: true })) {
  if (!category.isDirectory()) continue
  for (const dir of await readdir(path.join(internal, category.name), { withFileTypes: true })) {
    const sourceDir = path.join(internal, category.name, dir.name)
    if (!dir.isDirectory() || !existsSync(path.join(sourceDir, 'builtin.ts'))) continue
    const source = await readFile(path.join(sourceDir, 'builtin.ts'), 'utf8')
    const literal = source.match(/  manifest:\s*(\{[\s\S]*?^  \})/m)?.[1]
    if (!literal) throw new Error('Expected a static manifest object in ' + sourceDir)
    const details = JSON5.parse(literal)
    const entryName = source.match(/^  name: '([^']+)'/m)?.[1]
    const title = source.match(/^  title: '([^']+)'/m)?.[1]
    if (!entryName || !title) throw new Error('Expected a static name and title in ' + sourceDir)
    const file = path.join(sourceDir, 'package.json')
    const old = existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : {}
    const manifest = {
      name: '@luckylillia/plugin-' + dir.name, version: old.version ?? '1.0.0', type: 'module',
      description: details.description.en, main: './lib/index.js', files: ['lib'],
      author: { name: 'LLOneBot', url: 'https://github.com/LLOneBot' }, license: 'GPL-2.0',
      repository: { type: 'git', url: 'git+https://github.com/LLOneBot/LuckyLillia.Bot.git', directory: path.relative(root, sourceDir).split(path.sep).join('/') },
      engines: { node: '>=22.15' }, peerDependencies: { '@luckylillia/plugin-sdk': '^1.0.0' },
      llbot: { ...details, title,
        builtin: { entry: entryName, abi: 1 },
        ...(['index.ts', 'index.tsx'].some(name => existsSync(path.join(sourceDir, 'client', name))) ? { webui: './lib/client/index.js' } : {}),
      },
    }
    const text = JSON.stringify(manifest, null, 2) + '\n'
    if (process.argv.includes('--check')) {
      if (!existsSync(file) || await readFile(file, 'utf8') !== text) throw new Error('Run node scripts/sync-builtin-manifests.mjs: ' + file)
    } else await writeFile(file, text)
  }
}
