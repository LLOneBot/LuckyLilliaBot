import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsState {
  autoHideSidebarInWebQQ: boolean
  showWebQQFullscreenButton: boolean
  setAutoHideSidebarInWebQQ: (value: boolean) => void
  setShowWebQQFullscreenButton: (value: boolean) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      autoHideSidebarInWebQQ: false,
      showWebQQFullscreenButton: true,
      setAutoHideSidebarInWebQQ: (value: boolean) => set({ autoHideSidebarInWebQQ: value }),
      setShowWebQQFullscreenButton: (value: boolean) => set({ showWebQQFullscreenButton: value }),
    }),
    {
      name: 'llbot-settings',
    }
  )
)
