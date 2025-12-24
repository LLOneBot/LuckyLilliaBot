import React from 'react'
import { Moon, Sun } from 'lucide-react'
import { useThemeStore } from '../stores/themeStore'

const ThemeToggle: React.FC = () => {
  const { isDark, toggleTheme } = useThemeStore()

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg transition-all duration-200
        text-gray-500 dark:text-neutral-400
        hover:bg-gray-100 dark:hover:bg-neutral-800
        hover:text-gray-700 dark:hover:text-neutral-200"
      title={isDark ? '切换到亮色模式' : '切换到暗黑模式'}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}

export default ThemeToggle
