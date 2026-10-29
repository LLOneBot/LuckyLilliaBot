import type { BuiltinConfig } from '../../../host'
import { checkEmail, EmailSettings } from './config'

export const emailSettings: BuiltinConfig<EmailSettings> = {
  // Not checked on enable: it can be switched on before SMTP is set up, it just will not send
  check: checkEmail,
  secrets: ['smtp.auth.pass'],
  initial: () => ({ enabled: false }),
}
