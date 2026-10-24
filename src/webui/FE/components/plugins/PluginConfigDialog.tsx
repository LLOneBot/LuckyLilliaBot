import React, { useEffect, useState } from 'react'
import { Loader2, Save, Trash2, X } from 'lucide-react'
import { Portal, showToast } from '../common'
import { PluginDescription, PluginStatus } from '../../types/plugins'
import {
  ConfigConflictError, ConfigRejectedError, describePlugin, removePlugin, savePluginConfig,
} from '../../utils/pluginApi'
import { hydrate, SchemaNode } from './schema/model'
import { SchemaField } from './schema/SchemaField'
import { JsonInput } from './schema/inputs'
import { pluginIcon, pluginTitle } from './meta'
import DependencyList from './DependencyList'
import { PluginBoundary } from '../../plugin-host/context'
import { ensureClient, useClientErrors } from '../../plugin-host/host'
import { useConfigEditor } from '../../plugin-host/views'

interface PluginConfigDialogProps {
  plugin: PluginStatus
  /** The live list, for the dependency section. */
  plugins: PluginStatus[]
  /** Other entries of the same package exist, so deleting this one keeps the plugin listed. */
  removable: boolean
  onClose: () => void
}

/** What the form edits: the full value for a schema form, what is stored for the JSON editor. */
function formValue(description: PluginDescription, node: SchemaNode | null): unknown {
  return node ? description.effective : description.config ?? undefined
}

const PluginConfigDialog: React.FC<PluginConfigDialogProps> = ({ plugin, plugins, removable, onClose }) => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [node, setNode] = useState<SchemaNode | null>(null)
  const [schema, setSchema] = useState<unknown>(null)
  // A plugin with a WebUI module may bring its own editor, and a disabled one has not been loaded yet
  const [clientReady, setClientReady] = useState(!plugin.webui)
  const Editor = useConfigEditor(plugin.name)?.component
  const clientError = useClientErrors(state => state.errors[plugin.name])
  const [defaults, setDefaults] = useState<unknown>({})
  const [description, setDescription] = useState<PluginDescription | null>(null)
  const [value, setValue] = useState<unknown>(undefined)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const Icon = pluginIcon(plugin)

  useEffect(() => {
    describePlugin(plugin.id)
      .then((loaded) => {
        const root = loaded.schema ? hydrate(loaded.schema) : null
        setNode(root)
        setSchema(loaded.schema)
        setDefaults(loaded.defaults)
        setDescription(loaded)
        setValue(formValue(loaded, root))
      })
      .catch(e => setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [plugin.id])

  useEffect(() => {
    if (!plugin.webui) return
    let alive = true
    ensureClient(plugin.name, plugin.webui).then(() => alive && setClientReady(true))
    return () => {
      alive = false
    }
  }, [plugin.name, plugin.webui])

  // No schema and no Config export: nothing to configure. A non-schemastery Config gets the JSON editor.
  const configurable = !!Editor || node !== null || plugin.hasConfig !== false
  const ready = !loading && clientReady

  const save = async () => {
    setSaving(true)
    setErrors({})
    try {
      // The complete value goes up; the server works out what differs from the defaults
      await savePluginConfig(plugin.id, value, { ifRev: description?.rev })
      showToast('配置已保存，插件已按新配置重启', 'success')
      onClose()
    } catch (e) {
      if (e instanceof ConfigRejectedError) {
        setErrors(Object.fromEntries(e.issues.map(issue => [issue.path.join('.'), issue.message])))
        showToast('有配置项没通过校验', 'error')
      } else if (e instanceof ConfigConflictError) {
        const fresh = await describePlugin(plugin.id).catch(() => null)
        if (fresh) {
          setDescription(fresh)
          setDefaults(fresh.defaults)
          setValue(formValue(fresh, node))
        }
        showToast('配置在别处被改过，已重新载入最新值', 'error')
      } else {
        showToast(e instanceof Error ? e.message : '保存失败', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    try {
      await removePlugin(plugin.id)
      showToast('实例已删除', 'success')
      onClose()
    } catch (e) {
      showToast(e instanceof Error ? e.message : '删除失败', 'error')
    }
  }

  return (
    <Portal>
      <div className="fixed inset-0 scrim flex items-center justify-center p-4" style={{ zIndex: 9000 }} onClick={onClose}>
        <div className="glass glass-thick r-window glass-pop w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-6 hairline-b">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl gradient-primary-br text-white flex items-center justify-center flex-shrink-0"><Icon size={20} /></div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-theme truncate">{pluginTitle(plugin)} 配置</h3>
                <p className="text-xs text-theme-hint truncate">{plugin.name} · {plugin.id}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-theme-hint hover:text-theme"><X size={24} /></button>
          </div>

          <div className="p-6 overflow-y-auto flex-1 space-y-6">
            <DependencyList plugin={plugins.find(other => other.id === plugin.id) ?? plugin} plugins={plugins} />
            {!ready && <div className="flex justify-center py-10"><Loader2 size={32} className="animate-spin text-pink-500" /></div>}
            {ready && loadError && <p className="text-sm text-red-500">加载配置失败：{loadError}</p>}
            {ready && !loadError && !configurable && <p className="text-sm text-theme-secondary text-center py-6">这个插件没有可配置项</p>}
            {ready && !loadError && configurable && (
              <div className="space-y-5">
                {clientError && <p className="text-xs text-amber-600 dark:text-amber-400">插件自己的界面没能加载，先用通用表单：{clientError}</p>}
                {errors[''] && <p className="text-sm text-red-500">{errors['']}</p>}
                {Editor ? (
                  <PluginBoundary owner={plugin.name}>
                    <Editor value={value} onChange={setValue} schema={schema} defaults={defaults} errors={errors} />
                  </PluginBoundary>
                ) : node
                  ? <SchemaField node={node} value={value} onChange={setValue} path={[]} errors={errors} depth={0} />
                  : <JsonInput value={value} onChange={setValue} invalid={!!errors['']} />}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between p-6 hairline-t">
            {removable ? (
              <button onClick={remove} className="px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors flex items-center gap-2">
                <Trash2 size={18} />删除此实例
              </button>
            ) : <div />}
            <div className="flex items-center gap-3">
              <button onClick={onClose} className="px-6 py-2.5 text-theme-secondary hover:bg-theme-item rounded-xl font-medium transition-colors">取消</button>
              {configurable && !loadError && (
                <button onClick={save} disabled={!ready || saving} className="btn-primary flex items-center gap-2">
                  {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  保存
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Portal>
  )
}

export default PluginConfigDialog
