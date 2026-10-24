import type { BuiltinConfigBinding } from '../../plugin'
import { checkEmail, EmailConfig, emailConfigStore, EmailSchema } from '@/common/emailConfig'

/** builtin:email-notification keeps its settings in the instance's email.json. */
export const emailBinding: BuiltinConfigBinding<EmailConfig> = {
  schema: EmailSchema,
  location: 'data/instances/<实例>/email.json',
  read: () => emailConfigStore().get(),
  async write(ctx, value) {
    emailConfigStore().save(value)
    // The service reads the file on every send, so this is only news for whoever else listens
    await ctx.parallel('llbot/email-config-updated', value)
  },
  // Save only (no validateOnEnable): it can be switched on before SMTP is set up, it just will not send
  check: config => checkEmail(config),
  enabled: { get: config => config.enabled, set: (config, on) => ({ ...config, enabled: on }) },
  secrets: ['smtp.auth.pass'],
  watch: (ctx, changed) => emailConfigStore().watch(() => {
    changed()
    ctx.parallel('llbot/email-config-updated', emailConfigStore().get()).catch(() => {})
  }),
}
