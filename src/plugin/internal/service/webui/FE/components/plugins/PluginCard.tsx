import React from 'react'
import { Copy, Info, RotateCw, Settings } from 'lucide-react'
import { PluginStatus } from '../../types/plugins'
import { useRenderFailures } from '../../plugin-host/failures'
import { useClientErrors } from '../../plugin-host/host'
import { usePluginList } from '../../plugin-host/pluginList'
import { SlotOutlet } from '../../plugin-host/views'
import { clearListenerError, patchUiPrefs } from '../../utils/pluginApi'
import { showToast } from '../common'
import {
  Conflict, NEEDS_SETTINGS, pendingReason, pluginDescription, pluginTitle, RELOAD_WARNING, scopeSummary, STATE_LABEL,
} from './meta'
import PluginIcon from './PluginIcon'

interface PluginCardProps {
  plugin: PluginStatus
  /** Shown when several entries share one package. */
  instanceTag?: string
  /** Services it shares with other enabled entries. */
  conflicts?: Conflict[]
  busy: boolean
  onToggle: (enabled: boolean) => void
  /** Opens the plugin's settings page or the config dialog; absent when there is nothing to configure. */
  onConfigure?: () => void
  /** Which of the two it opens */
  configureLabel?: string
  /** Opens what the package says about itself; absent when it declares nothing */
  onDetails?: () => void
  onReload: () => void
  /** Absent for builtins, which run as a single instance. */
  onDuplicate?: () => void
}

const actionButton = 'p-2 text-theme-muted hover:text-theme hover:bg-theme-item rounded-lg transition-colors disabled:opacity-40 disabled:pointer-events-none'

const PluginCard: React.FC<PluginCardProps> = ({ plugin, instanceTag, conflicts, busy, onToggle, onConfigure, configureLabel = '配置', onDetails, onReload, onDuplicate }) => {
  const waiting = plugin.state === 'active' && !!plugin.notice
  const state = waiting ? NEEDS_SETTINGS : STATE_LABEL[plugin.state]
  const active = plugin.state === 'active' && !waiting
  const plugins = usePluginList(state => state.plugins) ?? []
  const detail = pendingReason(plugin, plugins) ?? plugin.error ?? plugin.notice
  const clientError = useClientErrors(state => state.errors[plugin.name])
  const failure = useRenderFailures(state => Object.values(state.failures).find(item => item.owner === plugin.name))
  const unapproved = !plugin.builtin && !!plugin.webui && !plugin.webuiApproved
  const scope = scopeSummary(plugin.scope)
  const dismissError = () => {
    clearListenerError(plugin.id).catch(error => showToast(error instanceof Error ? error.message : String(error), 'error'))
  }
  const approve = () => {
    patchUiPrefs({ approve: [plugin.name] })
      .then(prefs => usePluginList.setState({ prefs }))
      .catch(error => showToast(error instanceof Error ? error.message : String(error), 'error'))
  }

  return (
    // Not clickable as a whole: the switch and the buttons are its only targets, so a stray click does nothing
    <div className={`card p-6 transition-all flex flex-col ${active ? 'ring-2 ring-pink-500' : ''}`}>
      <div className="flex items-start gap-3">
        <PluginIcon
          plugin={plugin}
          className="w-12 h-12 rounded-2xl"
          fill={active ? 'gradient-primary-br text-white' : 'bg-gray-200 dark:bg-neutral-600 text-theme-secondary'}
          size={24}
          muted={!active}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-lg font-semibold text-theme truncate">{pluginTitle(plugin)}</h4>
            {instanceTag && <span className="text-xs text-theme-hint font-mono">{instanceTag}</span>}
            {plugin.builtin && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300">
                {plugin.core ? '核心' : '内置'}
              </span>
            )}
            {plugin.manifest.preview && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">开发中</span>
            )}
          </div>
          {/* A builtin's entry name (builtin:...) means nothing to a user */}
          {!plugin.builtin && (
            <p className="text-xs text-theme-hint truncate">
              {plugin.name}{plugin.version ? ` · v${plugin.version}` : ''}{plugin.author ? ` · 作者 ${plugin.author.name}` : ''}
            </p>
          )}
        </div>
        <input
          type="checkbox"
          checked={!plugin.disabled}
          disabled={busy || plugin.state === 'missing' || plugin.core}
          onChange={e => onToggle(e.target.checked)}
          className="switch-toggle flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          title={plugin.core ? 'Bot 依赖这个组件，不能停用' : plugin.disabled ? '启用' : '停用'}
        />
      </div>

      <p className="text-sm text-theme-secondary mt-3 line-clamp-2 flex-1">{pluginDescription(plugin) ?? '没有描述'}</p>

      <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-theme-divider">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-xs font-medium px-3 py-1 rounded-full flex-shrink-0 ${state.className}`}>{state.label}</span>
          {detail && <span className="text-xs text-theme-muted truncate" title={detail}>{detail}</span>}
        </div>
        <div className="flex items-center flex-shrink-0">
          <SlotOutlet name="plugins.card.actions" props={{ plugin }} />
          {onDetails && (
            <button type="button" title="详情" onClick={onDetails} className={actionButton}>
              <Info size={18} />
            </button>
          )}
          {onConfigure && (
            <button type="button" title={configureLabel} onClick={onConfigure} className={actionButton}>
              <Settings size={18} />
            </button>
          )}
          {!plugin.core && (
            <button type="button" title={plugin.builtin ? '重启' : '重载'} disabled={busy || plugin.disabled} onClick={onReload} className={actionButton}>
              <RotateCw size={18} className={busy ? 'animate-spin' : ''} />
            </button>
          )}
          {onDuplicate && (
            <button type="button" title="添加一个实例" disabled={busy || plugin.state === 'missing'} onClick={onDuplicate} className={actionButton}>
              <Copy size={18} />
            </button>
          )}
        </div>
      </div>

      {scope && <p className="text-xs text-theme-muted mt-3">生效范围：{scope}</p>}

      {plugin.listenerError && (
        <div className="flex items-center gap-3 mt-3">
          <p className="flex-1 text-xs text-red-500 truncate" title={plugin.listenerError.message}>
            处理消息时出错 {plugin.listenerError.count} 次：{plugin.listenerError.message}
          </p>
          <button type="button" onClick={dismissError} className="btn-glass text-xs px-3 py-1.5 flex-shrink-0">知道了</button>
        </div>
      )}

      {conflicts?.map(conflict => (
        <p key={conflict.service} className="text-xs text-amber-600 dark:text-amber-400 mt-3">
          和{conflict.with.map(other => `「${pluginTitle(other)}」`).join('、')}都提供 {conflict.service}，同时只能运行一个
        </p>
      ))}

      {unapproved && (
        <div className="flex items-center gap-3 mt-3">
          <p className="flex-1 text-xs text-amber-600 dark:text-amber-400">带着自己的界面，批准后才会加载到 WebUI 里</p>
          <button type="button" onClick={approve} className="btn-glass text-xs px-3 py-1.5 flex-shrink-0">批准界面</button>
        </div>
      )}

      {(clientError || failure) && (
        <p className="text-xs text-red-500 mt-3 truncate" title={clientError ?? failure?.message}>
          {clientError ? `界面模块没能加载：${clientError}` : `${failure!.where}出错了：${failure!.message}`}
        </p>
      )}

      {plugin.reloadCount >= RELOAD_WARNING && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">已热重载 {plugin.reloadCount} 次，旧代码仍占着内存，建议找时间重启 Bot</p>
      )}
    </div>
  )
}

export default PluginCard
