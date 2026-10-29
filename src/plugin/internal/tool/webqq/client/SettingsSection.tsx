import React from 'react'
import { Eye, EyeOff, Maximize2 } from 'lucide-react'
import { useSettingsStore } from './stores/settingsStore'

/** In the WebUI settings dialog (the `settings.sections` slot): preferences of this browser, kept in its localStorage. */
const SettingsSection: React.FC = () => {
  const { autoHideSidebarInWebQQ, setAutoHideSidebarInWebQQ, showWebQQFullscreenButton, setShowWebQQFullscreenButton } = useSettingsStore()
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between p-4 bg-theme-item rounded-xl">
        <div className="flex items-center gap-3">
          {autoHideSidebarInWebQQ ? <EyeOff size={20} className="text-theme-muted" /> : <Eye size={20} className="text-theme-muted" />}
          <div>
            <div className="text-sm font-medium text-theme">进入 WebQQ 自动隐藏侧边栏</div>
            <div className="text-xs text-theme-muted mt-0.5">启用后进入 WebQQ 页面时自动收起侧边栏</div>
          </div>
        </div>
        <input
          type="checkbox"
          checked={autoHideSidebarInWebQQ}
          onChange={e => setAutoHideSidebarInWebQQ(e.target.checked)}
          className="switch-toggle"
        />
      </div>
      <div className="flex items-center justify-between p-4 bg-theme-item rounded-xl">
        <div className="flex items-center gap-3">
          <Maximize2 size={20} className="text-theme-muted" />
          <div>
            <div className="text-sm font-medium text-theme">显示全屏按钮</div>
            <div className="text-xs text-theme-muted mt-0.5">在 WebQQ 页面显示全屏按钮</div>
          </div>
        </div>
        <input
          type="checkbox"
          checked={showWebQQFullscreenButton}
          onChange={e => setShowWebQQFullscreenButton(e.target.checked)}
          className="switch-toggle"
        />
      </div>
    </div>
  )
}

export default SettingsSection
