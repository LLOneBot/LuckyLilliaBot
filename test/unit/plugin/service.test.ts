import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Context, Fiber, Service } from 'cordis'
import TimerService from '@cordisjs/plugin-timer'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import Schema from 'schemastery'
import PluginService, {
  BuiltinConfigBinding, BuiltinPlugin, PluginForbiddenError, PluginRevConflictError, PluginStatus, PluginUnavailableError, SECRET_MASK,
} from '@/plugin'

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
})

interface Listener {
  enable: boolean
  host: string
  port: number
  token: string
}

const ListenerSchema = Schema.object({
  enable: Schema.boolean().default(false),
  host: Schema.string().default('127.0.0.1'),
  port: Schema.natural().max(65535).default(5600),
  token: Schema.string().default(''),
})

// A stand-in for an adapter's section of config_<uin>.json
let stored: Listener | undefined
let watchers: (() => void)[]

const binding: BuiltinConfigBinding<Listener> = {
  schema: ListenerSchema,
  scope: 'account',
  location: 'memory → listener',
  read: () => stored && structuredClone(stored),
  async write(_ctx, value) {
    stored = structuredClone(value)
    globalThis.__pluginTest.push(`write:${value.enable}:${value.port}:${value.token}`)
  },
  check: value => value.enable && !value.host && !value.token
    ? [{ path: ['token'], message: 'a public listener needs a token' }]
    : [],
  enabled: { get: value => value.enable, set: (value, on) => ({ ...value, enable: on }) },
  secrets: ['token'],
  watch(_ctx, changed) {
    watchers.push(changed)
    return () => {}
  },
}

const boundBuiltins: BuiltinPlugin[] = [{
  name: 'builtin:listener',
  title: 'Listener',
  manifest: {},
  config: binding,
  plugin: {
    apply(builtinCtx: Context) {
      globalThis.__pluginTest.push('listener:up')
      builtinCtx.effect(() => () => globalThis.__pluginTest.push('listener:down'))
    },
  },
}]

const listenerEvents = () => globalThis.__pluginTest.filter(event => event.startsWith('listener:'))
const writes = () => globalThis.__pluginTest.filter(event => event.startsWith('write:'))

describe('PluginService builtins bound to their own config', () => {
  beforeEach(() => {
    stored = { enable: false, host: '127.0.0.1', port: 5600, token: 'secret' }
    watchers = []
  })

  it('describes the bound value with the schema, masking secrets', async () => {
    const plugins = await boot(boundBuiltins)
    await expect.poll(() => byName('builtin:listener').state).toBe('disposed')
    expect(byName('builtin:listener')).toMatchObject({ bound: true, hasConfig: true, disabled: true })
    // switched off but still mounted
    expect(listenerEvents()).toEqual(['listener:up'])

    const description = await plugins.describe(byName('builtin:listener').id)
    expect(description).toMatchObject({
      defaults: { enable: false, host: '127.0.0.1', port: 5600, token: '' },
      effective: { enable: false, host: '127.0.0.1', port: 5600, token: SECRET_MASK },
      scope: 'account',
      fixedScope: true,
      location: 'memory → listener',
      secrets: ['token'],
      accounts: [],
    })
  })

  it('writes through the binding, keeping a secret sent back masked or blank', async () => {
    const plugins = await boot(boundBuiltins)
    const { id } = byName('builtin:listener')

    await plugins.updateConfig(id, { enable: false, host: '127.0.0.1', port: 6000, token: SECRET_MASK })
    expect(stored).toEqual({ enable: false, host: '127.0.0.1', port: 6000, token: 'secret' })
    await plugins.updateConfig(id, { enable: false, host: '127.0.0.1', port: 6001, token: '' })
    expect(stored!.token).toBe('secret')
    await plugins.updateConfig(id, { enable: false, host: '127.0.0.1', port: 6002 }, undefined, undefined, ['token'])
    expect(stored!.token).toBe('')
    // a write does not remount the plugin: it picks the value up itself
    expect(listenerEvents()).toEqual(['listener:up'])
  })

  it('refuses what the schema or the cross-field check rejects, a stale rev and another scope', async () => {
    const plugins = await boot(boundBuiltins)
    const { id } = byName('builtin:listener')
    const before = structuredClone(stored)

    await expect(plugins.updateConfig(id, { enable: false, host: '', port: 70000, token: '' }))
      .rejects.toMatchObject({ issues: [{ path: ['port'] }] })
    await expect(plugins.updateConfig(id, { enable: true, host: '', port: 5600, token: '' }, undefined, undefined, ['token']))
      .rejects.toMatchObject({ issues: [{ path: ['token'], message: 'a public listener needs a token' }] })
    const { rev } = await plugins.describe(id)
    stored!.port = 5601 // changed elsewhere, e.g. by the desktop app
    await expect(plugins.updateConfig(id, { ...before, port: 7000 }, undefined, rev)).rejects.toBeInstanceOf(PluginRevConflictError)
    await expect(plugins.updateConfig(id, before, 'global')).rejects.toBeInstanceOf(PluginForbiddenError)
    expect(writes()).toEqual([])
  })

  it('turns the switch inside the value instead of unmounting the plugin', async () => {
    const plugins = await boot(boundBuiltins)
    const { id } = byName('builtin:listener')
    await expect.poll(() => listenerEvents()).toEqual(['listener:up'])

    expect(await plugins.enable(id)).toMatchObject({ disabled: false, state: 'active' })
    expect(stored!.enable).toBe(true)
    expect(await plugins.disable(id)).toMatchObject({ disabled: true, state: 'disposed' })
    expect(stored!.enable).toBe(false)
    expect(listenerEvents()).toEqual(['listener:up'])

    // switching on runs the same checks as a save from the form
    stored = { enable: false, host: '', port: 5600, token: '' }
    await expect(plugins.enable(id)).rejects.toMatchObject({ issues: [{ path: ['token'] }] })
    expect(stored.enable).toBe(false)
  })

  it('answers 503-style while there is nothing to bind to yet', async () => {
    stored = undefined
    const plugins = await boot(boundBuiltins)
    const { id } = byName('builtin:listener')
    expect(byName('builtin:listener').disabled).toBe(false)
    await expect(plugins.describe(id)).rejects.toBeInstanceOf(PluginUnavailableError)
    await expect(plugins.updateConfig(id, {})).rejects.toBeInstanceOf(PluginUnavailableError)
    await expect(plugins.enable(id)).rejects.toBeInstanceOf(PluginUnavailableError)
  })

  it('ignores and drops a disabled flag left on the entry, and refreshes when the value changes elsewhere', async () => {
    writeFileSync(file, JSON.stringify({ version: 1, entries: [{ id: 'bbbb0001', name: 'builtin:listener', disabled: true }] }))
    await boot(boundBuiltins)
    await expect.poll(() => listenerEvents()).toEqual(['listener:up'])
    expect(JSON.parse(readFileSync(file, 'utf8')).entries[0]).toEqual({ id: 'bbbb0001', name: 'builtin:listener' })

    const changed: (string | undefined)[] = []
    ctx.on('plugins/changed', id => changed.push(id))
    stored!.enable = true
    watchers.forEach(notify => notify())
    expect(changed).toEqual(['bbbb0001'])
    expect(byName('builtin:listener')).toMatchObject({ disabled: false, state: 'active' })
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
})
