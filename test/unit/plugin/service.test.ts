import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import path from 'node:path'
import { Context, Fiber, type Message, Service } from 'cordis'
import TimerService from '@cordisjs/plugin-timer'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Schema from 'schemastery'
import type { Bot, NeutralEvent } from '@luckylillia/plugin-sdk'
import BotsService from '@/universal/bots'
import PluginService, {
  BuiltinConfig, BuiltinPlugin, PluginForbiddenError, PluginNotFoundError, PluginRevConflictError, PluginStatus,
  PluginTrustRequiredError, SECRET_MASK,
  UiPrefs,
} from '@/plugin/host'

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

async function boot(builtins?: BuiltinPlugin[]) {
  ctx = new Context()
  // A fiber awaited while still pending resolves at once, so let timer come up first
  await ctx.plugin(TimerService)
  service = await ctx.plugin(PluginService, { file, roots: [pluginRoot], builtins })
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

  it('keeps the role(\'secret\') fields of a package from the WebUI, in lists whatever order they come back in', async () => {
    writePlugin(pluginRoot, 'keys', {
      'index.js': `
        import Schema from 'schemastery'
        export const name = 'keys'
        export const Config = Schema.object({
          token: Schema.string().role('secret').default(''),
          ais: Schema.array(Schema.object({ name: Schema.string(), key: Schema.string().role('secret').default('') })).default([]),
        })
        export function apply() {}
      `,
    })
    const plugins = await boot()
    const { id } = byName('keys')
    const stored = () => JSON.parse(readFileSync(file, 'utf8')).entries.find((entry: { name: string }) => entry.name === 'keys').config
    await plugins.updateConfig(id, { token: 't0p', ais: [{ name: 'a', key: 'ka' }, { name: 'b', key: 'kb' }] })
    const description = await plugins.describe(id)
    expect(description.secrets).toEqual(['token', 'ais.*.key'])
    expect(JSON.stringify([description.config, description.effective])).not.toMatch(/t0p|ka|kb/)
    const shown = description.effective as { token: string; ais: { name: string; key: string }[] }
    expect(shown.token).toBe(SECRET_MASK)
    // b moved up, a went away, c is new: each key stays with its own item
    await plugins.updateConfig(id, { ...shown, ais: [shown.ais[1], { name: 'c', key: 'kc' }] })
    expect(stored()).toEqual({ token: 't0p', ais: [{ name: 'b', key: 'kb' }, { name: 'c', key: 'kc' }] })
    const again = (await plugins.describe(id)).effective as typeof shown
    await expect(plugins.updateConfig(id, { ...again, ais: [{ name: 'b', key: `${SECRET_MASK}#00000000` }] }))
      .rejects.toMatchObject({ issues: [{ path: ['ais', '0', 'key'] }] })
    // A blank in a list empties that one key
    await plugins.updateConfig(id, { ...again, ais: [{ ...again.ais[0], key: '' }, again.ais[1]] })
    expect(stored().ais.map((ai: { key?: string }) => ai.key ?? '')).toEqual(['', 'kc'])
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

  it('keeps an entry enabled through another plugin running after that plugin goes away', async () => {
    // What the WebUI does: PluginRoutes calls ctx.plugins.enable(), so inside the service this.ctx is
    // the routes plugin's context. The entry must still belong to the plugin service, not to the caller.
    await boot()
    const { id } = byName('alpha')
    const caller = await ctx.plugin({
      inject: ['plugins'],
      apply(callerCtx: Context) {
        callerCtx.effect(() => {
          void callerCtx.plugins.enable(id)
          return () => {}
        })
      },
    })
    await expect.poll(() => byName('alpha').state).toBe('active')

    await caller.dispose()

    expect(byName('alpha').state).toBe('active')
    expect(globalThis.__pluginTest).toEqual(['apply:1'])
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

describe('PluginService log sources', () => {
  function capture(plugins: PluginService) {
    const records: { message: Message; source: ReturnType<PluginService['logSource']> }[] = []
    ctx.logger.exporter({
      export(message) {
        const fiber = message.fiber?.deref()
        records.push({ message, source: fiber ? plugins.logSource(fiber) : undefined })
      },
    })
    return records
  }

  it('attributes default, explicitly named and nested loggers to the owning package at emission', async () => {
    const name = 'luckylillia-plugin-logging'
    writePlugin(pluginRoot, name, {
      'index.js': `
        export const name = 'runtime-name'
        export async function apply(ctx) {
          ctx.logger.info('default')
          ctx.logger('shared-channel').info('explicit')
          await ctx.plugin({
            name: 'NestedHelper',
            apply(child) { child.logger.info('nested') },
          })
        }
      `,
    }, { llbot: { title: { zh: '日志插件', 'zh-CN': '备用中文', en: 'Logging' } } })
    const plugins = await boot()
    const records = capture(plugins)
    const { id } = byName(name)
    await plugins.enable(id)
    expect(records.map(record => ({ name: record.message.name, source: record.source }))).toEqual([
      { name: 'runtime-name', source: { id, name, title: '日志插件' } },
      { name: 'shared-channel', source: { id, name, title: '日志插件' } },
      { name: 'nested-helper', source: { id, name, title: '日志插件' } },
    ])

    // An unrelated logger can use the very same namespace without belonging to that package.
    ctx.logger('shared-channel').info('host')
    expect(records.at(-1)).toMatchObject({ message: { name: 'shared-channel' }, source: undefined })
  })

  it('uses the builtin title while keeping its independent standby logger unassigned', async () => {
    const name = 'builtin:logged'
    const plugins = await boot([{
      name,
      title: '协议端日志',
      manifest: { title: 'Manifest title' },
      plugin: {
        inject: ['gate'],
        apply(child: Context) { child.logger('transport').info('builtin') },
      },
      standby: {
        name: 'setup-helper',
        inject: ['gate'],
        apply(child: Context) { child.logger.info('standby') },
      },
    }])
    const records = capture(plugins)
    await ctx.plugin(Gate)
    await expect.poll(() => records.length).toBe(2)
    expect(records.find(record => record.message.args[0] === 'builtin')).toMatchObject({
      source: { id: byName(name).id, name, title: '协议端日志' },
    })
    expect(records.find(record => record.message.args[0] === 'standby')).toMatchObject({
      message: { name: 'setup-helper' }, source: undefined,
    })
  })

  it('keeps disposal logs attributed and falls back after the entry is removed', async () => {
    const name = 'luckylillia-plugin-disposal'
    writePlugin(pluginRoot, name, {
      'index.js': `
        export function apply(ctx) {
          const logger = ctx.logger('cleanup-channel')
          logger.info('started')
          ctx.effect(() => () => logger.info('disposed'))
        }
      `,
    }, { llbot: { title: '   ' } })
    const plugins = await boot()
    const records = capture(plugins)
    const { id } = byName(name)
    const expected = { id, name, title: 'disposal' }
    await plugins.enable(id)
    await plugins.disable(id)
    expect(records.map(record => ({ text: record.message.args[0], source: record.source }))).toEqual([
      { text: 'started', source: expected },
      { text: 'disposed', source: expected },
    ])
    const fiber = records[0].message.fiber!.deref()!
    expect(plugins.logSource(fiber)).toEqual(expected)
    await plugins.remove(id)
    expect(plugins.logSource(fiber)).toBeUndefined()
    // Already captured records do not depend on the entry remaining installed.
    expect(records[0].source).toEqual(expected)
  })
})

class Gate extends Service {
  constructor(ctx: Context) {
    super(ctx, 'gate')
  }
}

const builtins: BuiltinPlugin[] = [
  {
    name: 'builtin:adapter',
    title: 'Adapter',
    manifest: { icon: 'radio' },
    plugin: {
      inject: ['gate'],
      apply(ctx: Context) {
        globalThis.__pluginTest.push('adapter:up')
        ctx.effect(() => () => globalThis.__pluginTest.push('adapter:down'))
      },
    },
  },
  {
    name: 'builtin:core',
    title: 'Core',
    manifest: {},
    core: true,
    plugin: { apply() {} },
  },
]

const adapterEvents = () => globalThis.__pluginTest.filter(event => event.startsWith('adapter:'))

describe('PluginService builtins', () => {
  it('lists builtins as enabled entries that start once their dependencies are up', async () => {
    await boot(builtins)
    expect(byName('builtin:adapter')).toMatchObject({
      builtin: true,
      core: false,
      title: 'Adapter',
      disabled: false,
      hasConfig: false,
      state: 'pending',
      missingDeps: ['gate'],
    })
    await expect.poll(() => byName('builtin:core').state).toBe('active')
    expect(byName('builtin:core').core).toBe(true)
    const saved = JSON.parse(readFileSync(file, 'utf8')).entries
    expect(saved.map((entry: { name: string; disabled?: boolean }) => [entry.name, !!entry.disabled])).toEqual([
      ['builtin:adapter', false],
      ['builtin:core', false],
      ['alpha', true],
    ])

    await ctx.plugin(Gate)
    await expect.poll(() => byName('builtin:adapter').state).toBe('active')
    expect(adapterEvents()).toEqual(['adapter:up'])
  })

  it('restarts and toggles a builtin, but refuses to remove, duplicate or configure it', async () => {
    const plugins = await boot(builtins)
    await ctx.plugin(Gate)
    const { id } = byName('builtin:adapter')
    await expect.poll(() => byName('builtin:adapter').state).toBe('active')

    expect(await plugins.reload(id)).toEqual({ status: 'reloaded' })
    expect(adapterEvents()).toEqual(['adapter:up', 'adapter:down', 'adapter:up'])
    expect(byName('builtin:adapter')).toMatchObject({ state: 'active', reloadCount: 0 })

    expect(await plugins.disable(id)).toMatchObject({ state: 'disposed', disabled: true })
    expect(adapterEvents().at(-1)).toBe('adapter:down')

    await expect(plugins.remove(id)).rejects.toBeInstanceOf(PluginForbiddenError)
    await expect(plugins.add('builtin:adapter')).rejects.toBeInstanceOf(PluginForbiddenError)
    await expect(plugins.updateConfig(id, {})).rejects.toBeInstanceOf(PluginForbiddenError)
    await expect(plugins.describe(id)).rejects.toBeInstanceOf(PluginForbiddenError)

    expect(await plugins.enable(id)).toMatchObject({ state: 'active', disabled: false })
    expect(adapterEvents().at(-1)).toBe('adapter:up')
  })

  it('keeps a disabled builtin off across restarts but always runs core ones', async () => {
    writeFileSync(file, JSON.stringify({
      version: 1,
      entries: [
        { id: 'aaaa0001', name: 'builtin:adapter', disabled: true },
        { id: 'aaaa0002', name: 'builtin:core', disabled: true },
        { id: 'aaaa0003', name: 'builtin:core' },
      ],
    }))
    const plugins = await boot(builtins)
    await ctx.plugin(Gate)
    expect(byName('builtin:adapter')).toMatchObject({ disabled: true, state: 'disposed' })
    await expect.poll(() => byName('builtin:core')).toMatchObject({ id: 'aaaa0002', disabled: false, state: 'active' })
    expect(plugins.list().filter(status => status.name === 'builtin:core')).toHaveLength(1)
    expect(JSON.parse(readFileSync(file, 'utf8')).entries.slice(0, 2)).toEqual([
      { id: 'aaaa0001', name: 'builtin:adapter', disabled: true },
      { id: 'aaaa0002', name: 'builtin:core' },
    ])
    await expect(plugins.disable('aaaa0002')).rejects.toBeInstanceOf(PluginForbiddenError)
    expect(adapterEvents()).toEqual([])
  })

  it('runs the standby part of a builtin whatever its switch says, for as long as the service runs', async () => {
    writeFileSync(file, JSON.stringify({ version: 1, entries: [{ id: 'aaaa0001', name: 'builtin:adapter', disabled: true }] }))
    const standby = {
      name: 'adapter-standby',
      inject: ['gate'],
      apply(ctx: Context) {
        globalThis.__pluginTest.push('standby:up')
        ctx.effect(() => () => globalThis.__pluginTest.push('standby:down'))
      },
    }
    const plugins = await boot([{ ...builtins[0], standby }])
    const events = () => globalThis.__pluginTest.filter(event => event.startsWith('standby:'))
    // It waits for what it injects like any plugin
    expect(events()).toEqual([])
    await ctx.plugin(Gate)
    await expect.poll(events).toEqual(['standby:up'])
    expect(byName('builtin:adapter')).toMatchObject({ disabled: true, state: 'disposed' })

    // No part of the entry: switching that on and off leaves it be
    await plugins.enable('aaaa0001')
    await plugins.disable('aaaa0001')
    expect(events()).toEqual(['standby:up'])

    await service!.dispose()
    service = undefined
    expect(events()).toEqual(['standby:up', 'standby:down'])
  })
})

interface Listener {
  host: string
  port: number
  token: string
}

const ListenerSchema = Schema.object({
  host: Schema.string().default('127.0.0.1'),
  port: Schema.natural().max(65535).default(5600),
  token: Schema.string().default(''),
})

const listenerSettings: BuiltinConfig<Listener> = {
  check: (value, enabled) => enabled && !value.host && !value.token
    ? [{ path: ['token'], message: 'a public listener needs a token' }]
    : [],
  checkOnEnable: true,
  secrets: ['token'],
  initial: () => ({ enabled: false, config: { host: '127.0.0.1', port: 5600, token: 'secret' } }),
}

const settingsBuiltins: BuiltinPlugin[] = [{
  name: 'builtin:listener',
  title: 'Listener',
  manifest: {},
  config: listenerSettings,
  plugin: {
    name: 'listener',
    Config: ListenerSchema,
    apply(builtinCtx: Context, config: Listener) {
      globalThis.__pluginTest.push(`listener:up:${config.port}`)
      builtinCtx.effect(() => () => globalThis.__pluginTest.push(`listener:down:${config.port}`))
    },
  },
}]

const listenerEvents = () => globalThis.__pluginTest.filter(event => event.startsWith('listener:'))
const storedEntry = () => JSON.parse(readFileSync(file, 'utf8')).entries.find((entry: { name: string }) => entry.name === 'builtin:listener')

describe('PluginService builtins with settings', () => {
  it('starts a new entry from its initial settings', async () => {
    await boot(settingsBuiltins)
    expect(byName('builtin:listener')).toMatchObject({ hasConfig: true, disabled: true, state: 'disposed' })
    // stored as a diff against the schema defaults
    expect(storedEntry()).toMatchObject({ disabled: true, config: { token: 'secret' } })
    expect(listenerEvents()).toEqual([])
  })

  it('describes the settings with the schema, masking secrets', async () => {
    const plugins = await boot(settingsBuiltins)
    const description = await plugins.describe(byName('builtin:listener').id)
    expect(description).toMatchObject({
      defaults: { host: '127.0.0.1', port: 5600, token: '' },
      effective: { host: '127.0.0.1', port: 5600, token: SECRET_MASK },
      secrets: ['token'],
    })
  })

  it('keeps a secret sent back masked or blank, and restarts the running plugin on a change', async () => {
    const plugins = await boot(settingsBuiltins)
    const { id } = byName('builtin:listener')
    const token = () => (plugins.builtinSettings('builtin:listener')!.config as Listener).token
    await plugins.enable(id)
    await expect.poll(() => listenerEvents()).toEqual(['listener:up:5600'])

    await plugins.updateConfig(id, { host: '127.0.0.1', port: 6000, token: SECRET_MASK })
    expect(plugins.builtinSettings('builtin:listener')).toMatchObject({ enabled: true, config: { port: 6000, token: 'secret' } })
    await expect.poll(() => listenerEvents()).toEqual(['listener:up:5600', 'listener:down:5600', 'listener:up:6000'])
    await plugins.updateConfig(id, { host: '127.0.0.1', port: 6000, token: '' })
    expect(token()).toBe('secret')
    await plugins.updateConfig(id, { host: '127.0.0.1', port: 6000 }, undefined, ['token'])
    expect(token()).toBe('')
  })

  it('refuses what the schema or its rules reject, and a stale rev', async () => {
    const plugins = await boot(settingsBuiltins)
    const { id } = byName('builtin:listener')
    await plugins.enable(id)

    await expect(plugins.updateConfig(id, { host: '127.0.0.1', port: 70000, token: '' }))
      .rejects.toMatchObject({ issues: [{ path: ['port'] }] })
    await expect(plugins.updateConfig(id, { host: '', port: 5600 }, undefined, ['token']))
      .rejects.toMatchObject({ issues: [{ path: ['token'], message: 'a public listener needs a token' }] })
    const { rev } = await plugins.describe(id)
    await plugins.updateConfig(id, { host: '127.0.0.1', port: 5601 }) // someone else saves first
    await expect(plugins.updateConfig(id, { host: '127.0.0.1', port: 7000 }, rev)).rejects.toBeInstanceOf(PluginRevConflictError)
    expect(storedEntry().config.port).toBe(5601)
  })

  it('takes a config its rules would refuse while off, but does not switch it on', async () => {
    const plugins = await boot(settingsBuiltins)
    const { id } = byName('builtin:listener')
    await plugins.updateConfig(id, { host: '', port: 5600 }, undefined, ['token'])
    await expect(plugins.enable(id)).rejects.toMatchObject({ issues: [{ path: ['token'] }] })
    expect(byName('builtin:listener').disabled).toBe(true)
    // OneBot set_config never had the rules, and opts out of them
    await plugins.enable(id, { rules: false })
    expect(byName('builtin:listener').disabled).toBe(false)
  })

  it('switches like any plugin: unmounted while off', async () => {
    const plugins = await boot(settingsBuiltins)
    const { id } = byName('builtin:listener')
    expect(await plugins.enable(id)).toMatchObject({ disabled: false, state: 'active' })
    expect(storedEntry().disabled).toBeUndefined()
    expect(await plugins.disable(id)).toMatchObject({ disabled: true, state: 'disposed' })
    expect(storedEntry().disabled).toBe(true)
    expect(listenerEvents()).toEqual(['listener:up:5600', 'listener:down:5600'])
  })
})

function translator(dir: string) {
  writePlugin(pluginRoot, dir, {
    'index.js': `
      import { Service } from 'cordis'
      export default class Translator extends Service {
        constructor(ctx) { super(ctx, 'translator') }
      }
    `,
  }, { llbot: { service: { implements: ['translator'] } } })
}

describe('PluginService package dependencies', () => {
  function consumer(dependencies = { gateway: '^1.0.0' }, inject: string[] = []) {
    writePlugin(pluginRoot, 'package-consumer', {
      'index.js': `
        globalThis.__pluginTest.push('consumer:import')
        export const inject = ${JSON.stringify(inject)}
        export function apply(ctx) {
          globalThis.__pluginTest.push('consumer:start')
          ctx.effect(() => () => globalThis.__pluginTest.push('consumer:stop'))
        }
      `,
    }, { llbot: { dependencies } })
  }

  function provider(version = '1.0.0') {
    writePlugin(pluginRoot, 'gateway', { 'index.js': 'export function apply() {}' }, { version })
  }

  function changeManifest(name: string, patch: Record<string, unknown>) {
    const filename = path.join(pluginRoot, name, 'package.json')
    const current = JSON.parse(readFileSync(filename, 'utf8'))
    writeFileSync(filename, JSON.stringify({ ...current, ...patch }))
  }

  it('requires the named plugin package even when another plugin provides its service', async () => {
    consumer({ gateway: '^1.0.0' }, ['translator'])
    translator('alternate')
    const plugins = await boot()
    await plugins.enable(byName('alternate').id)
    const { id } = byName('package-consumer')
    expect(await plugins.enable(id)).toMatchObject({ state: 'pending', missingDeps: [], error: expect.stringContaining('gateway ^1.0.0') })
    expect(plugins.dependencies(id).packages).toEqual([{ name: 'gateway', range: '^1.0.0', entries: [], state: 'missing' }])
    expect(globalThis.__pluginTest).toEqual([])
  })

  it('checks installed packages without enabling them, and leaves service availability to inject', async () => {
    consumer({ gateway: '^1.0.0' }, ['translator'])
    translator('gateway')
    const plugins = await boot()
    const { id } = byName('package-consumer')
    const gateway = byName('gateway').id
    expect(await plugins.enable(id)).toMatchObject({ state: 'pending', missingDeps: ['translator'] })
    expect(plugins.dependencies(id).packages).toEqual([{ name: 'gateway', range: '^1.0.0', version: '1.0.0', entries: [gateway], state: 'disabled' }])
    expect(byName('gateway').disabled).toBe(true)
    await plugins.enable(gateway)
    await expect.poll(() => byName('package-consumer').state).toBe('active')
    expect(plugins.dependencies(id).packages?.[0].state).toBe('active')
    await plugins.disable(gateway)
    await expect.poll(() => byName('package-consumer').state).toBe('pending')
    expect(plugins.dependencies(id).packages?.[0].state).toBe('disabled')
  })

  it('starts after installation, stops after removal or incompatible upgrades, and recovers on a compatible rescan', async () => {
    consumer()
    const plugins = await boot()
    const { id } = byName('package-consumer')
    await plugins.enable(id)
    provider()
    await plugins.scan()
    await expect.poll(() => byName('package-consumer').state).toBe('active')
    expect(byName('gateway').disabled).toBe(true)
    rmSync(path.join(pluginRoot, 'gateway'), { recursive: true, force: true })
    await plugins.scan()
    expect(byName('package-consumer')).toMatchObject({ state: 'pending', error: expect.stringContaining('not installed') })
    expect(globalThis.__pluginTest.at(-1)).toBe('consumer:stop')
    provider('1.1.0')
    await plugins.scan()
    await expect.poll(() => byName('package-consumer').state).toBe('active')
    changeManifest('gateway', { version: '2.0.0' })
    await plugins.scan()
    expect(byName('package-consumer')).toMatchObject({ state: 'incompatible', error: expect.stringContaining('installed version is 2.0.0') })
    expect(plugins.dependencies(id).packages?.[0]).toMatchObject({ state: 'incompatible', version: '2.0.0' })
    expect(globalThis.__pluginTest.at(-1)).toBe('consumer:stop')
    changeManifest('gateway', { version: '1.2.0' })
    await plugins.scan()
    await expect.poll(() => byName('package-consumer').state).toBe('active')
    expect(globalThis.__pluginTest).toEqual([
      'consumer:import', 'consumer:start', 'consumer:stop', 'consumer:start', 'consumer:stop', 'consumer:start',
    ])
  })

  it('enforces changed requirements on both rescan and reload without keeping the old consumer running', async () => {
    consumer()
    provider()
    const plugins = await boot()
    const { id } = byName('package-consumer')
    await plugins.enable(id)
    changeManifest('package-consumer', { llbot: { dependencies: { gateway: '^2.0.0' } } })
    await plugins.scan()
    expect(byName('package-consumer').state).toBe('incompatible')
    expect(globalThis.__pluginTest.at(-1)).toBe('consumer:stop')
    changeManifest('package-consumer', { llbot: { dependencies: { gateway: '^1.0.0' } } })
    await plugins.scan()
    await expect.poll(() => byName('package-consumer').state).toBe('active')
    changeManifest('package-consumer', { llbot: { dependencies: { gateway: '^3.0.0' } } })
    await plugins.reload(id)
    expect(byName('package-consumer').state).toBe('incompatible')
    expect(globalThis.__pluginTest.at(-1)).toBe('consumer:stop')
  })

  it('reevaluates consumers when a provider package reload changes its version', async () => {
    consumer()
    provider()
    const plugins = await boot()
    await plugins.enable(byName('package-consumer').id)
    changeManifest('gateway', { version: '2.0.0' })
    await plugins.reload(byName('gateway').id)
    expect(byName('package-consumer').state).toBe('incompatible')
    expect(globalThis.__pluginTest.at(-1)).toBe('consumer:stop')
    changeManifest('gateway', { version: '1.5.0' })
    await plugins.reload(byName('gateway').id)
    await expect.poll(() => byName('package-consumer').state).toBe('active')
  })

  it('does not wait for recovered initializers that call scan themselves', async () => {
    consumer()
    writeFileSync(path.join(pluginRoot, 'package-consumer', 'index.js'), `
      export const inject = ['plugins']
      export async function apply(ctx) {
        await ctx.plugins.scan()
        globalThis.__pluginTest.push('consumer:ready')
      }
    `)
    const plugins = await boot()
    await plugins.enable(byName('package-consumer').id)
    provider()
    await plugins.scan()
    await expect.poll(() => byName('package-consumer').state).toBe('active')
    expect(globalThis.__pluginTest).toEqual(['consumer:ready'])
  })
})

describe('PluginService dependencies', () => {
  beforeEach(() => {
    translator('deepl')
    translator('google')
    writePlugin(pluginRoot, 'consumer', {
      'index.js': `export const inject = ['translator', 'timer']
export function apply() {}`,
    }, { llbot: { service: { required: ['translator'], optional: ['puppeteer'] } } })
  })

  it('reads the manifest before the module loads and adds its inject once it has', async () => {
    const plugins = await boot()
    const { id } = byName('consumer')
    expect(byName('consumer').service).toEqual({ required: ['translator'], optional: ['puppeteer'], implements: [] })
    await plugins.enable(id)
    expect(byName('consumer').service.required).toEqual(['translator', 'timer'])
  })

  it('reports who provides each service and who could', async () => {
    const plugins = await boot()
    const consumer = byName('consumer').id
    const deepl = byName('deepl').id
    const google = byName('google').id

    expect(plugins.dependencies(consumer)).toEqual({
      dependencies: [
        { name: 'translator', required: true, available: false, provider: undefined, candidates: [deepl, google] },
        { name: 'puppeteer', required: false, available: false, provider: undefined, candidates: [] },
      ],
      conflicts: [],
    })

    await plugins.enable(deepl)
    await plugins.enable(consumer)
    const [translatorDep, timerDep] = plugins.dependencies(consumer).dependencies
    expect(translatorDep).toMatchObject({ name: 'translator', available: true, provider: deepl })
    // Provided by the bot itself rather than by an entry
    expect(timerDep).toMatchObject({ name: 'timer', available: true, provider: undefined })
    expect(byName('consumer').state).toBe('active')
  })

  it('flags two enabled providers of one service, and cordis refuses the second', async () => {
    const plugins = await boot()
    const deepl = byName('deepl').id
    const google = byName('google').id
    await plugins.enable(deepl)
    expect(plugins.dependencies(google).conflicts).toEqual([{ service: 'translator', with: [deepl] }])
    expect(plugins.dependencies(deepl).conflicts).toEqual([])

    await plugins.enable(google)
    await expect.poll(() => byName('google')).toMatchObject({ state: 'failed', error: expect.stringMatching(/has been registered/) })
    expect(plugins.dependencies(deepl).conflicts).toEqual([{ service: 'translator', with: [google] }])
  })
})

describe('PluginService webui', () => {
  function uiPlugin(dir: string) {
    writePlugin(pluginRoot, dir, { 'index.js': 'export function apply() {}' }, { llbot: { webui: 'webui/index.js' } })
    mkdirSync(path.join(pluginRoot, dir, 'webui', 'chunks'), { recursive: true })
    writeFileSync(path.join(pluginRoot, dir, 'webui', 'index.js'), 'export default () => {}')
    writeFileSync(path.join(pluginRoot, dir, 'webui', 'chunks', 'page.js'), '')
  }

  it('serves the module directory under a URL that changes when the plugin reloads', async () => {
    uiPlugin('ui')
    uiPlugin('@scope/ui')
    const plugins = await boot()
    expect(byName('ui').webui).toBe('/plugin-webui/ui/0/index.js')
    expect(byName('@scope/ui').webui).toBe('/plugin-webui/@scope+ui/0/index.js')
    expect(byName('alpha').webui).toBeUndefined()

    expect(plugins.webuiAsset('ui', 'chunks/page.js')?.endsWith(path.join('ui', 'webui', 'chunks', 'page.js'))).toBe(true)
    expect(plugins.webuiAsset('@scope+ui', 'index.js')?.endsWith(path.join('@scope', 'ui', 'webui', 'index.js'))).toBe(true)
    // Only the module directory: not the backend code next to it, nor other packages
    expect(plugins.webuiAsset('ui', '../index.js')).toBeUndefined()
    expect(plugins.webuiAsset('ui', '../../alpha/index.js')).toBeUndefined()
    expect(plugins.webuiAsset('alpha', 'index.js')).toBeUndefined()

    const { id } = byName('ui')
    await plugins.enable(id)
    expect(await plugins.reload(id)).toEqual({ status: 'reloaded' })
    expect(byName('ui').webui).toBe('/plugin-webui/ui/1/index.js')
  })

  it('persists UI visibility and ordering while serving modules directly', async () => {
    uiPlugin('ui')
    const plugins = await boot()
    const announced: UiPrefs[] = []
    ctx.on('plugins/ui', prefs => announced.push(prefs))
    expect(plugins.uiPrefs()).toEqual({ hidden: [], order: {} })
    expect(plugins.webuiAsset('ui', 'index.js')).toBeDefined()

    const prefs = await plugins.updateUiPrefs({
      hide: ['ui|dashboard.cards|x', 'ui|page|ui:home', 7 as never],
      order: { 'ui|dashboard.cards|x': 20, 'ui|dashboard.cards|y': 10 },
    })
    expect(prefs).toEqual({
      hidden: ['ui|dashboard.cards|x', 'ui|page|ui:home'],
      order: { 'ui|dashboard.cards|x': 20, 'ui|dashboard.cards|y': 10 },
    })
    expect(announced.at(-1)).toEqual(prefs)
    expect(await plugins.updateUiPrefs({ show: ['ui|page|ui:home'], order: { 'ui|dashboard.cards|y': null } })).toEqual({
      hidden: ['ui|dashboard.cards|x'],
      order: { 'ui|dashboard.cards|x': 20 },
    })
    expect(JSON.parse(readFileSync(file, 'utf8')).ui).toEqual(plugins.uiPrefs())

    await service!.dispose()
    await boot()
    expect(ctx.plugins.uiPrefs().hidden).toEqual(['ui|dashboard.cards|x'])
    expect(ctx.plugins.webuiAsset('ui', 'index.js')).toBeDefined()
  })
})

describe('PluginService details', () => {
  function showcase(dir: string, pkg: Record<string, unknown>, files: Record<string, string>) {
    writePlugin(pluginRoot, dir, { 'index.js': 'export function apply() {}' }, pkg)
    for (const [name, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(pluginRoot, dir, name)), { recursive: true })
      writeFileSync(path.join(pluginRoot, dir, name), content)
    }
  }

  it('lists the author, an image icon and whether there are details, which it reads when asked', async () => {
    showcase('@scope/shown', {
      version: '2.1.0',
      author: 'Alice <a@b.c> (https://alice.dev)',
      llbot: { icon: 'assets/icon.png', details: 'docs/details.md', screenshots: ['assets/a.png', { src: 'assets/b.gif', caption: '群里' }] },
    }, { 'assets/icon.png': '', 'docs/details.md': '# 介绍', 'assets/a.png': '', 'assets/b.gif': '' })
    showcase('plain', { llbot: { icon: 'timer' } }, {})
    const plugins = await boot()
    expect(byName('@scope/shown')).toMatchObject({
      author: { name: 'Alice', email: 'a@b.c', url: 'https://alice.dev' },
      iconUrl: '/plugin-assets/@scope+shown/2.1.0/assets/icon.png',
      hasDetails: true,
    })
    expect(byName('plain')).not.toHaveProperty('iconUrl')
    expect(byName('plain')).not.toHaveProperty('hasDetails')
    expect(byName('plain')).not.toHaveProperty('author')

    const id = byName('@scope/shown').id
    expect(await plugins.details(id)).toEqual({
      markdown: '# 介绍',
      base: '/plugin-assets/@scope+shown/2.1.0/docs/',
      screenshots: [
        { url: '/plugin-assets/@scope+shown/2.1.0/assets/a.png' },
        { url: '/plugin-assets/@scope+shown/2.1.0/assets/b.gif', caption: '群里' },
      ],
    })
    // An edit shows without a rescan
    writeFileSync(path.join(pluginRoot, '@scope/shown', 'docs', 'details.md'), '# 改过')
    expect((await plugins.details(id)).markdown).toBe('# 改过')
    expect(await plugins.details(byName('plain').id)).toEqual({ base: '/plugin-assets/plain/1.0.0/', screenshots: [] })
    await expect(plugins.details('nope')).rejects.toBeInstanceOf(PluginNotFoundError)
  })

  it('sends the list out again when a rescan finds an edit of what the WebUI shows, without reloading', async () => {
    showcase('edited', { llbot: { title: '旧名字' } }, {})
    const plugins = await boot()
    const changes: (string | undefined)[] = []
    ctx.on('plugins/changed', id => changes.push(id))
    await plugins.scan()
    expect(changes).toEqual([])

    showcase('edited', { llbot: { title: '新名字', icon: 'a.png' } }, { 'a.png': '' })
    expect(await plugins.scan()).toEqual({ added: [], changed: [], removed: [] })
    expect(changes).toEqual([undefined])
    expect(byName('edited')).toMatchObject({ manifest: { title: '新名字' }, iconUrl: '/plugin-assets/edited/1.0.0/a.png' })
  })

  it('serves only the images inside a package', async () => {
    showcase('pics', {}, { 'a.png': '', 'deep/b.SVG': '', 'notes.md': '' })
    const plugins = await boot()
    expect(plugins.asset('pics', 'a.png')).toBe(path.join(await realpath(path.join(pluginRoot, 'pics')), 'a.png'))
    expect(plugins.asset('pics', 'deep/b.SVG')).toBeDefined()
    for (const file of ['notes.md', 'index.js', 'package.json', '../alpha/x.png']) expect(plugins.asset('pics', file)).toBeUndefined()
    expect(plugins.asset('nope', 'a.png')).toBeUndefined()
  })
})

describe('trust in third-party packages', () => {
  async function bootTrusting() {
    ctx = new Context()
    await ctx.plugin(TimerService)
    service = await ctx.plugin(PluginService, { file, roots: [pluginRoot], trust: true })
  }

  it('starts one only once the user trusted it, and remembers that', async () => {
    await bootTrusting()
    const { id } = byName('alpha')
    await expect(ctx.plugins.enable(id)).rejects.toBeInstanceOf(PluginTrustRequiredError)
    await expect(ctx.plugins.add('alpha')).rejects.toBeInstanceOf(PluginTrustRequiredError)
    expect(byName('alpha')).toMatchObject({ disabled: true, trusted: false })
    await ctx.plugins.enable(id, { trust: true })
    expect(byName('alpha')).toMatchObject({ state: 'active', trusted: true })
    await ctx.plugins.disable(id)
    await ctx.plugins.enable(id)
    expect(byName('alpha').state).toBe('active')
    expect(JSON.parse(readFileSync(file, 'utf8')).trusted).toEqual(['alpha'])
  })

  it('trusts what already ran the first time it asks', async () => {
    writeFileSync(file, JSON.stringify({ version: 1, entries: [{ id: 'e0000001', name: 'alpha' }] }))
    await bootTrusting()
    await vi.waitFor(() => expect(byName('alpha')).toMatchObject({ state: 'active', trusted: true }))
    expect(JSON.parse(readFileSync(file, 'utf8')).trusted).toEqual(['alpha'])
  })
})

describe('where and in which order plugins take messages', () => {
  const bot: Bot = { platform: 'test', selfId: 'B', sid: 'test:B', status: 1, features: [], sendMessage: async () => [] }
  const say = (channelId: string, content = 'hi') => ctx.bots.dispatch(bot, {
    sn: 1, type: 'message-created', self_id: 'B', platform: 'test', timestamp: 0,
    user: { id: 'U' }, channel: { id: channelId, type: 0 }, guild: { id: channelId }, message: { id: 'm', content },
  } as NeutralEvent)

  beforeEach(() => {
    for (const name of ['one', 'two']) {
      writePlugin(pluginRoot, name, {
        'index.js': `
          export const name = '${name}'
          export const inject = ['bots']
          export function apply(ctx) {
            ctx.on('bot/message', (session, next) => {
              globalThis.__pluginTest.push('${name}:' + session.channelId)
              if (session.content === 'boom-${name}') throw new Error('boom')
              return next()
            })
          }
        `,
      })
    }
  })

  async function bootWithBots() {
    writeFileSync(file, JSON.stringify({ version: 1, entries: [{ id: 'e0000001', name: 'one' }, { id: 'e0000002', name: 'two' }] }))
    ctx = new Context()
    await ctx.plugin(TimerService)
    await ctx.plugin(BotsService)
    service = await ctx.plugin(PluginService, { file, roots: [pluginRoot] })
    await vi.waitFor(() => expect([byName('one').state, byName('two').state]).toEqual(['active', 'active']))
  }

  it('keeps what comes from outside its scope from a plugin, at once and on file', async () => {
    await bootWithBots()
    const scope = { guilds: { mode: 'allow', ids: ['G2'] } }
    await ctx.plugins.setScope('e0000002', scope)
    await say('G1')
    await say('G2')
    // The two start side by side, so either may have registered first
    expect(globalThis.__pluginTest.sort()).toEqual(['one:G1', 'one:G2', 'two:G2'])
    expect(byName('two').scope).toEqual(scope)
    expect(JSON.parse(readFileSync(file, 'utf8')).entries[1].scope).toEqual(scope)
    await ctx.plugins.setScope('e0000002', { guilds: { mode: 'deny', ids: [] } })
    expect(byName('two').scope).toBeUndefined()
  })

  it('runs the message listeners in the order set, and notes against a plugin what its listeners threw', async () => {
    await bootWithBots()
    expect([byName('one').messages, byName('two').messages]).toEqual([true, true])
    expect(await ctx.plugins.setMessageOrder(['e0000002', 'e0000001', 'nope'])).toEqual(['e0000002', 'e0000001'])
    expect([byName('two').rank, byName('one').rank]).toEqual([0, 1])
    await say('G1')
    expect(globalThis.__pluginTest).toEqual(['two:G1', 'one:G1'])
    await say('G1', 'boom-two')
    expect(globalThis.__pluginTest.slice(2)).toEqual(['two:G1', 'one:G1'])
    expect(byName('two').listenerError).toMatchObject({ message: 'boom', count: 1 })
    ctx.plugins.clearListenerError('e0000002')
    expect(byName('two').listenerError).toBeUndefined()
  })
})
