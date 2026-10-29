import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ThemeMode = 'light' | 'dark' | 'auto'

interface ThemeState {
  mode: ThemeMode
  isDark: boolean // 解析 auto 之后的结果
  setMode: (mode: ThemeMode) => void
  cycleMode: () => void
}

const getSystemTheme = (): boolean => {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

const resolveTheme = (mode: ThemeMode): boolean => {
  if (mode === 'auto') {
    return getSystemTheme()
  }
  return mode === 'dark'
}

const applyTheme = (isDark: boolean) => {
  if (isDark) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'auto',
      isDark: getSystemTheme(),
      setMode: (mode: ThemeMode) => {
        const isDark = resolveTheme(mode)
        applyTheme(isDark)
        set({ mode, isDark })
      },
      cycleMode: () => {
        const currentMode = get().mode
        const nextMode: ThemeMode =
          currentMode === 'light' ? 'dark' :
          currentMode === 'dark' ? 'auto' : 'light'
        const isDark = resolveTheme(nextMode)
        applyTheme(isDark)
        set({ mode: nextMode, isDark })
      },
    }),
    {
      name: 'llbot-theme',
      partialize: (state) => ({ mode: state.mode }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const isDark = resolveTheme(state.mode)
          applyTheme(isDark)
          state.isDark = isDark
        }
      },
    }
  )
)

if (typeof window !== 'undefined') {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', (e) => {
    const state = useThemeStore.getState()
    if (state.mode === 'auto') {
      applyTheme(e.matches)
      useThemeStore.setState({ isDark: e.matches })
    }
  })
}
