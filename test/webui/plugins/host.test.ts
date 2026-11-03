import { describe, expect, it, vi } from 'vitest'
import type { WebUIContext } from '@luckylillia/plugin-sdk/webui'
import { startBuiltinClients, useClientErrors } from '@/plugin/internal/service/webui/FE/plugin-host/host'
import { useRegistry } from '@/plugin/internal/service/webui/FE/plugin-host/registry'

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

describe('plugin client host', () => {
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
