import { rmSync } from 'node:fs'
import { Context, FiberState, Service } from 'cordis'
import TimerService from '@cordisjs/plugin-timer'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { DATA_DIR } from '@/common/globalVars'
import { defaultConfig } from '@/main/config/defaultConfig'
import { DEFAULT_EMAIL_CONFIG } from '@/plugin/internal/tool/email-notification/config'
import EmailNotificationService from '@/plugin/internal/tool/email-notification'
import { setProtocolSelection } from '@/common/utils/environment'
import * as NTProtocol from '@/plugin/internal/protocol/nt-protocol'

// The NT protocol plugin as a whole, its protocol layer faked: what it provides, what waits for it, and that
// switching it off and on again leaves nothing behind

const protocol = vi.hoisted(() => ({ started: 0, stopped: 0, mounted: [] as string[] }))

vi.mock('@/plugin/internal/protocol/nt-protocol/qqProtocol', async () => {
  const { Service } = await import('cordis')
  const fake = (mode: string) => class FakeProtocol extends Service {
    static inject = ['config']
    // Each mount starts logged out, as the real protocol's own record does
    selfInfo = { uid: '', uin: '', nick: '', online: false }
    constructor(ctx: Context) {
      super(ctx, 'qqProtocol')
    }
    onDisconnect() {
      return 'disconnect-callback'
    }
    offDisconnect() {}
    async [Service.init]() {
      protocol.started++
      protocol.mounted.push(mode)
      return () => {
        protocol.stopped++
      }
    }
  }
  return { DirectQQProtocolClient: fake('direct'), PmhqQQProtocolClient: fake('pmhq') }
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

// `account` is there too, but its check holds what injects it back until the login
const BEFORE_LOGIN = ['qqProtocol', 'account', 'ntFriendApi', 'ntGroupApi', 'ntLoginApi', 'ntSystemApi']
// What needs the per-account database, which is the protocol's own: the plugins' ctx.database is builtin:database
const AFTER_LOGIN = ['store', 'app', 'ntMsgApi', 'ntUserApi', 'ntFileApi', 'ntWebApi']

// Not the service itself: printing a service on a failed assertion trips cordis's inject check
const has = (ctx: Context, name: string) => ctx.get(name) !== undefined

async function login(ctx: Context) {
  Object.assign(ctx.get('qqProtocol')!.selfInfo, { online: true, uin: '10001', uid: 'u_10001', nick: 'Bot' })
  await ctx.parallel('qq/online')
}

afterAll(() => {
  rmSync(DATA_DIR, { recursive: true, force: true })
})

describe('builtin:nt-protocol', () => {
  it('runs the scanned account while on, and takes it and everything built on it down when off', async () => {
    const ctx = new Context()
    await ctx.plugin(TimerService)
    await ctx.plugin(MockConfig)
    const dependent: string[] = []
    ctx.plugin({
      name: 'needs-the-account',
      inject: ['account', 'app', 'store'],
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
    // Present but not logged in yet: the account gate holds everything else back
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

  it('mounts the login method of its settings, and remounts only for another mode or PMHQ configuration', async () => {
    const ctx = new Context()
    await ctx.plugin(TimerService)
    await ctx.plugin(MockConfig)
    protocol.mounted.length = 0
    const entry = await ctx.plugin(NTProtocol, { mode: 'direct', protocol: 'linux' })
    await vi.waitFor(() => expect(protocol.mounted).toEqual(['direct']))
    expect(setProtocolSelection).toHaveBeenLastCalledWith({ mode: 'direct', protocol: 'linux', pmhq: { configPath: '', qqPath: '' } })

    // The pure protocol reads its protocol as its client is created, so the account stays logged in
    await entry.update({ mode: 'direct', protocol: 'macos' })
    expect(protocol.mounted).toEqual(['direct'])
    expect(setProtocolSelection).toHaveBeenLastCalledWith(expect.objectContaining({ protocol: 'macos' }))
    await entry.update({ mode: 'direct', protocol: 'macos', pmhq: { configPath: '/other.json', qqPath: '' } })
    expect(protocol.mounted).toEqual(['direct'])

    await entry.update({ mode: 'pmhq', protocol: 'macos', pmhq: { configPath: '/other.json', qqPath: '' } })
    await vi.waitFor(() => expect(protocol.mounted).toEqual(['direct', 'pmhq']))
    await entry.update({ mode: 'pmhq', protocol: 'linux', pmhq: { configPath: '/other.json', qqPath: '' } })
    expect(protocol.mounted).toEqual(['direct', 'pmhq'])
    await entry.update({ mode: 'pmhq', protocol: 'linux', pmhq: { configPath: '/pmhq.json', qqPath: '' } })
    await vi.waitFor(() => expect(protocol.mounted).toEqual(['direct', 'pmhq', 'pmhq']))
    expect(setProtocolSelection).toHaveBeenLastCalledWith({ mode: 'pmhq', protocol: 'linux', pmhq: { configPath: '/pmhq.json', qqPath: '' } })

    await entry.dispose()
  })
})
