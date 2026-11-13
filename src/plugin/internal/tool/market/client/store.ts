import type { PluginCatalogItem, PluginInstalledPackage, PluginUpdateInfo, WebUIContext } from '@luckylillia/plugin-sdk/webui'
import { imageUrl, previewImages, type CatalogScreenshot } from '../images'

export type InstalledPackage = PluginInstalledPackage
export type UpdateInfo = PluginUpdateInfo

interface CatalogItem extends Omit<PluginCatalogItem, 'iconUrl' | 'screenshots' | 'load'> {
  icon?: string
  screenshots?: readonly CatalogScreenshot[]
}

const UPDATE_CHECK_INTERVAL = 10 * 60_000
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)
const fingerprint = (packages: InstalledPackage[] | null) => JSON.stringify(
  packages?.map(pkg => [pkg.name, pkg.version, pkg.managed, pkg.activeVersion]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
)

/** The catalog bridge and local installation panel share one mutation and update state. */
export class MarketStore {
  ctx?: WebUIContext
  catalog: PluginCatalogItem[] | null = null
  catalogError = ''
  loadingCatalog = false
  installed: InstalledPackage[] | null = null
  installedError = ''
  loadingInstalled = false
  updates: Record<string, UpdateInfo> | null = null
  updatesError = ''
  checking = false
  checkedAt = 0
  busy = new Set<string>()
  version = 0
  private listeners = new Set<() => void>()
  private installedRequest = 0
  private catalogRequest = 0
  private updateRequest = 0
  private stopWatching?: () => void

  connect(ctx: WebUIContext): () => void {
    this.reset()
    this.ctx = ctx
    if (this.listeners.size) this.watch()
    this.emit()
    return () => {
      if (this.ctx !== ctx) return
      this.reset()
      this.emit()
    }
  }

  private reset() {
    this.stopWatching?.()
    this.stopWatching = undefined
    this.ctx = undefined
    this.catalogRequest++
    this.catalog = null
    this.catalogError = ''
    this.loadingCatalog = false
    this.installedRequest++
    this.installed = null
    this.installedError = ''
    this.loadingInstalled = false
    this.busy.clear()
    this.invalidateUpdates()
  }

  async loadCatalog(force = false): Promise<void> {
    if (!this.ctx || this.loadingCatalog || !force && (this.catalog !== null || this.catalogError)) return
    const request = ++this.catalogRequest
    this.loadingCatalog = true
    this.catalogError = ''
    this.emit()
    try {
      const items = await this.ctx.api<CatalogItem[]>('/api/market/catalog')
      if (request !== this.catalogRequest) return
      this.catalog = items.map(item => ({
        name: item.name, title: item.title, version: item.version, description: item.description,
        category: item.category, author: item.author, repository: item.repository, builtin: item.builtin,
        iconUrl: imageUrl(item, item.icon), screenshots: previewImages(item),
      }))
    } catch (error) {
      if (request === this.catalogRequest) {
        this.catalog = null
        this.catalogError = errorText(error)
      }
    } finally {
      if (request === this.catalogRequest) {
        this.loadingCatalog = false
        this.emit()
      }
    }
  }

  emit = () => {
    this.version++
    for (const listener of this.listeners) listener()
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    if (this.listeners.size === 1 && this.ctx) this.watch()
    return () => {
      this.listeners.delete(listener)
      if (!this.listeners.size) {
        this.stopWatching?.()
        this.stopWatching = undefined
      }
    }
  }

  private watch() {
    this.stopWatching?.()
    // Browser timers pause in background tabs; focus/visibility also refresh an expired check.
    const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'
    const refresh = () => {
      if (visible()) void this.refresh(false)
    }
    // Scheduled checks use their start cadence; response latency must not skip every other tick.
    const timer = setInterval(() => { if (visible()) void this.refresh(true) }, UPDATE_CHECK_INTERVAL)
    if (typeof window !== 'undefined') window.addEventListener('focus', refresh)
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', refresh)
    this.stopWatching = () => {
      clearInterval(timer)
      if (typeof window !== 'undefined') window.removeEventListener('focus', refresh)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', refresh)
    }
    refresh()
  }

  async loadInstalled(): Promise<boolean> {
    if (!this.ctx) return false
    const request = ++this.installedRequest
    this.loadingInstalled = true
    this.emit()
    try {
      const installed = await this.ctx.api<InstalledPackage[]>('/api/market/installed')
      if (request !== this.installedRequest) return false
      if (fingerprint(installed) !== fingerprint(this.installed)) this.invalidateUpdates()
      this.installed = installed
      this.installedError = ''
      return true
    } catch (error) {
      if (request === this.installedRequest) this.installedError = errorText(error)
      return false
    } finally {
      if (request === this.installedRequest) {
        this.loadingInstalled = false
        this.emit()
      }
    }
  }

  async checkUpdates(force = false): Promise<void> {
    if (!this.ctx || this.busy.size || this.checking || !this.installed || this.installedError) return
    if (!force && this.checkedAt > 0 && Date.now() - this.checkedAt < UPDATE_CHECK_INTERVAL) return
    const request = ++this.updateRequest
    this.checking = true
    this.updatesError = ''
    this.emit()
    try {
      const updates = await this.ctx.api<Record<string, UpdateInfo>>('/api/market/updates')
      if (request === this.updateRequest) {
        this.updates = updates
        this.checkedAt = Date.now()
      }
    } catch (error) {
      if (request === this.updateRequest) {
        this.updates = null
        this.checkedAt = 0
        this.updatesError = errorText(error)
      }
    } finally {
      if (request === this.updateRequest) {
        this.checking = false
        this.emit()
      }
    }
  }

  invalidateUpdates() {
    // Ignore checks in flight when any install, uninstall or scanned version changes dependencies.
    this.updateRequest++
    this.updates = null
    this.checkedAt = 0
    this.checking = false
    this.updatesError = ''
  }

  async refresh(force = true): Promise<void> {
    if (this.busy.size || this.loadingInstalled) return
    const ctx = this.ctx
    if (await this.loadInstalled() && this.ctx === ctx) await this.checkUpdates(force)
  }
}
