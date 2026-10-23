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
      page('builtin:milky', 'milky', 'Milky', 12, true),
      { kind: 'slot', owner: 'b', slot: 'dashboard', order: 100, component: Component },
      { kind: 'slot', owner: 'a', slot: 'dashboard', order: 50, component: Component },
      { kind: 'slot', owner: 'stopped', slot: 'dashboard', order: 0, component: Component },
    ]
    const plugins = [
      status('a', 'active'), status('b', 'active'), status('builtin:webqq', 'active'), status('stopped', 'pending'),
      status('builtin:satori', 'failed'), status('builtin:milky', 'disposed'),
    ]
    const active = activeOwners(plugins)
    // A failing plugin keeps its settings page in the sidebar; a disabled one only keeps it openable
    expect(visiblePages(contributions, plugins).map(p => p.key)).toEqual(['webqq', 'satori', 'a:home', 'b:stats'])
    expect(visiblePages(contributions, plugins, 'open').map(p => p.key)).toEqual(['webqq', 'satori', 'milky', 'a:home', 'b:stats'])
    // Before the list loads, settings pages count as enabled
    expect(visiblePages(contributions, null).map(p => p.key)).toEqual(['satori', 'milky'])
    expect(slotContents(contributions, active, 'dashboard').map(s => s.owner)).toEqual(['a', 'b'])
    expect(slotContents(contributions, active, 'elsewhere')).toEqual([])
  })

  it('keeps the settings page of a switched-off bound builtin in the sidebar: its switch is on that page', () => {
    const contributions: Contribution[] = [
      page('builtin:satori', 'satori', 'Satori', 11, true),
      page('third-party', 'third-party:settings', 'Third', 100, true),
    ]
    const plugins = [
      { ...status('builtin:satori', 'disposed'), bound: true },
      status('third-party', 'disposed'),
    ]
    expect(visiblePages(contributions, plugins).map(p => p.key)).toEqual(['satori'])
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
