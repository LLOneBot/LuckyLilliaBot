import { create } from 'zustand'
import { PluginStatus, UiPrefs } from '../types/plugins'
import { getUiPrefs, listPlugins, openPluginStream, setPluginEnabled } from '../utils/pluginApi'
import { NO_PREFS } from './registry'

interface PluginListState {
  /** null until the first fetch completes. */
  plugins: PluginStatus[] | null
  /** What the user hid and reordered. */
  prefs: UiPrefs
  refresh(): Promise<void>
  setEnabled(id: string, enabled: boolean, trust?: boolean): Promise<PluginStatus>
}

let streamGeneration = 0
let listRequest = 0
let prefsRequest = 0
let statusRevision = 0
let prefsRevision = 0
const statusChanges = new Map<string, { revision: number; status: PluginStatus }>()

function receiveStatus(state: PluginListState, status: PluginStatus) {
  // Keep events received before the initial snapshot, or while an older HTTP read is in flight.
  statusChanges.set(status.id, { revision: ++statusRevision, status })
  if (!state.plugins) return state
  if (status.manifest.hidden) return { plugins: state.plugins.filter(plugin => plugin.id !== status.id) }
  const plugins = [...state.plugins]
  const index = plugins.findIndex(plugin => plugin.id === status.id)
  if (index < 0) plugins.push(status)
  else plugins[index] = status
  return { plugins }
}

async function loadSnapshot(withPrefs = usePluginList.getState().plugins === null): Promise<void> {
  const generation = streamGeneration
  const request = ++listRequest
  const after = statusRevision
  const preferencesRequest = withPrefs ? ++prefsRequest : undefined
  const preferencesRevision = prefsRevision
  try {
    const [plugins, prefs] = await Promise.all([
      listPlugins(),
      withPrefs ? getUiPrefs().catch(() => undefined) : undefined,
    ])
    if (generation !== streamGeneration) return
    const patch: Partial<PluginListState> = {}
    if (request === listRequest) {
      // Only replay events newer than this request. Merging the whole current store would
      // resurrect entries which the authoritative list now omits after uninstall.
      const merged = new Map(plugins.map(plugin => [plugin.id, plugin]))
      for (const { revision, status } of statusChanges.values()) {
        if (revision <= after) continue
        if (status.manifest.hidden) merged.delete(status.id)
        else merged.set(status.id, status)
      }
      patch.plugins = [...merged.values()]
      statusChanges.clear()
    }
    // A newer list-only refresh must not drop a reconnect's preference refresh; a newer
    // preference event/read, however, always wins over its older HTTP response.
    if (prefs && preferencesRequest === prefsRequest && preferencesRevision === prefsRevision) patch.prefs = prefs
    if (patch.plugins || patch.prefs) usePluginList.setState(patch)
  } catch (error) {
    if (generation === streamGeneration && request === listRequest) throw error
  }
}

/** The plugin list, shared by the plugin page, the sidebar and the plugin UI host. */
export const usePluginList = create<PluginListState>(set => ({
  plugins: null,
  prefs: NO_PREFS,
  refresh: () => loadSnapshot(),
  async setEnabled(id, enabled, trust = false) {
    const status = await setPluginEnabled(id, enabled, trust)
    // The request already carries the authoritative status; do not wait for an SSE connection to update the switch.
    set(state => receiveStatus(state, status))
    return status
  },
}))

/** Keeps the list current through the plugin status stream; returns the function closing it. */
export function followPluginList(): () => void {
  const generation = ++streamGeneration
  const current = () => generation === streamGeneration
  statusChanges.clear()
  // Together, so that nothing the user hid shows for a moment; an unreadable list must not keep everything waiting
  const load = () => loadSnapshot(true).catch(() => {
    if (current()) usePluginList.setState(state => ({ plugins: state.plugins ?? [] }))
  })
  void load()
  const close = openPluginStream((event) => {
    if (!current()) return
    if (event.type === 'ui') {
      prefsRevision++
      usePluginList.setState({ prefs: event.data })
      return
    }
    if (event.type === 'list') {
      usePluginList.getState().refresh().catch(() => {})
      return
    }
    usePluginList.setState(state => receiveStatus(state, event.data))
  }, () => {
    if (current()) void load()
  })
  return () => {
    close()
    if (current()) {
      streamGeneration++
      statusChanges.clear()
    }
  }
}
