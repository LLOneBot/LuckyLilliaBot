import { existsSync, unwatchFile, watchFile } from 'node:fs'
import path from 'node:path'
import Schema from 'schemastery'
import { DATA_DIR } from '@/common/globalVars'
import { JsonFile } from '@/common/jsonFile'
import { deepMerge } from '@/common/utils/misc'

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
export const EmailSchema: Schema<EmailConfig> = Schema.object({
  enabled: Schema.boolean().default(false).description('邮件通知：机器人掉线时发送邮件通知'),
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
}) as Schema<EmailConfig>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * What the schema cannot say: a usable SMTP setup. Only enforced while notifications are on, so they can be
 * saved switched off with blanks (issue #690); `strict` checks anyway, e.g. before a test email.
 */
export function checkEmail(config: EmailConfig, strict = false): EmailIssue[] {
  if (!config.enabled && !strict) return []
  const issues: EmailIssue[] = []
  if (!config.smtp.host?.trim()) issues.push({ path: ['smtp', 'host'], message: 'SMTP 服务器不能为空' })
  if (!config.smtp.port || config.smtp.port < 1 || config.smtp.port > 65535) {
    issues.push({ path: ['smtp', 'port'], message: '端口必须在 1-65535 之间' })
  }
  if (!config.from || !EMAIL_PATTERN.test(config.from)) issues.push({ path: ['from'], message: '发件人邮箱格式不正确' })
  if (!config.to || !EMAIL_PATTERN.test(config.to)) issues.push({ path: ['to'], message: '收件人邮箱格式不正确' })
  return issues
}

/**
 * data/email_config.json: instance-wide, written by the WebUI and by the desktop app directly. Read afresh on
 * every get() since it changes behind our back; an unparsable file keeps the last good value and stays on
 * disk for the user to fix.
 */
export class EmailConfigStore {
  private readonly file: JsonFile<EmailConfig>
  private lastError = ''

  constructor(readonly path: string, private readonly onError?: (message: string) => void) {
    this.file = new JsonFile<EmailConfig>(path, {
      defaultValue: () => structuredClone(DEFAULT_EMAIL_CONFIG),
      // Older files and the desktop app may leave fields out
      normalize: raw => deepMerge(structuredClone(DEFAULT_EMAIL_CONFIG), raw) as EmailConfig,
    })
  }

  get(): EmailConfig {
    const { data, error } = this.file.readSync()
    if (error && error !== this.lastError) this.onError?.(`${this.path}: ${error}`)
    this.lastError = error ?? ''
    return data
  }

  save(config: EmailConfig) {
    this.file.writeSync(config)
  }

  /** Creates the file with the defaults if there is none, as the notification service always did. */
  ensure() {
    if (!existsSync(this.path)) this.save(structuredClone(DEFAULT_EMAIL_CONFIG))
  }

  /**
   * Polls rather than fs.watch: inotify is unreliable on docker bind mounts, and an editor that saves by
   * renaming would leave fs.watch on a dead inode. Our own writes are skipped.
   */
  watch(listener: () => void): () => void {
    let timer: ReturnType<typeof setTimeout> | undefined
    const onChange = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (!this.file.isSelfWriteOnDisk()) listener()
      }, 300)
    }
    watchFile(this.path, { interval: 1000, persistent: false }, onChange)
    return () => {
      clearTimeout(timer)
      unwatchFile(this.path, onChange)
    }
  }
}

let shared: EmailConfigStore | undefined

/** The one store for data/email_config.json in this process. */
export function emailConfigStore(onError?: (message: string) => void): EmailConfigStore {
  return shared ??= new EmailConfigStore(path.join(DATA_DIR, 'email_config.json'), onError)
}

/** What EmailService reads its settings through. */
export class EmailConfigManager {
  constructor(private readonly source: () => EmailConfig) {}

  getConfig(): EmailConfig {
    return this.source()
  }

  validateConfig(config: EmailConfig): ValidationResult {
    const errors = checkEmail(config).map(issue => issue.message)
    return { valid: errors.length === 0, errors }
  }
}
