import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context, Fiber, Service } from 'cordis'
import Database from '@cordisjs/plugin-database'
import SQLiteDriver from '@cordisjs/plugin-database-sqlite'
import TimerService from '@cordisjs/plugin-timer'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { Config as LLBotConfig } from '@/common/types'
import { DATA_DIR } from '@/common/globalVars'
import { adapterDefaults, defaultConfig } from '@/main/config/defaultConfig'
import { deepMerge } from '@/common/utils/misc'
import {
  NTFileApi,
  NTFriendApi,
  NTGroupApi,
  NTLoginApi,
  NTMsgApi,
  NTSystemApi,
  NTUserApi,
  NTWebApi,
} from '@/plugin/internal/protocol/nt-protocol/ntqqapi/api'
import Core from '@/plugin/internal/protocol/nt-protocol/ntqqapi/core'
import Store from '@/plugin/internal/protocol/nt-protocol/store'
import { bindLoginResources } from '@/plugin/internal/protocol/nt-protocol/loginResources'
import { builtinPlugins } from '@/plugin/internal'
import BotsService from '@/universal/bots'
import HttpService from '@/universal/http'
import PluginService, { PluginForbiddenError, PluginState } from '@/plugin/host'

// Same isolation as service-registry.test.ts: these services write into DATA_DIR
vi.mock('@/common/globalVars', async () => {
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'llbot-builtins-'))
  return {
    DATA_DIR: dir,
    TEMP_DIR: path.join(dir, 'temp'),
    LOG_DIR: path.join(dir, 'logs'),
    dbDir: path.join(dir, 'database'),
    getFixedDataDir: () => dir,
  }
})

let config: LLBotConfig

class MockConfig extends Service {
  constructor(ctx: Context) {
    super(ctx, 'config')
  }
  get() {
    return config
  }
  patch(partial: object) {
    config = deepMerge(config, partial) as LLBotConfig
    return config
  }
  set() {}
  listenChange() {}
}

class MockProtocol extends Service {
  selfInfo = { uid: '', uin: '', nick: '', online: false }

  constructor(ctx: Context) {
    super(ctx, 'qqProtocol')
  }
  onDisconnect() {
    return 'mock-disconnect'
  }
  offDisconnect() {}
}

async function freePort(): Promise<number> {
  const server = net.createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as net.AddressInfo
  await new Promise<void>(resolve => server.close(() => resolve()))
  return port
}

function listening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1')
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

const tmp = mkdtempSync(path.join(os.tmpdir(), 'llbot-builtins-run-'))
// Disposed before the temp dirs go: Windows refuses to delete the open sqlite file and watched email config
const mounted: Fiber[] = []

afterAll(async () => {
  for (const fiber of mounted.reverse()) await fiber.dispose()
  rmSync(tmp, { recursive: true, force: true })
  rmSync(DATA_DIR, { recursive: true, force: true })
})

