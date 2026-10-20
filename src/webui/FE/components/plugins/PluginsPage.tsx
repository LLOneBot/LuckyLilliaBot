import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { FolderSearch, Loader2, Puzzle } from 'lucide-react'
import { showToast } from '../common'
import { PluginStatus } from '../../types/plugins'
import {
  addPluginInstance, listPlugins, openPluginStream, reloadPlugin, scanPlugins, setPluginEnabled,
} from '../../utils/pluginApi'
import PluginCard from './PluginCard'
import PluginConfigDialog from './PluginConfigDialog'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

const PluginsPage: React.FC = () => {
  const [plugins, setPlugins] = useState<PluginStatus[] | null>(null)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [scanning, setScanning] = useState(false)
  const [editing, setEditing] = useState<PluginStatus | null>(null)

  const refresh = useCallback(async () => {
    try {
      setPlugins(await listPlugins())
    } catch (e) {
      showToast(`获取插件列表失败：${errorText(e)}`, 'error')
      setPlugins(previous => previous ?? [])
    }
  }, [])

  useEffect(() => {
    refresh()
    return openPluginStream((event) => {
      if (event.type === 'list') {
        refresh()
        return
      }
      if (event.data.manifest.hidden) return
      setPlugins(previous => {
        if (!previous) return previous
        const index = previous.findIndex(plugin => plugin.id === event.data.id)
        if (index < 0) return [...previous, event.data]
        const next = [...previous]
        next[index] = event.data
        return next
      })
    })
  }, [refresh])

  const sorted = useMemo(
    () => [...(plugins ?? [])].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    [plugins],
  )
  const countByName = useMemo(() => {
    const counts = new Map<string, number>()
    for (const plugin of sorted) counts.set(plugin.name, (counts.get(plugin.name) ?? 0) + 1)
    return counts
  }, [sorted])

  const withBusy = async (id: string, task: () => Promise<void>) => {
    setBusy(previous => new Set(previous).add(id))
    try {
      await task()
    } catch (e) {
      showToast(errorText(e), 'error')
    } finally {
      setBusy(previous => {
        const next = new Set(previous)
        next.delete(id)
        return next
      })
    }
  }

  const toggle = (plugin: PluginStatus, enabled: boolean) => withBusy(plugin.id, async () => {
    const status = await setPluginEnabled(plugin.id, enabled)
    if (enabled && status.state === 'failed') showToast(`启用后运行出错：${status.error ?? '未知错误'}`, 'error')
  })

  const reload = (plugin: PluginStatus) => withBusy(plugin.id, async () => {
    const result = await reloadPlugin(plugin.id)
    if (result.status === 'reloaded') showToast('已重新加载', 'success')
    else showToast(`需要重启 Bot 才能生效：${result.reason}`, 'warning')
  })

  const duplicate = (plugin: PluginStatus) => withBusy(plugin.id, async () => {
    await addPluginInstance(plugin.name)
    showToast('已添加新实例', 'success')
  })

  const scan = async () => {
    setScanning(true)
    try {
      const { added, removed } = await scanPlugins()
      const parts = [added.length && `新增 ${added.length} 个`, removed.length && `移除 ${removed.length} 个`].filter(Boolean)
      showToast(parts.length ? `扫描完成：${parts.join('，')}` : '扫描完成，没有变化', 'success')
      await refresh()
    } catch (e) {
      showToast(`扫描失败：${errorText(e)}`, 'error')
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl gradient-primary-br flex items-center justify-center flex-shrink-0">
            <Puzzle size={24} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-theme">插件</h3>
            <p className="text-sm text-theme-secondary">
              把插件目录放进 <code className="text-xs px-1.5 py-0.5 rounded bg-theme-item">data/plugins/</code> 后重新扫描，新插件默认不启用
            </p>
          </div>
          <button onClick={scan} disabled={scanning} className="btn-glass flex items-center gap-2 flex-shrink-0">
            {scanning ? <Loader2 size={18} className="animate-spin" /> : <FolderSearch size={18} />}
            重新扫描
          </button>
        </div>
      </div>

      {plugins === null && (
        <div className="flex justify-center py-16"><Loader2 size={40} className="animate-spin text-pink-500" /></div>
      )}

      {plugins !== null && sorted.length === 0 && (
        <div className="card p-10 text-center">
          <Puzzle size={40} className="mx-auto text-theme-hint mb-4" />
          <p className="text-theme font-medium">还没有插件</p>
          <p className="text-sm text-theme-secondary mt-2">一个插件就是一个带 llbot 字段的 npm 包目录，放进 data/plugins/ 后点"重新扫描"</p>
        </div>
      )}

      {sorted.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {sorted.map(plugin => (
            <PluginCard
              key={plugin.id}
              plugin={plugin}
              instanceTag={(countByName.get(plugin.name) ?? 0) > 1 ? `#${plugin.id}` : undefined}
              busy={busy.has(plugin.id)}
              onToggle={enabled => toggle(plugin, enabled)}
              onConfigure={() => setEditing(plugin)}
              onReload={() => reload(plugin)}
              onDuplicate={() => duplicate(plugin)}
            />
          ))}
        </div>
      )}

      {editing && (
        <PluginConfigDialog
          plugin={editing}
          removable={(countByName.get(editing.name) ?? 0) > 1}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

export default PluginsPage
