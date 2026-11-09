import React, { useEffect, useState } from 'react'
import { Bot, ChevronRight, ExternalLink, KeyRound, Loader2, QrCode, Save } from 'lucide-react'
import { SchemaForm, usePluginConfig, type WebUIPlugin } from '@luckylillia/plugin-sdk/webui'
import type { QQOfficialConfig } from '../../../../../common/types'
import { IntentsField } from './IntentsField'
import ConnectionStatus from './ConnectionStatus'
import QuickSetup from './QuickSetup'
import { QQOfficialCard } from './DashboardCard'

export const name = 'builtin:qq-official'

const QQOfficialSettings: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const config = usePluginConfig<QQOfficialConfig>()
  const [selectedMode, setMode] = useState<'qr' | 'manual' | null>(null)
  const mode = selectedMode ?? (config.value?.appId ? 'manual' : 'qr')
  useEffect(() => {
    if (selectedMode === null && config.value) setMode(config.value.appId ? 'manual' : 'qr')
  }, [config.value, selectedMode])
  const form = (fields: string[]) => (
    <SchemaForm schema={config.schema} value={config.value} onChange={config.setValue}
      errors={config.errors} fields={fields} onClearSecret={config.clearSecret} />
  )

  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl gradient-primary-br flex items-center justify-center shrink-0">
          <Bot size={24} className="text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="text-lg font-semibold text-theme">QQ 官方机器人</h3>
            <ConnectionStatus />
          </div>
          <p className="text-sm text-theme-secondary">接入 QQ 开放平台的官方机器人，插件同样能在它上面收发消息</p>
        </div>
        <a href="https://q.qq.com/qqbot/" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-pink-500 hover:underline">
          <ExternalLink size={16} />开放平台
        </a>
      </div>
      {config.error ? (
        <p role="alert" className="text-sm text-red-500">加载配置失败：{config.error}</p>
      ) : !config.value ? (
        <div className="flex justify-center py-10"><Loader2 size={32} className="animate-spin text-pink-500" /></div>
      ) : (
        <>
          <div role="tablist" aria-label="机器人配置方式" className="mb-6 flex flex-wrap gap-2">
            {([['qr', '手机 QQ 扫码配置', QrCode], ['manual', '手动配置', KeyRound]] as const).map(([value, label, Icon]) => (
              <button key={value} type="button" role="tab" aria-selected={mode === value}
                id={'qq-config-' + value} aria-controls={'qq-config-panel-' + value} onClick={() => setMode(value)}
                className={'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ' + (mode === value
                  ? 'bg-pink-500 text-white' : 'bg-theme-item text-theme-secondary hover:bg-theme-input')}>
                <Icon size={17} />{label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={'qq-config-panel-' + mode} aria-labelledby={'qq-config-' + mode}>
            {mode === 'qr' ? (
              <QuickSetup configured={!!config.value.appId} onComplete={onComplete} />
            ) : (
              <>
                {form(['appId', 'secret'])}
                <details className="group mt-5 rounded-xl border border-theme-divider">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm text-theme-secondary [&::-webkit-details-marker]:hidden">
                    <ChevronRight size={16} className="shrink-0 transition-transform group-open:rotate-90" />
                    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-medium">高级设置</span>
                      <span className="text-xs text-theme-muted">不清楚各项设置的作用时，保持默认即可。</span>
                    </span>
                  </summary>
                  <div className="px-4 pb-4">{form(['sandbox', 'type', 'intents'])}</div>
                </details>
                <div className="mt-6 flex justify-end">
                  <button type="button" onClick={() => config.save()} disabled={config.saving}
                    className="btn-primary inline-flex items-center gap-2">
                    {config.saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    {config.saving ? '保存中…' : '保存配置'}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

const QQOfficialPage = () => {
  const [revision, setRevision] = useState(0)
  return (
    <QQOfficialSettings key={revision} onComplete={() => setRevision(value => value + 1)} />
  )
}

const apply: WebUIPlugin = (ctx) => {
  ctx.page({ id: 'qqofficial', title: 'QQ 官方机器人', icon: 'bot', component: QQOfficialPage, order: 14, settings: true })
  ctx.slot('dashboard.cards', { id: 'account', label: 'QQ 官方机器人', component: QQOfficialCard, size: 'wide', order: 12 })
  ctx.field('qq-official-intents', IntentsField)
}

export default apply
