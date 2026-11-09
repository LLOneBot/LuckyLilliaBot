import React, { useEffect, useState } from 'react'
import { Globe, LogOut, Monitor, Moon, Settings, Sun } from 'lucide-react'
import Portal from '../components/common/Portal'
import SidebarSettings from '../components/config/SidebarSettings'
import WebuiSettings from '../components/config/WebuiSettings'
import { useThemeStore } from '../stores/themeStore'
import { tokenCookieName } from '../utils/api'
import { deleteCookie } from '../utils/cookie'

const themeOptions = [
  { value: 'light' as const, label: '亮色', icon: Sun },
  { value: 'dark' as const, label: '暗色', icon: Moon },
  { value: 'auto' as const, label: '跟随系统', icon: Monitor },
]

/** The settings page of builtin:webui, including the appearance of its shell. */
const WebuiPage: React.FC = () => {
  const { mode, setMode } = useThemeStore()
  const [confirmLogout, setConfirmLogout] = useState(false)

  useEffect(() => {
    if (!confirmLogout) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfirmLogout(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmLogout])

  const logout = () => {
    deleteCookie(tokenCookieName())
    window.location.reload()
  }

  return (
    <div className="space-y-6">
      <div className="card p-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-4 flex-1 min-w-[200px]">
          <div className="w-12 h-12 rounded-xl gradient-primary-br flex items-center justify-center flex-shrink-0">
            <Settings size={24} className="text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-theme">页面设置</h2>
            <p className="text-sm text-theme-secondary">网页界面的外观、侧边栏和访问设置</p>
          </div>
        </div>
        <button type="button" onClick={() => setConfirmLogout(true)} className="btn-glass ml-auto flex items-center gap-2 text-sm">
          <LogOut size={18} />退出 WebUI
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="flex flex-col gap-6">
          <section className="card p-6" aria-labelledby="webui-theme-heading">
            <h3 id="webui-theme-heading" className="text-base font-semibold text-theme mb-4">主题模式</h3>
            <div className="grid grid-cols-3 gap-3">
              {themeOptions.map(({ value, label, icon: Icon }) => {
                const selected = mode === value
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setMode(value)}
                    className={`flex flex-col items-center gap-2 px-2 py-4 rounded-xl border-2 transition-colors ${selected
                      ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20'
                      : 'border-theme-divider hover:border-theme-muted hover:bg-theme-item'}`}
                  >
                    <Icon size={24} className={selected ? 'text-pink-500' : 'text-theme-muted'} />
                    <span className={`text-sm font-medium whitespace-nowrap ${selected ? 'text-pink-500' : 'text-theme'}`}>{label}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="card p-6 flex-1" aria-labelledby="webui-sidebar-heading">
            <h3 id="webui-sidebar-heading" className="text-base font-semibold text-theme mb-4">侧边栏</h3>
            <SidebarSettings />
          </section>
        </div>

        <section className="card p-6" aria-labelledby="webui-access-heading">
          <h3 id="webui-access-heading" className="flex items-center gap-2 text-base font-semibold text-theme mb-4">
            <Globe size={18} className="text-theme-muted" />访问设置
          </h3>
          <WebuiSettings />
        </section>
      </div>

      {confirmLogout && (
        <Portal>
          <div className="fixed inset-0 z-[10000] flex items-center justify-center">
            <div className="absolute inset-0 scrim" onClick={() => setConfirmLogout(false)} />
            <div className="relative glass glass-thick r-panel glass-pop w-full max-w-sm mx-4 p-6" role="dialog" aria-modal="true" aria-labelledby="webui-logout-heading">
              <h3 id="webui-logout-heading" className="text-lg font-semibold text-theme mb-2">确认退出</h3>
              <p className="text-sm text-theme-secondary mb-6">确定要退出 WebUI 吗？这不会退出 QQ，仅清除 WebUI 登录状态。</p>
              <div className="flex justify-end gap-3">
                <button type="button" autoFocus onClick={() => setConfirmLogout(false)} className="btn-glass px-4 py-2">取消</button>
                <button type="button" onClick={logout} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors font-medium">确认退出</button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  )
}

export default WebuiPage
