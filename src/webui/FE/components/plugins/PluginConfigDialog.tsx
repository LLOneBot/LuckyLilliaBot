import React, { useEffect, useState } from 'react'
import { Loader2, Save, Trash2, X } from 'lucide-react'
import { Portal, showToast } from '../common'
import { PluginStatus } from '../../types/plugins'
import { ConfigRejectedError, describePlugin, removePlugin, savePluginConfig } from '../../utils/pluginApi'
import { hydrate, SchemaNode } from './schema/model'
import { stripDefaults, withDefaults } from './schema/values'
import { SchemaField } from './schema/SchemaField'
import { JsonInput } from './schema/inputs'
import { pluginIcon, pluginTitle } from './meta'
import DependencyList from './DependencyList'

interface PluginConfigDialogProps {
  plugin: PluginStatus
  /** The live list, for the dependency section. */
  plugins: PluginStatus[]
  /** Other entries of the same package exist, so deleting this one keeps the plugin listed. */
  removable: boolean
  onClose: () => void
}

const PluginConfigDialog: React.FC<PluginConfigDialogProps> = ({ plugin, plugins, removable, onClose }) => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [node, setNode] = useState<SchemaNode | null>(null)
  const [defaults, setDefaults] = useState<unknown>({})
  const [value, setValue] = useState<unknown>(undefined)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const Icon = pluginIcon(plugin)

  useEffect(() => {
    describePlugin(plugin.id)
      .then(({ schema, defaults, config }) => {
        const root = schema ? hydrate(schema) : null
        setNode(root)
        setDefaults(defaults)
        setValue(root ? withDefaults(config, defaults) : config ?? undefined)
      })
      .catch(e => setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [plugin.id])

  // No schema and no Config export: nothing to configure. A non-schemastery Config gets the JSON editor.
  const configurable = node !== null || plugin.hasConfig !== false

  const save = async () => {
    setSaving(true)
    setErrors({})
    try {
      await savePluginConfig(plugin.id, node ? stripDefaults(value, defaults) : value)
      showToast('配置已保存，插件已按新配置重启', 'success')
      onClose()
    } catch (e) {
      if (e instanceof ConfigRejectedError) {
        setErrors(Object.fromEntries(e.issues.map(issue => [issue.path.join('.'), issue.message])))
        showToast('有配置项没通过校验', 'error')
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
            {loading && <div className="flex justify-center py-10"><Loader2 size={32} className="animate-spin text-pink-500" /></div>}
            {!loading && loadError && <p className="text-sm text-red-500">加载配置失败：{loadError}</p>}
            {!loading && !loadError && !configurable && <p className="text-sm text-theme-secondary text-center py-6">这个插件没有可配置项</p>}
            {!loading && !loadError && configurable && (
              <div className="space-y-5">
                {errors[''] && <p className="text-sm text-red-500">{errors['']}</p>}
                {node
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
                <button onClick={save} disabled={loading || saving} className="btn-primary flex items-center gap-2">
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
