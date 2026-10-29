import { create } from 'zustand'
import { PluginStatus } from '../types/plugins'
import { listPlugins, openPluginStream } from '../utils/pluginApi'

interface PluginListState {
  /** null until the first fetch completes. */
  plugins: PluginStatus[] | null
  refresh(): Promise<void>
}

/** The plugin list, shared by the plugin page, the sidebar and the plugin UI host. */
export const usePluginList = create<PluginListState>(set => ({
  plugins: null,
  async refresh() {
    set({ plugins: await listPlugins() })
  },
}))

/** Keeps the list current through the plugin status stream; returns the function closing it. */
export function followPluginList(): () => void {
  const { refresh } = usePluginList.getState()
  // An unreadable list must not keep everything waiting for it
  refresh().catch(() => usePluginList.setState(state => ({ plugins: state.plugins ?? [] })))
  return openPluginStream((event) => {
    if (event.type === 'list') {
      refresh().catch(() => {})
      return
    }
    if (event.data.manifest.hidden) return
    usePluginList.setState((state) => {
      if (!state.plugins) return state
      const plugins = [...state.plugins]
      const index = plugins.findIndex(plugin => plugin.id === event.data.id)
      if (index < 0) plugins.push(event.data)
      else plugins[index] = event.data
      return { plugins }
    })
  })
}
