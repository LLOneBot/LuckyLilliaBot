import Schema from 'schemastery'

export interface EmailConfig {
  enabled: boolean
  smtp: {
    host: string
    port: number
    secure: boolean
    auth: {
      user: string
      pass: string
    }
  }
  from: string
  to: string
}

/** What builtin:email-notification stores: its entry switch says whether notifications are on. */
export type EmailSettings = Omit<EmailConfig, 'enabled'>

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export interface EmailIssue {
  path: string[]
  message: string
}

export const DEFAULT_EMAIL_CONFIG: EmailConfig = {
  enabled: false,
  smtp: {
    host: '',
    port: 587,
    secure: false,
    auth: {
      user: '',
      pass: '',
    },
  },
  from: '',
  to: '',
}

// Defaults mirror DEFAULT_EMAIL_CONFIG (a test pins them); the descriptions are the settings page's labels
export const EmailSchema: Schema<EmailSettings> = Schema.object({
  smtp: Schema.object({
    host: Schema.string().default('').description('SMTP 服务器'),
    port: Schema.natural().max(65535).default(587).description('端口'),
    secure: Schema.union([
      Schema.const(false).description('STARTTLS（常用端口 587）'),
      Schema.const(true).description('SSL/TLS（常用端口 465）'),
    ]).default(false).description('加密方式'),
    auth: Schema.object({
      user: Schema.string().default('').description('用户名'),
      pass: Schema.string().role('secret').default('').description('密码：建议使用应用专用密码（Gmail、Outlook 等）'),
    }),
  }),
  from: Schema.string().default('').description('发件人邮箱'),
  to: Schema.string().default('').description('收件人邮箱'),
}) as Schema<EmailSettings>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * What the schema cannot say: a usable SMTP setup. `enforce` while notifications are on or a test email is
 * about to go out; switched off they can be saved with blanks (issue #690).
 */
export function checkEmail(config: EmailSettings, enforce: boolean): EmailIssue[] {
  if (!enforce) return []
  const issues: EmailIssue[] = []
  if (!config.smtp.host?.trim()) issues.push({ path: ['smtp', 'host'], message: 'SMTP 服务器不能为空' })
  if (!config.smtp.port || config.smtp.port < 1 || config.smtp.port > 65535) {
    issues.push({ path: ['smtp', 'port'], message: '端口必须在 1-65535 之间' })
  }
  if (!config.from || !EMAIL_PATTERN.test(config.from)) issues.push({ path: ['from'], message: '发件人邮箱格式不正确' })
  if (!config.to || !EMAIL_PATTERN.test(config.to)) issues.push({ path: ['to'], message: '收件人邮箱格式不正确' })
  return issues
}

/** What EmailService reads its settings through. */
export class EmailConfigManager {
  constructor(private readonly source: () => EmailConfig) {}

  getConfig(): EmailConfig {
    return this.source()
  }

  validateConfig(config: EmailConfig): ValidationResult {
    const errors = checkEmail(config, config.enabled).map(issue => issue.message)
    return { valid: errors.length === 0, errors }
  }
}
