import React from 'react'
import { ShieldAlert } from 'lucide-react'
import { Portal } from '../common'
import { PluginStatus } from '../../types/plugins'
import { pluginTitle, SERVICE_LABEL } from './meta'

interface TrustDialogProps {
  plugin: PluginStatus
  onConfirm: () => void
  onCancel: () => void
}

/** Asked before a third-party package first runs: its code has the bot's rights. */
const TrustDialog: React.FC<TrustDialogProps> = ({ plugin, onConfirm, onCancel }) => {
  const services = plugin.service?.required ?? []
  return (
    <Portal>
      <div className="fixed inset-0 scrim flex items-center justify-center p-4" style={{ zIndex: 9000 }} onClick={onCancel}>
        <div className="glass glass-thick r-window glass-pop w-full max-w-md" onClick={e => e.stopPropagation()}>
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0">
                <ShieldAlert size={20} />
              </div>
              <h3 className="text-lg font-semibold text-theme">启用第三方插件「{pluginTitle(plugin)}」？</h3>
            </div>
            <p className="text-sm text-theme-secondary">
              第三方插件的代码在 Bot 进程里运行，和 Bot 有一样的权限：能收发所有账号的消息，读写配置和文件，访问网络。只启用你信任的插件。
            </p>
            {services.length > 0 && (
              <p className="text-sm text-theme-secondary">
                它要用到：{services.map(service => (SERVICE_LABEL[service] ? `${SERVICE_LABEL[service]}（${service}）` : service)).join('、')}
              </p>
            )}
            <p className="text-xs text-theme-muted">
              {plugin.name}{plugin.version ? ` · v${plugin.version}` : ''}。同意一次之后，这个插件就不再询问。
            </p>
          </div>
          <div className="flex justify-end gap-3 p-6 hairline-t">
            <button type="button" onClick={onCancel} className="px-6 py-2.5 text-theme-secondary hover:bg-theme-item rounded-xl font-medium transition-colors">取消</button>
            <button type="button" onClick={onConfirm} className="btn-primary">我信任它，启用</button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

export default TrustDialog