describe('builtin plugins', () => {
  it('start after login with their entry settings and free their ports when disabled', async () => {
    const [ob11Port, satoriPort, milkyPort] = await Promise.all([freePort(), freePort(), freePort()])
    config = {
      ...defaultConfig,
      webui: { ...defaultConfig.webui, enable: false },
      musicCardSignUrl: 'https://sign.invalid/music',
      ffmpeg: '/opt/ffmpeg',
    }
    const ob11 = {
      connect: [{
        type: 'ws', enable: true, host: '127.0.0.1', port: ob11Port, heartInterval: 30_000, token: '',
        reportSelfMessage: false, reportOfflineMessage: false, messageFormat: 'array', debug: false,
      }],
    }
    const satori = { host: '127.0.0.1', port: satoriPort, token: '' }
    const milky = { http: { ...adapterDefaults.milky.http, port: milkyPort } }
    const file = path.join(tmp, 'plugins.json')
    writeFileSync(file, JSON.stringify({
      version: 1,
      entries: [
        { id: 'a0000001', name: 'builtin:onebot11', config: ob11 },
        { id: 'a0000002', name: 'builtin:satori', config: satori },
        { id: 'a0000003', name: 'builtin:milky', config: milky },
        // The protocol layer below is mocked: the real one would claim qqProtocol too
        { id: 'a0000004', name: 'builtin:nt-protocol', disabled: true },
      ],
    }))

    const ctx = new Context()
    await ctx.plugin(TimerService)
    for (const plugin of [HttpService, MockConfig, MockProtocol, BotsService, NTFileApi, NTFriendApi, NTGroupApi, NTLoginApi, NTMsgApi, NTUserApi, NTWebApi, NTSystemApi]) {
      ctx.plugin(plugin)
    }
    // As builtin:nt-protocol does: the account's database is per account and its own, so the core services wait for
    // the login, and the plugins' database is builtin:database
    mounted.push(ctx.inject(['qqProtocol', 'config'], (ctx) => {
      bindLoginResources(ctx, (ctx) => {
        const own = ctx.isolate('database').isolate('model')
        own.plugin(Database)
        own.plugin(SQLiteDriver, { path: pathToFileURL(path.join(tmp, 'builtins.db')).href })
        own.plugin(Core, config)
        own.plugin(Store, { msgCacheExpire: config.msgCacheExpire! })
      })
    }))
    mounted.push(await ctx.plugin(PluginService, { file, roots: [], resolver: false, builtins: builtinPlugins }))

    const id = (name: string) => ctx.plugins.list().find(status => status.name === name)!.id
    const states = () => Object.fromEntries(ctx.plugins.list().map(status => [status.name, status.state]))
    const allIn = (state: PluginState) => Object.fromEntries(builtinPlugins.map(builtin => [builtin.name, state]))

    // The WebUI and what needs nothing but it run from the start (webui.enable is off above, so it does not listen),
    // Satori, which serves whatever bots there are, the commands, the plugins' database, the market and the proxy.
    // Email notification and the official bot start switched off (their initial settings), the NT protocol by the file
    // above; nothing else runs before the first login
    const shell = [
      'builtin:webui', 'builtin:dashboard', 'builtin:logs', 'builtin:satori', 'builtin:commands', 'builtin:database', 'builtin:market',
      'builtin:proxy', 'builtin:message-order',
    ]
    await vi.waitFor(() => expect(shell.map(name => states()[name])).toEqual(shell.map(() => 'active')))
    const off = { 'builtin:email-notification': 'disposed', 'builtin:qq-official': 'disposed', 'builtin:nt-protocol': 'disposed' }
    for (const status of ctx.plugins.list()) {
      if (status.name in off) expect(status).toMatchObject({ state: 'disposed', disabled: true })
      else if (!shell.includes(status.name)) {
        expect(status, status.name).toMatchObject({ state: 'pending', missingDeps: expect.arrayContaining(['app']) })
      }
    }

    Object.assign(ctx.get('qqProtocol')!.selfInfo, { uid: 'test-uid', uin: '123456', nick: 'TestBot', online: true })
    await ctx.parallel('qq/online')
    const running = { ...allIn('active'), ...off }
    await vi.waitFor(() => expect(states()).toEqual(running), { timeout: 4_000, interval: 50 })
    for (const port of [ob11Port, satoriPort, milkyPort]) {
      await vi.waitFor(async () => expect(await listening(port), `port ${port}`).toBe(true))
    }

    // Field by field: the entry's settings, switched on, plus the bot settings each adapter reads
    expect(ctx.get('onebot')!.config).toMatchObject({
      enable: true,
      connect: ob11.connect,
      musicCardSignUrl: config.musicCardSignUrl,
      ffmpeg: config.ffmpeg,
    })
    expect(ctx.get('satori')!.config).toEqual({ ...satori, enable: true })
    expect(ctx.get('milky')!.config).toMatchObject({ enable: true, http: { port: milkyPort } })

    // Saving the bot settings must not touch the adapters' connections. structuredClone stands in for the
    // file watcher, which hands over a whole new object tree
    const client = new WebSocket(`ws://127.0.0.1:${ob11Port}/`)
    await new Promise((resolve, reject) => {
      client.once('open', resolve)
      client.once('error', reject)
    })
    let dropped = false
    client.once('close', () => { dropped = true })
    const milkyStop = vi.spyOn(ctx.get('milky')!.httpHandler, 'stop')
    config = { ...structuredClone(config), log: !config.log, musicCardSignUrl: 'https://sign.invalid/other' }
    await ctx.parallel('llob/config-updated', config)
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(dropped).toBe(false)
    expect(milkyStop).not.toHaveBeenCalled()
    // the fields read at call time still reach the adapter
    expect(ctx.get('onebot')!.config.musicCardSignUrl).toBe('https://sign.invalid/other')
    client.close()
    milkyStop.mockRestore()

    // Its own settings changing restarts it: the old port goes, the new one comes up
    const movedPort = await freePort()
    const moved = { connect: [{ ...ob11.connect[0], port: movedPort }] }
    await ctx.plugins.updateConfig(id('builtin:onebot11'), moved)
    await vi.waitFor(async () => expect(await listening(movedPort)).toBe(true))
    expect(await listening(ob11Port)).toBe(false)
    await ctx.plugins.updateConfig(id('builtin:onebot11'), ob11)
    await vi.waitFor(async () => expect(await listening(ob11Port)).toBe(true))

    const adapters = { 'builtin:onebot11': ob11Port, 'builtin:satori': satoriPort, 'builtin:milky': milkyPort }
    for (const [name, port] of Object.entries(adapters)) {
      expect(await ctx.plugins.disable(id(name))).toMatchObject({ state: 'disposed', disabled: true })
      await vi.waitFor(async () => expect(await listening(port), name).toBe(false))
    }
    // A switched-off adapter is unmounted like any plugin
    expect(ctx.get('onebot')).toBeUndefined()

    // Same ports again: anything left bound would fail these with EADDRINUSE
    for (const [name, port] of Object.entries(adapters)) {
      expect(await ctx.plugins.enable(id(name))).toMatchObject({ state: 'active', disabled: false })
      await vi.waitFor(async () => expect(await listening(port), name).toBe(true))
    }
    expect(await ctx.plugins.reload(id('builtin:satori'))).toEqual({ status: 'reloaded' })
    expect(states()['builtin:satori']).toBe('active')
    await vi.waitFor(async () => expect(await listening(satoriPort)).toBe(true))

    await expect(ctx.plugins.disable(id('builtin:ntqq-universal'))).rejects.toBeInstanceOf(PluginForbiddenError)
    await expect(ctx.plugins.disable(id('builtin:webui'))).rejects.toBeInstanceOf(PluginForbiddenError)
    await expect(ctx.plugins.reload(id('builtin:webui'))).rejects.toBeInstanceOf(PluginForbiddenError)
    expect(ctx.get('webuiServer')).toBeDefined()

    for (const builtin of builtinPlugins) {
      if (!builtin.core) await ctx.plugins.disable(id(builtin.name))
    }
    for (const port of [ob11Port, satoriPort, milkyPort]) {
      await vi.waitFor(async () => expect(await listening(port)).toBe(false))
    }
  })

  it('switch the official bot on before its credentials are in: it waits for them, saving checks them', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      if (new URL(input).pathname === '/app/getAppAccessToken') {
        return new Response(JSON.stringify({ access_token: 'tok', expires_in: '7200' }), { status: 200 })
      }
      // No gateway: it retries in the background, which is not what this is about
      return new Response('{}', { status: 503 })
    }))
    const ctx = new Context()
    await ctx.plugin(TimerService)
    await ctx.plugin(BotsService)
    const builtins = builtinPlugins.filter(builtin => builtin.name === 'builtin:qq-official')
    const service = await ctx.plugin(PluginService, { file: path.join(tmp, 'qq-official.json'), roots: [], resolver: false, builtins })
    try {
      const [{ id }] = ctx.plugins.list()
      expect(ctx.plugins.list()[0].notice).toBeUndefined()
      // Not an error: it runs, connects nothing, and says what is missing
      const enabled = await ctx.plugins.enable(id)
      expect(enabled).toMatchObject({ state: 'active', disabled: false, notice: '还没有填写 AppID 和 AppSecret' })
      expect(enabled.error).toBeUndefined()
      expect(ctx.bots.size).toBe(0)
      // While it is on, saving needs both
      await expect(ctx.plugins.updateConfig(id, { appId: 'APPID' })).rejects.toMatchObject({ issues: [{ path: ['secret'] }] })
      const saved = await ctx.plugins.updateConfig(id, { appId: 'APPID', secret: 's' })
      expect(saved).toMatchObject({ state: 'active' })
      expect(saved.notice).toBeUndefined()
      expect(ctx.bots.get('qq:APPID')).toBeDefined()
    } finally {
      await service.dispose()
      vi.unstubAllGlobals()
    }
  })
})
