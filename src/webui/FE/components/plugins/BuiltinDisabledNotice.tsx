import React, { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { PluginStatus } from '../../types/plugins'
import { listPlugins } from '../../utils/pluginApi'
import { pluginTitle } from './meta'

/** Settings on a tab do nothing while the builtin behind it is disabled on the plugin page; say so. */
const BuiltinDisabledNotice: React.FC<{ tab: string }> = ({ tab }) => {
  const [plugin, setPlugin] = useState<PluginStatus>()

  useEffect(() => {
    let alive = true
    setPlugin(undefined)
    listPlugins()
      .then(list => alive && setPlugin(list.find(plugin => plugin.builtin && plugin.settings === tab && plugin.disabled)))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [tab])

  if (!plugin) return null
  return (
    <div className="card p-4 mb-6 flex items-center gap-3 border border-amber-300/60 dark:border-amber-500/40">
      <AlertTriangle size={20} className="text-amber-500 flex-shrink-0" />
      <p className="flex-1 text-sm text-theme-secondary">
        「{pluginTitle(plugin)}」已在插件页停用，这里的设置要等它启用后才会生效
      </p>
      <button type="button" onClick={() => { window.location.hash = 'plugins' }} className="btn-glass text-sm flex-shrink-0">
        前往插件页
      </button>
    </div>
  )
}

export default BuiltinDisabledNotice
