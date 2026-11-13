import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { followPluginList, usePluginList } from '@/plugin/internal/service/webui/FE/plugin-host/pluginList'
import { TrustRequiredError } from '@/plugin/internal/service/webui/FE/utils/pluginApi'
import type { PluginStatus } from '@/plugin/internal/service/webui/FE/types/plugins'

vi.mock('@/plugin/internal/service/webui/FE/components/common', () => ({ showToast: vi.fn() }))
vi.mock('@/plugin/internal/service/webui/FE/utils/cookie', () => ({ getCookie: () => null }))

const initial: PluginStatus = {
  id: 'untrusted', name: 'test-plugin', disabled: true, trusted: false, state: 'disposed',
  manifest: {}, missingDeps: [], reloadCount: 0,
  service: { required: [], optional: [], implements: [] },
}
const fetchMock = vi.fn<typeof fetch>()
const result = (data: unknown) => Response.json({ success: true, data })

beforeEach(() => {
  fetchMock.mockReset()
  usePluginList.setState({ plugins: [initial] })
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

class PluginEventSource extends EventTarget {
  static instances: PluginEventSource[] = []
  closed = false
  constructor(readonly url: string) { super(); PluginEventSource.instances.push(this) }
  close() { this.closed = true }
  emit(type: string, data: unknown = {}) {
    this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }))
  }
}

const flush = () => new Promise<void>(resolve => setImmediate(resolve))
const pendingPlugin: PluginStatus = { ...initial, id: 'webqq', name: 'builtin:webqq', disabled: false, state: 'pending', missingDeps: ['app'] }
const activePlugin: PluginStatus = { ...pendingPlugin, state: 'active', missingDeps: [] }
const prefs = { hidden: [], order: {} }

