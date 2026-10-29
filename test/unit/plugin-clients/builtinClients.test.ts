import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { builtinPlugins } from '@/plugin/internal'
import { CATEGORIES } from '@/plugin/internal/service/webui/FE/components/plugins/listing'

// The builtin plugins: src/plugin/internal/<category>/<name>, the category the plugin page groups them by, the name the
// entry's, with the entry defined in builtin.ts and the WebUI in client/ (found by plugin-host/builtins.tsx)

const SRC = path.resolve(import.meta.dirname, '../../../src')
const INTERNAL = path.join(SRC, 'plugin', 'internal')
const isDir = (dir: string) => statSync(dir).isDirectory()

const categories = readdirSync(INTERNAL).filter(entry => isDir(path.join(INTERNAL, entry)))
const pluginDirs = categories.flatMap(category => readdirSync(path.join(INTERNAL, category))
  .filter(entry => isDir(path.join(INTERNAL, category, entry)))
  .map(name => ({ category, name })))
const clientDirs = pluginDirs
  .map(({ category, name }) => path.join(INTERNAL, category, name, 'client'))
  .filter(dir => existsSync(dir))

function sources(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(file => /\.tsx?$/.test(file))
    .map(file => path.join(dir, file))
}

describe('builtin plugins', () => {
  it('group by the categories of the plugin page', () => {
    const known = CATEGORIES.map(category => category.key as string)
    for (const category of categories) expect(known, category).toContain(category)
  })

  it('each live in <category>/<name>, as builtin.ts defines its entry', async () => {
    expect(pluginDirs.map(({ name }) => name).sort())
      .toEqual(builtinPlugins.map(builtin => builtin.name.replace(/^builtin:/, '')).sort())
    for (const { category, name } of pluginDirs) {
      const { builtin } = await import(`@/plugin/internal/${category}/${name}/builtin`)
      expect(builtin.name, name).toBe(`builtin:${name}`)
      expect(builtin.manifest.category, name).toBe(category)
    }
  })

  it('name the entry of their directory from the client index module', () => {
    expect(clientDirs.length).toBeGreaterThan(0)
    for (const dir of clientDirs) {
      const index = ['index.tsx', 'index.ts'].map(file => path.join(dir, file)).find(file => existsSync(file))
      expect(index, `${dir} has no index module`).toBeDefined()
      const name = /export const name = '([^']+)'/.exec(readFileSync(index!, 'utf8'))?.[1]
      expect(name, `${index} exports no name`).toBe(`builtin:${path.basename(path.dirname(dir))}`)
    }
  })

  it('reach the WebUI only through the plugin SDK from their clients', () => {
    const shell = path.join(INTERNAL, 'service', 'webui')
    for (const file of clientDirs.flatMap(sources)) {
      const imports = [...readFileSync(file, 'utf8').matchAll(/from '([^']+)'/g)].map(match => match[1])
      for (const specifier of imports) {
        const inside = specifier.startsWith('.') && path.resolve(path.dirname(file), specifier).startsWith(shell)
        expect(inside, `${path.relative(SRC, file)} imports ${specifier}`).toBe(false)
      }
    }
  })
})
