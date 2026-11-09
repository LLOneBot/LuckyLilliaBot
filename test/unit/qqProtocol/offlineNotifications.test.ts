import { Context, Service } from 'cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EmailNotificationService } from '@/plugin/internal/tool/email-notification'
import { DEFAULT_EMAIL_CONFIG, EmailConfigManager } from '@/plugin/internal/tool/email-notification/config'
import { MilkyAdapter } from '@/plugin/internal/adapter/milky/adapter'
import { NativeQQProtocol } from '@/plugin/internal/protocol/nt-protocol/qqProtocol/nativeQQ'

vi.mock('@/plugin/internal/tool/email-notification/config', async importOriginal => ({
  ...await importOriginal<object>(),
  // The handlers under test only look at the manager
  EmailConfigManager: class {
    getConfig = vi.fn(() => ({ enabled: true }))
  },
}))

vi.mock('@/plugin/internal/tool/email-notification/service', () => ({
  EmailService: class {
    sendOfflineNotification = vi.fn(async () => ({ success: true }))
  },
}))

describe('session expiration notifications', () => {
  // The protocol owns its current identity; notifications do not wait for a login service.
  const account = { uin: '123456', uid: 'test-uid', nick: 'TestBot', online: true }

  beforeEach(() => {
    vi.useFakeTimers()
    account.online = true
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it.each(['qq/session-expired', 'nt/kicked-offline'] as const)(
    'sends the reason once and rearms after login for %s',
    async (event) => {
      const ctx = new Context()
      const onDisconnect = vi.fn()
      ctx.provide('qqProtocol', { selfInfo: account, onDisconnect, offDisconnect: vi.fn() })
      const email = new EmailNotificationService(ctx, DEFAULT_EMAIL_CONFIG)
      const send = vi.mocked(email.getEmailService().sendOfflineNotification)
      const reason = 'Test authentication failure'
      const emitOffline = () =>
        event === 'qq/session-expired'
          ? ctx.parallel(event, reason)
          : ctx.parallel(event, { tipsDesc: reason, tipsTitle: 'Offline', kickedType: 1001 })

      account.online = false
      await emitOffline()
      expect(send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ uin: '123456' }), reason)
      await emitOffline()
      onDisconnect.mock.calls[0][1](10000)
      expect(send).toHaveBeenCalledTimes(1)

      account.online = true
      await ctx.parallel('qq/online')
      account.online = false
      await emitOffline()
      expect(send).toHaveBeenCalledTimes(2)
    },
  )

  it('respects disabled email notifications', async () => {
    const ctx = new Context()
    ctx.provide('qqProtocol', { selfInfo: account, onDisconnect: vi.fn(), offDisconnect: vi.fn() })
    const email = new EmailNotificationService(ctx, DEFAULT_EMAIL_CONFIG)
    vi.mocked(email.getConfigManager().getConfig).mockReturnValue({ enabled: false } as ReturnType<
      EmailConfigManager['getConfig']
    >)
    account.online = false
    await ctx.parallel('qq/session-expired', 'Test authentication failure')
    expect(email.getEmailService().sendOfflineNotification).not.toHaveBeenCalled()
  })

  it('ignores connection failures before the first login', async () => {
    const ctx = new Context()
    const selfInfo = { uin: '', uid: '', nick: '', online: false }
    const onDisconnect = vi.fn().mockReturnValue('watcher')
    ctx.provide('qqProtocol', { selfInfo, onDisconnect, offDisconnect: vi.fn() })
    const email = new EmailNotificationService(ctx, DEFAULT_EMAIL_CONFIG)
    const send = vi.mocked(email.getEmailService().sendOfflineNotification)

    await ctx.parallel('qq/session-expired', 'Not logged in')
    onDisconnect.mock.calls[0][1](10000)
    expect(send).not.toHaveBeenCalled()

    Object.assign(selfInfo, account)
    await ctx.parallel('qq/online')
    selfInfo.online = false
    await ctx.parallel('qq/session-expired', 'Expired after login')
    expect(send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ uin: '123456', uid: 'test-uid' }),
      'Expired after login',
    )
  })

  it('rearms connection timeout notices on each successful reconnect', async () => {
    const ctx = new Context()
    const onDisconnect = vi.fn()
    ctx.provide('qqProtocol', { selfInfo: account, onDisconnect, offDisconnect: vi.fn() })
    const email = new EmailNotificationService(ctx, DEFAULT_EMAIL_CONFIG)
    const send = vi.mocked(email.getEmailService().sendOfflineNotification)

    account.online = false
    onDisconnect.mock.calls[0][1](10000)
    await Promise.resolve()
    expect(send).toHaveBeenCalledTimes(1)
    account.online = true
    await ctx.parallel('qq/online')
    account.online = false
    onDisconnect.mock.calls[0][1](10000)
    await Promise.resolve()
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('removes its disconnect callback and stays silent when disabled', async () => {
    const ctx = new Context()
    const onDisconnect = vi.fn().mockReturnValue('watcher')
    const offDisconnect = vi.fn()
    ctx.provide('qqProtocol', { selfInfo: account, onDisconnect, offDisconnect })
    const email = new EmailNotificationService(ctx, DEFAULT_EMAIL_CONFIG)
    const dispose = await email[Service.init]()
    dispose()
    expect(offDisconnect).toHaveBeenCalledExactlyOnceWith('watcher')
    onDisconnect.mock.calls[0][1](10000)
    expect(email.getEmailService().sendOfflineNotification).not.toHaveBeenCalled()
  })

  it('does not notify after an intentional logout', async () => {
    const ctx = new Context()
    const selfInfo = { ...account }
    const onDisconnect = vi.fn()
    ctx.provide('qqProtocol', { selfInfo, onDisconnect, offDisconnect: vi.fn() })
    const email = new EmailNotificationService(ctx, DEFAULT_EMAIL_CONFIG)
    Object.assign(selfInfo, { uin: '', uid: '', nick: '', online: false })
    await ctx.parallel('qq/logout')
    onDisconnect.mock.calls[0][1](10000)
    await ctx.parallel('qq/session-expired', 'Already logged out')
    expect(email.getEmailService().sendOfflineNotification).not.toHaveBeenCalled()
  })

  it.each(['qq/session-expired', 'nt/kicked-offline'] as const)(
    'broadcasts the existing Milky bot_offline payload for %s',
    async (event) => {
      const ctx = new Context()
      ctx.provide('qqProtocol', { selfInfo: account })
      // Only event registration and serialization are needed; no HTTP server or webhook is started.
      const http = { broadcast: vi.fn() }
      const webhook = { broadcast: vi.fn() }
      const adapter = Object.assign(Object.create(MilkyAdapter.prototype) as MilkyAdapter, {
        ctx,
        httpHandler: http,
        webhookHandler: webhook,
      })
      adapter['setupEventListeners']()
      const reason = 'Test authentication failure'
      if (event === 'qq/session-expired') await ctx.parallel(event, reason)
      else await ctx.parallel(event, { tipsDesc: reason, tipsTitle: 'Offline', kickedType: 1001 })

      expect(http.broadcast).toHaveBeenCalledTimes(1)
      const payload = JSON.parse(http.broadcast.mock.calls[0][0])
      expect(payload).toMatchObject({ self_id: 123456, event_type: 'bot_offline', data: { reason } })
      expect(webhook.broadcast).toHaveBeenCalledExactlyOnceWith(http.broadcast.mock.calls[0][0])
    },
  )
})

