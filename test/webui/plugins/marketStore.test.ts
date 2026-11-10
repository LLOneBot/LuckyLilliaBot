import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WebUIContext } from '@luckylillia/plugin-sdk/webui'
import { MarketStore, type InstalledPackage, type UpdateInfo } from '@/plugin/internal/tool/market/client/store'

const interval = 10 * 60_000
const installed: InstalledPackage[] = [{ name: 'example', version: '1.0.0', managed: true, root: '/plugins/example' }]
const available = { example: { latest: '2.0.0', update: '2.0.0' } }
const pending = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

describe('market update state', () => {
  let store: MarketStore
  let api: ReturnType<typeof vi.fn>
  let disconnect: () => void

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-10T00:00:00Z'))
    api = vi.fn(async (path: string) => path.endsWith('/installed') ? installed : available)
    store = new MarketStore()
    disconnect = store.connect({ api } as unknown as WebUIContext)
  })

  afterEach(() => {
    disconnect()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const updateCalls = (api: ReturnType<typeof vi.fn>) => api.mock.calls.filter(([path]) => path.endsWith('/updates')).length

  it('checks once for shared subscribers and continues checking while the page stays open', async () => {
    const first = store.subscribe(() => {})
    const second = store.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(store.updates).toEqual(available)
    expect(updateCalls(api)).toBe(1)
    await vi.advanceTimersByTimeAsync(interval)
    expect(updateCalls(api)).toBe(2)
    first()
    await vi.advanceTimersByTimeAsync(interval)
    expect(updateCalls(api)).toBe(3)
    second()
    await vi.advanceTimersByTimeAsync(interval * 2)
    expect(updateCalls(api)).toBe(3)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('uses cached checks on focus, refreshes expired results and removes browser listeners', async () => {
    const browser = new EventTarget()
    const page = Object.assign(new EventTarget(), { visibilityState: 'visible' })
    vi.stubGlobal('window', browser)
    vi.stubGlobal('document', page)
    const unsubscribe = store.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    browser.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(updateCalls(api)).toBe(1)
    page.visibilityState = 'hidden'
    await vi.advanceTimersByTimeAsync(interval)
    expect(updateCalls(api)).toBe(1)
    page.visibilityState = 'visible'
    page.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(updateCalls(api)).toBe(2)
    unsubscribe()
    vi.setSystemTime(Date.now() + interval)
    browser.dispatchEvent(new Event('focus'))
    page.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(updateCalls(api)).toBe(2)
  })

  it('does not skip scheduled checks when the initial response takes longer than later requests', async () => {
    const response = pending<Record<string, UpdateInfo>>()
    api.mockImplementationOnce(async () => installed).mockImplementationOnce(() => response.promise)
    store.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(100)
    response.resolve(available)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(interval - 100)
    expect(updateCalls(api)).toBe(2)
  })

  it('deduplicates even forced checks and never checks during a package mutation', async () => {
    await store.loadInstalled()
    const response = pending<Record<string, UpdateInfo>>()
    api.mockImplementation(() => response.promise)
    const first = store.checkUpdates(true)
    await store.checkUpdates(true)
    expect(updateCalls(api)).toBe(1)
    response.resolve(available)
    await first
    store.busy.add('example')
    await store.checkUpdates(true)
    await store.refresh()
    expect(updateCalls(api)).toBe(1)
  })

  it('ignores an obsolete response after installing or removing a package', async () => {
    await store.loadInstalled()
    const response = pending<Record<string, UpdateInfo>>()
    api.mockImplementation(() => response.promise)
    const check = store.checkUpdates()
    store.invalidateUpdates()
    response.resolve(available)
    await check
    expect(store.updates).toBeNull()
    expect(store.checkedAt).toBe(0)
    expect(store.checking).toBe(false)
  })

  it('checks again within the cache interval when another session changed installed versions', async () => {
    await store.refresh(false)
    api.mockImplementation(async (path: string) => path.endsWith('/installed')
      ? [{ ...installed[0], version: '2.0.0' }]
      : { example: { latest: '2.0.0' } })
    await store.refresh(false)
    expect(updateCalls(api)).toBe(2)
    expect(store.updates).toEqual({ example: { latest: '2.0.0' } })
  })

  it('preserves a failed installed list and prevents update checks until retry succeeds', async () => {
    await store.refresh()
    api.mockRejectedValue(new Error('offline'))
    await store.refresh()
    expect(store.installed).toEqual(installed)
    expect(store.installedError).toBe('offline')
    expect(updateCalls(api)).toBe(1)
    await store.checkUpdates(true)
    expect(updateCalls(api)).toBe(1)
    api.mockImplementation(async (path: string) => path.endsWith('/installed') ? installed : available)
    await store.refresh()
    expect(store.installedError).toBe('')
    expect(updateCalls(api)).toBe(2)
  })

  it('clears failed update checks and allows an immediate retry', async () => {
    await store.refresh()
    api.mockRejectedValueOnce(new Error('registry unavailable'))
    await store.checkUpdates(true)
    expect(store.updates).toBeNull()
    expect(store.updatesError).toBe('registry unavailable')
    expect(store.checkedAt).toBe(0)
    await store.checkUpdates()
    expect(store.updates).toEqual(available)
    expect(store.updatesError).toBe('')
  })

  it('discards requests from the old plugin context when its source settings reload', async () => {
    await store.loadInstalled()
    const response = pending<Record<string, UpdateInfo>>()
    api.mockImplementation(() => response.promise)
    const oldCheck = store.checkUpdates()
    const newApi = vi.fn(async (path: string) => path.endsWith('/installed') ? installed : {})
    const oldDisconnect = disconnect
    disconnect = store.connect({ api: newApi } as unknown as WebUIContext)
    await store.refresh()
    response.resolve(available)
    await oldCheck
    oldDisconnect()
    expect(store.ctx?.api).toBe(newApi)
    expect(store.updates).toEqual({})
  })
})
