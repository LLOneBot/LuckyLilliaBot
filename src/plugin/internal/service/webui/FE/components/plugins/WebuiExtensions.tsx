import React, { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, LayoutGrid, PanelLeft, ShieldCheck, Unplug } from 'lucide-react'
import type { SlotCardinality } from '@luckylillia/plugin-sdk/webui'
import { showToast } from '../common'
import { useRenderFailures } from '../../plugin-host/failures'
import { useClientErrors } from '../../plugin-host/host'
import { usePluginList } from '../../plugin-host/pluginList'
import { contributionLabel, useRegistry, WEBUI } from '../../plugin-host/registry'
import { describeContribution } from '../../plugin-host/views'
import { PluginStatus, UiPrefsPatch } from '../../types/plugins'
import { patchUiPrefs } from '../../utils/pluginApi'
import { moved, orderable, orphans, pageRows, RowState, SlotGroup, slotGroups, webuiPackages } from './extensions'
import { iconByName, pluginIcon, pluginTitle } from './meta'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

const STATE_TEXT: Record<RowState, { label: string; className: string }> = {
  shown: { label: '显示中', className: 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-400' },
  hidden: { label: '已隐藏', className: 'bg-gray-100 dark:bg-neutral-700 text-gray-600 dark:text-neutral-400' },
  inactive: { label: '插件没在运行', className: 'bg-gray-100 dark:bg-neutral-700 text-gray-600 dark:text-neutral-400' },
  shadowed: { label: '被覆盖', className: 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300' },
  unmatched: { label: '没写 match', className: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300' },
}

const CARDINALITY_TEXT: Record<SlotCardinality, { label: string; hint: string }> = {
  list: { label: '依次显示', hint: '每个都显示，可以调顺序' },
  single: { label: '只显示一个', hint: '优先级最高、没被隐藏的那个替换掉原来的内容' },
  keyed: { label: '每种各取一个', hint: '按键（右边的「键」）各显示一个，替换掉原来的那种' },
  chain: { label: '层层包装', hint: '排在前面的包在外面，每个都能改动里面的内容' },
}

const badge = 'text-[11px] px-2 py-0.5 rounded-full flex-shrink-0'
const iconButton = 'p-1.5 text-theme-muted hover:text-theme hover:bg-theme-item rounded-lg transition-colors disabled:opacity-30 disabled:pointer-events-none'

const Section: React.FC<{ icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }> = ({ icon, title, hint, children }) => (
  <section className="card p-6">
    <div className="flex items-center gap-3 mb-4">
      <div className="w-10 h-10 rounded-xl gradient-primary-br text-white flex items-center justify-center flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-theme">{title}</h3>
        {hint && <p className="text-xs text-theme-muted">{hint}</p>}
      </div>
    </div>
    {children}
  </section>
)

/**
 * The plugin page's 界面 view: what plugins add to the WebUI and where, for the user to approve, hide and order.
 * The choices are stored in plugins.json `ui` and hold for every browser.
 */
const WebuiExtensions: React.FC = () => {
  const contributions = useRegistry(state => state.contributions)
  const plugins = usePluginList(state => state.plugins)
  const prefs = usePluginList(state => state.prefs)
  const failures = useRenderFailures(state => state.failures)
  const clientErrors = useClientErrors(state => state.errors)
  const [busy, setBusy] = useState(false)

  const groups = useMemo(() => slotGroups(contributions, plugins, prefs, failures), [contributions, plugins, prefs, failures])
  const pages = useMemo(() => pageRows(contributions, prefs, failures), [contributions, prefs, failures])
  const lost = useMemo(() => orphans(contributions), [contributions])
  const packages = useMemo(() => webuiPackages(plugins), [plugins])
  const byName = useMemo(() => {
    const result = new Map<string, PluginStatus>()
    for (const plugin of plugins ?? []) if (!result.has(plugin.name)) result.set(plugin.name, plugin)
    return result
  }, [plugins])
  const titleOf = (owner: string) => {
    if (owner === WEBUI) return 'WebUI'
    const plugin = byName.get(owner)
    return plugin ? pluginTitle(plugin) : owner
  }
  const problems = [
    ...Object.entries(clientErrors).map(([owner, message]) => ({ key: `client:${owner}`, text: `「${titleOf(owner)}」的界面模块没能加载：${message}` })),
    ...Object.entries(failures).map(([key, failure]) => ({ key, text: `「${titleOf(failure.owner)}」的${failure.where}出错了：${failure.message}` })),
  ]

  const patch = async (change: UiPrefsPatch) => {
    setBusy(true)
    try {
      usePluginList.setState({ prefs: await patchUiPrefs(change) })
    } catch (e) {
      showToast(errorText(e), 'error')
    } finally {
      setBusy(false)
    }
  }
  const visibility = (key: string, visible: boolean) => patch(visible ? { show: [key] } : { hide: [key] })

  const slot = (group: SlotGroup) => {
    const { declaration, rows } = group
    const replacing = declaration.cardinality === 'single' || declaration.cardinality === 'keyed'
    const ordered = orderable(declaration)
    const cardinality = CARDINALITY_TEXT[declaration.cardinality] ?? CARDINALITY_TEXT.list
    return (
      <div key={declaration.name} className="py-4 first:pt-0 last:pb-0 border-b last:border-b-0 border-theme-divider">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-sm font-semibold text-theme">{declaration.title}</h4>
          <code className="text-xs px-1.5 py-0.5 rounded bg-theme-item text-theme-secondary">{declaration.name}</code>
          <span className={`${badge} bg-theme-item text-theme-secondary`} title={cardinality.hint}>{cardinality.label}</span>
          {declaration.owner !== WEBUI && <span className="text-xs text-theme-hint">由「{titleOf(declaration.owner)}」声明</span>}
          {group.reordered && (
            <button
              type="button"
              disabled={busy}
              onClick={() => patch({ order: Object.fromEntries(rows.map(row => [row.key, null])) })}
              className="ml-auto text-xs text-pink-500 hover:underline disabled:opacity-40"
            >
              恢复默认顺序
            </button>
          )}
        </div>
        {declaration.description && <p className="text-xs text-theme-muted mt-1">{declaration.description}</p>}
        {!group.live && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">「{titleOf(declaration.owner)}」没在运行，这个位置现在不在界面上</p>}
        {rows.length === 0 ? (
          <p className="text-xs text-theme-hint mt-2">还没有插件往这里放东西</p>
        ) : (
          <div className="mt-2 space-y-1">
            {declaration.cardinality === 'single' && !rows.some(row => row.state === 'shown') && (
              <p className="text-xs text-theme-hint">现在显示的是「{titleOf(declaration.owner)}」自带的内容</p>
            )}
            {rows.map((row, index) => (
              <div key={row.key} className="flex items-center gap-3 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-theme truncate">
                    {contributionLabel(row.contribution)}
                    <span className="text-xs text-theme-hint ml-2">{titleOf(row.contribution.owner)} · {row.contribution.id}</span>
                    {declaration.cardinality === 'keyed' && row.contribution.match !== undefined && (
                      <span className="text-xs text-theme-hint ml-2">键 <code>{row.contribution.match}</code></span>
                    )}
                  </p>
                  {row.failure && <p className="text-xs text-red-500 truncate" title={row.failure.message}>出错了：{row.failure.message}</p>}
                </div>
                <span className={`${badge} ${STATE_TEXT[row.state].className}`}>{STATE_TEXT[row.state].label}</span>
                {replacing && <span className="text-[11px] text-theme-hint flex-shrink-0" title="优先级">P{row.contribution.priority}</span>}
                {ordered && (
                  <div className="flex items-center flex-shrink-0">
                    <button type="button" title="上移" disabled={busy || index === 0} onClick={() => patch({ order: moved(rows, index, -1) })} className={iconButton}>
                      <ChevronUp size={16} />
                    </button>
                    <button type="button" title="下移" disabled={busy || index === rows.length - 1} onClick={() => patch({ order: moved(rows, index, 1) })} className={iconButton}>
                      <ChevronDown size={16} />
                    </button>
                  </div>
                )}
                <input
                  type="checkbox"
                  checked={row.state !== 'hidden'}
                  disabled={busy}
                  onChange={e => visibility(row.key, e.target.checked)}
                  className="switch-toggle flex-shrink-0"
                  title={row.state === 'hidden' ? '显示' : '隐藏'}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (plugins === null) return null

  return (
    <div className="space-y-6">
      {problems.length > 0 && (
        <div className="card p-4 space-y-2 border border-red-300/60 dark:border-red-500/40">
          {problems.map(problem => (
            <p key={problem.key} className="flex items-start gap-2 text-sm text-red-500">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <span className="min-w-0 break-words">{problem.text}</span>
            </p>
          ))}
        </div>
      )}

      {packages.length > 0 && (
        <Section
          icon={<ShieldCheck size={20} />}
          title="插件自带的界面"
          hint="批准后才会在 WebUI 里运行：它能用你的 WebUI 登录调用 Bot 的接口，往下面的位置里放东西。插件本身在启用时就已经在 Bot 里运行了"
        >
          <div className="space-y-1">
            {packages.map((plugin) => {
              const Icon = pluginIcon(plugin)
              return (
                <div key={plugin.name} className="flex items-center gap-3 py-1.5">
                  <Icon size={18} className="text-theme-muted flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-theme truncate">{pluginTitle(plugin)}</p>
                    <p className="text-xs text-theme-hint truncate">{plugin.name}{plugin.version ? ` · v${plugin.version}` : ''}</p>
                  </div>
                  {plugin.webuiApproved ? (
                    <>
                      <span className={`${badge} ${STATE_TEXT.shown.className}`}>已批准</span>
                      <button type="button" disabled={busy} onClick={() => patch({ revoke: [plugin.name] })} className="btn-glass text-xs px-3 py-1.5 flex-shrink-0">
                        撤销
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={`${badge} ${STATE_TEXT.shadowed.className}`}>待批准</span>
                      <button type="button" disabled={busy} onClick={() => patch({ approve: [plugin.name] })} className="btn-primary text-xs px-3 py-1.5 flex-shrink-0">
                        批准
                      </button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </Section>
      )}

      <Section icon={<LayoutGrid size={20} />} title="界面上的位置" hint="插件只能往这些位置里放东西、按位置声明的方式替换或包装；关掉的不再显示，顺序可以调">
        <div>{groups.map(slot)}</div>
      </Section>

      <Section icon={<PanelLeft size={20} />} title="侧边栏页面" hint="隐藏的页面只是不在侧边栏里列出，插件卡片上的「前往设置」照样打得开">
        {pages.length === 0 ? (
          <p className="text-xs text-theme-hint">没有插件注册页面</p>
        ) : (
          <div className="space-y-1">
            {pages.map(({ key, page, hidden, failure }) => {
              const Icon = iconByName(page.icon)
              return (
                <div key={key} className="flex items-center gap-3 py-1.5">
                  <Icon size={18} className="text-theme-muted flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-theme truncate">
                      {page.title}
                      <span className="text-xs text-theme-hint ml-2">{titleOf(page.owner)}{page.settings ? ' · 设置页' : ''}</span>
                    </p>
                    {failure && <p className="text-xs text-red-500 truncate" title={failure.message}>出错了：{failure.message}</p>}
                  </div>
                  {page.locked ? (
                    <span className={`${badge} bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300`} title="管住插件靠它，不能隐藏">核心</span>
                  ) : (
                    <input
                      type="checkbox"
                      checked={!hidden}
                      disabled={busy}
                      onChange={e => visibility(key, e.target.checked)}
                      className="switch-toggle flex-shrink-0"
                      title={hidden ? '在侧边栏显示' : '从侧边栏隐藏'}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {lost.length > 0 && (
        <Section icon={<Unplug size={20} />} title="找不到位置的内容" hint="插件想放进去的位置没有人声明：声明它的插件没装、没启用，或者它的界面没加载">
          <div className="space-y-1">
            {lost.map(contribution => (
              <p key={`${contribution.owner}|${contribution.slot}|${contribution.id}`} className="text-sm text-theme-secondary">
                「{titleOf(contribution.owner)}」的{describeContribution(undefined, contribution)}
              </p>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

export default WebuiExtensions
