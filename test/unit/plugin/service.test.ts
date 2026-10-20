import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Context, Fiber } from 'cordis'
import TimerService from '@cordisjs/plugin-timer'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import PluginService, { PluginStatus } from '@/plugin'

declare global {
  var __pluginTest: string[]
}

// Inside the repo (gitignored) so fixture plugins resolve schemastery from its node_modules.
const tmpRoot = path.resolve('.tmp')
mkdirSync(tmpRoot, { recursive: true })
const workDir = mkdtempSync(path.join(tmpRoot, 'plugin-test-'))

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true })
})

function writePlugin(root: string, dir: string, files: Record<string, string>, pkg: Record<string, unknown> = {}) {
  const base = path.join(root, dir)
  mkdirSync(base, { recursive: true })
  writeFileSync(path.join(base, 'package.json'), JSON.stringify({
    name: dir,
    version: '1.0.0',
    type: 'module',
    main: 'index.js',
    llbot: {},
    ...pkg,
  }))
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(base, name), content)
}

let caseDir: string
let pluginRoot: string
let file: string
let ctx: Context
let service: Fiber | undefined

async function boot() {
  ctx = new Context()
  // A fiber awaited while still pending resolves at once, so let timer come up first
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
  caseDir = mkdtempSync(path.join(workDir, 'case-'))
  pluginRoot = path.join(caseDir, 'plugins')
  file = path.join(caseDir, 'plugins.json')
  writePlugin(pluginRoot, 'alpha', {
    'index.js': `
      import Schema from 'schemastery'
      export const name = 'alpha'
      export const Config = Schema.object({ n: Schema.natural().default(1) })
      export function apply(ctx, config) {
        globalThis.__pluginTest.push('apply:' + config.n)
        // a function declaration counts as a constructor to cordis, so its return value is dropped
        ctx.effect(() => () => globalThis.__pluginTest.push('dispose:' + config.n))
      }
    `,
  })
})

// Disposing the service also deregisters its process-wide resolve hook
afterEach(async () => {
  await service?.dispose()
  service = undefined
})

