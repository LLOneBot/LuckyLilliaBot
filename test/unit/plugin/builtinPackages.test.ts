import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Context } from 'cordis'
import TimerService from '@cordisjs/plugin-timer'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import PluginService, { type BuiltinPlugin } from '@/plugin/host'
import { BuiltinPackages, packageDigest } from '@/plugin/host/builtin-packages'
import { builtinRuntimeModule, registerBuiltinRuntime } from '@/plugin/host/builtin-runtime'

const npmName = '@luckylillia/plugin-example'
const entryName = 'builtin:example'
const builtin: BuiltinPlugin = { name: entryName, title: 'Example', core: true, manifest: {},
  npm: { name: npmName, version: '1.0.0', abi: 1 }, plugin: { apply() {} } }
let dir: string
let root: string
let ctx: Context | undefined

beforeEach(async () => {
  await mkdir('.tmp', { recursive: true })
  dir = await mkdtemp(path.resolve('.tmp/builtin-packages-'))
  root = path.join(dir, 'plugins')
})
afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
  await rm(dir, { recursive: true, force: true })
})

async function writePackage(version = '1.1.0', source = '') {
  const target = path.join(root, npmName)
  await mkdir(path.join(target, 'client'), { recursive: true })
  await writeFile(path.join(target, 'package.json'), JSON.stringify({ name: npmName, version, type: 'module',
    repository: { type: 'git', url: 'git+https://github.com/example/builtin.git' },
    main: 'index.js', llbot: { builtin: { entry: entryName, abi: 1 }, webui: 'client/index.js' } }))
  await writeFile(path.join(target, 'index.js'), source ||
    'export const builtin = { name: "builtin:example", title: "Updated example", core: false, manifest: {}, plugin: { apply() {} } }')
  await writeFile(path.join(target, 'client/index.js'), 'export default () => {}')
  return target
}

async function boot(builtins: BuiltinPlugin[] = [builtin]) {
  ctx = new Context()
  await ctx.plugin(TimerService)
  await ctx.plugin(PluginService, { file: path.join(dir, 'plugins.json'), roots: [root], builtins, resolver: false })
  return ctx.plugins
}

