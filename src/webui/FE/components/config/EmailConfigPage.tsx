import React, { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { EmailConfig } from '../../types'
import { apiFetch } from '../../utils/api'
import { showToast } from '../common'
import { usePluginList } from '../../plugin-host/pluginList'
import EmailConfigSection from './EmailConfigSection'
import { SaveButton } from './BotConfigContext'

const DEFAULT_EMAIL_CONFIG: EmailConfig = {
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

/** The settings page of the email notification builtin; its config lives in email_config.json, apart from the bot config. */
const EmailConfigPage: React.FC = () => {
  const [config, setConfig] = useState<EmailConfig | null>(null)
  const [saving, setSaving] = useState(false)
  // /api/email only exists while the builtin runs, so read again once it does
  const running = usePluginList(state => state.plugins?.find(plugin => plugin.name === 'builtin:email-notification')?.state === 'active')

  const load = useCallback(async () => {
    try {
      const response = await apiFetch<EmailConfig>('/api/email/config')
      setConfig(response.success && response.data ? response.data : DEFAULT_EMAIL_CONFIG)
    } catch {
      setConfig(previous => previous ?? DEFAULT_EMAIL_CONFIG)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, running])

  const change = (next: EmailConfig) => {
    // 如果端口为空，使用默认值 587
    setConfig({ ...next, smtp: { ...next.smtp, port: next.smtp.port || 587 } })
  }

  const save = async () => {
    if (!config) return
    setSaving(true)
    try {
      const response = await apiFetch('/api/email/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (response.success) showToast('邮件配置保存成功', 'success')
      else showToast(response.message || '保存失败', 'error')
    } catch (e) {
      showToast(e instanceof Error ? e.message : '保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!config) {
    return <div className="flex justify-center py-16"><Loader2 size={40} className="animate-spin text-pink-500" /></div>
  }
  return (
    <div className="space-y-6">
      <EmailConfigSection value={config} onChange={change} />
      <div className="flex justify-end">
        <SaveButton saving={saving} onClick={save} />
      </div>
    </div>
  )
}

export default EmailConfigPage