describe('PluginService', () => {
  it('lists new packages as disabled entries and persists them', async () => {
    const plugins = await boot()
    expect(byName('alpha')).toMatchObject({ disabled: true, state: 'disposed', version: '1.0.0' })
    expect(globalThis.__pluginTest).toEqual([])
    const saved = JSON.parse(readFileSync(file, 'utf8'))
    expect(saved.entries).toEqual([{ id: byName('alpha').id, name: 'alpha', disabled: true }])
    expect(plugins.list()).toHaveLength(1)
  })

  it('enables, reconfigures and disables an entry', async () => {
    const plugins = await boot()
    const { id } = byName('alpha')

    expect(await plugins.enable(id)).toMatchObject({ state: 'active', disabled: false, hasConfig: true })
    expect(globalThis.__pluginTest).toEqual(['apply:1'])

    expect(await plugins.updateConfig(id, { n: 2 })).toMatchObject({ state: 'active' })
    expect(globalThis.__pluginTest).toEqual(['apply:1', 'dispose:1', 'apply:2'])

    await expect(plugins.updateConfig(id, { n: -1 })).rejects.toMatchObject({
      message: expect.stringMatching(/expected number >= 0/),
      issues: [{ path: ['n'], message: expect.stringMatching(/>= 0/) }],
    })
    expect(byName('alpha').state).toBe('active')
    expect(JSON.parse(readFileSync(file, 'utf8')).entries[0].config).toEqual({ n: 2 })

    expect(await plugins.disable(id)).toMatchObject({ state: 'disposed', disabled: true })
    expect(globalThis.__pluginTest.at(-1)).toBe('dispose:2')
  })

  it('starts enabled entries from plugins.json on boot', async () => {
    writeFileSync(file, JSON.stringify({ version: 1, entries: [{ id: 'abcd1234', name: 'alpha', config: { n: 7 } }] }))
    await boot()
    await expect.poll(() => byName('alpha').state).toBe('active')
    expect(globalThis.__pluginTest).toEqual(['apply:7'])
  })

  it('describes the schema and its defaults', async () => {
    const plugins = await boot()
    const description = await plugins.describe(byName('alpha').id)
    expect(description.defaults).toEqual({ n: 1 })
    expect(description.config).toBeNull()
    expect(description.schema).toMatchObject({ refs: expect.any(Object), uid: expect.any(Number) })
  })

  it('reports a throwing apply() as failed without affecting other plugins', async () => {
    writePlugin(pluginRoot, 'beta', { 'index.js': `export function apply() { throw new Error('boom') }` })
    const plugins = await boot()
    await plugins.enable(byName('alpha').id)
    await plugins.enable(byName('beta').id)
    await expect.poll(() => byName('beta')).toMatchObject({ state: 'failed', error: 'boom' })
    expect(byName('alpha').state).toBe('active')
  })

  it('refuses a package that needs another SDK major', async () => {
    writePlugin(pluginRoot, 'gamma', { 'index.js': `export function apply() {}` }, {
      peerDependencies: { '@luckylillia/plugin-sdk': '^99.0.0' },
    })
    const plugins = await boot()
    expect(await plugins.enable(byName('gamma').id)).toMatchObject({ state: 'incompatible' })
    expect(byName('gamma').error).toMatch(/requires @luckylillia\/plugin-sdk \^99\.0\.0, host provides 1\./)
  })

  it('explains what a pending plugin is waiting for', async () => {
    writePlugin(pluginRoot, 'delta', {
      'index.js': `export const inject = ['nonexistent', 'timer']\nexport function apply() {}`,
    })
    const plugins = await boot()
    expect(await plugins.enable(byName('delta').id)).toMatchObject({ state: 'pending', missingDeps: ['nonexistent'] })
  })

  it('rejects a Service subclass built with its own copy of cordis', async () => {
    writePlugin(pluginRoot, 'zeta', {
      'index.js': `class Service {}\nexport default class Zeta extends Service {}`,
    })
    const plugins = await boot()
    expect(await plugins.enable(byName('zeta').id)).toMatchObject({ state: 'failed' })
    expect(byName('zeta').error).toMatch(/own copy of cordis/)
  })

  it('reloads a package with the edited code and keeps the old one on a broken edit', async () => {
    writePlugin(pluginRoot, 'epsilon', {
      'index.js': `export function apply() { globalThis.__pluginTest.push('v1') }`,
    })
    const plugins = await boot()
    const { id } = byName('epsilon')
    await plugins.enable(id)
    expect(globalThis.__pluginTest).toEqual(['v1'])

    writeFileSync(path.join(pluginRoot, 'epsilon', 'index.js'), `export function apply() { globalThis.__pluginTest.push('v2') }`)
    expect(await plugins.reload(id)).toEqual({ status: 'reloaded' })
    expect(globalThis.__pluginTest).toEqual(['v1', 'v2'])
    expect(byName('epsilon')).toMatchObject({ state: 'active', reloadCount: 1 })

    writeFileSync(path.join(pluginRoot, 'epsilon', 'index.js'), `export function apply( {`)
    await expect(plugins.reload(id)).rejects.toThrow(/reload failed/)
    expect(byName('epsilon').state).toBe('active')
    expect(byName('epsilon').error).toMatch(/still running the previous version/)
  })

  it('marks entries whose package disappeared as missing', async () => {
    const plugins = await boot()
    await plugins.enable(byName('alpha').id)
    rmSync(path.join(pluginRoot, 'alpha'), { recursive: true, force: true })
    expect(await plugins.scan()).toMatchObject({ removed: ['alpha'] })
    expect(byName('alpha').state).toBe('missing')
    expect(globalThis.__pluginTest).toEqual(['apply:1', 'dispose:1'])
  })

  it('runs several entries of one package side by side', async () => {
    const plugins = await boot()
    await plugins.enable(byName('alpha').id)
    const second = await plugins.add('alpha', { n: 5 })
    expect(second.state).toBe('active')
    expect(globalThis.__pluginTest).toEqual(['apply:1', 'apply:5'])
    await plugins.remove(second.id)
    expect(plugins.list()).toHaveLength(1)
    expect(globalThis.__pluginTest.at(-1)).toBe('dispose:5')
  })
})
