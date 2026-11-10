// Real npm archives + module.registerHooks, outside the repository, without logging into QQ.
// Run after npm run build:builtins: npx tsx test/manual/builtin-packages.mts
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from 'cordis'
import TimerService from '@cordisjs/plugin-timer'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const outside = await mkdtemp(path.join(os.tmpdir(), 'llbot-builtin-npm-'))
const previousCwd = process.cwd()
const oldPort = process.env.LLBOT_WEBUI_PORT
const npmCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
assert(existsSync(npmCli), 'npm CLI must be installed next to Node to pack the smoke artifacts')
process.chdir(outside)
process.env.LLBOT_WEBUI_PORT = '0'
let ctx: Context | undefined
let code = 0

try {
  // Host modules must first evaluate under the isolated cwd, including configuration and native data paths.
  const [{ builtinPlugins }, { default: PluginService }, { default: BotsService }, { default: ConfigService },
    { Installer }, { readLocalPackage }, { SHARED_SPECIFIERS }] = await Promise.all([
    import('../../src/plugin/internal/index.ts'), import('../../src/plugin/host/index.ts'),
    import('../../src/universal/bots.ts'), import('../../src/main/config/index.ts'),
    import('../../src/plugin/internal/tool/market/installer.ts'), import('../../src/plugin/internal/tool/market/archive.ts'),
    import('../../src/plugin/host/resolve-hook.ts'),
  ])
  const selected = builtinPlugins.filter(item => ['builtin:commands', 'builtin:webui'].includes(item.name))
  const pluginRoot = path.join(outside, 'data/plugins')
  const installer = new Installer({
    async packument() { throw new Error('smoke archives must bundle their private dependencies') },
    async tarball() { throw new Error('smoke archives must not make network requests') },
  }, pluginRoot, new Set(SHARED_SPECIFIERS))

  const boot = async () => {
    ctx = new Context()
    await ctx.plugin(TimerService)
    await ctx.plugin(ConfigService)
    await ctx.plugin(BotsService)
    await ctx.plugin(PluginService, { file: path.join(outside, 'data/plugins.json'), roots: [pluginRoot], builtins: selected })
    const deadline = Date.now() + 15_000
    while (ctx.plugins.list().some(item => item.state !== 'active') || !ctx.get('webuiServer')?.port || !ctx.get('commands')) {
      assert(Date.now() < deadline, JSON.stringify({ plugins: ctx.plugins.list(), webui: ctx.config.get().webui }))
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    return ctx.plugins
  }
  let plugins = await boot()
  const ids = plugins.list().map(item => item.id)
  for (const builtin of selected) {
    const name = builtin.npm!.name
    const staging = path.join(outside, 'pack', name)
    await cp(path.join(repo, 'output/builtin-packages', name), staging, { recursive: true })
    const file = path.join(staging, 'package.json')
    const manifest = JSON.parse(await readFile(file, 'utf8'))
    manifest.version = '1.0.1'
    // Keep this real-archive smoke offline; production Installer normally fetches these npm dependencies.
    manifest.bundledDependencies = Object.keys(manifest.dependencies ?? {})
    for (const dependency of manifest.bundledDependencies) {
      await cp(path.join(repo, 'node_modules', dependency), path.join(staging, 'node_modules', dependency), { recursive: true })
    }
    await writeFile(file, JSON.stringify(manifest, null, 2))
    const packed = JSON.parse(execFileSync(process.execPath, [npmCli, 'pack', '--ignore-scripts', '--json'], {
      cwd: staging, encoding: 'utf8', windowsHide: true,
    }))[0]
    const archive = path.join(staging, packed.filename)
    const unpack = path.join(pluginRoot, '.smoke-unpack-' + name.split('/').at(-1))
    const source = await readLocalPackage(archive, packed.filename, unpack)
    await installer.install(source)
    await plugins.approveBuiltinPackage(name, '1.0.1')
    assert.equal(plugins.get(ids[selected.indexOf(builtin)]).version, '1.0.0')
    console.log('[OK] packed, installed and staged ' + name)
  }
  const stop = async () => {
    await ctx?.webuiServer.stop()
    await ctx?.fiber.dispose()
    ctx = undefined
  }
  await stop()
  plugins = await boot()
  assert.deepEqual(plugins.list().map(item => item.id), ids)
  assert(plugins.list().every(item => item.version === '1.0.1' && item.core))
  assert(plugins.builtinPackageList().every(item => !item.restartRequired && !item.error))
  const origin = 'http://127.0.0.1:' + ctx!.webuiServer.port
  const response = await fetch(origin)
  assert.equal(response.status, 200)
  const html = await response.text()
  const script = html.match(/src="([^"]+\.js)"/)?.[1]
  assert(script, 'npm WebUI package must serve its built HTML and JavaScript')
  assert.equal((await fetch(new URL(script, origin))).status, 200)
  assert(ctx!.commands, 'the updated command implementation must provide its actual service')
  ctx!.command('builtin-smoke').action(() => 'ok')
  assert(ctx!.commands.list().some(item => item.name === 'builtin-smoke'))
  assert(plugins.webuiAsset('@luckylillia+plugin-commands', 'style.css')?.includes('.builtin-packages'))
  console.log('[OK] restart preserved IDs/core restrictions, activated both npm versions and served WebUI shell/assets')
  await stop()
} catch (error) {
  console.error(error)
  code = 1
} finally {
  await ctx?.webuiServer?.stop().catch(() => {})
  await ctx?.fiber.dispose()
  process.chdir(previousCwd)
  if (oldPort === undefined) delete process.env.LLBOT_WEBUI_PORT
  else process.env.LLBOT_WEBUI_PORT = oldPort
  await rm(outside, { recursive: true, force: true })
}
// Existing WebUI auth modules keep an hourly housekeeping timer; no test processes should stay around.
process.exit(code)
