import { apiFetch } from './api'
import { EmailConfig } from '../types'

export interface EmailConfigResponse {
  success: boolean
  data?: EmailConfig
  message?: string
}

export interface SaveEmailConfigResponse {
  success: boolean
  message: string
}

export interface TestEmailResponse {
  success: boolean
  message: string
  messageId?: string
}

export async function getEmailConfig(): Promise<EmailConfig> {
  const response = await apiFetch<EmailConfigResponse>('/api/email/config')
  if (!response.success || !response.data) {
    throw new Error(response.message || 'Failed to get email configuration')
  }
  return response.data
}

export async function saveEmailConfig(config: EmailConfig): Promise<void> {
  const response = await apiFetch<SaveEmailConfigResponse>('/api/email/config', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ config }),
  })

  if (!response.success) {
    throw new Error(response.message || 'Failed to save email configuration')
  }
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
