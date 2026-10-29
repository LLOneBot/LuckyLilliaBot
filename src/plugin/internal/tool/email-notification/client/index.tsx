import React, { useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import {
  SchemaSettings, usePluginContext, type PluginConfigState, type WebUIPlugin,
} from '@luckylillia/plugin-sdk/webui'

export const name = 'builtin:email-notification'

// The bot fills in the stored password when the form still holds the mask (testRoutes.ts)
const TestButton: React.FC<{ config: PluginConfigState }> = ({ config }) => {
  const ctx = usePluginContext()
  const [sending, setSending] = useState(false)
  const send = async () => {
    setSending(true)
    try {
      await ctx.api('/api/email/test', { method: 'POST', body: { config: config.value } })
      ctx.toast('测试邮件发送成功')
    } catch (e) {
      ctx.toast(e instanceof Error ? e.message : '测试邮件发送失败', 'error')
    } finally {
      setSending(false)
    }
  }
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={send} disabled={sending || !config.value} className="btn-glass flex items-center gap-2 flex-shrink-0">
        {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        发送测试邮件
      </button>
      <span className="text-xs text-theme-muted">用表单里现在的设置发一封，不用先保存</span>
    </div>
  )
}

const EmailSettings = () => (
  <SchemaSettings links={[{ label: '设置向导', href: 'https://luckylillia.com/guide/config_email' }]}>
    {(config: PluginConfigState) => <TestButton config={config} />}
  </SchemaSettings>
)

const apply: WebUIPlugin = (ctx) => {
  // Works before login and with notifications off, so they can be set up first and switched on after
  ctx.page({ id: 'email', title: '邮件通知', icon: 'mail', component: EmailSettings, order: 13, settings: true })
}

export default apply
