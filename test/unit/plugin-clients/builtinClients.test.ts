import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { builtinPlugins } from '@/main/builtins'

// The WebUI of builtin plugins: `client/` next to each plugin's code, found by plugin-host/builtins.tsx

const SRC = path.resolve(import.meta.dirname, '../../../src')

function clientDirs(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (!statSync(full).isDirectory() || entry === 'node_modules') continue
    // The WebUI shell itself, and what the glob there leaves out
    if (full === path.join(SRC, 'webui')) continue
    if (entry === 'client') found.push(full)
    else found.push(...clientDirs(full))
  }
  return found
}

function sources(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(file => /\.tsx?$/.test(file))
    .map(file => path.join(dir, file))
}

const dirs = clientDirs(SRC)

describe('builtin plugin clients', () => {
  it('each names a builtin entry from its index module', () => {
    const builtins = new Set(builtinPlugins.map(plugin => plugin.name))
    const names = dirs.map((dir) => {
      const index = ['index.tsx', 'index.ts'].map(file => path.join(dir, file)).find(file => {
        try {
          return statSync(file).isFile()
        } catch {
          return false
        }
      })
      expect(index, `${dir} has no index module`).toBeDefined()
      const name = /export const name = '([^']+)'/.exec(readFileSync(index!, 'utf8'))?.[1]
      expect(name, `${index} exports no name`).toBeDefined()
      return name!
    })
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) expect(builtins.has(name), name).toBe(true)
    expect(new Set(names).size).toBe(names.length)
  })

  it('only reach the WebUI through the plugin SDK', () => {
    for (const file of dirs.flatMap(sources)) {
      const imports = [...readFileSync(file, 'utf8').matchAll(/from '([^']+)'/g)].map(match => match[1])
      for (const specifier of imports) {
        const inside = specifier.startsWith('.') && path.resolve(path.dirname(file), specifier).startsWith(path.join(SRC, 'webui'))
        expect(inside, `${path.relative(SRC, file)} imports ${specifier}`).toBe(false)
      }
    }
  })
})
