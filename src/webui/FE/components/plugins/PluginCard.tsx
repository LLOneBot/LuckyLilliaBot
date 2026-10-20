import React from 'react'
import { Copy, RotateCw, Settings } from 'lucide-react'
import { PluginStatus } from '../../types/plugins'
import { pluginDescription, pluginIcon, pluginTitle, RELOAD_WARNING, STATE_LABEL } from './meta'

interface PluginCardProps {
  plugin: PluginStatus
  /** Shown when several entries share one package. */
  instanceTag?: string
  busy: boolean
  onToggle: (enabled: boolean) => void
  onConfigure: () => void
  onReload: () => void
  onDuplicate: () => void
}

const actionButton = 'p-2 text-theme-muted hover:text-theme hover:bg-theme-item rounded-lg transition-colors disabled:opacity-40 disabled:pointer-events-none'

const PluginCard: React.FC<PluginCardProps> = ({ plugin, instanceTag, busy, onToggle, onConfigure, onReload, onDuplicate }) => {
  const Icon = pluginIcon(plugin)
  const state = STATE_LABEL[plugin.state]
  const active = plugin.state === 'active'
  const detail = plugin.state === 'pending' && plugin.missingDeps.length
    ? `等待服务：${plugin.missingDeps.join('、')}`
    : plugin.error
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  return (
    <div
      className={`card p-6 cursor-pointer transition-all hover:scale-[1.02] flex flex-col ${active ? 'ring-2 ring-pink-500' : ''}`}
      onClick={onConfigure}
    >
      <div className="flex items-start gap-3">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
          active ? 'gradient-primary-br text-white' : 'bg-gray-200 dark:bg-neutral-600 text-theme-secondary'
        }`}>
          <Icon size={24} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-lg font-semibold text-theme truncate">{pluginTitle(plugin)}</h4>
            {instanceTag && <span className="text-xs text-theme-hint font-mono">{instanceTag}</span>}
            {plugin.manifest.preview && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">开发中</span>
            )}
          </div>
          <p className="text-xs text-theme-hint truncate">{plugin.name}{plugin.version ? ` · v${plugin.version}` : ''}</p>
        </div>
        <input
          type="checkbox"
          checked={!plugin.disabled}
          disabled={busy || plugin.state === 'missing'}
          onClick={stop}
          onChange={e => onToggle(e.target.checked)}
          className="switch-toggle flex-shrink-0"
          title={plugin.disabled ? '启用' : '停用'}
        />
      </div>

      <p className="text-sm text-theme-secondary mt-3 line-clamp-2 flex-1">{pluginDescription(plugin) ?? '没有描述'}</p>

      <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-theme-divider">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-xs font-medium px-3 py-1 rounded-full flex-shrink-0 ${state.className}`}>{state.label}</span>
          {detail && <span className="text-xs text-theme-muted truncate" title={detail}>{detail}</span>}
        </div>
        <div className="flex items-center flex-shrink-0" onClick={stop}>
          <button type="button" title="配置" onClick={onConfigure} className={actionButton}><Settings size={18} /></button>
          <button type="button" title="重载" disabled={busy || plugin.disabled} onClick={onReload} className={actionButton}>
            <RotateCw size={18} className={busy ? 'animate-spin' : ''} />
          </button>
          <button type="button" title="添加一个实例" disabled={busy || plugin.state === 'missing'} onClick={onDuplicate} className={actionButton}><Copy size={18} /></button>
        </div>
      </div>

      {plugin.reloadCount >= RELOAD_WARNING && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">已热重载 {plugin.reloadCount} 次，旧代码仍占着内存，建议找时间重启 Bot</p>
      )}
    </div>
  )
}

export default PluginCard
