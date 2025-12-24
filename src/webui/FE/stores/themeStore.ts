import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ThemeState {
  isDark: boolean
  toggleTheme: () => void
  setTheme: (isDark: boolean) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      isDark: false,
      toggleTheme: () => set((state) => {
        const newIsDark = !state.isDark
        // 更新 document class
        if (newIsDark) {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
        return { isDark: newIsDark }
      }),
      setTheme: (isDark: boolean) => set(() => {
        if (isDark) {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
        return { isDark }
      }),
    }),
    {
      name: 'llbot-theme',
      onRehydrateStorage: () => (state) => {
        // 恢复时同步 DOM class
        if (state?.isDark) {
          document.documentElement.classList.add('dark')
        }
      },
    }
  )
)
