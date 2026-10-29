import React from 'react'
import { Moon, Sun, Circle } from 'lucide-react'
import { useThemeStore } from '../../stores/themeStore'

const ThemeToggle: React.FC = () => {
  const { mode, cycleMode } = useThemeStore()

  const getIcon = () => {
    switch (mode) {
      case 'light':
        return <Sun size={18} />
      case 'dark':
        return <Moon size={18} />
      case 'auto':
        // 半填充圆形表示自动模式
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor" />
          </svg>
        )
    }
  }

  const getTitle = () => {
    switch (mode) {
      case 'light':
        return '亮色模式'
      case 'dark':
        return '暗色模式'
      case 'auto':
        return '自动主题 (跟随系统)'
    }
  }

  return (
    <button
      onClick={cycleMode}
      className="p-2 rounded-lg transition-all duration-200
        text-theme-muted
        hover:bg-theme-item
        hover:text-theme"
      title={getTitle()}
    >
      {getIcon()}
    </button>
  )
}

export default ThemeToggle