describe('NativeQQ session failure notifications', () => {
  const endings = [
    { name: 'error callback', reason: 'QQ process crashed', trigger: (protocol: NativeQQProtocol) => {
      protocol['onNativeEvent']({ type: 'error', message: 'QQ process crashed' }, 0)
    } },
    { name: 'stopped callback', reason: 'NativeQQ 会话已结束', trigger: (protocol: NativeQQProtocol) => {
      protocol['onNativeEvent']({ type: 'status', data: { status: 'stopped' } }, 0)
    } },
    { name: 'failed health', reason: 'native session failed', trigger: async (protocol: NativeQQProtocol) => {
      Object.assign(protocol, { native: { health: async () => ({ sessionStatus: 'failed', failure: 'native session failed' }) } })
      await protocol['probe'](0)
    } },
  ]

  it.each(endings)('reports $name with the old identity before clearing it', async ({ trigger, reason }) => {
    const ctx = new Context()
    const protocol = new NativeQQProtocol(ctx)
    Object.assign(protocol.selfInfo, { uin: '123456', uid: 'test-uid', nick: 'TestBot', online: true })
    const email = new EmailNotificationService(ctx, DEFAULT_EMAIL_CONFIG)
    await trigger(protocol)
    expect(email.getEmailService().sendOfflineNotification).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ uin: '123456', uid: 'test-uid', nick: 'TestBot' }), reason,
    )
    expect(protocol.selfInfo).toEqual({ uin: '', uid: '', nick: '', online: false })
    await trigger(protocol)
    expect(email.getEmailService().sendOfflineNotification).toHaveBeenCalledTimes(1)
  })

  it.each(endings)('does not report $name before the first login', async ({ trigger }) => {
    const ctx = new Context()
    const protocol = new NativeQQProtocol(ctx)
    const email = new EmailNotificationService(ctx, DEFAULT_EMAIL_CONFIG)
    await trigger(protocol)
    expect(email.getEmailService().sendOfflineNotification).not.toHaveBeenCalled()
  })

  it('keeps a requested protocol stop silent, including late native callbacks', async () => {
    const ctx = new Context()
    const protocol = new NativeQQProtocol(ctx)
    Object.assign(protocol.selfInfo, { uin: '123456', uid: 'test-uid', nick: 'TestBot', online: true })
    const email = new EmailNotificationService(ctx, DEFAULT_EMAIL_CONFIG)
    await protocol['stop']()
    protocol['onNativeEvent']({ type: 'status', data: { status: 'stopped' } }, 0)
    expect(email.getEmailService().sendOfflineNotification).not.toHaveBeenCalled()
  })
})
