import { create } from 'zustand'

interface LayoutState {
  /** The tab shown, as App keeps it */
  activeTab: string
  sidebarCollapsed: boolean
  setSidebarCollapsed(collapsed: boolean): void
}

/** The shell layout, shared with plugin pages through the SDK (useSidebar, StatusNotice). */
export const useLayout = create<LayoutState>(set => ({
  activeTab: '',
  sidebarCollapsed: false,
  setSidebarCollapsed: collapsed => set({ sidebarCollapsed: collapsed }),
}))
