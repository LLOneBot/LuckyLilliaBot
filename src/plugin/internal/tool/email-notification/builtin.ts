import type { BuiltinPlugin } from '../../../host'
import EmailNotificationService from '.'
import { emailSettings } from './settings'
import { EmailRoutes } from './testRoutes'

export const builtin: BuiltinPlugin = {
  name: 'builtin:email-notification',
  title: '邮件通知',
  plugin: EmailNotificationService,
  // The settings page tests the SMTP settings before notifications are switched on
  standby: EmailRoutes,
  config: emailSettings,
  manifest: {
    category: 'tool',
    icon: 'mail',
    service: { implements: ['emailNotification'] },
    description: { zh: '账号掉线时发邮件提醒', en: 'Sends an email when the account goes offline' },
  },
}