describe('plugin HTTP snapshots and SSE ordering', () => {
  let lists: ReturnType<typeof Promise.withResolvers<Response>>[]
  let preferences: ReturnType<typeof Promise.withResolvers<Response>>[]
  let disposers: (() => void)[]
  const follow = () => {
    const stop = followPluginList()
    disposers.push(stop)
    return { source: PluginEventSource.instances.at(-1)!, stop }
  }

  beforeEach(() => {
    lists = []
    preferences = []
    disposers = []
    PluginEventSource.instances = []
    vi.stubGlobal('EventSource', PluginEventSource)
    usePluginList.setState({ plugins: null, prefs })
    fetchMock.mockImplementation(input => {
      const task = Promise.withResolvers<Response>()
      if (input === '/api/plugins') lists.push(task)
      else if (input === '/api/plugins/ui') preferences.push(task)
      else throw new Error(`unexpected request: ${input}`)
      return task.promise
    })
  })

  afterEach(() => { for (const stop of disposers) stop() })

  it('reloads on the first connection as well as reconnects to close the initial observation gap', async () => {
    const { source } = follow()
    lists[0].resolve(result([pendingPlugin]))
    preferences[0].resolve(result(prefs))
    await flush()
    expect(usePluginList.getState().plugins).toEqual([pendingPlugin])

    // QQ becomes online before the stream subscribes, so no changed frame was observed.
    source.emit('connected')
    expect(lists).toHaveLength(2)
    lists[1].resolve(result([activePlugin]))
    preferences[1].resolve(result(prefs))
    await flush()
    expect(usePluginList.getState().plugins).toEqual([activePlugin])
    source.emit('connected')
    expect(lists).toHaveLength(3)
    lists[2].resolve(result([activePlugin]))
    preferences[2].resolve(result(prefs))
    await flush()
  })

  it('retains a status received before initialization while the preferences request is still pending', async () => {
    const { source } = follow()
    lists[0].resolve(result([pendingPlugin]))
    await flush()
    source.emit('changed', { type: 'status', data: activePlugin })
    expect(usePluginList.getState().plugins).toBeNull()
    preferences[0].resolve(result(prefs))
    await flush()
    expect(usePluginList.getState().plugins).toEqual([activePlugin])
  })

  it('does not let an older refresh overwrite an SSE update after initialization', async () => {
    usePluginList.setState({ plugins: [pendingPlugin] })
    const { source } = follow()
    source.emit('changed', { type: 'status', data: activePlugin })
    expect(usePluginList.getState().plugins).toEqual([activePlugin])
    lists[0].resolve(result([pendingPlugin]))
    preferences[0].resolve(result(prefs))
    await flush()
    expect(usePluginList.getState().plugins).toEqual([activePlugin])
  })

  it('lets a newer removal snapshot omit earlier statuses and rejects older overlapping snapshots', async () => {
    const removed = { ...activePlugin, id: 'removed', name: 'third-party' }
    usePluginList.setState({ plugins: [pendingPlugin, removed] })
    const { source } = follow()
    source.emit('changed', { type: 'status', data: removed })
    source.emit('changed', { type: 'list' })
    lists[1].resolve(result([activePlugin]))
    await flush()
    expect(usePluginList.getState().plugins).toEqual([activePlugin])
    lists[0].resolve(result([pendingPlugin, removed]))
    preferences[0].resolve(result(prefs))
    await flush()
    expect(usePluginList.getState().plugins).toEqual([activePlugin])
  })

  it('merges a newly received entry, but permits a later authoritative snapshot to remove it', async () => {
    const added = { ...activePlugin, id: 'added', name: 'new-plugin' }
    usePluginList.setState({ plugins: [activePlugin] })
    const { source } = follow()
    source.emit('changed', { type: 'status', data: added })
    lists[0].resolve(result([activePlugin]))
    preferences[0].resolve(result(prefs))
    await flush()
    expect(usePluginList.getState().plugins).toEqual([activePlugin, added])
    const refreshing = usePluginList.getState().refresh()
    lists[1].resolve(result([activePlugin]))
    await refreshing
    expect(usePluginList.getState().plugins).toEqual([activePlugin])
  })

  it('keeps an entry hidden when an old snapshot still contains it', async () => {
    usePluginList.setState({ plugins: [activePlugin] })
    const { source } = follow()
    source.emit('changed', { type: 'status', data: { ...activePlugin, manifest: { hidden: true } } })
    lists[0].resolve(result([activePlugin]))
    preferences[0].resolve(result(prefs))
    await flush()
    expect(usePluginList.getState().plugins).toEqual([])
  })

  it('does not overwrite a newer preference event with the reconnect snapshot', async () => {
    const { source } = follow()
    const changed = { hidden: ['webqq'], order: {} }
    source.emit('changed', { type: 'ui', data: changed })
    lists[0].resolve(result([activePlugin]))
    preferences[0].resolve(result(prefs))
    await flush()
    expect(usePluginList.getState().prefs).toEqual(changed)
  })

  it('still applies reconnect preferences when a newer list-only refresh supersedes its plugin list', async () => {
    usePluginList.setState({ plugins: [activePlugin] })
    follow()
    const changed = { hidden: ['webqq'], order: {} }
    const refreshing = usePluginList.getState().refresh()
    lists[1].resolve(result([activePlugin]))
    await refreshing
    lists[0].resolve(result([pendingPlugin]))
    preferences[0].resolve(result(changed))
    await flush()
    expect(usePluginList.getState().plugins).toEqual([activePlugin])
    expect(usePluginList.getState().prefs).toEqual(changed)
  })

  it('ignores an old subscription response or callback after disposal and remount', async () => {
    const first = follow()
    first.stop()
    expect(first.source.closed).toBe(true)
    follow()
    lists[1].resolve(result([activePlugin]))
    preferences[1].resolve(result(prefs))
    await flush()
    first.source.emit('changed', { type: 'status', data: pendingPlugin })
    lists[0].resolve(result([pendingPlugin]))
    preferences[0].resolve(result({ hidden: ['webqq'], order: {} }))
    await flush()
    expect(usePluginList.getState().plugins).toEqual([activePlugin])
    expect(usePluginList.getState().prefs).toEqual(prefs)
  })

  it('preserves the immediate enable response against an in-flight list without requiring SSE', async () => {
    usePluginList.setState({ plugins: [initial] })
    follow()
    const enabled = { ...initial, disabled: false, trusted: true, state: 'active' as const }
    fetchMock.mockResolvedValueOnce(result(enabled))
    await usePluginList.getState().setEnabled(initial.id, true, true)
    expect(usePluginList.getState().plugins).toEqual([enabled])
    lists[0].resolve(result([initial]))
    preferences[0].resolve(result(prefs))
    await flush()
    expect(usePluginList.getState().plugins).toEqual([enabled])
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('plugin enable response synchronisation', () => {
  it('keeps the entry off on 428, then reflects confirmed trust without any status stream', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ success: false, message: 'trust required' }, { status: 428 }))
    await expect(usePluginList.getState().setEnabled(initial.id, true)).rejects.toBeInstanceOf(TrustRequiredError)
    expect(usePluginList.getState().plugins).toEqual([initial])

    const active = { ...initial, trusted: true, disabled: false, state: 'active' as const }
    fetchMock.mockResolvedValueOnce(result(active))
    await expect(usePluginList.getState().setEnabled(initial.id, true, true)).resolves.toEqual(active)
    expect(fetchMock).toHaveBeenLastCalledWith('/api/plugins/untrusted/enable', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ trust: true }),
    }))
    expect(usePluginList.getState().plugins).toEqual([active])
  })

  it('reflects disable responses while preserving the other instance of the package', async () => {
    const active = { ...initial, disabled: false, trusted: true, state: 'active' as const }
    const other = { ...active, id: 'another-instance' }
    usePluginList.setState({ plugins: [active, other] })
    const disabled = { ...active, disabled: true, state: 'disposed' as const }
    fetchMock.mockResolvedValueOnce(result(disabled))
    await usePluginList.getState().setEnabled(initial.id, false)
    expect(usePluginList.getState().plugins).toEqual([disabled, other])
    expect(fetchMock).toHaveBeenLastCalledWith('/api/plugins/untrusted/disable', expect.objectContaining({ method: 'POST' }))
  })

  it('preserves the last status when the enable request fails', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ success: false, message: 'enable failed' }, { status: 500 }))
    await expect(usePluginList.getState().setEnabled(initial.id, true, true)).rejects.toThrow('enable failed')
    expect(usePluginList.getState().plugins).toEqual([initial])
  })

  it('uses the returned runtime error instead of claiming the plugin is running', async () => {
    const failed = { ...initial, disabled: false, trusted: true, state: 'failed' as const, error: 'startup failed' }
    fetchMock.mockResolvedValueOnce(result(failed))
    await usePluginList.getState().setEnabled(initial.id, true, true)
    expect(usePluginList.getState().plugins).toEqual([failed])
  })
})
