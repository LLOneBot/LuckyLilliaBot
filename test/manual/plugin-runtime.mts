// Real-Node check of the plugin runtime that vitest cannot cover: the registerHooks resolver,
// plugins outside any node_modules tree, and submodule reloads under tsx.
// Run: npx tsx test/manual/plugin-runtime.mts
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Context } from 'cordis'
import TimerService from '@cordisjs/plugin-timer'
import PluginService from '../../src/plugin/host/index.ts'

declare global {
  var harnessLog: string[]
}
globalThis.harnessLog = []

const outside = mkdtempSync(path.join(os.tmpdir(), 'llbot-harness-'))
const pluginRoot = path.join(outside, 'plugins')
const results: [string, boolean, string?][] = []
const check = (name: string, ok: boolean, detail?: unknown) => results.push([name, ok, ok ? undefined : JSON.stringify(detail)])
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// JS plugin outside the repo: nothing to resolve shared packages from but the hook
mkdirSync(path.join(pluginRoot, 'omega'), { recursive: true })
writeFileSync(path.join(pluginRoot, 'omega', 'package.json'), JSON.stringify({
  name: 'omega', version: '1.0.0', type: 'module', main: 'index.js',
  peerDependencies: { '@luckylillia/plugin-sdk': '^1.0.0' }, llbot: {},
}))
writeFileSync(path.join(pluginRoot, 'omega', 'index.js'), `
import { Schema, Service } from '@luckylillia/plugin-sdk'
import SchemaDirect from 'schemastery'
import { text } from './text.js'
export const Config = Schema.object({ n: Schema.natural().default(1) })
export function apply(ctx) {
  globalThis.harnessLog.push(text + ':' + (Schema === SchemaDirect) + ':' + (typeof Service))
}
`)
writeFileSync(path.join(pluginRoot, 'omega', 'text.js'), `export const text = 'omega-v1'`)

// TS plugin outside the repo, loaded through tsx
cpSync(path.resolve(import.meta.dirname, '../fixtures/plugins/hello'), path.join(pluginRoot, 'hello-copy'), { recursive: true })
const helloPkg = path.join(pluginRoot, 'hello-copy', 'package.json')
writeFileSync(helloPkg, readFileSync(helloPkg, 'utf8').replace('"luckylillia-plugin-hello"', '"hello-copy"'))

const ctx = new Context()
const logs: string[] = []
ctx.logger.exporter({ export: message => logs.push(`${message.name}: ${message.args.join(' ')}`) })
await ctx.plugin(TimerService)
const service = await ctx.plugin(PluginService, { file: path.join(outside, 'plugins.json'), roots: [pluginRoot] })
const plugins = ctx.plugins
const byName = (name: string) => plugins.list().find(status => status.name === name)!

try {
  check('scan found both', plugins.list().length === 2, plugins.list())

  const omega = await plugins.enable(byName('omega').id)
  check('omega active', omega.state === 'active', omega)
  check('omega shares Schema with host and sees Service', harnessLog[0] === 'omega-v1:true:function', harnessLog)

  writeFileSync(path.join(pluginRoot, 'omega', 'text.js'), `export const text = 'omega-v2'`)
  const reload = await plugins.reload(omega.id)
  check('omega reload', reload.status === 'reloaded', reload)
  check('omega submodule re-imported', harnessLog.at(-1)?.startsWith('omega-v2'), harnessLog)

  const hello = await plugins.updateConfig(byName('hello-copy').id, { interval: 30, text: 'hi' })
  await plugins.enable(hello.id)
  await sleep(120)
  check('hello (ts) logs with new config', logs.some(line => line === 'hello: [hello] hi'), logs)

  writeFileSync(path.join(pluginRoot, 'hello-copy', 'src', 'format.ts'), 'export function format(text: string) {\n  return `[edited] ${text}`\n}\n')
  await plugins.reload(hello.id)
  logs.length = 0
  await sleep(120)
  check('hello (ts) submodule re-imported', logs.some(line => line === 'hello: [edited] hi'), logs)

  await plugins.disable(hello.id)
  logs.length = 0
  await sleep(120)
  check('hello stops after disable', !logs.some(line => line.startsWith('hello:')), logs)
} finally {
  await service.dispose()
  rmSync(outside, { recursive: true, force: true })
}

for (const [name, ok, detail] of results) console.log(`${ok ? '[OK]  ' : '[FAIL]'} ${name}${detail ? ' ' + detail : ''}`)
process.exit(results.every(([, ok]) => ok) ? 0 : 1)
