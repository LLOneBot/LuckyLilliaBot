import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'

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

const DEFAULT_CONFIG: EmailConfig = {
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

export class EmailConfigManager {
  private configPath: string
  private config: EmailConfig | null = null
  private logger?: { info: (msg: string, ...args: any[]) => void; error: (msg: string, ...args: any[]) => void }

  constructor(configPath: string, logger?: { info: (msg: string, ...args: any[]) => void; error: (msg: string, ...args: any[]) => void }) {
    this.configPath = configPath
    this.logger = logger
  }

  async loadConfig(): Promise<EmailConfig> {
    try {
      if (!existsSync(this.configPath)) {
        this.logger?.info('[EmailConfig] Configuration file not found, creating default')
        await this.createDefaultConfig()
        return { ...DEFAULT_CONFIG }
      }

      const content = await readFile(this.configPath, 'utf-8')
      this.config = JSON.parse(content)
      // this.logger?.info('[EmailConfig] Configuration loaded successfully')
      return this.config!
    } catch (error) {
      this.logger?.error('[EmailConfig] Failed to load configuration:', error)
      return { ...DEFAULT_CONFIG }
    }
  }

  async saveConfig(config: EmailConfig): Promise<void> {
    try {
      const dir = dirname(this.configPath)
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true })
      }

      await writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf-8')
      this.config = config
      this.logger?.info('[EmailConfig] Configuration saved successfully')
    } catch (error) {
      this.logger?.error('[EmailConfig] Failed to save configuration:', error)
      throw error
    }
  }

  getConfig(): EmailConfig {
    return this.config ? { ...this.config } : { ...DEFAULT_CONFIG }
  }

  validateConfig(config: EmailConfig): ValidationResult {
    const errors: string[] = []

    // 关闭邮件通知时允许保存空配置（issue##690）
    if (!config.enabled) {
      return { valid: true, errors: [] }
    }

    if (!config.smtp.host || config.smtp.host.trim() === '') {
      errors.push('SMTP 服务器不能为空')
    }

    if (!config.smtp.port || config.smtp.port < 1 || config.smtp.port > 65535) {
      errors.push('端口必须在 1-65535 之间')
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!config.from || !emailRegex.test(config.from)) {
      errors.push('发件人邮箱格式不正确')
    }

    if (!config.to || !emailRegex.test(config.to)) {
      errors.push('收件人邮箱格式不正确')
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  private async createDefaultConfig(): Promise<void> {
    await this.saveConfig(DEFAULT_CONFIG)
  }
}
