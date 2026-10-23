import type { BuiltinConfigBinding } from '../../plugin'
import { checkEmail, EmailConfig, emailConfigStore, EmailSchema } from '@/common/emailConfig'

/** builtin:email-notification keeps its settings in the instance-wide email_config.json. */
export const emailBinding: BuiltinConfigBinding<EmailConfig> = {
  schema: EmailSchema,
  scope: 'global',
  location: 'email_config.json',
  read: () => emailConfigStore().get(),
  async write(ctx, value) {
    emailConfigStore().save(value)
    // The service reads the file on every send, so this is only news for whoever else listens
    await ctx.parallel('llbot/email-config-updated', value)
  },
  check: config => checkEmail(config),
  enabled: { get: config => config.enabled, set: (config, on) => ({ ...config, enabled: on }) },
  secrets: ['smtp.auth.pass'],
  watch: (ctx, changed) => emailConfigStore().watch(() => {
    changed()
    ctx.parallel('llbot/email-config-updated', emailConfigStore().get()).catch(() => {})
  }),
}
