import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context, Fiber } from 'cordis'
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

describe("ctx.storage.dir('bot', bot)", () => {
  it('gives a directory per bot without a login, and refuses a sid that would leave it', async () => {
    writePlugin('perbot', `
      export async function apply(ctx) {
        globalThis.__storage.push(['perbot', await ctx.storage.dir('bot', 'qq:1905402647')])
        globalThis.__storage.push(['perbot', await ctx.storage.dir('bot', { sid: 'ntqq:10001' })])
        globalThis.__storage.push(['perbot', await ctx.storage.dir('bot', 'luckylillia:10001')])
        await ctx.storage.dir('bot', 'qq:../escape').catch(e => globalThis.__storage.push(['perbot', e.message]))
      }
    `)
    const plugins = await boot()
    await plugins.enable(byName('perbot').id)
    await expect.poll(() => recorded('perbot')).toEqual([
      ['perbot', path.join(dataDir, 'perbot', 'bots', 'qq+1905402647')],
      ['perbot', path.join(dataDir, 'perbot', 'bots', 'ntqq+10001')],
      ['perbot', path.join(dataDir, 'perbot', 'bots', 'ntqq+10001')],
      ['perbot', 'cannot derive a data directory from bot "qq:../escape"'],
    ])
    expect(existsSync(path.join(dataDir, 'perbot', 'bots', 'luckylillia+10001'))).toBe(false)
  })

  it('reuses legacy QQ data without a login or a second empty directory', async () => {
    const legacy = path.join(dataDir, 'legacy', '10001')
    mkdirSync(legacy, { recursive: true })
    writeFileSync(path.join(legacy, 'state.json'), '{"count":7}')
    writePlugin('legacy', `
      export async function apply(ctx) {
        globalThis.__storage.push(['legacy', await ctx.storage.dir('bot', 'ntqq:10001')])
        globalThis.__storage.push(['other', await ctx.storage.dir('bot', 'qq:10001')])
      }
    `)
    const plugins = await boot()
    await plugins.enable(byName('legacy').id)
    expect(recorded('legacy')).toEqual([['legacy', legacy]])
    expect(readFileSync(path.join(legacy, 'state.json'), 'utf8')).toBe('{"count":7}')
    expect(existsSync(path.join(dataDir, 'legacy', 'bots', 'luckylillia+10001'))).toBe(false)
    expect(existsSync(path.join(dataDir, 'legacy', 'bots', 'ntqq+10001'))).toBe(false)
    expect(recorded('other')).toEqual([['other', path.join(dataDir, 'legacy', 'bots', 'qq+10001')]])
  })

  it.each(['ntqq', 'luckylillia'])('reuses the old bot directory for %s before the numeric directory, leaving all data intact', async (platform) => {
    const legacy = path.join(dataDir, 'both', '10001')
    const current = path.join(dataDir, 'both', 'bots', 'luckylillia+10001')
    for (const dir of [legacy, current]) mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(legacy, 'old.txt'), 'old')
    writeFileSync(path.join(current, 'new.txt'), 'new')
    writePlugin('both', `
      export async function apply(ctx) {
        globalThis.__storage.push(['both', await ctx.storage.dir('bot', '${platform}:10001')])
      }
    `)
    const plugins = await boot()
    await plugins.enable(byName('both').id)
    expect(recorded('both')).toEqual([['both', current]])
    expect(readFileSync(path.join(legacy, 'old.txt'), 'utf8')).toBe('old')
    expect(readFileSync(path.join(current, 'new.txt'), 'utf8')).toBe('new')
    expect(existsSync(path.join(dataDir, 'both', 'bots', 'ntqq+10001'))).toBe(false)
  })

  it.each(['ntqq', 'luckylillia'])('prefers the canonical directory for %s when all historical directories exist', async (platform) => {
    const legacy = path.join(dataDir, 'all', '10001')
    const legacyBot = path.join(dataDir, 'all', 'bots', 'luckylillia+10001')
    const current = path.join(dataDir, 'all', 'bots', 'ntqq+10001')
    for (const dir of [legacy, legacyBot, current]) {
      mkdirSync(dir, { recursive: true })
      writeFileSync(path.join(dir, 'state.txt'), dir)
    }
    writePlugin('all', `
      export async function apply(ctx) {
        globalThis.__storage.push(['all', await ctx.storage.dir('bot', '${platform}:10001')])
      }
    `)
    const plugins = await boot()
    await plugins.enable(byName('all').id)
    expect(recorded('all')).toEqual([['all', current]])
    for (const dir of [legacy, legacyBot, current]) expect(readFileSync(path.join(dir, 'state.txt'), 'utf8')).toBe(dir)
  })

  it('fails visibly if a legacy data path is a file, instead of silently creating an empty directory', async () => {
    const legacyBot = path.join(dataDir, 'blocked', 'bots', 'luckylillia+10001')
    mkdirSync(path.dirname(legacyBot), { recursive: true })
    writeFileSync(legacyBot, 'old data')
    writePlugin('blocked', `
      export async function apply(ctx) {
        await ctx.storage.dir('bot', 'ntqq:10001').catch(e => globalThis.__storage.push(['blocked', e.message]))
      }
    `)
    const plugins = await boot()
    await plugins.enable(byName('blocked').id)
    expect(recorded('blocked')).toEqual([['blocked', `plugin data path is not a directory: ${legacyBot}`]])
    expect(readFileSync(legacyBot, 'utf8')).toBe('old data')
    expect(existsSync(path.join(dataDir, 'blocked', 'bots', 'ntqq+10001'))).toBe(false)
  })

  it('rejects the removed implicit account scope', async () => {
    writePlugin('eager', `
      export async function apply(ctx) {
        try { await ctx.storage.dir('account') } catch (e) { globalThis.__storage.push(['eager', e.message]) }
      }
    `)
    const plugins = await boot()
    await plugins.enable(byName('eager').id)
    expect(recorded('eager')).toEqual([['eager', expect.stringMatching(/expected 'global' or 'bot'/)]])
  })
})
