import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WebUIContext } from '@luckylillia/plugin-sdk/webui'
import { ensureClient, hasExternalClient, startBuiltinClients, syncClients, useClientErrors } from '@/plugin/internal/service/webui/FE/plugin-host/host'
import { useRegistry } from '@/plugin/internal/service/webui/FE/plugin-host/registry'
import { createWebUIContext } from '@/plugin/internal/service/webui/FE/plugin-host/context'
import type { PluginStatus } from '@/plugin/internal/service/webui/FE/types/plugins'

vi.mock('@/plugin/internal/service/webui/FE/components/common', () => ({ showToast: () => {} }))
vi.mock('@/plugin/internal/service/webui/FE/plugin-host/builtins', () => {
  const Component = () => null
  return {
    BUILTIN_CLIENTS: {
      'builtin:broken': (ctx: WebUIContext) => {
        ctx.page({ id: 'broken', title: 'Broken', component: Component })
        ctx.declareSlot('broken.items', { title: 'Items', cardinality: 'list' })
        ctx.slot('plugins.toolbar', { id: 'line', component: Component })
        throw new Error('boom')
      },
      'builtin:fine': (ctx: WebUIContext) => {
        ctx.page({ id: 'fine', title: 'Fine', component: Component })
      },
    },
  }
})

const owned = (owner: string) => useRegistry.getState().contributions.filter(c => c.owner === owner)
const webui = `data:text/javascript,${encodeURIComponent(`
  export default ctx => {
    ctx.page({ id: 'home', title: 'Plugin page', component: () => null })
    ctx.config(() => null)
  }
`)}`
const externalPlugin = (name: string, disabled = false): PluginStatus => ({
  id: name, name, webui, disabled, state: disabled ? 'disposed' : 'active',
  manifest: {}, missingDeps: [], reloadCount: 0,
  service: { required: [], optional: [], implements: [] },
})

afterEach(() => syncClients([]))

describe('plugin client host', () => {
  it('automatically loads an enabled package and removes its contributions when it disappears', async () => {
    const plugin = externalPlugin('automatic')
    syncClients([plugin])
    await expect.poll(() => owned(plugin.name).map(c => c.kind)).toEqual(['page', 'config'])
    syncClients([])
    expect(owned(plugin.name)).toEqual([])
  })

  it('loads a disabled package on demand for its configuration editor', async () => {
    const plugin = externalPlugin('configure-disabled', true)
    syncClients([plugin])
    expect(owned(plugin.name)).toEqual([])
    expect(hasExternalClient(plugin)).toBe(true)
    await ensureClient(plugin.name, plugin.webui!)
    expect(owned(plugin.name).map(c => c.kind)).toEqual(['page', 'config'])
  })

  it('keeps the slot opt-in to layout configuration and removes it with the registration', () => {
    const disposers: (() => void)[] = []
    const ctx = createWebUIContext('layout-owner', false, dispose => disposers.push(dispose))
    ctx.declareSlot('layout-owner.cards', { title: 'Cards', cardinality: 'list', configurable: true })
    expect(owned('layout-owner')).toContainEqual(expect.objectContaining({
      kind: 'declaration', owner: 'layout-owner', name: 'layout-owner.cards', cardinality: 'list', configurable: true,
    }))
    for (const dispose of disposers.reverse()) dispose()
    expect(owned('layout-owner')).toEqual([])
  })

  it('takes back what a module registered before it threw, and says why', () => {
    startBuiltinClients()
    expect(owned('builtin:broken')).toEqual([])
    expect(useClientErrors.getState().errors).toEqual({ 'builtin:broken': 'boom' })
    // A slot name it declared is free again
    expect(() => useRegistry.getState().add({ kind: 'declaration', owner: 'other', name: 'broken.items', title: 'Items', cardinality: 'list' })())
      .not.toThrow()
    expect(owned('builtin:fine').map(c => c.kind)).toEqual(['page'])
  })
})
