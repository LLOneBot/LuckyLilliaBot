import React, { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { EmailConfig } from '../../types'
import EmailConfigSection from './EmailConfigSection'
import { SaveButton } from './BotConfigContext'
import { useBuiltinConfig } from './useBuiltinConfig'

const PASSWORD = 'smtp.auth.pass'

/**
 * The settings page of the email notification builtin; its config lives in email_config.json. Works before
 * login and with notifications switched off, so they can be set up first and enabled after.
 */
const EmailConfigPage: React.FC = () => {
  const { value, setValue, save, saving, error } = useBuiltinConfig<EmailConfig>('builtin:email-notification')
  const [clearPassword, setClearPassword] = useState(false)

  if (error) return <p className="card p-6 text-sm text-red-500">加载邮件配置失败：{error}</p>
  if (!value) {
    return <div className="flex justify-center py-16"><Loader2 size={40} className="animate-spin text-pink-500" /></div>
  }

  const change = (next: EmailConfig) => {
    // 如果端口为空，使用默认值 587
    setValue({ ...next, smtp: { ...next.smtp, port: next.smtp.port || 587 } })
  }

  const onClearPassword = () => {
    setClearPassword(true)
    setValue({ ...value, smtp: { ...value.smtp, auth: { ...value.smtp.auth, pass: '' } } })
  }

  const onSave = async () => {
    const saved = await save(value, { clear: clearPassword ? [PASSWORD] : [], message: '邮件配置保存成功' })
    if (saved) setClearPassword(false)
  }

  return (
    <div className="space-y-6">
      <EmailConfigSection value={value} onChange={change} onClearPassword={onClearPassword} passwordCleared={clearPassword} />
      <div className="flex justify-end">
        <SaveButton saving={saving} onClick={onSave} />
      </div>
    </div>
  )
}

export default EmailConfigPage
