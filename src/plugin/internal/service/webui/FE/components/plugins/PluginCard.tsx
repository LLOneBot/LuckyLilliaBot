import React, { useState } from 'react'
import { ArrowUpCircle, Download, Info, Loader2, RotateCw, Settings, Trash2 } from 'lucide-react'
import type { PluginCatalogItem, PluginInstalledPackage, PluginUpdateInfo } from '@luckylillia/plugin-sdk/webui'
import { PluginStatus } from '../../types/plugins'
import { useRenderFailures } from '../../plugin-host/failures'
import { useClientErrors } from '../../plugin-host/host'
import { usePluginList } from '../../plugin-host/pluginList'
import { SlotOutlet } from '../../plugin-host/views'
import { clearListenerError } from '../../utils/pluginApi'
import { showToast } from '../common'
import {
  Conflict, NEEDS_SETTINGS, pendingReason, pluginDescription, pluginTitle, RELOAD_WARNING, scopeSummary, STATE_LABEL,
} from './meta'
import PluginIcon from './PluginIcon'
import { PluginMetaRow } from './PluginMetaRow'
import PluginUninstallDialog from './PluginUninstallDialog'

interface PluginCardProps {
  /** A runtime entry, a catalog entry, or an installed package must be present. */
  plugin?: PluginStatus
  catalog?: PluginCatalogItem
  packageStatus?: PluginInstalledPackage
  updateInfo?: PluginUpdateInfo
  /** Shown when several entries share one package. */
  instanceTag?: string
  /** Services it shares with other enabled entries. */
  conflicts?: Conflict[]
  busy: boolean
  /** An operation on this runtime entry, rather than another package. */
  entryBusy?: boolean
  /** This package is being installed, updated or uninstalled. */
  packageBusy?: boolean
  onToggle?: (enabled: boolean) => void
  /** Opens the plugin's settings page or the config dialog; absent when there is nothing to configure. */
  onConfigure?: () => void
  /** Which of the two it opens */
  configureLabel?: string
  /** Opens the package's metadata and any declared details. */
  onDetails?: () => void
  onReload?: () => void
  onInstall?: () => void
  onUpdate?: () => void
  /** Called only after the user confirms removing the package. */
  onUninstall?: (keepConfig: boolean) => void
}

const actionButton = 'p-2 text-theme-muted hover:text-theme hover:bg-theme-item rounded-lg transition-colors disabled:opacity-40 disabled:pointer-events-none'
const compactButton = 'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none'
const quietState = 'bg-theme-item text-theme-muted'

