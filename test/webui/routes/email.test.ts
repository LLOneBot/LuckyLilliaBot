import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestApp } from '../helpers/testApp'
import { createMockContext } from '../helpers/mockContext'
import { createEmailRoutes } from '@/webui/BE/routes/email'

describe('email routes', () => {
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    ctx = createMockContext()
  })

  describe('when emailNotification is available', () => {
    let mockEmailService: any

    beforeEach(() => {
      mockEmailService = {
        getConfigManager: vi.fn(() => ({
          getConfig: vi.fn(() => ({
            smtp: { host: 'smtp.test.com', port: 465, secure: true, auth: { user: 'user@test.com', pass: 'real-pass' } },
            enabled: true,
          })),
          validateConfig: vi.fn(() => ({ valid: true, errors: [] })),
          saveConfig: vi.fn(() => Promise.resolve()),
        })),
        getEmailService: vi.fn(() => ({
          constructor: class MockEmailService {
            async sendTestEmail() { return { success: true, messageId: 'test-id' } }
          },
        })),
      }
      ctx.emailNotification = mockEmailService
    })

    it('GET /config returns masked password', async () => {
      const app = createTestApp(createEmailRoutes(ctx))
      const res = await app.request('/config')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data.smtp.auth.pass).toBe('********')
    })

    it('POST /config preserves existing password when masked', async () => {
      const configManager = mockEmailService.getConfigManager()
      const app = createTestApp(createEmailRoutes(ctx))

      const res = await app.request('/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtp: { host: 'smtp.test.com', port: 465, secure: true, auth: { user: 'user@test.com', pass: '********' } },
          enabled: true,
        }),
      })
      expect(res.status).toBe(200)
    })

    it('POST /config returns 400 when validation fails', async () => {
      mockEmailService.getConfigManager = vi.fn(() => ({
        getConfig: vi.fn(() => ({ smtp: { auth: { pass: '' } } })),
        validateConfig: vi.fn(() => ({ valid: false, errors: ['host is required'] })),
        saveConfig: vi.fn(),
      }))
      const app = createTestApp(createEmailRoutes(ctx))

      const res = await app.request('/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtp: { host: '', port: 0, secure: false, auth: { user: '', pass: '' } },
          enabled: false,
        }),
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.message).toContain('host is required')
    })
  })
})
