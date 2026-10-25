import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context, Fiber, FiberState, Service } from 'cordis'
import Database from '@cordisjs/plugin-database'
import SQLiteDriver from '@cordisjs/plugin-database-sqlite'
import TimerService from '@cordisjs/plugin-timer'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { Config as LLBotConfig } from '@/common/types'
import { DATA_DIR } from '@/common/globalVars'
import { adapterDefaults, defaultConfig } from '@/main/config/defaultConfig'
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
import OneBot11Adapter from '@/onebot11/adapter'
import SatoriAdapter from '@/satori/adapter'
import MilkyAdapter from '@/milky/adapter'
import { WebuiServer } from '@/webui/BE/server'
import { DashboardRoutes, EmailRoutes, WebQQ } from '@/webui/BE/routes'
import EmailNotificationService from '@/common/emailNotification'
import AccountService from '@/main/account'
import BotsService from '@/universal/bots'
import * as NTQQUniversal from '@/universal/ntqq'

// The global setup points DATA_DIR at /tmp/test-data, which on Windows lands outside the repo.
// Services here really write (email config, webqq upload dir, sqlite), so use a private temp dir.
vi.mock('@/common/globalVars', async () => {
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'llbot-registry-'))
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

const config: LLBotConfig = {
  ...defaultConfig,
  ob11: { enable: false, connect: [] },
  webui: { ...defaultConfig.webui, enable: false },
}

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

const dbDir = mkdtempSync(path.join(os.tmpdir(), 'llbot-registry-db-'))

afterAll(() => {
  rmSync(dbDir, { recursive: true, force: true })
  rmSync(DATA_DIR, { recursive: true, force: true })
})

describe('service registry under the pinned cordis version', () => {
  it('brings every built-in service to ACTIVE', async () => {
    const ctx = new Context()
    const fibers: Record<string, Fiber> = {}
    const mount = (name: string, plugin: any, cfg?: unknown) => {
      fibers[name] = ctx.plugin(plugin, cfg)
    }

    mount('timer', TimerService)
    mount('config', MockConfig)
    mount('qqProtocol', MockProtocol)
    mount('account', AccountService)
    mount('bots', BotsService)
    mount('ntFileApi', NTFileApi)
    mount('ntFriendApi', NTFriendApi)
    mount('ntGroupApi', NTGroupApi)
    mount('ntLoginApi', NTLoginApi)
    mount('ntMsgApi', NTMsgApi)
    mount('ntUserApi', NTUserApi)
    mount('ntWebApi', NTWebApi)
    mount('ntSystemApi', NTSystemApi)
    mount('database', Database)
    mount('sqlite', SQLiteDriver, { path: pathToFileURL(path.join(dbDir, 'registry.db')).href })
    mount('app', Core, config)
    mount('onebot', OneBot11Adapter, {
      ...adapterDefaults.ob11,
      cardMsgSignUrl: config.cardMsgSignUrl,
      enableLocalFile2Url: config.enableLocalFile2Url!,
      ffmpeg: config.ffmpeg,
    })
    mount('satori', SatoriAdapter, { ...adapterDefaults.satori, ffmpeg: config.ffmpeg })
    mount('milky', MilkyAdapter, adapterDefaults.milky)
    mount('ntqq-universal', NTQQUniversal)
    mount('store', Store, { msgCacheExpire: config.msgCacheExpire! })
    mount('emailNotification', EmailNotificationService)
    mount('webuiServer', WebuiServer, config.webui)
    // Route plugins: their inject lists have to be satisfiable by the real services
    mount('webqq', WebQQ)
    mount('dashboardRoutes', DashboardRoutes)
    mount('emailRoutes', EmailRoutes)

    await vi.waitFor(() => {
      const stuck = Object.entries(fibers)
        .filter(([, fiber]) => fiber.state !== FiberState.ACTIVE)
        .map(([name, fiber]) => `${name}=${FiberState[fiber.state]}`)
      expect(stuck).toEqual([])
    }, { timeout: 4_000, interval: 200 })

    for (const name of [
      'config', 'qqProtocol', 'account', 'bots', 'timer', 'database', 'model', 'store', 'app',
      'ntFileApi', 'ntFriendApi', 'ntGroupApi', 'ntLoginApi', 'ntMsgApi', 'ntUserApi', 'ntWebApi', 'ntSystemApi',
      'onebot', 'satori', 'milky', 'emailNotification', 'webuiServer',
    ]) {
      expect(ctx.get(name), name).toBeDefined()
    }

    await Promise.all(Object.values(fibers).reverse().map(fiber => fiber.dispose()))
  })
})
