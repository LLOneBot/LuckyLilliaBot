import { Router, Request, Response } from 'express'
import { Context } from 'cordis'
import { EmailConfig } from '@/common/emailConfig'

export function createEmailRoutes(ctx: Context): Router {
  const router = Router()

  router.get('/config', async (_req: Request, res: Response) => {
    try {
      if (!ctx.emailNotification) {
        res.status(503).json({ success: false, message: '邮件服务未初始化，请等待登录完成' })
        return
      }
      
      const emailService = ctx.emailNotification

      const config = emailService.getConfigManager().getConfig()
      
      const maskedConfig = {
        ...config,
        smtp: {
          ...config.smtp,
          auth: {
            ...config.smtp.auth,
            pass: config.smtp.auth.pass ? '********' : '',
          },
        },
      }
      
      res.json({
        success: true,
        data: maskedConfig,
      })
    } catch (error: any) {
      ctx.logger?.error('[EmailAPI] Failed to get email config:', error)
      res.status(500).json({
        success: false,
        message: error.message || '获取邮件配置失败',
      })
    }
  })

  router.post('/config', async (req: Request, res: Response) => {
    try {
      if (!ctx.emailNotification) {
        res.status(503).json({ success: false, message: '邮件服务未初始化，请等待登录完成' })
        return
      }
      
      const emailService = ctx.emailNotification

      const emailConfig: EmailConfig = req.body
      
      if (!emailConfig) {
        res.status(400).json({
          success: false,
          message: '邮件配置不能为空',
        })
        return
      }

      const configManager = emailService.getConfigManager()
      const currentConfig = configManager.getConfig()
      
      if (emailConfig.smtp.auth.pass === '********' || emailConfig.smtp.auth.pass === '') {
        emailConfig.smtp.auth.pass = currentConfig.smtp.auth.pass
      }
      
      const validation = configManager.validateConfig(emailConfig)
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          message: `配置验证失败：${validation.errors.join(', ')}`,
        })
        return
      }

      await configManager.saveConfig(emailConfig)
      ctx.parallel('llbot/email-config-updated', emailConfig)
      
      res.json({
        success: true,
        message: '邮件配置保存成功',
      })
    } catch (error: any) {
      ctx.logger?.error('[EmailAPI] Failed to save email config:', error)
      res.status(500).json({
        success: false,
        message: error.message || '保存邮件配置失败',
      })
    }
  })

  router.post('/test', async (req: Request, res: Response) => {
    try {
      if (!ctx.emailNotification) {
        res.status(503).json({ success: false, message: '邮件服务未初始化，请等待登录完成' })
        return
      }
      
      const emailService = ctx.emailNotification

      const { config: testConfig } = req.body as { config?: EmailConfig }
      
      let emailConfig: EmailConfig
      if (testConfig) {
        emailConfig = testConfig
        const currentConfig = emailService.getConfigManager().getConfig()
        if (emailConfig.smtp.auth.pass === '********' || emailConfig.smtp.auth.pass === '') {
          emailConfig.smtp.auth.pass = currentConfig.smtp.auth.pass
        }
      } else {
        emailConfig = emailService.getConfigManager().getConfig()
      }
      
      const configManager = emailService.getConfigManager()
      const validation = configManager.validateConfig(emailConfig)
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          message: validation.errors.join(', '),
        })
        return
      }
      
      const tempConfigManager = new (configManager.constructor as any)('', ctx.logger)
      tempConfigManager['config'] = emailConfig
      const tempEmailService = new (emailService.getEmailService().constructor as any)(
        tempConfigManager,
        ctx.logger
      )
      
      const result = await tempEmailService.sendTestEmail()
      
      if (result.success) {
        res.json({
          success: true,
          message: '测试邮件发送成功',
          messageId: result.messageId,
        })
      } else {
        res.status(400).json({
          success: false,
          message: result.error || '测试邮件发送失败',
        })
      }
    } catch (error: any) {
      ctx.logger?.error('[EmailAPI] Failed to send test email:', error)
      res.status(500).json({
        success: false,
        message: error.message || '测试邮件发送失败',
      })
    }
  })

  return router
}
