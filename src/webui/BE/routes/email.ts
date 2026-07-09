import { Context } from 'cordis'
import { EmailConfig } from '@/common/emailConfig'
import { Hono } from 'hono'

export function createEmailRoutes(ctx: Context): Hono {
  const router = new Hono()

  // WebuiServer 现在没把 emailNotification 声明进 inject (它登录后才 plugin, 早声明会阻塞 WebUI 提前起).
  // 因此不能直接读 ctx.emailNotification (cordis 严格模式会抛 "cannot get property without inject"),
  // 要用 ctx.get('emailNotification') 绕过检查, 未 ready 时返 undefined.
  const getEmail = () => ctx.get('emailNotification' as never) as Context['emailNotification'] | undefined

  router.get('/config', async (c) => {
    try {
      const emailService = getEmail()
      if (!emailService) {
        return c.json({ success: false, message: '邮件服务未初始化，请等待登录完成' }, 503)
      }

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

      return c.json({
        success: true,
        data: maskedConfig,
      })
    } catch (error) {
      ctx.logger?.error('[EmailAPI] Failed to get email config:', error)
      return c.json({
        success: false,
        message: (error as Error).message || '获取邮件配置失败',
      }, 500)
    }
  })

  router.post('/config', async (c) => {
    try {
      const emailService = getEmail()
      if (!emailService) {
        return c.json({ success: false, message: '邮件服务未初始化，请等待登录完成' }, 503)
      }

      const emailConfig: EmailConfig = await c.req.json()

      if (!emailConfig) {
        return c.json({
          success: false,
          message: '邮件配置不能为空',
        }, 400)
      }

      const configManager = emailService.getConfigManager()
      const currentConfig = configManager.getConfig()

      if (emailConfig.smtp.auth.pass === '********' || emailConfig.smtp.auth.pass === '') {
        emailConfig.smtp.auth.pass = currentConfig.smtp.auth.pass
      }

      const validation = configManager.validateConfig(emailConfig)
      if (!validation.valid) {
        return c.json({
          success: false,
          message: `配置验证失败：${validation.errors.join(', ')}`,
        }, 400)
      }

      await configManager.saveConfig(emailConfig)
      ctx.parallel('llbot/email-config-updated', emailConfig)

      return c.json({
        success: true,
        message: '邮件配置保存成功',
      })
    } catch (error) {
      ctx.logger?.error('[EmailAPI] Failed to save email config:', error)
      return c.json({
        success: false,
        message: (error as Error).message || '保存邮件配置失败',
      }, 500)
    }
  })

  router.post('/test', async (c) => {
    try {
      const emailService = getEmail()
      if (!emailService) {
        return c.json({ success: false, message: '邮件服务未初始化，请等待登录完成' }, 503)
      }

      const { config: testConfig } = await c.req.json() as { config?: EmailConfig }

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
        return c.json({
          success: false,
          message: validation.errors.join(', '),
        }, 400)
      }

      const tempConfigManager = new (configManager.constructor as any)('', ctx.logger)
      tempConfigManager['config'] = emailConfig
      const tempEmailService = new (emailService.getEmailService().constructor as any)(
        tempConfigManager,
        ctx.logger
      )

      const result = await tempEmailService.sendTestEmail()

      if (result.success) {
        return c.json({
          success: true,
          message: '测试邮件发送成功',
          messageId: result.messageId,
        })
      } else {
        return c.json({
          success: false,
          message: result.error || '测试邮件发送失败',
        }, 400)
      }
    } catch (error) {
      ctx.logger?.error('[EmailAPI] Failed to send test email:', error)
      return c.json({
        success: false,
        message: (error as Error).message || '测试邮件发送失败',
      }, 500)
    }
  })

  return router
}
