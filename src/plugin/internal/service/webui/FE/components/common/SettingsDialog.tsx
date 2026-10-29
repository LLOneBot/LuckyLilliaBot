import React from 'react'
import { X, Sun, Moon, Monitor, LogOut } from 'lucide-react'
import { useThemeStore } from '../../stores/themeStore'
import { SlotOutlet } from '../../plugin-host/views'

interface SettingsDialogProps {
  visible: boolean
  onClose: () => void
  onLogout?: () => void
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({ visible, onClose, onLogout }) => {
  const { mode, setMode } = useThemeStore()
  const [showLogoutConfirm, setShowLogoutConfirm] = React.useState(false)

  if (!visible) return null

  const themeOptions = [
    { value: 'light' as const, label: '亮色', icon: Sun },
    { value: 'dark' as const, label: '暗色', icon: Moon },
    { value: 'auto' as const, label: '跟随系统', icon: Monitor },
  ]

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 scrim" onClick={onClose} />
      
      <div className="relative glass glass-thick r-window glass-pop w-full max-w-md mx-4 overflow-hidden">
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

          {/* Plugins' preferences for this browser, e.g. WebQQ's */}
          <SlotOutlet
            name="settings.sections"
            wrap={(element, contribution) => (
              <section className="slot-frame">
                <label className="block text-sm font-medium text-theme-secondary mb-3">{String(contribution.options.title ?? '')}</label>
                <div className="slot-body">{element}</div>
              </section>
            )}
          />
        </div>

        {/* Footer */}
        <div className="flex justify-between gap-3 p-6 border-t border-theme-divider">
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-theme-muted hover:bg-theme-item rounded-xl transition-colors font-medium"
          >
            <LogOut size={18} />
            退出 WebUI
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-theme-item hover:bg-theme-item-hover text-theme rounded-xl transition-colors font-medium"
          >
            关闭
          </button>
        </div>
      </div>

      {/* Logout Confirm Dialog */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center">
          <div className="absolute inset-0 scrim" onClick={() => setShowLogoutConfirm(false)} />
          <div className="relative glass glass-thick r-panel glass-pop w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-semibold text-theme mb-2">确认退出</h3>
            <p className="text-sm text-theme-secondary mb-6">
              确定要退出 WebUI 吗？这不会退出 QQ，仅清除 WebUI 登录状态。
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2 bg-theme-item hover:bg-theme-item-hover text-theme rounded-xl transition-colors font-medium"
              >
                取消
              </button>
              <button
                onClick={onLogout}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors font-medium"
              >
                确认退出
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SettingsDialog
