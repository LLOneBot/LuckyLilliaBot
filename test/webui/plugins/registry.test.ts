import { describe, expect, it } from 'vitest'
import {
  activeOwners, configEditorOf, Contribution, fieldRendererOf, slotContents, useRegistry, visiblePages,
} from '@/webui/FE/plugin-host/registry'
import { PluginStatus } from '@/webui/FE/types/plugins'

const Component = () => null
const page = (owner: string, key: string, title: string, order = 100, settings = false): Contribution =>
  ({ kind: 'page', owner, key, title, order, settings, component: Component })

function status(name: string, state: PluginStatus['state']): PluginStatus {
  return {
    id: name, name, manifest: {}, disabled: state === 'disposed', state, missingDeps: [], reloadCount: 0,
    service: { required: [], optional: [], implements: [] },
  }
}

describe('plugin UI registry', () => {
  it('shows pages and slot contents of running plugins only, in order', () => {
    const contributions: Contribution[] = [
      page('b', 'b:stats', 'Stats'),
      page('a', 'a:home', 'Home'),
      page('builtin:webqq', 'webqq', 'WebQQ', 0),
      page('stopped', 'stopped:x', 'X'),
      page('builtin:satori', 'satori', 'Satori', 11, true),
      { kind: 'slot', owner: 'b', slot: 'dashboard', order: 100, component: Component },
      { kind: 'slot', owner: 'a', slot: 'dashboard', order: 50, component: Component },
      { kind: 'slot', owner: 'stopped', slot: 'dashboard', order: 0, component: Component },
    ]
    const active = activeOwners([
      status('a', 'active'), status('b', 'active'), status('builtin:webqq', 'active'), status('stopped', 'pending'),
    ])
    // A settings page stays reachable while its plugin is stopped
    expect(visiblePages(contributions, active).map(p => p.key)).toEqual(['webqq', 'satori', 'a:home', 'b:stats'])
    expect(slotContents(contributions, active, 'dashboard').map(s => s.owner)).toEqual(['a', 'b'])
    expect(slotContents(contributions, active, 'elsewhere')).toEqual([])
  })

  it('takes the latest config editor of a plugin and the latest renderer of a role', () => {
    const first = () => null
    const second = () => null
    const contributions: Contribution[] = [
      { kind: 'config', owner: 'a', component: first },
      { kind: 'config', owner: 'a', component: second },
      { kind: 'field', owner: 'a', role: 'color', component: first },
      { kind: 'field', owner: 'b', role: 'color', component: second },
    ]
    expect(configEditorOf(contributions, 'a')?.component).toBe(second)
    expect(configEditorOf(contributions, 'b')).toBeUndefined()
    expect(fieldRendererOf(contributions, 'color')?.owner).toBe('b')
    expect(fieldRendererOf(contributions, 'qq-group')).toBeUndefined()
  })

  it('removes exactly the contribution a disposer was returned for', () => {
    const { add } = useRegistry.getState()
    const contribution = page('a', 'a:home', 'Home')
    const other = page('a', 'a:home', 'Home')
    const dispose = add(contribution)
    add(other)
    dispose()
    expect(useRegistry.getState().contributions).toEqual([other])
  })
})
