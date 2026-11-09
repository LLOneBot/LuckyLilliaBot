import React, { useState } from 'react'
import { usePluginContext } from '@luckylillia/plugin-sdk/webui'
import AuthTokenForm, { type AuthTokenStatus } from './AuthTokenForm'

const WARN = 'text-amber-600 dark:text-amber-400'

function describe(status: AuthTokenStatus): { text: string; tone: string } {
  if (!status.hasToken) return { text: '还没有录入', tone: WARN }
  const detail = status.message ? `：${status.message}` : ''
  switch (status.validation) {
    case 'valid': return { text: '已录入，校验通过', tone: 'text-theme' }
    case 'validating': return { text: '已录入，正在校验', tone: 'text-theme' }
    case 'invalid': return { text: `无效${detail}`, tone: 'text-red-500' }
    case 'error': return { text: `暂时校验不了${detail}`, tone: WARN }
    default: return { text: '已录入', tone: 'text-theme' }
  }
}

/** The Auth Token pure protocol logs in with, and a way to put in another one at any time */
const AuthTokenCard: React.FC<{ status: AuthTokenStatus; onChanged: () => void }> = ({ status, onChanged }) => {
  const ctx = usePluginContext()
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <div className="p-4 mb-6 bg-theme-item rounded-xl">
        <AuthTokenForm
          reason={status.hasToken ? 'replace' : 'missing'}
          authTokenPageUrl={status.authTokenPageUrl}
          onSuccess={() => {
            setEditing(false)
            ctx.toast(status.hasToken ? 'Auth Token 已设置' : 'Auth Token 校验通过')
            onChanged()
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    )
  }

  const { text, tone } = describe(status)
  return (
    <div className="flex items-center gap-3 p-4 mb-6 bg-theme-item rounded-xl">
      <div className="flex-1 min-w-0">
        <div className="text-xs text-theme-muted">Auth Token</div>
        <div className={`text-sm font-medium mt-0.5 ${tone}`}>{text}</div>
      </div>
      <button onClick={() => setEditing(true)} className="btn-glass px-4 py-1.5 text-sm flex-shrink-0">
        设置
      </button>
    </div>
  )
}

export default AuthTokenCard
