import { Context, Service } from 'cordis'
import { EmailService, BotInfo } from './emailService.js'
import { EmailConfigManager, emailConfigStore } from './emailConfig.js'
import { selfInfo } from '@/common/globalVars.js'

declare module 'cordis' {
  interface Context {
    emailNotification: EmailNotificationService
  }
}

export class EmailNotificationService extends Service {
  static inject = ['qqProtocol', 'account']

  private emailService: EmailService
  private configManager: EmailConfigManager
  private notificationSent: boolean = false
  private hasLoggedIn: boolean = false
  private disconnectId: string | null = null
  private checkLoginStatus: NodeJS.Timeout | null = null

  constructor(ctx: Context) {
    super(ctx, 'emailNotification')

    // Read through the store on every send: the WebUI and the desktop app both edit the file
    const store = emailConfigStore(message => ctx.logger.error('[EmailNotification] invalid config, keeping the last good one:', message))
    this.configManager = new EmailConfigManager(() => store.get())
    this.emailService = new EmailService(this.configManager, ctx.logger)

    try {
      store.ensure()
    } catch (error) {
      this.ctx.logger.error('[EmailNotification] Failed to create the default config:', error)
    }
    this.registerEventListeners()
    this.registerDisconnectCallback()
  }

  async [Service.init]() {
    return () => {
      if (this.checkLoginStatus) {
        clearInterval(this.checkLoginStatus)
      }
      if (this.disconnectId) {
        this.ctx.qqProtocol.offDisconnect(this.disconnectId)
      }
    }
  }

  private registerEventListeners() {
    this.hasLoggedIn = true

    let wasOffline = false

    this.ctx.on('nt/kicked-offline', (data) => {
      wasOffline = true
      this.onOffline(data.tipsDesc || data.tipsTitle)
    })

    this.ctx.on('qq/session-expired', (reason) => {
      wasOffline = true
      this.onOffline(reason)
    })

    this.checkLoginStatus = setInterval(() => {
      if (wasOffline && selfInfo.online) {
        this.notificationSent = false
        wasOffline = false
      }
    }, 5000)
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
      uin: selfInfo.uin,
      uid: selfInfo.uid,
      nick: selfInfo.nick,
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
