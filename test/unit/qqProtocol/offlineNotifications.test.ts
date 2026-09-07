import { Context } from 'cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { selfInfo } from '@/common/globalVars'
import { EmailNotificationService } from '@/common/emailNotification'
import { EmailConfigManager } from '@/common/emailConfig'
import { MilkyAdapter } from '@/milky/adapter'

vi.mock('@/common/emailConfig', () => ({
  EmailConfigManager: class {
    loadConfig = vi.fn(async () => ({}))
    getConfig = vi.fn(() => ({ enabled: true }))
  },
}))

vi.mock('@/common/emailService', () => ({
  EmailService: class {
    sendOfflineNotification = vi.fn(async () => ({ success: true }))
  },
}))

describe('session expiration notifications', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    selfInfo.online = true
    // Exercise the real notification handlers without reading config, watching files, or sending mail.
    vi.spyOn(
      EmailNotificationService.prototype as unknown as { initializeConfig(): Promise<void> },
      'initializeConfig',
    ).mockResolvedValue(undefined)
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
      ctx.provide('qqProtocol', { onDisconnect, offDisconnect: vi.fn() })
      const email = new EmailNotificationService(ctx)
      const send = vi.mocked(email.getEmailService().sendOfflineNotification)
      const reason = 'Test authentication failure'
      const emitOffline = () =>
        event === 'qq/session-expired'
          ? ctx.parallel(event, reason)
          : ctx.parallel(event, { tipsDesc: reason, tipsTitle: 'Offline', kickedType: 1001 })

      selfInfo.online = false
      await emitOffline()
      expect(send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ uin: '123456' }), reason)
      await emitOffline()
      onDisconnect.mock.calls[0][1](10000)
      expect(send).toHaveBeenCalledTimes(1)

      selfInfo.online = true
      await vi.advanceTimersByTimeAsync(5000)
      selfInfo.online = false
      await emitOffline()
      expect(send).toHaveBeenCalledTimes(2)
    },
  )

  it('respects disabled email notifications', async () => {
    const ctx = new Context()
    ctx.provide('qqProtocol', { onDisconnect: vi.fn(), offDisconnect: vi.fn() })
    const email = new EmailNotificationService(ctx)
    vi.mocked(email.getConfigManager().getConfig).mockReturnValue({ enabled: false } as ReturnType<
      EmailConfigManager['getConfig']
    >)
    selfInfo.online = false
    await ctx.parallel('qq/session-expired', 'Test authentication failure')
    expect(email.getEmailService().sendOfflineNotification).not.toHaveBeenCalled()
  })

  it.each(['qq/session-expired', 'nt/kicked-offline'] as const)(
    'broadcasts the existing Milky bot_offline payload for %s',
    async (event) => {
      const ctx = new Context()
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