const PluginCard: React.FC<PluginCardProps> = ({
  plugin, catalog, packageStatus, updateInfo, instanceTag, conflicts, busy, entryBusy, packageBusy, onToggle,
  onConfigure, configureLabel = '配置', onDetails, onReload, onInstall, onUpdate, onUninstall,
}) => {
  const [confirmUninstall, setConfirmUninstall] = useState(false)
  const installed = !!(plugin || packageStatus)
  const builtin = !!(plugin?.builtin || packageStatus?.builtin || catalog?.builtin)
  const waiting = plugin?.state === 'active' && !!plugin.notice
  const state = plugin
    ? waiting ? NEEDS_SETTINGS : STATE_LABEL[plugin.state]
    : { label: installed ? '已安装' : '未安装', className: quietState }
  const active = plugin?.state === 'active' && !waiting
  const plugins = usePluginList(state => state.plugins) ?? []
  const detail = plugin ? pendingReason(plugin, plugins) ?? plugin.error ?? plugin.notice : undefined
  const clientError = useClientErrors(state => plugin ? state.errors[plugin.name] : undefined)
  const failure = useRenderFailures(state => plugin ? Object.values(state.failures).find(item => item.owner === plugin.name) : undefined)
  const scope = scopeSummary(plugin?.scope)
  const disabled = busy || packageBusy
  const packageName = plugin?.packageName ?? packageStatus?.name ?? catalog?.name ?? (!builtin ? plugin?.name : undefined)
  const title = plugin && (plugin.title || plugin.manifest.title)
    ? pluginTitle(plugin)
    : packageStatus?.title ?? catalog?.title ?? (plugin ? pluginTitle(plugin) : packageName ?? '')
  const version = plugin?.version ?? packageStatus?.activeVersion ?? packageStatus?.version ?? catalog?.version
  const description = (plugin && pluginDescription(plugin)) ?? packageStatus?.description ?? catalog?.description
  const icon = {
    iconUrl: plugin?.iconUrl ?? (!plugin?.manifest.icon ? catalog?.iconUrl : undefined),
    manifest: { icon: plugin?.manifest.icon ?? catalog?.icon },
  }
  const canUpdate = !!(packageStatus?.managed && updateInfo?.update && onUpdate)
  const canUninstall = !!(packageStatus?.managed && !builtin && onUninstall)
  const canReinstall = plugin?.state === 'missing' && !packageStatus && !!catalog && !!onInstall
  const packageNote = packageStatus?.managed === false ? '本地目录'
    : updateInfo?.update ? `可更新至 ${updateInfo.update}`
      : updateInfo?.latest && !updateInfo.blocked && !updateInfo.error
        ? updateInfo.latest === packageStatus?.version ? '已是最新' : `市场版本 ${updateInfo.latest}`
        : undefined
  const packageWarnings = [
    packageStatus?.restartRequired && {
      label: '等待重启',
      message: `已下载 ${packageStatus.version}，重启 Bot 后生效${packageStatus.activeVersion ? `；当前运行 ${packageStatus.activeVersion}` : ''}`,
    },
    packageStatus?.error && { label: '更新未加载', message: packageStatus.error, error: true },
    updateInfo?.blocked && updateInfo.blocked !== '该插件已不在当前市场目录中，无法从市场更新' && { label: '暂时无法更新', message: updateInfo.blocked },
    updateInfo?.deprecated && { label: '此版本已弃用', message: updateInfo.deprecated },
    updateInfo?.error && { label: '检查更新失败', message: updateInfo.error, error: true },
  ].filter((item): item is { label: string; message: string; error?: boolean } => !!item)
  const dismissError = () => {
    if (!plugin) return
    clearListenerError(plugin.id).catch(error => showToast(error instanceof Error ? error.message : String(error), 'error'))
  }
  if (!plugin && !catalog && !packageStatus) return null

  return (
    // Only the switch, buttons and links are clickable, so a stray click on the card does nothing.
    <div className={`card min-w-0 p-4 sm:p-5 transition-all flex flex-col ${active ? 'ring-2 ring-pink-500' : ''}`} data-plugin-card={packageName ?? plugin?.name}>
      <div className="flex items-start gap-3">
        <PluginIcon
          plugin={icon}
          className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl"
          fill={active || !installed ? 'gradient-primary-br text-white' : 'bg-gray-200 dark:bg-neutral-600 text-theme-secondary'}
          size={22}
          muted={!!plugin && !active}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="min-w-0 text-base sm:text-lg font-semibold text-theme break-words [overflow-wrap:anywhere]">{title}</h4>
            {instanceTag && <span className="text-xs text-theme-hint font-mono">{instanceTag}</span>}
            {builtin && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300">
                {plugin?.core ? '核心' : '内置'}
              </span>
            )}
            {plugin?.manifest.preview && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">开发中</span>
            )}
          </div>
          {version && <p className="text-xs text-theme-hint break-all">v{version}</p>}
        </div>
        {plugin && !canReinstall ? (
          <input
            type="checkbox"
            checked={!plugin.disabled}
            disabled={disabled || plugin.state === 'missing' || plugin.core || !onToggle}
            onChange={e => onToggle?.(e.target.checked)}
            className="switch-toggle flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            title={plugin.core ? 'Bot 依赖这个组件，不能停用' : plugin.disabled ? '启用' : '停用'}
            aria-label={`${plugin.disabled ? '启用' : '停用'} ${title}`}
          />
        ) : (!installed || canReinstall) && (
          <button type="button" onClick={onInstall} disabled={disabled || !onInstall} title={`${canReinstall ? '重新安装' : '安装'} ${title}`} aria-label={`${canReinstall ? '重新安装' : '安装'} ${title}`} className={`${compactButton} gradient-primary text-white`}>
            {packageBusy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {canReinstall ? '重新安装' : '安装'}
          </button>
        )}
      </div>

      <p className="text-sm text-theme-secondary mt-3 flex-1 break-words [overflow-wrap:anywhere]">{description ?? '没有描述'}</p>

      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mt-3">
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <span className={`text-xs font-medium px-2 py-1 rounded-full shrink-0 ${state.className}`}>{state.label}</span>
          {(detail || packageNote) && <span className="min-w-0 text-xs text-theme-muted truncate" title={detail ?? (packageStatus?.managed === false ? packageStatus.root : packageNote)}>{detail ?? packageNote}</span>}
        </div>
        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end">
          {plugin && <SlotOutlet name="plugins.card.actions" props={{ plugin }} />}
          {packageBusy && installed && <Loader2 size={16} className="mx-2 animate-spin text-theme-muted" aria-label="正在处理插件" />}
          {canUpdate && (
            <button type="button" title={`更新到 ${updateInfo!.update}`} aria-label={`${title} 更新到 ${updateInfo!.update}`} disabled={disabled} onClick={onUpdate} className={`${compactButton} text-pink-600 dark:text-pink-400 hover:bg-pink-100 dark:hover:bg-pink-900/30`}>
              <ArrowUpCircle size={15} />更新
            </button>
          )}
          <div className="flex shrink-0 items-center">
            {onConfigure && (
              <button type="button" title={configureLabel} aria-label={`${title} 的设置`} disabled={disabled} onClick={onConfigure} className={actionButton}>
                <Settings size={18} />
              </button>
            )}
            {plugin && !plugin.core && onReload && (
              <button type="button" title={plugin.builtin ? '重启' : '重载'} aria-label={`${plugin.builtin ? '重启' : '重载'} ${title}`} disabled={disabled || plugin.disabled} onClick={onReload} className={actionButton}>
                <RotateCw size={17} className={entryBusy ? 'animate-spin' : ''} />
              </button>
            )}
            {canUninstall && (
              <button type="button" title="卸载" aria-label={`卸载 ${title}`} disabled={disabled} onClick={() => setConfirmUninstall(true)} aria-haspopup="dialog" className={`${actionButton} hover:!text-red-500`}>
                <Trash2 size={17} />
              </button>
            )}
          </div>
        </div>
      </div>

      <PluginMetaRow
        title={title}
        category={plugin?.manifest.category ?? catalog?.category}
        author={plugin?.author ?? catalog?.author}
        packageName={packageName}
        repository={plugin?.repository ?? catalog?.repository}
        className="mt-3 pt-3 border-t border-theme-divider"
      >
        {onDetails && (
          <button type="button" title="详情" aria-label={`${title} 的详情`} onClick={onDetails} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-theme-muted hover:text-theme hover:bg-theme-item transition-colors">
            <Info size={16} />
          </button>
        )}
      </PluginMetaRow>

      {confirmUninstall && canUninstall && (
        <PluginUninstallDialog title={title} packageName={packageName!} busy={!!disabled}
          onClose={() => setConfirmUninstall(false)}
          onConfirm={keepConfig => { setConfirmUninstall(false); onUninstall?.(keepConfig) }} />
      )}

      {packageWarnings.length > 0 && (
        <div className="mt-3 space-y-2">
          {packageWarnings.map(warning => (
            <details key={warning.label} className={`text-xs ${warning.error ? 'text-red-500' : 'text-amber-600 dark:text-amber-400'}`}>
              <summary className="w-fit max-w-full cursor-pointer">{warning.label}</summary>
              <p className="mt-1 text-theme-muted whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{warning.message}</p>
            </details>
          ))}
        </div>
      )}

      {scope && <p className="text-xs text-theme-muted mt-3">生效范围：{scope}</p>}

      {plugin?.listenerError && (
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

      {(clientError || failure) && (
        <p className="text-xs text-red-500 mt-3 truncate" title={clientError ?? failure?.message}>
          {clientError ? `界面模块没能加载：${clientError}` : `${failure!.where}出错了：${failure!.message}`}
        </p>
      )}

      {plugin && plugin.reloadCount >= RELOAD_WARNING && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">已热重载 {plugin.reloadCount} 次，旧代码仍占着内存，建议找时间重启 Bot</p>
      )}
    </div>
  )
}

export default PluginCard
