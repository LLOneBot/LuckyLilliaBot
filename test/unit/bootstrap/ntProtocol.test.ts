import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Context, FiberState, Service } from 'cordis'
import TimerService from '@cordisjs/plugin-timer'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DATA_DIR } from '@/common/globalVars'
import { defaultConfig } from '@/main/config/defaultConfig'
import { DEFAULT_EMAIL_CONFIG } from '@/plugin/internal/tool/email-notification/config'
import EmailNotificationService from '@/plugin/internal/tool/email-notification'
import { setProtocolSelection } from '@/common/utils/environment'
import * as NTProtocol from '@/plugin/internal/protocol/nt-protocol'
import { builtin } from '@/plugin/internal/protocol/nt-protocol/builtin'
import PluginService from '@/plugin/host'
import BotsService from '@/universal/bots'
import * as NTQQUniversal from '@/plugin/internal/service/ntqq-universal'

// The NT protocol plugin as a whole, its protocol layer faked: what it provides, what waits for it, and that
// switching it off and on again leaves nothing behind

const protocol = vi.hoisted(() => ({ started: 0, stopped: 0, mounted: [] as string[], autoLogins: [] as string[] }))

vi.mock('@/plugin/internal/protocol/nt-protocol/qqProtocol', async () => {
  const { Service } = await import('cordis')
  const fake = (mode: string) => class FakeProtocol extends Service {
    static inject = ['config']
    // Each mount starts logged out, as the real protocol's own record does
    selfInfo = { uid: '', uin: '', nick: '', online: false }
    constructor(ctx: Context, private readonly options: { autoLoginUin?: string } = {}) {
      super(ctx, 'qqProtocol')
    }
    onDisconnect() {
      return 'disconnect-callback'
    }
    offDisconnect() {}
    async [Service.init]() {
      protocol.started++
      protocol.mounted.push(mode)
      protocol.autoLogins.push(this.options.autoLoginUin ?? '')
      return () => {
        protocol.stopped++
      }
    }
  }
  return { DirectQQProtocolClient: fake('direct'), NativeQQProtocolClient: fake('nativeqq') }
})

// These services write into DATA_DIR (the database after login), so it gets a private temp dir
vi.mock('@/common/globalVars', async () => {
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'llbot-nt-protocol-'))
  fs.mkdirSync(path.join(dir, 'database'))
  return {
    DATA_DIR: dir,
    TEMP_DIR: path.join(dir, 'temp'),
    LOG_DIR: path.join(dir, 'logs'),
    dbDir: path.join(dir, 'database'),
    getFixedDataDir: () => dir,
  }
})

class MockConfig extends Service {
  constructor(ctx: Context) {
    super(ctx, 'config')
  }
  get() {
    return { ...defaultConfig, webui: { ...defaultConfig.webui, enable: false } }
  }
  listenChange() {}
}

const BEFORE_LOGIN = ['qqProtocol', 'ntLoginApi', 'ntSystemApi']
// What needs the per-account database, which is the protocol's own: the plugins' ctx.database is builtin:database
const AFTER_LOGIN = ['store', 'app', 'ntFriendApi', 'ntGroupApi', 'ntMsgApi', 'ntUserApi', 'ntFileApi', 'ntWebApi']

// Not the service itself: printing a service on a failed assertion trips cordis's inject check
const has = (ctx: Context, name: string) => ctx.get(name) !== undefined

async function login(ctx: Context, uin = '10001') {
  Object.assign(ctx.get('qqProtocol')!.selfInfo, { online: true, uin, uid: `u_${uin}`, nick: 'Bot' })
  await ctx.parallel('qq/online')
}

beforeEach(() => {
  protocol.started = 0
  protocol.stopped = 0
  protocol.mounted.length = 0
  protocol.autoLogins.length = 0
})

afterAll(() => {
  rmSync(DATA_DIR, { recursive: true, force: true })
})

