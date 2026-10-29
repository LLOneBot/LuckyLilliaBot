import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context, Fiber, Service } from 'cordis'
import TimerService from '@cordisjs/plugin-timer'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import PluginService, { BuiltinPlugin, PluginStatus } from '@/plugin/host'
import { dataKey } from '@/plugin/host/storage'

declare global {
  var __storage: unknown[][]
}

// Inside the repo (gitignored) so fixture plugins resolve cordis from its node_modules.
const tmpRoot = path.resolve('.tmp')
mkdirSync(tmpRoot, { recursive: true })
const workDir = mkdtempSync(path.join(tmpRoot, 'plugin-storage-'))

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true })
})

let caseDir: string
let pluginRoot: string
let dataDir: string
let ctx: Context
let service: Fiber | undefined

function writePlugin(dir: string, source: string, pkg: Record<string, unknown> = {}) {
  const base = path.join(pluginRoot, dir)
  mkdirSync(base, { recursive: true })
  writeFileSync(path.join(base, 'package.json'), JSON.stringify({
    name: dir.replace(path.sep, '/'), version: '1.0.0', type: 'module', main: 'index.js', llbot: {}, ...pkg,
  }))
  writeFileSync(path.join(base, 'index.js'), source)
}

// An async apply has no prototype, so cordis calls it instead of `new`-ing it and awaits what it returns
const recordSharedDir = (label: string) => `
  export async function apply(ctx) {
    globalThis.__storage.push(['${label}', await ctx.storage.dir(), ctx.baseUrl])
  }
`

async function boot(options: { builtins?: BuiltinPlugin[]; storage?: boolean } = {}) {
  ctx = new Context()
  await ctx.plugin(TimerService)
  service = await ctx.plugin(PluginService, {
    file: path.join(caseDir, 'plugins.json'),
    roots: [pluginRoot],
    builtins: options.builtins,
    dataDir: options.storage === false ? undefined : dataDir,
  })
  return ctx.plugins
}

function byName(name: string): PluginStatus {
  const status = ctx.plugins.list().find(status => status.name === name)
  if (!status) throw new Error(`no entry for ${name}`)
  return status
}

const recorded = (label: string) => globalThis.__storage.filter(row => row[0] === label)

beforeEach(() => {
  globalThis.__storage = []
  caseDir = mkdtempSync(path.join(workDir, 'case-'))
  pluginRoot = path.join(caseDir, 'plugins')
  dataDir = path.join(caseDir, 'plugin-data')
})

afterEach(async () => {
  await service?.dispose()
  service = undefined
})

describe('dataKey', () => {
  it('maps package and builtin names to one path segment', () => {
    expect(dataKey('luckylillia-plugin-echo')).toBe('luckylillia-plugin-echo')
    expect(dataKey('@scope/luckylillia-plugin-x')).toBe('@scope+luckylillia-plugin-x')
    expect(dataKey('builtin:onebot11')).toBe('_builtin+onebot11')
  })

  it('refuses names that could leave the data root or that Windows cannot store', () => {
    for (const name of ['../evil', 'a/b/c', '.hidden', 'trailing.', 'con', 'NUL.txt', 'a\\b', '']) {
      expect(() => dataKey(name), name).toThrow(/cannot derive/)
    }
  })
})

