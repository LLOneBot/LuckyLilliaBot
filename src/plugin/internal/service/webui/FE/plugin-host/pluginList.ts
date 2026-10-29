import { create } from 'zustand'
import { PluginStatus, UiPrefs } from '../types/plugins'
import { getUiPrefs, listPlugins, openPluginStream } from '../utils/pluginApi'
import { NO_PREFS } from './registry'

interface PluginListState {
  /** null until the first fetch completes. */
  plugins: PluginStatus[] | null
  /** What the user hid, reordered and approved. */
  prefs: UiPrefs
  refresh(): Promise<void>
}

/** The plugin list, shared by the plugin page, the sidebar and the plugin UI host. */
export const usePluginList = create<PluginListState>(set => ({
  plugins: null,
  prefs: NO_PREFS,
  async refresh() {
    set({ plugins: await listPlugins() })
  },
}))

/** Keeps the list current through the plugin status stream; returns the function closing it. */
export function followPluginList(): () => void {
  // Together, so that nothing the user hid shows for a moment; an unreadable list must not keep everything waiting
  Promise.all([listPlugins(), getUiPrefs().catch(() => NO_PREFS)])
    .then(([plugins, prefs]) => usePluginList.setState({ plugins, prefs }))
    .catch(() => usePluginList.setState(state => ({ plugins: state.plugins ?? [] })))
  return openPluginStream((event) => {
    if (event.type === 'ui') {
      usePluginList.setState({ prefs: event.data })
      return
    }
    if (event.type === 'list') {
      usePluginList.getState().refresh().catch(() => {})
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
