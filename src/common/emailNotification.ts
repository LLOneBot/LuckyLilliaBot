import { Context, Service } from 'cordis'
import { EmailService, BotInfo } from './emailService.js'
import { EmailConfigManager } from './emailConfig.js'
import { KickedOffLineInfo } from '@/ntqqapi/types/index.js'
import { selfInfo } from '@/common/globalVars.js'
import { DATA_DIR } from '@/common/globalVars.js'
import { watch } from 'node:fs'
import path from 'node:path'
import { pmhq } from '@/ntqqapi/native/pmhq/index.js'

declare module 'cordis' {
  interface Context {
    emailNotification: EmailNotificationService
  }
}

export class EmailNotificationService extends Service {
  static inject = ['logger']
  
  private emailService: EmailService
  private configManager: EmailConfigManager
  private notificationSent: boolean = false
  private hasLoggedIn: boolean = false
  private configPath: string
  private fileWatcher: ReturnType<typeof watch> | null = null
  private pmhqDisconnectId: string | null = null

  constructor(ctx: Context) {
    super(ctx, 'emailNotification', true)

    this.configPath = path.join(DATA_DIR, 'email_config.json')
    this.configManager = new EmailConfigManager(this.configPath, ctx.logger)
    this.emailService = new EmailService(this.configManager, ctx.logger)

    this.initializeConfig()
    this.registerEventListeners()
    this.watchConfigFile()
    this.registerPmhqDisconnectCallback()
  }

  private async initializeConfig() {
    try {
      await this.configManager.loadConfig()
    } catch (error) {
      this.ctx.logger.error('[EmailNotification] Failed to initialize:', error)
    }
  }

  private registerEventListeners() {
    this.hasLoggedIn = true

    let wasOffline = false

    this.ctx.on('nt/kicked-offLine', (info: KickedOffLineInfo) => {
      wasOffline = true
      this.onOffline(info.tipsDesc || info.tipsTitle)
    })

    const checkLoginStatus = setInterval(() => {
      if (wasOffline && selfInfo.online) {
        this.notificationSent = false
        wasOffline = false
      }
    }, 5000)

    this.ctx.on('dispose', () => {
      clearInterval(checkLoginStatus)
      if (this.fileWatcher) {
        this.fileWatcher.close()
      }
      if (this.pmhqDisconnectId) {
        pmhq.offDisconnect(this.pmhqDisconnectId)
      }
    })
  }

  private watchConfigFile() {
    try {
      this.fileWatcher = watch(this.configPath, async (eventType) => {
        if (eventType === 'change') {
          await this.configManager.loadConfig()
          this.ctx.parallel('llbot/email-config-updated', this.configManager.getConfig())
        }
      })
    } catch (error) {
      this.ctx.logger.error('[EmailNotification] Failed to watch config file:', error)
    }
  }

  private registerPmhqDisconnectCallback() {
    this.pmhqDisconnectId = pmhq.onDisconnect(60000, (duration) => {
      if (!this.notificationSent && this.hasLoggedIn) {
        this.ctx.logger.warn(`[EmailNotification] PMHQ disconnected for ${duration}ms`)
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

    this.ctx.logger.info('[EmailNotification] Bot went offline, sending notification')
    this.sendOfflineNotification(reason)
  }

  private async sendOfflineNotification(reason?: string) {
    try {
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
    } catch (error) {
      this.ctx.logger.error('[EmailNotification] Error sending notification:', error)
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