describe('ctx.storage', () => {
  it('gives an entry its shared directory and points ctx.baseUrl at it', async () => {
    writePlugin('alpha', recordSharedDir('alpha'))
    const plugins = await boot()
    await plugins.enable(byName('alpha').id)

    const shared = path.join(dataDir, 'alpha', 'shared')
    expect(recorded('alpha')).toEqual([['alpha', shared, pathToFileURL(shared + path.sep).href]])
    expect(existsSync(shared)).toBe(true)
  })

  it('shares one directory between the instances of a package', async () => {
    writePlugin('alpha', recordSharedDir('alpha'))
    const plugins = await boot()
    await plugins.enable(byName('alpha').id)
    await plugins.add('alpha')

    const dirs = recorded('alpha').map(row => row[1])
    expect(dirs).toHaveLength(2)
    expect(dirs[0]).toBe(dirs[1])
  })

  it('folds a scope into the directory name and keys builtins apart', async () => {
    writePlugin(path.join('@acme', 'gamma'), recordSharedDir('gamma'))
    const builtins: BuiltinPlugin[] = [{
      name: 'builtin:thing',
      manifest: {},
      plugin: {
        async apply(entryCtx: Context) {
          globalThis.__storage.push(['builtin', await entryCtx.storage.dir()])
        },
      },
    }]
    const plugins = await boot({ builtins })
    await plugins.enable(byName('@acme/gamma').id)

    expect(recorded('gamma')[0][1]).toBe(path.join(dataDir, '@acme+gamma', 'shared'))
    await expect.poll(() => recorded('builtin')).toEqual([['builtin', path.join(dataDir, '_builtin+thing', 'shared')]])
  })

  it('keeps answering for the service that defined the code when another entry calls into it', async () => {
    writePlugin('svc', `
      import { Service } from 'cordis'
      export default class Svc extends Service {
        constructor(ctx) { super(ctx, 'svcthing') }
        where() { return this.ctx.storage.dir() }
      }
    `, { llbot: { service: { implements: ['svcthing'] } } })
    writePlugin('user', `
      export const inject = ['svcthing']
      export async function apply(ctx) {
        globalThis.__storage.push(['user', await ctx.storage.dir(), await ctx.svcthing.where()])
      }
    `)
    const plugins = await boot()
    await plugins.enable(byName('svc').id)
    await plugins.enable(byName('user').id)

    await expect.poll(() => recorded('user')).toEqual([
      ['user', path.join(dataDir, 'user', 'shared'), path.join(dataDir, 'svc', 'shared')],
    ])
  })

  it('leaves the data in place when the entry is removed', async () => {
    writePlugin('alpha', recordSharedDir('alpha'))
    const plugins = await boot()
    const second = await plugins.add('alpha')
    await plugins.remove(second.id)
    expect(existsSync(path.join(dataDir, 'alpha', 'shared'))).toBe(true)
  })

  it('is not provided at all without a data directory', async () => {
    writePlugin('bare', `
      export function apply(ctx) {
        let error
        try { ctx.storage } catch (e) { error = e.message }
        globalThis.__storage.push(['bare', error, ctx.baseUrl])
      }
    `)
    const plugins = await boot({ storage: false })
    await plugins.enable(byName('bare').id)
    expect(recorded('bare')).toEqual([['bare', expect.stringMatching(/storage/), undefined]])
  })
})

describe("ctx.storage.dir('account')", () => {
  class FakeAccount extends Service {
    uin = '10001'
    constructor(fakeCtx: Context) {
      super(fakeCtx, 'account')
    }
  }

  it('is per account for a plugin that injects account', async () => {
    writePlugin('acct', `
      export const inject = ['account']
      export async function apply(ctx) {
        globalThis.__storage.push(['acct', await ctx.storage.dir('account')])
      }
    `)
    const plugins = await boot()
    await plugins.enable(byName('acct').id)
    expect(byName('acct').state).toBe('pending')

    ctx.plugin(FakeAccount)
    await expect.poll(() => recorded('acct')).toEqual([['acct', path.join(dataDir, 'acct', '10001')]])
    expect(existsSync(path.join(dataDir, 'acct', '10001'))).toBe(true)
  })

  it('works inside a ctx.inject([\'account\']) block of a plugin that runs before login', async () => {
    writePlugin('late', `
      export async function apply(ctx) {
        ctx.inject(['account'], async (inner) => {
          globalThis.__storage.push(['late', await inner.storage.dir('account')])
        })
      }
    `)
    const plugins = await boot()
    await plugins.enable(byName('late').id)
    ctx.plugin(FakeAccount)
    await expect.poll(() => recorded('late')).toEqual([['late', path.join(dataDir, 'late', '10001')]])
  })

  it('rejects for code that does not depend on account, even with an account online', async () => {
    writePlugin('eager', `
      export async function apply(ctx) {
        try { await ctx.storage.dir('account') } catch (e) { globalThis.__storage.push(['eager', e.message]) }
      }
    `)
    const plugins = await boot()
    ctx.plugin(FakeAccount)
    await plugins.enable(byName('eager').id)
    expect(recorded('eager')).toEqual([['eager', expect.stringMatching(/add 'account' to the inject of eager/)]])
  })
})
