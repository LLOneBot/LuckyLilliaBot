import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { usePluginList } from '../../plugin-host/pluginList'
import { pluginTitle } from './meta'

/** Settings on a tab do nothing while the builtin behind it is disabled on the plugin page; say so. */
const BuiltinDisabledNotice: React.FC<{ tab: string }> = ({ tab }) => {
  const plugin = usePluginList(state => state.plugins?.find(entry => entry.builtin && entry.settings === tab && entry.disabled))
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
