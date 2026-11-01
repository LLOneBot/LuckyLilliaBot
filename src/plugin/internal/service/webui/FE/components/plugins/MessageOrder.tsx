import React, { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Loader2, MessagesSquare, RotateCcw, Save } from 'lucide-react'
import { showToast } from '../common'
import { usePluginList } from '../../plugin-host/pluginList'
import { PluginStatus } from '../../types/plugins'
import { setMessageOrder } from '../../utils/pluginApi'
import { pluginIcon, pluginTitle, scopeSummary } from './meta'

const COMMANDS = 'builtin:commands'

/** Ordered ones first, then the rest in the order of the list, which is about the one they started in. */
function inOrder(plugins: PluginStatus[]): string[] {
  const listening = plugins.filter(plugin => plugin.messages)
  const ranked = listening.filter(plugin => plugin.rank !== undefined).sort((a, b) => a.rank! - b.rank!)
  return [...ranked, ...listening.filter(plugin => plugin.rank === undefined)].map(plugin => plugin.id)
}

/** The plugins listening to messages, in the order a message passes them; the user moves them around. */
const MessageOrder: React.FC = () => {
  const plugins = usePluginList(state => state.plugins) ?? []
  const current = useMemo(() => inOrder(plugins), [plugins])
  const [order, setOrder] = useState(current)
  const [saving, setSaving] = useState(false)
  const dirty = order.join('\n') !== current.join('\n')
  // A plugin starting or stopping changes the list; an edit in progress keeps its order and takes in the new ones
  useEffect(() => {
    setOrder(previous => [...previous.filter(id => current.includes(id)), ...current.filter(id => !previous.includes(id))])
  }, [current.join('\n')])

  const move = (index: number, by: number) => setOrder((previous) => {
    const next = [...previous]
    const [item] = next.splice(index, 1)
    next.splice(index + by, 0, item)
    return next
  })

  const save = async (next: string[], message: string) => {
    setSaving(true)
    try {
      await setMessageOrder(next)
      showToast(message, 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  const byId = new Map(plugins.map(plugin => [plugin.id, plugin]))
  const ranked = plugins.some(plugin => plugin.rank !== undefined)

  return (
    <div className="space-y-4">
      <div className="card p-5 space-y-2">
        <div className="flex items-center gap-2 text-theme font-medium"><MessagesSquare size={18} />消息处理顺序</div>
        <p className="text-sm text-theme-secondary">
          别人发来的消息从上往下经过这些插件，前面的插件处理完不往下传，后面的就收不到。所有插件的指令都在「指令」这一行统一匹配，想让某个插件先于指令看到消息，就把它挪到「指令」上面。改了立刻生效，不用重启插件。
        </p>
        <p className="text-xs text-theme-muted">只列出启用中、会处理消息的插件。没排过序时按插件启动的先后。</p>
      </div>

      {order.length === 0 ? (
        <div className="card p-10 text-center text-sm text-theme-secondary">现在没有处理消息的插件</div>
      ) : (
        <div className="card divide-y divide-black/5 dark:divide-white/10">
          {order.map((id, index) => {
            const plugin = byId.get(id)
            if (!plugin) return null
            const Icon = pluginIcon(plugin)
            const summary = scopeSummary(plugin.scope)
            return (
              <div key={id} className="flex items-center gap-3 p-4">
                <span className="w-6 text-center text-sm text-theme-muted flex-shrink-0">{index + 1}</span>
                <div className="w-9 h-9 rounded-xl bg-theme-item text-theme-secondary flex items-center justify-center flex-shrink-0"><Icon size={18} /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-theme truncate">{pluginTitle(plugin)}</div>
                  <div className="text-xs text-theme-hint truncate">
                    {plugin.name === COMMANDS ? '所有插件的指令' : plugin.name}
                    {summary ? ` · ${summary}` : ''}
                  </div>
                  {plugin.listenerError && (
                    <div className="text-xs text-red-500 truncate" title={plugin.listenerError.message}>
                      出错 {plugin.listenerError.count} 次：{plugin.listenerError.message}
                    </div>
                  )}
                </div>
                <button type="button" title="往前" disabled={index === 0} onClick={() => move(index, -1)}
                  className="p-2 text-theme-muted hover:text-theme hover:bg-theme-item rounded-lg disabled:opacity-30 disabled:pointer-events-none">
                  <ArrowUp size={18} />
                </button>
                <button type="button" title="往后" disabled={index === order.length - 1} onClick={() => move(index, 1)}
                  className="p-2 text-theme-muted hover:text-theme hover:bg-theme-item rounded-lg disabled:opacity-30 disabled:pointer-events-none">
                  <ArrowDown size={18} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex justify-end gap-3">
        {ranked && (
          <button type="button" disabled={saving} onClick={() => save([], '已恢复为按启动先后')} className="btn-glass flex items-center gap-2">
            <RotateCcw size={18} />恢复默认
          </button>
        )}
        <button type="button" disabled={!dirty || saving} onClick={() => save(order, '顺序已保存，立刻生效')} className="btn-primary flex items-center gap-2">
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          保存顺序
        </button>
      </div>
    </div>
  )
}

export default MessageOrder
