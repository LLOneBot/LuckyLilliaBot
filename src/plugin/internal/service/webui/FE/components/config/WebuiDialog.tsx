import React from 'react'
import { X } from 'lucide-react'
import Portal from '../common/Portal'
import { PluginStatus } from '../../types/plugins'
import { pluginTitle } from '../plugins/meta'
import PluginIcon from '../plugins/PluginIcon'
import WebuiSettings from './WebuiSettings'

/**
 * The gear of the WebUI's card: where it listens and its password. The theme and the sidebar are the shell's, in
 * the settings dialog only.
 */
const WebuiDialog: React.FC<{ plugin: PluginStatus; onClose(): void }> = ({ plugin, onClose }) => (
  <Portal>
    {/* A click outside does not close it, or a stray one would drop what was being edited */}
    <div className="fixed inset-0 scrim flex items-center justify-center p-4" style={{ zIndex: 9000 }}>
      <div className="glass glass-thick r-window glass-pop w-full max-w-md max-h-[85vh] flex flex-col" role="dialog" aria-modal="true" aria-labelledby="webui-dialog-title">
        <div className="flex items-center justify-between p-6 hairline-b">
          <div className="flex items-center gap-3 min-w-0">
            <PluginIcon plugin={plugin} className="w-10 h-10 rounded-xl" fill="gradient-primary-br text-white" size={20} />
            <h3 id="webui-dialog-title" className="text-lg font-semibold text-theme truncate">{pluginTitle(plugin)} 配置</h3>
          </div>
          <button type="button" title="关闭" onClick={onClose} className="text-theme-hint hover:text-theme"><X size={24} /></button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          <WebuiSettings />
        </div>
        <div className="flex justify-end p-6 hairline-t">
          <button type="button" onClick={onClose} className="px-6 py-2.5 text-theme-secondary hover:bg-theme-item rounded-xl font-medium transition-colors">关闭</button>
        </div>
      </div>
    </div>
  </Portal>
)

export default WebuiDialog