describe('official builtin npm packages', () => {
  it('lists the bundled npm version and never grants an unapproved directory builtin execution', async () => {
    await writePackage()
    const plugins = await boot()
    expect(plugins.packageList()).toEqual([])
    expect(plugins.list()).toHaveLength(1)
    expect(plugins.list()[0]).toMatchObject({ name: entryName, version: '1.0.0', packageName: npmName, core: true })
    expect(plugins.list()[0].repository).toBeUndefined()
    expect(plugins.builtinPackageList()[0]).toMatchObject({ version: '1.0.0', activeVersion: '1.0.0', restartRequired: false })
  })

  it('keeps ID/config/core rules and activates an approved update only after restart', async () => {
    await writePackage()
    let plugins = await boot()
    const id = plugins.list()[0].id
    await plugins.approveBuiltinPackage(npmName, '1.1.0')
    await plugins.scan()
    expect(plugins.list()[0].version).toBe('1.0.0')
    expect(plugins.builtinPackageList()[0]).toMatchObject({ version: '1.1.0', activeVersion: '1.0.0', restartRequired: true })
    await ctx!.fiber.dispose()
    plugins = await boot()
    expect(plugins.list()).toHaveLength(1)
    expect(plugins.list()[0]).toMatchObject({ id, name: entryName, version: '1.1.0', core: true, title: 'Updated example' })
    expect(plugins.list()[0].repository).toBe('https://github.com/example/builtin')
    expect(plugins.builtinPackageList()[0].restartRequired).toBe(false)
    await expect(plugins.disable(id)).rejects.toThrow('core')
    const asset = plugins.webuiAsset(npmName.replace('/', '+'), 'index.js')
    expect(asset).toContain('.builtin-packages')
    // Replacing the install directory cannot serve tomorrow's UI against today's running backend.
    await writePackage('1.2.0')
    await plugins.approveBuiltinPackage(npmName, '1.2.0')
    expect(plugins.webuiAsset(npmName.replace('/', '+'), 'index.js')).toBe(asset)
  })

  it('falls back before evaluating code when approved files have changed', async () => {
    await writePackage()
    const packages = new BuiltinPackages([builtin], root)
    await packages.approve(npmName, '1.1.0')
    const approvals = JSON.parse(await readFile(path.join(root, '.builtin-updates.json'), 'utf8'))
    const snapshot = path.join(root, '.builtin-packages', npmName.replace('/', '+'), '1.1.0-' + approvals[npmName].digest)
    await writeFile(path.join(snapshot, 'index.js'), 'throw new Error("unapproved execution")')
    const plugins = await boot()
    expect(plugins.list()[0].version).toBe('1.0.0')
    expect(plugins.builtinPackageList()[0].error).toContain('approved download')
  })

  it('falls back from an invalid module and from an incompatible ABI', async () => {
    await writePackage('1.1.0', 'export const builtin = { name: "builtin:other", plugin: { apply() {} } }')
    let packages = new BuiltinPackages([builtin], root)
    await packages.approve(npmName, '1.1.0')
    const plugins = await boot()
    expect(plugins.list()[0].version).toBe('1.0.0')
    expect(plugins.builtinPackageList()[0].error).toContain('expected built-in entry')
    packages = new BuiltinPackages([builtin], root)
    expect(packages.check(npmName, { name: npmName, version: '1.2.0', llbot: { builtin: { entry: entryName, abi: 2 } } })).toContain('different Bot runtime')
    expect(packages.check('unrelated', { llbot: { builtin: { entry: entryName, abi: 1 } } })).toContain('not an official')
  })

  it('uses the newer bundled version after a Bot upgrade', async () => {
    await writePackage()
    const packages = new BuiltinPackages([builtin], root)
    await packages.approve(npmName, '1.1.0')
    const newerBot = new BuiltinPackages([{ ...builtin, npm: { ...builtin.npm!, version: '1.2.0' } }], root)
    await newerBot.restore()
    expect(newerBot.list()[0]).toMatchObject({ version: '1.2.0', restartRequired: false })
  })

  it('restores the bundled core when the updated implementation fails to initialize', async () => {
    await writePackage('1.1.0', 'export const builtin = { name: "builtin:example", manifest: {}, plugin: { apply() { throw new Error("broken update") } } }')
    await new BuiltinPackages([builtin], root).approve(npmName, '1.1.0')
    const plugins = await boot()
    await expect.poll(() => plugins.list()[0].state).toBe('active')
    expect(plugins.list()[0].version).toBe('1.0.0')
    expect(plugins.builtinPackageList()[0].error).toContain('broken update')
  })

  it.each([
    { disabled: false, mode: 'immediate' }, { disabled: true, mode: 'immediate' },
    { disabled: false, mode: 'deferred' }, { disabled: true, mode: 'deferred' },
    { disabled: false, mode: 'nested' }, { disabled: true, mode: 'nested' },
  ])('restores both branches for a $mode standby failure (disabled=$disabled)', async ({ disabled, mode }) => {
    const trace: string[] = []
    ;(globalThis as any).__builtinTrace = trace
    const bundled: BuiltinPlugin = { ...builtin, core: false,
      plugin: { apply(ctx) { trace.push('bundled-main'); ctx.provide('mainChoice', 'bundled') } },
      standby: { apply(ctx) { trace.push('bundled-standby'); ctx.provide('standbyChoice', 'bundled') } },
    }
    const failure = '{ inject: ["lateDependency"], apply() { throw new Error("standby broken") } }'
    const standby = mode === 'immediate' ? '{ apply() { throw new Error("standby broken") } }'
      : mode === 'deferred' ? failure : '{ apply(ctx) { ctx.plugin(' + failure + ') } }'
    await writePackage('1.1.0', 'export const builtin = { name: "builtin:example", manifest: {}, plugin: { apply(ctx) {'
      + ' globalThis.__builtinTrace.push("updated-main"); ctx.provide("mainChoice", "updated");'
      + ' ctx.effect(() => () => globalThis.__builtinTrace.push("updated-main-stopped")) } }, standby: ' + standby + ' }')
    await writeFile(path.join(dir, 'plugins.json'), JSON.stringify({ version: 1, entries: [{
      id: 'stable-entry', name: entryName, disabled, config: { kept: 'unchanged' },
    }] }))
    await new BuiltinPackages([bundled], root).approve(npmName, '1.1.0')
    const plugins = await boot([bundled])
    if (mode !== 'immediate') {
      if (!disabled) await expect.poll(() => ctx!.get('mainChoice')).toBe('updated')
      expect(plugins.builtinPackageList()[0].activeVersion).toBe('1.1.0')
      await ctx!.plugin({ apply(ctx) { ctx.provide('lateDependency', {}) } })
    }
    await expect.poll(() => ctx!.get('standbyChoice')).toBe('bundled')
    if (!disabled) await expect.poll(() => ctx!.get('mainChoice')).toBe('bundled')
    else expect(ctx!.get('mainChoice')).toBeUndefined()
    expect(plugins.get('stable-entry')).toMatchObject({ version: '1.0.0', disabled, state: disabled ? 'disposed' : 'active' })
    expect(plugins.builtinPackageList()[0]).toMatchObject({ version: '1.1.0', activeVersion: '1.0.0', error: 'standby broken' })
    expect(plugins.get('stable-entry').webui).toBeUndefined()
    expect(JSON.parse(await readFile(path.join(dir, 'plugins.json'), 'utf8')).entries[0].config).toEqual({ kept: 'unchanged' })
    if (!disabled && mode !== 'immediate') {
      expect(trace.indexOf('updated-main-stopped')).toBeLessThan(trace.indexOf('bundled-standby'))
    }
    expect(trace.filter(item => item === 'bundled-standby')).toHaveLength(1)
  })

  it.each(['direct', 'nested'])('restores standby when a $mode main initializer fails after dependencies arrive', async (mode) => {
    const bundled: BuiltinPlugin = { ...builtin,
      plugin: { apply(ctx) { ctx.provide('mainChoice', 'bundled') } },
      standby: { apply(ctx) { ctx.provide('standbyChoice', 'bundled') } },
    }
    const failure = '{ inject: ["lateDependency"], apply() { throw new Error("main delayed failure") } }'
    const plugin = mode === 'direct' ? failure : '{ apply(ctx) { ctx.plugin(' + failure + ') } }'
    await writePackage('1.1.0', 'export const builtin = { name: "builtin:example", manifest: {}, plugin: ' + plugin
      + ', standby: { apply(ctx) { ctx.provide("standbyChoice", "updated") } } }')
    await new BuiltinPackages([bundled], root).approve(npmName, '1.1.0')
    const plugins = await boot([bundled])
    await expect.poll(() => ctx!.get('standbyChoice')).toBe('updated')
    expect(plugins.builtinPackageList()[0].activeVersion).toBe('1.1.0')
    await ctx!.plugin({ apply(ctx) { ctx.provide('lateDependency', {}) } })
    await expect.poll(() => ctx!.get('mainChoice')).toBe('bundled')
    expect(ctx!.get('standbyChoice')).toBe('bundled')
    expect(plugins.list()[0]).toMatchObject({ version: '1.0.0', state: 'active' })
    expect(plugins.builtinPackageList()[0].error).toBe('main delayed failure')
  })

  it('uses active builtin npm versions when checking another plugin package dependency', async () => {
    await writePackage()
    await mkdir(path.join(root, 'consumer'), { recursive: true })
    await writeFile(path.join(root, 'consumer/package.json'), JSON.stringify({ name: 'consumer', version: '1.0.0', type: 'module',
      main: 'index.js', llbot: { dependencies: { [npmName]: '^1.1.0' } } }))
    await writeFile(path.join(root, 'consumer/index.js'), 'export function apply() {}')
    let plugins = await boot()
    const id = plugins.list().find(item => item.name === 'consumer')!.id
    await plugins.enable(id)
    expect(plugins.get(id).state).toBe('incompatible')
    await plugins.approveBuiltinPackage(npmName, '1.1.0')
    expect(plugins.get(id).state).toBe('incompatible')
    await ctx!.fiber.dispose()
    plugins = await boot()
    await expect.poll(() => plugins.get(id).state).toBe('active')
  })

  it('hashes dependency code as well as the manifest and preserves host runtime object identity', async () => {
    const target = await writePackage()
    await mkdir(path.join(target, 'node_modules/dependency'), { recursive: true })
    const dependency = path.join(target, 'node_modules/dependency/index.js')
    await writeFile(dependency, 'export const a = 1')
    const before = await packageDigest(target)
    await writeFile(dependency, 'export const a = 2')
    expect(await packageDigest(target)).not.toBe(before)
    const shared = { current: 42 }
    registerBuiltinRuntime({ example: { shared } })
    const namespace = await import(builtinRuntimeModule('@luckylillia/bot-runtime/example')!)
    expect(namespace.shared).toBe(shared)
    expect(() => builtinRuntimeModule('@luckylillia/bot-runtime/missing')).toThrow('unavailable')
  })
})
