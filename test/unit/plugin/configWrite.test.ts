import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Context, Fiber } from 'cordis'
import TimerService from '@cordisjs/plugin-timer'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import PluginService, { PluginRevConflictError, PluginStatus } from '@/plugin/host'

declare global {
  var __pluginTest: string[]
}

// Inside the repo (gitignored) so fixture plugins resolve schemastery from its node_modules.
const tmpRoot = path.resolve('.tmp')
mkdirSync(tmpRoot, { recursive: true })
const workDir = mkdtempSync(path.join(tmpRoot, 'plugin-config-'))

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true })
})

let pluginRoot: string
let file: string
let ctx: Context
let service: Fiber | undefined

const readEntries = () => JSON.parse(readFileSync(file, 'utf8')).entries

async function boot() {
  ctx = new Context()
  await ctx.plugin(TimerService)
  service = await ctx.plugin(PluginService, { file, roots: [pluginRoot] })
  return ctx.plugins
}

function byName(name: string): PluginStatus {
  const status = ctx.plugins.list().find(status => status.name === name)
  if (!status) throw new Error(`no entry for ${name}`)
  return status
}

beforeEach(() => {
  globalThis.__pluginTest = []
  const caseDir = mkdtempSync(path.join(workDir, 'case-'))
  pluginRoot = path.join(caseDir, 'plugins')
  file = path.join(caseDir, 'plugins.json')
  const base = path.join(pluginRoot, 'alpha')
  mkdirSync(base, { recursive: true })
  writeFileSync(path.join(base, 'package.json'), JSON.stringify({
    name: 'alpha', version: '1.0.0', type: 'module', main: 'index.js', llbot: {},
  }))
  writeFileSync(path.join(base, 'index.js'), `
    import Schema from 'schemastery'
    export const name = 'alpha'
    export const Config = Schema.object({ n: Schema.natural().default(1), tag: Schema.string().default('x') })
    export function apply(ctx, config) {
      globalThis.__pluginTest.push('apply:' + config.n + ':' + config.tag)
    }
  `)
  writeFileSync(file, JSON.stringify({ version: 1, entries: [{ id: 'aaaa1111', name: 'alpha', config: { n: 2 } }] }))
})

afterEach(async () => {
  await service?.dispose()
  service = undefined
})

describe('a plugin config write', () => {
  it('stores only what differs from the defaults, and applies the full value', async () => {
    const plugins = await boot()
    const { id } = byName('alpha')
    await plugins.updateConfig(id, { n: 1, tag: 'y' })
    expect(readEntries()[0].config).toEqual({ tag: 'y' })
    expect(globalThis.__pluginTest.at(-1)).toBe('apply:1:y')
  })

  it('describes what is stored and what the plugin runs with', async () => {
    const plugins = await boot()
    const description = await plugins.describe(byName('alpha').id)
    expect(description).toMatchObject({ config: { n: 2 }, effective: { n: 2, tag: 'x' }, defaults: { n: 1, tag: 'x' } })
    expect(typeof description.rev).toBe('string')
  })
})

describe('optimistic concurrency on a config write', () => {
  it('rejects a write whose rev is stale and leaves the config alone', async () => {
    const plugins = await boot()
    const { id } = byName('alpha')
    const { rev } = await plugins.describe(id)

    // someone else saves first, which moves the rev on
    await plugins.updateConfig(id, { n: 3, tag: 'x' }, rev)

    await expect(plugins.updateConfig(id, { n: 4, tag: 'x' }, rev)).rejects.toBeInstanceOf(PluginRevConflictError)
    expect(readEntries()[0].config).toEqual({ n: 3 })
  })

  it('accepts a write carrying the current rev, and the rev then moves', async () => {
    const plugins = await boot()
    const { id } = byName('alpha')
    const first = await plugins.describe(id)

    await plugins.updateConfig(id, { n: 8, tag: 'x' }, first.rev)
    const second = await plugins.describe(id)

    expect(readEntries()[0].config).toEqual({ n: 8 })
    expect(second.rev).not.toBe(first.rev)
  })

  it('skips the check when no rev is supplied', async () => {
    const plugins = await boot()
    await plugins.updateConfig(byName('alpha').id, { n: 5, tag: 'x' })
    expect(readEntries()[0].config).toEqual({ n: 5 })
  })
})
