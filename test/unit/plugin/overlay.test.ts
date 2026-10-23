import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Context, Fiber } from 'cordis'
import TimerService from '@cordisjs/plugin-timer'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import PluginService, { BuiltinPlugin, PluginRevConflictError, PluginStatus } from '@/plugin'

declare global {
  var __pluginTest: string[]
}

// Inside the repo (gitignored) so fixture plugins resolve schemastery from its node_modules.
const tmpRoot = path.resolve('.tmp')
mkdirSync(tmpRoot, { recursive: true })
const workDir = mkdtempSync(path.join(tmpRoot, 'plugin-overlay-'))

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true })
})

const UIN = '10001'

let caseDir: string
let pluginRoot: string
let file: string
let ctx: Context
let service: Fiber | undefined

const accountFile = (uin: string) => path.join(caseDir, 'accounts', uin, 'plugins.json')

function writeGlobal(entries: unknown[]) {
  writeFileSync(file, JSON.stringify({ version: 1, entries }))
}

function writeOverlay(uin: string, entries: Record<string, unknown>) {
  const target = accountFile(uin)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, JSON.stringify({ version: 1, entries }))
}

const readOverlay = (uin: string) => JSON.parse(readFileSync(accountFile(uin), 'utf8'))
const readGlobal = () => JSON.parse(readFileSync(file, 'utf8'))

async function boot(builtins?: BuiltinPlugin[]) {
  ctx = new Context()
  await ctx.plugin(TimerService)
  service = await ctx.plugin(PluginService, { file, accountFile, roots: [pluginRoot], builtins })
  return ctx.plugins
}