describe('builtin:nt-protocol', () => {
  it.each(['direct', 'nativeqq'])('persists automatic login for the next %s start without disconnecting the account', async (mode) => {
    const file = path.join(DATA_DIR, `auto-login-${mode}.json`)
    writeFileSync(file, JSON.stringify({ version: 1, entries: [{ id: 'ntauto00', name: builtin.name, config: { mode } }] }))
    const ctx = new Context()
    const timer = await ctx.plugin(TimerService)
    await ctx.plugin(MockConfig)
    const options = { file, roots: [], resolver: false, builtins: [builtin] }
    let host = await ctx.plugin(PluginService, options)
    try {
      await vi.waitFor(() => expect(protocol.autoLogins).toEqual(['']))
      const identity = ctx.get('qqProtocol')!.selfInfo
      Object.assign(identity, { online: true, uin: '123456', uid: 'u_123456', nick: 'Bot' })
      const implementation = ctx.reflect._getImpl('qqProtocol')
      let description = await ctx.plugins.describe('ntauto00')
      expect(description.effective).toHaveProperty('autoLoginUin', '')
      await ctx.plugins.updateConfig('ntauto00', { ...description.effective, autoLoginUin: '123456' }, description.rev)
      expect(ctx.reflect._getImpl('qqProtocol') === implementation).toBe(true)
      expect(identity.online).toBe(true)
      expect(protocol.started).toBe(1)
      expect(JSON.parse(readFileSync(file, 'utf8')).entries[0].config.autoLoginUin).toBe('123456')

      await host.dispose()
      host = await ctx.plugin(PluginService, options)
      await vi.waitFor(() => expect(protocol.autoLogins).toEqual(['', '123456']))
      description = await ctx.plugins.describe('ntauto00')
      await ctx.plugins.updateConfig('ntauto00', { ...description.effective, autoLoginUin: '' }, description.rev)
      expect(protocol.started).toBe(2)
      expect(JSON.parse(readFileSync(file, 'utf8')).entries[0].config ?? {}).not.toHaveProperty('autoLoginUin')

      await host.dispose()
      host = await ctx.plugin(PluginService, options)
      await vi.waitFor(() => expect(protocol.autoLogins).toEqual(['', '123456', '']))
    } finally {
      await host.dispose()
      await timer.dispose()
    }
  })

  it('reuses resources on reconnect and replaces the database, caches and bot after logout or a different identity', async () => {
    const ctx = new Context()
    const timer = await ctx.plugin(TimerService)
    await ctx.plugin(MockConfig)
    const bots = await ctx.plugin(BotsService)
    const universal = ctx.plugin(NTQQUniversal)
    const entry = await ctx.plugin(NTProtocol)
    try {
      await vi.waitFor(() => expect(has(ctx, 'qqProtocol')).toBe(true))
      await login(ctx)
      await vi.waitFor(() => expect(ctx.bots.get('luckylillia:10001') !== undefined).toBe(true))
      // ctx.get() returns a fresh tracked proxy; compare the provider implementations.
      const store = ctx.reflect._getImpl('store')
      const friends = ctx.reflect._getImpl('ntFriendApi')
      const groups = ctx.reflect._getImpl('ntGroupApi')
      ctx.get('qqProtocol')!.selfInfo.online = false
      await ctx.parallel('protocol/disconnect')
      await Promise.all([login(ctx), login(ctx)])
      expect(ctx.reflect._getImpl('store') === store).toBe(true)
      expect(ctx.bots.size).toBe(1)

      await login(ctx, '10002')
      await vi.waitFor(() => expect(ctx.bots.get('luckylillia:10002') !== undefined).toBe(true))
      expect(ctx.bots.get('luckylillia:10001')).toBeUndefined()
      expect(ctx.reflect._getImpl('store') === store).toBe(false)
      expect(ctx.reflect._getImpl('ntFriendApi') === friends).toBe(false)
      expect(ctx.reflect._getImpl('ntGroupApi') === groups).toBe(false)
      for (const uin of ['10001', '10002']) {
        expect(existsSync(path.join(DATA_DIR, 'database', `${uin}.v3.db`))).toBe(true)
      }
      Object.assign(ctx.get('qqProtocol')!.selfInfo, { online: false, uin: '', uid: '', nick: '' })
      await ctx.parallel('qq/logout')
      expect(ctx.bots.size).toBe(0)
      for (const name of AFTER_LOGIN) expect(has(ctx, name), name).toBe(false)
      for (const name of BEFORE_LOGIN) expect(has(ctx, name), name).toBe(true)
      await login(ctx, '10002')
      await vi.waitFor(() => expect(ctx.bots.get('luckylillia:10002') !== undefined).toBe(true))
    } finally {
      await entry.dispose()
      await universal.dispose()
      await bots.dispose()
      await timer.dispose()
    }
  })

  it('runs the scanned account while on, and takes it and everything built on it down when off', async () => {
    const ctx = new Context()
    await ctx.plugin(TimerService)
    await ctx.plugin(MockConfig)
    const dependent: string[] = []
    ctx.plugin({
      name: 'needs-the-account',
      inject: ['app', 'store'],
      apply(ctx: Context) {
        ctx.effect(() => {
          dependent.push('up')
          return () => { dependent.push('down') }
        })
      },
    })
    const email = ctx.plugin(EmailNotificationService, { ...DEFAULT_EMAIL_CONFIG })

    let entry = await ctx.plugin(NTProtocol)
    await vi.waitFor(() => {
      for (const name of BEFORE_LOGIN) expect(has(ctx, name), name).toBe(true)
    })
    for (const name of AFTER_LOGIN) expect(has(ctx, name), name).toBe(false)
    expect(protocol.started).toBe(1)
    // The protocol is present, but its login resources have not been created.
    expect(has(ctx, 'account')).toBe(false)
    expect(dependent).toEqual([])

    await login(ctx)
    await vi.waitFor(() => expect(dependent).toEqual(['up']))
    for (const name of AFTER_LOGIN) expect(has(ctx, name), name).toBe(true)
    expect(has(ctx, 'database')).toBe(false)
    await vi.waitFor(() => expect(email.state).toBe(FiberState.ACTIVE))

    await entry.dispose()
    for (const name of [...BEFORE_LOGIN, ...AFTER_LOGIN]) expect(has(ctx, name), name).toBe(false)
    expect(protocol.stopped).toBe(1)
    expect(dependent).toEqual(['up', 'down'])
    // Waiting for the protocol again, not broken by it going away
    expect(email.state).toBe(FiberState.PENDING)

    entry = await ctx.plugin(NTProtocol)
    await vi.waitFor(() => {
      for (const name of BEFORE_LOGIN) expect(has(ctx, name), name).toBe(true)
    })
    expect(protocol.started).toBe(2)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(dependent).toEqual(['up', 'down'])

    await login(ctx)
    await vi.waitFor(() => expect(dependent).toEqual(['up', 'down', 'up']))
    await vi.waitFor(() => expect(email.state).toBe(FiberState.ACTIVE))

    await entry.dispose()
    await email.dispose()
  })

  it('mounts the login method of its settings, and remounts only for another mode or another QQ to bridge', async () => {
    const ctx = new Context()
    await ctx.plugin(TimerService)
    await ctx.plugin(MockConfig)
    protocol.mounted.length = 0
    const entry = await ctx.plugin(NTProtocol, { mode: 'direct', protocol: 'linux' })
    await vi.waitFor(() => expect(protocol.mounted).toEqual(['direct']))
    expect(setProtocolSelection).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'direct', protocol: 'linux', nativeQQ: { qqPath: '' } }))

    // The pure protocol reads its protocol as its client is created, so the account stays logged in
    await entry.update({ mode: 'direct', protocol: 'macos' })
    expect(protocol.mounted).toEqual(['direct'])
    expect(setProtocolSelection).toHaveBeenLastCalledWith(expect.objectContaining({ protocol: 'macos' }))
    await entry.update({ mode: 'direct', protocol: 'macos', nativeQQ: { qqPath: '/other/QQ' } })
    expect(protocol.mounted).toEqual(['direct'])

    await entry.update({ mode: 'nativeqq', protocol: 'macos', nativeQQ: { qqPath: '/other/QQ' } })
    await vi.waitFor(() => expect(protocol.mounted).toEqual(['direct', 'nativeqq']))
    await entry.update({ mode: 'nativeqq', protocol: 'linux', nativeQQ: { qqPath: '/other/QQ' } })
    expect(protocol.mounted).toEqual(['direct', 'nativeqq'])
    await entry.update({ mode: 'nativeqq', protocol: 'linux', nativeQQ: { qqPath: '/QQ' } })
    await vi.waitFor(() => expect(protocol.mounted).toEqual(['direct', 'nativeqq', 'nativeqq']))
    expect(setProtocolSelection).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'nativeqq', protocol: 'linux', nativeQQ: { qqPath: '/QQ' } }))

    await entry.dispose()
  })
})
