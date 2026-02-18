import React from 'react'
import { X, Sun, Moon, Monitor, Eye, EyeOff } from 'lucide-react'
import { useThemeStore } from '../../stores/themeStore'
import { useSettingsStore } from '../../stores/settingsStore'

interface SettingsDialogProps {
  visible: boolean
  onClose: () => void
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({ visible, onClose }) => {
  const { mode, setMode } = useThemeStore()
  const { autoHideSidebarInWebQQ, setAutoHideSidebarInWebQQ, showWebQQFullscreenButton, setShowWebQQFullscreenButton } = useSettingsStore()

  if (!visible) return null

  const themeOptions = [
    { value: 'light' as const, label: '亮色', icon: Sun },
    { value: 'dark' as const, label: '暗色', icon: Moon },
    { value: 'auto' as const, label: '跟随系统', icon: Monitor },
  ]

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-theme-card rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-theme-divider">
          <h2 className="text-xl font-semibold text-theme">设置</h2>
          <button
            onClick={onClose}
            className="p-2 text-theme-muted hover:text-theme hover:bg-theme-item rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Theme Setting */}
          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-3">
              主题模式
            </label>
            <div className="grid grid-cols-3 gap-3">
              {themeOptions.map((option) => {
                const Icon = option.icon
                const isActive = mode === option.value
                return (
                  <button
                    key={option.value}
                    onClick={() => setMode(option.value)}
                    className={`
                      flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all
                      ${isActive
                        ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20'
                        : 'border-theme-divider hover:border-theme-muted hover:bg-theme-item'
                      }
                    `}
                  >
                    <Icon size={24} className={isActive ? 'text-pink-500' : 'text-theme-muted'} />
                    <span className={`text-sm font-medium ${isActive ? 'text-pink-500' : 'text-theme'}`}>
                      {option.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Auto Hide Sidebar */}
          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-3">
              WebQQ 设置
            </label>
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
                  onChange={(e) => setAutoHideSidebarInWebQQ(e.target.checked)}
                  className="switch-toggle"
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-theme-item rounded-xl">
                <div className="flex items-center gap-3">
                  <Eye size={20} className="text-theme-muted" />
                  <div>
                    <div className="text-sm font-medium text-theme">显示全屏按钮</div>
                    <div className="text-xs text-theme-muted mt-0.5">在 WebQQ 页面右下角显示全屏按钮</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={showWebQQFullscreenButton}
                  onChange={(e) => setShowWebQQFullscreenButton(e.target.checked)}
                  className="switch-toggle"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-theme-divider">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-theme-item hover:bg-theme-item-hover text-theme rounded-xl transition-colors font-medium"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsDialog
