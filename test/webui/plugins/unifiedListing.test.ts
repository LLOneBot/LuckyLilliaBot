import { describe, expect, it } from 'vitest'
import type { PluginCatalogItem, PluginCatalogState, PluginInstalledPackage } from '@luckylillia/plugin-sdk/webui'
import type { CatalogSource } from '@/plugin/internal/service/webui/FE/components/plugins/catalog'
import {
  filterPluginItems, isInstalled, itemBuiltin, itemCategory, itemName, mergePluginItems, type PluginFilters,
} from '@/plugin/internal/service/webui/FE/components/plugins/unifiedListing'
import type { PluginStatus } from '@/plugin/internal/service/webui/FE/types/plugins'

const filters: PluginFilters = { installation: 'all', category: 'all', status: 'all', origin: 'all', search: '', updatesOnly: false }

function plugin(name: string, overrides: Partial<PluginStatus> = {}): PluginStatus {
  return {
    id: name, name, version: '1.0.0', manifest: {}, disabled: false, state: 'active',
    missingDeps: [], reloadCount: 0, service: { required: [], optional: [], implements: [] }, ...overrides,
  }
}

function entry(name: string, overrides: Partial<PluginCatalogItem> = {}): PluginCatalogItem {
  return { name, title: name, version: '2.0.0', ...overrides }
}

function installed(name: string, overrides: Partial<PluginInstalledPackage> = {}): PluginInstalledPackage {
  return { name, version: '1.0.0', managed: true, root: `data/plugins/${name}`, ...overrides }
}

function source(overrides: Partial<PluginCatalogState> = {}, key = 'market'): CatalogSource {
  return {
    key,
    state: {
      items: null, installed: null, updates: null, loading: false, checking: false, loadingInstalled: false,
      checkedAt: 0, busy: [], retry() {}, refresh() {},
      async install() { return true }, async update() { return true }, async uninstall() { return true },
      ...overrides,
    },
  }
}

