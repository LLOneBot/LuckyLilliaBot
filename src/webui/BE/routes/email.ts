import { Context } from 'cordis'
import { Hono } from 'hono'
import { checkEmail, DEFAULT_EMAIL_CONFIG, EmailConfig, EmailConfigManager, EmailSettings } from '@/common/emailConfig'
import { EmailService } from '@/common/emailService'

const MASK = '********'

// Reading and saving the settings goes through the plugin API (builtin:email-notification); only sending a
// test email needs a route of its own.
export function createEmailRoutes(ctx: Context): Hono {
  const router = new Hono()

  router.post('/test', async (c) => {
    try {
      const { config: sent } = await c.req.json().catch(() => ({})) as { config?: EmailSettings }
      // get(): this route does not inject the plugin service
      const stored = (ctx.get('plugins')?.builtinSettings('builtin:email-notification')?.config ?? DEFAULT_EMAIL_CONFIG) as EmailSettings
      const config = structuredClone(sent ?? stored)
      // The form holds the masked password; test with the real one unless a new one was typed
      if (config.smtp?.auth && (config.smtp.auth.pass === MASK || !config.smtp.auth.pass)) {
        config.smtp.auth.pass = stored.smtp.auth.pass
      }
      const issues = checkEmail(config, true)
      if (issues.length) {
        return c.json({ success: false, message: issues.map(issue => issue.message).join(', ') }, 400)
      }
      // A test should work before notifications are switched on
      const service = new EmailService(new EmailConfigManager(() => ({ ...config, enabled: true })), ctx.logger)
      const result = await service.sendTestEmail()
      if (result.success) {
        return c.json({ success: true, message: '测试邮件发送成功', messageId: result.messageId })
      }
      return c.json({ success: false, message: result.error || '测试邮件发送失败' }, 400)
    } catch (error) {
      ctx.logger.error('[EmailAPI] Failed to send test email:', error)
      return c.json({ success: false, message: (error as Error).message || '测试邮件发送失败' }, 500)
    }
  })

  return router
}

/** Only needs the WebUI: a test email can be sent before login and with notifications switched off. */
export const EmailRoutes = {
  name: 'webui-email-routes',
  inject: ['webuiServer'],
  apply(ctx: Context) {
    ctx.webuiServer.route('/api/email', new Hono().route('/api/email', createEmailRoutes(ctx)))
  },
}