/** What AccountService does on the first qq/online. */
async function login(uin = UIN) {
  ctx.emit('account/prepare', uin)
  // the handler loads the overlay file asynchronously
  await new Promise(resolve => setTimeout(resolve, 60))
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
      ctx.effect(() => () => globalThis.__pluginTest.push('dispose:' + config.n + ':' + config.tag))
    }
  `)
})

afterEach(async () => {
  await service?.dispose()
  service = undefined
})

describe('per-account plugin overrides', () => {
  it('leaves everything on the global layer when the account overrides nothing', async () => {
    writeGlobal([{ id: 'aaaa1111', name: 'alpha', config: { n: 2 } }])
    await boot()
    await expect.poll(() => byName('alpha').state).toBe('active')
    expect(globalThis.__pluginTest).toEqual(['apply:2:x'])

    await login()
    // no overlay file at all: the running fiber is not touched
    expect(globalThis.__pluginTest).toEqual(['apply:2:x'])
    expect(existsSync(accountFile(UIN))).toBe(false)
  })

  it('merges the account override over the global layer at login', async () => {
    writeGlobal([{ id: 'aaaa1111', name: 'alpha', config: { n: 2 } }])
    writeOverlay(UIN, { aaaa1111: { config: { n: 5 } } })
    await boot()
    await expect.poll(() => byName('alpha').state).toBe('active')
    expect(globalThis.__pluginTest).toEqual(['apply:2:x'])

    await login()
    // n comes from the account layer, tag still from the global default
    expect(globalThis.__pluginTest).toEqual(['apply:2:x', 'dispose:2:x', 'apply:5:x'])
  })

  it('lets an account enable an entry the global layer disabled', async () => {
    writeGlobal([{ id: 'aaaa1111', name: 'alpha', disabled: true, config: { n: 3 } }])
    writeOverlay(UIN, { aaaa1111: { disabled: false } })
    await boot()
    expect(byName('alpha')).toMatchObject({ disabled: true, state: 'disposed' })
    expect(globalThis.__pluginTest).toEqual([])

    await login()
    await expect.poll(() => byName('alpha').state).toBe('active')
    expect(byName('alpha').disabled).toBe(false)
    expect(globalThis.__pluginTest).toEqual(['apply:3:x'])
  })

  it('lets an account disable an entry the global layer enabled', async () => {
    writeGlobal([{ id: 'aaaa1111', name: 'alpha' }])
    writeOverlay(UIN, { aaaa1111: { disabled: true } })
    await boot()
    await expect.poll(() => byName('alpha').state).toBe('active')

    await login()
    await expect.poll(() => byName('alpha').disabled).toBe(true)
    expect(byName('alpha').state).toBe('disposed')
    expect(globalThis.__pluginTest.at(-1)).toBe('dispose:1:x')
  })

  it('stores an account-scoped write as a diff against the global effective value', async () => {
    writeGlobal([{ id: 'aaaa1111', name: 'alpha', config: { n: 2 } }])
    const plugins = await boot()
    await login()
    const { id } = byName('alpha')

    await plugins.updateConfig(id, { n: 2, tag: 'only-here' }, 'account')

    // the global layer is untouched; only what differs from it lands in the account file
    expect(readGlobal().entries[0].config).toEqual({ n: 2 })
    expect(readOverlay(UIN).entries[id]).toEqual({ config: { tag: 'only-here' } })
    expect(globalThis.__pluginTest.at(-1)).toBe('apply:2:only-here')
  })

  it('routes an unscoped write to the layer the effective value comes from', async () => {
    writeGlobal([{ id: 'aaaa1111', name: 'alpha', config: { n: 2 } }])
    writeOverlay(UIN, { aaaa1111: { config: { n: 5 } } })
    const plugins = await boot()
    await login()
    const { id } = byName('alpha')

    // this entry already gets its value from the account layer, so the write stays there
    await plugins.updateConfig(id, { n: 9, tag: 'x' })
    expect(readGlobal().entries[0].config).toEqual({ n: 2 })
    expect(readOverlay(UIN).entries[id]).toEqual({ config: { n: 9 } })
  })

  it('writes the global layer when the account overrides nothing', async () => {
    writeGlobal([{ id: 'aaaa1111', name: 'alpha', config: { n: 2 } }])
    const plugins = await boot()
    await login()
    const { id } = byName('alpha')

    await plugins.updateConfig(id, { n: 4, tag: 'x' })
    expect(readGlobal().entries[0].config).toEqual({ n: 4 })
    expect(existsSync(accountFile(UIN))).toBe(false)
  })

  it('lets llbot.configScope pick the layer when neither layer has configured the entry', async () => {
    writeFileSync(path.join(pluginRoot, 'alpha', 'package.json'), JSON.stringify({
      name: 'alpha', version: '1.0.0', type: 'module', main: 'index.js', llbot: { configScope: 'account' },
    }))
    writeGlobal([{ id: 'aaaa1111', name: 'alpha' }])
    const plugins = await boot()
    await login()
    const { id } = byName('alpha')

    expect((await plugins.describe(id)).scope).toBe('account')
    await plugins.updateConfig(id, { n: 4, tag: 'x' })
    expect(readGlobal().entries[0].config).toBeUndefined()
    expect(readOverlay(UIN).entries[id]).toEqual({ config: { n: 4 } })
  })

  it('reports both layers and the effective value', async () => {
    writeGlobal([{ id: 'aaaa1111', name: 'alpha', config: { n: 2 } }])
    writeOverlay(UIN, { aaaa1111: { config: { n: 5 } } })
    const plugins = await boot()
    await login()

    const description = await plugins.describe(byName('alpha').id)
    expect(description).toMatchObject({
      defaults: { n: 1, tag: 'x' },
      global: { n: 2 },
      account: { n: 5 },
      effective: { n: 5, tag: 'x' },
      scope: 'account',
    })
  })

  it('drops overrides of entries that no longer exist when it next writes', async () => {
    writeGlobal([{ id: 'aaaa1111', name: 'alpha', config: { n: 2 } }])
    writeOverlay(UIN, { aaaa1111: { config: { n: 5 } }, deadbeef: { config: { n: 9 } } })
    const plugins = await boot()
    await login()
    const { id } = byName('alpha')

    await plugins.updateConfig(id, { n: 6, tag: 'x' }, 'account')
    expect(Object.keys(readOverlay(UIN).entries)).toEqual([id])
  })

  it('ignores an account override that tries to disable a core builtin', async () => {
    const builtins: BuiltinPlugin[] = [{
      name: 'builtin:core-thing',
      core: true,
      manifest: {},
      plugin: {
        apply(ctx: Context) {
          globalThis.__pluginTest.push('core:apply')
          ctx.effect(() => () => globalThis.__pluginTest.push('core:down'))
        },
      },
    }]
    await boot(builtins)
    const { id } = byName('builtin:core-thing')
    writeOverlay(UIN, { [id]: { disabled: true } })
    await login()

    expect(byName('builtin:core-thing').disabled).toBe(false)
    expect(byName('builtin:core-thing').state).toBe('active')
  })

  it('keeps running on the global layer when the overlay file is unparsable', async () => {
    writeGlobal([{ id: 'aaaa1111', name: 'alpha', config: { n: 2 } }])
    const target = accountFile(UIN)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, '{ entries: [')
    await boot()
    await expect.poll(() => byName('alpha').state).toBe('active')

    await login()
    expect(byName('alpha').state).toBe('active')
    expect(globalThis.__pluginTest).toEqual(['apply:2:x'])
  })
})

describe('optimistic concurrency on a config write', () => {
  beforeEach(() => {
    writeGlobal([{ id: 'aaaa1111', name: 'alpha', config: { n: 2 } }])
  })

  it('rejects a write whose rev is stale and leaves the config alone', async () => {
    const plugins = await boot()
    const { id } = byName('alpha')
    const { rev } = await plugins.describe(id)

    // someone else saves first, which moves the rev on
    await plugins.updateConfig(id, { n: 3, tag: 'x' }, 'global', rev)

    await expect(plugins.updateConfig(id, { n: 4, tag: 'x' }, 'global', rev))
      .rejects.toBeInstanceOf(PluginRevConflictError)
    expect(readGlobal().entries[0].config).toEqual({ n: 3 })
  })

  it('accepts a write carrying the current rev, and the rev then moves', async () => {
    const plugins = await boot()
    const { id } = byName('alpha')
    const first = await plugins.describe(id)

    await plugins.updateConfig(id, { n: 8, tag: 'x' }, 'global', first.rev)
    const second = await plugins.describe(id)

    expect(readGlobal().entries[0].config).toEqual({ n: 8 })
    expect(second.rev).not.toBe(first.rev)
  })

  it('skips the check when no rev is supplied', async () => {
    const plugins = await boot()
    const { id } = byName('alpha')
    await plugins.updateConfig(id, { n: 5, tag: 'x' })
    expect(readGlobal().entries[0].config).toEqual({ n: 5 })
  })

  it('reports no accounts and a global write scope before login', async () => {
    const plugins = await boot()
    const description = await plugins.describe(byName('alpha').id)
    expect(description).toMatchObject({ uin: '', accounts: [], scope: 'global', account: null })
  })
})
