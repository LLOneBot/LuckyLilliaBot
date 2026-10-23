import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from '../helpers/testApp'
import { createMockContext } from '../helpers/mockContext'
import { createEmailRoutes } from '@/webui/BE/routes/email'

const sent = vi.hoisted(() => ({ configs: [] as unknown[] }))

vi.mock('@/common/emailService', () => ({
  EmailService: class {
    constructor(private manager: { getConfig(): unknown }) {}
    async sendTestEmail() {
      sent.configs.push(this.manager.getConfig())
      return { success: true, messageId: 'test-id' }
    }
  },
}))

const stored = {
  enabled: false,
  smtp: { host: 'smtp.test.com', port: 465, secure: true, auth: { user: 'user@test.com', pass: 'real-pass' } },
  from: 'bot@test.com',
  to: 'me@test.com',
}

vi.mock('@/common/emailConfig', async importOriginal => ({
  ...await importOriginal<object>(),
  emailConfigStore: () => ({ get: () => structuredClone(stored) }),
}))

const post = (body: unknown) => {
  const app = createTestApp(createEmailRoutes(createMockContext()))
  return app.request('/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

describe('email routes', () => {
  beforeEach(() => {
    sent.configs = []
  })

  it('tests with the stored password when the form sends it masked or blank', async () => {
    for (const pass of ['********', '']) {
      const res = await post({ config: { ...stored, smtp: { ...stored.smtp, auth: { user: 'user@test.com', pass } } } })
      expect(res.status).toBe(200)
    }
    expect(sent.configs.map(config => (config as typeof stored).smtp.auth.pass)).toEqual(['real-pass', 'real-pass'])
  })

  it('uses a newly typed password, and the stored config when none is sent', async () => {
    await post({ config: { ...stored, smtp: { ...stored.smtp, auth: { user: 'u', pass: 'typed' } } } })
    await post({})
    expect(sent.configs.map(config => (config as typeof stored).smtp.auth.pass)).toEqual(['typed', 'real-pass'])
  })

  it('works before notifications are switched on', async () => {
    const res = await post({ config: stored })
    expect(res.status).toBe(200)
    expect((sent.configs[0] as typeof stored).enabled).toBe(true)
  })

  it('refuses an unusable SMTP setup with the field errors, enabled or not', async () => {
    const res = await post({ config: { ...stored, from: 'not-an-address', smtp: { ...stored.smtp, host: '' } } })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.message).toContain('SMTP 服务器不能为空')
    expect(body.message).toContain('发件人邮箱格式不正确')
    expect(sent.configs).toEqual([])
  })
})
