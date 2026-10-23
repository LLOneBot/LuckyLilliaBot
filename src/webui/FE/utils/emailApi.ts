import { apiFetch } from './api'
import { EmailConfig } from '../types'

// Reading and saving go through the plugin API (useBuiltinConfig); only the test email has its own route

export interface TestEmailResponse {
  success: boolean
  message: string
  messageId?: string
}

export async function testEmail(config?: EmailConfig): Promise<TestEmailResponse> {
  const response = await apiFetch<TestEmailResponse>('/api/email/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: config ? JSON.stringify({ config }) : undefined,
  })

  if (!response.success) {
    throw new Error(response.message || 'Failed to send test email')
  }

  return response
}
