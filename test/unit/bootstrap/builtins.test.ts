import { mkdtempSync, rmSync } from 'node:fs'
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
import { defaultConfig } from '@/main/config/defaultConfig'
import {
  NTFileApi,
  NTFriendApi,
  NTGroupApi,
  NTLoginApi,
  NTMsgApi,
  NTSystemApi,
  NTUserApi,
  NTWebApi,
} from '@/ntqqapi/api'
import Core from '@/ntqqapi/core'
import Store from '@/main/store'
import AccountService from '@/main/account'
import { builtinPlugins } from '@/main/builtins'
import BotsService from '@/universal/bots'
import { WebuiServer } from '@/webui/BE/server'
import PluginService, { PluginForbiddenError, PluginState } from '@/plugin'

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
    selfInfo: { uid: 'test-uid', uin: '123456', nick: 'TestBot', online: true },
    authTokenStatus: { hasToken: false, validation: 'idle', message: '', loginError: '' },
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
  set() {}
  listenChange() {}
}

class MockProtocol extends Service {
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
  it('start after login with the old settings and free their ports when disabled', async () => {
    const [ob11Port, satoriPort, milkyPort] = await Promise.all([freePort(), freePort(), freePort()])
    config = {
      ...defaultConfig,
      ob11: {
        enable: true,
        connect: [{
          type: 'ws', enable: true, host: '127.0.0.1', port: ob11Port, heartInterval: 30_000, token: '',
          reportSelfMessage: false, reportOfflineMessage: false, messageFormat: 'array', debug: false,
        }],
      },
      satori: { enable: true, host: '127.0.0.1', port: satoriPort, token: '' },
      milky: { ...defaultConfig.milky, enable: true, http: { ...defaultConfig.milky.http, port: milkyPort } },
      webui: { ...defaultConfig.webui, enable: false },
      musicSignUrl: 'https://sign.invalid/music',
      enableLocalFile2Url: true,
      ffmpeg: '/opt/ffmpeg',
    }

    const ctx = new Context()
    await ctx.plugin(TimerService)
    for (const plugin of [MockConfig, MockProtocol, BotsService, NTFileApi, NTFriendApi, NTGroupApi, NTLoginApi, NTMsgApi, NTUserApi, NTWebApi, NTSystemApi]) {
      ctx.plugin(plugin)
    }
    // builtin:webqq mounts its routes on the WebUI
    ctx.plugin(WebuiServer, config.webui)
    // As in main.ts: the database is per account, so the core services wait for the login
    mounted.push(ctx.inject(['account', 'config'], (ctx) => {
      ctx.plugin(Database)
      ctx.plugin(SQLiteDriver, { path: pathToFileURL(path.join(tmp, 'builtins.db')).href })
      ctx.plugin(Core, config)
      ctx.plugin(Store, { msgCacheExpire: config.msgCacheExpire! })
    }))
    mounted.push(await ctx.plugin(PluginService, { file: path.join(tmp, 'plugins.json'), roots: [], resolver: false, builtins: builtinPlugins }))

    const id = (name: string) => ctx.plugins.list().find(status => status.name === name)!.id
    const states = () => Object.fromEntries(ctx.plugins.list().map(status => [status.name, status.state]))
    const allIn = (state: PluginState) => Object.fromEntries(builtinPlugins.map(builtin => [builtin.name, state]))

    // Nothing that needs the account runs before the first login
    for (const status of ctx.plugins.list()) {
      expect(status, status.name).toMatchObject({ state: 'pending', missingDeps: expect.arrayContaining(['account']) })
    }

    ctx.plugin(AccountService)
    await vi.waitFor(() => expect(states()).toEqual(allIn('active')), { timeout: 4_000, interval: 50 })
    for (const port of [ob11Port, satoriPort, milkyPort]) {
      await vi.waitFor(async () => expect(await listening(port), `port ${port}`).toBe(true))
    }

    // Field by field what main.ts used to hand the adapters
    expect(ctx.get('onebot')!.config).toEqual({
      ...config.ob11,
      musicSignUrl: config.musicSignUrl,
      enableLocalFile2Url: config.enableLocalFile2Url,
      ffmpeg: config.ffmpeg,
    })
    expect(ctx.get('satori')!.config).toEqual({ ...config.satori, ffmpeg: config.ffmpeg })
    expect(ctx.get('milky')!.config).toBe(config.milky)

    // A save that leaves an adapter's own section alone must not touch its connections. structuredClone
    // stands in for the file watcher, which hands over a whole new object tree
    const client = new WebSocket(`ws://127.0.0.1:${ob11Port}/`)
    await new Promise((resolve, reject) => {
      client.once('open', resolve)
      client.once('error', reject)
    })
    let dropped = false
    client.once('close', () => { dropped = true })
    const milkyStop = vi.spyOn(ctx.get('milky')!.httpHandler, 'stop')
    config = { ...structuredClone(config), log: !config.log, musicSignUrl: 'https://sign.invalid/other' }
    await ctx.parallel('llob/config-updated', config)
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(dropped).toBe(false)
    expect(milkyStop).not.toHaveBeenCalled()
    // the hot fields still reach the adapter
    expect(ctx.get('onebot')!.config.musicSignUrl).toBe('https://sign.invalid/other')
    client.close()

    // Its own section changing does rebuild: the old port goes, the new one comes up
    const movedPort = await freePort()
    const moved = structuredClone(config)
    moved.ob11.connect[0] = { ...moved.ob11.connect[0], port: movedPort }
    await ctx.parallel('llob/config-updated', moved)
    await vi.waitFor(async () => expect(await listening(movedPort)).toBe(true))
    expect(await listening(ob11Port)).toBe(false)
    await ctx.parallel('llob/config-updated', config)
    await vi.waitFor(async () => expect(await listening(ob11Port)).toBe(true))
    milkyStop.mockRestore()

    const adapters = { 'builtin:onebot11': ob11Port, 'builtin:satori': satoriPort, 'builtin:milky': milkyPort }
    for (const [name, port] of Object.entries(adapters)) {
      expect(await ctx.plugins.disable(id(name))).toMatchObject({ state: 'disposed', disabled: true })
      await vi.waitFor(async () => expect(await listening(port), name).toBe(false))
    }
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

    for (const builtin of builtinPlugins) {
      if (!builtin.core) await ctx.plugins.disable(id(builtin.name))
    }
    for (const port of [ob11Port, satoriPort, milkyPort]) {
      await vi.waitFor(async () => expect(await listening(port)).toBe(false))
    }
  })
})
