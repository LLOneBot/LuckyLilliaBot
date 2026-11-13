import React, { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Loader2, MessagesSquare, RotateCcw, Save } from 'lucide-react'
import { PluginIcon, usePluginContext, usePlugins, type PluginEntryStatus, type WebUIPlugin } from '@luckylillia/plugin-sdk/webui'

export const name = 'builtin:message-order'

const COMMANDS = 'builtin:commands'
const platformNames: Record<string, string> = { ntqq: 'NTQQ', qq: 'QQ 官方机器人', qqguild: 'QQ 频道' }

function titleOf(plugin: PluginEntryStatus): string {
  const title = plugin.manifest?.title
  return plugin.title ?? (typeof title === 'string' ? title : title?.zh ?? title?.['zh-CN'] ?? title?.en)
    ?? plugin.name.split('/').at(-1)!.replace(/^luckylillia-plugin-/, '')
}

function scopeSummary(scope: PluginEntryStatus['scope']): string | undefined {
  if (!scope) return
  const parts: string[] = []
  if (scope.platforms?.length) parts.push(`只在${scope.platforms.map(platform => platformNames[platform] ?? platform).join('、')}`)
  if (scope.bots?.length) parts.push(`只用 ${scope.bots.length} 个账号`)
  if (scope.guilds) parts.push(`${scope.guilds.mode === 'allow' ? '只在' : '不在'} ${scope.guilds.ids.length} 个群`)
  if (scope.users) parts.push(`${scope.users.mode === 'allow' ? '只理' : '不理'} ${scope.users.ids.length} 个人`)
  if (scope.direct === false) parts.push('不在私聊')
  return parts.length ? parts.join('，') : undefined
}

/** Saved positions first; listeners not explicitly ranked keep their existing start order. */
function inOrder(plugins: PluginEntryStatus[]): string[] {
  const listening = plugins.filter(plugin => plugin.messages)
  const ranked = listening.filter(plugin => plugin.rank !== undefined).sort((a, b) => a.rank! - b.rank!)
  return [...ranked, ...listening.filter(plugin => plugin.rank === undefined)].map(plugin => plugin.id)
}

const MessageOrder: React.FC = () => {
  const ctx = usePluginContext()
  const loaded = usePlugins()
  const plugins = loaded ?? []
  const current = useMemo(() => inOrder(plugins), [loaded])
  const [draft, setDraft] = useState<string[] | null>(null)
  const [saving, setSaving] = useState(false)
  // A stopped listener disappears; new listeners join the end without discarding an edit in progress.
  const order = draft
    ? [...draft.filter(id => current.includes(id)), ...current.filter(id => !draft.includes(id))]
    : current
  const orderKey = order.join(',')
  const currentKey = current.join(',')
  const dirty = orderKey !== currentKey
  // Once the server acknowledges the saved order, follow later changes until the next local edit.
  useEffect(() => {
    if (draft && !dirty) setDraft(null)
  }, [draft, orderKey, currentKey])

  const move = (index: number, by: number) => {
    const next = [...order]
    const [item] = next.splice(index, 1)
    next.splice(index + by, 0, item)
    setDraft(next)
  }

  const save = async (next: string[], message: string) => {
    setSaving(true)
    try {
      const saved = await ctx.api<string[]>('/api/plugins/order', { method: 'PUT', body: { order: next } })
      setDraft(saved.length ? saved : null)
      ctx.toast(message)
    } catch (error) {
      ctx.toast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const byId = new Map(plugins.map(plugin => [plugin.id, plugin]))
  const ranked = plugins.some(plugin => plugin.rank !== undefined)

  return (
    <div className="space-y-4">
      <div className="card p-4 sm:p-5 space-y-2">
        <div className="flex items-center gap-2 text-theme font-medium"><MessagesSquare size={18} />消息处理顺序</div>
        <p className="text-sm text-theme-secondary">
          别人发来的消息从上往下经过这些插件，前面的插件处理完不往下传，后面的就收不到。所有插件的指令都在「指令」这一行统一匹配，想让某个插件先于指令看到消息，就把它挪到「指令」上面。改了立刻生效，不用重启插件。
        </p>
        <p className="text-xs text-theme-muted">只列出启用中、会处理消息的插件。没排过序时按插件启动的先后。停用本工具会隐藏这个页面，已保存的顺序继续生效。</p>
      </div>

      {!loaded ? (
        <div className="flex justify-center py-10"><Loader2 size={24} className="animate-spin text-pink-500" aria-label="正在加载插件" /></div>
      ) : order.length === 0 ? (
        <div className="card p-8 text-center text-sm text-theme-secondary">现在没有处理消息的插件</div>
      ) : (
        <div className="card divide-y divide-black/5 dark:divide-white/10">
          {order.map((id, index) => {
            const plugin = byId.get(id)
            if (!plugin) return null
            const title = titleOf(plugin)
            const summary = scopeSummary(plugin.scope)
            return (
              <div key={id} className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4">
                <span className="w-5 text-center text-sm text-theme-muted shrink-0">{index + 1}</span>
                <PluginIcon plugin={{ iconUrl: plugin.iconUrl, manifest: plugin.manifest ?? {} }} className="w-9 h-9 rounded-xl" fill="bg-theme-item text-theme-secondary" size={18} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-theme truncate">{title}</div>
                  <div className="text-xs text-theme-hint truncate" title={summary}>
                    {plugin.name === COMMANDS ? '所有插件的指令' : plugin.name}
                    {summary ? ` · ${summary}` : ''}
                  </div>
                  {plugin.listenerError && (
                    <div className="text-xs text-red-500 truncate" title={plugin.listenerError.message}>
                      出错 {plugin.listenerError.count} 次：{plugin.listenerError.message}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center">
                  <button type="button" title="往前" aria-label={`${title} 往前`} disabled={saving || index === 0} onClick={() => move(index, -1)}
                    className="p-2 text-theme-muted hover:text-theme hover:bg-theme-item rounded-lg disabled:opacity-30 disabled:pointer-events-none">
                    <ArrowUp size={17} />
                  </button>
                  <button type="button" title="往后" aria-label={`${title} 往后`} disabled={saving || index === order.length - 1} onClick={() => move(index, 1)}
                    className="p-2 text-theme-muted hover:text-theme hover:bg-theme-item rounded-lg disabled:opacity-30 disabled:pointer-events-none">
                    <ArrowDown size={17} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 sm:gap-3">
        {ranked && (
          <button type="button" disabled={saving} onClick={() => save([], '已恢复为按启动先后')} className="btn-glass flex items-center gap-2">
            <RotateCcw size={18} />恢复默认
          </button>
        )}
        <button type="button" disabled={!loaded || !dirty || saving} onClick={() => save(order, '顺序已保存，立刻生效')} className="btn-primary flex items-center gap-2">
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          保存顺序
        </button>
      </div>
    </div>
  )
}

const apply: WebUIPlugin = ctx => {
  ctx.page({ id: 'message-order', title: '消息处理顺序', icon: 'messages-square', order: 35, component: MessageOrder, settings: true })
}

export default apply