describe('unified plugin list', () => {
  it('shows local entries while catalog data is unavailable', () => {
    const local = plugin('local-only', { disabled: true, state: 'disposed' })
    for (const sources of [[], [source({ loading: true })], [source({ error: 'offline' })]]) {
      const items = mergePluginItems([local], sources)
      expect(items).toHaveLength(1)
      expect(items[0].plugin).toBe(local)
      expect(filterPluginItems(items, { ...filters, installation: 'installed' })).toEqual(items)
      expect(filterPluginItems(items, { ...filters, installation: 'uninstalled' })).toEqual([])
    }
  })

  it.each([true, false])('matches builtin package names without adding a second card (packageName=%s)', withPackageName => {
    const packageName = '@luckylillia/commands'
    const local = plugin('builtin:commands', { builtin: true, packageName: withPackageName ? packageName : undefined })
    const remote = entry(packageName, { builtin: local.name })
    const pkg = installed(packageName, { builtin: local.name })
    const market = source({ items: [remote], installed: [pkg], updates: { [packageName]: { update: '2.0.0' } } })
    const items = mergePluginItems([local], [market])
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ plugin: local, catalog: remote, packageStatus: pkg, updateInfo: { update: '2.0.0' } })
    expect(itemName(items[0])).toBe(packageName)
    expect(itemBuiltin(items[0])).toBe(true)
  })

  it('keeps separate local instances while sharing package metadata and update actions', () => {
    const first = plugin('multi', { id: 'a' })
    const second = plugin('multi', { id: 'b', disabled: true, state: 'disposed' })
    const market = source({ items: [entry('multi')], installed: [installed('multi')], updates: { multi: { update: '2.0.0' } } })
    const items = mergePluginItems([first, second], [market])
    expect(items.map(item => item.key)).toEqual(['entry:a', 'entry:b'])
    expect(items.map(item => item.plugin)).toEqual([first, second])
    expect(items.every(item => item.source === market && item.updateInfo?.update === '2.0.0')).toBe(true)
    expect(filterPluginItems(items, { ...filters, installation: 'uninstalled' })).toEqual([])
  })

  it('keeps an installed package without an entry and appends only uninstalled catalog packages', () => {
    const pkg = installed('broken', { error: 'missing entry point' })
    const market = source({ installed: [pkg], items: [entry('broken'), entry('new-plugin')] })
    const items = mergePluginItems([], [market])
    expect(items.map(item => [itemName(item), isInstalled(item)])).toEqual([['broken', true], ['new-plugin', false]])
    expect(filterPluginItems(items, { ...filters, status: 'attention' }).map(itemName)).toEqual(['broken'])
    expect(filterPluginItems(items, { ...filters, status: 'disabled' }).map(itemName)).toEqual(['broken'])
    expect(filterPluginItems(items, { ...filters, status: 'enabled' })).toEqual([])
  })

  it('deduplicates overlapping catalogs and uses the first provider for each package', () => {
    const first = source({ items: [entry('shared')], installed: [installed('shared')] }, 'first')
    const second = source({ items: [entry('shared', { version: '3.0.0' }), entry('extra')], installed: [installed('shared')] }, 'second')
    const items = mergePluginItems([], [first, second])
    expect(items).toHaveLength(2)
    expect(items.find(item => itemName(item) === 'shared')).toMatchObject({ catalog: { version: '2.0.0' }, source: first })
    expect(items.find(item => itemName(item) === 'extra')?.source).toBe(second)
  })

  it('removes stale catalog metadata and actions when its provider disappears, retaining local entries', () => {
    const local = plugin('local')
    const market = source({ items: [entry('local'), entry('remote')], installed: [installed('local')], updates: { local: { update: '2.0.0' } } })
    const before = mergePluginItems([local], [market])
    const after = mergePluginItems([local], [])
    expect(before).toHaveLength(2)
    expect(after).toHaveLength(1)
    expect(after[0].plugin).toBe(local)
    expect(after[0].catalog).toBeUndefined()
    expect(after[0].packageStatus).toBeUndefined()
    expect(after[0].source).toBeUndefined()
    expect(after[0].updateInfo).toBeUndefined()
    expect(before.find(item => itemName(item) === 'local')?.source).toBe(market)
  })

  it('combines installation, origin, category, status and update filters without showing unavailable updates', () => {
    const items = mergePluginItems([
      plugin('builtin:commands', { builtin: true, manifest: { category: 'service' } }),
      plugin('reply', { manifest: { category: 'chat' } }),
      plugin('paused', { disabled: true, state: 'disposed', manifest: { category: 'chat' } }),
    ], [source({
      installed: [installed('@luckylillia/commands', { builtin: 'builtin:commands' }), installed('reply'), installed('paused')],
      items: [entry('fresh', { category: 'tool' }), entry('unknown', { category: 'custom' })],
      updates: { '@luckylillia/commands': { update: '2.0.0' }, reply: { update: '2.0.0' }, paused: { latest: '2.0.0', blocked: 'SDK mismatch' } },
    })])
    const select = (patch: Partial<PluginFilters>) => filterPluginItems(items, { ...filters, ...patch }).map(itemName)
    expect(select({ installation: 'installed', origin: 'builtin', updatesOnly: true })).toEqual(['@luckylillia/commands'])
    expect(select({ installation: 'installed', origin: 'third-party', category: 'chat', status: 'enabled', updatesOnly: true })).toEqual(['reply'])
    expect(select({ installation: 'installed', status: 'disabled' })).toEqual(['paused'])
    expect(select({ installation: 'uninstalled', origin: 'third-party', category: 'tool' })).toEqual(['fresh'])
    expect(select({ installation: 'uninstalled', updatesOnly: true })).toEqual([])
    expect(itemCategory(items.find(item => itemName(item) === 'unknown')!)).toBe('other')
  })

  it('searches local and catalog names, titles, descriptions and authors without case or surrounding whitespace', () => {
    const items = mergePluginItems([plugin('local-reply', {
      title: 'Local Responder', description: 'Replies to greetings', author: { name: 'Alice' },
    })], [source({ items: [entry('remote-tools', { title: 'Remote Toolbox', description: 'Compresses images', author: { name: 'Bob' } })] })])
    for (const query of ['LOCAL-REPLY', ' responder ', 'GREETINGS', 'alice']) {
      expect(filterPluginItems(items, { ...filters, search: query }).map(itemName)).toEqual(['local-reply'])
    }
    for (const query of ['REMOTE-TOOLS', ' toolbox ', 'IMAGES', 'bob']) {
      expect(filterPluginItems(items, { ...filters, search: query }).map(itemName)).toEqual(['remote-tools'])
    }
    expect(filterPluginItems(items, { ...filters, search: 'absent' })).toEqual([])
  })
})
