import { Context, Service } from 'cordis'
import { EmailService, BotInfo } from './service'
import { EmailConfigManager, EmailSchema, EmailSettings } from './config'

declare module 'cordis' {
  interface Context {
    emailNotification: EmailNotificationService
  }
}

export class EmailNotificationService extends Service {
  static inject = ['qqProtocol']
  static Config = EmailSchema

  private emailService: EmailService
  private configManager: EmailConfigManager
  private notificationSent: boolean = false
  private hasLoggedIn: boolean = false
  private disconnectId: string | null = null

  constructor(ctx: Context, config: EmailSettings) {
    super(ctx, 'emailNotification')
    // Running at all means its entry is switched on; a settings change restarts it with the new ones
    this.configManager = new EmailConfigManager(() => ({ ...config, enabled: true }))
    this.emailService = new EmailService(this.configManager, ctx.logger)
    this.registerEventListeners()
    this.registerDisconnectCallback()
  }

  async [Service.init]() {
    return () => {
      this.hasLoggedIn = false
      // Gone already when the protocol plugin itself was switched off
      if (this.disconnectId) {
        this.ctx.get('qqProtocol')?.offDisconnect(this.disconnectId)
      }
    }
  }

  private registerEventListeners() {
    const self = this.ctx.qqProtocol.selfInfo
    this.hasLoggedIn = !!(self.uin && self.uid)
    this.ctx.on('qq/online', () => {
      this.hasLoggedIn = true
      this.notificationSent = false
    })
    this.ctx.on('qq/logout', () => {
      this.hasLoggedIn = false
      this.notificationSent = false
    })

    this.ctx.on('nt/kicked-offline', (data) => {
      this.onOffline(data.tipsDesc || data.tipsTitle)
    })

    this.ctx.on('qq/session-expired', (reason) => {
      this.onOffline(reason)
    })
  }

  private registerDisconnectCallback() {
    this.disconnectId = this.ctx.qqProtocol.onDisconnect(10000, (duration) => {
      if (!this.notificationSent && this.hasLoggedIn) {
        this.ctx.logger.warn(`[EmailNotification] QQ connection lost for ${duration}ms`)
        this.onOffline('可能 QQ 已经有点死了')
      }
    })
  }

  private onOffline(reason?: string) {
    if (!this.hasLoggedIn) {
      return
    }

    if (this.notificationSent) {
      return
    }

    this.ctx.logger.info('[EmailNotification] Bot offline, sending notification')
    this.sendOfflineNotification(reason).catch(e => {
      this.ctx.logger.error('[EmailNotification] sendOfflineNotification error:', e)
    })
  }

  private async sendOfflineNotification(reason?: string) {
    const config = this.configManager.getConfig()

    if (!config.enabled) {
      this.ctx.logger.debug('[EmailNotification] Email notifications are disabled')
      return
    }

    const botInfo: BotInfo = {
      uin: this.ctx.qqProtocol.selfInfo.uin,
      uid: this.ctx.qqProtocol.selfInfo.uid,
      nick: this.ctx.qqProtocol.selfInfo.nick,
      timestamp: new Date(),
    }

    const result = await this.emailService.sendOfflineNotification(botInfo, reason)

    if (result.success) {
      this.notificationSent = true
      this.ctx.logger.info('[EmailNotification] Offline notification sent successfully')
    } else {
      this.ctx.logger.error('[EmailNotification] Failed to send notification:', result.error)
    }
  }

  getEmailService(): EmailService {
    return this.emailService
  }

  getConfigManager(): EmailConfigManager {
    return this.configManager
  }
}

export default EmailNotificationService
