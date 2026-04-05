import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import { EmailConfigManager } from './emailConfig.js'

export interface EmailOptions {
  subject: string
  html: string
  text?: string
}

export interface SendResult {
  success: boolean
  messageId?: string
  error?: string
}

export interface BotInfo {
  uin: string
  uid: string
  nick: string
  timestamp: Date
}

export class EmailService {
  private configManager: EmailConfigManager
  private logger?: { info: (msg: string, ...args: unknown[]) => void; error: (msg: string, ...args: unknown[]) => void }

  constructor(configManager: EmailConfigManager, logger?: { info: (msg: string, ...args: unknown[]) => void; error: (msg: string, ...args: unknown[]) => void }) {
    this.configManager = configManager
    this.logger = logger
  }

  async sendEmail(options: EmailOptions): Promise<SendResult> {
    try {
      const config = this.configManager.getConfig()

      if (!config.enabled) {
        return {
          success: false,
          error: '邮件通知未启用',
        }
      }

      const validation = this.configManager.validateConfig(config)
      if (!validation.valid) {
        return {
          success: false,
          error: `配置无效：${validation.errors.join(', ')}`,
        }
      }

      const transporter = this.createTransporter()

      const info = await transporter.sendMail({
        from: config.from,
        to: config.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      })

      this.logger?.info('[EmailService] Email sent successfully:', info.messageId)

      return {
        success: true,
        messageId: info.messageId,
      }
    } catch (error) {
      const errorMessage = this.getErrorMessage(error)
      this.logger?.error('[EmailService] Failed to send email:', errorMessage)

      return {
        success: false,
        error: errorMessage,
      }
    }
  }

  async sendTestEmail(): Promise<SendResult> {
    const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    const options = this.formatTestEmail(timestamp)
    return this.sendEmail(options)
  }

  async sendOfflineNotification(botInfo: BotInfo, reason?: string): Promise<SendResult> {
    const options = this.formatOfflineEmail(botInfo, reason)
    return this.sendEmail(options)
  }

  private createTransporter(): Transporter {
    const config = this.configManager.getConfig()

    return nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.auth.user,
        pass: config.smtp.auth.pass,
      },
    })
  }

  private formatOfflineEmail(botInfo: BotInfo, reason?: string): EmailOptions {
    const timestamp = botInfo.timestamp.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    const displayName = botInfo.nick ? `${botInfo.nick} (${botInfo.uin})` : botInfo.uin

    const subject = 'LLBot 掉线通知'

    const reasonSection = reason
      ? `<div class="info">
                <p><strong>掉线原因:</strong> ${reason}</p>
            </div>`
      : `<p>可能的原因：</p>
            <ul>
                <li>网络连接中断</li>
                <li>QQ 被强制下线</li>
                <li>程序异常退出</li>
            </ul>`

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
        .alert { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 10px 0; }
        .info { background: white; padding: 15px; margin: 10px 0; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>⚠️ LLBot 掉线通知</h2>
        </div>
        <div class="content">
            <div class="alert">
                <p><strong>⚠️ QQ 已掉线</strong></p>
            </div>
            <div class="info">
                <p><strong>账号信息:</strong> ${displayName}</p>
                <p><strong>掉线时间:</strong> ${timestamp}</p>
            </div>
            <p>您的 QQ 机器人已掉线，请及时检查并重新登录。</p>
            ${reasonSection}
        </div>
        <div class="footer">
            <p>此邮件由 LLBot 自动发送，请勿回复</p>
        </div>
    </div>
</body>
</html>
    `.trim()

    return { subject, html }
  }

  private formatTestEmail(timestamp: string): EmailOptions {
    const subject = 'LLBot 邮件通知测试'

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
        .info { background: white; padding: 15px; border-left: 4px solid #667eea; margin: 10px 0; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>🎉 LLBot 邮件通知测试</h2>
        </div>
        <div class="content">
            <p>您好！</p>
            <p>这是一封来自 <strong>LLBot</strong> 的测试邮件。</p>
            <div class="info">
                <p><strong>📧 邮件配置测试成功</strong></p>
                <p>发送时间: ${timestamp}</p>
            </div>
            <p>如果您收到这封邮件，说明邮件通知功能已正常工作。</p>
            <p>当 QQ 掉线时，系统将自动向您发送通知邮件。</p>
        </div>
        <div class="footer">
            <p>此邮件由 LLBot 自动发送，请勿回复</p>
        </div>
    </div>
</body>
</html>
    `.trim()

    return { subject, html }
  }

  private getErrorMessage(error: any): string {
    const config = this.configManager.getConfig()

    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return `无法连接到 SMTP 服务器：${config.smtp.host}:${config.smtp.port}`
    }

    if (error.code === 'EAUTH' || error.responseCode === 535) {
      return 'SMTP 认证失败，请检查用户名和密码'
    }

    if (error.code === 'ETIMEDOUT') {
      return '邮件发送超时，请检查网络连接'
    }

    if (error.responseCode === 550 || error.responseCode === 553) {
      return `收件人邮箱地址无效：${config.to}`
    }

    if (error.responseCode === 421 || error.responseCode === 450) {
      return '邮件发送频率超限，请稍后再试'
    }

    return error.message || '发生未知错误'
  }
}
